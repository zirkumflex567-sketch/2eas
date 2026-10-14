# AT-024 native v5 display-timezone contract

**Goal:** Change displayed chart times across IANA timezone and DST boundaries while preserving source UTC candle times and drawing anchors exactly.

**Requirements:** AT-024, FR-018/FR-011 staged v5 parity. This proves an adapter capability and does not claim production migration or hardware acceptance.

**Implementation:** Add a validated display timezone to the isolated native v5 adapter. Apply it only to time-axis and crosshair formatting; retain numeric UTC timestamps in candles, readouts, drawings, transfer and storage. Keep axis labels compact and show the UTC offset so the repeated autumn hour is distinguishable. Invalid zone changes fail atomically.

## Tasks

1. [x] Added Chromium contract coverage for Berlin's spring-forward and repeated autumn hour; formatter labels/offsets change while candle ISO times, exact drawing anchors and drawing pixel coordinates remain fixed.
2. [x] Implemented cached IANA timezone formatters using the locally pinned Lightweight Charts v5 tick/time formatter APIs; invalid zones leave the selected zone and output unchanged.
3. [x] `npm --prefix chart_studio_v5 run check`, build and `node scripts/smoke_chart_studio_v5.cjs` pass; generated bundles/screenshots remain in ignored output.
4. [x] Independent review completed with no important findings; `OPEN_TASKS.md` updated `OPEN_TASKS.md` with only adapter-level evidence. Physical Windows timezone/DST, production v5 migration and target-hardware acceptance remain open.

**Safety:** No EA/preset edits, MT5 connections, broker writes, backtests, Strategy Tester, GUI automation or GitHub.
