# FR-020 portfolio planner read slice

## Scope

Implement a bounded, account-scoped, read-only MT5 portfolio snapshot for the extended planner. This slice reports verified open-position exposure by symbol and side, floating P/L and swap in account currency, and explicit correlation unavailability because no aligned historical-return source exists. It must never infer missing stop risk or correlation and must never call broker write APIs. FR-020 remains partial until correlation scenarios, planner UI and demo/hardware acceptance are complete.

## Contract and files

- `chart_studio/broker_reads.py`: validate account-wide `positions_get()` rows and build bounded aggregates under `verified_read`'s gateway lock.
- `chart_studio/read_api.py`: add `GET /api/chart/v1/portfolio?account=...`, require account scope and return no-store provenance.
- `tests/test_chart_studio_broker_reads.py`: fake-MT5 API contracts for multiple symbols/sides, valid empty book, unavailable book, malformed row, unknown account, locking, correlation unavailable, and no writes.
- `docs/OPEN_TASKS.md`: record only the implemented/read-tested slice; retain FR-020 and AT-021 open for full planner and demo acceptance.

## Steps and verification

1. Add failing tests: account-wide query, aggregation, correlation state, malformed/unavailable distinction and empty book.
2. Run those tests and confirm they fail for the missing endpoint.
3. Implement bounded row validation/aggregation and endpoint inside verified account session.
4. Run focused broker-read tests, then relevant backend regression tests and `git diff --check`.
5. Review the resulting diff for account isolation, unbounded data, false precision, and mutation paths. Do not deploy or start MT5.

## Acceptance boundary

No correlation coefficient or stop-risk aggregate is fabricated. Position exposure is explicitly gross/net lots and account-currency floating result, not notional. Portfolio size above the documented cap fails closed. Correlation, currency conversion, planner UI, actual demo feeds and hardware acceptance remain open.
