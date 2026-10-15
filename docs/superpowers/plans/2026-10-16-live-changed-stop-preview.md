# Live changed-stop preview acceptance

## Scope

Exercise the existing ticket- and revision-bound stop-preview API with real, fresh quotes and broker metadata from the four explicitly authorized demo accounts. Submit a valid hypothetical changed SL and a deliberately wrong-side SL for each eligible open position. This is calculation-only acceptance: never call a stop-commit route, order route, or any MT5 mutation API. Do not query Blueberry. Strategy Tester and backtests are excluded.

## Acceptance

- [x] Restrict requests to `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`.
- [x] Derive the active broker symbol from `MT5_VERIFIED` M15 candles; verify the matching quote and symbol metadata.
- [x] Require fresh bid/ask, position ticket/revision, and an existing SL before evaluating a changed stop.
- [x] Align a hypothetical candidate to broker tick size and place it beyond the broker's stop/freeze distance.
- [x] Require a valid changed-price response with matching account/symbol/ticket/revision, currency-matched PnL, `canCommit=false`, `canExecute=false`, and guard `UNKNOWN/NONE`.
- [x] Require a wrong-side candidate to return `INVALID` with `SL_WRONG_SIDE`, still non-committable and non-executable.
- [x] Count only API calls and assert no order or position mutation path is called.

## Result (16 October 2026)

`node --check scripts/smoke_live_changed_stop_preview.cjs` and `node scripts/smoke_live_changed_stop_preview.cjs` passed. The two empty demo books were reported without synthetic positions. The two `XAUUSD.p` books supplied four existing BUY positions: all four changed candidates returned `VALID`, all four wrong-side candidates returned `INVALID/SL_WRONG_SIDE`; responses were tied to exact ticket/revision and remained preview-only. A post-preview broker read confirmed every tested ticket, revision, SL, and TP was unchanged. One earlier attempt hit `QUOTE_NOT_FRESH` and stopped safely; the smoke now retries only that fail-closed quote condition twice with a new preview id, and the full acceptance then passed. The script recorded zero position mutations, zero orders, no commit route, and no Blueberry request. This is live API evidence for changed-price geometry and broker PnL, not UI drag, mobile/hardware behavior, or write authorization. No position was changed.
