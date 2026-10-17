# FR-021 Secure New-Entry Trade Ticket Implementation Plan

> **For agentic workers:** Use this plan task by task. Do not bypass the separate write-release gate.

**Goal:** Add a chart-price-aware new-entry MT5 ticket with an independent, authenticated confirmation flow, durable one-time proposals, and verifiable broker readback.

**Architecture:** Keep the existing What-if simulator and SL/TP commit path separate. A new ticket preview binds the selected demo account, symbol, pending-order type, volume, entry/SL/TP, fresh quote, broker metadata, and authoritative guard decision to a short-lived server token. A distinct trade-role commit endpoint consumes that token once, revalidates under the account gateway lock, runs `order_check`, reserves durable idempotency/audit state, sends at most once, and confirms only a broker readback. Production wiring stays disabled until the guard, private store, independent review, rollback and explicit user release gate all pass.

**Tech Stack:** FastAPI/Pydantic, account gateway, MT5 Python adapter, private SQLite store, existing Chart Studio Beta and pytest/Chromium contracts.

## Requirements and boundaries

- Cover FR-021 and the new-entry portion of AT-013/014/030/032; do not reuse `/position/commit-stop` or the What-if POST as an order path.
- The chart may transfer a price only into an editable draft. A chart click, drag, or What-if calculation can never send an order.
- Start with MT5 pending LIMIT/STOP orders; validate order mode, trade mode, tick/stops/freeze distances, lot minimum/maximum/step, margin, and fresh current quote from the exact verified demo terminal.
- Allow only `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`. Blueberry and non-demo accounts are rejected before gateway access.
- Require the authenticated `trade` control identity, same-origin/CSRF path, explicit typed confirmation of account, symbol, side and lots, short-lived single-use preview token, canonical idempotency key, and authoritative EA/DD guard. Client-supplied guard claims are forbidden.
- Persist idempotency/audit before broker send. Ambiguous timeouts become `UNKNOWN` and are never auto-retried. Report success only after order/position/deal readback proves the outcome.
- Main runtime installs preview/commit APIs disabled unless all independently supplied dependencies are present. No demo mutation is part of local/CI tests. Keep Strategy Tester/backtests deferred.

## Tasks

### Task 1: Strict disabled API and security path

- [x] Add schema/route contract tests first; prove the disabled route cannot touch MT5.
- [x] Register the new commit path in exact control-path middleware and prove CSRF/Origin/trade-role handling.
- [x] Keep production capability false unless a guard, private store and bound service are all injected.

### Task 2: Fresh, scope-bound proposal preview

- [x] Resolve the exact verified demo session; read fresh quote and symbol rules; validate pending-order geometry and broker lot/margin.
- [x] Bind proposal and guard evidence into a short-lived one-time server token; reject stale quotes, changed account/symbol, invalid price, unknown guard and unsupported broker modes.

Task 2 has fake-MT5 service coverage. A direct read-only probe against all four allowed demo terminals returned `QUOTE_NOT_FRESH`; no risk/margin calculation could proceed. The production app does not install this service, and all trade-ticket routes remain disabled there. Repeat live preview acceptance when broker quotes are fresh; this is not a write-release approval.

### Task 3: Durable single-send commit

- [x] Implement independent proposal consumption, idempotency and append-only audit storage.
- [x] Re-read quote/account/EA guard and symbol rules under the gateway lock; preflight with `order_check`; then send once.
- [x] Verify exact pending order or resulting deal/position by broker readback; handle reject, timeout, restart and duplicate cases without resending.

Task 3 currently has fake-MT5 tests only. The app does not install this commit service and no demo order was sent. The front-end now targets the distinct service contract, but production wiring and the separate release gate remain mandatory.

### Task 4: Chart transfer and explicit confirmation UI

- [x] Add a separate ticket draft UI. Importing the chart price copies it into editable ticket fields without calling the broker.
- [x] Show scope, order type, lots, stop-risk, margin, quote freshness and guard state; require a deliberate confirmation screen plus trade-role session before calling the distinct commit route.
- [x] On scope change, stale data, failed confirmation or unavailable guard, clear/disable the draft and explain why.

The headless Chromium contract proves chart-price transfer is draft-only; the send control requires a current committable preview, trade-session request headers, exact typed confirmation, and a separate commit request. Scope changes clear draft and preview state. The dedicated smoke intercepts all APIs and uses a fixture preview: it does not perform a broker write. Main still does not install live ticket services, and the earlier read-only quote probe returned stale quotes on all four demo terminals.

### Task 5: Review and release gate

- [x] Complete denial/race/idempotency/audit tests and independent review of all write paths and proxy controls.
- [x] Demonstrate production wiring remains disabled and preserve rollback evidence.
- [ ] Only after presenting the exact reviewed candidate, demo account/order list and rollback evidence may a separate user release approval enable controlled demo write/readback acceptance.

Fake-MT5 denial/race/idempotency/audit tests pass and the disabled production wiring is verified. The UI security review found no ticket-write bypass; live service installation, fresh-quote acceptance, candidate-specific release approval, and any controlled demo write/readback test remain open.

## Verification

- Focused fake-MT5 API, service, store and proxy-security tests; all deny paths assert zero `order_send` calls.
- Headless Chromium tests prove price transfer is draft-only and only explicit ticket confirmation targets the separate route.
- Live acceptance is read-only until the release gate. If later approved, test exactly the listed demo aliases and verify broker readback/audit. Never touch Blueberry.
