# FR-002 Native v5 Moving-Average Feed Synchronization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the user explicitly opens the read-only v5 preview, render the same configured custom moving averages as the production v4 chart, with exact scope and no broker writes.

**Architecture:** The existing account-local `ChartStudioAverages.getConfigs()` output is the sole configuration source. A small bridge validates the complete snapshot and synchronizes it to the native v5 engine using its managed-average API; the v4 renderer and its settings remain authoritative. Scope changes and invalid snapshots clear synchronized averages fail-closed.

**Tech Stack:** Vanilla JavaScript, TypeScript v5 chart adapter, Playwright/Chromium.

---

## Boundaries

- Change only the optional preview; do not alter the production v4 renderer, chart toolbar, broker APIs, EA files, or account permissions.
- Synchronize the 16-entry bounded `ChartStudioAverages` configuration: ID, type, period, OHLC source, color, line width, visibility, label, and display shift.
- Require exact account/symbol/timeframe scope. Never import broker/account data into local layout exports.
- Keep v4 visible and authoritative; do not enable or switch production v5.
- Do not use Strategy Tester/backtests or broker mutation APIs.

## Files

- Create `static/chart-studio-v5-indicator-feed.js`: validates scoped average snapshots and applies them to an injected v5 engine; no fetch, storage, or trading surface.
- Modify `static/chart-studio-averages.js`: emit a local change event after valid account-local configuration changes.
- Modify `chart_studio_v5/src/adapter.ts`: add a transient managed-MA API that recalculates on candle updates but never enters v5 local/portable layout persistence.
- Modify `static/chart-studio-v5-preview.js`: subscribe while mounted, apply snapshots, clear on scope change/preview close, and expose read-only diagnostics for the smoke.
- Modify `app.py`: include the new local bridge asset before the preview script.
- Create `scripts/smoke_chart_studio_v5_indicator_feed.cjs`: Chromium contract for add/update/remove, scope/provenance rejection, stale generations, exact option parity, engine updates after candle replacement, and zero requests.
- Update `docs/OPEN_TASKS.md` only after verification; production cutover and other indicator families remain open.

## Tasks

### Task 1: Contract first

- [x] Add Chromium cases for valid custom EMA/SMA/RMA configurations, exact scope match, changed options, removal, duplicate IDs, invalid IDs/colors/periods/shifts, excessive count, and stale generations.
- [x] Assert that only v5 transient managed-average/removal/option-read methods are invoked; the bridge issues no requests or mutations.
- [x] Run the new smoke and confirm it fails before the bridge exists.

### Task 2: Implement safe synchronization

- [x] Add strict snapshot normalization; reject the whole snapshot atomically on any invalid row.
- [x] Namespace incoming IDs to prevent collision with drawings or other native objects.
- [x] Preserve unchanged managed series; remove only bridge-owned series on config removal or scope reset; recreate a series only when its validated options change.
- [x] Emit the local change event only after validated configuration updates and subscribe/unsubscribe with v5 preview lifecycle.
- [x] Keep configuration changes local-only and keep v4 state authoritative; preview series are transient and excluded from v5 local/portable layout persistence.

### Task 3: Verify and record

- [x] Run the new Chromium smoke, native v5 TypeScript check/build, existing v5 preview/drawing smokes, Beta smoke, and focused frontend tests.
- [x] Run `git diff --check` and review every changed path for network/write routes.
- [x] Run the full Python regression suite (1,468 passed, 1 skipped, 445 subtests passed; four existing FastAPI deprecation warnings).
- [ ] Record this slice as partial FR-002/FR-001 evidence; do not mark v5 production parity, hardware acceptance, or FR-002 complete.
- [ ] Commit and push to `main` only after checks pass; guarded local and htown `/stt` rollout remains governed by the existing runtime workflow.

## Release gates

This slice changes only an opt-in, read-only preview. The production default remains v4. Touch/DPI/physical hardware acceptance, full indicator/editor/profile parity, complete v4/v5 parity, and production cutover require separate proof. No MT5 or broker writes are allowed.
