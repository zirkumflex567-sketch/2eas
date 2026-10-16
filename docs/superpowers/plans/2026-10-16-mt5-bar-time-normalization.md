# MT5 Bar-Time Normalization Implementation Plan

> **For agentic workers:** Use the existing read-only workflow and execute these steps in order. Steps use checkbox syntax for tracking.

**Goal:** Ensure MT5 bar timestamps from the four verified demo terminals are normalized to UTC before chart, regime, footprint, and immutable snapshot use.

**Architecture:** Store the observed rates-time basis explicitly per verified account and centralize epoch normalization beside the existing broker clock policy. Keep quote/deal time handling unchanged; normalize only rate-bar timestamps and adjust historical cursor bounds to the source basis.

**Tech Stack:** Python, FastAPI, pandas/NumPy, pytest, existing MetaTrader5 adapter.

---

### Task 1: Explicit time-basis policy

**Files:** `broker_clock.py`, `account_gateway.py`, `tests/test_broker_clock.py`

- [x] Add a strict UTC/BROKER_SERVER rate-time policy and conversion helper.
- [x] Mark only the four live-verified demo configurations as BROKER_SERVER; do not inspect Blueberry.
- [x] Test configured offsets, UTC defaults, and invalid policy rejection.

### Task 2: Chart and analytics consumers

**Files:** `app.py`, `chart_studio/read_api.py`, `chart_studio/broker_lifecycle_capture.py`, `tests/test_backend_audit.py`, `tests/test_chart_studio_broker_reads.py`, `tests/test_chart_studio_regime_api.py`, `tests/test_chart_studio_broker_lifecycle_capture.py`

- [x] Add failing tests for normalized chart bars and exclusive historical paging.
- [x] Normalize the current and historical `/api/candles` results before indicator/readout construction.
- [x] Apply the same policy to regime bars, footprint bars/ticks, and recorded snapshot bars.
- [x] Verify 307 focused Python tests and post-deployment browser/API acceptance across four explicit demo feeds without writes.

### Task 3: Delivery

**Files:** `docs/OPEN_TASKS.md`, `docs/MT5_DATA_AVAILABILITY_2026-10-09.md`

- [x] Document the live evidence and limits without raw ticks or private price details.
- [x] Commit/push to main, guarded-restart local runtime, fast-forward htown `/stt`, and verify exact revision/digest.
- [x] Do not use Blueberry or start any backtest/Strategy Tester.
