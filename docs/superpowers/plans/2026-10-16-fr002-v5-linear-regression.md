# Native v5 Linear Regression Channel Parity Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add the Beta Linear Regression Channel's read-only OLS semantics to the isolated native Lightweight Charts v5 adapter.

**Architecture:** Follow the existing native Keltner three-line overlay API, but calculate the regression center and residual population deviation with the same `ChartStudioIndicators` reference semantics. Refresh all three series and the middle-line data-window value on history replacement, forming-bar replacement, and append; enforce account cleanup, shared indicator limits, and strict option validation. Keep this adapter isolated from production v4 and broker execution.

**Tech Stack:** TypeScript adapter, esbuild bundle, Node/Playwright Chromium contract smoke.

---

### Task 1: Specify native v5 behavior in a failing smoke

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`

- [x] Add pure-helper fixtures for a perfect line and known residual population deviation; compare native upper/middle/lower points and timestamps with the Beta OLS reference, including full-lookback warm-up and no future projection.
- [x] Check the native engine's three line series, middle data-window readout, options getter/update/visibility, same-bar replacement, append, remove, account cleanup, strict period/multiplier boundaries, one-slot shared instance cap, and zero write requests.
- [x] Run the focused smoke before implementation and confirm it fails because the native API is absent.

### Task 2: Implement the v5 overlay

**Files:**
- Modify: `chart_studio_v5/src/adapter.ts`
- Build: `static/chart-studio-v5.js`

- [x] Add strict `LinearRegressionOptions` validation and the OLS/residual-population channel calculation matching the Beta's period 2–200 and multiplier 0.1–10 in 0.1 steps.
- [x] Add three aligned native series with add/update/options/remove methods and a middle-value data-window readout.
- [x] Refresh after history and same-bar/append updates, clear on account change/destroy, and include the one logical instance in collision and shared-limit checks.

### Task 3: Verify, document, and deploy

**Files:**
- Modify: `scripts/smoke_chart_studio_v5.cjs`, `docs/OPEN_TASKS.md`, `docs/superpowers/plans/2026-10-16-fr002-v5-linear-regression.md`

- [x] Run focused Chromium parity, the complete native v5 smoke, TypeScript check/build, Beta tests, workspace tests, and `git diff --check`.
- [x] Update FR-002: native v5 parity moves to done; production cutover, hardware and duration acceptance remain open.
- [ ] Commit and push on `main`, fast-forward htown, guarded-restart the local main runtime, and verify runtime/static identity. Do not run backtests, Strategy Tester, broker writes, or Blueberry requests.
