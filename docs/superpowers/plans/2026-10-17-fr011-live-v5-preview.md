# FR-011 Live native-v5 preview acceptance

## Goal

Verify the existing default-off native-v5 preview against each authorized live MT5 demo feed without changing the runtime flag or making v5 the production chart.

## Scope and safety

- Use only `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`.
- Rewrite the preview flag only in the headless browser's HTML response; do not alter the private runtime config or dashboard process.
- Require exact `MT5_VERIFIED` account/symbol/timeframe candle responses with `canExecute=false`.
- Block non-GET API requests and any API request scoped to Blueberry or another account.
- Confirm both v4 and v5 charts render; production v4 remains the default.

## Acceptance

- Each demo's native v5 canvas renders the number of bars returned for that exact account and scope.
- Preview status, account/symbol/timeframe and source provenance are correct.
- No browser errors, account-scope violations, Blueberry API requests or broker mutations occur.
- Preserve the production-v5 parity, full editor/overlay, target-hardware and cutover gates as open.
