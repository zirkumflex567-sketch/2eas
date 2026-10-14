# FR-015 native v5 parallel channel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an isolated native v5 parallel-channel drawing with three exact loaded-candle/price anchors, editing, persistence, transfer, and bounded undo/redo.

**Architecture:** Extend the existing native drawing model with a `CHANNEL` snapshot whose three anchors define the baseline endpoints and a third point on the parallel boundary. Render both parallel lines and a center guide using the same pixel-space geometry contract as `ChartStudioDrawingGeometry.parallelChannel`; the third anchor determines the offset. Preserve its vertical-baseline case and reject only identical baseline points or a zero-width channel. New anchors must snap to loaded candles, while scoped storage and undo snapshots retain valid UTC/price anchors even when their candles are outside the currently loaded window; drawing coordinates are recomputed when data becomes available and stored anchors are never rewritten by viewport changes. Reuse existing account/symbol/timeframe storage schema v2, portable schema v1, pointer-capture, keyboard-nudge, and fail-closed validation paths. Keep the production renderer on v4.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1 series primitives, Playwright Chromium smoke.

---

### Task 1: Channel behavior contract

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Reference: `static/chart-studio-drawing-geometry.js` (`parallelChannel`)

- [x] Test add/update/remove validation, exact three-anchor geometry, visible parallel lines and center guide.
- [x] Test each anchor drag, opposite anchors unchanged, Escape rollback, lock rejection, keyboard nudge, undo/redo and loaded-candle boundaries.
- [x] Test scoped reload with channel anchors outside loaded bars, portable JSON v1 roundtrip, malformed/missing-anchor atomic rejection, account/timeframe isolation and shared 100-drawing cap.
- [x] Run Chromium smoke and observe RED because `addChannel` is absent.

### Task 2: Channel model and rendering

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`

- [x] Add strict `ChannelOptions` with baseline start/end and offset time/price; require three valid loaded candle anchors for creation/edit, permit a vertical baseline with distinct points, and require a nonzero screen-space offset.
- [x] Add a native primitive that draws the baseline, translated parallel boundary and dashed midpoint; hit-test the visible boundaries and select three 12-pixel anchor handles.
- [x] Add add/update/remove/read/position APIs, pointer/touch drag with per-anchor Escape rollback, and all-axis keyboard nudging.
- [x] Include channel snapshots in exact schema-v2 validation, persistence, history replay and portable schema-v1 import/export. Validate stored UTC/price structure without requiring current candle coverage; preserve account identity omission in export.
- [x] Keep all drawing kinds under the shared 100-object bound and preserve fail-closed restoration.

### Task 3: Evidence and verification

**Files:**
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/CHART_STUDIO_V5_RFC.md`
- Modify: `chart_studio_v5/README.md`
- Modify: this plan

- [x] Record channel behavior as an isolated v5 renderer proof; keep production-v4 parity and device acceptance open.
- [x] Run TypeScript check/build, complete v5 Chromium smoke, and `git diff --check`.
- [x] Commit the verified files only; exclude generated output and dependency folders.
