# Chart Studio foundation — test branch

Primary requirements: [docs/CHART_STUDIO_MASTER_SPEC.md](../docs/CHART_STUDIO_MASTER_SPEC.md)
Execution: [plan](../docs/CHART_STUDIO_PLAN.md) · [task board](../docs/CHART_STUDIO_TASKS.md).

The first functional **read-only** beta is integrated into the existing dashboard
via `static/chart-studio-beta.js`, using a temporary Lightweight Charts v4 adapter.
It does **not** replace the planned professional v5 engine.

Current features:
- Enable/disable EMA20/50/200; SMA20/50 and Bollinger 20 overlays.
- Draw horizontal/trend/rectangle/Fibonacci tools with time+price anchors, drag
  existing handles, undo/redo, account-scoped *provisional* browser storage and
  JSON export through clipboard.
- Optionally display actual broker position Entry/SL/TP lines and zone overlays
  **without any trading mutation**.
- Read-only What-if plan and JSON API endpoints for a verified MT5 XAUUSD
  quote and `order_calc_profit`/`order_calc_margin` broker pricing.
- No USD exchange-rate fabrication: previews for non-USD accounts are in
  account currency, with USD explicitly unavailable.

Routes: `GET /api/chart/v1/capabilities`,
`GET /api/chart/v1/quotes`,
`POST /api/chart/v1/scenarios/preview`.

## Opt-in serverseitige Chart-Workspaces (SQLite)

Die Layouts liegen nun **zusätzlich** in der privaten SQLite-Datenbank.
Der Speicher ist **standardmäßig ausgeschaltet**, da das ältere Dashboard
noch keinen vollständig geprüften Benutzer-Login besitzt. Die neuen APIs
sind **separat token-geschützt** und handeln niemals auf MT5.

Aktivierung auf dem privaten Windows-Server **vor dem Start** (PowerShell):

```powershell
$env:CHART_STUDIO_STORAGE_ENABLED = "1"
$env:CHART_STUDIO_STORAGE_TOKEN = "<ein-geheim-erzeugtes-zufälliges-Token-mit-mindestens-32-Zeichen>"
$env:CHART_STUDIO_DB = "C:\ChartStudioPrivate\chart_studio.sqlite3"
python app.py
```

Das obige Token ist nur ein **Platzhalter**, niemals als Token übernehmen.
Ein eigenes kryptografisch zufälliges Geheimnis generieren; nicht in GitHub
oder Browser-LocalStorage ablegen. Auf öffentlichen Installationen zusätzlich
HTTPS und eine starke globale Dashboard-Anmeldung einsetzen, **bevor** echte
MT5-Schreibfunktionen aktiviert werden.

Im Chart Studio bei **Server-Layouts** den Token einmalig in das Passwortfeld
eingeben, **Verbinden** wählen und anschließend Serverlayouts speichern,
laden oder löschen. Beim Refresh/Schließen ist der Token weg. Der Browser
speichert weiterhin lokale Layoutprofile unabhängig davon.

Die API ist versionsgeführt und verweigert alte Schreibrevisionen mit
`409 REVISION_CONFLICT`. Die Daten sind nach `owner + account + symbol + name`
isoliert, beschränkt auf bekannte Zeichnungs-/Indikatortypen und Größenlimits.
`DELETE` benötigt ebenfalls die erwartete Revision. Kein stiller Merge.

- `GET /api/chart/v1/workspaces?account=titan&symbol=XAUUSD`
- `GET /api/chart/v1/workspace?account=titan&symbol=XAUUSD&name=...`
- `PUT /api/chart/v1/workspace` mit `expectedRevision` und Dokument
- `DELETE /api/chart/v1/workspace` mit `expectedRevision`

Alle Requests benötigen `Authorization: Bearer <secret>`; ohne serverseitigen
Opt-in gibt der Dienst **503** zurück. Datenbankdateien niemals unter `/static`
anlegen; `state/` und SQLite-Journale sind Git-ignoriert.

**Aktueller Umfang:** Zeichenobjekte, EMA-/SMA-/Bollinger-/Pane-Einstellungen
und Timeframe werden gespeichert. Beim Laden bleibt der **aktive** Timeframe
vorerst unverändert, bis die spätere v5-Layoutverwaltung implementiert ist.
Serverlayouts sind momentan bewusst ein **Single-Owner-Lokalbetrieb**
(gesamtes autorisiertes Terminal), noch keine Multi-User-SaaS-Verwaltung.

Keine echte SL-/TP-Bearbeitung, Positionseröffnung, Replay oder
EA-Entscheidungshistorie wird durch diese Speicherfunktion freigeschaltet.
Die vollständig neue v5-Engine und weitere Master-Spezifikationstasks sind offen.

