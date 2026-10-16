# FR-003 native v5 group duplication

## Goal

Duplicate every selected native v5 drawing from the keyboard or adapter API. Preserve the original drawing kinds/options, select the resulting copies together, and keep each copy as an individual undo/redo history entry.

## Implementation

- Validate the entire selection before creating any copy.
- Reuse the established single-drawing duplication path and ID collision checks.
- Route Ctrl+D/Meta+D through the group operation, including the single-selection case.
- Keep the single-object public method for compatibility.
- Do not modify the production v4 dashboard, persistence schema, broker behavior, or trade paths.

## Verification

- [x] Add Chromium API and Ctrl+D tests with selected price-level, time-marker and measurement drawings.
- [x] Observe the expected RED failure: `duplicateSelectedDrawings` is unavailable.
- [x] Verify all copies preserve their drawing kinds/options (including measurements), all copies become selected, and each supports individual undo/redo.
- [x] Run `npm --prefix chart_studio_v5 run check`.
- [x] Run `npm --prefix chart_studio_v5 run build`.
- [x] Run `node scripts/smoke_chart_studio_v5.cjs` including AT-025 capacity evidence.
- [x] Commit and push the change on `main` as `7d942db`.
- [ ] Wait for both GitHub workflows on this exact commit; deploy the clean exact-main revision and verify local/htown runtime identity.

## Limits

This completes only isolated native-v5 group duplication. Production cutover, persistence integration, hardware/touch acceptance and the rest of FR-003 remain open. No broker or MT5 writes and no backtests.
