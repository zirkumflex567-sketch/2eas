# FR-003 native v5 chart drawings and text annotations

## Goal

Add real, isolated Lightweight Charts 5.2.1 drawing primitives to the migration fixture: a horizontal price level, a vertical line anchored to an exact loaded UTC candle, and a short text annotation anchored to a loaded candle and price. They have validated identity and can be added, updated and removed without broker access or writes.

## Boundaries

- Keep the production Chart Studio mounted on v4.
- Keep drawing IDs local to this renderer instance and clear them on account changes.
- Persist only drawing geometry/options in browser localStorage when the caller opts in with an explicit account/symbol/timeframe scope; never persist broker/account credentials. Do not add order editing or broker-derived overlays.
- Keep native drawing count capped at 100; do not relax broader AT-025 budgets.

## Delivery and evidence

- [x] Confirm the pinned v5 `ISeriesPrimitive` attach/detach and pane renderer contract against official Lightweight Charts documentation and installed 5.2.1 types.
- [x] Add browser assertions first and observe RED (`addPriceLevel is not a function`).
- [x] Implement native canvas pane renderers, validated price/time add/update/remove APIs, exact loaded-candle validation, account cleanup, and renderer count inspection.
- [x] Implement primitive hit testing, click selection and pointer-capture drag. Price levels track the chart price coordinate; UTC markers snap to loaded candle indices. Escape restores the original anchor.
- [x] Add a bounded 100-entry in-memory undo/redo history for create/update/delete/drag/visibility/lock, with Ctrl/Cmd+Z, Shift+Z, Ctrl/Cmd+Y, Delete/Backspace, Ctrl/Cmd+D, H hide/show and L lock/unlock. Account/history replacement clears the history to prevent replaying stale anchors.
- [x] Cancel an active drag when history/account scope changes, the pointer is cancelled/lost, or the selected drawing is removed; release capture and remove listeners on destroy.
- [x] Add scoped local snapshot persistence with account/symbol/timeframe namespace, reload restoration, conflict detection, fail-closed corrupt/mismatched data handling, and disabled-by-default behavior when scope is omitted; private storage now uses schema v2 while portable transfer remains v1.
- [x] Extend the isolated Chromium fixture with primitive lifecycle, visible rendering, both drag paths, snap, Escape rollback, lock enforcement, visibility, undo/redo, duplicate/delete shortcuts, actual page reload restoration, account/timeframe isolation, storage conflict/corruption handling, and zero non-GET requests.
- [x] Run `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, `node scripts/smoke_chart_studio_v5.cjs`, and `git diff --check`.
- [x] Add portable schema-v1 JSON export/import for price/time lines. Imports require matching symbol/timeframe scope, ready account-scoped storage, an empty drawing canvas, exact fields, loaded candle anchors, bounded size/count, and all-or-nothing validation. Rejected data leaves existing drawings and storage untouched; exports omit account identity.
- [x] Chromium smoke covers transfer across accounts within a matching market scope, malformed-data atomicity, existing-canvas conflict, storage conflict, mismatched symbol scope, and no broker writes.
- [x] Add a bounded native canvas text annotation with validated ASCII text, price/time anchoring, visibility/lock, account cleanup, reload persistence and scoped JSON transfer; Chromium verifies restoration and transfer alongside price/time drawings.
- [x] Extend pointer-capture drag to text annotations so candle and price anchors move together; Escape restores both original anchors. Chromium checks hit testing, movement and rollback.
- [x] Update FR-001/003/005/009/011, AT-006/007, and AT-033 as partial; full-layout migration/merge, full layout transfer, full gesture catalog and hardware acceptance remain open; persistent v5 undo history is covered by [FR-009 plan](2026-10-14-fr009-v5-persistent-undo-history.md).

## Acceptance still required

- [x] Multi-select through the native selection API and object manager, including toggling membership, group visibility/locking, and selected-object operations; `node scripts/smoke_chart_studio_v5.cjs` passed on 20.10.2026.
- [x] Keyboard movement for mixed, multi-anchor selections: arrow keys move one loaded candle or one price-axis pixel, Shift applies the larger step, and locked/out-of-range/history-cap failures reject the whole group without partial mutation. Undo/redo and composite-anchor invariants are covered by the same Chromium smoke.
- [x] Native rectangle and ellipse placement, editing, selection, persistence, transfer and undo/redo are covered by the fixture; ellipse also passed the separate five-demo live-candle smoke on 20.10.2026.
- [ ] Complete full-layout schema migration/merge and full transfer parity against the production Beta.
- [ ] Finish the remaining drawing catalog and indicator/style parity; keep unverified tools/series explicitly unavailable.
- [ ] Run physical touch, Windows DPI/scaling, hardware, full-screen and production-v5 parity acceptance. V4 remains the production renderer until these gates pass.

The isolated capacity contract in the same smoke loaded 5,000 bars, 20 indicator instances and 1,000 drawings; it preserved all 1,000 after reload and enforced its configured limits. Persistent scoped v5 undo/redo is also covered by the [FR-009 plan](2026-10-14-fr009-v5-persistent-undo-history.md). These fixture/contract results do not substitute for hardware acceptance.
