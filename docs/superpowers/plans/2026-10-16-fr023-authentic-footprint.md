# FR-023 Authentic Footprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, read-only Chart Studio footprint capability check that aggregates only verified MT5 execution-side ticks with positive Last and real volume, and clearly reports UNAVAILABLE otherwise.

**Architecture:** A bounded GET route reads the latest completed candle and its COPY_TICKS_ALL ticks under the shared account gateway lock. It denies Blueberry before broker access, accepts only one unambiguous BUY/SELL execution flag with positive Last and volume_real, groups valid executions by price, and returns structured unavailable reasons when the source cannot prove a footprint. The catalog exposes an on-demand status/readout and keeps ordinary candle tick volume labeled as a proxy.

**Tech Stack:** FastAPI, MetaTrader5 Python API, Decimal, existing account gateway, vanilla JavaScript, pytest, Playwright smoke.

---

### Task 1: Broker contract

**Files:**
- Modify: `chart_studio/read_api.py`
- Test: `tests/test_chart_studio_broker_reads.py`

- [x] Write failing tests for real buy/sell aggregation, COPY_TICKS_ALL only, ambiguous/quote-only/invalid volume rejection, empty history, and Blueberry denial before gateway initialization.
- [x] Run focused tests and confirm expected failures.
- [x] Implement a bounded latest-closed-bar route using verified symbol metadata, the shared gateway lock, strict output provenance, and fail-closed unavailable reasons.
- [x] Re-run focused tests and relevant read API tests; 158 passed, including the future-bar fail-closed regression.

### Task 2: User-visible capability

**Files:**
- Modify: `static/chart-studio-catalog.js`
- Modify: `static/chart-studio-beta.js`
- Modify: `static/chart-studio-quick.css`
- Test: `scripts/smoke_chart_studio_averages.cjs`

- [x] Extend the catalog contract with a separate Footprint diagnostic action and keep Broker-Volumen explicitly marked as a proxy.
- [x] Add an on-demand scoped GET, stale-scope suppression, and an honest UNAVAILABLE message or exact verified price-level table.
- [x] Verify the UI issues only GETs and keeps data scoped to the active non-Blueberry account, symbol, and timeframe.

### Task 3: Evidence and delivery

**Files:**
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/MT5_DATA_AVAILABILITY_2026-10-09.md`

- [x] Run focused tests and applicable UI/read API checks (158 Python tests; ChartStudio browser smokes).
- [x] Read-only check the four explicitly authorized demo feeds through the new route; Blueberry was not queried.
- [x] Record the result and limits without raw ticks or price-level details. The future broker candle timestamp prevented checking current executions, so FR-023 remains partial.
- [x] Commit to main, push, verify runtime identity locally and on htown `/stt`; GitHub checks were not yet confirmed. No Strategy Tester/backtests started.
