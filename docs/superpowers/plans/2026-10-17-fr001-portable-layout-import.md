# FR-001 Portable Layout Import and Merge Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import schema-v2 portable v5 layouts into the active account-scoped chart and merge compatible drawings and view state without losing the existing layout on validation or storage failure.

**Architecture:** Validate the bounded, exact schema-v2 envelope and symbol/timeframe before touching scoped storage. Use the adapter's existing strict schema-v3 hydration in an isolated validation document with in-memory storage, then atomically save the account-bound schema-v3 snapshot, remount the renderer, and restore the previous local snapshot if hydration fails. Replace mode requires explicit confirmation in the UI; merge mode remaps conflicting object IDs and offsets imported indicator panes while retaining the destination timezone and visible range. Broker positions, account identifiers from the file, credentials, and undo history are never imported.

**Tech Stack:** TypeScript adapter, browser preview controller, HTML file input, Playwright Chromium smoke.

---

### Task 1: Import contract and fail-closed validation

**Files:**
- Modify: `scripts/smoke_chart_studio_v5_preview.cjs`
- Modify: `static/chart-studio-v5-preview.js`

- [x] Test valid scope import, malformed envelope, symbol/timeframe mismatch, size limit, and preservation of current state on rejection.
- [x] Test replace confirmation and account-local persistence after renderer remount.
- [x] Test merge behavior with colliding drawing/indicator IDs and appended panes.

### Task 2: Safe preview-only import and merge

**Files:**
- Modify: `app.py`
- Modify: `static/chart-studio-v5-preview.js`
- Modify: `chart_studio_v5/src/adapter.ts` only if a minimal adapter contract is required
- Generated: `static/chart-studio-v5.js` only if adapter behavior changes

- [x] Add an import file control gated by the existing private v5 preview flag and verified candle availability.
- [x] Validate imported schema-v2 JSON and adapt it to the strict account-bound schema-v3 store.
- [x] Validate candidates in isolated in-memory storage before mutating the active scope.
- [x] Implement replace confirmation and lossless rollback if storage or hydration fails.
- [x] Merge imported drawings and indicators, remapping IDs and pane indices; retain destination range/timezone and reject limit conflicts atomically.

### Task 3: Verify and document

**Files:**
- Modify: `scripts/smoke_chart_studio_v5_preview.cjs`
- Modify: `chart_studio_v5/README.md`
- Modify: `docs/OPEN_TASKS.md`

- [x] Run the preview Chromium smoke and adapter Chromium smoke.
- [x] Verify rejected files do not change the saved layout and imported files cannot change broker data or Blueberry state.
- [x] Run TypeScript, Python, and diff checks; record only the functionality verified here.
