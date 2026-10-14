# FR-002 configurable volume colors

## Scope

Add account-local up/down colors for the read-only broker volume histogram and persist them through backward-compatible SQLite indicator profiles. Keep real/tick volume provenance intact and make no order-flow or broker-write claims.

## Steps

- [x] Add failing Node calculation/schema and Chromium editor/profile contracts for custom up/down colors and legacy defaults.
- [x] Implement strict six-digit color validation, per-account defaults, editor controls and histogram colors.
- [x] Run indicator Node tests, Chromium dashboard smoke, workspace tests, syntax/compile/diff checks; independent review and fix findings.
- [x] Update FR-002 evidence and commit; Bollinger, Session VWAP and v5 parity remain open.
