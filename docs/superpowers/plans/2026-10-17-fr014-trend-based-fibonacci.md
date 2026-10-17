# FR-014 Trend-Based Fibonacci Implementation Plan

> **For agentic workers:** Use `executing-plans` and `test-driven-development`; work through the tasks in order.

**Goal:** Add a usable, persistent three-anchor Trend-Based Fibonacci extension to Chart Studio Beta.

**Architecture:** Three distinct candle-time anchors define an impulse (A→B) and retracement origin (C). The renderer projects horizontal price levels from C by the signed A→B price displacement at bounded ratios 0, 38.2, 50, 61.8, 100, 161.8, and 261.8 percent. The geometry is pure, clipped to the chart pane, account/symbol/timeframe scoped through the existing drawing store, and never accesses broker data.

**Acceptance:** Node geometry tests cover anchor validation, up/down impulses, ratios, price coordinates, and clipping. Chromium verifies the three-click tool flow, rendered output, same-candle rejection, persistence, undo/redo, account isolation, and portable layout transfer. Existing drawing and Beta suites remain green. `OPEN_TASKS.md` must continue to mark the broader FR-014 requirement partial.

### Task 1: Geometry and validation contracts

- [x] Add failing three-anchor `fibtrend` contracts and projection calculations.
- [x] Run the focused Node contract and record RED (`expected 3 anchors, implementation returned 0`).
- [x] Implement bounded projection geometry and validation; verify GREEN.

### Task 2: Beta interaction, rendering and portable persistence

- [x] Register tool/count/labels/favorites/shortcuts and render projected levels.
- [x] Reject anchors on the same candle; preserve distinct anchors during edits.
- [x] Extend Chromium smoke for three-click rendering, persistence, undo/redo, scope reload, and portable import/export.
- [x] Review finding fixed: when anchor C scrolls left of the pane, clip horizontal levels to x=0; verify C beyond the right edge yields no levels.
- [x] Add Chromium coverage proving the edit interaction cannot merge two of the three anchors.

### Task 3: Verification and ledger

- [x] Run geometry, all drawing/Beta browser smokes, syntax checks, and `git diff --check`.
- [x] Obtain an independent code review and resolve findings (left-of-pane clipping fixed; re-review no findings).
- [ ] Update FR-014 evidence while retaining open style, native-v5, touch, and hardware/production gaps.
- [ ] Commit and push only the exact changed paths to `main`; wait for CI and deploy through guarded runtime.
