# Versioned Chart Coordinate Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put ChartStudioBeta's time/price coordinate and logical-range access behind a strict, versioned interface that can serve the current v4 chart and a future v5 chart without switching production rendering.

**Architecture:** Add a small, versioned adapter inside the already-loaded `chart-studio-beta.js`; it binds a chart, candle series and account/symbol/timeframe scope to API version 4 or 5. It normalizes numeric UTC timestamps and Lightweight Charts `BusinessDay` values, coordinates, logical ranges and crosshair subscriptions; scope changes unsubscribe and rebind listeners so queued events from an old scope are discarded. ChartStudioBeta will use this interface for its existing coordinate-dependent drawing, overlay and viewport operations. The existing `app.py` chart mount remains untouched and production stays on v4; v5 remains isolated until separate parity and hardware gates pass.

**Tech Stack:** Browser JavaScript, Lightweight Charts v4/v5 public APIs, Node.js contract tests, Playwright dashboard/Beta smoke.

---

## Contract

- Construction requires an explicit supported version (`4` or `5`), chart, candle series, and non-empty `{account,symbol,timeframe}` scope. Unsupported/missing versions fail closed.
- Coordinate conversion accepts epoch-second chart time and returns epoch seconds for either numeric `UTCTimestamp` or valid `BusinessDay` values. Pixel/price values must be finite; missing/out-of-view coordinates return `null`; malformed inputs throw `TypeError`.
- Visible logical ranges are copied, finite, and strictly increasing. Invalid ranges are rejected before reaching the renderer.
- Crosshair subscriptions deliver `{scope,time,logical,seriesData}` with a frozen scope snapshot. `setScope` removes and re-registers active chart listeners with a new captured scope; old queued handlers fail their generation check. Unsubscribe is idempotent.
- ChartStudioBeta calls only the adapter for time/price conversion and visible logical range reads/writes. Existing `app.py` mount, v4 creation, network behavior, and production asset loading remain unchanged; the adapter is defined in the already loaded Beta script.
- No MT5 calls, broker mutations, deployment, Strategy Tester, or production v5 switch.
- Preserve the v5 RFC gates: no cutover before native browser and Windows-MT5 demo checks, screenshot parity, migration review, responsive/touch/reduced-motion checks, and user acceptance. Stop changes remain behind separate authorization/CSRF/guard/revision/idempotency and demo-user-release approval.

## Files

- Modify `static/chart-studio-beta.js` to define/use the adapter, pass the explicit v4 binding at Beta mount, and refresh its scoped adapter when account/symbol/timeframe changes.
- Create `scripts/test_chart_studio_coordinate_adapter.cjs` for direct public-API contract tests. The Node harness sets `global.window = {}`, requires the existing Beta script (which performs no DOM work at load time), and reads `window.ChartStudioBeta.coordinates.create`.
- Modify `scripts/smoke_chart_studio_v5.cjs` to load the pinned v5 standalone browser bundle locally and exercise the same coordinate adapter contract against a real native v5 chart and candle series.
- Existing `tests/test_dashboard_frontend.py` and the Beta Chromium smoke exercise the current real v4 renderer and ensure the `app.py` mount and no-write behavior remain intact.
- Update `docs/CHART_STUDIO_V5_RFC.md` and `docs/OPEN_TASKS.md` only after tests prove this slice; retain parity/cutover gates.

## Tasks

### Task 1: Contract tests

- [x] Test supported v4/v5 time and price roundtrips, numeric and `BusinessDay` time normalization, null out-of-range results, strict logical range validation, exact scope capture, stale callback invalidation, and idempotent unsubscribe.
- [x] Run `node scripts/test_chart_studio_coordinate_adapter.cjs` and confirm the expected assertion failure that `ChartStudioBeta.coordinates.create` is not exported yet.

### Task 2: Adapter implementation

- [x] Implement only the tested public API with explicit API version checks and finite-value validation.
- [x] Run the contract test and require all v4 and v5 fake-public-API cases to pass.
- [x] Run adapter contracts against the existing real v4 Chromium dashboard and native v5 chart/series created by the pinned v5 package; fakes alone are insufficient compatibility evidence.

### Task 3: Beta integration

- [x] Replace direct coordinate/logical-range calls in Beta drawing, snapping, position and What-if projection paths.
- [x] Refresh adapter scope on account, symbol and timeframe changes; reject stale crosshair callbacks.
- [x] Run adapter contracts, `node --check static/chart-studio-beta.js`, focused dashboard Playwright tests, `node scripts/smoke_chart_studio_beta.cjs`, and `git diff --check`.

### Task 4: Evidence and review

- [x] Record only the versioned interface and current-v4 integration in RFC/ledger. Production v5 wiring, native pane parity, cross-symbol chart linkage, demo-user release, browser/Windows-MT5 hardware acceptance and all migration/user-acceptance gates remain open.
- [x] Review the diff and run the full relevant frontend/security regression set. The full Python run reported 942 passed and 305 subtests passed, with one Windows PowerShell startup-timeout failure; the isolated rerun of that exact test passed. The focused dashboard test, Beta Chromium smoke, native v5 Chromium smoke, adapter contract, TypeScript check/build and diff check passed.
