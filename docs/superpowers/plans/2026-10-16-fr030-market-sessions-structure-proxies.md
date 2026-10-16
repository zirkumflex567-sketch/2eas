# FR-030 Market Sessions and Structure Proxies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an explainable, read-only Chart Studio Beta overlay for DST-correct market sessions, opening ranges, confirmed pivots, equal levels, and explicitly hypothetical sweep zones.

**Architecture:** Keep time conversion and OHLC calculations in a pure `ChartStudioMarketStructure` module, keyed by account/symbol/timeframe preferences. Add a small controls/status panel and render its validated model on the existing Chart Studio canvas; accept only normalized UTC epoch OHLC, keep broker-server-time labels separate from IANA session-local display, and perform no broker write or inferred orderflow. Declare the available calendar as weekdays-only (not a holiday calendar), surface missing holiday/calendar coverage, label weekend/rollover gaps, and treat incomplete OHLC coverage as partial/unknown. Delay pivots until their right-side confirmation bars exist and delay sweeps until a closed, explicitly selected ConfirmTF bar confirms them.

**Tech Stack:** Browser JavaScript, Intl IANA time zones, existing Chart Studio canvas/coordinates, Node contract tests, existing Playwright Chromium fixture smoke.

---

### Task 1: UTC and DST session engine

**Files:** Create `static/chart-studio-market-structure.js`; create `scripts/test_chart_studio_market_structure.cjs`; modify `.github/workflows/chart-studio-ci.yml`.

- [x] Write failing tests for Asia/London/New York DST boundaries, exact UTC session/price-box bounds including UK/US DST-mismatch weeks, broker-server-time offsets versus Berlin display, weekend/rollover gaps, invalid zones, gaps and partial opening ranges.
- [x] Run the new Node test and confirm failure because the module/API is absent.
- [x] Implement bounded session definitions, IANA local-time conversion, real-OHLC session high/low and 60-minute opening ranges, previous day/week high/low from available real OHLC, and explicit completeness/coverage/calendar flags.
- [x] Run focused tests for DST-mismatch weeks, New York DST, invalid zones, OHLC gaps, partial opening ranges, and normalized UTC source timestamps; holidays remain unknown without a supplied market calendar.
- [x] Add the focused test and syntax check to Chart Studio CI.

### Task 2: Confirmed structure and honest liquidity hypotheses

**Files:** `static/chart-studio-market-structure.js`; `scripts/test_chart_studio_market_structure.cjs`.

- [x] Add failing tests for configurable right-bar-confirmed swing highs/lows, tick-size and ATR-based equal-level tolerance, both equal highs and equal lows, and wick-through/close-back sweeps requiring a closed configured ConfirmTF candle whose close time is at or before `asOfUtc`.
- [x] Confirm RED, then implement deterministic pivots, equal-level grouping, sweep confirmation and exact `confirmedAt` timestamps.
- [x] Label every equal/sweep result `STRUCTURE_LIQUIDITY_HYPOTHESIS`; expose no claim of real resting orders or institutional flow.
- [ ] Finish invalid/malformed ConfirmTF and missing-history boundary cases; existing tests cover partial sessions, open ConfirmTF candles, unconfirmed pivots and both sweep directions.

### Task 3: Beta controls and read-only canvas overlay

**Files:** Modify `static/chart-studio-beta.js`, `static/chart-studio-fixture.html`, `static/chart-studio-quick.css`, `app.py`, and `scripts/smoke_chart_studio_beta.cjs`; create or extend market-structure module as needed.

- [x] Add Chromium assertions for account/symbol-scoped read-only ConfirmTF and quote fetches and zero write requests.
- [x] Integrate session presets (Asia/Tokyo 09:00–18:00, Frankfurt/Europe-Berlin 08:00–17:00, London/Europe-London 08:00–17:00, New York/America-New_York 08:00–17:00, rollover/New_York 17:00–18:00) and editable custom timezone/start/end.
- [x] Render the candle-derived model with IANA zone, UTC bounds, coverage/calendar caveats, ConfirmTF and proxy-only labels; automatically obtain a scoped read-only quote timestamp and fail closed when absent.
- [x] Store controls by account/symbol/timeframe, recompute on candle/context change, and make hidden/empty/gapped inputs explicit.
- [x] Pass the full beta Chromium smoke and focused market-structure smoke.

### Task 4: Review, evidence, and delivery

**Files:** Update `docs/OPEN_TASKS.md` and this plan.

- [ ] Finish the full local Python workspace suite. Beta smoke, focused Node test, JavaScript syntax, Python compile, frontend syntax and `git diff --check` pass; the full run had five optional-spool fixture failures, and those five pass when that local optional environment variable is unset.
- [x] Verify the overlay makes no broker mutation or strategy/backtest call; keep live/hardware acceptance explicitly open.
- [ ] Commit/push on `main`, guarded-restart local runtime, update htown `/stt`, and verify matching runtime revision/digest and static asset delivery.
- [ ] Record AT-045/046 evidence while preserving live-hardware and calendar-coverage limitations.
