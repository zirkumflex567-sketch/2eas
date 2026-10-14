# Native v5 Measurement Drawing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native two-anchor measurement drawing to the isolated v5 adapter with exact UTC/price anchors, visible price/percent/bar readout, bounded persistence/transfer, and undo/redo.

**Architecture:** Follow the adapter's existing native primitive and `DrawingSnapshot` patterns. Measurement is a drawing with two loaded-candle anchors; it displays price delta, percent change, and timeframe bar count only, never monetary P/L. Account/symbol/timeframe isolation, import validation, shared drawing limits, and rollback must include the new kind.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1, Playwright Chromium smoke.

---

### Task 1: Measurement contract and RED smoke

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Modify: `docs/superpowers/plans/2026-10-14-fr003-v5-measurement.md`

- [x] Add Chromium coverage for rendered label text, exact signed readout, invalid-anchor atomic count, create/update/remove and undo/redo, private reload, cross-account portable transfer, mismatched scope rejection, pointer endpoint drag with opposite-anchor preservation, pointer undo/redo and Escape rollback, keyboard nudging with undo/redo, mixed 999-trend-plus-one-measurement capacity, and no-write accounting. The mismatch fixture destroys its chart and host in `finally`.
- [x] Run the RED contract before implementation; it failed because `addMeasurement` was missing.

### Task 2: Native v5 measurement lifecycle

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`
- Modify: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add `MeasurementOptions` and a native primitive with line, selected endpoint handles and a price/percent/bar readout.
- [x] Integrate create/update/remove/read, pointer anchor editing, keyboard nudging, Escape rollback, undo/redo, strict private snapshots and portable JSON. Both endpoints must be loaded UTC candles and the shared 1,000 drawing limit applies. Private storage keys and snapshot envelopes retain account/symbol/timeframe; transfer JSON keeps symbol/timeframe but omits account/history.
- [x] Run v5 typecheck/build and the full Chromium smoke; the first expanded run exposed an obsolete 3-object capacity readback assertion, corrected to account for the fourth measurement result. The full smoke now passes.

### Task 3: Requirement ledger and review

**Files:**
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/CHART_STUDIO_V5_RFC.md`

- [x] Record the isolated v5 measurement evidence while keeping production parity, physical touch/DPI and hardware acceptance open.
- [x] Independent spec and code review completed; import rollback cleanup and 1,001-limit atomicity evidence were fixed and re-reviewed. Production wiring, physical touch/DPI and hardware acceptance remain open.

**Verification commands:** `npm --prefix chart_studio_v5 run check`; `npm --prefix chart_studio_v5 run build`; `node scripts/smoke_chart_studio_v5.cjs`; `git diff --check`.

**Safety boundary:** This is renderer-only. Do not change production dashboard routing, MT5 access, EA files, broker write paths, Strategy Tester, or deployment behavior.
