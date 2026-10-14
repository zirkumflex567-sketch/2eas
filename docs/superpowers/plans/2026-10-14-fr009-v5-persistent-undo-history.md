# FR-009 native v5 persistent drawing history

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve the bounded native v5 drawing undo/redo stack across reloads for the opted-in account/symbol/timeframe scope.

**Architecture:** Upgrade only the private browser-storage envelope to schema v2, retaining the existing drawing payload and adding bounded undo/redo entries. The exact envelope keys are `schemaVersion`, `account`, `symbol`, `timeframe`, `drawings`, `undoStack`, and `redoStack`. Each history entry has exactly `{id,before,after}`, where snapshots are `null` or the same strict `{kind,options}` drawing snapshot shape used by persistence; `options.id` must equal the entry id. Each stack is stored in push order, so its final element is the next entry popped/replayed. Validate every restored history snapshot against the same strict drawing schemas and currently loaded candles before accepting any of it. A v2 drawing payload plus malformed history is rejected atomically: restore no drawings, preserve the original storage bytes, and report `UNAVAILABLE`. Migrate valid schema-v1 snapshots to v2 with empty history; keep portable schema-v1 JSON transfer unchanged and assert it has no history fields.

**Size policy:** Keep the 64 KiB serialized-envelope limit. If history makes a write exceed it, deterministically remove oldest undo entries first, then oldest redo entries, rechecking after each removal. This preserves current drawings and the most recent history available for replay. If the drawing-only envelope still exceeds the limit, retain `SNAPSHOT_TOO_LARGE` / `UNAVAILABLE` behavior.

**Tech Stack:** TypeScript, browser storage, Lightweight Charts 5.2.1, Playwright Chromium smoke.

---

### Task 1: Reload history contract

**Files:**
- Modify: scripts/smoke_chart_studio_v5.cjs

- [x] Add scoped persistence contracts for edit→reload→undo→redo, multiple undo/redo ordering, create/delete entries with null snapshots, and history whose anchors become unavailable after `setCandles`.
- [x] Verify the portable JSON transfer envelope remains schema v1 and contains no undo/redo state.
- [x] Run the smoke and confirm the edit could not be undone after reload before implementing the feature.

### Task 2: Bounded schema-v2 history

**Files:**
- Modify: chart_studio_v5/src/adapter.ts

- [x] Validate, copy and restore schema-v2 undo/redo entries atomically alongside drawing snapshots; enforce exact keys, stack limits, entry identity, snapshot validity, loaded anchors, and total combined history cap of 100.
- [x] Persist history in the same scoped envelope with the current 64 KiB storage limit; verify deterministic oldest-entry trimming while preserving current drawings.
- [x] Migrate valid schema-v1 storage to schema v2 with empty history and verify the rewrite; reject malformed history fail-closed without partially restoring drawings or altering the stored bytes.
- [x] Verify reload Undo/Redo, ordering, create/delete null snapshots, stale anchors after `setCandles`, oversized history, malformed-history rejection, v1 migration and storage-write failure in Chromium.

### Task 3: Requirement ledger and verification

**Files:**
- Modify: docs/OPEN_TASKS.md
- Modify: docs/CHART_STUDIO_V5_RFC.md
- Modify: chart_studio_v5/README.md
- Modify: docs/superpowers/plans/2026-10-14-fr003-v5-price-level-primitive.md
- Modify: this plan

- [x] Record the v5-only persistence evidence and keep full production layout migration/merge open; update FR-009 / AT-007 status without claiming production parity.
- [x] Run TypeScript check/build, the complete v5 Chromium smoke and git diff --check.
- [x] Commit the verified slice without generated output or dependency folders.
