# GoldM15 risk-liquidation evidence candidate

## Scope

Extend only the isolated GoldM15 evidence candidate so its existing account-risk liquidation path records Gold-symbol close attempts with an explicit guard reason and exact broker-order correlation. Preserve the existing risk predicate, retry interval, selected-position scope, `CTrade.PositionClose` call, and retry logging. Do not attach or install the candidate, mutate a demo account, enable dashboard writes, or run Strategy Tester/backtests.

## Contract and verification

- Add a failing test proving the generated GoldM15 Risk include records the risk-trigger reason, symbol-bound closing side/quote/volume, request/result, and accepted ticket correlation while keeping the non-capture path's original close-and-retry behavior.
- Keep foreign-symbol liquidations unclaimed by the XAU chart recorder unless they can be represented with verified symbol-specific precision and provenance.
- Generate and compile the isolated candidate using the pinned source/includes/preset; verify zero compiler errors and that the manifest remains `NOT_INSTALLED`.
- Run GoldM15/Titan builder, recorder, model, spool, store, and lifecycle regressions. Review every changed close/cancel path for unchanged trade behavior.
- Record actual code/test evidence and leave live identity, event readback, write-release, hardware, and backtest gates open.

## Result (18 October 2026)

- The generated `GoldM15_Risk.mqh` candidate now tags hard lock, daily drawdown, rollover, unknown baseline, persistence failure, and holiday/guard liquidations and emits XAU-only close attempts into the existing bounded spool. The unchanged non-capture branch keeps the original close/retry statement.
- RED/GREEN contract added; the combined Titan, GoldM15, recorder, model, spool, store, and lifecycle set passes **244 tests** (four existing FastAPI lifecycle deprecation warnings).
- Fresh isolated MetaEditor build: **0 errors, 0 warnings**; EX5 SHA-256 `4708833f0994afd34297667aaf97046ada8b52ccdcede75c403c5093e7f088be`; manifest `NOT_INSTALLED`. Generated helper hash is recorded in that ignored manifest.
- Foreign-symbol liquidations are deliberately not represented as XAU events, and pending-order cancellations are still not captured. No attach/reload, broker write, backtest, or Blueberry access occurred. Live event readback, in-memory identity, write approval, hardware, and Strategy Tester gates remain open.
