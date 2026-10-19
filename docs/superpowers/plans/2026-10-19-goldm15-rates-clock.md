# GoldM15 Broker Rates Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize GoldM15 MT5 rate timestamps from its verified UTC+3 broker-server basis to UTC so the existing P0 production chart feed does not place candles in the future.

**Architecture:** This corrects the shared timestamp policy used by existing P0 broker-read/chart paths (FR-004/008/012); it does not start or activate a P1/P2 integration. Keep the per-account clock policy explicit and set only `goldm15` rates to `BROKER_SERVER`, matching its configured broker offset and observed quote/rates epochs. Prove the mapping with clock and candle-route regressions. A prior read-only footprint response exposed the same future-bar symptom, but this slice changes no footprint behavior or activation and preserves `canExecute=false` and all write gates.

**Tech Stack:** Python, FastAPI, MT5 gateway/read APIs, pytest.

---

### Task 1: Reproduce the P0 GoldM15 chart future-bar behavior

**Files:**
- Modify: `tests/test_broker_clock.py`
- Modify: `tests/test_backend_audit.py`

- [x] Assert the configured GoldM15 rate basis is `BROKER_SERVER` and a raw epoch of UTC+10,800 normalizes to the expected UTC epoch.
- [x] Add a GoldM15 `/api/candles` contract using broker-server timestamps and assert the returned last candle is UTC-aligned and not in the future.
- [x] Keep the regression on the already-live `/api/candles` path; do not add or enable P1/P2 footprint behavior in this slice.
- [x] Run the focused tests and confirm they fail because GoldM15 currently defaults to UTC.

### Task 2: Apply the explicit account policy and verify

**Files:**
- Modify: `account_gateway.py`
- Modify: `docs/OPEN_TASKS.md`

- [x] Declare `rates_time_basis='BROKER_SERVER'` for `goldm15`, preserving all other account settings.
- [x] Run focused clock, candle, and footprint tests plus the relevant backend/broker-read regression modules.
- [x] Update the FR-004 live-chart evidence with the verified timestamp defect and fix; do not claim a footprint is available without flagged MT5 executions.
- [x] Commit and push on `main` (`3c45702`), pass both required CI workflows (Chart Studio `39192681532`, Performance/UX `39192681528`), guarded-restart local 8056, and verify matching runtime revision/digest through htown's `/stt` upstream.
- [x] Repeat read-only GoldM15 candle and footprint GETs; verify UTC candle times, no future-bar rejection, `canExecute=false`, and zero broker writes. Only non-Blueberry demos were queried; no EA attach/reload or backtest.
