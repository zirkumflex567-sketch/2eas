# FR-002 Linear Regression Channel Beta Slice

## Goal and scope

Add a read-only, account-local Linear Regression Channel to Chart Studio Beta. For each closed or forming bar, fit ordinary least squares to the last `period` closes including that bar. The middle line is the fitted value at the current bar; the channel width is `multiplier` times the population standard deviation of the fit residuals over that same window. Do not project beyond available bars or read future bars.

Defaults are period 20 and multiplier 2.0. Period is an integer from 2 through 200; multiplier is a 0.1-step value from 0.1 through 10.0. Require a full lookback before emitting values. Changing the forming bar replaces its own output. Keep the setting scoped to the account, include values in the existing indicator readout, and expose the channel as three native Beta chart series. Keep the production v4/v5 migration, native-v5 adapter, hardware and sustained-load gates open.

## Files and implementation steps

1. `scripts/test_chart_studio_indicators.cjs`: add independent fixtures for a perfect linear series, a known residual spread, minimum warm-up, invalid bounds, dispatch and registry defaults; prove RED before implementation.
2. `static/chart-studio-indicators.js`: add metadata, calculation, settings validation/restore, editor controls, channel series and readout labels.
3. `chart_studio/workspaces.py` and `tests/test_chart_studio_workspaces.py`: allow only the channel's strict period and multiplier settings in account-scoped workspace snapshots; prove round-trip and reject malformed ranges.
4. `scripts/smoke_chart_studio_beta.cjs`: prove enable/edit, persisted account-local profile and account-switch restore, forming-bar replacement in all three rendered lines, and GET-only/no-broker-write behavior. Account switching calls the same profile restore path used when the chart is mounted; a full page reload is outside this slice.
5. Update the FR-002 ledger in `docs/OPEN_TASKS.md` with implementation and verification evidence. Do not claim native-v5 parity, production cutover, hardware, or duration acceptance.

## Verification

Run `node scripts/test_chart_studio_indicators.cjs`, focused workspace tests, `node scripts/smoke_chart_studio_beta.cjs`, JavaScript syntax checks, `python -m compileall -q app.py chart_studio`, and `git diff --check`. Review the complete diff before updating `main` and deploying. Do not run any backtest, Strategy Tester, broker write, or Blueberry request.
