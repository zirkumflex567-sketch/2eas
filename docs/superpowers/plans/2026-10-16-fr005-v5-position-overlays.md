# FR-005 Native v5 read-only position overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give the isolated native v5 adapter a scope-checked, read-only interface for drawing verified broker position entry, stop-loss and take-profit levels.

**Architecture:** The adapter accepts a complete `MT5_VERIFIED` snapshot from its caller and never fetches broker data. It validates account, symbol and timeframe against the renderer instance before creating native v5 price lines. Replacement is atomic, scope/account changes and destroy clear all prior broker-derived lines, and the existing v4 production dashboard remains untouched.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1, Playwright Chromium smoke.

---

### Task 1: Define the read-only overlay contract and RED smoke

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`
- Modify: `docs/superpowers/plans/2026-10-16-fr005-v5-position-overlays.md`

- [x] Add Chromium assertions for BUY/SELL entry, SL and TP lines from an explicitly scoped `MT5_VERIFIED`, `canExecute=false` snapshot.
- [x] Verify wrong account/symbol/timeframe are rejected and clear stale lines; invalid same-scope source/prices and duplicate tickets are rejected atomically without replacing the prior snapshot.
- [x] Verify omitted SL/TP levels are not fabricated, overlay replacement removes old price lines, and `changeAccount`/`destroy` clear them.
- [x] Verify overlays do not enter drawing persistence/JSON transfer and no non-GET request is issued.
- [x] Run the fixture and observe RED because the v5 adapter lacks `setPositionOverlays`.

### Task 2: Implement bounded native position price lines

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`
- Modify: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add strict types and validation for at most 500 unique position tickets, BUY/SELL side, exact renderer scope, positive finite entry/optional SL/TP prices, source `MT5_VERIFIED`, and `canExecute=false`.
- [x] Create native v5 price lines with distinct Entry/SL/TP labels and stable side/role styling. Keep these lines separate from user drawings and their undo/persistence/transfer schema.
- [x] Validate the complete candidate before changing the renderer; if native line creation fails, remove only the new candidate and retain the previous snapshot.
- [x] Clear position lines before account change and during renderer destroy. Expose a read-only count/readback for contract inspection, not broker mutation.
- [x] Run the expanded Chromium smoke and verify visible native lines plus fail-closed scope and cleanup behavior.

### Task 3: Verify and record boundaries

**Files:**
- Modify: `chart_studio_v5/README.md`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/CHART_STUDIO_V5_RFC.md`

- [x] Run `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, `node scripts/smoke_chart_studio_v5.cjs`, and `git diff --check`.
- [x] Record that overlays are caller-supplied and renderer-only; production v4 wiring, live data-source wiring, v4/v5 parity, physical touch/DPI and target hardware remain open.
- [x] Keep all MT5 accounts, EAs and positions untouched; run no orders or Strategy Tester.
