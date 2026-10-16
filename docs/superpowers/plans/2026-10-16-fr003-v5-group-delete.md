# FR-003 native v5 group delete implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkboxes.

**Goal:** Make Delete/Backspace remove every selected native drawing, while retaining the existing single-selection behavior and per-drawing undo/redo.

**Architecture:** Add a validated `deleteSelectedDrawings()` adapter operation that snapshots the current selection before removal, dispatches to each drawing type's existing remover, returns removed IDs, and leaves selection empty. Route keyboard Delete/Backspace through the same operation. Keep each removed drawing as its own existing history entry so the current persisted history schema remains unchanged.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1, existing Chromium contract smoke.

## Task 1: Group-delete contract and implementation

**Files:** `scripts/smoke_chart_studio_v5.cjs`, `chart_studio_v5/src/adapter.ts`, `docs/OPEN_TASKS.md`, this plan.

- [x] Add a failing Chromium assertion for deleting a two-object selection from the keyboard and via the public API; confirm both drawings disappear, selection clears, undo restores them individually, and redo deletes them again.
- [x] Run the focused v5 smoke and observe failure because `deleteSelectedDrawings` is unavailable and Delete only targets the primary ID.
- [x] Implement validated multi-delete using existing per-kind removers; update Delete/Backspace to remove the complete current selection.
- [x] Run TypeScript check/build and complete v5 Chromium smoke; `git diff --check` passed after docs edits.
- [x] Update FR-003/AT-006 evidence without claiming production v5 migration or hardware acceptance.
- [x] Commit and push on `main`; htown was fast-forwarded and local runtime identity verified for commit `45d2261`. CI for that commit is tracked separately and still running as of 16 October 2026.

**Limits:** Does not change v4 production controls, broker behavior, drawing formats, Strategy Tester, or the protected account.
