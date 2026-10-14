# FR-002 configurable Bollinger bands

This slice completes configurable Bollinger period, standard deviation and fill in ChartStudioBeta. Settings remain account-scoped and travel through existing local and SQLite workspace documents. Existing schema-v1 layouts remain compatible. No MT5 writes or backtests are involved.

## Acceptance

- Strict workspace validation accepts `bbPeriod` (integer 2–300), `bbStdDev` (finite 0.1–10), and `bbFill` (boolean), while rejecting invalid types, bounds and unknown keys.
- The chart exposes accessible period, deviation and fill controls; changing them recomputes bands and persists the options per account.
- Bollinger calculations return upper, middle and lower bands with the selected period and population standard deviation multiplier.
- Fill is drawn only when both Bollinger and fill are enabled; band series and fill update when settings or candles change.
- Existing layouts load with defaults and profile/workspace roundtrips retain settings.

## Files and checks

- `static/chart-studio-beta.js`
- `chart_studio/workspaces.py`
- `scripts/test_chart_studio_math.cjs`
- `tests/test_chart_studio_workspaces.py`
- `scripts/smoke_chart_studio_beta.cjs`
- `docs/OPEN_TASKS.md`, `docs/CHART_STUDIO_TASKS.md`

Run the Node math contract, Python workspace contract, Chart Studio beta Chromium smoke, syntax checks and `git diff --check`. Backtests and Strategy Tester are excluded.
