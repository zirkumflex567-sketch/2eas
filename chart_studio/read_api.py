"""Dependency-injected Chart Studio read routes, sharing the account gateway."""
import time
import numbers
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Annotated
from fastapi import HTTPException, Query, Request
from fastapi.responses import JSONResponse
from chart_studio.broker_reads import (
    SYMBOL_PATTERN, BrokerReadError, broker_rows, symbol_summary, symbol_model, require_symbol,
    verified_read, positions_read, trades_read, provenance,
    portfolio_read, decimal as broker_decimal,
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

    @app.get('/api/chart/v1/footprint')
    def footprint(request: Request, account: Account, symbol: Symbol,
                  timeframe: Annotated[str, Query(pattern=r'^(M1|M5|M15)$')]):
        # Do not expose funded-account market data through this experimental feed.
        if account == 'blueberry':
            raise HTTPException(403, 'Footprint-Demodaten sind für diesen Account gesperrt.')
        if set(request.query_params) != {'account','symbol','timeframe'} or any(
                len(request.query_params.getlist(key)) != 1 for key in request.query_params):
            raise HTTPException(422, 'Footprint akzeptiert nur Account, Symbol und M1/M5/M15.')

        durations = {'M1':60, 'M5':300, 'M15':900}
        timeframe_value = getattr(mt5, 'TIMEFRAME_'+timeframe, {'M1':1,'M5':5,'M15':15}[timeframe])
        buy_flag = getattr(mt5, 'TICK_FLAG_BUY', None)
        sell_flag = getattr(mt5, 'TICK_FLAG_SELL', None)
        all_ticks_flag = getattr(mt5, 'COPY_TICKS_ALL', None)

        def unavailable(spec, reason, *, bar_open=None, tick_count=0, ignored=0):
            return {**provenance(spec), 'symbol':symbol, 'status':'UNAVAILABLE', 'reason':reason,
                    'timeframe':timeframe, 'barOpenUtc':bar_open, 'executionCount':0,
                    'ignoredTickCount':ignored, 'tickCount':tick_count, 'levels':[]}

        def field(row, name):
            try:
                return row[name]
            except (KeyError, IndexError, TypeError, ValueError):
                return getattr(row, name)

        def operation(spec):
            require_symbol(mt5, symbol)
            if (not callable(getattr(mt5, 'copy_rates_from_pos', None)) or
                    not callable(getattr(mt5, 'copy_ticks_range', None)) or
                    type(all_ticks_flag) is not int or type(buy_flag) is not int or
                    type(sell_flag) is not int or buy_flag <= 0 or sell_flag <= 0 or
                    buy_flag == sell_flag):
                return unavailable(spec, 'TICK_SOURCE_UNAVAILABLE')
            raw_bars = mt5.copy_rates_from_pos(symbol, timeframe_value, 1, 1)
            if raw_bars is None or len(raw_bars) != 1:
                return unavailable(spec, 'CANDLE_HISTORY_UNAVAILABLE')
            try:
                raw_open = field(raw_bars[0], 'time')
                if isinstance(raw_open, bool) or not isinstance(raw_open, numbers.Integral) or raw_open <= 0:
                    raise ValueError('invalid candle time')
                open_epoch = int(raw_open)
                start = datetime.fromtimestamp(open_epoch, timezone.utc)
                stop = start + timedelta(seconds=durations[timeframe])
                bar_open = start.isoformat(timespec='seconds').replace('+00:00','Z')
            except (TypeError, ValueError, OverflowError, OSError, IndexError):
                return unavailable(spec, 'CANDLE_HISTORY_INVALID')
            if stop.timestamp() > clock() + 1:
                return unavailable(spec, 'CANDLE_TIME_FUTURE', bar_open=bar_open)
            ticks = mt5.copy_ticks_range(symbol, start, stop, all_ticks_flag)
            if ticks is None:
                return unavailable(spec, 'TICK_HISTORY_UNAVAILABLE', bar_open=bar_open)
            try:
                tick_count = len(ticks)
                if tick_count > 100000:
                    return unavailable(spec, 'TICK_COUNT_LIMIT', bar_open=bar_open, tick_count=tick_count)
            except (TypeError, ValueError):
                return unavailable(spec, 'TICK_HISTORY_INVALID', bar_open=bar_open)

            levels = {}
            execution_count = 0
            ignored = 0
            invalid_execution = False
            for tick in ticks:
                is_buy = is_sell = None
                try:
                    flags = field(tick, 'flags')
                    if isinstance(flags, bool) or not isinstance(flags, numbers.Integral):
                        raise ValueError('flags')
                    is_buy = bool(int(flags) & buy_flag)
                    is_sell = bool(int(flags) & sell_flag)
                    if not is_buy and not is_sell:
                        ignored += 1
                        continue
                    if is_buy and is_sell:
                        invalid_execution = True
                        ignored += 1
                        continue
                    tick_time = field(tick, 'time_msc')
                    if (isinstance(tick_time, bool) or not isinstance(tick_time, numbers.Integral) or
                            not int(start.timestamp()*1000) <= int(tick_time) < int(stop.timestamp()*1000)):
                        raise ValueError('tick outside requested bar')
                    last = broker_decimal(float(field(tick, 'last')), positive=True)
                    volume = broker_decimal(float(field(tick, 'volume_real')), positive=True)
                    price_key = last
                    item = levels.setdefault(price_key, {'buy':Decimal(0), 'sell':Decimal(0), 'trades':0})
                    side = 'buy' if is_buy else 'sell'
                    item[side] += Decimal(volume)
                    item['trades'] += 1
                    execution_count += 1
                except (BrokerReadError, TypeError, ValueError, OverflowError, InvalidOperation, KeyError, AttributeError):
                    if is_buy is not None and is_sell is not None and is_buy != is_sell:
                        invalid_execution = True
                    ignored += 1
            if invalid_execution:
                return unavailable(spec, 'INVALID_EXECUTION_TICK', bar_open=bar_open,
                                   tick_count=tick_count, ignored=ignored)
            if execution_count == 0:
                return unavailable(spec, 'NO_VERIFIED_EXECUTIONS', bar_open=bar_open,
                                   tick_count=tick_count, ignored=ignored)
            output=[]
            for price in sorted(levels, key=Decimal):
                value=levels[price]
                buy=value['buy']; sell=value['sell']
                output.append({'price':price,
                    'buyVolume':broker_decimal(buy), 'sellVolume':broker_decimal(sell),
                    'delta':broker_decimal(buy-sell, signed=True), 'trades':value['trades']})
            return {**provenance(spec), 'symbol':symbol, 'status':'AVAILABLE', 'reason':None,
                    'timeframe':timeframe, 'barOpenUtc':bar_open,
                    'barCloseUtc':stop.isoformat(timespec='seconds').replace('+00:00','Z'),
                    'executionCount':execution_count, 'ignoredTickCount':ignored,
                    'tickCount':tick_count, 'levels':output}
        return response(verified_read(mt5, account, operation))

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
