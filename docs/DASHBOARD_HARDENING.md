# Dashboard-Härtung: Integrationsstand und Betrieb

Basis: `8562771`, `origin/main`, 2026-10-09. Testbranch: `test/dashboard-audit-hardening`.

## Schutz des parallelen Checkouts

Der Benutzerordner `C:/Users/zirku/Downloads/testing` hat bereits einen ungelösten Konflikt in `app.py` und fremde staged Änderungen (EA/Startskripte/Chart-FX). Dieser Zustand wird **nicht** aufgelöst, zurückgesetzt oder überschrieben. Nach Fetch wurde im isolierten Worktree `C:/Users/zirku/AppData/Local/hermes/cache/scratch/dashboard-audit-integration` main erfolgreich `pull --ff-only` aktualisiert. Backend/UI/Asset-Arbeit geschieht in getrennten Worktrees; nur geprüfte Commits werden integriert.

## Reproduzierbare Windows-Umgebung

```bash
C:/Python314/python.exe -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements-dashboard-test.txt
.venv/Scripts/python.exe -m playwright install chromium
.venv/Scripts/python.exe -m pytest
DASHBOARD_PORT=8060 .venv/Scripts/python.exe app.py
```

`pytest.ini` begrenzt automatische Sammlung auf `tests/`. Die `test_*.py`-Forschungsskripte im Root können Brokerzugriffe beim Import ausführen und werden nicht automatisch gesammelt. Testadapter müssen Mutation und Persistenz isolieren. Read-only Chart-Regressionen sind Sicherheitsnetz, keine Chart-Erweiterung im Rahmen dieser Arbeit.

## Steuerzugriff: lokale Browserfähigkeit und Remote-Grenzen

Die echten Position-/Reset-POSTs verlangen eine browserbezogene Steuer-Sitzung:

1. Gleicher Origin ruft `GET /api/control_session` auf.
2. Backend setzt HttpOnly/SameSite=Strict Sessioncookie und liefert CSRF-Token mit `Cache-Control: no-store`.
3. Browser sendet bei echter Mutation `X-Dashboard-CSRF` plus Cookie.
4. Unbekannter Host, fremder Origin, Cross-Site-Bootstrap und fehlende/abgelaufene Sitzung werden abgewiesen.

Standardmäßig werden Steuer-Sitzungen nur für Loopback erstellt. Die capability schützt gegen fremde Browserseiten/DNS-Rebinding, **nicht gegen Malware oder andere lokale Prozesse**. Der lokale Benutzer ist die Vertrauensgrenze; kein Passwort wurde erfunden oder gespeichert.

Für ausdrücklich freigegebenen Remote-API-Zugriff können Betreiber `DASHBOARD_CONTROL_TOKEN` (Bearer) und `DASHBOARD_ALLOWED_HOSTS` setzen. Secrets nie im Repository oder HTML speichern. Remote-Browser müssen durch einen authentisierten TLS-Proxy freigegeben werden. Forwarded-Headers/Proxy-Peer müssen bewusst konfiguriert sein; eine Proxyverbindung von Loopback kann nicht allein beweisen, welcher Nutzer dahinter sitzt. Diese Härtung ersetzt keine Remote-Login-/Rollenverwaltung.

Chart-Studio-Preview-POSTs sind read-only und werden nicht durch die Mutationsmiddleware verändert. Die Mutationsebene muss darüber hinaus explizites Konto und Positionsscope validieren.

## RED/GREEN – Elternagent

- Fehlende browserbezogene Steuerautorisierung: erwartetes 403, vor Änderung 200; nach Middleware bestanden.
- Appregistrierung: expected403 vorher404, nach Installation bestanden; Testticket999, kein realer Orderversand.
- pytest-Testpfad/Dependency-Datei: beide Assertions vorher fehlgeschlagen; nach Konfiguration bestanden.
- Sicherheitsregressionen: Fremdorigin, Rebindinghost, Cookie/Token, Sessionablauf, Remote-Bearer und unveränderte read-only Chartpreview.
- Baseline aktuelle main: 46 Tests + 16 Subtests grün.
- Zwischenstand Security/Operations: 58 Tests + 16 Subtests grün.

Weitere integrierte Ergebnisse werden vor Merge ergänzt. Keine Daten-/Screenshots mit Konten/Tickets ins öffentliche Repository aufnehmen.
