# FR-013 Heikin Ashi and Hollow Candles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Heikin Ashi and Hollow Candles as clearly labeled, account-local display modes while preserving the original MT5 OHLC source for indicators, data-window values, drawings and broker logic.

**Architecture:** Keep raw bars as the permanent source. Beta Heikin Ashi uses recursive open and averaged OHLC formulas; Hollow Candles use original OHLC with a transparent body for bullish bars and explicit outline/wick colors. Native v5 retains the candlestick series as the stable primitive/price-line anchor and adds separately toggled Bar, Line, and Area series. The selected presentation is account/symbol/timeframe scoped, included in portable schema-v2 layouts and persisted in a migratable local schema-v6 snapshot. All modes remain view-only and do not replace source data.

**Tech Stack:** Browser JavaScript, Lightweight Charts v4 series API, Chromium beta smoke.

---

### Task 1: Extend derived chart modes

**Files:**
- Modify: `scripts/smoke_chart_studio_beta.cjs`
- Modify: `static/chart-studio-chart-types.js`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `docs/superpowers/plans/2026-10-14-fr013-derived-candles.md`

- [x] **Step 1: Add failing browser contracts** for the two controls, correct HA formulas, Hollow candle styles, raw-bar/data-window preservation, persistence/account isolation and invalid input handling.
- [x] **Step 2: Run the Chromium smoke and confirm the controls/modes are missing.**
- [x] **Step 3: Implement pure bounded candle transforms** and create the corresponding native alternate series.
- [x] **Step 4: Keep transformations display-only** across new data, theme colors, account switching and layout persistence.
- [x] **Step 5: Run Chromium beta smoke, chart-type tests, JavaScript syntax, relevant Python regressions and `git diff --check`.** Chromium beta smoke and JavaScript syntax pass.
- [x] **Step 6: Update FR-013 evidence and commit.** The native v5 preview now also exposes Bar, Line, and Area series alongside Candles, Heikin Ashi, and Hollow; Engine and Chromium contracts verify raw OHLC preservation and the active rendered series. Remaining: regression for all profile and anchor interactions, full v5 migration, performance/DPI/touch and target-hardware acceptance.
