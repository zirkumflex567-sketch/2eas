# Multi-account MT5 dashboard

Goal: Add GoldM15 account 53090070 alongside existing Titan account 53087839, with a top selector and equivalent dashboard functions, preserving Titan's existing behavior.

Architecture: Retain FastAPI and existing single-page cockpit. Explicit terminal/account registry and one process-wide lock protect complete MT5 requests, including mutations. A ContextVar selects account-specific drawdown configuration. No mt5.login or terminal restart. GoldM15 strategy adapter uses completed M15 bars, Wilder RSI and the deployed preset; read-only guard state is displayed separately from optional dashboard drawdown resets. Query parameter account defaults to Titan for compatibility. Frontend generation tokens discard late responses and clear old data/controls on switch or failed connection.

Tech stack: Python 3.14, FastAPI, MetaTrader5, pandas, vanilla JavaScript, existing lightweight-charts and styling.

- [x] Back up app/config and review this plan.
- [x] Write and run failing tests for explicit terminal validation, concurrent isolation, account-specific configuration, completed-bar RSI and momentum, and endpoint compatibility.
- [x] Implement request-level terminal lock/identity checks and isolated configuration; no password storage or trading during validation.
- [x] Add GoldM15 entry matrix per slot, separate momentum exit goals, accurate read-only EA limits/baseline status, and chart signal markers matching strategy.
- [x] Add responsive top account selector, scope all requests, discard stale responses, clear charts/positions/modals on switch, and preserve existing features.
- [x] Run regression tests, stage on a separate port, validate both live account identities and browser behavior; review changes.
- [x] Restart only the existing dashboard server after verification, verify both accounts on port 8050, document usage and rollback.

Validation: Fake MT5 tests exercise broker integration without orders. Live GET requests must report correct login/server and terminal data path. Browser validation includes both selections and repeated switches. Preserve original Titan drawdown file and common reset file; Gold reset affects display only and never rewrites mandatory guard state. Rollback uses timestamped file backups.

Implemented files: `app.py`, `account_gateway.py`, `goldm15_dashboard.py`, `tests/test_multi_account.py`, `output/playwright/validate_dashboard.js`, `DASHBOARD_ACCOUNTS.md`.

Final verification: 20 backend tests and 18 browser assertions passed. Production GETs and browser selection confirmed both account identities, Gold six entry conditions/three exit targets, verified persisted baseline, chart/profile data. Review identified and resolved risk basis (min balance/equity) and guard validation mismatches. Titan's config remains byte-identical to backup. MT5 PIDs13940/34812 unchanged. Only dashboard process replaced; production PID36856, temporary8051 preview stopped. Concurrent Titan-rule edits were preserved; first backup predates those edits. No actual validation POSTs to live backend, orders, account logins, or MT5 UI operations.
