# Chart Studio / MT5 write-security release gate

**Aktueller Stand (09.10.2026):** Auditfix PR #14 schützt die drei bestehenden Position-/Reset-POSTs mit browserbezogener lokaler Capability, CSRF, Host/Origin und frischen Quellen; Stop-/Freeze-/Tickprüfung und Pflichtaccount sind umgesetzt. Die nachstehende Tabelle beschreibt den historischen Ausgangscommit und ist kein aktueller Befund dieser bereits reparierten Lücken. Remote-Login/Rollen, tatsächliche Tunnel-/Proxy-Abnahme, versionierte Vorschläge/Idempotenz/Readback, Demo-E2E und neue Chart-Writes bleiben offen. Siehe [OPEN_TASKS.md](OPEN_TASKS.md), [DASHBOARD_HARDENING.md](DASHBOARD_HARDENING.md) und [MAIN_CONSOLIDATION.md](MAIN_CONSOLIDATION.md).

**Audit date:** 2026-10-09. **Status: BLOCKED — source inspection only, no server/tunnel verification.**

Scope of this review: `app.py` and `account_gateway.py` at main
`aa7d7d4e7ee47a2ae78025a9ce03a0ac8ae7313d`. This is **not**
a penetration test, remote exposure scan, MT5 demo-account signoff or
approval to activate any new broker mutation.

## High-priority confirmed source findings

| Existing endpoint | Observable checks | Missing from inspected route | Consequence if exposed |
|---|---|---|---|
| `POST /api/modify_position` | MT5 terminal scope, ticket lookup, account identity verified before `order_send` | User/session authentication, request role, CSRF/origin validation, idempotency/revision and guarded stop/freeze checks | A client reaching this route could potentially alter an open position's SL/TP |
| `POST /api/close_position` | Ticket lookup, current symbol tick and identity check before `order_send` | User/session authentication, CSRF/origin validation, two-step confirmation and position version, deduplication | A client reaching this route could potentially close a broker position |
| `POST /api/reset_drawdown` | MT5 account information and explicit update of dashboard reset configuration | Independent user authentication and CSRF protection | An exposed client could tamper with displayed drawdown reference values |
| `POST /api/chart/v1/scenarios/preview` | Read-only broker money calculation; no order placement | Separate rate limiting / proven perimeter authentication | A caller may invoke potentially costly MT5 reads |

The `@scoped(mt5)` decorator and the account identity verification
protect terminal/account routing; **they are not HTTP client authorization**.
The existing token-protected, default-disabled SQLite layout routes are
separate and do **not** protect the legacy trading POST endpoints.

The trading dashboard currently invokes legacy POSTs from JavaScript.
Therefore replacing them with mandatory authorization can interrupt
existing manual operation unless authentication, secure credential
delivery, browser sessions and rollback are designed and tested together.

## Required gates before broker-write deployment

1. Inventory every ingress: local bind address, reverse tunnel/Cloudflare/ngrok,
   proxies, host allowlist, HTTPS termination, DNS, firewall, remote access.
   Treat reachability as **unknown** until independently verified.
2. Design default-deny HTTP authentication for trading write endpoints;
   separate read-only, layout editor, and trade-execution roles. Do not
   embed long-lived credentials in served HTML, URLs or browser LocalStorage.
3. Enforce trusted hosts, same-origin/CSRF protection, Origin validation,
   secure cookies when used, audit logs, request/body and rate limits.
4. Validate scope, identity and ticket ownership on the server on **every**
   write, not based on a browser request parameter. Check risk guards,
   symbol tick/point/tickValue, stop levels and freeze distances. Never
   assume fixed contract size = account-currency conversion.
5. For a proposed stop/target change, use broker-authoritative calculation,
   short-lived proposal IDs and position snapshots/revisions, no silent
   overwrite, explicit final human confirmation, idempotency keys and
   authoritative order-send result + position readback.
6. Test explicitly on BOTH correct MT5 **demo** terminals, including
   mismatched account, expired quote, race with EA trailing SL,
   rejected retcode and delayed broker readback. Zero funded-account testing.
7. Independently review the UI/MT5 release and rollback, obtain the user's
   explicit go-live authorization, and only then enable privileged writes.

## Present scope / restrictions

The Chart Studio beta/indicator/drawing/replay modules remain read-only
with respect to broker trades. Do not introduce new
`/api/chart/.../commit`, `order_send` or order-close behavior based
solely on passing mocked Chromium tests.

**Must remain incomplete:** `/task` 0.7, 4.1–4.5, and AT-013–017/030/032
until perimeter evidence, authenticated broker demo E2E and explicit
release approval exist. No claim of secure external deployment is made.
