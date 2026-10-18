# GoldM15 native v5 position preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow GoldM15's verified demo positions to appear in the read-only native v5 chart preview.

**Architecture:** Add the verified `goldm15` demo alias to the existing v5 position-read allowlist. Preserve the existing exact account/symbol/timeframe checks and `canExecute=false` contract; do not change trade routes or Blueberry protection.

**Tech Stack:** Dashboard JavaScript, Python Playwright regression, Node/Chromium live demo smoke.

---

### Task 1: Lock down the GoldM15 read-only position scope

**Files:** `tests/test_dashboard_frontend.py`, `scripts/smoke_live_chart_render_data.cjs`

- [x] Assert GoldM15 is allowed for the v5 read-only positions request and Blueberry is excluded.
- [x] Assert the live v5 chart preview requests positions with an explicit matching account scope for each of the five demos.
- [x] Run the regressions and observe RED because GoldM15 displayed `Positionsvorschau nur für freigegebene Demokonten`.

### Task 2: Enable the GoldM15 preview

**Files:** `app.py`

- [x] Add `goldm15` to the existing v5 demo-position allowlist without widening any write allowlist.
- [ ] Run frontend tests, v5 preview smoke, and five-demo live chart smoke; confirm GET-only and Blueberry-free behavior.
- [ ] Commit and push on `main`, wait for both current-head CI workflows, restart the guarded runtime if required, and verify local/htown identity.

### Remaining gates

- [ ] Full production-v5 parity, target hardware, and touch/DPI acceptance remain open.
- [ ] Any broker write, EA reload, funded-account use, or backtest remains outside this slice.
