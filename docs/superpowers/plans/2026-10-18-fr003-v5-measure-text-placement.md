# FR-003 v5 measurement and text placement

## Goal
Expose the existing native measurement and text-annotation objects in the read-only v5 preview.

## Steps
1. [x] Extend the preview contract with two-click MEASURE placement and one-click TEXT placement from a bounded text field; prove the test fails first.
2. [x] Extend adapter state and preview UI, preserving loaded-candle/positive-price validation, Escape cancellation, scoped persistence, and native drawing counts.
3. [x] Run the preview smoke, TypeScript checks/build, drawing regressions, then update FR-003 evidence.
4. [ ] Commit/push on main, wait for code CI, guarded-restart, update htown `/stt`, and verify revision/digest/bundle and GET-only live acceptance. Backtests remain deferred.

## Constraints
Keep the preview optional and read-only, preserve the v4 production chart, and never send broker writes.
