# AT-006 ten native v5 drawings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify ten native v5 drawing objects retain their exact data after reload and stay isolated across account and timeframe changes.

**Architecture:** Extend the existing isolated v5 Chromium fixture with two additional independently anchored objects so it exercises ten drawings together. Verify exact options after browser reload and JSON export/import, plus zero drawings for another account/timeframe. This strengthens only the native adapter evidence; production renderer parity remains open.

**Tech Stack:** Chromium browser smoke, native Lightweight Charts v5 adapter, localStorage scope.

---

### Task 1: Extend drawing persistence acceptance

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/superpowers/plans/2026-10-14-at006-v5-ten-drawings.md`

- [x] **Step 1: Add two more native drawings and exact post-reload/scope/transfer assertions** to the existing fixture contract.
- [x] **Step 2: Run the v5 smoke and verify the ten-object case.** The Chromium smoke passes with ten objects restored and account/timeframe scope separated.
- [x] **Step 3: Update AT-006 evidence and run `git diff --check`.**
- [x] **Step 4: Commit the verified acceptance slice.** Production drawing migration and hardware acceptance remain open.
