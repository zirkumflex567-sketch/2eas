# FR-022 read-only MT5 candle-history pagination

**Goal:** Let ChartStudio request and display older verified MT5 bars while preserving account scope, indicator warm-up, and the current latest-bars refresh.

**Scope:** Add a bounded `before` cursor to `GET /api/candles`. Latest requests continue using `copy_rates_from_pos`; historical requests use MT5 `copy_rates_from`, discard any bar at or newer than the exclusive cursor, calculate indicators across fetched warm-up bars, and return the requested page. The chart loads older pages near the left edge, verifies scope and strict time order, merges candles/indicators/markers, and preserves the user's visible range. Broker-history completeness, performance and demo acceptance remain open.

**Safety:** Read-only market data only. Headless Chromium regression is used; no desktop UI control, MT5 mutation, EA/chart change, order, or Strategy Tester/backtest.

## Tasks

1. [x] Add failing endpoint contracts for exclusive cursor, bounded page size, warm-up, and invalid cursor.
2. [x] Implement and instrument the historical MT5 read path; keep latest-page behavior unchanged.
3. [x] Run focused backend tests, syntax and diff checks; verify no write endpoint is involved.
4. [x] Record the exact delivered slice and remaining frontend/demo/performance acceptance in `OPEN_TASKS.md`.
5. [x] Add a failing headless Chromium contract for loading older pages at the left edge, sorted merge and zero writes.
6. [x] Retain loaded pages across latest-bar refreshes and discard responses after account/symbol/timeframe changes.

**Verification:** `tests/test_dashboard_frontend.py`: 64 passed and 38 subtests passed; `tests/test_backend_audit.py`, `tests/test_broker_telemetry.py`, and `tests/test_dashboard_proxy_security.py`: 187 passed. Targeted Chromium regressions cover left-edge loading, the live-window bridge candle, exhausted-history 404 behavior, and configured-symbol fallback. Historical live MT5 paging passed for Blueberry `XAUUSD.pi/M15`: 10 latest bars followed by 10 older bars, with the older page strictly before the cursor. Independent review found no actionable issues. The original deployment-level five-demo check was still open then; the five non-Blueberry demos were rechecked below on 22.10. Real mobile/hardware, broker-history coverage and endurance budgets remain open.

**Five-demo follow-up (22.10.2026, Main `53c56ec`):** The production chart live smoke was run separately for each authorized non-Blueberry alias. All five `XAUUSD`/`XAUUSD.p` M15 feeds had older history; a real left-edge scroll fetched one 150-bar page per account using the exclusive cursor. The rendered chart retained its initial 1,001 candles and added the older page in strictly increasing time order without duplicate bars; each run used 19 API requests, zero mutations, zero blocked requests and zero browser errors. The five runs intentionally used isolated browser processes because the shared MT5 session lock can make a combined multi-account preview exceed its unrelated v5-status wait. Blueberry was not queried. GitHub main CI passed for this code-compatible runtime commit (Chart Studio run `39742723325`, Performance/UX run `39742723540`). Hardware, broker-history coverage and endurance budgets remain open.
