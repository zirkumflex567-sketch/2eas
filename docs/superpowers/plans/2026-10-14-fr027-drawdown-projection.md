# FR-027 What-if daily drawdown projection

Add a read-only projection of a scenario's estimated stop loss against the dashboard's fresh daily drawdown buffer. The result is explicitly a dashboard policy estimate, never proof of EA guard state or trade permission. Missing/stale quote, unavailable baseline, invalid amounts, or non-USD account currency must yield `UNAVAILABLE`; no FX conversion is inferred. The chart preview remains read-only and strategy backtests are excluded.

## Acceptance

- The scenario stop risk adds to currently measured daily loss and returns the configured daily limit, projected loss and remaining distance (including a negative value if the scenario exceeds the limit).
- Projection fields disclose account currency, quote as-of, and `DASHBOARD_DD_ESTIMATE` source.
- EA guard always remains separately `UNKNOWN` / `NONE`; projection cannot change `canExecute=false`.
- Unknown or unusable source values fail closed to `UNAVAILABLE` rather than zero.
- Tests cover within-limit, exceeded-limit, EUR, absent/stale data and invalid scenario risk. UI separates the DD projection from broker PnL and user cost assumptions.
- Endpoint fetches current drawdown read-only under the verified account session; no order or position mutations.

## Verification

Run Chart Studio foundation, dashboard security, relevant backend audit tests, full Python suite and beta Chromium smoke. No MT5 write, EA attach, deployment or Strategy Tester run.

## Progress

- [x] Contract tests failed before implementation because the projection helper did not exist.
- [x] Extracted the dashboard's current daily-DD calculation so What-if reads only the verified fresh quote/account/history inputs instead of reloading chart candles. The existing dashboard status consumes the same helper.
- [x] Added server projection and UI/A-B display, including quote timestamp, explicit `UNAVAILABLE` states, and a separate always-unknown EA guard. No order mutation was added.
- [x] Focused foundation/backend audit tests: 114 passed, 29 subtests; beta Chromium smoke passed before the final quote-time label assertion.
- [x] Complete verification after refactor: 919 Python tests, 305 subtests, beta Chromium smoke with account/scope/drag and zero-write checks, Python/JS syntax checks and `git diff --check`.
