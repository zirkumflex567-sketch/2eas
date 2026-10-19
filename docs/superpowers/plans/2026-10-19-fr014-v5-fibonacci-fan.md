# FR-014 Native v5 Fibonacci Fan

## Goal

Add the existing Beta Fibonacci Fan to the isolated native-v5 preview with matching two-anchor behavior, account/symbol/timeframe scoped persistence, object management and portable transfer. Production v4 remains active and v5 stays opt-in.

## Contract

- Two distinct loaded time/price anchors define a fan with default ratios 0.382, 0.5 and 0.618. Each ray starts at anchor A and passes through the corresponding interpolated price at anchor B, then extends in the direction of B to the pane edge.
- Custom ratios are finite, strictly increasing and inside (0,1), with at most 16 entries. Invalid construction/update/import is rejected before mutation.
- Fan drawings support select, visible/locked state, anchor dragging, undo/redo, duplicate/delete, the 1,000 drawing cap, scoped persistence, schema-v2 portable transfer and account/symbol/timeframe isolation.
- The feature uses no broker route/write and does not change the production v4 chart or enable the v5 production flag.

## Work

- [x] Add failing native API and preview contracts for geometry, ratio validation, placement, editing, manager actions and scoped transfer.
- [x] Implement the fan primitive and drawing API, including geometry readback and selected anchor handles.
- [x] Integrate the opt-in preview tool button and all drawing lifecycle/import/export paths.
- [x] Run TypeScript checks/build, native API/preview smokes and a manual diff review.
- [ ] Run the Python preview-gate regression when the MT5 Python dependency is available (current shell lacks `MetaTrader5`).
- [ ] Update `OPEN_TASKS.md`, commit to `main`, push and verify local/hTown runtime identity; leave production/touch/DPI/hardware gates open.

## Verification

- `npm run check`, `npm run build`, and `npm run build:production` pass.
- `node scripts/smoke_chart_studio_v5.cjs` passes geometry, invalid-ratio rejection, edit/undo/redo, visibility/lock, duplicate/delete, 1,000-object persistence and zero-write adapter checks.
- `node scripts/smoke_chart_studio_v5_preview.cjs` passes two-anchor placement, object-manager visibility/lock/duplicate/delete, portable schema-v2 transfer/import, and zero-mutation browser checks.
- Production v4 remains the default; no terminal or broker routes are used.
