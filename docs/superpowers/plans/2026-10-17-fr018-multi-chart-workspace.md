# FR-018 Read-Only Multi-Chart Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard 2/4 chart workspace with account-scoped named layouts and symbol favorites, verified MT5 candle reads, optional UTC viewport and crosshair linkage, and strict stale-scope handling.

**Architecture:** A focused browser module owns workspace controls, independent chart instances, validated read-only candle requests, and local account-scoped preferences. Every pane is bound to the same selected account but can select only a broker-verified symbol and supported timeframe; linked viewport uses UTC times, and crosshair uses a target candle's own price. The existing main v4 chart remains intact, the extra workspace is an explicit dashboard tool, and v5 stays preview-only.

**Tech Stack:** Browser JavaScript, Lightweight Charts v4, localStorage, Playwright Chromium smoke, Node contracts.

---

## Contract and scope

- 2- and 4-pane modes are selectable; each pane can select a broker-verified symbol and supported timeframe.
- All broker data access is GET `/api/candles` scoped to the selected account. Responses must match account, exact broker symbol, timeframe, `MT5_VERIFIED`, and `canExecute === false`; invalid/stale responses are discarded and old candles cleared before a scope change.
- Layout, pane scopes, link toggles, up to 20 named layouts, and up to 50 symbol favorites persist only under the selected account's local browser key. Loading a saved layout never fetches broker data; each pane still requires an explicit load click. Adding a favorite requires an exact current `MT5_VERIFIED` catalog match; removing one is local only. No remote preference writes.
- Visible time ranges synchronize by UTC timestamps only; invalid or unavailable ranges are ignored without feedback loops.
- Crosshair synchronization is opt-in and uses each target chart's own close price at the nearest candle not later than the source UTC time. It never copies prices across symbols or invents data.
- Read-only status is visible. No order/position routes, writes, EA changes, backtests, or Blueberry access.
- The existing dashboard chart and production v4 mount remain unchanged; workspace is an explicit Beta tool.

## Files

- Create `static/chart-studio-multi-chart.js` and `static/chart-studio-multi-chart.css` for workspace lifecycle and compact responsive controls.
- Load the module in `app.py` and the standalone Beta fixture; mount it from the dashboard's explicit 2/4 Charts control with the selected account and symbol.
- Create `scripts/test_chart_studio_multi_chart.cjs` for pure validation/persistence/range/crosshair contracts.
- Create `scripts/smoke_chart_studio_multi_chart.cjs` to exercise 2/4 panes, account-scoped storage, verified-only GETs, and Blueberry isolation.
- Update `docs/OPEN_TASKS.md` and this plan with implemented behavior and remaining evidence gates.

## Tasks

### 1. Contracts (RED first)

- [x] Test pane-count validation, account-bound storage keys, strict symbol/candle response scope, UTC time-range guards, safe crosshair target lookup, and account-isolated local persistence.
- [x] Run `node scripts/test_chart_studio_multi_chart.cjs`; confirmed the initial missing module failed, then the contract passed after implementation.

### 2. Read-only workspace

- [x] Implement the smallest tested public contract and workspace mount.
- [x] Add accessible 2/4 layout and per-pane verified-symbol/timeframe controls, load state, empty state, and errors.
- [x] Use only exact account-scoped candle GETs; cancel/ignore old-scope results and clear stale charts synchronously.
- [x] Add guarded UTC viewport and target-candle crosshair linkage with loop prevention.
- [x] Add per-account local persistence and responsive styling.
- [x] Add account-isolated named layout save/load/delete with 2/4 pane scopes, per-pane symbols/timeframes, linked-range settings, safe names, a 20-layout limit, and no implicit broker reads when loading.
- [x] Add account-isolated symbol favorites with exact broker-catalog verification before add, one-click local removal, a 50-symbol limit, and suggestions on every pane.
- [x] Abort in-flight catalog/favorite/candle reads before replacing panes from a named layout; verify no stale candle request follows layout load.

### 3. Verification and ledger

- [x] Run Node contracts, `node --check`, focused multi-chart Chromium smoke including named-layout and favorite lifecycle, request cancellation and 480px checkbox/canvas checks, full Beta smoke, Python dashboard frontend tests (74 tests/38 subtests), and `git diff --check`.
- [x] Confirm the added smoke makes only scoped GET requests for `titan`, makes no broker mutation, verifies favorite symbols, and blocks the Blueberry workspace before fetch.
- [ ] Review, check on `main`, restart local and htown `/stt`, and repeat all-four-demo read-only acceptance with this code revision.
- [ ] Update FR-018 evidence after deployment; native v5 parity, touch/DPI and cross-device/hardware acceptance remain open for their own verification.
