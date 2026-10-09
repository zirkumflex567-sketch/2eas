"""Dependency-injected Chart Studio read routes, sharing the account gateway."""
import time
from typing import Annotated
from fastapi import Query
from fastapi.responses import JSONResponse
from chart_studio.broker_reads import (
    SYMBOL_PATTERN, broker_rows, symbol_summary, symbol_model, require_symbol,
    verified_read, positions_read, trades_read, provenance,
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
            models = [symbol_summary(row, spec) for row in rows]
            matches = [s for s in models if q.casefold() in s['symbol'].casefold()]
            return {**provenance(spec), 'symbols':matches[:limit], 'limit':limit,
                    'truncated':len(matches) > limit}
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
