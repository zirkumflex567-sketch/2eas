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
- [x] Deployed exact `main` commit `010969d` through the runtime guard locally and on htown's `/stt` upstream. Local and forwarded runtime identities match (`startupRevision=diskRevision=010969df879b8d34068534f4968f7e845f54b1c4`, digest `21344a1e33ef98b27ee8f071ad9dda9bd939e62451373d966959aa33a2a4f435`, clean, `restart_required=false`). GET-only verification confirms all four permitted aliases remain demo feeds; no browser or Blueberry request was used for deployment verification.
- [x] Resulting-main CI passed on `cf4691b` (Performance/UX Run `39011193146`, Chart Studio Run `39011193196`). `scripts/smoke_live_account_deeplink.cjs` preserves a rerunnable live check across all four authorized demos: each URL-selected account and journal scope overrides a conflicting saved alias; all 1,001 rendered bars match the selected feed, all four startup reads stay scoped, and all 18 requests per account are GET-only. The delayed-response/20-cycle account-race run on the same deployed app matched each active verified feed (292 GETs, zero writes/errors/Blueberry requests). Current local and htown `/stt` runtime identities match `cf4691b` and digest `eb7abd7cbb76535e27577f9960f4dd4324ecece6c0bc9f8e4979b598bf6a20ec`, `restart_required=false`.
