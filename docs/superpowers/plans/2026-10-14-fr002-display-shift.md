# FR-002 display-only moving-average shift

## Scope

Add an account/layout-persisted horizontal display shift from -500 to +500 candle slots to each configurable EMA/SMA/WMA/RMA/SMMA instance. Shift only the plotted/readout timestamp mapping; never alter source candles, indicator calculations, broker state, or strategy behavior. Existing profiles without a shift default to zero.

## Steps

- [x] Add Node/browser and Python contracts for zero/default shift, both bounds, shifted plotted timestamps/readout, and legacy profile compatibility; observed RED before implementation.
- [x] Implement strict optional SQLite field, editor control, display-only series projection, honest edge-gap states, and local/server profile roundtrip.
- [x] Run average Node tests, Chromium smoke (including readout alignment and shift-edge labeling), 18 workspace tests/79 subtests, syntax/compile/diff checks; independent review findings fixed and approved.
- [x] Update FR-002 evidence; native-v5 parity and other indicator settings remain open; commit this slice.
