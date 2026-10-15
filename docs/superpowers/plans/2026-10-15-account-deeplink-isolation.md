# Account deep-link and startup isolation

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Goal

Honor a valid `?account=<alias>` deep link before any account-scoped chart, status, portfolio, or journal request. The URL selection takes precedence over persisted local selection, and the initial journal request remains scoped to that account instead of expanding to all configured accounts. Invalid aliases continue to use the configured default. No MT5 write, broker mutation, desktop automation, or backtest.

## Implementation and acceptance

1. Add a real-HTML Playwright regression using the existing broker-free fixture. Persist a different account locally, open a valid URL-selected demo alias, and assert selected account, chart scope, and all account-scoped startup requests stay with the URL alias. Confirm no mutation requests.
2. Observe the test fail against the current bootstrap behavior.
3. Initialize the active account and journal filter from a validated existing account-tab alias; after `/api/accounts`, validate against the returned catalog and use its symbol/timeframe. Do not broaden the initial journal request to `all` for an account deep link.
4. Run the focused regression, relevant dashboard frontend suite, JS syntax checks and `git diff --check`.
5. Deploy exact `main` with the guard and verify local/htown runtime identity. Any live browser validation must abort all Blueberry-scoped requests before they reach the server and block all non-GET requests.

## Status

- [x] RED test reproduced the URL being ignored (`journalFilter` stayed `all` despite `?account=titan` and a conflicting saved account); GREEN initializes the selected account before the chart mounts, gives a deep link priority over saved local selection, and starts journal reads only after the account catalog validates the selected alias. Non-deep-linked `all` remains unchanged.
- [x] Full `tests/test_dashboard_frontend.py`: 68 passed, 38 subtests passed. `git diff --check` passes. The targeted regression proves all startup status/candle/portfolio/journal requests use only the URL-selected fixture alias, with zero mutation requests.
- [ ] Deploy and verify the exact resulting `main` identity locally and through htown `/stt`; complete remaining account-race/live acceptance.
