# FR-029 Closed-Bar MTF Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore and integrate a read-only five-timeframe confluence baseline that is account-, symbol-, and as-of-bound and never uses an unclosed candle.

**Architecture:** Restore the archived pure MTF calculation module, harden its input and source contracts, and add a separately testable panel that explicitly fetches verified candles for D1/H4/H1/M15/M5. Chart account, symbol and timeframe changes cancel in-flight reads and clear results. The panel shows EMA trend structure, coverage, source time and `UNKNOWN`/insufficient states without inventing a confidence score or treating the result as a strategy signal. This is a first integrated FR-029 baseline; configurable EA-specific structure/setup rules, historical-trade navigation, and full AT-041/042 acceptance remain open.

**Tech Stack:** Browser JavaScript, existing FastAPI `/api/candles` read-only endpoint, Node.js contract tests, Playwright/Chromium smoke.

---

## Requirements and gates

- Read `docs/CHART_STUDIO_MASTER_SPEC.md` §24.4 and AT-041/042. Use all five frames D1/H4/H1/M15/M5, one shared `asOfUtc`, and only candles with `openTime + timeframeSeconds <= asOf`.
- Validate `accountId`, `symbol`, `timeframe`, `source === MT5_VERIFIED`, `canExecute === false`, and candle shape before calculating. No account fallback.
- An unavailable frame, inadequate warm-up, malformed data, or suspicious missing-bar interval must display `UNKNOWN` with its reason and source time; never show a success score.
- GET only `/api/candles`; no order, profile, broker mutation, EA write, Strategy Tester, or backtest endpoints.
- Account/symbol/timeframe scope changes abort outstanding requests, clear old rows, and require a fresh explicit refresh. A late response from an old scope cannot render.
- Keep production v4 and v5 migration behavior unchanged. P1 UI remains read-only and does not satisfy demo, hardware, user-acceptance, or separate write-release gates.

## Files

- Restore/create `static/chart-studio-mtf.js` as a pure closed-bar EMA calculation and data-quality module.
- Restore/create `static/chart-studio-mtf-panel.js` as a DOM panel with strict response validation, five scoped GETs, cancellation and accessible unavailable states.
- Modify `static/chart-studio-beta.js` to mount the panel and forward account, symbol and timeframe changes.
- Modify `static/chart-studio-fixture.html` and the `app.py` script list so the module is available in the real dashboard and fixture.
- Create `scripts/test_chart_studio_mtf.cjs` for deterministic unit contracts and `scripts/smoke_chart_studio_mtf.cjs` for real Chromium UI/request-race coverage.
- Update `docs/OPEN_TASKS.md` and `docs/MAIN_CONSOLIDATION.md` only to record the tested baseline and precisely retain remaining FR-029/AT gates.

## Tasks

### Task 1: Closed-bar engine contract

- [x] Add five-frame contracts for strict candle validation, closure cutoff, warm-up, trend direction, gap-quality `UNKNOWN`, stale historical coverage, and future-bar invariance.
- [x] Run `node scripts/test_chart_studio_mtf.cjs`; confirm RED because the module is absent on this branch.
- [x] Implement the pure engine; each frame returns source time, closed-bar count, quality state, EMA values and bias/reason without using any unclosed candle.
- [x] Run the Node contract and reject duplicate, malformed, out-of-order-conflicting and wrong-timeframe inputs.

### Task 2: Scoped read-only panel

- [x] Add a DOM-only panel for five rows, explicit refresh, verified account/symbol/timeframe response identity, source provenance and unavailable/warm-up text.
- [x] Verify cancellation and stale-response rejection on account, symbol and chart-timeframe context changes in Chromium.
- [x] Implement five bounded GET requests at one captured `asOf`, with AbortController, 12-second timeout and no cross-account fallback.
- [x] Ensure every row reports its own last closed bar UTC and gap/warm-up reason; no aggregated percentage or trade recommendation.

### Task 3: Dashboard integration

- [x] Load both MTF scripts before ChartStudioBeta and mount the panel in the existing collapsed chart-tools area.
- [x] Forward account, symbol and timeframe changes into the panel and clear/abort old work synchronously.
- [x] Add Chromium cases for forged account identity, unavailable endpoint, all five frames, a historical UTC as-of with an open H4 candle, and account/timeframe scope changes while a request is pending. Unit test verifies future-bar invariance.
- [x] Assert no non-GET request occurs and preserve current v4 mount and browser behavior.

### Task 4: Acceptance record

- [x] Run the MTF unit suite, MTF Chromium smoke, Beta Chromium smoke, focused dashboard test, Node syntax checks and `git diff --check`.
- [x] Record the baseline as partial in `OPEN_TASKS`; retain strategy-specific rules, EMA/volatility/confirmed-structure/setup semantics, historical trade navigation, event-context snapshotting and full AT-041/042, demo and hardware acceptance as open.
- [x] Review the final diff before committing this slice; both review findings (bounded weekend gap and symbol-change race coverage) were fixed and rechecked.

### Follow-up: session-heuristic transparency (17 October 2026)

- [x] Add a RED contract for a plausible Friday-to-Monday gap in an otherwise warm, fresh H1 series; verify the engine incorrectly reported `dataQuality=OK` before the fix.
- [x] Keep the bounded weekend-gap tolerance and all suspicious-gap `UNKNOWN` behavior; flag accepted heuristic closures as `SESSION_HEURISTIC`.
- [x] Render the heuristic in the MTF row as unverified broker-session coverage; verify the label and read-only request behavior in Chromium.
- [x] Run the MTF Node and Chromium contracts and preserve the authoritative broker-session schedule as an open dependency.


### Follow-up: observed XAU session closures (17 October 2026)

- [x] Live read-only MT5 history on the four authorized demos showed daily maintenance gaps ending at 22:00 UTC (H1 20:00→22:00, M15 20:45→22:00, M5 20:55→22:00) and D1 Thursday→Sunday weekend gaps. The previous engine mislabeled these observed closures as `DATA_GAP`.
- [x] Add narrowly bounded UTC-pattern heuristics for those exact XAUUSD daily bar edges and D1 Thursday→Sunday gaps; scope them to XAUUSD and broker suffix variants only, preserve `SESSION_HEURISTIC` in the UI as unverified broker-session coverage, and leave unrelated symbols or multi-day gaps UNKNOWN.
- [x] Unit and Chromium contracts now cover all four supported affected frames, the displayed unverified label, and rejection of unrelated/multi-week gaps.
- [x] Re-run live snapshot/MTF history on all four demos: M15 and M5 are `READY` with `SESSION_HEURISTIC`; D1/H4/H1 remain `UNKNOWN` on holidays/other unverified gaps (including the 76-hour 02→05 April H4 interval, 96-hour 22→26 December D1 interval, and 4-hour 7 September H1 interval). All reads were GET-only; there were no browser errors, mutations or Blueberry requests. Authoritative broker-session and holiday schedules remain an explicit dependency.
