# Completely local and free verification (no GitHub Actions)

The GitHub-hosted Actions jobs stopped **before** any test step ran. Avoiding Actions is fine: this repository can use a local Python test gate plus an isolated Windows demo MT5 instance. No payment method or paid CI is needed.

## Local tests (Windows VPS or development machine)

From the repository root:

```powershell
python -m backtesting.verify
# alternatively:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_backtesting_local.ps1
```

Uses **Python standard library only**. Runs syntax checks and isolated backtesting unit tests, returns an error exit code on failure and writes:

- `output/mt5-backtests/_verification/verification.json` (timestamp, environment, exact source SHA-256, pass/fail, no false broker approval)
- `output/mt5-backtests/_verification/syntax.log`
- `output/mt5-backtests/_verification/unit_tests.log`

All files remain on the local system; `output/mt5-backtests/` is ignored by Git. No automatic upload or website communication.

After configuring **a separate portable Windows MT5 demo terminal**, run an additional safe **dry-run**:

```powershell
python -m backtesting.verify --config C:privatemt5-jobs.json
```

This validates JSON and creates test manifests, **without launching MT5**. Only after checking the native terminal, broker/account and report paths should you invoke the real tester:

```powershell
python -m backtesting --config C:privatemt5-jobs.json
```

This last command is **not included in the local unit-test gate**; its correctness requires a real broker-connected Windows test and a manual comparison with MT5 Strategy Tester. Use Task Scheduler to execute the runner overnight (see [OVERNIGHT_BACKTESTING.md](OVERNIGHT_BACKTESTING.md)). Do not use the live EA terminals.

Existing repository GitHub workflows are not deleted, but do not need to be run for this backtesting branch. New automatic Backtesting CI was removed. Pushing commits to a pull request may still trigger older repository workflows until those are disabled in the repository settings; they are unrelated to this local testing gate.
