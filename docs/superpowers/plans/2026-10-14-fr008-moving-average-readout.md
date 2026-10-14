# FR-008 configurable moving-average readout

## Goal

Include active configurable EMA/SMA/WMA values in the selected chart bar's existing read-only data window, with honest warm-up states.

## Scope

- `static/chart-studio-averages.js`: build timestamp-indexed readout values when bars or average configuration changes; expose only visible lines and preserve explicit warm-up labels.
- `static/chart-studio-beta.js`: combine average and pane-indicator values, and refresh the currently selected hover or pinned candle after configuration changes.
- `scripts/smoke_chart_studio_beta.cjs`: assert selected-bar values, warm-up, and refresh after adding an average.
- `docs/OPEN_TASKS.md`: update FR-008 evidence while keeping native v5 and full-catalog acceptance open.

## Steps

- [x] Add a Chromium assertion for a configured EMA appearing in the data window and observe it time out before implementation.
- [x] Cache per-bar visible moving-average readouts during series refresh, avoiding recalculation on every crosshair event.
- [x] Merge moving-average values with existing pane indicators and refresh hover or pinned selection after data/config changes.
- [x] Cover value display, pre-warmup state, state refresh after duplication, and suppression of the no-indicator placeholder when averages are active.
- [x] Run browser smoke, syntax/diff checks, focused Python regression tests, and independent review.
- [x] Update FR-008 evidence; retain full catalog and native v5/hardware acceptance as open.
