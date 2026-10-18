# FR-003 v5 channel placement

## Goal
Expose the native three-anchor parallel channel as a direct drawing tool in the read-only v5 preview.

## Steps
1. [x] Add a failing browser contract for three distinct loaded candle anchors, a nonzero channel offset, native readback/count, export and cancellation.
2. [x] Extend adapter placement state to support a third anchor and add a responsive preview control with phase-specific prompts.
3. [x] Run preview, chart-drawing, TypeScript and Beta regressions; update FR-003 status.
4. [ ] Commit/push main, wait for CI, restart guarded runtime, synchronize htown `/stt`, and verify hashes and four-demo GET-only live rendering. Backtests remain deferred.

## Constraints
The channel must be rejected if its offset collapses onto the baseline. Keep v4 mounted and broker access read-only.
