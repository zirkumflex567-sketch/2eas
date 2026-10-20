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

Task 2 has fake-MT5 service coverage. On 19 October, the guarded main runtime authenticated the preview route with fresh quotes on all four allowed demo terminals. `titan`, `titan_m5` and `xau5m_500` returned valid `PREVIEW_ONLY` broker risk/margin calculations. `xau5m_m5` correctly failed closed with `INSUFFICIENT_FREE_MARGIN` at 0.01 lot. Every response kept `canExecute=false`, `canCommit=false`, guard `UNKNOWN`, and issued no preview token. The smoke did not call commit and observed zero broker writes or Blueberry requests. This live preview acceptance is not a write-release approval.

### Task 3: Durable single-send commit

- [x] Implement independent proposal consumption, idempotency and append-only audit storage.
- [x] Re-read quote/account/EA guard and symbol rules under the gateway lock; preflight with `order_check`; then send once.
- [x] Verify exact pending order or resulting deal/position by broker readback; handle reject, timeout, restart and duplicate cases without resending.

Task 3 has fake-MT5 tests only; no demo order was sent. The application now constructs the commit service only when the private `CHART_STUDIO_TRADE_TICKET_ENABLED=1` gate is explicitly set. The gate is accepted only as a binary private environment value and defaults to `0`; the idempotency/audit database stays outside the checkout. The independent `DemoEntryGuard` allows only the four non-challenge demo aliases, verified matching terminal identity, USD account data, pending LIMIT/STOP orders at no more than 0.01 lots, stop-risk capped at the lower of USD 5 or 1% equity, reward at least equal to risk, and margin at most half of free margin. The guard denies Blueberry before any broker risk calculation. Unit/API/runtime tests prove the default is inert and all dependencies are bound to the same MT5 gateway. Live write/readback acceptance and independent review remain open; no private production flag was changed.

### Task 4: Chart transfer and explicit confirmation UI

- [x] Add a separate ticket draft UI. Importing the chart price copies it into editable ticket fields without calling the broker.
- [x] Show scope, order type, lots, stop-risk, margin, quote freshness and guard state; require a deliberate confirmation screen plus trade-role session before calling the distinct commit route.
- [x] On scope change, stale data, failed confirmation or unavailable guard, clear/disable the draft and explain why.

The headless Chromium contract proves chart-price transfer is draft-only; the send control requires a current committable preview, trade-session request headers, exact typed confirmation, and a separate commit request. Scope changes clear draft and preview state. The dedicated browser smoke intercepts APIs and uses a fixture preview; the live server-side preview smoke separately confirms the authenticated read-only API behavior with fresh data. Neither smoke calls commit or performs a broker write.

### Task 5: Review and release gate

- [x] Complete denial/race/idempotency/audit tests and independent review of all write paths and proxy controls.
- [x] Wire the production commit service behind a private, binary feature gate that defaults to disabled; keep the store outside the checkout.
- [x] Demonstrate default production capability remains disabled and preserve rollback evidence.
- [ ] Only after presenting the exact reviewed candidate, demo account/order list and rollback evidence may a separate user release approval enable controlled demo write/readback acceptance.

Fake-MT5 denial/race/idempotency/audit tests pass; the new risk guard and private runtime factory tests pass. The UI security review found no ticket-write bypass. The product flag remains off on all live runtimes. Live service activation, a controlled order candidate, post-send/cancel readback and operational rollback remain open. The user's broad authorization permits demo use except Blueberry; do not query Blueberry. No broker order has been sent.

## Verification

- Focused fake-MT5 API, service, store and proxy-security tests; all deny paths assert zero `order_send` calls.
- Headless Chromium tests prove price transfer is draft-only and only explicit ticket confirmation targets the separate route.
- Live acceptance is read-only until the release gate. If later approved, test exactly the listed demo aliases and verify broker readback/audit. Never touch Blueberry.
