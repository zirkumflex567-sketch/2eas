# FR-032 Deterministic Market Regime Implementation Plan

> **For agentic workers:** Use the plan inline with explicit review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a reproducible, read-only market-regime snapshot from verified closed MT5 candles, with stable thresholds, hysteresis, `as-of` filtering and honest `UNKNOWN` states.

**Architecture:** Put bounded, deterministic feature and regime calculations in a pure Python module. Expose the latest snapshot through an account-scoped MT5-verified GET route, then render only its tags, feature values, thresholds and quality flags in the existing Chart Studio market-structure panel. News risk remains `UNKNOWN` until FR-034 provides a verified calendar source. Historical strategy performance, OOS analysis and backtesting are explicitly outside this plan.

**Tech Stack:** Python/FastAPI, existing `account_gateway` and `broker_reads` verification, MT5 rates, existing Chart Studio browser JavaScript and Chromium contract smoke.

---

### Task 1: Deterministic feature and state engine

**Files:** Create `chart_studio/regimes.py`; create `tests/test_chart_studio_regimes.py`.

- [x] Write failing tests for candle validation, future-bar exclusion at `asOfUtc`, minimum warm-up, deterministic ATR/ADX/EMA-slope/realized-volatility/Bollinger-width features, parallel trend and volatility dimensions, and stable JSON values.
- [x] Run the focused tests and confirm they fail because the classifier is absent.
- [x] Implement the pure classifier with versioned rules: 14-bar Wilder ATR/ADX, EMA-20 slope over five bars and EMA-20/50 separation normalized by ATR, 20-bar standard deviation of log returns and 20-bar Bollinger width. Trend enters at ADX ≥25, absolute slope ≥0.20 ATR and separation ≥0.10 ATR; trend exit requires ADX <20 or absolute slope <0.10 ATR. Volatility compares realized volatility with its trailing 100-valid-bar median: high enters at 1.50× and exits below 1.25×; low enters at 0.67× and exits above 0.80×. Record every threshold and the model revision.
- [x] Add three-closed-bar entry hysteresis and two-bar exit hysteresis independently to trend and volatility dimensions; emit `UNKNOWN` when history, OHLC consistency, timestamps, warm-up or required features are insufficient.
- [x] Return `asOfUtc`, `frame`, feature values, applied thresholds, model revision, orthogonal trend/volatility tags, `eventRisk=UNKNOWN` and `newsRisk=UNKNOWN` until FR-034 supplies a verified calendar, and data-quality flags. `confidence` is only a 0–1 data-quality/rule-coverage score with a textual explanation; it must never be described as probability or predictive certainty.
- [x] Make priority explicit: invalid OHLC, insufficient warm-up, or missing required feature makes the affected dimension `UNKNOWN`; trend and volatility stay orthogonal; trend is `UP`/`DOWN` only after entry hysteresis, `RANGING` only when no trend is active and ADX <20, otherwise `TRANSITION`; volatility is independently `HIGH`/`LOW`/`NORMAL`; unavailable calendar data is always `UNKNOWN` and never implies no event risk.
- [x] Run the focused test module.

### Task 2: Verified broker read API

**Files:** Modify `chart_studio/read_api.py`; extend `tests/test_chart_studio_read_api.py` or create `tests/test_chart_studio_regime_api.py`.

- [x] Write failing API tests for explicit account/symbol/timeframe, source identity, closed-bar-only data, `at` cutoff, bounded lookback, malformed rates, missing history and denied Blueberry access.
- [x] Confirm RED.
- [x] Implement `GET /api/chart/v1/regimes` inside `verified_read`, read only a capped MT5 history, preserve `copy_rates_from_pos` bar timestamps as UTC per the official MT5 Python contract (quote timestamps still use the account clock policy), and derive `asOfUtc` from the requested cutoff or a validated fresh quote.
- [x] Return `canExecute=false`, `MT5_VERIFIED` provenance and generic fail-closed errors. No storage writes or order calls.
- [x] Run API and gateway tests.

### Task 3: Chart Studio read-only status

**Files:** Modify `static/chart-studio-market-structure.js`, `scripts/smoke_chart_studio_beta.cjs`, and relevant frontend contract tests.

- [x] Add a failing Chromium assertion for scoped GET and display of trend/volatility tags, thresholds, quality, unknown news calendar and zero writes.
- [x] Add an account/symbol/timeframe-bound fetch with stale-response suppression; show `UNKNOWN` on unavailable data and never use browser-local current time as source time.
- [x] Run focused market-structure and full beta smoke.

### Task 4: Review and delivery

**Files:** Update `docs/OPEN_TASKS.md` and this plan.

- [ ] Record AT-047 classifier/API/UI as delivered with reproducible local tests; keep FR-032 partially open, and AT-048 plus its §24.7 P1 gate and all OOS/backtest work explicitly deferred per user instruction.
- [ ] Run relevant Python/Node/Chromium checks and the existing full-suite workflow when practical.
- [ ] Review the diff, commit on `main`, push, guarded-restart local runtime, update htown `/stt`, and verify matching runtime revision/digest and static asset delivery.
