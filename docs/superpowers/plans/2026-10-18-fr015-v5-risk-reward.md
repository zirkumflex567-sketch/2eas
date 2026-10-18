# FR-015 native v5 risk/reward drawing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable native v5 long/short risk/reward drawing that shows the entry, stop, target, and derived reward-to-risk ratio.

**Architecture:** Add a strict three-anchor drawing to the isolated v5 adapter. Render separate translucent stop and target zones plus an entry guide and derived ratio label. Include it in scoped persistence, undo/redo, duplicate/delete, and portable layouts. Upgrade local profile schema v4 to v5 while preserving the prior versioned recovery key; keep the production v4 chart unchanged.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1 primitives, Chromium UI smoke.

---

### Task 1: Behavior contract

**Files:** `scripts/smoke_chart_studio_v5_preview.cjs`

- [x] Test three-click placement and valid long-side entry/stop/target ordering.
- [x] Assert the displayed/read ratio is derived from prices and portable export excludes the derived value.
- [x] Assert layout import/replace preserves the drawing and profile v4 migration retains its recovery copy.
- [x] Run Chromium and observe RED because the risk/reward tool is unavailable.

### Task 2: Native drawing and lifecycle

**Files:** `chart_studio_v5/src/adapter.ts`, `static/chart-studio-v5-preview.js`, `app.py`

- [x] Add strict long/short validation, dual risk/reward zones, entry guide, ratio label, hit testing, and selected handles.
- [x] Add three-anchor UI placement, dragging, keyboard nudging, selection, visibility/lock, delete, duplicate, undo/redo, and 1,000-object accounting.
- [x] Include the drawing in schema-v5 persistence, migration, portable layout import/export, and rollback-safe restore.
- [x] Keep native v5 opt-in and production v4 mounted.

### Task 3: Verification and status

**Files:** `scripts/smoke_live_v5_risk_reward.cjs`, `docs/OPEN_TASKS.md`, this plan.

- [x] Run TypeScript check/build and Chromium preview smoke, including schema-v4 recovery-copy migration.
- [x] Run full v5 regression and all relevant app tests.
- [x] Exercise long and short placement on live, verified MT5 charts for all five demos; verify derived R:R, portable export, v4 remains mounted, and the browser sends GET only.
- [x] Pass both Main CI workflows (`39152840637`, `39152840621`; both successful on `29b68eb`).
- [ ] Keep production-v4 parity, target hardware, and touch/DPI acceptance open.
