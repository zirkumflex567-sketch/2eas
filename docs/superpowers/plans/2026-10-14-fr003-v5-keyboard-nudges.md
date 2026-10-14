# FR-003 native v5 keyboard nudges

## Goal

Let a keyboard-focused v5 chart move the selected drawing by one loaded candle horizontally or one CSS pixel vertically. Shift+Arrow moves ten steps. Support all native drawing types, reject locked/out-of-range moves, and record each nudge as one undoable/persisted change.

## Files and contract

- `chart_studio_v5/src/adapter.ts`: convert arrow-key steps through the chart's logical-time and price coordinate APIs, then use the existing validated update methods for the selected primitive.
- `scripts/smoke_chart_studio_v5.cjs`: test all seven selected native drawing types, undo/redo, locked behavior and boundary no-ops in Chromium.
- `chart_studio_v5/README.md` and `docs/OPEN_TASKS.md`: record only the implemented keyboard slice; full object manager/multi-select and hardware acceptance remain open.

## Verification

Run TypeScript check/build, isolated Chromium v5 smoke and `git diff --check`. No production cutover, broker access, MT5 mutation or backtest.

## Progress

- [x] Browser contract first failed because ArrowUp left the selected price unchanged. Added arrow nudges across the native drawing variants through validated chart coordinates, Shift×10 stepping, lock/out-of-range no-ops, and one history entry per change.
- [x] TypeScript check/build and Chromium smoke passes keyboard movement for all seven native drawing types plus undo/redo and locked/boundary no-ops; no network writes. Production v5 migration, broader object-management parity and hardware acceptance remain open.
