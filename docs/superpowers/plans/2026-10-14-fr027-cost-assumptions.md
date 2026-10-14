# FR-027 What-if cost assumptions

Make What-if estimates expose user-entered round-trip fees per lot and adverse exit slippage in broker ticks. MT5 remains authoritative for gross PnL at the requested levels and for PnL at the slippage-adjusted levels. Fee values are explicitly user assumptions in account currency; no historical broker fee or conversion is inferred. Risk-budget/equity-percent lot sizing must fit the gross stop loss after adverse stop slippage plus the assumed round-trip fee. The endpoint remains read-only and cannot execute or mutate trades.

## Acceptance

- Strict request bounds and boolean rejection for nonnegative fee-per-lot and integer slippage-tick assumptions.
- BUY and SELL costs move exits in the adverse direction and net estimates subtract the round-trip fee exactly once.
- Risk sizing includes slippage and fees in its budget while preserving separate gross and estimated total risk fields.
- UI labels account currency, preserves assumptions through chart drag re-previews and clearly distinguishes gross broker output from estimated net values.
- Tests cover request validation, both directions, fee arithmetic, risk-budget sizing, missing broker calculation, account currency and zero assumptions.
- No mutation call is introduced; Chromium asserts assumptions in payload and that no broker write is sent.

## Verification

Python foundation tests, dashboard security tests, Chart Studio beta Chromium smoke, syntax checks and `git diff --check`. No demo mutation or strategy backtest.
