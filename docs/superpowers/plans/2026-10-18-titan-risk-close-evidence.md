# Titan risk-close evidence candidate

## Scope

Add observational evidence around the existing Titan `CloseAllPositionsForMagic` risk and basket-exit path. Preserve the close call, call-site order, guard predicates, and early-return/lockout behavior. Tag each existing close site as daily drawdown, total drawdown, profit target, Friday protection, weekend protection, or dynamic basket exit. Capture a position's closing side, quote intent and broker-time provenance, volume, `CTrade` result, order ticket, and subsequent exact-order-linked deal event. Do not install or attach this candidate, create trades, enable write routes, or run a strategy backtest.

## Contract and verification

- Add a failing builder contract that covers every tagged close site, the position-close attempt payload and broker-ticket correlation, and the unchanged uninstrumented close statement.
- Generate both allowlisted, preset-bound Titan candidates only under ignored `output/` and compile each with its configured MetaEditor; no MT5 terminal files or charts are changed.
- Run Titan evidence-builder and capture contracts, basket-guard/drawdown contracts, GoldM15 builder contracts, and the recorder model/spool/store/lifecycle suites.
- Review the generated diff to verify telemetry is bounded to the existing risk helper and does not execute orders, file I/O, sleeps, or strategy-condition changes.
- Record candidate hashes and test results in `docs/OPEN_TASKS.md`. Keep fresh quote, chart-bound in-memory EA/preset identity, real demo order/deal readback, write-release approval, hardware, and Strategy Tester gates open.

## Result (18 October 2026)

- RED/GREEN builder contract added; the builder suite passes (29 tests).
- Combined relevant regression set passes (243 tests; four existing FastAPI deprecation warnings).
- Both demo-bound candidates compile with MetaEditor, 0 errors and 0 warnings. EX5 hashes are recorded in `docs/OPEN_TASKS.md`; generated artifacts remain in ignored `output/` and are not installed.
- The source is ready for code integration after current-main CI. Live attachment and event acceptance remain unverified and are outside this candidate-only step.
