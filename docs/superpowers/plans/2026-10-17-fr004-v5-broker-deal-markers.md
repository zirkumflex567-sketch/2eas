# FR-004 native v5 broker-deal markers

## Goal

Show broker-verified historical deal fills in the native v5 chart preview, with the same account/symbol/timeframe isolation and exact-candle rule as the existing Beta markers. Keep historical fills separate from open positions, strategy signals and order drafts.

## Scope and acceptance

- Input comes only from the already authenticated, read-only `MT5_VERIFIED` deal-history response after the Beta validates each row.
- Require matching account/symbol/timeframe scope, `canExecute=false`, executed broker ticket, side, entry type, exact UTC epoch and positive fill price. Reject the whole invalid snapshot atomically.
- Plot fills only when their exact `chartTimeSeconds` exists in the loaded v5 candles; report valid out-of-window fills as unplotted. Never snap a deal to a nearby candle.
- Render distinct buy/sell markers in native v5 price space, separate from open-position Entry/SL/TP overlays. Clear them on account/symbol/timeframe changes and when the verified candle snapshot is explicitly cleared as stale/unavailable. Reject an invalid deal snapshot atomically and retain the last accepted snapshot until a fresh valid snapshot or explicit clear.
- No extra API request, persistence, order route, MT5 write, or change to the v4 chart. The preview remains opt-in.

## Test-first steps

1. Extend the browser contract to prove valid broker markers appear only on exact loaded candles and preserve the existing position snapshot independently.
2. Prove account/symbol/timeframe mismatch, invalid tickets/prices/times, unverified/executable data and malformed marker collections fail atomically without changing the last accepted snapshot; verify clear/scope-change behavior and zero network or mutation requests.
3. Implement the smallest read-only bridge and v5 renderer support; run focused Chromium, existing v5 renderer/preview, broker-panel, and four-demo read-only regressions.
4. Update `OPEN_TASKS.md` with the verified code-level scope and leave hardware, full history coverage and production-v5 migration open.

## Boundaries

Do not enable the production v5 cutover. Do not claim that arbitrary prior history exists outside returned MT5 deals or loaded candles. Do not instrument, reinitialize, or trade any EA; Blueberry is excluded. Strategy Tester/backtests remain deferred.
