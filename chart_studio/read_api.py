"""Dependency-injected Chart Studio read routes, sharing the account gateway."""
import time
import numbers
from datetime import datetime, timezone
from typing import Annotated
from fastapi import HTTPException, Query
from fastapi.responses import JSONResponse
from chart_studio.broker_reads import (
    SYMBOL_PATTERN, BrokerReadError, broker_rows, symbol_summary, symbol_model, require_symbol,
    verified_read, positions_read, trades_read, provenance,
    portfolio_read,
)
from chart_studio.history_cursor import utc_range

Account = Annotated[str, Query(min_length=1, max_length=32, pattern=r'^[a-z0-9_-]+$')]
Symbol = Annotated[str, Query(min_length=1, max_length=64, pattern=SYMBOL_PATTERN)]
Search = Annotated[str, Query(max_length=64, pattern=r'^[A-Za-z0-9_.# /+:-]*$')]
Ticket = Annotated[str | None, Query(pattern=r'^[1-9][0-9]{0,19}$')]
Magic = Annotated[str | None, Query(pattern=r'^(0|[1-9][0-9]{0,19})$')]


def install_read_routes(app, mt5, *, now=None):
    clock = now or time.time

    def response(data):
        return JSONResponse(data, headers={'Cache-Control':'no-store'})

    @app.get('/api/chart/v1/symbols')
    def symbols(account: Account, q: Search = '',
                limit: Annotated[int, Query(ge=1, le=200)] = 50):
        def operation(spec):
            rows = broker_rows(mt5.symbols_get())
            matches = []
            invalid_count = 0
            for row in rows:
                name = getattr(row, 'name', None)
                if not isinstance(name, str):
                    invalid_count += 1
                    continue
                if q and q.casefold() not in name.casefold():
                    continue
                try:
                    matches.append(symbol_summary(row, spec))
                except BrokerReadError:
                    invalid_count += 1
            return {**provenance(spec), 'symbols':matches[:limit], 'limit':limit,
                    'truncated':len(matches) > limit, 'invalidCount':invalid_count}
        return response(verified_read(mt5, account, operation))

    @app.get('/api/chart/v1/symbol-info')
    def symbol_info(account: Account, symbol: Symbol):
        return response(verified_read(mt5, account,
                        lambda spec: symbol_model(require_symbol(mt5, symbol), spec)))

    @app.get('/api/chart/v1/positions')
    def positions(account: Account, symbol: Symbol, ticket: Ticket = None,
                  magic: Magic = None, manual: bool | None = None):
        return response(verified_read(mt5, account, lambda spec: positions_read(
            mt5, spec, symbol, ticket=ticket, magic=magic, manual=manual, now=clock())))

    @app.get('/api/chart/v1/portfolio')
    def portfolio(account: Account, scenarioSymbol: Symbol = 'XAUUSD'):
        return response(verified_read(mt5, account,
                        lambda spec: portfolio_read(mt5, spec, scenarioSymbol)))

    @app.get('/api/chart/v1/trades')
    def trades(account: Account, symbol: Symbol,
               fromUtc: Annotated[str, Query(max_length=64)],
               toUtc: Annotated[str, Query(max_length=64)],
               limit: Annotated[int, Query(ge=1, le=500)] = 100,
               ticket: Ticket = None, magic: Magic = None, manual: bool | None = None,
               cursor: str | None = None):
        start, stop = utc_range(fromUtc, toUtc)
        return response(verified_read(mt5, account, lambda spec: trades_read(
            mt5, spec, symbol, start, stop, limit=limit, ticket=ticket, magic=magic,
            manual=manual, cursor=cursor, now=clock())))

    @app.get('/api/chart/v1/regimes')
    def regimes(account: Account, symbol: Symbol,
                timeframe: Annotated[str, Query(pattern=r'^(M1|M5|M15|M30|H1|H4|D1)$')],
                at: Annotated[str | None, Query(max_length=64)] = None):
        # The funded account never participates in regime inspection, even if a
        # caller bypasses the UI and reaches this endpoint directly.
        if account == 'blueberry':
            raise HTTPException(403, 'Regime-Lesedaten für diesen Account nicht verfügbar.')
        from chart_studio.regimes import FRAME_SECONDS, MAX_BARS, classify_regime
        from chart_studio.broker_reads import quote_model

        def operation(spec):
            require_symbol(mt5, symbol)
            if at is None:
                quote = quote_model(mt5.symbol_info_tick(symbol), spec, now=clock())
                if quote['freshness'] != 'FRESH':
                    raise HTTPException(503, 'Regime-Lesedaten nicht frisch verfügbar.')
                as_of = datetime.fromtimestamp(quote['quoteTimeUtc'], timezone.utc).isoformat()
            else:
                try:
                    parsed = datetime.fromisoformat(at.replace('Z', '+00:00'))
                    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
                        raise ValueError('UTC required')
                    cutoff = parsed.timestamp()
                    if cutoff > clock() + 1:
                        raise ValueError('future cutoff')
                    as_of = parsed.astimezone(timezone.utc).isoformat()
                except (TypeError, ValueError, OverflowError) as exc:
                    raise HTTPException(422, 'Ungültiger UTC-Zeitpunkt.') from exc
            timeframe_value = getattr(mt5, 'TIMEFRAME_'+timeframe, {
                'M1':1, 'M5':5, 'M15':15, 'M30':30, 'H1':16385,
                'H4':16388, 'D1':16408}[timeframe])
            reader = getattr(mt5, 'copy_rates_from_pos', None)
            if not callable(reader):
                raise HTTPException(503, 'Regime-Historie nicht verfügbar.')
            raw = reader(symbol, timeframe_value, 1, MAX_BARS)
            if raw is None:
                rows = []
            else:
                try:
                    rows = list(raw)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(503, 'Regime-Historie ungültig oder nicht verfügbar.') from exc
            if len(rows) > MAX_BARS:
                raise HTTPException(503, 'Regime-Historie ungültig oder nicht verfügbar.')
            converted = []
            for row in rows:
                try:
                    raw_time = row['time'] if not hasattr(row, 'time') else row.time
                    if isinstance(raw_time, bool) or not isinstance(raw_time, numbers.Integral):
                        raise ValueError('invalid broker timestamp')
                    # MT5 Python copy_rates_* returns candle opens in UTC. Unlike
                    # symbol_info_tick/history timestamps, these bars must not
                    # receive the account's broker-server offset.
                    converted.append({'time':int(raw_time),
                                      'open':row['open'] if not hasattr(row, 'open') else row.open,
                                      'high':row['high'] if not hasattr(row, 'high') else row.high,
                                      'low':row['low'] if not hasattr(row, 'low') else row.low,
                                      'close':row['close'] if not hasattr(row, 'close') else row.close})
                except Exception as exc:
                    raise HTTPException(503, 'Regime-Historie ungültig oder nicht verfügbar.') from exc
            # MT5 returns newest-first for start_pos=1. The classifier requires
            # strict chronological input and owns closed-bar/as-of filtering.
            converted.sort(key=lambda item: item['time'])
            snapshot = classify_regime(converted, symbol=symbol, timeframe=timeframe,
                                       as_of_utc=as_of)
            return {**provenance(spec), **snapshot, 'canExecute':False,
                    'lookbackLimit':MAX_BARS, 'barDurationSeconds':FRAME_SECONDS[timeframe]}
        return response(verified_read(mt5, account, operation))
