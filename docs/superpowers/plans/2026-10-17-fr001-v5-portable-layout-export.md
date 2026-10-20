# FR-001 Native v5 portable layout export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Export the native v5 renderer's currently persisted drawings and view configuration as a bounded, portable JSON document without account identity, broker state, or credentials.

**Architecture:** Add a schema-versioned export method beside `exportDrawings()` in the v5 adapter. Reuse the existing validated drawing snapshots and `viewSnapshots()` representation so export reflects only renderer state already supported by the private v3 layout schema. Keep the existing drawings-only schema-v1 export/import unchanged for compatibility.

**Tech Stack:** TypeScript, Lightweight Charts v5 adapter, Node/Chromium smoke test.

---

### Task 1: Specify the portable layout envelope

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Test: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add a fixture that exports drawings, managed moving averages, oscillator/pane configuration, pane heights, volume state, timezone, and visible range.
- [x] Assert exact scope binding, no account or broker fields, schema version 2, valid UTF-8 byte limit, and unchanged legacy `exportDrawings()` schema.
- [x] Run the focused fixture and confirm it fails because `exportLayout()` is absent.

### Task 2: Implement the export

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`
- Modify: `static/chart-studio-v5-preview.js`
- Modify: `app.py`
- Test: `scripts/smoke_chart_studio_v5_preview.cjs`
- Generated: `static/chart-studio-v5.js`

- [x] Add `exportLayout()` returning `{schemaVersion:2,symbol,timeframe,drawings,view}` from validated current adapter state.
- [x] Enforce the existing 512 KiB UTF-8 limit and omit account ID, history stacks, position overlays, broker snapshots, and runtime credentials.
- [x] Keep `exportDrawings()` and `importDrawings()` byte-for-byte compatible in behavior.
- [x] Add a private-flag-gated preview download button, disable it until verified candles are loaded, and assert downloaded JSON omits account/position state while v4 remains mounted.
- [x] Run the preview smoke before implementation and observe the expected RED: the export button remained disabled.

### Task 3: Verify and record

**Files:**
- Modify: `chart_studio_v5/README.md`
- Modify: `docs/OPEN_TASKS.md`

- [x] Run TypeScript check/build and the complete `scripts/smoke_chart_studio_v5.cjs` fixture.
- [x] Record this as portable export support only; import/merge, production migration, target hardware, and production v5 cutover remain open.
- [x] Run `git diff --check` and inspect the final diff.

### Follow-up: portable import, merge, and replace verification (20 October 2026)

- [x] Import schema-v2 layouts into the isolated preview after strict symbol/timeframe, account-field, 512-KiB, view-state, and drawing-anchor validation.
- [x] Merge drawings and indicators with collision-free IDs, append imported panes before the shared volume pane, and retain the destination view range/timezone.
- [x] Require confirmation for replace; reject mismatched or malformed imports without partial mutation; restore the previous rendered layout if applying a valid import fails.
- [x] Verify these contracts with `node scripts/smoke_chart_studio_v5_preview.cjs` on Main `ef3702bf94f79a21dbdbdf7e559093c88cd0dc6c` (20 October 2026). The smoke passed with 150 verified demo candles, v4 still mounted, zero mutations, and no browser errors.

Production migration/cutover, cross-user conflict resolution, and target-hardware acceptance remain open.
