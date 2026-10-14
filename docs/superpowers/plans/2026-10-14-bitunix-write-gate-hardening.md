# Bitunix Bridge Write-Gate Hardening

Date: 2026-10-14. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Contain the Bitunix perpetual-futures bridge added to `main` at `c91ec76` until a separately reviewed and explicitly approved write release. The existing code starts an account-scanning worker at module import, defaults it enabled, exposes an unauthenticated toggle POST, and can mirror positions from a funded account. This package must make import/startup/status read-only and keep all exchange mutation paths closed by default. It does not approve, configure, or execute real or demo exchange orders.

## Required behavior

1. Default configuration and missing/corrupt configuration fail closed. A config file alone cannot enable exchange writes.
2. No daemon/thread starts at module import. Application startup registers a worker only when both a private config opt-in and an independent process-level release gate are present; shutdown joins/cancels it safely.
3. The default `BitunixClient` rejects order and close-all calls before any network request. A future release gate must be explicitly injected by the application, not enabled through the browser.
4. The public status route requires a verified dashboard identity and returns no private balances or remote account data while writes are disabled.
5. Remove the unauthenticated browser toggle and any automatic path from dashboard polling to exchange writes. Funded accounts remain excluded from defaults and must not be accepted by any later demo-only allowlist.
6. Tests mock all external calls and assert no network, MT5 session, thread, order, or close request occurs while the gate is closed.
7. Position mappings, cooldowns, reconciliation, and exchange client IDs include canonical account identity as well as ticket; incomplete account scans never authorize a close.

## Verification

Use TDD: add regression tests and observe the current implementation fail without importing `app` or creating a real network/MT5 connection; implement fail-closed behavior; run focused tests, bridge/dashboard-security suites, then the full suite and inspect the final route/thread/write diff. No MT5 terminal control, exchange API call, demo/funded trade, runtime restart, deployment, or Strategy Tester/backtest.

## Release gate

The code remains disabled in the repository and the current running server remains untouched. Enabling or exercising any exchange write requires a separate exact-account/operation review and explicit user approval after the release candidate is reviewable.
