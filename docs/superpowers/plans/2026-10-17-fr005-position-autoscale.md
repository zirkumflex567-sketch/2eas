# FR-005 Verified Position-Level Autoscaling Plan

> **For agentic workers:** use `executing-plans` and `test-driven-development` for this task.

**Goal:** Keep verified open-position entry/current/SL/TP prices inside the main chart's auto-scaled visible price range so position lines and read-only drag handles can be reached.

**Architecture:** The main candlestick series' Lightweight Charts v4 `autoscaleInfoProvider` merges only the base candle range with a bounded min/max extent exported from ChartStudioBeta's currently validated `MT5_VERIFIED` position snapshot. Account, symbol and timeframe changes or invalid snapshots clear that extent. No historical data or broker writes are added. Draft previews remain read-only and stale quotes remain fail-closed.

**Verification:** A pure helper test proves range merge/clipping and nonmutation; the live Chromium demo smoke proves the existing verified stop handle can be dragged inside the canvas, that scope/revision remain exact, and that stale quotes return a non-executable 503 while broker readback is unchanged. A fresh-quote demo run, if available, must retain the existing 200 preview checks. Only `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500` are in the acceptance allowlist; no Blueberry requests or broker mutations.

### Task 1: Autoscale range contract

- [x] Add failing tests for merging verified position prices without mutating the base result, invalid ranges, and the finite price cap.
- [x] Implement the bounded pure range helper and register it in the dashboard.

### Task 2: Connect validated positions and test the UI

- [x] Expose only the validated active Beta position-price extent and refresh chart autoscale after verified snapshot/scope changes, including invalid snapshots.
- [ ] Extend live Chromium coverage to assert the stop handle is inside the pane, drag changes the local draft, stale preview stays fail-closed, and broker positions remain unchanged.
- [x] Make the API live smoke accept either a fully validated fresh 200 preview or the exact safe `503 QUOTE_NOT_FRESH` outcome; live API smoke confirmed the stale-safe branch on `titan_m5`.

### Task 3: Verify and release

- [ ] Run unit, Beta, position preview and relevant regression suites; get an independent review.
- [ ] Update FR-005/FR-006 and this plan with actual live quote state and outcomes.
- [ ] Commit/push to main after CI, then deploy via guarded runtime and repeat the four-demo read-only smoke.
