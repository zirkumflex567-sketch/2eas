# Live changed-stop preview acceptance

## Scope

Exercise the existing ticket- and revision-bound stop-preview API with real, fresh quotes and broker metadata from the five explicitly authorized non-Blueberry demo accounts. Submit a valid hypothetical changed SL and a deliberately wrong-side SL for each eligible open position. This is calculation-only acceptance: never call a stop-commit route, order route, or any MT5 mutation API. Do not query Blueberry. Strategy Tester and backtests are excluded.

## Acceptance

- [x] Restrict requests to `titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`, and `goldm15`.
- [x] Derive the active broker symbol from `MT5_VERIFIED` M15 candles; verify the matching quote and symbol metadata.
- [x] Require fresh bid/ask, position ticket/revision, and an existing SL before evaluating a changed stop.
- [x] Align a hypothetical candidate to broker tick size and place it beyond the broker's stop/freeze distance.
- [x] Require a valid changed-price response with matching account/symbol/ticket/revision, currency-matched PnL, `canCommit=false`, `canExecute=false`, and guard `UNKNOWN/NONE`.
- [x] Require a wrong-side candidate to return `INVALID` with `SL_WRONG_SIDE`, still non-committable and non-executable.
- [x] Count only API calls and assert no order or position mutation path is called.

## Result (16 October 2026)

`node --check scripts/smoke_live_changed_stop_preview.cjs` and `node scripts/smoke_live_changed_stop_preview.cjs` passed. The two empty demo books were reported without synthetic positions. The two `XAUUSD.p` books supplied four existing BUY positions: all four changed candidates returned `VALID`, all four wrong-side candidates returned `INVALID/SL_WRONG_SIDE`; responses were tied to exact ticket/revision and remained preview-only. A post-preview broker read confirmed every tested ticket, revision, SL, and TP was unchanged. One earlier attempt hit `QUOTE_NOT_FRESH` and stopped safely; the smoke now retries only that fail-closed quote condition twice with a new preview id, and the full acceptance then passed. The script recorded zero position mutations, zero orders, no commit route, and no Blueberry request. This is live API evidence for changed-price geometry and broker PnL, not UI drag, mobile/hardware behavior, or write authorization. No position was changed.

## Follow-up Demo evidence (16 Oct 2026)

The live changed-stop preview acceptance passed again on main commit `562f2a3` for the four authorized demo aliases only. The smoke uses bounded `Retry-After` backoff for preview rate limits and retains only the existing narrow retry for stale quotes. Titan and PU Prime 500 had empty books; six existing BUY positions across the two PU Prime M5 demos were checked. All six hypothetical tick-aligned SL changes were valid and all six wrong-side controls were rejected. Broker readback confirmed unchanged revision, SL and TP. The run made zero position mutations and orders, did not call the commit route, and made no Blueberry request.

## Five-demo follow-up (20 October 2026)

`node scripts/smoke_live_changed_stop_preview.cjs` passed on all five explicitly authorized demos after `ec96ab8`: ten existing positions had a valid, tick-aligned changed-SL preview and a wrong-side rejection (`10 VALID`, `10 SL_WRONG_SIDE`). Fresh quotes and exact ticket/revision binding were required; broker readback confirmed unchanged revision, SL and TP. `goldm15` had no open positions. Zero broker writes, position mutations, orders, commit requests or Blueberry queries.
