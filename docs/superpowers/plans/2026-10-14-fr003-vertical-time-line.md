# FR-003 vertical time line

## Goal

Add a persistent, single-anchor vertical time line to the existing read-only drawing tools.

## Scope

- Extend browser drawing validation/rendering and the toolbar with a vertical time line.
- Extend strict SQLite workspace validation while keeping the schema version and all previous layouts backward compatible.
- Cover the drawing in Chromium and workspace API tests. No broker interaction or v5 claim.

## Steps

- [x] Add failing geometry, persistence, and browser drawing tests.
- [x] Implement the single-anchor `vertical` drawing across client and server validators, renderer, toolbar, and object manager.
- [x] Run focused browser and workspace regressions plus syntax/diff checks and independent review.
- [x] Update FR-003 and `CHART_STUDIO_TASKS.md`; preserve remaining annotation, v5, and hardware gaps.
