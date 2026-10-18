# Native v5 multi-select keyboard movement plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users move every selected native v5 drawing by keyboard while preserving drawing anchors, lock rules, bounds, persistence and undo/redo.

**Architecture:** Extend the existing selected-drawing nudge path in the v5 adapter. Precompute candidate snapshots for the full selection and reject a movement before changing anything if any selected drawing is locked or any applicable anchor would leave the loaded candle/price domain. Commit changed snapshots in the existing per-drawing history format so persisted schema-v5 history remains backward-compatible; each drawing change remains one history step, matching current multi-delete semantics. Drawings unaffected by the requested axis add no history entry. Since persisted history is capped at 100 entries, reject selections requiring more than 100 history entries before mutation; for accepted moves, trim only older entries so every member of the new group remains undoable. Apply all snapshots, selection and history as one in-memory transaction; make one persistence attempt and roll the group back in memory if it reports failure, retaining the resulting persistence status. When persistence is disabled by scope, keep the existing in-memory-only behavior.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1, Playwright Chromium smoke.

---

### Task 1: Specify group-nudge behavior

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add a failing browser contract that selects two drawings, nudges them together on the time axis, verifies both anchors move by the same candle count, and undoes/redoes each resulting history entry.
- [x] Add failing atomicity contracts for a locked member and an out-of-range member; neither selection may be partially moved.
- [x] Add a failing contract for a scoped storage write failure; all drawings, selection and undo/redo history remain as before the attempted nudge, and the persistence status reports the failure.
- [x] Add a failing contract proving a selection above the 100-entry history capacity is rejected without changing any drawing.
- [x] Run `node scripts/smoke_chart_studio_v5.cjs`; the group-movement assertion failed before implementation, then the suite passed after implementation.

### Task 2: Implement bounded multi-select movement

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`

- [x] Build and validate a candidate snapshot for every selected drawing before mutating chart state. Time arrows shift all time anchors by the same loaded-bar delta; vertical arrows shift price anchors by the same pixel delta. PRICE-only drawings ignore time movement, TIME-only drawings ignore price movement.
- [x] Reject the whole operation if a selected drawing is locked, a time anchor would leave loaded history, or a price transform is unavailable/invalid.
- [x] Apply all changed snapshots transactionally, retain the selection, append bounded per-drawing undo entries without evicting entries from the new group, and persist once after the operation. Roll back drawings and history if any apply or the persistence attempt fails; preserve the resulting persistence status.
- [x] Keep single-selection behavior and ignore keyboard events originating in form controls.

### Task 3: Verify and record

**Files:**
- Modify: `docs/OPEN_TASKS.md`
- Modify: this plan

- [x] Run the native v5 Chromium smoke, TypeScript check/build and `git diff --check`.
- [x] Update FR-003 and AT-006/007 only for the tested interaction; retain the separate production-v4, full-layout and hardware gaps.
- [ ] Request independent review, commit/push on `main`, wait for both Main CI workflows, guarded-restart the local runtime if required, and verify local plus htown `/stt` identity and four safe demo feeds. No backtest, Blueberry request or broker mutation.
