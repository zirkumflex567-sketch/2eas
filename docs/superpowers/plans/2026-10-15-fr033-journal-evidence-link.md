# Journal links to recorded broker lifecycle evidence

Date: 2026-10-15. Parent: [Package 1 evidence capture](2026-10-14-package-1-evidence-capture.md).

## Goal

Let a user check whether a closed broker-journal row has a stored immutable lifecycle record for that exact deal. The request is explicit and read-only, scoped to the row's account and exact deal ticket. A missing record remains `NOT_RECORDED`; never infer entry reasons, fills, or stop history. No Blueberry use in demo acceptance, no write calls, no Strategy Tester/backtest.

## Contract

- Add a control only for closed journal rows, whose `ticket` is the broker deal ticket.
- Fetch `/api/chart/v1/lifecycle/mt5_deal_<ticket>?account=<row-account>` only after the user presses that row's control.
- Render recorded status only if record type, account, event source/quality, and exact `dealTicket` all match the row. Display the observed event type and event/capture time.
- Render 404 as `NOT_RECORDED`; other errors remain `UNKNOWN`/unavailable. Do not turn absence into inferred history.
- Guard stale/detached rows, duplicate clicks, hostile data, account changes, and preserve the existing no-write policy.

## Test-first sequence

1. [x] Add browser contract tests for exact account/ticket request, valid record rendering, mismatched account/ticket rejection, 404 `NOT_RECORDED`, scoped account isolation, and zero POSTs.
2. [x] Verify the expected failure before production edits.
3. [x] Implement the smallest app-level UI/read function, using existing authenticated evidence read API.
4. [x] Run focused journal tests, the full dashboard frontend suite, JS/Python syntax checks, and `git diff --check`.
5. Deploy exact `main`; inspect only explicit, user-authorized demo aliases if live acceptance is needed. Do not use desktop automation.

## Status

- [ ] Commit/push `main`, deploy exact commit to htown `/stt`, and verify the runtime revision and requirement ledger.
