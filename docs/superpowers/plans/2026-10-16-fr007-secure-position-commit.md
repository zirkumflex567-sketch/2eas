# FR-007 Secure Position Commit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a dedicated, role-bound, idempotent MT5 SL/TP commit pipeline whose runtime remains disabled until an independent security review and explicit user release approval.

**Architecture:** Keep the existing ChartStudio preview endpoint read-only and add a separate commit API that accepts only an explicit confirmation tied to a short-lived preview and expected position revision. The backend must re-read the exact account, position, quote, symbol rules and authoritative EA/challenge guard under the existing account gateway lock, reserve idempotency before any mutation, send at most once, and report success only after broker readback. Production startup has no guard provider and the commit feature flag defaults off, so no configuration-only toggle can activate writes before a reviewed guard integration is supplied.

**Tech Stack:** FastAPI/Pydantic, existing `account_gateway.py`, MT5 Python adapter, SQLite private audit/idempotency store, pytest and mocked broker contracts.

---

## Requirements and boundaries

- Cover FR-007 and AT-013–017/030/032; keep FR-021's new-entry ticket as a separate follow-up.
- Never add writes to `/api/chart/v1/position/preview-stop`; preview remains `canExecute=false` and `canCommit=false`.
- Never expose a route that writes unless a trusted guard provider is injected, a private audit store is configured, a `trade` identity is present, and the explicit release gate is enabled. Main production installs no guard provider and keeps the flag off.
- The request binds a server-issued preview ID, expected revision, explicit `userConfirmed=true`, and canonical idempotency UUID. The preview ID is scope-bound to the authenticated trade principal, raw peer, account/terminal/login/server, symbol, ticket and revision, and is atomically consumed once. It cannot supply guard state, candidate prices, or account identity claims.
- SL-only edits preserve the freshly read TP; TP-only edits preserve the freshly read SL. Explicit level removal must be represented separately from omission; ambiguous/no-op payloads are rejected.
- Re-read under `account_gateway.traced_session`; validate current revision, original SL/TP, quote age, trading mode, tick/stops/freeze geometry, and the guard again immediately before one `order_send`.
- Reserve the idempotency key durably before the send. Reuse with the same payload returns the stored result; a different payload conflicts; an interrupted in-flight request stays `UNKNOWN` and is never auto-sent again.
- Only a verified broker readback may report saved levels. Broker rejection and ambiguous timeout remain explicit failure/unknown states and are append-only audited without credentials.
- Do not run any live order or position mutation in development, CI, or deployment. No Blueberry reads or writes. Strategy backtests remain deferred.

## Files and responsibilities

- Create `chart_studio/position_commit.py` for strict request/result models, durable idempotency/audit state transitions, and commit orchestration.
- Create `chart_studio/position_commit_api.py` for the dedicated FastAPI route, trade-role/peer checks, request validation and safe error translation.
- Modify `dashboard_security.py` to include only the new mutation path in the existing exact-path session/Origin/CSRF/trade-role guard.
- Modify `app.py` only to install the route with the commit flag disabled and without a guard provider; leave legacy endpoints, dashboard buttons and position previews unchanged in this package.
- Create `tests/test_chart_studio_position_commit.py` for read-only-deny, proposal scope, stale/race, idempotency, guard, broker return/readback, timeout and audit contracts.
- Modify `tests/test_dashboard_proxy_security.py` for new-route role, cookie, Origin, CSRF, encoded-path and reverse-proxy cases.
- Update `docs/OPEN_TASKS.md` and this plan only with verified implementation/test status; retain the explicit release gate as open.

## Tasks

### Task 1: Lock down the disabled route and request contract

- [x] Add failing tests proving disabled production wiring and attempted `enabled=True` without required dependencies reject before MT5 gateway access or `order_send`. (The request model strictly validates confirmation, preview ID, account, symbol, ticket, revision and idempotency; malformed-payload cases are still to be added.)
- [ ] Run those tests and confirm the expected red failures.
- [x] Add a separate `POST /api/chart/v1/position/commit-stop` route and strict schema. Production app installs it with `enabled=False`, no guard provider and no write-capable service.
- [x] Add the path to exact control middleware so only the existing authenticated trade-session/CSRF/Origin policy can reach its handler.
- [x] Run focused backend and proxy-security tests; confirm disabled deployment remains no-write. (`151 passed`; one unrelated real-app import test could not run because this environment lacks the `MetaTrader5` Python package.)

### Task 2: Bind a confirmed commit to a current preview and broker state

- [ ] Add failing tests for mismatched identity/peer/account/symbol/ticket/revision, expired/consumed preview, altered values, stale quote, invalid tick/stops/freeze geometry and unknown/hard-locked guard. Assert no send in every case.
- [ ] Test that SL-only preserves TP, TP-only preserves SL, explicit clear uses the documented zero-price semantics, and ambiguous/no-op requests are rejected.
- [ ] Test the guard contract separately for hard lock, daily DD/max-risk policy, symbol position cap, and action classification; risk-reducing SL/TP changes do not inherit entry-news blocks, while uncertainty blocks risk increases.
- [ ] Implement scope-bound one-time preview consumption, fresh account/ticket/quote/metadata reads, final revision verification and a fail-closed guard-provider interface under the account gateway lock.
- [ ] Add order-check/retcode handling only where the MT5 adapter supports it; never treat `order_check` as success.
- [ ] Run focused tests and verify all denial cases remain no-send.

### Task 3: Add durable idempotency, broker readback and audit

- [ ] Add failing tests for atomic key reservation, identical duplicate, conflicting key reuse, simultaneous confirms, broker rejection, ambiguous send timeout and restart-safe `UNKNOWN` recovery.
- [ ] Implement a private SQLite store outside the checkout. Persist an idempotency reservation before a single send and append secret-free audit events; reject unsafe DB paths/permissions or missing configuration.
- [ ] After accepted retcode, fetch the authoritative position again and report `SAVED` only when exact requested levels and a new broker revision are read back. Otherwise record `UNKNOWN`/`BROKER_REJECTED`; never retry send automatically.
- [ ] Keep AT-016/AT-017's already-recorded browser draft-abort and simulated trailing-race tests as regression evidence; do not claim this backend package supplies their missing hardware/real-EA race acceptance.
- [ ] Run focused tests, relevant position-preview/proxy regressions, full contract suite and security review.

### Task 4: Review candidate while preserving the release gate

- [ ] Independently review every broker-write path, proxy/firewall configuration, audit persistence and flag wiring; resolve all critical findings.
- [ ] Verify deployed capability remains `brokerMutations=false`; verify authenticated `/stt` cannot reach a write with flag/provider absent.
- [ ] Update FR-007/AT status to distinguish code/test completion from the remaining user-controlled release gate.
- [ ] Do not enable the flag or call a mutation route. Present the reviewed candidate, exact future demo operation list, rollback procedure and security results for explicit user write approval before any demo write E2E.

## Verification commands

- `pytest -q tests/test_chart_studio_position_commit.py tests/test_chart_studio_position_preview.py tests/test_dashboard_proxy_security.py tests/test_dashboard_control_security.py`
- `pytest -q tests/test_chart_studio_broker_reads.py tests/test_chart_studio_evidence_store.py`
- Existing CI workflows on the final `main` SHA.
- Read-only local and authenticated `/stt` runtime identity; capability remains `brokerMutations=false`; no live mutation test.
