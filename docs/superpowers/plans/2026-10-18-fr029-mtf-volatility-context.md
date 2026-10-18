# FR-029 MTF Volatility Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing deterministic, versioned `market-regime-v1` volatility state beside each READY closed-bar MTF frame without weakening scope, as-of, gap, or UNKNOWN behavior.

**Architecture:** Keep EMA/closed-bar MTF calculation in `chart-studio-mtf.js`. The panel will request the existing read-only regime API only for MTF frames already validated as READY, passing the same account, symbol, timeframe, and historical UTC as-of. The API will expose the latest actually closed source-bar timestamp. The panel will require exact scope/as-of/model/source provenance, require that the source bar closes at or before the cutoff, and match it to the independently validated MTF frame. Failures and non-READY MTF frames remain explicitly UNKNOWN. Existing regime thresholds are exposed as a named model version, not copied or altered in the browser.

**Tech Stack:** Browser JavaScript, FastAPI read-only regime API, Node contract tests, Playwright Chromium smoke tests.

---

### Task 1: Define the MTF regime-read contract

**Files:**
- Modify: `scripts/smoke_chart_studio_mtf.cjs`
- Modify: `scripts/test_chart_studio_mtf.cjs` only if pure result shaping is extracted
- Test: `scripts/smoke_chart_studio_mtf.cjs`

- [x] Add a fixture for `GET /api/chart/v1/regimes` with account, symbol, timeframe, UTC `at`, `MT5_VERIFIED`, `canExecute:false`, `market-regime-v1`, and volatility tags.
- [x] Add adversarial fixtures for wrong account/symbol/timeframe/as-of/model revision, non-read-only provenance, HTTP failure and `volatility=UNKNOWN`.
- [x] Define the API's `sourceTimeUtc` as the latest source candle whose open time plus frame duration is no later than `asOfUtc`; test that a live/incomplete candle is excluded.
- [x] Run the smoke before implementation and confirm the missing regime column/requests fail the intended assertions (contract tests failed before the API extension).

### Task 2: Display scope- and time-bound volatility context

**Files:**
- Modify: `static/chart-studio-mtf-panel.js`
- Test: `scripts/smoke_chart_studio_mtf.cjs`

- [x] Fetch regime context only when the same MTF frame is READY; send the exact captured account/symbol/frame and requested as-of using GET.
- [x] Validate returned account, symbol, frame, as-of, source, model revision, volatility enum, and `canExecute:false` before rendering.
- [x] Require source-bar UTC equality with the confirmed MTF frame and independently check `sourceTime + frameSeconds <= asOf`; render all mismatches as visible UNKNOWN.
- [x] Add a volatility column labelled with `market-regime-v1`; render a validated state and model revision, or a visible UNKNOWN reason. Never convert a missing regime into NORMAL.
- [x] Keep stale-response cancellation and the existing bounded request timeout across both candle and regime reads.
- [x] Run the MTF Chromium smoke and the Chart Studio beta smoke.

### Task 3: Verify historical demo MTF and record the remaining limits

**Files:**
- Modify: `scripts/smoke_live_snapshot_history.cjs`
- Modify: `docs/OPEN_TASKS.md`
- Modify: this plan

- [ ] Extend the read-only four-demo historical snapshot smoke to assert exact-scope/as-of regime reads and displayed volatility states; require no writes and no Blueberry requests.
- [ ] Cover timeout/API failure, API volatility UNKNOWN, every provenance mismatch, and stale responses after account/symbol/timeframe changes in the browser smoke.
- [ ] Allow frames without sufficient validated history to remain UNKNOWN; do not make live acceptance depend on every timeframe being READY.
- [ ] Run the MTF contract, Chromium smoke, beta smoke, live snapshot MTF acceptance, frontend syntax check and `git diff --check`.
- [ ] Record that fixed versioned volatility context is now shown while editable thresholds, structure/setup semantics, authoritative session coverage and AT-041/042 remain open.
- [ ] Commit on `main`, wait for both required GitHub workflows, guarded-restart the exact Main runtime, verify htown `/stt` identity/hash, then repeat the four-demo read-only snapshot acceptance.
