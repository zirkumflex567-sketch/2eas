# FR-014 Fibonacci Fan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usable, persisted two-anchor Fibonacci Fan tool to the live Chart Studio Beta without broker access or writes.

**Architecture:** Add a pure geometry helper that projects 38.2%, 50%, and 61.8% rays from the first chart anchor through interpolated price points at the second anchor, clipped to the visible chart boundary. Register the drawing kind in the existing Beta tool palette, drawing validator, renderer, object manager, account-scoped persistence, and portable layout flow; leave native-v5 preview gated and report its fan parity separately.

**Tech Stack:** Browser JavaScript, pure geometry contract tests, Playwright/Chromium Chart Studio Beta smoke.

---

### Task 1: Specify ray geometry and drawing validation

**Files:**
- Modify: `scripts/test_chart_studio_drawings.cjs`
- Modify: `static/chart-studio-drawing-geometry.js`

- [x] Add failing assertions for the `fibfan` two-anchor drawing, default ratios, clipped projected coordinates, and rejection of duplicate/out-of-range ratios.
- [x] Run `node scripts/test_chart_studio_drawings.cjs`; confirmed it failed because `fibfan` was an unknown drawing kind.
- [x] Implement `fibonacciFanRays` using the existing ray clipper and verify the geometry contract passes.

### Task 2: Integrate the Beta tool

**Files:**
- Modify: `static/chart-studio-beta.js`
- Modify: `static/chart-studio-object-manager.js`
- Modify: `scripts/smoke_chart_studio_beta.cjs`

- [x] Register the tool in the toolbar, favorites, custom shortcut preferences, validator, and drawing renderer.
- [x] Add Chromium coverage for on-chart rendering, scoped local persistence, undo/redo, account reload, and account-free portable export/import.
- [x] Keep all behavior read-only; no broker API is involved.

### Task 3: Verify and record partial FR-014 status

**Files:**
- Modify: `docs/OPEN_TASKS.md`

- [x] Run drawing geometry and full Chart Studio Beta Chromium suites, JavaScript syntax checks, and `git diff --check`.
- [x] Record that Time-Zones, Trend-Based-Fibo, styles, native-v5 parity, touch, and production/hardware acceptance remain open.
