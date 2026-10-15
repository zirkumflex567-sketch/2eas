# Read-only demo broker lifecycle capture

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Advance FR-026/035, AUD-09/11/12 and AT-049/055/056 by recording actual MT5 deal facts into the existing immutable evidence store, independently of an open browser. This does not reconstruct EA decisions, synthesize fills, or mutate broker state. It is opt-in and accepts explicitly named demo accounts only; the Blueberry funded account is rejected by configuration validation. EA event producers remain gated on chart-bound source/binary/preset proof.

## Contract

- Explicit comma-separated account aliases, all configured as demo, with duplicate terminal/login identities rejected.
- Deal history is read under the existing account gateway lock and verified terminal identity, bounded to a rolling 48-hour initial recovery window plus a five-minute overlap, with bounded paging and polling off the event loop.
- Only verified executed XAU deal records are captured. Stable IDs use broker deal tickets; appends are idempotent. Broker event time and capture time are both preserved. Complex reversal deals remain `POSITION_OBSERVED`; no decision or position-close completion is inferred.
- The private EvidenceStore is the only writer. There is no HTTP append route. A missing store, failed broker read, limit, or storage error yields explicit internal `UNKNOWN`/loss state and never blocks the app or EA.
- Feature remains disabled unless both the existing private store and the explicit demo-account allowlist are configured.

## Test-first files and acceptance

1. `tests/test_chart_studio_broker_lifecycle_capture.py`: account allowlist gate, canonical event conversion, exact deal-entry semantics, account/symbol/source validation, duplicate-idempotent store appends and failure isolation.
2. `chart_studio/broker_lifecycle_capture.py`: bounded polling service and pure mapping.
3. `chart_studio/evidence_models.py`, `chart_studio/evidence_api.py`, `app.py`: optional capture timestamp validation and opt-in application lifecycle wiring.
4. Run focused tests and relevant evidence/read API suites. No strategy tester, order route, terminal launch, or EA/chart modification. Live demo verification is still a separate acceptance gate.

## Rollback

Unset `CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS` to disable the worker. Existing read APIs and immutable records remain unchanged.

## Fortschritt 15.10.2026

- [x] Read-only deal history capture als separater, explizit konfigurierter Demo-Worker implementiert; er nutzt bestehende verifizierte Account-Sessions und `trades_read`, ohne `order_send` oder Chart-/EA-Änderungen. Die private Store-Append-Strecke ist idempotent und bewahrt Brokerzeit plus Capturezeit und tatsächliche Deal-/Kontierungsfelder.
- [x] Allowlist muss private Store-Konfiguration, eindeutige Alias-/Terminalidentität und `is_demo is True` erfüllen. Blueberry kann nicht konfiguriert werden. Worker startet nur mit `CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS`; Laufzeitumgebung bleibt standardmäßig unverändert.
- [x] Recovery/Gap-Vertrag: 48 Stunden initialer Lookback, 5 Minuten Overlap nach Erfolg, 500er Paging bis 50.000 Historieneinträge, keine Fortschrittsmarke bei Lese-/Store-/Validierungsfehlern, Fehlerstatus mit `UNKNOWN`/Gap.
- [x] MQL5-Deals `IN`, `OUT` und `OUT_BY` werden als Broker-Entry-/Exit-Fakten gespeichert; `INOUT` bleibt `POSITION_OBSERVED`. Der Worker behauptet weder eine vollständige Positionsschließung bei Teilvolumen noch EA-Entscheidungen. Unit-/Konfigurationstests decken Fail-closed gegen Funded-Konto und Retry/idempotente Wiederholung ab.
- [x] Worker-Regression `tests/test_chart_studio_broker_lifecycle_capture.py`: 20 Tests bestanden. `main` wurde über den Guard mit unverändertem Commit/Digest neu gestartet (`2d4a869`, sauber, `restart_required=false`). Die private Store-/Allowlist-Konfiguration wurde auf die vier vom Nutzer freigegebenen Demo-Aliasse gesetzt; kein Blueberry.
- [x] Read-only Live-Abnahme: der private Store enthält 71 verifizierte MT5-Deal-Lifecycleereignisse — `titan` 13, `xau5m_m5` 23, `titan_m5` 23, `xau5m_500` 12. Eine authentisierte Status-Route ist auf die vier expliziten Demos beschränkt und leakt keine internen Details. Sie half, Float-Präzisionsartefakte in den Geldfeldern als Ursache von vier abgewiesenen Deals zu identifizieren. Die deterministische 12-Stellen-Normalisierung besteht die Regression und der Folgepoll aller vier Demos meldet `OK`, null Abweisungen/Store-Verluste und keine Gap-Meldung. Blueberry wurde nicht abgefragt. Keine Handelsmutation, Order oder Backtest.
- [ ] Unabhängige Code-Review-/resultierende Main-CI-Abnahme des Workers bleibt offen, falls sie nicht durch einen späteren Code-Commit nachgewiesen wird. EA-Decision-Hooks und Quell-/Preset-/In-Memory-Identität bleiben mangels chartgebundener Attestierung offen; Marketplace-EX5 bleibt geschlossen.
- [ ] EA-Quellinstrumentierung und reale Candidate/Reject-Provenienz bleiben von chartgebundener Identitätsattestierung abhängig; Marketplace-EX5 bleibt geschlossen.
- `scripts/dashboard_runtime.ps1`: private environment allowlist is tested in both runtime validation and the guarded Windows cross-shell launcher; no runtime values are logged.
