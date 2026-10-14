# FR-014 v5 Fibonacci levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve per-drawing editable Fibonacci percentage levels in the isolated native v5 renderer, including negative retracements and extensions above 200%.

**Architecture:** Store levels as percentage values on each Fibonacci drawing, using the same bounded, strictly ascending contract as the existing beta profile (1–16 values, −1000% through +1000%). The native primitive converts percentages to ratios only for price projection. Existing drawings without custom levels keep the current default ratios; update, undo/redo, persistence and JSON transfer retain explicit custom values.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1 primitives, Chromium fixture smoke.

---

### Task 1: Add v5 Fibonacci level contracts

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Modify: `chart_studio_v5/src/adapter.ts`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/superpowers/plans/2026-10-14-fr014-v5-fibonacci-levels.md`

- [x] **Step 1: Add failing Chromium contracts** for custom negative/extension levels, default compatibility, update and undo/redo, JSON roundtrip, and invalid count/order/range rejection.
- [x] **Step 2: Run the v5 smoke and confirm expected failures** are caused by ignored custom levels or missing validation.
- [x] **Step 3: Implement bounded validation and normalized options**; reject invalid levels atomically and retain the default level set when `levels` is absent.
- [x] **Step 4: Render from normalized per-drawing levels** and preserve values through snapshots, update, undo/redo, local persistence, and JSON import/export.
- [x] **Step 5: Run the v5 browser smoke, TypeScript check/build, relevant workspace regressions, and `git diff --check`.** The v5 smoke passes; TypeScript check passes; Fibonacci/workspace regression is 24 passed and 105 subtests.
- [x] **Step 6: Update FR-014/FR-003 evidence and commit the verified slice.** Fan, time-zone, trend-based Fibonacci, touch, production cutover and hardware acceptance remain open.
