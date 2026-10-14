# FR-003 native v5 trend-line handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag either anchor of a selected native v5 trend line, cancel safely with Escape, and undo or redo the completed gesture as one change.

**Architecture:** Extend the adapter's central pointer state to recognize a trend endpoint using public time/price coordinates. During drag, snap time to the nearest loaded candle and map price through the native series; the untouched endpoint remains exact. Intermediate updates are transient, while pointer-up records one history change and Escape restores the original options.

**Tech Stack:** TypeScript, Lightweight Charts v5 public coordinate APIs, Chromium pointer smoke.

---

### Task 1: Drag native trend anchors

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Modify: `chart_studio_v5/src/adapter.ts`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/superpowers/plans/2026-10-14-fr003-v5-trend-handles.md`

- [x] **Step 1: Add failing Chromium contracts** for dragging both anchors, preserving the opposite endpoint, one-step undo/redo, Escape rollback, and locked rejection.
- [x] **Step 2: Run the smoke and confirm anchor pointer drag is not implemented.** The test failed because the start anchor stayed unchanged.
- [x] **Step 3: Add endpoint hit/drag handling** with loaded-candle snapping, transient updates, and a single history record at commit.
- [x] **Step 4: Run the v5 Chromium smoke, TypeScript check/build and `git diff --check`.** All passed.
- [x] **Step 5: Commit the implementation and FR-003 evidence.** Rectangle/Fibonacci grips, mobile, production cutover and hardware acceptance remain open.
