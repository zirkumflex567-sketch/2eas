# FR-008 Native v5 Overlay Synchronization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the opt-in native v5 preview render the active Beta local overlay-indicator settings from the exact same account/symbol/timeframe scope and expose their native exact-candle values in the v5 Data Window. This is a parity slice; full FR-008 catalog parity and production cutover remain open.

**Architecture:** Add a local-only adapter between `ChartStudioIndicators.settings()/getScope()` and new native v5 transient-overlay APIs. Transient objects live in their own engine map, are excluded from `exportLayout()` and persistence, and are removed on scope reset or destroy. They must not call existing persistent `add*` APIs (notably Session VWAP, which calls `persistDrawings()`). Apply only explicitly enabled, supported settings; remove only bridge-managed overlays on disable, invalid current input, scope mismatch, or explicit scope change, preserving manual/persistent v5 objects. Reject stale sequence tokens without side effects so an older delayed update cannot hide newer valid overlays. Beta configuration changes arrive through `chart-studio-indicators-change`; scope and verified candle updates also trigger synchronization.

Map the Beta defaults directly: Supertrend (`period`, `multiplier`), SAR (`step`, `maxStep`), Donchian (`period`), Keltner (`period`, `atrPeriod`, `multiplier`), ATR Bands (same), Linear Regression (`period`, `multiplier`), Ichimoku (`tenkanPeriod`, `kijunPeriod`, `senkouBPeriod`, `displacement`), and VWAP (`timeZone`, `sessionStart`). Use stable bridge-owned IDs, native colors and visibility defaults, and exact readout IDs. Preserve Ichimoku's native displacement/projected-series semantics and VWAP's volume-source/proxy label. Broker-source pivots and Auto-Fibonacci remain separate; volume is a feed/pane path, not a local overlay. These exclusions mean this work does not complete full FR-008 catalog parity.

**Tech Stack:** Browser JavaScript, Lightweight Charts v5, Node/Playwright Chromium smoke scripts.

---

## Task 1: Specify the local overlay contract

**Files:**
- Create: `static/chart-studio-v5-overlay-feed.js`
- Test: `scripts/smoke_chart_studio_v5_overlay_feed.cjs`
- Modify: `scripts/smoke_chart_studio_v5_preview.cjs`

- [x] Write tests first for exact account/symbol/timeframe scope; option/color/visibility mapping; supported, disabled, unsupported-only, invalid, and stale inputs; stable IDs; replacement/removal; mismatch cleanup; stale token rejection with no side effects; and no calls to fetch/localStorage.
- [x] Run the native contract and verify it fails before implementation because the transient overlay API is absent.
- [x] Implement a pure local adapter that requires `source="CHART_STUDIO_LOCAL"` and `canExecute=false`, validates exact scope, bounds config and instance counts, maps only the supported Beta overlay kinds to native transient-overlay operations, and rejects stale input without side effects.
- [x] Re-run the contract and verify it passes.

## Task 2: Add transient native overlay operations

**Files:**
- Modify: `static/chart-studio-v5.js`
- Test: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add a failing Chromium contract proving transient overlays calculate native values at exact chart timestamps, trigger no persistence adapter/storage writes on add/update/remove, never enter exported or restored v5 layout/drawing state, preserve manual indicators, and are removed on scope reset/destroy. Verify readout values/IDs, Ichimoku projected points, VWAP volume provenance, instance limits, and rollback/cleanup after partial engine failure.
- [x] Implement transient create/remove operations for Beta-configured overlays: Supertrend, Parabolic SAR, Donchian, Keltner, ATR Bands, Linear Regression Channel, Ichimoku, and Session VWAP. Reuse the existing native calculators and validators; do not add an alternate formula path.
- [x] Ensure transient changes never persist chart drawings/layouts and that Data Window readouts are removed with the overlay.
- [x] Run focused Chromium contracts and the full native v5 smoke.

## Task 3: Connect the preview lifecycle

**Files:**
- Modify: `static/chart-studio-v5-preview.js`
- Modify: `scripts/smoke_chart_studio_v5_preview.cjs`

- [x] Add a failing integration assertion that `chart-studio-indicators-change` enabling/changing/disabling a supported Beta overlay updates the native v5 preview and Data Window at the exact selected candle; stale/mismatched scope clears bridge state only.
- [x] Load the overlay adapter only in the opt-in preview, synchronize it after verified candle updates and indicator-setting changes, and clear it on chart-scope change, invalid source, or preview teardown.
- [x] Keep v4 indicator rendering and production mount unchanged. Do not add a server request or MT5 call.
- [x] Run preview Chromium, beta Chromium, JavaScript syntax, and `git diff --check`.

## Task 4: Document and review

**Files:**
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/superpowers/plans/2026-10-14-fr008-v5-data-window.md`

- [x] Record only the behavior and tests actually proven; retain production v5 cutover, target hardware, touch, and full end-user acceptance as open gates.
- [x] Confirm no tests or routes invoke a broker mutation and no production v4 mount was changed.
- [x] Run required GitHub CI before deployment; keep v5 opt-in and do not deploy a production cutover.
