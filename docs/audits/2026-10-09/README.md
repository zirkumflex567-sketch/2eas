# 2EAS — Code-, Performance- und UX-Audit

**Datum:** 2026-10-09  
**Untersuchter Stand:** `main` bei Auditbeginn, Commit `5244b9e8fa9315284b78c70f1b9f1f1204ee9b7a`  
**Schwerpunkt:** Reaktionszeit, CPU-/Rendering-Aufwand, UI-Assets, Chart-FX, visuelle Konsistenz und mobile Benutzbarkeit.  
**Art:** Statisches Repository-Audit mit Quellcode-/Asset-Inspektion; **kein** gemessener Lighthouse-, Live-MT5-, Browser-FPS- oder visueller Screenshot-Vergleich. Keine Quellcode-Reparaturen im Rahmen dieses Reports.

## Kurzfazit

Der vielversprechendste Performance-Hebel liegt bei `account_gateway.py` und `app.py`: Jede Dashboard-Abfrage wird serialisiert und verbindet MT5 vollständig neu. Der Statuspfad lädt umfangreiche Marktdaten und baut auch das Journal wiederholt auf. Gleichzeitig erzeugen Frontend-Polling, vollständiges DOM-Rendering, grafikintensive Themes und chartbasierte Dekoration zusätzliche Arbeit. Ein optischer Qualitätstest ist als **offen** gekennzeichnet, solange kein gerendertes Ergebnis im echten Browser überprüft wurde.

## Priorisierte Befunde

| ID | Priorität | Befund / Wirkung | Evidenz | Status |
|---|---|---|---|---|
| PERF-01 | P1 | Globale MT5-Sperre und `shutdown()/initialize()/shutdown()` pro Request erhöhen Latenz und blockieren parallele Abfragen. | `account_gateway.py:83-109`; `app.py:630-654` | Quellcode bestätigt |
| PERF-02 | P1 | Statusintervall 1,5 s + Candles 5 s + Journal 30 s; der Status berechnet komplette Indikatoren/Volumen/Journale neu. | `app.py:242-273,573-615,2543-2561` | Quellcode bestätigt |
| PERF-03 | P1 | UI-Pakete: 37 referenzierte Ready-Assets mit **34,31 MiB summierten Dateigrößen**; nicht gleichzusetzen mit tatsächlichem Initialtransfer. | `static/stone-asset-skin.css`, `static/stone-cockpit.css`, Git-Tree/Dateigrößen | Repository-Messung |
| PERF-04 | P1 | Volumenprofil arbeitet mit `DataFrame.iterrows()`, zusätzlich historische Deal-Suche und Python-Listen-Nests im Journal. | `app.py:92-108,157-239` | Quellcode bestätigt |
| PERF-05 | P1 | Reihen/Positionen werden bei jedem Status-Poll durch `innerHTML` ersetzt; Editierfokus und ungespeicherte SL/TP-Werte sind gefährdet. | `app.py:1984-1991,2003-2029,2089-2139` | Aus Code ableitbar; interaktiv testen |
| PERF-06 | P1 | Browser nutzt Tailwind Play-CDN anstelle einer kompilierten Produktions-CSS-Datei. | `app.py:884` | Quellcode bestätigt |
| PERF-07 | P2 | Chart-FX rendert/tickt dauerhaft alle 100 ms, auch in Leerlaufphasen; Koordinaten/DOM-Größen werden aktiv abgefragt. | `static/stone-chart-effects.js:46-74,281-313,388-433` | Quellcode bestätigt |
| PERF-08 | P2 | Zusätzliche sechs native EMA-Glow-Serien werden mit Chartdaten gepflegt, obwohl vollständig transparent. | `app.py:1620-1629,1775-1783,1802-1807`; `stone-chart-effects.js:35-44` | Quellcode bestätigt |
| VIS-01 | P1 | Viele dauerhaft animierte Sparks, Vapor-, Schatten- und Filtereffekte erzeugen unnötiges Paint-/Compositing-Risiko. | `static/stone-cockpit.js:136-168`; `static/stone-asset-skin.css:574-667` | Quellcode bestätigt; FPS offen |
| VIS-02 | P2 | Tabellen-Minimalbreiten, kleine `9px`/`10px`-Texte und CSS-Overrides sind potenzielle Responsive-/Lesbarkeitsprobleme. | `app.py:2007-2025`; `stone-asset-skin.css:485-508,905-920` | CSS bestätigt; Screenshot-QA offen |
| VIS-03 | P2 | Acht Grafikassets wurden im Processing-Report explizit für manuelle Kontrolle vorgemerkt. | `static/stone-assets/ready/processing-report.json` | Review ausstehend |
| COR-01 | P2 | `/api/status` benennt `ema21` als `ema20`, `/api/candles` berechnet echte EMA20; dadurch können Zahlen und Chart abweichen. | `app.py:261-265,584-590,665-669` | Quellcode bestätigt |
| QA-01 | P2 | Vorhandener CI-Workflow triggert nicht automatisch auf `main`; kein reguläres Performance-/Visual-Regressions-Gate erkennbar. | `.github/workflows/prepare-stone-assets.yml:3-12`, Repository-Tree | Quellcode bestätigt |

**Prioritätsdefinition:** P0 = akuter Blocker/Datenverlust nachgewiesen; P1 = hoher Aufwand/konkretes UX-/Leistungsrisiko; P2 = mittlere Optimierung/Risiko; P3 = kosmetisch. **Keine** P0-Ausfallbehauptung ohne Live-Reproduktion.

## Empfohlene Umsetzung in vier Etappen

1. **Backend zuerst:** MT5-Anbindung entkoppeln/cachen, sichere accountgetrennte Worker/Snapshots evaluieren, langsame Indikatoren und Journale nicht pro Tick neu rechnen. **Keine** Änderungen an Order-/Risk-Gates ohne Tests.
2. **Polling + UI stabilisieren:** getrennte Light-Status- und Heavy-Candle-/Journal-Pfade, Delta-Updates, gezieltes Rendern geänderter Elemente, Editierzustand beibehalten. Abbruch/Generation bei Account- und Timeframewechsel erhalten.
3. **Asset- und Effekt-Budget:** PNGs optimieren, responsive Größen, Screenshots der Cutouts kontrollieren, Animations-Presets (Off/Low/Full), 100-ms-Renderloop ereignisgesteuert; sechs transparente Chartserien entfernen, sofern Regressionstests gleichbleibende Chartdaten bestätigen.
4. **Visuelle QA + CI:** Browser-Matrix (Desktop/Tablet/Mobil), Profiler, Netzwerk-Waterfall, 1%-low-FPS/Long Tasks, Farbkontrast, DOM-Bedienung, Chart-FX-Probe und Golden Screenshots; erst anschließend Performancegewinn beziffern.

## Reports

- [PERFORMANCE.md](./PERFORMANCE.md): Architektur, Hotspots, Asset-Budget, Optimierungsschritte.
- [VISUAL_UX.md](./VISUAL_UX.md): Layout-/Designprüfung, visuelle Risiken, UI-Abnahmekriterien.
- [VALIDATION_PLAN.md](./VALIDATION_PLAN.md): Messverfahren, Testmatrix und Done-Kriterien.

## Grenzen dieses Audits

Repository-Byte-Größen sind **nicht** identisch mit Browser-Transfergröße, Paint-Zeit, tatsächlicher Seitenladezeit oder Speicherverbrauch. Es lagen **keine** laufende lokale MT5-Instanz, kein Chrome-Performance-Trace, kein Headless-Browser-Screenshot der Live-Ansicht und keine repräsentativen Realzeit-Latency-Messungen vor. Es wurden keine Tests als bestanden behauptet. Das Audit verändert keine Handelslogik, kein Risiko-Management und keine Produktions-UI.

## Externe technische Referenzen

- Tailwind Play-CDN nur für Entwicklung: https://v3.tailwindcss.com/docs/installation/play-cdn
- Render-Pipeline und CSS-Animationen: https://web.dev/articles/animations-guide
- Responsive Bilder: https://web.dev/articles/serve-responsive-images
