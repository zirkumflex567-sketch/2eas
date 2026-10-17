# FR-014 Fibonacci Time-Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usable, persisted Fibonacci Time-Zones drawing tool to Chart Studio Beta.

**Architecture:** Two user-selected chart anchors define one logical interval. The drawing projects vertical guides at Fibonacci time factors 0, 1, 2, 3, 5, 8, 13, 21, 34 and 55; only guides intersecting the current chart canvas are rendered. The feature is a normal account/symbol/timeframe-scoped drawing, uses the existing safe geometry and storage contracts, and never requests market or broker data.

**Tech Stack:** Browser JavaScript, pure geometry contract tests, Playwright/Chromium smoke.

---

### Task 1: Define and test projected time-zone geometry

**Files:**
- Modify: `scripts/test_chart_studio_drawings.cjs`
- Modify: `static/chart-studio-drawing-geometry.js`

- [x] Add failing contracts for the two-anchor `fibtime` kind, ordered factor projection, canvas clipping, and invalid factors.
- [x] Run `node scripts/test_chart_studio_drawings.cjs`; confirmed failure because `fibtime` was not registered.
- [x] Implement bounded `fibonacciTimeZones` and verify the pure geometry suite.

### Task 2: Integrate the Beta toolbar and renderer

**Files:**
- Modify: `static/chart-studio-beta.js`
- Modify: `static/chart-studio-object-manager.js`
- Modify: `scripts/smoke_chart_studio_beta.cjs`

- [x] Register the tool in palette, favorites, shortcut preferences, object labels, and scoped drawings.
- [x] Verify vertical guide projection/clipping, same-candle rejection on create/edit, on-chart rendering, persistence, account reload, and portable layout round-trip in Chromium.

### Task 3: Verify and record partial FR-014 status

**Files:**
- Modify: `docs/OPEN_TASKS.md`

- [x] Run drawing geometry and full Beta Chromium suites, JavaScript syntax checks, and `git diff --check`.
- [x] Keep Trend-Based-Fibo, native-v5 parity, styles, touch and production/hardware acceptance marked open.
