# FR-002 Supertrend slice

## Scope

Add the read-only Supertrend overlay to the existing Chart Studio Beta. Keep this slice account-local and workspace-persisted. Do not add trading signals, stop/target actions, MT5 calls, or broker writes. Native-v5 and production-renderer parity remain separate FR-002 gates.

## Contract

- Use Wilder ATR and the documented Supertrend final-band and trend-transition rules from the [TradingView Supertrend reference](https://www.tradingview.com/support/solutions/43000634738-supertrend/).
- Defaults: ATR length 10 and factor 3.0. ATR length is an integer from 2 to 200; factor is finite from 0.1 to 10.0 in 0.1 increments.
- Do not publish a value before the first complete ATR. Initial trend is down until ATR exists; flat data must produce finite output.
- The overlay is one colored price series and its data-window readout identifies up/down direction. It does not drive any order or EA logic.
- Persist enabled/period/factor through local account settings and validated SQLite workspace documents. Reject invalid or unknown parameters.

## Files and verification

- `static/chart-studio-indicators.js`, `static/chart-studio-catalog.js`, `app.py` assets as needed.
- `chart_studio/workspaces.py` plus focused Workspace contract tests.
- `scripts/test_chart_studio_indicators.cjs` for formula, warmup, transition, flat-market and bounds.
- `scripts/smoke_chart_studio_beta.cjs` for catalog, overlay, readout, account isolation, profile/Workspace and no-write behavior.
- Run focused pytest, indicator tests, Beta Chromium smoke and JavaScript syntax/checks.
- Update `docs/OPEN_TASKS.md`; leave native-v5, production migration, hardware and sustained-load gates open unless separately proven.
