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
- [x] `7d942db` is included in `main`; both required GitHub workflows succeeded on current `f64d379` (`39009248466`, `39009248518`). Local and htown runtime report the same `f64d379d7da47de6269084ff026c2835cce4f432` revision and application digest `a839388c9bde125ca4e5dd5f6beaeffe3a76fdf67c28024f0cfd764a32fa491d`; `restart_required=false`, htown is clean on `main`. The isolated v5 bundle is served with identical SHA-256 locally and on htown. Production v4, persistence integration, target hardware/touch and remaining FR-003 acceptance remain open.

## Limits

This completes only isolated native-v5 group duplication. Production cutover, persistence integration, hardware/touch acceptance and the rest of FR-003 remain open. No broker or MT5 writes and no backtests.
