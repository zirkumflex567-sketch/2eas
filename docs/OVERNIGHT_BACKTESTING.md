# Overnight MT5 backtesting — native broker real ticks

## Why native MT5 instead of Python simulation?

The existing `backtest_engine.py` approximates order fills using OHLC candles and cannot prove parity with Titan/GoldM15 MQL5. This separate, lightweight Python standard-library runner schedules the **native** MT5 Strategy Tester with `Model=4` (every tick based on real ticks). It uses actual compiled `.ex5` files, their `.set` presets and history downloaded via the chosen broker's demo terminal. It **never places live orders** or changes any live terminal/EA.

**Limitations:** Requesting Model=4 does not guarantee complete broker tick coverage. Always inspect the native tester report and journal for data quality, actual EA/preset identity, broker symbol/server, spreads, commissions, calendar/news filters, and errors. A successful report file is not independent evidence of correct trading performance. First-time real-tick history downloads may be slow.

## Installation on a Windows VPS

1. Install **a separate research MT5 terminal** in a writable path like `C:\MT5-Research\terminal64.exe`. Do not use the production EA terminals or a Program Files installation. Start it once with `/portable`, connect to the intended **demo broker account**, initialize history, and confirm `MQL5\Experts` and `MQL5\Profiles\Tester` exist. **Close the research terminal before batch runs.**
2. Copy `backtesting/example-jobs.json` to a private configuration file, e.g. `C:\private\mt5-jobs.json`. Update the dedicated terminal path, exact broker symbol/suffix, date ranges, capital, leverage, chosen EA binaries and compatible presets. Sample values are not verified broker parameters. Optional numeric `login` selects a previously configured **demo** login; never place passwords in the JSON.
3. From the repository root run:

```powershell
python -m backtesting --config C:\private\mt5-jobs.json --dry-run
python -m backtesting --config C:\private\mt5-jobs.json
# Repeat after an interruption: skip successes, retry failures
python -m backtesting --config C:\private\mt5-jobs.json
# Explicitly repeat previous successes with new report paths
python -m backtesting --config C:\private\mt5-jobs.json --force
```

## Unattended nightly use

In **Windows Task Scheduler**, set a scheduled task using a user permitted to run the separate terminal. Set 'Do not start a new instance' for overlapping runs and execute a batch script like:

```bat
@echo off
cd /d C:\2eas
C:\Python314\python.exe -m backtesting --config C:\private\mt5-jobs.json
exit /b %ERRORLEVEL%
```

The runner uses only standard-library Python, sequential jobs, configurable per-job timeouts, a terminal-local exclusive lock, immutable SHA-256 identifiers of configs/EA/presets, resume/force behavior and separate JSON/report files. Native report copies are stored under `output/mt5-backtests/<run-id>/report.htm` with the run manifest `result.json`; `batch_summary.json` summarizes the night. If a crash leaves a lock, inspect native MT5 processes before removing it. A missing/incomplete MT5 report is marked failed; it is never treated as a positive trading result.

## Scope / next steps

This is the standalone runner, not yet a finished ChartStudio dashboard or trading-signal optimizer. EA compilation, matching EX5 to source, tester initialization, broker login, and validation with historical tick data must happen on the Windows VPS. GoldM15 news/history inputs require particular attention; historical broker data alone cannot reconstruct missing EA decision events. MT5 terminal reports remain the source of performance metrics until a validated parser is integrated.

Reference: https://www.metatrader5.com/en/terminal/help/algotrading/testing

## Results & out-of-sample workflow

The batch now produces:
- `batch_metrics.csv`: native MT5 report summary statistics when parseable.
- `oos_comparison.json`: matched `strategy_id` in-sample / out-of-sample results.
- `index.html`: **static, private, offline** results view. Open it locally after a run. No unauthenticated Cockpit route is enabled.
- Per-run `result.json` and unmodified `report.htm` for verification.

Define a pair using identical `strategy_id`, `sample: "in_sample"` and `sample: "out_of_sample"`, with **non-overlapping historical ranges**. Adjust parameters **only using IS**, freeze the preset before running OOS. No hindsight retuning; do not treat OOS as a second optimization set. Ambiguous multiple independent run fingerprints within the same strategy/sample are marked `ambiguous` rather than silently cherry-picked.

`screening_limits` supports `min_trades`, `min_profit_factor`, `max_equity_drawdown_pct` and `min_history_quality_pct`. Missing numbers report `unknown`. Prop-firm daily drawdown, static trailing floor, resets/DST and broker tick quality are **never certified** by these summary metrics. They require a verified deal/equity timeline plus the exact firm rules, separately. With unknowns, the summary status is `review`, not an automatic trading approval.

**Current integration boundary:** Native report exports and the CSV/HTML viewer are implemented. A chronological equity-curve parser and a native Cockpit UI endpoint are **not yet built**; do not infer a per-trade equity curve from only aggregate performance stats. Native MT5 reports may vary with language/build; unsupported reports fail closed with an actionable failed status.

## Operator acceptance checklist

Before treating this as overnight-ready on the VPS:
1. Complete GitHub contract checks and Windows MT5 dry run; resolve any CI infrastructure failures.
2. Verify research terminal is a separate portable demo terminal, not running the production EA or real account.
3. Check EA loaded from its expected EX5/preset, broker symbol suffix, history downloaded and correct real-tick model in tester journal.
4. Compare one simple manual MT5 Strategy Tester run against the batch report (profit/trades/drawdown) on exactly identical dates/settings.
5. Run two consecutive overnight batches, verify resume after interrupted run, empty/missing broker history handling, timeouts, report integrity, and no live trading impact.
6. Treat OOS performance as research evidence, **never** as proof of future returns.
