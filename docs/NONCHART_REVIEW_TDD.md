# Nonchart review fixes — TDD evidence

Scope: branch `test/audit-review-ui`, base `142c4b2`. Production changes are confined to `HTML_CONTENT` nonchart logic in `app.py`. No chart functions, static assets, backend handlers, real MT5 orders or live config writes changed.

Run with `C:/Python314/python.exe -m pytest tests -q`. Browser fixtures AST-extract the actual HTML, serve real local assets and intercept every API request. The payload integration test then submits the captured browser JSON to the existing broker-isolated backend fixture; its `order_send` is a mock and persistence paths are temporary fixture directories.

## Vertical RED → GREEN evidence

Local logs are in `../audit-review-ui-evidence/` (generated artifacts outside the worktree); each RED ran before its production fix. Logs `01`–`08` use `04a` and `04b` for the two independent journal findings.

| Logs | Reproduction / expected RED | Verified GREEN |
| --- | --- | --- |
| `01-*` | Actual `applySLTP` emitted `tp_usd:0` instead of removal | Captured payload exactly `{ticket:101,sl_usd:0,remove_tp:true}`; isolated handler sends SL at entry price and TP at zero |
| `02-*` | Same ticket still showed entry `$4000.00` after a `$4005.00` poll | `data-position-entry` refreshed; same input node, focus and dirty value preserved |
| `03-*` | Quick BE/SL/TP left the old map draft (`-37.00` / `37.00`) | All three quick actions publish one synchronous bubbling input event; pending/rejected sends plus status polls retain the quick draft; newer manual edits survive successful completion |
| `04a-*` | `type:null` rendered `SELL` | Explicit `UNBEKANNT`, never SELL |
| `04b-*` | API `<img onerror>` executed (`apiInjected == 1`) | Reasons, goal, times, matrix names/notes/live text, diagnosis, account-name attributes and exit-goal notes remain literal text; no injected images or script execution |
| `05-*` | Permanent accounts 503 showed `0 Aktiv`; early clear left stale matrix-time and loading-only state | Initial and pre-chart clear show unknown risk/position/matrix placeholders and disabled actions; no page errors |
| `06-*` | Open reset modal kept old `$10000.00` balance after poll | Read-only balance, DD and reset status refresh; edited baseline value/node/focus stay unchanged; unknown values remain unknown and disable submission |
| `07-*` | `source_fresh:false`, aged/future/null source data and repeated receipts all remained LIVE | STALE and disabled manual actions independently of successful HTTP receipt; valid source recovers automatically |
| `08-*` | Gold guard note omitted explicit source-vs-EA distinction | EA heartbeat explicitly unknown; known-account/source/risk manual operator actions remain available despite unverified EA baseline, without claiming EA confirmation |

Existing behavior was verified without a production rewrite: legacy payloads with **all** source metadata absent remain compatible; the journal recording label remains explicitly dated `08.10.2026 23:00 UTC` and states that open positions are independent of entry day (no old “Heute 20:00” label).

## Contract details for parent integration

- `status.source_fresh`: boolean. Only strict `true` is eligible once metadata is present; `false` always blocks manual mutations.
- `status.quote_time_epoch`: finite numeric Unix epoch **seconds**, not milliseconds.
- `status.quote_age_seconds`: finite numeric age in seconds. Both source epoch and reported age are checked; accepted range is `[-5,30]` seconds. Reported age advances locally between receipts; epoch time cannot be rejuvenated by repeated HTTP responses.
- Missing all three properties supports old fixtures only. Partial, null or malformed metadata fails closed. Normal fixtures now carry all three numeric/fresh fields.
- The existing six-second status receipt watchdog remains an independent requirement; known account identity and finite risk fields are also required.
- UI TP USD zero means **no fixed TP**, implemented as `remove_tp:true` with `tp_usd` omitted. SL USD zero remains backend break-even. Positive TP keeps the USD target contract.
- `data-position-entry` marks the read-only ticket/open-price display. `setPositionDraft` uses the existing delegated input handler; it adds no new draft persistence model.
- Modal read-only fields refresh from the latest status. `dd-reset-input` is deliberately not rewritten during polls.
- EA baseline validity and MT5 quote freshness are not an EA heartbeat or execution acknowledgement. Gold manual actions require known account/source/risk but are not prohibited solely by `baseline_verified:false`, per parent decision.

## Final verification

- Full broker-isolated suite: **226 passed, 203 subtests passed**, 192.39 seconds (`full-suite.log`).
- Inline JavaScript syntax: **OK (1 block)**, via `scripts/check_frontend_syntax.py`.
- `git diff --check`: passed.
- `scope-verification.json`: backend prefix unchanged from base; chart engine/control functions unchanged; no static changes. Unchanged chart engine SHA-256: `ae5cadd02253410bf78155a4e0ec727508394bebb176620eea915637c51028b8`.

Parent must rerun integration tests after merging its independently changed backend source-fresh/root-path logic and newer chart branch. The browser-to-handler fixture gives its isolated tick a current epoch for that integration; it never contacts a broker.
