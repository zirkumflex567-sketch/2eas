# FR-020 portfolio planner read slice

## Scope

Implement a bounded, account-scoped, read-only MT5 portfolio snapshot for the extended planner. This slice reports verified open-position exposure by symbol and side, floating P/L and swap in account currency, account margin context, broker-calculated loss at actual stops, and pairwise correlations from aligned completed H1 returns when enough data is available. The What-if preview adds existing and proposed stop-risk gross, only when both are known in the same account currency, and explicitly gives no correlation or hedging credit. It must never infer missing stop risk or correlation and must never call broker write APIs. FR-020 remains partial until real demo/hardware acceptance is complete.

## Contract and files

- `chart_studio/broker_reads.py`: validate account-wide `positions_get()` rows and build bounded aggregates under `verified_read`'s gateway lock; read at most 257 completed H1 bars for each of at most 12 position symbols and compute pairwise correlations at exact common UTC timestamps.
- Account-wide margin/free-margin/equity/balance comes from `account_info`; stop risk uses MT5 `order_calc_profit` at each actual SL. Missing stops or calculation errors make the aggregate unavailable.
- `chart_studio/read_api.py`: add `GET /api/chart/v1/portfolio?account=...`, require account scope and return no-store provenance.
- `static/chart-studio-beta.js`: display verified portfolio, account margin, stop risk and validated descriptive correlation pairs in the What-if panel; add same-currency existing and proposed stop-risk estimates gross; discard stale responses across account changes and support manual refresh.
- `scripts/smoke_chart_studio_beta.cjs` and `tests/test_chart_studio_broker_reads.py`: browser/account-race and fake-MT5 contracts for multiple symbols/sides, risk inputs, valid empty book, unavailable book, malformed row, unknown account, locking, correlation unavailable, and no writes.
- `docs/OPEN_TASKS.md`: record only the implemented/read-tested slice; retain FR-020 and AT-021 open for full planner and demo acceptance.

## Steps and verification

1. Add failing tests: account-wide query, aggregation, correlation state, malformed/unavailable distinction and empty book.
2. Run those tests and confirm they fail for the missing endpoint.
3. Implement bounded row validation/aggregation and endpoint inside verified account session.
4. Run focused broker-read tests, then relevant backend regression tests and `git diff --check`.
5. Review the resulting diff for account isolation, unbounded data, false precision, and mutation paths. Do not deploy or start MT5.

## Acceptance boundary

No correlation coefficient is fabricated. Position exposure is explicitly gross/net lots and account-currency floating result, not notional. Stop-loss risk is a nonnegative sum of broker-calculated losses at actual SLs; no SL or failed calculation is unavailable. Portfolio size above the documented cap fails closed. The preview's gross additive estimate gives no correlation or hedge credit. Official [`copy_rates_from_pos`](https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesfrompos_py) semantics use bar index 0 for the current bar, so history requests start at index 1. MT5 history depth depends on broker data and terminal chart settings; correlation does not establish causation or guarantee diversification.

## Progress update

- [x] `53b9a2b` added the bounded, account-scoped portfolio API and validated symbol/side aggregates.
- [x] Follow-up adds account margin context, broker-calculated loss at actual SLs, explicit unavailable states, and account-race-safe beta-panel display/refresh. Verification: 140 focused broker-read tests and the Chromium beta smoke pass.
- [x] What-if now reports same-currency existing plus proposed broker stop risk as gross additive, with an explicit unavailable state if actual-position stop risk is missing. Verification: 140 focused broker-read tests and Chromium beta smoke, including available and unavailable portfolio risk.
- [x] Added bounded H1 correlation pairs for 2–12 held symbols using at least 60 aligned completed-bar returns; UI validates data shape and labels correlation descriptive. Verification: 142 broker-read tests and Chromium beta smoke, including history unavailable, sparse alignment and constant series.
- [ ] Real demo-history, hardware and full FR-020 acceptance remain open.
