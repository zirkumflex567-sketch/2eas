# FR-002 / FR-008 native v5 moving-average calculation

**Goal:** Calculate independent native v5 moving-average instances from the chart's UTC candles with the existing beta's EMA/SMA/WMA/RMA/SMMA, source, period and display-shift rules.

**Requirements:** FR-002, FR-008, AT-001/002/025. The beta catalog smoke also asserts the full P0 catalog; the new calculation path remains an adapter-only renderer capability, with production v5 UI migration and target hardware acceptance separate.

## Tasks

1. [x] Added failing browser contracts; first run confirmed `addMovingAverage` was absent from the adapter.
2. [x] Implemented strict EMA/SMA/WMA/RMA/SMMA calculation, source/shift validation, independent per-instance edits, full-history replacement recalculation, and cached O(period) forming/new-bar point updates.
3. [x] TypeScript check, build and complete native v5 Chromium smoke passed; 35 type/source/shift configurations across same/new-bar updates match the current beta reference, and the 5,000-bar/20-indicator forming update measured 4.3 ms versus 141.7 ms before endpoint optimization. No broker writes occurred.
4. [x] Reviewed behavior and documented adapter-only evidence plus production gaps in `OPEN_TASKS.md` and RFC.

**Safety:** No broker requests/writes, MT5 terminal operations, EA/preset changes, Strategy Tester, backtests, production mount switch, or deployment.
