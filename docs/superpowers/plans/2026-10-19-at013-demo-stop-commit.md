# Demo Position Stop Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close AT-013/014 with a trade-role, explicit-confirmation stop-protection flow that is restricted to non-Blueberry demo accounts and reports only broker-readback values.

**Architecture:** Reuse the existing position preview registry, idempotent `PositionCommitService`, and durable audit store. Add an explicit non-challenge-demo guard that permits only risk-reducing SL/TP edits; wire it into preview/commit routes and the Chart Studio draft UI, with confirmation required only after a fresh valid preview. Dragging remains preview-only, commit requires trade identity, and Blueberry is rejected at multiple layers.

**Tech Stack:** FastAPI, MetaTrader5 Python API, SQLite idempotency/audit store, Chart Studio Beta JavaScript, pytest, Playwright.

---

### Task 1: Guard policy and preview eligibility

**Files:**
- Create: `chart_studio/demo_position_guard.py`
- Modify: `chart_studio/preview_api.py`
- Test: `tests/test_chart_studio_position_preview.py`

- [x] Add failing tests for allow-on-risk-reducing-demo, reject-risk-increasing, reject-Blueberry, reject-live-account, and read-role previews not being commit-capable.
- [x] Run the targeted tests and confirm the expected failures.
- [x] Implement the explicit guard and thread it into preview responses without changing read-only preview calculations.
- [x] Run targeted tests and confirm `canCommit` is true only for a fresh valid preview, trade identity, and guard ALLOW.

### Task 2: App wiring and durable commit route

**Files:**
- Modify: `app.py`
- Modify: `chart_studio/position_commit_api.py` only if integration tests identify a contract gap
- Test: `tests/test_chart_studio_position_preview.py`

- [x] Add failing application-level tests proving the app keeps commits disabled for Blueberry/non-demo identities and exposes the commit endpoint only with matching registry, store, guard, and service.
- [x] Confirm tests fail for the missing app wiring.
- [x] Wire one durable private `PositionCommitStore`, the demo guard, `PositionCommitService`, and the existing preview registry into the app; preserve the disabled trade-ticket/new-order route.
- [x] Give each serving process its own durable store file (the preview registry is process-local), call `recover_interrupted()` before serving requests, and test restart recovery plus independence between two store instances so one process cannot mark another process's active reservation interrupted.
- [x] Run the route and audit-store regression tests.

### Task 3: Explicit Chart Studio confirmation and readback

**Files:**
- Modify: `static/chart-studio-beta.js`
- Modify: `static/chart-studio-broker-panel.js`
- Test: `tests/test_chart_studio_beta_browser.cjs` or the closest existing beta browser test
- Test: focused broker-panel contract tests in `tests/test_dashboard_frontend.py`

- [x] Add failing contract/browser tests: the broker panel accepts only the new scoped demo guard state; drag makes no commit request; a valid fresh preview reveals the confirmation; cancel sends no commit; confirm sends exactly one idempotent commit request.
- [x] Confirm the test fails before implementation.
- [x] Implement the confirmation state and POST only the scoped preview ID, ticket, revision, confirmation, and idempotency key.
- [x] On `SAVED`, reload the broker position and render only its returned SL/TP/revision; on stale, unknown, or mismatch results, keep broker values authoritative and expose the error.
- [x] Browser-assert rendered SL/TP/revision from broker readback when it differs from the requested draft; cover reload failure, `UNKNOWN`, `READBACK_MISMATCH`, and account/symbol/timeframe changes while commit/reload is pending.
- [x] Run the focused browser suite and JavaScript syntax checks.

### Task 4: Demo acceptance and task-list record

**Files:**
- Create: `scripts/smoke_live_position_stop_commit.cjs`
- Modify: `docs/OPEN_TASKS.md`

- [x] Add a fail-closed smoke that selects one open non-Blueberry demo position, verifies a risk-reducing candidate, confirms it once, and checks exact broker readback; never use market orders and never touch Blueberry.
- [x] Run the smoke on one user-authorized non-Blueberry demo only; if quote, identity, guard, or stop geometry is not valid, stop without sending the commit.
- [x] Record the exact demo result for AT-013/014, including one `TRADE_ACTION_SLTP` mutation, verified readback, and zero new/market orders.
- [x] Keep AT-013/014 open if no authorized demo position meets quote, identity, guard, and geometry checks or if browser evidence is incomplete. Run focused Python/browser checks and `git diff --check`; commit the implementation on `main`.
