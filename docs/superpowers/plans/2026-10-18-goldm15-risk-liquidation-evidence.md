# GoldM15 risk-liquidation evidence candidate

## Scope

Extend only the isolated GoldM15 evidence candidate so its existing account-risk liquidation path records Gold-symbol close attempts and pending-order cancellation attempts with explicit guard reasons. Position-close tickets correlate through the existing exact-order deal path; cancellation tickets are recorded as requests and are never registered as fills. Preserve the existing risk predicate, retry interval, selected-position scope, `CTrade.PositionClose`/`OrderDelete` calls, and retry logging. Do not attach or install the candidate, mutate a demo account, enable dashboard writes, or run Strategy Tester/backtests.

## Contract and verification

- Add failing tests proving the generated GoldM15 Risk include records risk-trigger close and cancel reasons, symbol-bound intent, request/result and exact ticket semantics while keeping each non-capture branch's original call/retry behavior.
- Keep foreign-symbol liquidations unclaimed by the XAU chart recorder; cancellation tickets are requests, never fills, and must not enter deal correlation.
- Generate and compile the isolated candidate using the pinned source/includes/preset; verify zero compiler errors and that the manifest remains `NOT_INSTALLED`.
- Run GoldM15/Titan builder, recorder, model, spool, store, and lifecycle regressions. Review every changed close/cancel path for unchanged trade behavior.
- Record actual code/test evidence and leave live identity, event readback, write-release, hardware, and backtest gates open.

## Result (18 October 2026)

- The generated `GoldM15_Risk.mqh` candidate tags hard lock, daily drawdown, rollover, unknown baseline, persistence failure, holiday/guard liquidation, and news-entry-veto pending-order cancellation. It emits XAU-only close/cancel attempts into the existing bounded spool. Cancellation requests carry the pending-order ticket and result but are never entered in fill correlation. The unchanged non-capture branch keeps the original close/retry/delete statements.
- RED/GREEN contracts added; the combined Titan, GoldM15, recorder, model, spool, store, and lifecycle set passes **245 tests** (four existing FastAPI lifecycle deprecation warnings).
- Fresh isolated MetaEditor build: **0 errors, 0 warnings**; EX5 SHA-256 `d2ed27f0adfbce10f7b4b94ae3a2bb252535a606e64e4c1176666e29f845fc17`; manifest `NOT_INSTALLED`. Generated risk-helper hash `2ae6c874f6b77503c5f9a3847054e53f69fe7c7dbe44c7603f010210841a9288` is recorded in that ignored manifest.
- Foreign-symbol liquidations are deliberately not represented as XAU events. No attach/reload, broker write, backtest, or Blueberry access occurred. Live event readback, in-memory identity, write approval, hardware, and Strategy Tester gates remain open.
