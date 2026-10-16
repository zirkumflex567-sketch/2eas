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

- [x] Add tests proving disabled production wiring and attempted `enabled=True` without required dependencies reject before MT5 gateway access or `order_send`; malformed/unconfirmed request cases also reject.
- [x] Run the deny/schema tests: RED before route implementation, GREEN afterward.
- [x] Add a separate `POST /api/chart/v1/position/commit-stop` route and strict schema. Production app installs it with `enabled=False`, no guard provider and no write-capable service.
- [x] Add the path to exact control middleware so only the existing authenticated trade-session/CSRF/Origin policy can reach its handler.
- [x] Run focused backend and proxy-security tests; confirm disabled deployment remains no-write. (`178 passed, 1 skipped`; the POSIX permission-mode test is skipped on Windows.)

### Task 2: Bind a confirmed commit to a current preview and broker state

- [ ] Complete the denial matrix; tests cover scope-bound token, expired/consumed/replayed preview, EA revision race, hard lock, geometry, no-send and demo-only account restriction. Focused regressions also cover stale quotes and fresh quotes entering stop/freeze boundaries after `order_check`, changed symbol rules, malformed/unknown guards, role/peer/confirmation failures, and wrong account/symbol pairs including protected-account rejection. Remaining scope: malformed principal tuple shapes and exhaustive tick-boundary cases.
- [x] Test SL-only preserves TP, TP-only preserves SL, explicit clear, and reject ambiguous/no-op requests.
- [x] Test hard lock and conservative BUY/SELL SL/TP action classification with a fake guard, including stop/target tightening, loosening, adding and clearing protection. Authoritative daily DD/max-risk and symbol-position-cap policies remain open; risk-reducing SL/TP changes must not inherit entry-news blocks, while uncertainty blocks risk increases.
- [x] Add atomic scope-bound one-time consumption to the preview registry; expiry, scope mismatch, replay and concurrent consumption tests pass.
- [x] Implement injected commit orchestration with fresh account/ticket/quote/metadata reads, final revision verification and a fail-closed guard-provider contract under the account gateway lock. Production wiring still has no provider and stays disabled.
- [x] Add supported MT5 `order_check` preflight and retcode handling; a successful check is followed by fresh revision/guard validation and is never treated as the broker change.
- [x] Run focused tests (`121 passed` across position preview/commit; `197 passed` with proxy/control security). All new denial paths assert zero broker writes; preflight state-change cases assert zero sends. Remaining denial-matrix gaps are listed in Task 2 above.

### Task 3: Add durable idempotency, broker readback and audit

- [x] Cover atomic key reservation, identical duplicate, conflicting key reuse, competing reservations, broker rejection, ambiguous timeout, readback mismatch and restart-safe `UNKNOWN` recovery in fake/store tests.
- [x] Implement the private SQLite store outside the checkout, wire it to the injected service and persist reservations/audit; unsafe checkout paths and broad POSIX directory permissions are rejected. It remains unconfigured in production.
- [x] After accepted retcode, fetch the authoritative position and report `SAVED` only when exact requested levels and a new revision are read back; otherwise record `UNKNOWN`/`BROKER_REJECTED` without retry.
- [x] Verify browser draft-abort evidence: the Beta smoke and headless live-demo flow confirm account and timeframe changes clear the draft; network trace had zero POSTs. The simulated EA trailing-revision race is covered by `test_commit_rejects_trailing_revision_race_without_sending`; real-EA/hardware race acceptance remains open.
- [x] Run focused tests and position-preview/proxy regressions (`178 passed, 1 Windows-only skip`) and complete independent security review with no blocking findings. Full hardware/EA race acceptance remains open.

### Task 4: Review candidate while preserving the release gate

- [x] Independently review broker-write path, proxy/firewall configuration, audit persistence and flag wiring; no blocking findings.
- [x] Verify deployed capability remains disabled: the real-app regression confirms `position_commit_write_capable=False` and an authenticated commit request returns `COMMIT_DISABLED` before any gateway access; guarded local/htown runtime reports clean matching `main` revisions.
- [x] Update FR-007/AT status to distinguish code/test completion from the remaining user-controlled release gate.
- [x] Keep the live flag disabled and do not call the live mutation route. The user authorized all four non-Blueberry demo accounts for testing; Blueberry remains excluded. A demo-write E2E is still blocked on the remaining guard/store/UI integration.

## Verification commands

- `pytest -q tests/test_chart_studio_position_commit.py tests/test_chart_studio_position_preview.py tests/test_dashboard_proxy_security.py tests/test_dashboard_control_security.py`
- `pytest -q tests/test_chart_studio_broker_reads.py tests/test_chart_studio_evidence_store.py`
- Existing CI workflows on the final `main` SHA.
- Read-only local and authenticated `/stt` runtime identity; capability remains `brokerMutations=false`; no live mutation test.
