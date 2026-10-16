# FR-001/FR-011 Native v5 production feed integration plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the verified main-dashboard candle feed to the native v5 renderer through an explicitly gated, reversible preview while preserving v4 as the production default until full parity and hardware acceptance pass.

**Architecture:** Add a small browser feed bridge that accepts only bounded, scope-matching `MT5_VERIFIED` snapshots with `canExecute=false`, rejects stale generations, and forwards validated candles and read-only position overlays to an already-mounted v5 engine. Load the v5 library lazily only when the private preview flag and user action both allow it. Do not route orders, infer data, or make v5 the default in this slice.

**Tech Stack:** FastAPI inline dashboard, vanilla JavaScript, pinned Lightweight Charts 5.2.1 adapter, Playwright/Chromium, existing live-feed contracts.

---

## Files and boundaries

- Create `static/chart-studio-v5-feed.js` for strict scope/provenance validation and safe forwarding to an injected native engine.
- Add `static/chart-studio-v5-preview.js` and a locally built, pinned bundle for the explicit preview; update `app.py` and the guarded runtime allowlist to expose a default-off private flag; the v4 mount remains authoritative.
- Add `scripts/smoke_chart_studio_v5_feed_bridge.cjs` and `scripts/smoke_chart_studio_v5_preview.cjs` for contract and browser integration checks.
- Update `docs/CHART_STUDIO_V5_RFC.md` and `docs/OPEN_TASKS.md` only with verified wiring status; production cutover remains open.

## Steps

### Task 1: Strict live-feed bridge

- [x] Write failing browser-contract cases for correct-scoped candles, wrong account/symbol/timeframe, non-MT5 provenance, `canExecute=true`, malformed bars, history over 5,000 candles, and late generation delivery.
- [x] Confirm RED because the bridge module is absent.
- [x] Implement exact scope/provenance checks, bounded monotonic UTC candle validation, stale-generation rejection, and clearing on scope changes; expose only a small injected-engine API.
- [x] Verify GREEN and assert zero network requests and zero broker mutation paths.

### Task 2: Dashboard integration behind an off-by-default gate

- [x] Add the bridge to dashboard HTML and a strict private flag that defaults to disabled.
- [x] Forward the same verified candle snapshot already rendered by v4 to an active v5 preview; keep v4 visible and authoritative when preview is disabled or unavailable.
- [x] Test disabled-default behavior, scope-change clearing, preview re-enable after valid data, and no cross-account candle reuse.

### Task 3: Verification and delivery boundary

- [x] Run focused v5 tests and the integrated Chromium preview smoke; no Blueberry calls or MT5 writes.
- [x] Review the diff and keep production switchover, v4/v5 parity, full overlay/editor parity, touch/DPI and physical hardware acceptance open until separately proven.
- [ ] Commit to `main`, pass both CI workflows, guarded-restart local runtime and `/stt`, and verify matching commit/digest plus static bridge delivery.

## Gates

This code slice does not enable the v5 preview on `/stt`, switch the production chart, modify EA files, or perform demo mutations. The preview requires exact environment value `CHART_STUDIO_V5_PREVIEW_ENABLED=1` and an explicit chart-toolbar click; v4 remains authoritative. Strategy Tester and strategy backtests remain deferred.
