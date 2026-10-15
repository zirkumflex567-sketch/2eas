# FR-002 / FR-008 native v5 moving-average calculation

**Goal:** Calculate independent native v5 moving-average instances from the chart's UTC candles with the existing beta's EMA/SMA/WMA/RMA/SMMA, source, period and display-shift rules.

**Requirements:** FR-002, FR-008, AT-001/002/025. The beta catalog smoke also asserts the full P0 catalog; the new calculation path remains an adapter-only renderer capability, with production v5 UI migration and target hardware acceptance separate.

## Tasks

1. [x] Added failing browser contracts; first run confirmed `addMovingAverage` was absent from the adapter.
2. [x] Implemented strict EMA/SMA/WMA/RMA/SMMA calculation, source/shift validation, independent per-instance edits, full-history replacement recalculation, and cached O(period) forming/new-bar point updates.
3. [x] TypeScript check, build and complete native v5 Chromium smoke passed; 35 type/source/shift configurations across same/new-bar updates match the current beta reference, and the 5,000-bar/20-indicator forming update measured 4.3 ms versus 141.7 ms before endpoint optimization. No broker writes occurred.
4. [x] Reviewed behavior and documented adapter-only evidence plus production gaps in `OPEN_TASKS.md` and RFC.

## Follow-up: incremental oscillator state

The full history calculation on every forming/new bar remains an open FR-002/AT-025 performance item. Keep the adapter isolated and read-only; rebuild full series only when history or settings change, and update only the affected final points for each bar event.

1. [x] Added a failing Chromium contract; before implementation the smoke failed because `ChartStudioV5.createIncrementalOscillator` was absent. The test compares full RSI, ATR, MACD, ADX and Stochastic outputs after two replacements of the same forming candle and one appended candle.
2. [x] Implemented per-instance Wilder/EMA/ADX/Stochastic rolling state with a checkpoint before the current candle. Same-time updates rewind to that checkpoint; a newer candle advances once. History replacement and parameter edits rebuild the calculation. Native series and data-window maps receive only the current point.
3. [x] TypeScript check, bundle build and full native v5 Chromium smoke pass. Two 5,000-bar/20-indicator/1,000-drawing runs at 1280×840/DPR 1 measured 5.3 ms and 9.0 ms per forming update; these timings are local Headless Chromium evidence only, not target-hardware acceptance.
4. [x] Updated `OPEN_TASKS.md` and this plan with the verified result; production profile/editor wiring and hardware acceptance remain open.

**Safety:** No broker requests/writes, MT5 terminal operations, EA/preset changes, Strategy Tester, backtests, production mount switch, or deployment.
5. [x] Added adapter-level Chromium readout contracts for repeated forming updates, historical values, a newly appended bar, parameter rebuilds and full-history replacement; the first run exposed and corrected a test-reference mismatch before passing.
6. [x] Enforced the existing 150,000-bar chart budget on incremental appends. A full-capacity RSI stream rejects the next new candle without changing its snapshot; same-time replacement remains allowed. The adapter checks the limit before changing candle series, maps or indicators.
7. [x] TypeScript check, bundle build, full Chromium smoke and `git diff --check` pass after the boundary change.

