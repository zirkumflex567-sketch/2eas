# FR-022 read-only MT5 candle-history pagination

**Goal:** Let ChartStudio request older verified MT5 bars by an exclusive UTC epoch cursor while preserving indicator warm-up and the existing latest-bars contract.

**Scope:** Add a bounded `before` cursor to `GET /api/candles`. Latest requests continue using `copy_rates_from_pos`; historical requests use MT5 `copy_rates_from`, discard any bar at or newer than the exclusive cursor, calculate indicators across fetched warm-up bars, and return only the requested page. This slice exposes backend pagination; frontend scroll wiring, broker-history completeness, performance and demo acceptance remain open.

**Safety:** Read-only market data only. No MT5 mutation, EA/chart change, order, or Strategy Tester/backtest.

## Tasks

1. [x] Add failing endpoint contracts for exclusive cursor, bounded page size, warm-up, and invalid cursor.
2. [x] Implement and instrument the historical MT5 read path; keep latest-page behavior unchanged.
3. [x] Run focused backend tests, syntax and diff checks; verify no write endpoint is involved.
4. [x] Record the exact delivered slice and remaining frontend/demo/performance acceptance in `OPEN_TASKS.md`.
