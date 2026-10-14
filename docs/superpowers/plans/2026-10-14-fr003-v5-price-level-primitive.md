# FR-003 native v5 horizontal price-level primitive

## Goal

Add one real, isolated Lightweight Charts 5.2.1 drawing primitive to the migration fixture. The primitive is a horizontal price level with validated identity, price and color; it can be added, updated and removed without broker access or writes.

## Boundaries

- Keep the production Chart Studio mounted on v4.
- Keep drawing IDs local to this renderer instance and clear them on account changes.
- Do not add pointer interaction, persistence, order editing or broker-derived overlays in this slice.
- Keep native drawing count capped at 100; do not relax broader AT-025 budgets.

## Delivery and evidence

- [x] Confirm the pinned v5 `ISeriesPrimitive` attach/detach and pane renderer contract against official Lightweight Charts documentation and installed 5.2.1 types.
- [x] Add browser assertions first and observe RED (`addPriceLevel is not a function`).
- [x] Implement a native canvas pane renderer, validated add/update/remove API, account cleanup, and renderer count inspection.
- [x] Extend the isolated Chromium fixture with primitive lifecycle and visible-render-path coverage; assert zero non-GET requests.
- [x] Run `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, `node scripts/smoke_chart_studio_v5.cjs`, and `git diff --check`.
- [x] Update FR-003/005/011 as partial; FR-003 gesture, object persistence and hardware acceptance remain open.

## Acceptance still required

Pointer capture, hit testing, snap/lock, select/multi-select, undo/redo, persistence/import, time-anchored geometry, touch/DPI acceptance, full drawing catalog and production v5 parity require separate slices and full acceptance tests.
