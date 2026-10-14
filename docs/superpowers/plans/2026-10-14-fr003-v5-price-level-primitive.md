# FR-003 native v5 horizontal price-level primitive

## Goal

Add real, isolated Lightweight Charts 5.2.1 drawing primitives to the migration fixture: a horizontal price level and a vertical line anchored to an exact loaded UTC candle. Both have validated identity and can be added, updated and removed without broker access or writes.

## Boundaries

- Keep the production Chart Studio mounted on v4.
- Keep drawing IDs local to this renderer instance and clear them on account changes.
- Do not add persistence, order editing or broker-derived overlays in this slice.
- Keep native drawing count capped at 100; do not relax broader AT-025 budgets.

## Delivery and evidence

- [x] Confirm the pinned v5 `ISeriesPrimitive` attach/detach and pane renderer contract against official Lightweight Charts documentation and installed 5.2.1 types.
- [x] Add browser assertions first and observe RED (`addPriceLevel is not a function`).
- [x] Implement native canvas pane renderers, validated price/time add/update/remove APIs, exact loaded-candle validation, account cleanup, and renderer count inspection.
- [x] Implement primitive hit testing, click selection and pointer-capture drag. Price levels track the chart price coordinate; UTC markers snap to loaded candle indices. Escape restores the original anchor.
- [x] Add a bounded 100-entry in-memory undo/redo history for create/update/delete/drag/visibility/lock, with Ctrl/Cmd+Z, Shift+Z, Ctrl/Cmd+Y, Delete/Backspace, Ctrl/Cmd+D, H hide/show and L lock/unlock. Account/history replacement clears the history to prevent replaying stale anchors.
- [x] Cancel an active drag when history/account scope changes, the pointer is cancelled/lost, or the selected drawing is removed; release capture and remove listeners on destroy.
- [x] Extend the isolated Chromium fixture with primitive lifecycle, visible rendering, both drag paths, snap, Escape rollback, lock enforcement, visibility, undo/redo, duplicate/delete shortcuts, and zero non-GET requests.
- [x] Run `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, `node scripts/smoke_chart_studio_v5.cjs`, and `git diff --check`.
- [x] Update FR-003/005/009/011 as partial; persistent drawings, full gesture catalog and hardware acceptance remain open.

## Acceptance still required

Multi-select, keyboard movement, reload persistence/import, other drawing types and annotations, touch/DPI acceptance, full drawing catalog and production v5 parity require separate slices and full acceptance tests.
