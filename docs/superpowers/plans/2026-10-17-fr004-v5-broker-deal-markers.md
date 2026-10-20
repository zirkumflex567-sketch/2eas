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
3. Implement the smallest read-only bridge and v5 renderer support; run focused Chromium, existing v5 renderer/preview, broker-panel, and four-demo read-only regressions. `scripts/smoke_live_v5_deal_markers.cjs` exercises the real Broker Panel deal-history GET through Beta validation into v5, while blocking non-GET and non-allowlisted account API requests.
4. Update `OPEN_TASKS.md` with the verified code-level scope and leave hardware, full history coverage and production-v5 migration open.

## Boundaries

Do not enable the production v5 cutover. Do not claim that arbitrary prior history exists outside returned MT5 deals or loaded candles. Do not instrument, reinitialize, or trade any EA; Blueberry is excluded. Strategy Tester/backtests remain deferred.

## Live acceptance 20.10.2026

- [x] On Main `62123c5`, `scripts/smoke_live_v5_deal_markers.cjs` passed on all five authorized aliases: the four accounts with history validated 121/121 deals into the isolated v5 preview, 64 matched exact loaded candle timestamps and 57 remained unplotted because they were outside the loaded window. `goldm15` returned 0 history deals and 0 markers. Across five aliases: 110 API requests, zero mutations, forbidden requests, browser errors or Blueberry requests. Production v5 remained disabled.
