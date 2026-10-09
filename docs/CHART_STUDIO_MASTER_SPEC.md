# 2EAs CHART STUDIO — VERBINDLICHE MASTER-SPEZIFIKATION

**Zweck:** Vollständiges, agentenfähiges Pflichtenheft zur Entwicklung einer TradingView-artigen, aber eigenständigen, professionellen Chart-Arbeitsoberfläche für 2EAs.
**Status:** Design- und Implementierungsauftrag, KEIN bereits implementiertes Feature.
**Stand der Repository-Prüfung:** 09.10.2026.
**Ziel-Repository:** https://github.com/zirkumflex567-sketch/2eas
**Verbindlicher Dateiname:** docs/CHART_STUDIO_MASTER_SPEC.md
**Sprache der UI:** Deutsch, technische Identifikatoren/JSON/Tests Englisch.
**Leitgedanke:** Die visuelle Freiheit von TradingView, die Präzision und Sicherheit von MT5, und die mechanisch-mythische 2EAs-Identität — ohne Handelsfunktionen zu simulieren oder TradingView-Produkte zu kopieren.

---

## 0. Auftrag an den späteren Coding-Agenten (UNBEDINGT LESEN)

Setze diese Spezifikation als echte, produktionsfähige Erweiterung des EXISTIERENDEN Repositories um. Erstelle nicht nur Mockups, Screenshots oder eine zweite isolierte Demo. Das bestehende Cockpit mit **XAU Titan Pro** und **GoldM15 Reconstruction**, den Echtzeitdaten, dem Gesamtjournal, den Schutzmechanismen und dem optionalen Stone-Design muss weiter funktionieren.

**Arbeitsmodus:**
1. Zunächst Code- und Sicherheits-Audit. Ermittle den zu Beginn tatsächlich aktuellen Main-HEAD, die Git-Branches, den Chart-Bibliotheksstand und die durch Tests abgesicherte vorhandene Funktionalität. Vertraue nicht blind auf die Dateinamen/Zeilennummern aus diesem Dokument.
2. Schreibe für jede Entwicklungsphase ein kurzes internes Issue-/PR-Arbeitsprotokoll, aber KEINE weiteren konkurrierenden Anforderungsspezifikationen. Dieses Dokument bleibt die einzige Master-Quelle.
3. Implementiere stufenweise in Feature-Branches mit kleinen, nachvollziehbaren Commits. Erst nach automatisierten und manuellen Abnahmetests via PR nach main. Niemals Trading- und Chart-Renderer in einem ungetesteten Komplettrewrite ersetzen.
4. Mache echte Features statt Dekoration: Ein Indikator muss rechnen, eine Zeichnung muss editierbar und persistent sein; ein SL/TP-Drag muss eine valide Vorschau und nach Bestätigung eine nachweisliche MT5-Rückmeldung liefern.
5. Bei fehlenden Daten, inkompatiblen Brokern oder Sicherheitsfehlern: ehrlich als nicht verfügbar/gesperrt anzeigen, niemals fingieren oder stillschweigend mit einem anderen Konto fortfahren.
6. Kein selbstständiges Absenden von Orders, keine automatischen Setups und keine Veränderung der EA-Handelslogik durch Visual-Features. Jede reale Handelsmutation benötigt eine gesondert bestätigte Benutzeraktion.
7. Dokumentiere in PRs jeweils erfüllte Anforderungen anhand der IDs [FR-xxx], [SEC-xxx] und Abnahmetests [AT-xxx] dieses Dokuments.
8. Mache vor der ersten Migration eine Regressionstest-Baseline und vor dem Merge mindestens einen Windows-MT5-End-to-End-Test in einem Demo-Konto. Keine echte Order nur zum Testen auf einem funded/live Konto.

**Ergebnisdefinition:** Der Benutzer öffnet das bestehende Dashboard und findet dort ein sofort nutzbares, vollständiges **Chart Studio** mit frei konfigurierbaren Indikatoren, Multi-Panes, Zeichenwerkzeugen, Positionen und dragbaren SL-/TP-Zonen, kontextsensitiven USD-Berechnungen, gespeicherten Layouts und allen bisherigen 2EAs-Funktionen.

## 1. Ausgangslage: überprüfter IST-Zustand (09.10.2026)

- Zentraler FastAPI/MT5-Server und bisherige HTML/JS-Dashboard-Anwendung: **app.py**.
- Chart: in **static/lightweight-charts.js** gebündelte TradingView **Lightweight Charts v4.1.3** (siehe License-Header), über direktes LightweightCharts.createChart, addCandlestickSeries und addLineSeries; momentan kein React-/Vite-/TypeScript-Chart-Projekt.
- Aktuell sichtbare EMA-Reihen: EMA20, EMA50, EMA200; M1, M5, M15, M30, H1, H4, D1. Der Titan-EA selbst verwendet teils EMA9/21/50 — strikt zwischen **Chartindikatoren** und **EA-Regellogik** unterscheiden.
- Kerzen-Datenquelle: GET /api/candles?account=...&tf=..., momentan maximal 1000 Bars pro Request; Python berechnet verfügbare EMA-Reihen und historische Setup-Marker; Tages-/Wochen-POC, High/Low werden in sr_levels geliefert.
- Accountstatus und Positionen: GET /api/status?account=..., beide Accounts werden aus **account_gateway.py** mit jeweils genau verifiziertem Terminal/Login/Server und einem gemeinsamen MT5-Session-Lock bedient.
- Vorhandene Trading-Aktionen: POST /api/modify_position, POST /api/close_position; SL/TP bisher überwiegend durch Eingaben im Positions-Panel. Eine aktuelle Preis-/USD-Umrechnung benutzt dort teilweise **volume × contract_size** als Näherung; **für das Chart Studio darf das nicht als allgemeingültige Geldwertformel übernommen werden**.
- Trade-Journal: GET /api/journal_summary?account=... und die wiederhergestellte Auswahl **Alle Strategien / Titan / GoldM15**. Nicht verlieren.
- Zusätzlich vorhandene UI-/FX-Module: **static/stone-cockpit.js**, **static/stone-chart-effects.js**, **static/stone-celebrations.js**, **static/stone-asset-skin.css** und die 50 Stone-Assets in **static/stone-assets/ready/**. Das optische Thema ist von der Handelslogik entkoppelt zu halten.
- Aktuell: Chart-Vergrößern-Button, Preislevel-Legende, Volumenprofil, Marker, Zeichen-/Zoom-Mittel. Es gibt bisher **keine vollwertige native Zeichenobjektverwaltung**, keinen kompletten Indikator-Editor und keine validierten, editierbaren Broker-SL-/TP-Zonen direkt im Chart.

### 1.1 Besonders zu schützende Funktionen

- Kontowechsel mit strikter MT5-Identitätsprüfung (kein Fallback auf anderes Terminal).
- EA-Risikobeschränkungen, Tages-DD/Guard-Status, Strategie-Signale und EA-MQL5-Dateien.
- Signale vs. tatsächlich ausgeführte Trades vs. simulierte FX-Tests müssen getrennt bleiben.
- Journal-Filter, historische Trades, aktuelle Positionen, Positions-Schließen, bestehende SL-/TP-Buttons.
- Chart-Zeitfenster, Zoom/Pan, verifizierte Preis-/Volumendaten, genaues Preislevel, Fullscreen.
- Styles Stone/Dark/Light, reduzierte Bewegung, Funken/FX optional (kein Dauer-Glow).
- Betriebliche Nutzung in Windows und über Reverse-Tunnel/Handy.

## 2. Technologiebeschluss und Lizenzgrenzen [ARCH-001]

**Empfehlung/Entscheidung:** Eigenständiges **2EAs Chart Studio** mit einer **aktuell unterstützten Lightweight-Charts-v5.x-Version** und deren offiziellen Plugin-Primitives bauen. v4.1.3 **nicht** ungeprüft mit v5-API mischen. Vor einem Release die tatsächlich verfügbare stabile Version, npm-Lizenz, Release Notes und API-Typen prüfen und exakt locken. Die v4→v5-Migration bekommt einen eigenen Test-Gate.

V5-Aspekte:
- Neue Serienanlage über addSeries(SeriesType, options), nicht blind das v4-API addLineSeries übernehmen.
- Marker über createSeriesMarkers statt ungeprüft series.setMarkers.
- Series primitives für preis-/zeitabhängige Linien, Fibonacci, Shapes, Labels, Interactive Handles und Axis-Labels.
- Pane primitives für pane-weite Hilfsgrafiken. Custom series nur für tatsächlich eigenständige Datendarstellungen.
- Hit-Testing / Drag-Interaktion in einer zentralen Zeichen-Engine behandeln; nicht 30 unabhängige absolut positionierte HTML-Pixel-Overlays bauen.
- Koordinaten und Chart-Skalen von der Bibliothek beziehen. **Immer** denselben Plot-Koordinatenraum verwenden; frühere EMA-Glow-Versatzfehler aus dem Repo dürfen nicht wiederkehren.
- Für HTML-Bedienelemente außerhalb des Plotbereichs kontrollierte DOM-Layer; Charts, Tooltips und Zeichnungen bleiben auf Resize, Pan, Zoom, Fullscreen und DPI korrekt verankert.

**Lizenz:** TradingView Advanced Charts/Trading Platform ist keine frei kopierbare Open-Source-Version des TradingView-Webprodukts und darf ohne passende Lizenz nicht in diesem Repo eingebettet/veröffentlicht werden. Open-Source Lightweight Charts (Apache 2.0) ist die vorgesehene Grundlage. Den Namen **2EAs Chart Studio** als eigenes Produkt verwenden. Keine fremden UI-Grafiken, Skripte, inoffiziellen Advanced-Charts-Bundles oder Markenassets übernehmen.

**Abwägung:** Andere Engines (z. B. Apache ECharts, eigene WebGL-Chart-Engine) dürfen nur nach schriftlich belegtem Proof-of-Concept für dragbare Objekte, Präzision, Performance und Wartbarkeit gewählt werden. Kein späterer Bibliothekswechsel nur aus Geschmacksgründen.

**Vorgeschlagener Frontend-Aufbau:** modularer TypeScript-Code mit Vite, klaren Interfaces und gebündelten Assets unter dem vorhandenen FastAPI-/static-Mount. Keine komplette Umstellung des Cockpits auf React als Pflicht; Framework-Freiheit ist nur innerhalb einer isolierten Chart-Studio-Mount-Komponente zulässig. REST für Stammdaten/Transaktionen, optional WebSocket/SSE für Read-only Market-Updates. Nutze aktuelle Versionen und Lockfile. UI bleibt bei lokalem Start auch ohne Internet lauffähig.

## 3. Produktprinzipien und Invarianten [ARCH-002]

1. **Chart vs. Broker:** Der Chart ist die Präsentation. Broker/MT5 bleibt einzige Wahrheit für Positionen, Orders, SL/TP und Fills.
2. **Anzeige ist nicht Ausführung:** Vorschau, Phantom-Level, Zeichenwerkzeuge und USD-Labels dürfen niemals stillschweigend Broker-Orders verändern.
3. **Symbol/Account-Bindung:** Jeder Request, jedes Objekt und jede Aktion hat die exakte Konto- und Symbolidentität.
4. **Zeit-/Preis-Bindung:** Zeichnungen verwenden UTC-Time-Anker/Preise, niemals persistierte Pixelkoordinaten.
5. **Visual FX hinter Funktion:** Effekte dürfen keine Kerzen, Level, Griffe, Labels oder Buttons verdecken; während einem Drag und Confirm-Dialog FX pausieren.
6. **Nicht vorhanden ≠ 0:** Fehlende, veraltete oder unberechenbare Preise/FX-Konversionen als „— / nicht verfügbar“ anzeigen.
7. **Geld immer eindeutig:** Account-Currency-Wert, USD-Wert, Gebühren-/Swap-Schätzung und Broker-bestätigter Ist-Wert klar unterscheidbar.
8. **Undo nur für lokale Zeichnungen:** Reale MT5-Handelsoperationen niemals über eine visuelle Undo-Animation „zurücknehmen“.
9. **Optimistischer Konfliktschutz:** EA- oder MT5-seitige Änderungen während eines SL/TP-Drags erzwingen Neuabgleich statt Überschreiben.
10. **Alle Änderungen rückbaubar:** Alt-Chart bleibt bis zur finalen Freigabe hinter Feature-Flag verfügbar.

## 4. Informationsarchitektur und Bildschirm [UI-001]

### 4.1 Desktop: 5 Bereiche

**Obere Chart-Command-Bar** (bleibt im Vollbild sichtbar):
- Account / Brokerstatus / Symbol / ausgewählter Charttyp / Timeframe / Echtzeitverbindung.
- Symbolsuche/Favoriten; verfügbare MT5-Symbole statt hart kodierter Symbolpalette.
- Charttypen: Kerzen, Hollow Candles, OHLC-Bar, Linie, Fläche, Heikin Ashi (synthetischer Charttyp immer als solcher erkennbar), optional Renko erst später und nur korrekt berechnet.
- Zeitfenster: mindestens M1/M5/M15/M30/H1/H4/D1; W1 und MN1 nach sauberem Backend-Support.
- Anzeige/Indikatoren, Zeichnen, Positionen, SL/TP-Zonen, Layout, Einstellungen, Screenshot/Export, Vollbild, FX.
- Trading-Zustand: **NUR LESEN**, **HANDELN BEREIT** oder **HANDELN GESPERRT** – eindeutig und dauerhaft sichtbar.
- Symbol-/Konto-/Timeframe-Wechsel bewahrt den gültigen View-State und lädt keine fremden Positionen.

**Linke Werkzeugleiste** (ein- und ausklappbar, gruppiert, Tooltips + Shortcuts):
- Cursor, Crosshair, Fadenkreuz+Messen, Trendlinie, horizontal/vertikal/Strahl, paralleler Kanal.
- Fibonacci Retracement/Extension, horizontale Fibo, Trend-Fibo, Time-Fibo (spätere Phase).
- Rechteck/Zone, Kreis/Ellipse, Pfad, Pfeil, Text/Callout, Long-/Short-Position-Messwerkzeug, R:R-Projektion.
- Auswahl/Mehrfachauswahl, Lock/Unlock, Magnet/Snap, Rückgängig/Wiederholen, Löschen.
- Favoriten-Werkzeuge; Cursorprofil für Chart-Navigation vs. Objektbearbeitung.

**Chart-Mitte**:
- Hauptpreispane und optionale zusätzliche Indikator-Panes (eigene Preisachsen).
- Marktkerzen, Indikatoren, Session-Levels, Zeichnungen, Live-/Pending-Orders, SL-/TP-Zonen, Crosshair, Tooltip und Preisachsen.
- Schichten strikt geordnet: Basisgrid → nicht-interaktive Zonen → Kerzen/Indikatoren → Zeichnungen → Orders/SLTP + Interaktionsgriffe → Cursor/Tooltip → Modalebene. Mythische Visuals nur, wenn keine kritische Interaktion läuft.

**Rechte Seitenleiste** (einklappbar und in Breite verstellbar):
- Tabs: **Objekte**, **Indikatoren**, **Positionen & Orders**, **Preislevel**, **Datenfenster**.
- Baum aller Zeichenobjekte mit Sichtbarkeit, Sperrstatus, Reihenfolge, Farbe, Namen.
- Indikator-Instanzen (auch mehrfach derselbe Indikator mit unterschiedlichen Parametern).
- Positionen mit Konto, Ticket, Richtung, Lots, Einstieg, Preis, PnL, SL, TP, Status/Guard.
- Aktuelle Kurs-/Indikatorwerte am Crosshair oder letzten abgeschlossenen Bar.

**Untere Leiste/Panels**:
- Trades/Journal (bestehendes all-strategies), Alarme, Volumenprofil, Aufträge, Protokoll und ggf. Indicator Data.
- Bestehendes Journal nicht entfernen, sondern als dockbaren Tab oder separat erhaltenden Bereich anbinden.
- Module höhenverstellbar, Pane-Trenner dragbar, Layout speicherbar.

### 4.2 Kleine Displays, Vollbild und Tastatur

- Ab ca. 1200px: vollwertige Leisten; 768–1200px: automatisch einklappbare Sidebars; darunter: reduzierte Chart-Werkzeugpalette als Bottom-Sheet und präzise große Touch-Handles.
- Chart kann Vollbild, Zwei-Chart-Layout und später 2×2. Multi-Chart-Sync für Symbol, Crosshair, Zeitbereich ist pro Layout konfigurierbar; kein unkontrolliertes Teilen von Orders.
- Browserzoom 80–200%, Display-DPI 1/1.25/1.5/2/3, Windows-Skalierung, Tablet-Touch: Preisanker und Griffe müssen korrekt bleiben.
- Escape verlässt aktives Zeichenwerkzeug/Modal und erst im nächsten Schritt Vollbild; Delete löscht selektiertes **lokales** Objekt, niemals Position/Order; Ctrl+Z/Y nur Zeichnungen.
- Fokus sichtbar, Tastaturzugänglichkeit, Beschriftungen, Auswahl auch über Seitenleistenformulare und bedienbare Preis-/Zeit-Eingaben.
- Kein eingeblendeter Text über rechten Preislabels; Label-Kollisionsbehandlung, Platzreservierung und Umbruch in Achsenleisten.
- Farbleitsystem zusätzlich mit Formen/Icons (rot-grün nicht allein), reduzierte Animationen, hoher Kontrast, alle Modi Stone/Dark/Light.

## 5. Featurekatalog, Prioritäten und eindeutige Definitionen

Kennzeichnung: **P0 = erste produktiv nutzbare Version**, **P1 = erweitertes Studio**, **P2 = späteres Zusatzpaket**.

| ID | Priorität | Feature | Sollverhalten |
|---|---|---|---|
| FR-001 | P0 | Chart-Layouts | Speichern/Laden/Umbenennen/Kopieren/Zurücksetzen, konto- und symbolbezogene Ansichten |
| FR-002 | P0 | Indikator-Katalog | Suchen, mehrfach hinzufügen, Parameter/Farbe/Stil bearbeiten, ausblenden/löschen |
| FR-003 | P0 | Zeichnungen | Trendlinie, H/V-Linie, Rechteck/Zonen, Text, Fibo Retracement, Editiergriffe |
| FR-004 | P0 | Positionen | Auf dem Chart show/hide: je Konto, Symbol, Strategie, Positionsticket |
| FR-005 | P0 | SL-/TP-Level | Echte Broker-Level als Linien und farbige Zonen mit Richtung, $ und Accountwährung |
| FR-006 | P0 | Drag-Vorschau | SL/TP mit Maus/Touch ziehen, live USD/R:R berechnen, VOR Absenden validieren |
| FR-007 | P0 | Gesicherter Commit | Explizites Bestätigen; Backend überprüft Identität, Version, Risiko und Brokerantwort |
| FR-008 | P0 | Datenfenster | OHLC, Indikatorwerte, Kerzenzeit, Spread, angehefteter Crosshair |
| FR-009 | P0 | Zeichenpersistenz | Anker aus Zeit/Preis, Undo/Redo, Snap, Lock, Export/Import |
| FR-010 | P0 | S/R & Sessionlevel | Tages-/Wochen-High/Low/POC, VAH/VAL, frei pro Level ein/aus |
| FR-011 | P0 | Vollbild & Panes | Bestehender expandierbarer Chart bleibt, Indikatoren mit unabhängigen Achsen |
| FR-012 | P0 | Symbol-/Konto-Schutz | Niemals Daten/Order aus anderem Account mischen oder versehentlich mutieren |
| FR-013 | P1 | Mehr Diagrammarten | Heikin Ashi, Hollow Candles, Bar, Linien/Area, Presets |
| FR-014 | P1 | Fibo-Varianten | Extension, Fan, Time Zones, Trend-Based Fibo |
| FR-015 | P1 | Werkzeug-Bibliothek | Kanal, Regression, Positionsbox, R:R, Winkel, Pitchfork optional |
| FR-016 | P1 | Templates | Mehrere Layouts, Indicator-Presets, Favoriten, individuelle Shortcuts |
| FR-017 | P1 | Preisalarme | Browserbenachrichtigung auf Echtzeitdaten, kein Auto-Trade |
| FR-018 | P1 | Multi-Chart | 2/4 Charts in synchronisierbaren Layouts |
| FR-019 | P1 | Pending-Orders | Broker-seitig echte Pending-Level nur bei passender MT5-API/Guard-Anbindung |
| FR-020 | P1 | Position-Planer (erweitert) | Zusätzliche Portfolio-/Korrelations- und Profi-Planerfunktionen; **read-only P0-What-if-Simulator ist bereits FR-027** |
| FR-021 | P1 | Chart-Interaktion | Optional sichere Trade-Ticket-Maske mit Preisübernahme; eigener Approval-Flow |
| FR-022 | P2 | Replay-/Backtest-Infrastruktur | Echte historische Daten und strikt isolierter Simulationsmodus; fachliche Umsetzung des EA-Replays konkret in FR-028 |
| FR-023 | P2 | Erweiterter Footprint | Nur mit echten Bid/Ask-/Tick-Orderflow-Daten, KEINE Fantasiewerte |
| FR-024 | P2 | Scriptable Indicators | Sandbox mit Ressourcenlimits, signierter Import/Export, keine beliebigen eval-Skripte |
| FR-025 | P2 | Multi-Geräte-Sync | Erst nach Konfliktauflösung, Rechteverwaltung und Verschlüsselung planen |
| FR-026 | **P0 früh** | **EA-Entscheidungsanalyse** | Visueller regelbasierter EA-Debugger; aufgezeichnete Kandidaten, Signale, Ablehnungsgründe, Parameter und Guards; nicht protokollierte Vergangenheit ehrlich als fehlend zeigen |
| FR-027 | **P0 früh** | **What-if-Tradesimulator** | Virtuelle Entry-/SL-/TP-Szenarien, A/B-Vergleich, autoritative MT5-Profit-/Margin-Vorschau in Kontowährung und USD; keinerlei Brokerwrite |
| FR-028 | **P2** | **Trade-/EA-Replay** | Barweise historischer Markt samt belegten Entscheidungen ohne Future-Leaks; niemals Handelsmutationen |
| FR-029 | **P1** | **Multi-Timeframe-Confluence** | D1/H4/H1/M15/M5 Bias, Struktur und Setup pro bestätigtem TF-Bar erklärbar zusammenführen |
| FR-030 | **P1** | **Smart Sessions & Liquidity Map** | Asia/London/NY-Boxen, Highs/Lows, Swings, Equal Levels, Sweeps als ausdrücklich deklarierte Proxy-Zonen |
| FR-031 | **P1** | **Execution Quality** | Tatsächliche MT5-Deals gegen aufgezeichneten Sollpreis/Quote vergleichen; Slippage, Spread, Gebühren und Latenz nur mit Belegen |
| FR-032 | **P1** | **Marktregime-Erkennung** | Reproduzierbares Trending/Ranging/High-/Low-Vol/Event-Risk mit as-of Features und transparenter Qualität |
| FR-033 | **P0 früh** | **Trade-Lifecycle** | Broker-Entry bis Exit, SL/TP-/Trailing-/Partial-Fill-Timeline, nachvollziehbares MFE/MAE |
| FR-034 | **P1** | **News-/Event-Overlay** | Lizenzierte High-Impact-News, Zeitmarker, Guard-Puffer und Datenqualitätswarnungen ohne EA-Guard-Verwechslung |
| FR-035 | **P0 früh** | **Chart-Snapshots & Journal** | Entry-/Exit-Zustände versioniert aufzeichnen, nach Strategien filtern und im vorhandenen Journal mit Vorher/Nachher verknüpfen |

## 6. Interaktionsdetails: Zeichnen und Editieren [DRAW-001]

### 6.1 Allgemeines Objektmodell

Jede Zeichnung hat mindestens:
- ID (UUID), Typ, Schema-/Algorithmusversion, Account-Scope, Symbol, Sichtbarkeit/Lock, Creator, timestamps, revision;
- Ankerpunkte mit **UTC Unix Sekunden oder barIndex plus robustem Datenquellenbezug** und normalisiertem Preis als Decimal-String/Ticks;
- Stile: RGBA, Opazität, Linienbreite, Dash, Fill, Labels, Verlängerung nach links/rechts, Z-Index;
- optional Text, R:R-Metadaten, eigener Name, Pane-ID und Indikatorachse;
- Snap-Verhalten, Timeframe-Visibility, GroupId und Exportformat.

Objekte bleiben beim Pan/Zoom/TF-Wechsel an Marktzeit und Preis gebunden. Zwischen Timeframes dürfen Zeiten auf die nächste/korrekte zugrundeliegende Kerze aufgelöst werden, ohne die Original-Anker zu überschreiben. Niemals durch jedes Resize die dauerhaft gespeicherten Preise neu errechnen.

### 6.2 Werkzeugzustandsmaschine

Zustände: IDLE, DRAWING_FIRST_ANCHOR, DRAWING_NEXT_ANCHOR, SELECTED, DRAGGING_HANDLE, DRAGGING_OBJECT, CONFIRM_PENDING. Ein Tool verlässt den aktuellen Zustand deterministisch; verlorene Pointer-Capture und Escape setzen Drag-Drafts zurück. Chart-Pan nur, wenn kein Zeichnen/Drag aktiv ist. Hit-Test der aktiven Griffe erhält Priorität gegenüber Candles, aber **nie** über einem Order-Bestätigungsdialog.

- Magnet: aus / schwach / stark. Ziele: Candle OHLC, bekannte S/R-Preise, eigene Zeichnungspunkte; beim Snappen Herkunft und Preis visuell zeigen.
- Fibo: zwei verstellbare Anker A/B; unabhängige Preisrichtung, Labels 0/0.236/0.382/0.5/0.618/0.786/1/1.272/1.618/2.618 (anpassbar, -Level erlaubt); Preise exakt aus A + ratio × (B − A), Custom-Level frei editierbar.
- Linie: Endpunkte, Strahl/Unendlich, Snap, Linienstil, optional Preisalarm (erst P1).
- Zonen: Rechteck an x1/t1 und x2/t2, halbtransparent, Labels, eigener Name, Verlängerung; getrennt von **echten Broker-Risikozonen** darstellen.
- Text: sicher escapte Texte (kein injiziertes HTML); optional Beschriftung mit verstellbarer Fläche, Font, Pfeil.
- Kontextmenü: bearbeiten, duplizieren, Vor-/Hintergrund, sperren, ausblenden, in Gruppe, löschen, Eigenschaften.
- Multi-Select und Keyboard-Moves zuerst P1; Papierkorb und Undo/Redo-Persistenz P0. Versehentliches Löschen rückgängig.
- Bei gleichem Preis horizontal benachbarte Labels stapeln bzw. zusammenfassen; keine Überdeckung mit Chartachse oder Tooltips.

## 7. Indikator-Framework [IND-001]

Indikatoren sind **Instanzen**, nicht hart kodierte Charts. Daten, Parameter, Stil, Achse, Sichtbarkeit und Berechnungsversion sind unabhängig gespeichert. Mehrere EMA20 mit verschiedenen Farben sind erlaubt. Der Katalog ist durch ein registriertes Interface erweiterbar; keine monolithischen if/else-Ketten.

### 7.1 P0-Indikatoren (funktionsfähig, mit Parametertests)

- **MA-Familie:** SMA, EMA, WMA, RMA/SMMA; Perioden 1–1000, Source Open/High/Low/Close/HL2/HLC3/OHLC4, Shift (nur Darstellung), Preisoverlay.
- **Bollinger Bands:** SMA-Periode, StdDev-Faktor, Bands+Fill; Null/NaN bei zu wenig Historie.
- **VWAP:** Session-Anker und definierter Reset je Börsen-/Brokersession; tick_volume explizit als Näherung gekennzeichnet, wenn real volume fehlt.
- **RSI:** Wilder-Methode, einstellbare Perioden, 30/70-Linien, extra Pane.
- **MACD:** EMA-Fast/Slow/Signal, Histogramm, Nullinie, Pane.
- **ATR:** Wilder True Range, Fenster und Präzision, Pane.
- **Volumen:** Rohvolumen im Pane (tick vs. real sichtbar), Farboption, getrennt vom Volumenprofil.
- **ADX/+DI/-DI:** Wilder-Glättung, Trendstärke, separate Achse.
- **Daily/Weekly/Session-Level:** High/Low, Open, POC/VAH/VAL mit korrekt erklärtem Volumenproxy.
- **EMA-Originalpreset 2EAs:** 20/50/200 für das bestehende Chart; optional Titan 9/21/50 als ANZEIGE-Preset, ohne die EA-Berechnungen umzuschalten.

### 7.2 P1-Katalog

Stochastic, StochRSI, CCI, Momentum/ROC, Supertrend, Donchian, Keltner, Ichimoku, Parabolic SAR, OBV, MFI, Pivot Points, Fibonacci Auto-Retracement auf transparent dokumentierter Pivot-Regel, Session-Boxen, Linear-Regression-Channel, ATR-Bands, volumentriggerbasierte Zonen. **Keine** angeblichen Großorders/Liquidity Pools ohne verfügbare Originaldaten.

### 7.3 Parameter und Pane-Verwaltung

- Katalog-Suche, Beschreibung, Source, Parameter, eigene Farben/Plots, Linienbreite, sichtbare Werte; Style über Pane-Kontext.
- Instanz duplizieren, ausblenden, löschen, nach oben/unten verschieben, in Pane legen, aus Pane holen, Pane-Höhe dragbar.
- Parametereingabe erst nach Validierung committen, Live-Vorschau möglich. Benachrichtigungen bei fehlenden Daten und Warm-up.
- Indikatoren auf geschlossenen Bars standardmäßig berechnen; auf dem offenen Bar Live-Vorschau als vorläufig markieren. Keine Look-ahead-Zukunftsperioden; Heikin-Ashi-Barwerte nicht mit gehandelten Originalkursen verwechseln.
- Decimal-/Floating-Toleranz und Referenzimplementationen pro Indikator testen. Für die Backtest-Reproduzierbarkeit Algorithmusversion, Source und Zeitfenster speichern.
- Zahl der Instanzen sinnvoll begrenzen (z. B. 40 aktiv, 8 Panes als initiale weiche Grenze), Limit konfigurierbar; UI muss nicht einfrieren.
- Script-Editor und fremder Pine-Code sind **kein** Bestandteil von P0/P1.



## 8. Echte Positionen, Aufträge und Risikozonen [POS-001]

### 8.1 Sichtbarkeit und Filter

Chart-Positionen müssen mit einem Schalter **Positionen anzeigen** sofort ein-/ausblendbar sein, ohne die zugrundeliegenden MT5-Positionen zu verändern.

Unterfilter:
- Alle eigenen offenen Positionen / nur ausgewähltes Konto / nur aktuelles Symbol / bestimmte EA-Strategie / manuell eröffnete Positionen.
- Entry-Linie, Richtungspfeil, Menge/Lot, Ticket, Magic Number (falls vorhanden), Kommentar, Floating-PnL, SL-Linie, TP-Linie, PnL-/Risikozonen, Positionen aus Historie.
- Offene Positionen anzeigen ohne SL/TP und umgekehrt; Zeichnungsobjekte unabhängig davon anzeigen.
- Historische geschlossene Trades als Entry-/Exit-Marker mit Zeit und tatsächlich realisiertem Gewinn ein-/ausblendbar; klar von **Signal-Markern** differenzieren.
- Hedging-Modus: mehrere Positionstickets desselben Symbols **einzeln** darstellen, auch bei Long und Short gleichzeitig. Netting-Modus: MT5-Position als aggregierte Position anzeigen. Nie auf „ein Symbol = eine Position“ reduzieren.
- Positionsdaten unterteilen in OPEN_POSITION, PENDING_ORDER, HISTORY_DEAL und VISUAL_DRAFT. Unterschiedliche Shapes und Hover-Texte.

### 8.2 Farben und Geometrie

**Entry-Preis:** horizontale neutrale Linie, Label mit Ticket, BUY/SELL und Positionsgröße.

**Stop-Loss:** farbige, halbtransparente Verlustzone zwischen Entry und SL, für BUY i. d. R. unter Entry, für SELL darüber. Richtungsabhängige Warnfarbe (rot), aber nicht allein farbabhängig. Zonenhöhe **exakt** proportional zur Preisabweichung über die native Chartpreisskala, nicht in festen Pixeln.

**Take-Profit:** grün-/cyanfarbene Gewinnzone zwischen Entry und TP. Falls kein TP gesetzt: kein erfundener TP! Optionaler Ghost-TP nur in einem ausdrücklich benannten Entwurfsmodus.

**Live-Ergebnisse:** Die Preislinie selbst zeigt Preis, Distanz in Ticks/Punkten, korrekt kalkulierten hypothetischen PnL in Kontowährung und ggf. USD sowie R:R für die zum Drag gehörende Position. Bid/Ask und Spread mit Zeitstempel, Kontowährung der MT5-Verbindung. Während Drag wird ein DRAFT-/VORSCHAU-Label angezeigt, nicht „gespeichert“.

**Risikofelder:** farbige Zonen besitzen optionale Zielstufen TP1/TP2/TP3 als **visuelle Planschichten**. MT5 unterstützt nicht automatisch mehrere SL/TP je einer einfachen Position: als mehrere tatsächliche Brokeraktionen nur umsetzen, wenn Partial-Exit-/Multiple-Order-Logik serverseitig geprüft und separat freigegeben wurde; sonst sichtbar „Plan, nicht Brokerauftrag“.

**Überlappung:** bis zu 10 Positionen mit identischen SL/TP-Preisen automatisch horizontal gestaffelt/gebündelt, Aufklappliste mit Ticket und Eigentümer; kein verdeckter Eintrag. Zonen müssen auch bei 25+ Positionen bedienbar bleiben.

### 8.3 Präzises Drag & Drop auf SL und TP [POS-002]

Akzeptanzablauf (mit Maus und Touch):
1. Benutzer wählt ein bestimmtes Konto/Positionsticket aus oder aktiviert einen SL-/TP-Griff. Tooltip zeigt Position, gültigen aktuellen Stop, TP und letztes verifiziertes Update.
2. Pointer-Down auf SL-/TP-Griff setzt **DRAFTING**. Die ursprüngliche Brokerlinie bleibt sichtbar und unverändert.
3. Pointer-Move verschiebt **nur den Vorschaugriff** mit Snap auf tick_size/optional Preisebenen. Tooltip zeigt live: Zielpreis, Bewegungsrichtung, Distanz, verbleibendes Stop-Risiko / Gewinnpotenzial in **USD**, in Kontowährung, CRV/R:R, mögliche Brokerregelverletzung.
4. Während des Drags muss kein einziges mt5.order_send ausgeführt werden. Eine lokal sofortige Näherung darf nur als **vorläufig** gekennzeichnet werden; autoritative Preiskalkulation durch serverseitigen read-only Preview-Endpunkt (gedrosselt/debounced, spätestens bei Pointer-Up).
5. Pointer-Up bleibt **VORSCHAU**. Backend bestätigt vollständige Accountidentität, aktuelles Ticket, Revisionsstand, Bid/Ask, Step/Digits, Stop-/Freeze-Level, EA-/Challenge-Guard, Risk, optional quote stale.
6. Ein expliziter Dialog zeigt **Alt → Neu**: SL-Preis, TP-Preis, möglicher Verlust/Profit in USD und Kontowährung, Distanz in Ticks, Prozent Equity/Balance, R:R, Spread, Guard-Effekt und betroffenen Account/Ticket. Zwei getrennte Aktionen: **Abbrechen** und **Änderung verbindlich an MT5 senden**.
7. Nach bestätigter Benutzeraktion: serverseitiger Commit mit idempotency key, erwarteter Revision, erwarteten SL-/TP-Ursprungswerten und request_id.
8. Bei Erfolg: MT5-Response prüfen, Position erneut abrufen und nur die **brokerbestätigten** SL/TP-Werte in Chart und Positionspanel darstellen. Eindeutig **Gespeichert bei MT5** melden.
9. Bei Fehler, Timeout, Konto-Wechsel, EA-Trailing-Update, Sessionwechsel, Quote-Staleness oder Schutzsperre: Entwurf verwerfen/neu validieren, **Originalwerte behalten**, klare Fehlermeldung; keine falsche Erfolgsgrafik.
10. Escape/Cancel/Touch-Abbruch: sofort wieder Broker-Zustand anzeigen. Navigieren/Zoomen während Drag nur nach Explizitabbruch.

**Eingabewege:** Drag, numerische Preisfelder, USD-Ziel, Ticks, Prozent des Eigenkapitals, CRV, Break-even-Shortcut. Alle nutzen **dieselbe** Validierungs- und Commit-Pipeline. Bestehende SL/TP-Buttons im Dashboard bleiben funktional; künftig zentralisierten Risikorechner und Guard nutzen.

**Optionale Schnellbestätigung:** Nach P0 kann ein erfahrener Benutzer explizit eine Einstellung „Nach Mouse-Up direkt verbindlich senden“ für Demo aktivieren. Standard bleibt zweistufig. Für funded/live darf **ohne zusätzliche erneute ausdrückliche Freigabe** kein One-Release-Modus vorkonfiguriert sein. Nie ein automatischer Order-Write während Pointer-Move.

### 8.4 Handelsobjekt-Modi

Vier strikt unterschiedliche Layer:
1. **Broker-Position:** verifizierte echte MT5-Position, interaktiv nur über sichere Mutation.
2. **Broker-Pending-Order:** existiert tatsächlich beim Broker; separate Ticket-/Expiry-/Filling-/Modify-/Cancel-Regeln.
3. **Trade Plan:** lokale gedachte Entry/SL/TP-Projektion ohne Brokerbindung, beliebig editierbar, NIE als echte Position oder PnL markieren.
4. **Signals/Annotations:** analytische Marker/Zeichnungen ohne Orderfunktion.

Hierzu klare Labels: LIVE, PENDING, SIMULATION, DRAWING; Farben plus Icons; keine Trefferprüfung auf dem falschen Layer.

## 9. USD-/Kontowährungs-Rechenengine [MONEY-001]

**Kritisch:** Für alle realen Positionen serverseitig die MT5-Berechnung **mt5.order_calc_profit(action, symbol, volume, price_open, price_close)** verwenden. Sie liefert die Rendite in **Kontowährung** und berücksichtigt die Kontrakt-/Symbol-Berechnungsmethode. Nicht universell mit Preisabstand × volume × contract_size rechnen. Das kann bei Fremdwährungen, CFDs, Forex-Kreuzkursen und Brokerbesonderheiten falsch sein.

### 9.1 Verbindliche Formeln und Fachregeln

- Für Long: action = ORDER_TYPE_BUY; für Short: ORDER_TYPE_SELL.
- Für hypothetical PnL bei SL/TP: entry = tatsächlicher Broker-Einstiegspreis, exit = vorgeschlagener Exit-Preis. Für eine noch nicht eröffnete Planposition erst einen expliziten Entry-Planpreis nutzen und nie als Brokerposition behandeln.
- Der negative Wert von order_calc_profit ist Verlustrisiko, der positive Gewinnpotenzial (vor künftig unbekannten Ausführungsabweichungen); absolute Beträge für die Beschriftung.
- **Netto-/Brutto-Unterscheidung:** MT5-Profit-Prognose zeigt die MT5-Kalkulation; Commission/Swap, Slippage und Gaps sind nur dann eingerechnet, wenn belastbare Werte vorliegen. Preisvorschau darf nicht „garantierter Gewinn“ heißen.
- PnL zum aktuellen Marktpreis: reale bid/ask-Seite beachten. Für LONG zum Bid schließen, für SHORT zum Ask. Bei Preisänderung unter Last/Slippage Unterschiede explizit erläutern.
- Konto nicht in USD: Primäranzeige in Kontowährung, dazu USD-Umrechnung nur mit zeitgestempeltem, zulässigem Umrechnungskurs samt Quelle/Bid-Ask-Richtung und Fehlermeldung, wenn nicht verfügbar. Keine erfundene 1:1-Umrechnung.
- API-Werte intern als Decimal-/präzise Tick-Integer repräsentieren. UI-Formatierung erst beim Anzeigen. Fractional Ticks/Precision nicht vorher wegschneiden.
- Preisraster: symbol_info(...).trade_tick_size, point, digits, volume_min/max/step; Richtungssichere Rundung bei SL/TP inkl. Schutz gegen unbeabsichtigtes Ausweiten von Risiken.
- Abstände Stop/Freeze: Broker-lieferbare symbol_info-Infos (trade_stops_level, trade_freeze_level, trade_mode, order_mode) plus aktuelle Bid/Ask, Symbolhandelssession. Broker darf restriktiver ablehnen.
- Vorschau berechnet worst-case Risk und R:R auf Grundlage der **neuen** SL-/TP-Level; berücksichtige mehrere Positionen desselben Symbols und korrelierte Risiken bei Account-weitem Risk-Gate.
- Kein SL/TP, Nullpreis, Volume 0, ungültige Ticks, mt5 None/Error, fehlende Verbindung → kein falsches 0-Dollar-Ergebnis.
- Ohne gültige Account-Identität/Risk-State und bei Hard-Lock: read-only Anzeige erlaubt, mutierende Commit-Aktion wird gesperrt. Vor jeder Ausführung nochmals serverseitig prüfen.
- Broker kann Stops/TP durch Freeze/StopsLevel oder Session ablehnen; auch ein erfolgreiches order_check ist keine Garantie für erfolgreiche Ausführung. Broker-Antwort und erneutes Fetch maßgeblich.

### 9.2 Konkretes Interaktionsbeispiel (Nur Illustration)

LONG XAUUSD: Entry 4.100,00 USD; vorgeschlagener SL 4.090,00; vorgeschlagener TP 4.125,00; Größe 0,10 Lot. Chart zeigt **neue Preise**, **Distanz 10,00 / 25,00 USD je Unze** und den **serverberechneten Kontogewinn/-verlust**, **nicht** einen fix erfundenen Dollarbetrag, solange order_calc_profit nicht antwortet. Die USD-PnL-Zahlen in der UI stammen von der MT5-Kalkulation und einer gegebenenfalls nötigen Währungsumrechnung. R:R aus positiven/negativen Beträgen und ausgewiesenen Gebührenannahmen ableiten. Der Beispielpreis dient ausschließlich der Veranschaulichung, nicht einem Handelssignal.

### 9.3 USD-Berechnung bei Drag technisch

Während PointerMove:
- Preis→Tick normalisieren, lokale Wertvorschau maximal 30–60 FPS zeichnen.
- Debounce Read-Only-Preview-Anfrage ca. 150–300 ms; alte Antworten per request sequence token verwerfen.
- UI zeigt bis zur Antwort „Schätzung“; definitive Kontowährungs-/USD-Werte aus mt5.order_calc_profit. Kein Aufruf für jedes Pixel.
- Nach PointerUp synchronen Endpreis aus Cliententwurf und SERVERPREVIEW abgleichen; Änderung > 1 Tick oder geändertes Konto/Position führt zu Revalidierung oder Ablehnung.
- Netto-PnL aus API in AccountCurrency; USD ggf. mit Conversion-Source und Zeitstempel; never fake.
- Bei Unterbrechung der Verbindung wird ein UI-Draft nie automatisch später zu einer echten Order.

## 10. Broker-/Guard-Sicherheit [SEC-001]

### 10.1 Zwingende Prüfungen vor jeder realen Mutation

1. Route benötigt einen explizit validierten Account-Key aus allowlist, exaktes Terminal, Login und Server; bestehende **account_gateway.py**-Sicherung weiterverwenden.
2. Konto im Request muss Konto des bestätigten Tickets sein; Ticket-/Symbol-/Magic-/Status aus MT5 neu laden, nicht aus ungeprüften UI-Claims.
3. Kein echter Commit aus Demo-/Replay-/Simulationskontext. Keine direkt vom Client übergebene nicht verifizierte „guard erlaubt“-Flag.
4. Challenge-/EA-Guard prüfen: Hard-Lock, Daily DD, symbolbezogene Positionslimitierung, News-Blackout (falls betroffen), interne SL-/Max-Risk-Policy. **Wichtige Differenzierung:** Bestehende risikoreduzierende SL-/TP-Verwaltung/Positionsschließung darf nicht pauschal durch Entry-News-Guards blockiert werden; Guard-Policy explizit pro Aktion klassifizieren. Unsicherheit blockiert neue Risikoerhöhung.
5. Neue SL/TP-Preise Tickgröße, sym.digits, StopsLevel, FreezeLevel, Bid/Ask-seitige Platzierung, Gültigkeit Long/Short, Kurslimit, Handelsstatus prüfen.
6. Erwartete Position-Version: aus Ticket, open_time/position_identifier, Volume, aktuellen SL/TP, gewähltem Symbol, Account, Zeitpunkt/Version Hash bilden. Wenn EA zwischenzeitlich Trailing-Stop geändert hat: **409 CONFLICT**; nie still überschreiben.
7. Backend-Read/Preview und Commit mit Replay-Schutz: einmalige idempotency key pro Benutzeraktion, Audit-Log (ohne Zugangsdaten), TTL und rate limits.
8. Vor mt5.order_send den vorhandenen Session-Lock benutzen, verify_identity erneut ausführen, Position neu abgleichen. mt5.order_check bei dafür geeigneten Requests optional aufrufen, Fehler berücksichtigen; Check-Erfolg nicht als Fill bestätigen.
9. Brokerretcode interpretieren: Erfolg oder finaler Fehler; bei Zeitüberschreitung Neuabfrage und status UNKNOWN, nie zweite Order automatisch als Retry ohne Idempotenz.
10. Nach Erfolg immer authoritative mt5.positions_get/mt5.orders_get nachziehen. MT5 ist Wahrheit; UI-Draft erst danach schließen.
11. EA-seitiger Trailing-Stop darf manuelle SL/TP-Änderung später wieder überschreiben. Vor einem potentiell sofortigen Konflikt deutliche Warnung: „EA verwaltet SL möglicherweise selbst“. EA-Mutation nicht heimlich deaktivieren.

### 10.2 Netz und Rollen

- Der bestehende Server ist standardmäßig lokal auf 127.0.0.1; in der Praxis kann ein Reverse-Tunnel aktiv sein. Eine solche Veröffentlichung darf nicht implizit als sicher gelten.
- Mutierende Chart-APIs brauchen Authentifizierung, Session-Schutz, Origin-/CSRF-Schutz, legitime Berechtigung und Rate Limits; keine offenen POST-Endpunkte für alle Tunnel-Zuschauer.
- Secrets, Terminalpfade, Broker-Anmeldedaten dürfen nicht im Browser, JSON-Fehlern, lokalen Layouts oder Screenshots landen.
- Read-only Default; Trading Mode muss für eine Session explizit freigeschaltet sein. Für Live/Funded optional zusätzliche Bestätigung/Passphrase und mehrere Warnstufen.
- Kein ungesichertes WebSocket-Token in URL; Access-Cookies httpOnly + Secure (wenn HTTPS) / SameSite; Anfrage-Limits auch bei lokalen API-Routen.
- Read-only Anzeige funktioniert, wenn Tradingpermission fehlt.

## 11. Datenbeschaffung und konsistente Marktansicht [DATA-001]

### 11.1 Preisfeeds und Zeit

- Canonical Symbol aus symbol_info/Symbolkatalog. Chart- und Positionssymbol müssen exakt übereinstimmen, inklusive Broker-Suffixen, oder explizit gemappt werden.
- OHLCV aus dem **zugeordneten** MT5-Terminal/Account. Timestamp UTC Unix Sekunden, beim Anzeigen wählbare Zone UTC, Brokerzeit, Lokalzeit und wichtige Handelssessions (Europe/Berlin DST korrekt).
- M1/M5/M15/M30/H1/H4/D1 + später W1/MN1. Lücken durch Wochenenden, Feiertage, illiquide Sessions sind reale Datenlücken, nicht gerundete Fantasiekerzen.
- Last Bar ist unbestätigt; Status „läuft“. Repaint-Indicator bei neuem Tick nur für aktuelle Bar, historische Bars unveränderlich außer nach expliziter Quellenkorrektur.
- Tickvolume/Realvolume kennzeichnen; Volumenprofil auf der bestehenden Approximation oder einer verbesserten dokumentierten Methode aufbauen, NIEMALS „echte große Orders“ behaupten ohne Orderflow-Quelle.
- Price scale: Auto/Manual/Log/Percent nur, wenn konsistent unterstützt; Log-Chart bei nichtpositiven Preisen deaktivieren. Skalenmodus pro Symbol/Layout persistieren.
- Feeds werden bei Account-/Symbol-/TF-Wechsel mit GenerationToken abgebrochen; spätere Antworten des vorherigen Kontos verworfen (bestehendes accountGeneration-Prinzip übernehmen).

### 11.2 Lademodell

- Initial ca. 300–1000 Kerzen passend zur View; asynchrone Historienpagination in Brocken bei linkem Scroll, Cache pro (account, symbol, timeframe, range), Validierung der Reihenfolge und Timestamp-Eindeutigkeit.
- Serverseitiges Paging muss gültiges Time-Window und Maximalgrenzen erhalten; keine unbeschränkte M1-Download-Anfrage ohne Cursor und Ressourcenbudget.
- ATR/EMA/RSI Warm-up über ausreichend Vorgeschichte, aber sichtbare Bars erst ab View-Start; keine Future-Leaks.
- Bei Tick/Kerzenaktualisierung inkrementelle Serienupdates, bei Reload diff-basiert. Nie bei jedem Poll alle Candles/setData/Zeichnungen neu erzeugen.
- Tick und Quote-Daten mit monotonem server_timestamp; Market-Data-Staleness festlegen (z. B. > 5s Warnung, > 15s mutierende Aktionen blockieren, broker-/sessionabhängig konfigurierbar). Ein M15-Kerzenrequest alle 5s ist kein Tickstream; die UI muss Quote-Aktualität separat prüfen.
- Marktfeeds/WebSocket nur, wenn echte Terminal- und Netzwerkbedingungen die Verbindung tragen. Polling-Fallback mit Backoff, Connection-State und Resync nach Reconnect.
- Keine automatisierte Abgabe von Orders auf Chart-Signale, Crosshair oder Bewegung.

## 12. Komponentengrenzen und vorgeschlagene Projektstruktur [ARCH-003]

Der Agent kann Modulnamen anpassen, aber Verantwortlichkeiten sind verpflichtend. **app.py** nicht noch um Tausende Zeilen Inline-JS aufblasen.

~~~text
frontend/chart-studio/
  src/
    bootstrap.ts                # Mount + feature flag, cleanup
    shell/ChartStudioShell.ts   # Toolbar, panes, tabs, dialogs
    chart/ChartAdapter.ts       # Adapter für festgelegte Chartversion
    chart/ChartViewport.ts      # Resize, axes, coordinate transforms
    chart/LayerManager.ts       # Draw priority, collision avoidance
    chart/InteractionFSM.ts     # Pointer capture, focus, keyboard
    drawing/DrawingRegistry.ts  # Persisted objects, hit-test, handles
    drawing/tools/             # Trendline, Rect, Fib, Text, RR...
    indicators/IndicatorRegistry.ts
    indicators/engine/         # Pure math + worker transport
    indicators/panels/         # Independent scales/panes
    trading/PositionOverlay.ts
    trading/PositionDraft.ts
    trading/StopTakeEditor.ts
    trading/PnlPreview.ts
    trading/ConfirmDialog.ts
    trading/TradingPermissions.ts
    data/BarsRepository.ts
    data/QuoteFeed.ts
    data/PositionFeed.ts
    data/GenerationGuard.ts
    state/LayoutStore.ts
    state/ChartSettings.ts
    state/UndoRedo.ts
    ui/Toolbar.ts
    ui/ObjectTree.ts
    ui/DataWindow.ts
    ui/IndicatorEditor.ts
    ui/Legend.ts
    ui/ChartAccessibility.ts
    themes/stone.css
    themes/dark.css
    themes/light.css
    tests/...
  package.json
  tsconfig.json
  vite.config.ts

backend/chart_studio/
  routers.py                    # New versioned REST routes
  schemas.py                    # Pydantic validators
  chart_data.py                 # MT5 bars/quotes/symbolinfo
  calculations.py               # order_calc_profit / currencies
  trade_preview.py              # Read-only proposed SLTP
  trade_commit.py               # Safe audited real SLTP update
  risk_policy.py                # Action-specific risk/guard checks
  account_binding.py            # Reuse account_gateway identity scope
  drawings.py                   # SQLite storage + revision
  layouts.py
  audit.py
tests/chart_studio/
  unit/ integration/ e2e/ visual/ perf/
~~~

**Wichtig:** API-Definitionen aus Python/Pydantic als typisierten TS-Client generieren oder schema-drift-geschützte gemeinsame OpenAPI-Verträge pflegen. Geschäftskritische Berechnungen gehören ins Backend, nicht bloß nach TypeScript.

### 12.1 Domänen-Store

- **marketStore:** candles, quote, indicators, sessions, symbolInfo, lastUpdate.
- **accountStore:** verified account, MT5 positions, orders, permissions, challenge guard.
- **chartStore:** viewport, timeframe, displayed panes, axes, selected tool, selected object.
- **drawingStore:** durable anchor data, local revision, undo/redo history.
- **tradeDraftStore:** ephemeral ticket-scoped pending SL/TP edits; niemals persistiert als Broker-Wahrheit.
- **layoutStore:** per-user templates, current workspace, symbol/account visibility.
- **effectsStore:** stone FX settings (read-only to trading); reuses existing modules without chart layering conflicts.

Keine Werte aus Trading-Signalen als tatsächliche executed fills behandeln. Ein Overlay darf Positionen nicht aus Zeichnungen ableiten.

## 13. Neue API-Verträge (Zielvorschlag, v1) [API-001]

Alte Routes **müssen weiter funktionieren**, neue Routes unter /api/chart/v1/ hinzufügen. Serverseitige auth/account-binding bleibt Pflicht. Keine stillschweigende Änderung der bestehenden JSON-Felder im Cockpit.

| Method | Route | Verantwortlichkeit |
|---|---|---|
| GET | /api/chart/v1/capabilities | unterstützte Charttypen/Indikatoren/Permissions/Versionen |
| GET | /api/chart/v1/symbols?account=...&q=... | tatsächlich handelbare Symbole pro MT5 |
| GET | /api/chart/v1/bars?account=...&symbol=...&tf=...&from=...&to=...&cursor=... | paginierte normalisierte OHLCV + source/warmup |
| GET | /api/chart/v1/quotes?account=...&symbol=... | timestamped bid/ask/spread/staleness |
| GET | /api/chart/v1/positions?account=...&symbol=... | authoritative open/pending positions + revisions |
| GET | /api/chart/v1/trades?account=...&symbol=... | historische Fills, keine Signale |
| GET | /api/chart/v1/symbol-info?account=...&symbol=... | Ticksize, digits, lotsteps, trade modes, stops/freeze |
| POST | /api/chart/v1/position/preview-stop | **read only**, validiert und berechnet mögliche SL/TP-Dollarwerte |
| POST | /api/chart/v1/position/commit-stop | bestätigte, idempotente und gesicherte MT5-Änderung |
| GET | /api/chart/v1/layouts | Layout-Liste, Schema-Version |
| POST | /api/chart/v1/layouts | neues Layout, validierter Name, revision |
| PUT | /api/chart/v1/layouts/{id} | speichern mit expectedRevision / 409 conflict |
| DELETE | /api/chart/v1/layouts/{id} | sicher löschen oder archivieren |
| GET | /api/chart/v1/drawings?account=...&symbol=... | drawing scopes + paginierte Objekte |
| PUT | /api/chart/v1/drawings/{id} | Objektänderung, optimistic concurrency |
| POST | /api/chart/v1/drawings | neue Zeichnung |
| DELETE | /api/chart/v1/drawings/{id} | löschen mit revision |
| GET | /api/chart/v1/indicators/registry | Optionen, defaults, Validierungsbereiche |
| GET | /api/chart/v1/stream | optional read-only SSE; ggf. WebSocket unter WS-Route |

**CORS/Auth/Origin** ausdrücklich konfigurieren. Die UI darf für sensible Transaktionen keine schreibende API vom Chart-Canvas aus unkontrolliert aufrufen.

### 13.1 Beispiel: Position-Snapshot

~~~json
{
  "account": {"id":"titan","login":"<verified id>","server":"<verified server>","currency":"USD"},
  "symbol":"XAUUSD",
  "serverTimeUtc":"2026-10-09T09:30:00Z",
  "quote":{"bid":"4115.20","ask":"4115.43","timeUtc":"2026-10-09T09:29:59Z"},
  "positions":[{
    "ticket":"<broker position ticket>","positionIdentifier":"<stable mt5 identifier>",
    "side":"BUY","volumeLots":"0.10","entryPrice":"4100.00",
    "slPrice":"4086.30","tpPrice":null,"status":"OPEN",
    "magic":12345,"strategy":"Titan","revision":"<opaque server hash>",
    "livePnlAccount":"123.45","currency":"USD"
  }],
  "guard":{"status":"ALLOW_VIEW","canModifyStops":true,"reason":null}
}
~~~

IDs, Konto und Zahlen in diesem Beispiel sind Schemaillustration; alle Werte werden in der echten API aus dem verifizierten MT5-Snapshot abgeleitet. Preis-/Geldbeträge als String-Decimal statt anfällige Floating-JSON-Vergleiche.

### 13.2 Beispiel: Drag-Preview ohne Order

~~~json
POST /api/chart/v1/position/preview-stop
{
  "account":"titan","symbol":"XAUUSD",
  "positionTicket":"<broker position ticket>",
  "expectedRevision":"<opaque server hash>",
  "candidate":{"slPrice":"4090.20","tpPrice":"4140.00"},
  "clientRequestId":"<uuid>"
}
~~~

~~~json
{
  "valid":true,"warnings":["EA-Trailing könnte SL später überschreiben"],
  "brokerPreview":{"slPrice":"4090.20","tpPrice":"4140.00"},
  "pnlAtSl":{"amount":"-98.00","currency":"USD","kind":"estimatedGross"},
  "pnlAtTp":{"amount":"398.00","currency":"USD","kind":"estimatedGross"},
  "ratioRiskReward":"4.06",
  "quoteTimeUtc":"2026-10-09T09:29:59Z",
  "positionRevision":"<opaque server hash>",
  "previewId":"<short-lived opaque id>",
  "expiresAtUtc":"2026-10-09T09:30:10Z"
}
~~~

**Preview ist keine Zusage, kein Update und kein Gewinnversprechen.** Der Commit-Request muss previewId, expectedRevision, userConfirmed true und idempotencyKey enthalten; Backend liest Position/Quote/Guard erneut und kann trotz vorher gültiger Preview ablehnen.

### 13.3 Fehlerkontrakt

Einheitliches Fehlerformat:

~~~json
{
  "code":"POSITION_CHANGED",
  "message":"Die SL-/TP-Werte wurden inzwischen durch den EA oder MT5 geändert.",
  "retryable":true,
  "details":{"serverRevision":"<new hash>"},
  "requestId":"<audit id>"
}
~~~

Codes mindestens ACCOUNT_MISMATCH, ACCOUNT_OFFLINE, SYMBOL_UNKNOWN, POSITION_NOT_FOUND, POSITION_CHANGED, STALE_QUOTE, MARKET_CLOSED, STOP_INVALID, FREEZE_LEVEL, GUARD_BLOCK, INSUFFICIENT_PERMISSION, PREVIEW_EXPIRED, BROKER_REJECTED, MT5_TIMEOUT_UNKNOWN, RATE_LIMITED, DRAWING_CONFLICT, LAYOUT_CONFLICT. HTTP 400/401/403/404/409/422/429/503 passend; keine stillschweigende Route auf anderes Konto.



## 14. Persistenz, Profile und Synchronisation [STORE-001]

### 14.1 Speicherung

**Empfehlung:** SQLite lokal, WAL-Modus, Schema-Migrationen und versioniertes JSON für Layouts/Zeichnungen; keine alleinige LocalStorage-Speicherung, weil Browsercache löschbar und Zugriff über mehrere Geräte möglich ist. LocalStorage nur für kleine nichtkritische UI-Präferenzen/letztes geöffnetes Layout.

Tabellen (Vorschlag):
- chart_workspace(id, owner_id, account_scope, name, is_default, schema_version, revision, created_at, updated_at)
- chart_layout(id, workspace_id, symbol, timeframe, display_type, price_scale, time_scale, panes_json, indicators_json, visibility_json, revision)
- chart_drawing(id, owner_id, account_scope, symbol, pane_id, type, anchors_json, style_json, visibility_json, group_id, revision, updated_at)
- chart_indicator_template(id, owner_id, title, definitions_json, version)
- chart_mutation_audit(id, account_id, ticket, action, old_values, preview_values, confirmed_values, mt5_retcode, actor, timestamp_utc, request_id)
- chart_schema_migration(version, applied_at, hash)

Kontobezogene Objekte standardmäßig voneinander isoliert. **Globale Markt-Zeichnungen** darf der Benutzer explizit für ein Symbol accountübergreifend teilen (diese besitzen KEINE Orderbindungsdaten). Echte Positions-Overlays werden nie als lokale Objekte repliziert oder gespeichert, sondern beim Rendern aus dem Broker-Snapshot wiederhergestellt.

### 14.2 Layout-/Zeichnungsoperationen

- Speichern/Laden „Workspace“ inkl. Charttyp, Layout, Panelgrößen, Symbol, Timeframe, Indikatorinstanzen, Sichtbarkeit, Watchlist, Zeichnungen (Zeichnungen als referenzierte per-Symbol-Daten).
- Benutzer kann mehrere Profile („Scalping“, „London“, „Analyse“, „Clean Chart“) anlegen, duplizieren, umbenennen, exportieren/importieren, resetten.
- AutoSave mit Debounce; Versionszähler im Backend. Bei parallelem Gerät: 409 + Konfliktauflösung „Meine Änderungen“, „Serverstand“, „Als Kopie speichern“.
- Undo/Redo nur lokale Editing-Aktionen, inklusive Toolposition/Styles. Handelstransaktionen nie als Undo-Action.
- JSON-Schema pro Typ und Versionsmigration; unbekannte Typen nicht ausführen; externe Zeichnungstexte sanitizen und Importgröße begrenzen.
- Backups: vor jeder Schemaänderung SQLite-Backup, wöchentliche Retention konfigurierbar, Export testweise zurückimportieren. Keine Secrets im Export.

### 14.3 Scope-Regeln

- Layout: globaler Benutzer-Workspace, darin Symbol-/TF-spezifische View-Konfigurationen.
- Zeichenobjekt: per Symbol und optional per Konto/Workspace; Timeframe-Sichtbarkeit separat konfigurierbar, Anker immer erhalten.
- Indikator: pro Chartinstanz + Preset; eine Bearbeitung an EMA20 beeinflusst nicht EMA20 in anderem Chart.
- Positions-Overlay: ausschließlich autoritative Konto- und Symbol-Ressource, unabhängig von Zeichnungs-/Layoutpersistenz.
- Aktiver SL-/TP-Drag: nur flüchtiger State, bei Refresh, Konto-/TF-/Symbolwechsel sicher verwerfen.
- Markt-/Zeitdaten: kurzlebiger Cache mit Quellen-/Timestamp-/Account-Key; nicht als künstlich permanente Broker-Wahrheit verwenden.

## 15. Chart-Objekte, Achsen und Layer: Pixelgenauigkeit [RENDER-001]

### 15.1 Einzige Transformationsquelle

- Rendering mit Chart-Adapter und skalengebundenen Primitives.
- timeToCoordinate / coordinateToTime und priceToCoordinate / coordinateToPrice der passenden Serie/Achse verwenden.
- Wenn Koordinate null ist (außerhalb Historie), Objekt partiell clippen oder außerhalb View als „off-screen“ behandeln; **nicht** erfinden oder an Chartkante festnageln.
- Rechte Preisachse/Zeitachse ist NICHT Teil des eigentlichen Plot-Canvas. Rendergröße und Offset an tatsächlichen Price-Pane messen, wie das Projekt aus früheren EMA-Glow-Versatzfehlern gelernt hat.
- Responsive, chart full-screen, Split-Layout, Achsenskalierung, AutoScale, log/percent, Pan/Zoom und Pane-Resize können Koordinaten ändern. Zeichnungsobjekte rechnen bei jedem View-Change über die Bibliotheks-Transforms neu, ohne Ankerwerte zu verändern.
- Zonenfüllung und Griffpunkte dürfen Cursor und Price-Axis-Labels nicht blockieren. Labels mit eigener Kollisionslogik, ggf. rechtem reserviertem Gutter.
- Chart Scroll/Zoom wird bei aktiver Object-Interaction temporär pausiert, bei PointerUp/Cancel zuverlässig wieder eingeschaltet.
- Reticle/Crosshair muss auch bei hochauflösender Retina/DPI-Skalierung exakt auf den Datenpunkt fallen.

### 15.2 Layer-Ordnung (von hinten nach vorn)

L0 Grid und Sessions/Hintergründe.
L1 leichte Markt-Zonen, manuelle Fibo-Fills.
L2 Candles und Indikator-Linien (nativer Chart-Layer).
L3 Manuelle Zeichnungen mit Auswahl-Griffen.
L4 Marktpreis- und Broker-Positionslinien / Risiko- und Zielzonen.
L5 Aktiver SL-/TP-Draft, Input-Handles, Bestätigungsdialog.
L6 Crosshair, Tooltips, lokale Status-/Fehler-Legende und Toolbar.

Mythische FX aus stone-chart-effects.js und stone-celebrations.js bleiben rein optisch; bei aktivem SL-/TP-Drag, Dialog, Keyboard-Fokus oder reduzierter Bewegung vollständig pausieren. Keine permanente Chart-Aufhellung und kein Statusbanner über Levelnamen.

### 15.3 Objekt-Hit-Testing / Konflikte

- Hit-Test pro Pointerposition mit Mindestgriffgröße 12 CSS-Pixel Desktop, 28–36 Touch; toleranzabhängig von DPI.
- Priorität: Dialog > aktive Handelsgriffe > Drawings > Pane-Pan. Trade-Handle getrennte Form und Tooltip, niemals versehentlich als normale Trendlinie selektieren.
- Bei überlappenden Objekten: zyklisches Auswählen per Kontextmenü/Alt/Tab sowie Objektbaum.
- Zwei Finger pinch zoom, Ein-Finger Draw/Pan je Werkzeug; Pointer capture und Fall „Finger außerhalb View“ robust.
- Snap erfolgt auf symboltrade_tick_size, nicht auf bloß zwei Nachkommastellen; Fibo-Zwischenpreise und Freitext dürfen voller Präzision bleiben.
- Labels für Daily High/Low/Weekly POC **vollständig** lesbar, auch bei paralleler Positions-/Risikolegende; keine Überlagerung mit Axis-Werten.

## 16. Leistung, Skalierbarkeit, Zuverlässigkeit [PERF-001]

Zielgeräte: Windows-Desktop mit Standardbrowser, Laptop, Mobilgerät als Read-only/leichte Editing-Ansicht. Performance-Budgets vor Implementierung messen und in CI messen.

**Zielwerte (Testprofile, keine bereits nachgewiesenen Messergebnisse):**
- 5.000 Bars historisch anzeigen, ohne blockierendes UI; bei 20.000/50.000 Bars virtuelle/LOD-Strategie und Historien-Paging nutzen.
- 20 gleichzeitig aktive Indikatorinstanzen, 1.000 persistente Zeichnungen und 10+ Positionen sollen noch selektierbar bleiben.
- Beim Ziehen einer SL-/TP-Linie visuell 50–60 FPS auf Referenzdesktop (p95 Eingabe→Anzeige < 35 ms). Backend-Preview muss nicht 60×/s erfolgen.
- Normale Chart-Pan-/Zoom-Interaktion Ziel > 45 FPS bei Referenzdesktop und > 30 FPS bei typischem Mobilgerät mit reduziertem Objektniveau.
- Nach Anfangsladung keine dauerhaften Full-Series-setData-Aufrufe für jeden Tick; nur betroffene Bars und Indikatorsegmente aktualisieren.
- Keine Speicherlecks nach 20-mal Symbol-, Timeframe-, Konto- und Themewechsel; ResizeObserver, MouseHandlers, Subscription-Listener, Worker und Canvas-Layer korrekt freigeben.
- FX-Animationen sollen bei background tab, reduced-motion und während Drag vollständig pausieren; CPU-Nutzung nicht dauerhaft nur für Glows.
- Chart-/API-Ladespinner klar anzeigen, Konsole keine ungefangenen Exceptions, p95 Chart-TTI unter 2s nach geladenem lokalen Datencache als Profilziel.
- Gängige Datenbedingungen: 1s Quote-Updates, 5s Bar-Updates, 15–30s Position-/Konto-Resync, mit vernünftigem Backoff; echte Zeitstempel statt starrer Annahmen.

Caching:
- Cache-Keys enthalten Account-Identität, Broker, Symbol, Timeframe, Historienrange, Datenquelle und Berechnungsversion.
- Indicator-Cache nach SourceBar-Version + Parameterhash.
- Visual-Render-Scheduler requestAnimationFrame, Ereignisse coalescen.
- Indikatorberechnungen bei >1000 Bars optional Web Worker; teure Werte inkrementell statt pro Tick vollständige O(N²)-Neuberechnung.
- Backend begrenzt gleichzeitige MT5-Calls, queued sie sauber unter bestehendem Gateway-Lock, zeigt „Daten verzögert“ statt Deadlock.

## 17. Barrierefreiheit, UX-Qualität und Ästhetik [UX-002]

Dieses Produkt soll **eigenständig und professioneller als das bisherige Dashboard** wirken:
- Stone/Rune: hochwertige dunkle Obsidianflächen, bionische/elektrische Cyan-/Amber-Akzente, metallische Rahmen, feine Runen; in der eigentlichen Chartfläche funktional ruhig.
- Dark und Light: neutrale, hochwertige Trading-Terminal-Optik ohne verwirrende Masken.
- Alle Grafiken aus den vorhandenen 50 vorbereiteten Assets *nur* für Rahmen/Buttons/Panels; NIE full-color Text-Overlays hinter DataGrid-Zahlen (dieser Fehler trat im bestehenden Cockpit mehrfach auf).
- Genaue Größe/Spacing/Preis- und Text-Kontraste, Zahlendigits tabular-nums, keine halbtransparenten Beschriftungen direkt vor bunten Bar-Grafiken.
- Stufenweise Offenlegung: Normale Chart-Ansicht schlank; erweiterte Kontrolle in einklappbaren Panels. Keine 80 Buttons in einer Reihe.
- Modale und sicherheitskritische Aktionen bleiben ruhig und funktional; kein Chaos-Glow im Hintergrund während SL-/TP-Eingabe.
- Keyboard-Fokus, Labels/aria, kein Tooltip nur per Hover, Screenreader-Alternative als Objekttabelle; geeignete Mindestgrößen für Touch.
- Vor jedem Release optischer Screenshotvergleich bei 1920×1080, 1366×768, 1024×768, 768×1024, 390×844; Stone/Dark/Light und Fullscreen. Keine abgeschnittenen Axis-/Level-Labels.

## 18. Teststrategie und harte Abnahme-IDs [TEST-001]

### 18.1 Automatisierte Tests

**TypeScript Unit Tests:**
- Indicator-SMA/EMA/Wilder-RSI/MACD/ATR/VWAP inklusive fehlender Bars, Source-Auswahl, Startwarmup, DST/Sessionreset.
- Drawing geometry: bei Ankern (time, price) bleibt Preis beim Zoom/Resize/TF gleich; Fibo 0.618 auch bei inversen Ankern korrekt.
- ChartLayer hit-tests für Überlappung, Drag-Lock und korrektes Dispatching; Snap auf broker tick size.
- Vorzeichen Long/Short, TP/SL-Preisvalidierung, R:R bei Nullrisiko, Quote-Null/NaN.
- Undo/Redo nur für DrawingStates; Keine Broker-Mutation nach lokalen Edit-Operationen.

**FastAPI Python Unit/Integration (Fake MT5):**
- Ganze Domain-Matrix: Long/Short, US-Dollar-Konto, EUR-Konto, Forex-JPY, XAUUSD und kontraktgrößenunterschiedliche CFD-Symbole; order_calc_profit mocked authoritative.
- StopsLevel/FreezeLevel, Rundungsfallen, positions_get none, Account unverifiziert, 409 stale revision, Duplicate-Commit-idempotency, Symbolhandelssperre.
- Guard: Hard-Lock; Guard für riskrelevante Neuorder vs. Risiko reduzieren beim vorhandenen Stop differenzieren.
- Latenz und konkurrierende Konto-Requests über existierendes scoped(account) / Lock testen.
- Keine Real-Order-/Echte Broker-Sideeffects in Unit Tests. MT5-Schnittstelle injectable machen; nur FakeBroker im CI.
- Persistenz-Migration, Backup-Restore, Drawing-Konflikte, JSON-Import-Sanitizing.

**Browser E2E mit Playwright:**
- Chart Navigation, Line/Fibo edit, Objektbaum, indicators add/remove, Preisachsen, Vollbild, Mobile Touch.
- Chartposition ändert sich nicht beim Slider/Theme/Resize.
- Eine Fake-Position erscheint nur im korrekten Konto/Symbol.
- Drag aktualisiert Preis/geschätzte PnL ohne POST; erst Bestätigen sendet einen einzigen mutierenden Fake-Request.
- Race: EA verschiebt SL während Drag → Bestätigen verweigert (409) und zeigt neue Position; kein stiller Merge.
- Reconnect, offline, stale quote, modal escape, account switch während Drag.
- Chart-level Labels rechts ungekürzt. Panel-Indikatoren überlagern Preisachse nicht.
- Alle FX und Hintergrundfunken bei reduced-motion/in Drag pausiert.

**Windows Real-MT5-Demo End-to-End:**
- Exakte Terminal-/Accountverifizierung, erst nur Read-Only.
- Nach bewusst genehmigter Testposition im Demo-Konto: SL/TP Preview, User bestätigt, MT5-Retcode und tatsächliche neue Brokerlevel überprüfen. Testposition wieder schließen nur nach Zustimmung.
- Aktiver EA ändert Stop gleichzeitig → erwarteter Konfliktschutz statt Überschreiben.
- Dokumentierte Ausfälle bei Verbindungsunterbrechung und stalen Quotes.
- Keine echten Livetrades, keine funded Trades im unbestätigten Test.

### 18.2 Abnahmefälle (Agent muss jeden nachweisen)

| Test | Anforderung und erwartetes Ergebnis |
|---|---|
| AT-001 | Indikatorsuche zeigt alle P0-Indikatoren, jede Instanz lässt sich konfigurieren |
| AT-002 | 2× EMA20 mit verschiedenen Farben/Parametern ohne gegenseitige Störung |
| AT-003 | RSI im separaten Pane, eigene Skala und Höhe per Drag einstellbar |
| AT-004 | 1000-Bar-Pan/Zoom: Trendlinie hält exakt ihre Anker |
| AT-005 | Fibo Retracement 0.236/0.382/0.5/0.618/0.786/1 korrekt bei steigenden/fallenden Ankern |
| AT-006 | 10 beliebige Zeichnungen bleiben nach Refresh/TF-/Kontowechsel korrekt im Scope |
| AT-007 | Objekte lassen sich verstecken, sperren, löschen, duplizieren, undo/redo |
| AT-008 | Kontospezifische Position erscheint nicht beim falschen Account |
| AT-009 | Toggle „Positionen“ versteckt Overlay, lässt Backend-Position unverändert |
| AT-010 | Entry, SL, TP mit korrekter Seite/Preis für BUY und SELL |
| AT-011 | Drag-SL zeigt Live-Preis, vorläufige USD-Schätzung, verfügbare Broker-Preview |
| AT-012 | Drag bei StopLimit-Verletzung sichtbar abgelehnt, kein commit möglich |
| AT-013 | Beim Drag KEIN order_send, bei bestätigtem Commit genau eine geprüfte MT5-Änderung |
| AT-014 | Nach Commit zeigt UI nur tatsächlich rückgelesene Broker-Level |
| AT-015 | Ohne Kontoidentität, bei falschem Ticket/Symbol oder Hard-Lock sichere Ablehnung |
| AT-016 | Account/Timeframe-Wechsel während Draft bricht sicher ab |
| AT-017 | Stale Revision durch EA-Trailing ergibt 409, neue Brokerwerte bleiben |
| AT-018 | USD-Berechnung entspricht order_calc_profit für 4 Symbol-/Accountkonstellationen |
| AT-019 | Fremdwährungskonto zeigt Account-Currency korrekt; USD-Wert nur mit gültiger Konversion |
| AT-020 | Kein TP/SL ergibt „nicht gesetzt“, nicht Phantom-0-Zone |
| AT-021 | Mehrere Tickets derselben Symbolrichtung und gegenläufige Tickets korrekt getrennt |
| AT-022 | Keine überlappenden/abgeschnittenen Daily-High-, POC- und Order-Axis-Labels |
| AT-023 | Stone/Dark/Light und Fullscreen erhalten Zeichnungen, Achsen und Chartfunktionen |
| AT-024 | Session-/DST-Wechsel ändert Zeitdarstellung, aber nicht ursprüngliche UTC-Anker |
| AT-025 | 5.000 Bar + 20 Indikatoren + 1.000 Zeichnungen in definiertem Budget |
| AT-026 | Fehlende MT5-Daten erzeugen sichtbaren Fehler und KEINE falsche Orderanzeige |
| AT-027 | Journal zeigt nach der Migration weiterhin „Alle Strategien“ |
| AT-028 | Tages-DD, Guard, EA-Logik und MT5-Accounts bleiben wie zuvor geschützt |
| AT-029 | Demo-/Replay-/Visual-FX-Knöpfe senden keine echten Handelsmutationen |
| AT-030 | Jede echte Änderung ist in einem Audit-Log nachvollziehbar, ohne Passwörter |
| AT-031 | Symbol-/Konto-/TF-Wechsel 20-mal ohne Memory-Leak, stale UI oder Event-Duplikat |
| AT-032 | Preview-Timeout, doppelte Bestätigung, 409-Konflikt, MT5-Retcode-Ablehnung korrekt |
| AT-033 | Layout exportieren/importieren, neu laden, Schema-Migration und Konfliktfälle |
| AT-034 | Touch-Drag unter 390px und Windows 150% DPI korrekt |
| AT-035 | Kein Signalmarker wird versehentlich zu einer echten Position/Order umgedeutet |

Alle P0-Tests müssen **grün** sein, einschließlich der neuen Intelligence-Tests **AT-036–040, AT-049–050 und AT-055–056** aus §24.14, soweit die zugehörige P0-Phase erreicht ist. P1-Tests erst verpflichtend, wenn das jeweilige Feature aktiviert wird; für neue P1-Module gilt §24.14. P2-Replay wird separat abgenommen. Performancewerte sind zu protokollieren statt pauschal „getestet“ zu behaupten.

## 19. Entwicklungsphasen und Definition of Done [DELIVERY-001]

**Phase 0 — Sicherheit, Audit, Designsystem und Chart-Adapter**
- Bestehendes Dashboard unverändert lauffähig sichern, Gold/Titan-Regression-Suite aufstellen, Broker-Client und Chartmodul isolieren, genaues Datenmodell/Idempotenz-Contract beschreiben.
- Sicherheitsprüfung der aktuellen APIs und des Tunnels, Auth-/Mutation-Policy, Feature-Flags, Layout-Persistenz-Baseline.
- Lightweight Charts v5 kompatibles Proof-of-Concept getrennt von Produktivchart: Kerzen, Datenmarker, EMA, Zoom, Preislevels, Stone Theme. Baseline-Perf und Visual-Snapshots.
- - **Intelligence-Basis:** Für Titan/GoldM15 die vorhandene EA-/Broker-Eventtelemetrie und Historiendaten auditieren; P0-Decision-/Lifecycle-/Snapshot-Schemas und Datengütepfade aus §24 entwerfen.
- **Gate 0:** Alle bisherigen Live-Cockpit-Funktionen bestehen Tests, neue v5-API läuft im Prototyp, keine Orderroute ist unsicherer geworden.

**Phase 1 — Chart-Shell und Indikatoren**
- Topbar, linke Tools, Pane-Manager, Symbol/TF/ChartType-Suche, Indikator-Registry, Parametereinstellungen, Right Sidebar, Fullscreen.
- A11y, Context Menu, Datenfenster, LayoutStore.
- - **Intelligence-P0:** EA-Decision-Inspector mit belegter Recorded/Not-Recorded-Anzeige und What-if-Draft-Grundgeometrie vorbereiten; pure EA-Signalparität prüfen.
- **Gate 1:** P0-Indikatoren korrekt, Crosshair/Pane-Resizing, Account-/Symbol-Wechsel und bestehendes Dashboard funktionsfähig.

**Phase 2 — Drawings und Persistenz**
- Trendlinie, H/V, Rechteck/Zonen, Fibo, Text, Undo/Redo, Snap, Objektmanager, Speicherung in SQLite, Export/Import.
- Hit-testing und kollisionsfreier Label-Layer.
- - **Intelligence-P0:** Read-only Trade-Lifecycle, Entry-/Exit-Datensnapshots und Journal-Links aufbauen; nicht vorhandene historische Stop-/Entscheidungsdaten markieren.
- **Gate 2:** AT-004–007, AT-022–024, AT-033–034 grün.

**Phase 3 — Echte Positionslayer und USD-Preview**
- Read-only Snapshots für Positions-/Pending-Aufträge, Farb- und Sichtbarkeitsschalter, Entry/SL/TP-Zonen, order_calc_profit-basierte MoneyEngine.
- Drag-Preview ohne Ordermutationen, MT5-Identität und Quote-Staleness.
- - **Intelligence-P0:** What-if A/B mit order_calc_profit/order_calc_margin validieren; FR-026, FR-027, FR-033 und FR-035 auf Gate-3-Qualität bringen (AT-036–040/049–050/055–056).
- **Gate 3:** Live-Zonen korrekt, Multi-Ticket, Kontowährungsangaben und USD-Vorschau belastbar, alle Trade-Aktionen weiterhin gesperrt bis separate Freigabe.

**Phase 4 — Sicheres, echtes MT5-SL-/TP-Editing**
- Gesicherte Accountverifizierung/Guard-Pipeline, versionierte Preview, Pending-Dialog, Einmalbestätigung, idempotente Commit-Routes, Conflict-Handling, Audit-Log.
- Demo-Windows-MT5-Abnahmetest unter Benutzerkontrolle; EA-Trailing-Konfliktprobe.
- - **Intelligence-Grenze:** What-if bleibt ohne eigenen separaten Nutzer-Confirm ausschließlich Read-only; Snapshot-/Decision-Inspector darf nie Brokerwrite auslösen.
- **Gate 4:** Kein unautorisierter SL/TP-Change, MT5-Broker-Reconciliation funktioniert, AT-008–021 und AT-030/032 grün.

**Phase 5 — Professional Studio / P1**
- Multi-Chart, Alerts, erweiterte Fibo-/Kanäle, Presets, Watchlist, Planer, Pending Orders mit eigener Guard-Policy, Multi-Device-Sync optional.
- **Intelligence-P1:** Multi-Timeframe-Confluence, Smart Sessions/Liquidity, Execution Quality, Marktregime und News-Overlay gemäß §24.4–24.7/24.9 mit AT-041–048/053–054. **P2-Replay** erst danach mit AT-051/052.
- Kein P1 Feature priorisieren, bevor P0 sicher und nutzbar ist.

**Migration/Ausrollen:**
- Bis Gate 4 bleibt **legacyChartEnabled=true** als Fallback möglich; Feature-Flag chart_studio_v1 für Opt-in. Datenbanken migrationsfähig und reversibel.
- Kein Merge nur aufgrund eines schönen Screenshots. Zu jedem Gate: Code, Tests, menschliche UI-Screenshots, Performancezahlen, Browserconsole-Log, Broker-Tests, Known-Limitations.
- Nach erfolgreicher stabiler Umstellung darf Altchart nach gesonderter Freigabe entfernt werden. Nicht automatisch veraltete Presets, MT5 EA-Dateien oder Journalzugriff löschen.

## 20. Verbindliche UX-Checklisten [UX-003]

### 20.1 Die fünf primären Benutzerabläufe

**A. Chart vorbereiten (unter 30 Sekunden)**
1. Account, Symbol, M15 wählen; Charttyp Kerzen.
2. Indikator-Katalog öffnen, EMA20 und RSI14 hinzufügen.
3. EMA-Stil per Klick in Legende bearbeiten, RSI-Pane nach unten ziehen.
4. Layout „Mein Gold Setup“ speichern und wieder öffnen.
5. Ergebnis muss gleich aussehen und korrekt rechnen.

**B. Chart zeichnen**
1. Trendlinie auswählen und Anker an zwei Kerzen setzen.
2. Fibo Retracement zwischen zwei Swing-Ankern ergänzen, Parameter der 0.618-Linie ändern.
3. Beide Zeichnungen verschieben und speichern.
4. Chart auf H1 wechseln und zurück: Anker bleiben exakt in UTC/Zielpreis.

**C. Positionen einschalten**
1. Positionen „alle“ aktivieren.
2. Jede echte Position hat Ticket, Entry, SL, TP; UI zeigt echte Daten.
3. Positionsanzeige deaktivieren: Zeichnungen und Marktpreis bleiben.
4. Wieder einschalten: Brokerwerte unverändert.

**D. SL editieren**
1. Position wählen und echten SL-Griff ziehen.
2. Popup zeigt aktuell aktualisierten USD-Verlust beim neuen SL und R:R.
3. Loslassen → Alt/Neu + Account + Ticket + Risiko + Guard anzeigen.
4. Abbrechen → keinerlei MT5-Write; Erneut ziehen und bewusst „An MT5 senden“.
5. Brokerwert muss nach Readback exakt wieder im Chart/Positionspanel stehen.

**E. Fehlerfall**
1. Während SL-Drag ändert der EA Trailing Stop.
2. Benutzer bestätigt den alten Draft.
3. System meldet Konflikt, liest aktuelle Position, zeigt alt/neu und bietet neuen Entwurf.
4. Niemals den neuen EA-Stop still überschreiben oder Erfolg vortäuschen.

### 20.2 UX-Mikrointeraktionen

- Werkzeuge haben Tooltips und Statusleiste: „Klicken für ersten Punkt“, „Klicken für zweiten Punkt“, „Esc abbrechen“.
- Während Trading-Drag schwebendes Preistag an der Griffposition; Label zeigt Währung und Datennachweis. Beim Snappen Haptik optional nur auf mobilen Geräten.
- Native Preisachse ist frei von abgeschnittenen Langtexten: Vollnamen gehören in Labelrail/Tooltip, nackte Preiswerte in Preisachse.
- Hilfefenster „So bedienst du das Chart Studio“ über ?; eigene Einstellungen für Default-Werkzeuge, Theme und Präzision.
- Lesbare Leerstates: „Keine Positionen“, „Keine Bars“, „MT5 offline“, „SL nicht gesetzt“, „Berechnung derzeit nicht verfügbar“, „Guard gesperrt“.
- Anfänger-/Profi-Modus optional P1, aber dieselben Brokerprüfungen.

## 21. Bewusste Grenzen und Anti-Requirements [LIMIT-001]

**Explizit NICHT akzeptabel:**
- Pixel-Screenshots statt interaktiver Charts, „zufällige“ synthetische Volumen-/Liquiditätsdaten, hart codierte unrealistische USD-Zielbeträge.
- Kopie der proprietären TradingView-Oberfläche oder nicht lizenzierter Charting-Library-Dateien.
- Handelssimulation, die sich als echte Position ausgibt.
- Bewegen einer visualisierten SL-Linie mit sofortigem unbestätigtem order_send.
- mt5.order_calc_profit-Fehler durch Kontraktsize-Schätzung verbergen.
- Falsches Konto nach Fehlern automatisch benutzen oder mehrere AccountSessions ohne Mutex parallel wechseln.
- Drawings nur als Browserpixel speichern, beim Scroll neu erfinden oder beim Timeframe-Wechsel verschieben.
- Indikatoren ohne korrekt getestete Mathematik oder ohne Warm-up-Daten.
- Pseudo-Orderflow/„große Orders“ aus M1-Tickvolumen fälschlich als echte institutional Liquidity darstellen.
- GUI, die bei 125/150% Windows-DPI Price Labels clippt; Panels, die Sicherheitswarnungen verdecken.
- Permanente FX/Runen-Partikel, die über aktive Ordergriffe/Statusmeldungen laufen.
- Implementierung in einer zweiten Offline-Demo ohne Integration in das echte Dashboard.
- Main-Commit mit „keine Fehler“ ohne tatsächliche Testlogs und saubere manuelle Verifikation.

## 22. Quellen, Referenzen und Dokumentationspflege

Diese Quellen bei Implementierung auf **heutige Version und Lizenzbedingungen prüfen**; der Code-Agent soll aktuelle Originaldokumentationen lesen, nicht ungeprüft vereinfachte Beispiele übernehmen.

1. TradingView Lightweight Charts offizielle Website/Plugin-Architektur: https://tradingview.github.io/lightweight-charts/docs/plugins/intro
2. Series primitives und Preis-/Zeitskalen: https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives
3. Pane primitives: https://tradingview.github.io/lightweight-charts/docs/plugins/pane-primitives
4. Official Chart API: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IChartApi
5. Official timeScale coordinate/time conversion: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ITimeScaleApi
6. Official priceToCoordinate / coordinateToPrice: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi
7. Offizielle v5-Migrationshinweise und Plugin-Codebeispiele: https://github.com/tradingview/lightweight-charts
8. TradingView Advanced Charts Zugriff/Lizenzen: https://www.tradingview.com/charting-library-docs/latest/quick-start/
9. TradingView Charting Library Limitierungen: https://www.tradingview.com/charting-library-docs/latest/resources/Frequently-Asked-Questions/
10. MT5 order_calc_profit (Kontowährung): https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py
11. MT5 symbol_info (digits/ticksize/stops/freeze): https://www.mql5.com/en/docs/python_metatrader5/mt5symbolinfo_py
12. MT5 order_check (keine Ausführungsgarantie): https://www.mql5.com/en/docs/python_metatrader5/mt5ordercheck_py
13. Bereits vorhandenes 2EAs-Gateway: account_gateway.py, aktuell im Repository; frühere Multi-Account-Tests in tests/.
14. Bestehende Cockpit-UI, Datenrouten, Positionen und Guard: app.py; FX und Styling in static/.
15. Projektinterne Instrumentierung und Backtests aus bestehenden tests/ und output/ lesen, soweit verfügbar.

## 23. Definition eines erfolgreichen Gesamtprodukts

Das Projekt ist erst abgeschlossen, wenn **ohne Spezialwissen** folgende Aussagen zutreffen:

- „Ich kann über den Chart alles Relevante anzeigen, ausblenden, hinzufügen und verändern: Indikatoren, ihre Parameter, Farben, Zeitfenster, Zeichenobjekte, Fibo-Level und gespeicherte Ansichten.“
- „Ich sehe meine echten Positionen eindeutig nach MT5-Konto und Ticket, oder verberge sie bei Bedarf vollständig.“
- „Ich ziehe die SL-/TP-Zone und sehe sofort die daraus resultierenden Werte in Dollar sowie das Risiko. Erst meine bewusste Bestätigung verändert echte Brokerdaten.“
- „Mein EA darf weiter autonom arbeiten. Falls er einen Trailing Stop verändert, überschreibt meine veraltete Chart-Vorschau ihn niemals unbemerkt.“
- „Daily High/Low, POC, meine Zeichnungen und die Achsen bleiben auf jedem Zoom und bei jedem Geräteformat lesbar.“
- „Ich kann das Studio personalisieren, Layouts sichern, wieder laden und mit meinen bisherigen 2EAs-Funktionen arbeiten.“
- „Ein optisch heftiger Effekt ist als Effekt erkennbar und niemals ein vorgetäuschter Orderfill oder ein versteckter Klick.“
- „Ich kann einen realen Trade vom belegten EA-Entscheidungsgrund über den Broker-Fill und alle nachweisbaren SL-/TP-Änderungen bis zum Exit nachvollziehen und zum damaligen Entry-/Exit-Chart zurückkehren.“
- „Ein What-if-Trade zeigt Risiko und Gewinnpotenzial anhand des korrekten MT5-Kontos; er verändert niemals ohne ausdrückliche Freigabe echte Orders.“
- „Ich sehe bei fehlenden Entscheidungs-, News-, Ausführungs- oder Tickdaten ausdrücklich ‚nicht aufgezeichnet / nicht verfügbar‘ statt erfundene Rückblicke.“
- „Ein Wartungsagent kann jeden Codepfad anhand dieser Master-Spezifikation und der Test-IDs nachvollziehen; keine neuen Schatten-Architekturen entstehen.“

## 24. Chart Intelligence — zehn zusätzliche, verbindlich einzuplanende Module [INTEL-001]

**Auftragserweiterung vom 09.10.2026:** Die folgenden zehn Module gehören zum selben 2EAs Chart Studio. Sie ersetzen keine FR-001–FR-025, sondern bauen darauf auf. **Keine separate Feature-Spezifikation anlegen.** Abhängigkeiten/Umfang nachstehend sind ausdrücklich Teil der Coding-Agent-Abnahme. Eine frühe P0-Stufe bedeutet eine **funktionierende erste Version**, nicht zwangsläufig alle analytischen Unterfunktionen.

**Verbindliche Entwicklungspriorität:**
- **P0 / früh:** FR-026 EA-Entscheidungsanalyse, FR-027 What-if-Tradesimulator, FR-033 Trade-Lifecycle und FR-035 Chart-Snapshots/Journal-Verknüpfung. Zuerst read-only mit belastbaren Daten; für historische nicht protokollierte EA-Entscheidungen explizit „nicht verfügbar“.
- **P1:** FR-029 Multi-Timeframe-Confluence, FR-030 Sessions/Liquidity, FR-031 Execution Quality, FR-032 Marktregime, FR-034 News-Overlay.
- **P2:** FR-028 vollständiger barweiser EA-Trade-Replay. Frühe P0-Lifecycle-Darstellungen sind **kein** vollständiger Replay; dessen Sequenz-/No-Look-Ahead-Verifikation folgt separat.

**Querschnittsregel:** Vergangene **gehandelte Ereignisse** sind Broker-/Terminaldaten; **EA-Entscheidungsgründe** sind nur dann historisch wahrheitsgetreu, wenn sie zum Entscheidungszeitpunkt protokolliert wurden. Eine spätere Neuberechnung muss den Zusatz **„rekonstruiert“** samt Daten-/Parameterstand tragen. Signal, Plan, Filterkandidat, bestätigter Fill, Paper-Trade und historische Rekonstruktion sind niemals austauschbar.

### 24.1 FR-026 [P0] EA-Entscheidungsanalyse / visueller EA-Debugger

**Ziel:** Auf eine Kerze, einen historischen Trade oder einen abgelehnten Kandidaten klicken und die **damals tatsächlich geprüften Bedingungen** beider EAs sehen: Welche erfüllten Regeln führten zum Signal, welche Filter verhinderten eine Ausführung, welche Guard-Entscheidung galt? Das Studio hilft, Strategiefehler und Regimeabhängigkeiten zu untersuchen; es gibt keine Gewinnzusage.

**UI (Kernablauf):**
1. Toggle **EA-Diagnose**; Filter Account (Titan/GoldM15), Strategie/Subsystem, Long/Short, Eventtyp (Kandidat, Signal, abgelehnt, Orderversuch, Fill), Zeitraum und ggf. Grundcode.
2. Marker an der **exakten Ereigniskerze**; Tooltip unterscheidet Live-Decision, historische Eventaufzeichnung und späteres Recompute. Keine ausgeführten Trades allein aus Chart-Signal-Markern ableiten.
3. Klick öffnet eine **Decision Inspector**-Seitenkarte mit regelbasiertem Status (erfüllt/nicht erfüllt/nicht berechenbar), damaligem Parameterwert, tatsächlichem Featurewert, Schwelle, ausgewertetem M15-Barzeitpunkt, Datenstand und Reason-Code.
4. Übergeordneter Entscheidungsbaum: **Setup → Signal → Entry-Filter → Risiko-/Guard-Prüfung → Orderversuch → Broker-Retcode/Fill**. Nur tatsächlich vorhandene Stufen anzeigen; keine fehlende Brokerantwort als „gebucht“ markieren.
5. „Warum kein Trade?“ zeigt die belegten Blocker (z. B. Filter verletzt, Spread zu hoch, Newsfenster, max Risiko, Handelszeit, kein neues Signal). Keine Behauptung über nicht protokollierte Gründe.
6. Historische Decision Inspector-Ereignisse mit Entry-/Exit-Journal verbinden, jedoch nur über stabil belegbare ID-Kette (account+strategy+symbol+barUtc+decisionId+orderId/positionId), nicht bloß Zeitnähe.

**Pflicht-Schema:** \`DecisionEvent {eventId, accountId, terminalIdentityHash, symbol, strategyId, subsystemId?, strategyVersion, parameterSetHash, decisionTimeUtc, evaluatedBarCloseUtc, timeframe, barIsClosed, sourceQuoteTimeUtc?, featureVector:[{id, value, unit, timeframe}], predicates:[{ruleId, observedValue, comparator, threshold, outcome, reasonCode}], stage, outcome, guardSnapshot?, orderAttemptId?, brokerTicket?, dataProvenance:"recorded"|"reconstructed", dataRevision, capturedAtUtc, correlationId}\`. Fehlt die Originaleventreihe, liefert die API \`availability:"not_recorded"\` statt erdachter Historie.

**Implementierungsoption:** Nicht jede Tickentscheidung an den Browser streamen; eventbasierte, versionierte Telemetrie via bereits geschützten Terminal-Dateikanal/Bridge oder agentenkompatible Logging-Schnittstelle. **Keine unfreigegebene Änderung der Entry-/Exit-Regeln in MQL5**; zunächst Read-only-Adapter und Diagnose-Ereignisse an Hookstellen, danach Regression der unveränderten EA-Signalresultate. Rates-/EMA-Recompute allein kann unbekannte EAs/Guard-Zustände/Parameter nicht beweisen.

**Erste P0-Grenze:** Entscheidungsfenster + gespeicherte Feature-/Predicate-Snapshots für **neu eintreffende, instrumentierte Ereignisse**, korrekte Unavailable-States bei Alt-Trades; Keine automatische Modellinterpretation als Faktenbasis. Optionale freie Erläuterung folgt ausschließlich aus strukturierten Reason-Codes.

**Akzeptanz:** AT-036/037/038. Die UI soll klar zeigen „3/5 erfüllt“ als Regelstatus, **nicht** als Gewinnwahrscheinlichkeit.

### 24.2 FR-027 [P0] What-if-Tradesimulator mit echten Broker-Rechenparametern

**Ziel:** Unter echtem Chart eine **beliebig verschiebbare virtuelle** Entry-/SL-/TP-Projektion verwenden, ohne bestehende MT5-Positionen zu verändern. Zwei benannte Modi: \`PLAN\` (noch keine Position) und \`POSITION_SCENARIO\` (bestehendes Ticket, simulierte Alternative).

**UI:** Mit dem Long-/Short-Positionswerkzeug einen Entry-Anker und farbige SL-/TP-Zonen setzen. In einer Planbox editierbar: Konto/Symbol, Richtung, gewünschtes Risiko ($, Prozent Equity), Lots bzw. auto-berechnete Lots, Entry, SL, TP, Spread-/Slippage-Annahme, R:R, Margin, Stop-Abstände, aktuell verwendeter Brokerpreis. Mehrere Szenarien A/B als schaltbare Overlays; „Vergleichen“ zeigt Risk/Reward, erforderliche Lotgröße, Margin-Puffer, DD-Reserve, Portfolioexposure. Preis und USD-Werte live bei Drag, **schätzungsweise** bis zur autoritativen Serverantwort.

**Geldmathematik:** Für konkrete Brokerkonten \`mt5.order_calc_profit\` und \`mt5.order_calc_margin\` aus dem richtigen verifizierten Terminal lesen, keine universelle Kontraktgrößenformel und kein Trading-Modus zum reinen Rechnen erforderlich. Lotgröße robust mit symbol.volume_min/max/step diskret bestimmen, Risk-per-Trade auf Equity, wirksame Stopdistanz und tick-size; serverseitig Grenze suchen (z. B. binäre Suche über gültige Lotsteps), und Ergebnisse auf Brokergrenzen abrunden. Zeige Spread/Fees/Swap/Slippage als offengelegte Annahmen, nicht präzise Garantien. Korrelations-/Portfolio-Szenarien nur mit tatsächlich verfügbaren Positionen, Exposure und gültigen FX-Umrechnungskursen.

**Risk Guard:** Live-/Funded-Account zeigt seine geltenden DD-/News-/Risikolimits als Kontext. Überschreitung -> roten Hinweis; **niemals** allein durch Simulatorfreigabe die echten Guard-Regeln umgehen. Schätzung bei veraltetem Quote oder unzureichendem Marginstatus blockiert „als reale Order übernehmen“, simulieren darf read-only weitergehen.

**Sicherheitsgrenze:** Standardmäßig keinerlei Broker-Mutation. Exportiert lediglich einen versionierten \`TradePlan\`. Ein optionales reales Orderticket müsste FR-021 mit eigenem Confirm+Auth-Flow erfüllen, niemals ein Klick auf „Simulation berechnen“ oder Drag.

**P0-Definition:** Mindestens ein Long- und Short-Szenario, R:R, Lots, hypothetischer Brutto-PnL in Kontowährung/USD, Margin + DD-Abstand und A/B-Vergleich. Brokerberechnung bei fehlender Verbindung -> **nicht verfügbar**, statt erfundene USD-Beträge. AT-039/040.

### 24.3 FR-028 [P2] Barweiser Trade-Replay / Entscheidungs-Replay

**Ziel:** Vergangene Marktdaten Zeitpunkt für Zeitpunkt abspielen; Entry, SL, TP, Indikatoren und belegte EA-Entscheidungen nur zeigen, sobald sie nach Replay-Zeitpunkt bekannt waren. Damit lassen sich Strategieentscheidungen rückblickend visualisieren, nicht Gewinne im Livekonto vorhersagen.

**Bedienung:** Trade auswählen → „Replay starten“ → frei wählbarer Startpunkt vor Entry, 1×/2×/5×/10×, Vor/Zurück eine Bar, Pause, Jump zu Fill/SL/TP/Exit, synchrones Journal und Sidepanel. In Replay-/Demo-Modus sind **sämtliche MT5-Mutationen technisch gesperrt**, unabhängig vom sichtbaren Trading-Button.

**Datenvertrag:** OHLC-UTC-Zeitstempel mit Quellkonto/Symbol/TF; eindeutige MarketDataVersion, Corporate Actions (wo relevant), Session-/DST-Daten, exakt bekannte Deal-/Decision-Timestamps; die aktuelle unvollständige Bar darf nicht rückwirkend als geschlossene historische Entscheidungsgrundlage erscheinen. Konfigurierbar Trade-/Market-Data-Snapshot speichern; Replay über dieselbe datenversionierte Entscheidungsreihe. Vor dem historischen BarEnd aufgezeichnete Tick-Signale separat von BarClose-Signalen kennzeichnen.

**Wichtige Grenze:** Historischer Candle-OHLC allein liefert **keine** eindeutige Reihenfolge von SL-/TP-Berührungen innerhalb einer Bar. Falls Tickdaten fehlen, „intrabar-Reihenfolge unbekannt“ anzeigen; kein unverdientes perfektes Fill, keine falsche PnL-Kurve. EA-Entscheidungsgründe fehlen -> „nicht aufgezeichnet“. Recompute separat als „nachberechnet“ markieren.

**P2-Gate:** AT-051/052; zunächst nachrangig gegenüber sicherem P0-Chart und Decision-Lifecycle.

### 24.4 FR-029 [P1] Multi-Timeframe-Confluence (D1/H4/H1/M15/M5)

**Ziel:** Konfigurierbares Confluence-Panel zeigt je TF Trendstruktur, EMA-Lage/-Steigung, Volatilitätsstatus, letzte bestätigte Strukturänderung und Setup-Status. D1/H4 Bias, H1 Struktur, M15 Setup, M5 Entry als **Preset**, nicht als universelle „richtige“ Strategie.

**Berechnung:** Für jede TF-Serie nur die am betrachteten Zeitpunkt **bereits geschlossenen** TF-Bars verwenden. Das offene H4-Bar darf ein vergangenes M15-Signal nicht mit späteren H4-Schlusswerten „verbessern“. Event-Zeitfenster, Datengranularität und Warmlauf sind Teil des FeatureSnapshot. Regeln/Schwellen editierbar und versioniert, kein künstlicher Score „85 % Erfolgswahrscheinlichkeit“. Gesamtergebnis: **Confluence erfüllt / teilweise / widersprüchlich / unvollständig**, je Unterkriterium mit erklärter Ursache.

**Interaktion:** Klick auf TF-Zeile fokussiert synchronisierte relevante Kerze und öffnet Details. Optionale Mehrchart-Ansicht aus FR-018 und Zeitlinkage wiederverwenden. Separater „Heute / beim historischen Trade“ Modus verhindert rückblickendes Look-ahead. Datenlücken führen zu \`UNKNOWN\`, nicht automatisch grün/rot.

**P1-Gate:** AT-041/042, beide Strategien separat konfigurierbar, Import aus EA-Decisionlogs wenn vorhanden.

### 24.5 FR-030 [P1] Smart Sessions und Liquiditäts-/Strukturzonen

**Ziel:** Session-Boxen und nachvollziehbare Preisstruktur visualisieren. Auswahl: Asia, London, New York, Frankfurt, Broker-Rollover, benutzerdefinierte Session sowie lokale Sommer-/Winterzeit, Opening Range, Session High/Low, Previous Day/Week High/Low, Equal High/Low, bestätigte Swing-Pivots und Liquidity Sweeps.

**Korrekte Semantik:** \`SessionRange\` mit UTC-Start/Ende, IANA-Zeitzone und DST-Regeln, verwendeter definierter Handelskalender, High/Low aus wirklichen OHLC-Bars, Roll-over-Gap kennzeichnen. „Equal High“ braucht konfigurierbaren Tick-/ATR-Toleranzbereich und Pivot-Strength, Sweep braucht exakte Wick-/Close-Regeln und ConfirmTF; Look-ahead bei Swing-Pivots verhindert durch rechtsseitige Bestätigungsbars.

**Liquiditätswarnung:** Equal Highs, Sweep-Kerzen und „potenzielle Stop-Cluster“ sind **nur geometrische Proxy-Zonen**, keine nachgewiesenen echten Stops/Orders. Im Chart explizit „Struktur-/Liquiditäts-Hypothese“ nennen. Angeblich große Orders, Book Depth, Footprint oder institutionelle Kauf-/Verkaufsvolumen nur anzeigen, wenn eine tatsächlich lizenzierte authentische Level-II-/Tickquelle existiert (FR-023).

**P1-Gate:** AT-045/046, inklusive Broker-Serverzeit ≠ Europe/Berlin, DST-Wechsel, Wochenend-Gap und fehlender Session-Daten.

### 24.6 FR-031 [P1] Execution Quality / Slippage-Kostenanalyse

**Ziel:** Warum weicht tatsächlicher Trade-Exit/Entry von geplanter Ausführung ab? Ein Analyse-Overlay und Journalmodul zeigt je Broker-Deal Fill-Preis, Lots, Spread zum Orderzeitpunkt (falls gespeichert), Kommission/Swap, Brutto-/Netto-PnL, Ausführungszeit und **nur bei vorhandener Referenz** Slippage/Latenz.

**Datenquellen:** MT5 History Deals/Orders, confirmed positions, Strategiedecision \`orderAttemptId\` + intendedPrice/timestamp vom lokalen EA-Eventlogger, Brokerretcodes und QuoteSnapshot (Bid+Ask+Timestamp). Korrelation ausschließlich mit stabilen order/deal/position IDs; bei Partial-Fills gewichtetes tatsächliches \`VWAP_Fill = Σ(price × volume)/Σ(volume)\`. Für Long-Buy/Short-Sell Entry die Richtung beim SignedSlippage definieren: adverse cost positiv; Exit gesondert nach Aktionstyp. Rohpreis-Differenz in Ticks und kalkulierten Geldwerten, Spread und Slippage nicht doppelt addieren.

**Missing-data-Fall:** Ein Deal ohne zum Orderversuch gespeicherten \`intendedPrice\` oder QuoteSnapshot erhält „Referenzpreis nicht aufgezeichnet — Slippage nicht berechenbar“. Aus einem späteren Candle-Close keine präzise Slippage ableiten. Ungemessene EA→Broker-Latenz „nicht messbar“ statt erfundene Millisekunden.

**UI:** Per-Trade Pfeil „geplanter Preis“ → „tatsächlicher Fill“, Tooltip mit Zeitqualität, kumulierte Ausführungskosten nach Strategie/Session/Regime, P50/P95/Max nur bei ausreichender Stichprobe mit Sampleanzahl. Keine doppelten Gebühren in Netto-PnL.

**P1-Gate:** AT-043/044, einschließlich Partial Fills, Teilverkäufen, Netto = Profit+Swap+Commission+weitere Brokergebühren soweit bereitgestellt, fehlender Referenz und gemischter Hedge-Positionen.

### 24.7 FR-032 [P1] Marktregime-Erkennung: erklärbar und reproduzierbar

**Ziel:** Trend / Range / High-Vol / Low-Vol / Event-Risk / UNKNOWN per Symbol und TF als zuschaltbare Infoebene. Erklärung: verwendete ATR-/ADX-/EMA-Slope-/Separation-/realized-vol-/BB-Width-/Structure-Features, Schwellen und Prioritätsregeln; nicht durch „KI-Gefühl“.

**Modell:** Pure deterministic rules mit Version, Lookback, Warmup, hysteresis/minimum duration gegen Zickzack, Timestamps und Confidence **als Datengüte/Regelabdeckung, nicht Gewinnwahrscheinlichkeit**. Gleichzeitige Trend- und HighVol-Zustände als Dimensionen statt „entweder/oder“, News Risk zusätzlicher Ereignisstatus. Speicherung \`RegimeSnapshot {asOfUtc,frame,featureValues,thresholds,revision,regimeTags,qualityFlags}\`.

**Strategievergleich:** Historischer Ertrag/WinRate/Expectancy pro Regime nur aus belegten Trades und as-of validen Regimewerten; Stichprobe n, Fees, Zeitraum, Konfidenzunsicherheit und OOS-Markierung immer sichtbar. Backtest-Validierung mit Walk-Forward/Out-of-Sample, keine adaptive Grenzwertoptimierung auf denselben Testzeitraum als Beweis. Kein Live-Trade-Block nur aufgrund eines visuellen Regime-Badges, sofern nicht separat als vom Nutzer genehmigte und EA-seitig getestete Guard-Regel implementiert.

**P1-Gate:** AT-047/048.

### 24.8 FR-033 [P0] Trade-Lifecycle, MFE/MAE und Exit-Diagnose

**Ziel:** Jede echte Broker-Position erhält einen nachvollziehbaren Verlauf, nicht nur einen Entry-/Exit-Punkt. Chronologische Timeline: EA-Entscheidung (falls aufgezeichnet) → Orderversuch → Broker-Fills → SL/TP initial → jede EA/manuelle SL-/TP-Änderung → Teilverkäufe/Scale-ins → Trailing → Exit und realisiertes Ergebnis.

**Quelle:** MT5 Order/Deal-History + Positionskennungen, langfristig kontinuierlich protokollierte Snapshot-/Audit-Änderungen. PositionTicket allein kann bei Netting/History unzureichend sein; account+server+symbol+positionIdentifier + order/deal IDs verwenden. **Historische SL-/TP-Zwischenstände**, die nicht protokolliert wurden, als „unbekannt“ markieren, niemals aus der Endposition interpolieren.

**Visualisierung:** Chronologische farbige, korrekt zeitverankerte Marker; Mouse-Hover zeigt „wer/was änderte SL“, bisheriger→neuer Preis, verifizierter EA-/Brokerzustand. Trailing-Linie nur dort fortsetzen, wo ausreichende Zwischenstände bekannt sind, sonst gestrichelte Lücken.

**MFE/MAE:** Max Favorable/Adverse Excursion **innerhalb der nachweislich offenen Haltedauer**; ideal über Tickdaten, andernfalls Bars konservativ approximiert und ausdrücklich als \`OHLC approximation\` gekennzeichnet. Exakte Reihenfolge von High/Low und Exit innerhalb der Exitkerze ist ohne Tickdaten nicht bekannt. Für Long/Short korrekt signieren und nur bis tatsächlichen Close-Zeitpunkt messen. Verfügbare Instrument-/Accountwechsel berücksichtigen. Opportunity Cost („verschenkter Gewinn“) nur als deskriptiver ex-post Wert, **nicht als sichere realisierbare Alternative**.

**P0-Kern:** rekonstruierbare Broker-Fills, aktuell verfügbare SL/TP-Events, Timeline/Filter pro Ticket sowie MFE/MAE mit Provenance. Mit FR-035 Snapshotverlinkung kombinieren. **P0 nicht blockieren**, nur weil ein vergangener EA keine vollständige Trailing-Telemetrie enthält — sichtbar „unvollständiger Verlauf“. AT-049/050.

### 24.9 FR-034 [P1] News-/Event-Overlay und Guard-Fenster

**Ziel:** High-/Medium-Impact-Kalenderevents als Linien/Zeitschatten am Chart (Currency, Eventname, Impact, veröffentlichte vs. revidierte Werte bei zulässiger Quelle), optional Countdown und individuell ein-/ausblendbare News-Blockfenster.

**Daten:** Lizenz-/API-konformer Provider, Quelle und lastUpdatedUtc, eindeutige eventId, UTC-Termin, betroffene Währungen, impact, status scheduled/revised/cancelled, individuelle Filter. Ohne lizenzierte Eventdaten zeigt der Chart „News-Kalender nicht verbunden“; aus Schätzungen dürfen keine echten News-Events oder Garantien generiert werden. DST korrekt handhaben.

**Guard-Isolation:** Visualisiertes News-Fenster ist **Information**, nicht die tatsächliche vom EA durchgesetzte Sperre. Wenn ein Broker-/EA-Guard existiert, dessen tatsächlichen Status separat als \`ENFORCED_BY_EA\` kennzeichnen. Bei Diskrepanz „UI-Overlay ≠ EA-Sperre“ warnen. Konto-/strategieabhängige Zeitpuffer sind konfigurierbar und dürfen nicht automatisch unbemerkt die EA-Regeln verändern. Bestehende Positionenverwaltung gegenüber Entry-Fenstern differenzieren (siehe SEC-001).

**P1-Gate:** AT-053/054, inklusive fehlender Providerantwort, Eventrevision, verschobener Uhrzeit und relevanter XAUUSD/USD-News.

### 24.10 FR-035 [P0] Automatische Chart-Snapshots + Journal-Verknüpfung

**Ziel:** Ein Journal-Trade öffnet mit einem Klick den historischen Marktstand **bei Entry und Exit**, inklusive damals belegter Indikatorwerte/Zeichnungen/Decision-Events. Dazu „Vorher / Nachher“ und Vergleich mehrerer Trades nach Strategie.

**Capture:** Bei bestätigtem Brokerfill und bestätigtem Exit je einen asynchronen Snapshottask anstoßen; Daten-Snapshot (OHLC bis asOfUtc, indicator params/values/version, account/symbol/TF, viewRange, executions, visible layers, styleVersion) **als primäre unveränderliche Provenance** speichern. Screenshot PNG/WebP optional zusätzlich clientseitig rendern, falls ein aktiver Browser existiert; **kein Browser geöffnet → trotzdem Datensnapshot möglich, Bild fehlt und wird nicht vorgetäuscht**. Server-Worker nicht an Browser-Event gebunden; idempotente eventId-Verknüpfung und retry-sichere Queue.

**Linking:** (account, terminalIdentityHash, positionIdentifier, dealId, captureType ENTRY|EXIT, asOfUtc, snapshotId, captureStatus). Journal-Eintrag mit Buttons „Entry ansehen“, „Exit ansehen“, „Vergleichen“. 2EAs-All-Strategies-Journal bleibt intakt. Kontosicherheit: Snapshot eines fremden Kontos darf nicht versehentlich im aktiven Trade-Cockpit erscheinen; expliziter Read-only-Popup-Kontohinweis.

**Zeit-/Preiswahrheit:** Bei späterem Öffnen keine heutigen EMA-Werte in den alten Screenshot hineinrendern. Falls damalige Feature-Snapshots fehlen, historisch deterministisch nachgerechnete Reihe gesondert als \`reconstructed\` markieren oder weglassen. Position-Fill vs. Setup-Marker trennen. Broker-Fillzeit aus tatsächlicher Deal-/Positionshistory, nicht Browseruhr.

**Speicherbudget:** Dateigröße/Format, lokale Retention, Bildkompression, Metadatenindex, Duplicate-Elimination, Backup-/Export und optional gezieltes Löschen. Keine Logins/Server-Pfade/Zugriffstokens in Bildmetadaten oder Importexport. Screenshot-Generation darf UI, MT5-Gateway und Trade-Engine nicht blockieren. Bereinigung schützt referenzierte Snapshots oder zeigt im Journal explizit „abgelaufen“.

**P0-Kern:** ENTRY-/EXIT-Datensnapshot, verifizierte Journal-ID-Verknüpfung, eine historische Vorher/Nachher-Ansicht, Export als PNG sofern Client verfügbar, und ehrlicher Fallback ohne Screenshot. AT-055/056.



### 24.11 Architektur- und Datenvertragszusätze [INTEL-ARCH-002]

Die Module verwenden **eine einheitliche Evidence-/Provenance-Schicht**, keine getrennten widersprüchlichen UI-Kalkulationen. Die Event-/Snapshot-Schemas versionieren und gegenüber öffentlichen HTML-Clients validieren.

**Domänenmodelle (mindestens):**
- \`EvidenceRef {id,sourceType:MT5_DEAL|MT5_POSITION|MT5_ORDER|EA_DECISION|BROKER_QUOTE|MARKET_BAR|NEWS_PROVIDER|RECONSTRUCTED,accountId,brokerServer,symbol,eventTimeUtc,recordedAtUtc,sourceRevision,confidenceKind:OBSERVED|CALCULATED|PROXY|UNAVAILABLE}\`
- \`DecisionEvent\` gemäß FR-026. \`reasonCode\` ist eine maschinenstabile Kennung, \`reasonText\` ist lokalisierte Interpretation; nie allein Freitext als Herkunft.
- \`TradeLifecycleEvent {id,accountId,positionIdentifier,orderTicket?,dealTicket?,eventType,source,asOfUtc,price?,volume?,slBefore?,slAfter?,tpBefore?,tpAfter?,actor:EA|USER|BROKER|UNKNOWN,dataQuality,revision}\`.
- \`TradeSnapshot {snapshotId,accountId,positionIdentifier,dealTicket,captureType,asOfUtc,chartView,marketDataRef,indicatorInstanceRevisions,decisionEventIds,renderStatus,renderAssetRef?,createdAtUtc}\`.
- \`Scenario {scenarioId,ownerId,accountId,symbol,side,entry,stop,target,lotMode,lotSize?,riskBudget?,quoteRevision,assumptions,pricingSource,status:DRAFT|READ_ONLY_PREVIEW}\`.
- \`ConfluenceSnapshot\`, \`SessionStructureEvent\`, \`RegimeSnapshot\`, \`ExecutionQualityRecord\`, \`NewsEventSnapshot\` mit erzwungenen Datenversions-, Zeitstempel- und Quellenfeldern.

**Zusätzliche vorgeschlagene Read-only-Endpunkte** unter \`/api/chart/v1/\` (Routen dürfen nach Repo-Audit leicht anders heißen, Semantik nicht):
| Method | Route | Rückgabe / Verhalten |
|---|---|---|
| GET | decisions?account=&symbol=&strategy=&from=&to= | gefilterte paginierte Event-Snapshots + recorded/reconstructed/not-recorded |
| GET | decisions/{decisionId} | originale Predicate-/Feature-/Guard-Stufen, kontrollierte Kontoberechtigung |
| GET | lifecycle?account=&positionId= | geordnete verified lifecycle events + data gaps |
| GET | execution-quality?account=&period= | Broker-Fillkosten mit Provenance, MissingReference und Stichprobenangaben |
| POST | scenarios/preview | read-only Szenariorechnung; **keine** Orders |
| GET | confluence?account=&symbol=&at=&preset= | multi-TF as-of Features, source revisions |
| GET | regimes?account=&symbol=&tf=&at= | reproduzierbare Tags + Thresholds |
| GET | structure?account=&symbol=&tf=&from=&to= | Sessions, Pivots, Swings, Hypothesenklassen |
| GET | calendar/events?currency=&from=&to= | lizenzierte externe Ereignisse, Providerstatus/stale flag |
| GET | snapshots?account=&positionId= | bestehende Snapshots je Trade/Entry/Exit |
| GET | snapshots/{id} | kontoberechtigter Snapshot, Datenquellen, optional Bild |
| POST | snapshots/export/{id} | UI-Export nur mit Auth, scoped Asset, keine Trading-Mutation |
| GET | replay/available?account=&symbol=&tradeId= | verfügbare historische Daten/Snapshots, Datenlücken |
| GET | replay/data?sessionId=&cursor= | as-of Datenpakete im read-only Replay (P2) |

**Gemeinsame Implementierungsregeln:**
- Sensible Trade-/Accountdaten brauchen dieselbe Authorization- und Identity-Scope-Regel wie Kapitel 10. Exporte und Bilder dürfen keine versteckten Terminalpfade, Tokens oder personenbezogenen Zugangsdaten offenlegen.
- Größere Berechnungen sind paginiert/workerbasiert und mit Cache; MT5-Gateway niemals durch unlimitierte historische N×M-Backfills blockieren.
- Unveränderliche Snapshot-/Decision-Datensätze für reproduzierbaren historischen Stand; nachträgliche Korrektur nur als Version/Nachtrag, ursprüngliche Beweisdaten bleiben referenzierbar.
- Backend-/EA-Telemetrie maximal sparsam und ausfallsicher: asynchron oder gebuffert, bounded queue, dedupliziert, definierte Retention. Verlorene Telemetrie darf KEINE EA-Trades blockieren oder falsche Erfolgsmeldungen erzeugen; „Log-Datenlücke“ sichtbar.
- Keine Indikator-Neuberechnung mit Future-Bars in einem historischen \`asOfUtc\`-Kontext; Caches enthalten Algorithmus-/Parameter-/Quellenversion.
- Die Chart-Entscheidungsanalyse **zeigt und erklärt**, sie erteilt keine implizite Orderfreigabe. Automatische Änderung bestehender EA-Logik, Guards oder Einstiege ist ein anderes freizugebendes Projekt.

### 24.12 Einbindung in UI und gespeicherte Layouts [INTEL-UI-002]

**Neue Chart-Studio-Seitenleistentabs und Overlays:**
- \`EA-Debugger\`: regelbasierter Decision Inspector, Marker-Filter, Grundcode-Tabelle, Source-Label „aufgezeichnet/nachberechnet/fehlt“.
- \`Planer\`: risikobewusster What-if-Editor, A/B-Vergleich, PnL- und Margindaten mit Quote-Zeit, SAVE DRAFT.
- \`Trade-Verlauf\`: chronologische Broker-Eventleiste, MFE/MAE, SL-/TP-Versionen, Entry/Exit-Snapshot-Links.
- \`Kontext\`: TF-Confluence, Regime, Sessions/Liquidity, News. Standardmäßig eingeklappt und granular zuschaltbar.
- \`Ausführung\`: Slippage, Spread, Latenz, Gebühren nur mit ausreichenden Referenzen; Summen mit Sampleanzahl.
- \`Replay\`: sichtbares REPLAY-/SIMULATION-Banner und deaktivierte MT5-Mutationskontrollen (erst P2).

**Sichtbarkeitspräferenzen als Teil von \`chart_layout\`:** \`showDecisionMarkers\`, \`showRejectedSetups\`, \`showLifecycle\`, \`showHistoricalSnapshots\`, \`showSessionBoxes\`, \`showLiquidityHypotheses\`, \`showConfluence\`, \`showRegime\`, \`showNews\`, \`showExecutionQuality\`, \`showTradePlans\`. Alle standardmäßig mit sinnvoller zurückhaltender Dichte; globale Schalter „Analyse-Layer“ und „Clean Chart“. Etwaige echten Positionen bleiben unabhängig in FR-004. Voreinstellungen pro Account/Symbol/TF speichern.

**Wichtigste Nutzerschritte:** Historischen Entry anklicken → Decision Inspector zeigt damalige Regelwerte → Trade-Verlauf öffnet Broker-Fills und Stopänderungen → „Entry-Snapshot“ stellt damaligen Chart her → „What if?“ importiert nur geometrische Planwerte, **niemals Broker-Stop als neuen Live-SL übernehmen** → A/B ansehen → zurück zum Livechart ohne Änderung von Positionen.

**Labels bei Dichte:** Gesamte Datenquelle/Status in einer stabilen Symbol-/Indicator-Legende oder Side-Inspector; im Chart nur kurze Marker. Keine überdeckten „Daily High/Low/Weekly POC“-Beschriftungen, keine unlesbaren riesigen Boxen. Für EA-Markierungen separate Formen für CANDIDATE/SIGNAL/REJECTED/FILL und passende Tooltips.

### 24.13 Ergänzung des Phasenplans — Vorgabe für Coding-Agent [INTEL-DELIVERY-002]

**Reihenfolge innerhalb der bereits existierenden Phasen (Kapitel 19 gilt weiterhin):**
- **Phase 0 (sofort):** Daten-Verfügbarkeitsmatrix für beide EAs und MT5-Konten erstellen: Welche Entscheidungen/Gründe, Orderversuche, Deals, SL/TP-Änderungen, Market Quotes und historischen Candles sind bereits tatsächlich vorhanden? Konten und EA-Versionen konkret nachweisen. Versionierte \`DecisionEvent\`-/\`TradeLifecycleEvent\`-/\`TradeSnapshot\`-Schemas entwerfen, Read-only-Recorder/Provider-Interfaces testbar machen. Snapshot- und EA-Logger-Performancebudget messen. Keine unbegründete „vollständige Historie“ versprechen.
- **Phase 1:** EA-Debugger-P0 als Inspector mit Recorded/Unavailable-States und read-only Decision-Marker aufbauen. Für EAs nur genehmigte, reine Diagnose-Hooks mit Vorher/Nachher-Signalparität implementieren. Die Zeitachsen-/Indikatorarchitektur muss später as-of Entscheidungen zulassen. What-if-Grundgeometrie ohne Brokerwrite ins Chart Studio vorbereiten.
- **Phase 2:** Trade-Lifecycle aus nachweisbaren MT5-Fills/Deals + auditierbaren Ereignissen als readonly Timeline ergänzen. Entry-/Exit-Snapshot-Pipeline und Journal-Verlinkung (Datensnapshot zuerst) implementieren, Backfill-Lücken klar kennzeichnen. What-if-Tool als rein lokalen Zeichnungsmodus einsetzen.
- **Phase 3:** What-if mit autoritativem Broker-Money/Margin/Guard-Preview verbinden, Long/Short und A/B, Konto-/Symbolisolation. MFE/MAE bei fehlenden Tickdaten als Schätzung. Abschluss P0 der FR-026/027/033/035 mit AT-036–040/049–050/055–056. Diese Intelligence-Gates werden **zusätzlich** zu bestehenden Gate-3-Tests geprüft.
- **Phase 4:** Die vorherige What-if-Datenstruktur darf nur dann in einen echten SL-/TP-Commit übergehen, wenn der separate bestehende Gate-4-Broker-Confirm-Flow erfolgreich ist. Szenario „nur simulieren“ bleibt dauerhaft unabhängig. Keine Änderungen an echten MT5-Guards durch Analyzer.
- **Phase 5:** P1: FR-029/030/031/032/034 (Confluence, Sessions/Liquidity, Execution Quality, Regime, News) modular ausrollen, jeweils mit eigenen Datenverfügbarkeits-/Staleness-Hinweisen und Gate AT-041–048/053–054. P2 FR-028 nur nach stabilem Snapshot-/Decision-Event-Store und explizitem No-Look-Ahead-Test AT-051/052.
- **Release-Regel:** P0-Entscheidungslogger darf ohne protokollierte Alt-Historie freigegeben werden, **wenn** „nicht aufgezeichnet“ korrekt angezeigt wird. P0-Snapshot ohne aktiven Browser darf reine Datensnapshots speichern. Aber Erfolg niemals für fehlende Eventdaten deklarieren. Die übrigen bisherigen Gates 0–4 bleiben verpflichtend.

**Keine Abkürzung:** Kein vollwertiges Replay bevor Backtest-„as-of“ korrekt und vor Future-Leak geschützt ist; keine Execution-Quality ohne Sollpreis; keine Liquiditäts-Heuristik als Broker-Orderflow und keine deduzierte AI-Erklärung als historische Tatsache.

### 24.14 Zusätzliche Abnahmefälle (Erweiterung zu AT-001–AT-035)

| ID | Priorität | Test | Erwartung |
|---|---|---|---|
| AT-036 | P0 | Titan und GoldM15 mit aufgezeichnetem Candidate/Signal/Reject | Decision Inspector zeigt damals protokollierte Bedingungen, ReasonCodes, Parameter- und EMA-/RSI-Werte exakt |
| AT-037 | P0 | Nicht instrumentierter Alt-Trade | „Nicht aufgezeichnet“; keine frei erfundenen Gründe, kein nachträglicher Fill aus Setupmarker |
| AT-038 | P0 | Aufzeichnung deaktivieren oder Logger-Fehler | EA-Signal/Trade gleich wie vorher, Lossy-Datenlücke sichtbar, kein blockierter MT5-Handel |
| AT-039 | P0 | What-if Long und Short in USD-/Nicht-USD-Konto | Broker-order_calc_profit/-margin stimmen, Lots/Stop-/R:R-Kalkulation mit ticksize/lotstep korrekt |
| AT-040 | P0 | Was-wäre-wenn verschieben/speichern/exportieren | Null MT5-Schreibaufrufe; Plan klar als SIMULATION/DRAFT; Konflikt nach Kontowechsel |
| AT-041 | P1 | Historischen M15-Einstieg mit H4-Filter prüfen | Nur vorher abgeschlossene H4-Werte; künftiges H4-Bar wird nie berücksichtigt |
| AT-042 | P1 | Confluence bei Datenlücke/TF-Wechsel | UNKNOWN und sourceTime angezeigt, keine täuschende 100%-Bewertung |
| AT-043 | P1 | Execution Quality mit intendedPrice, Quote und Deal | Fill-/Spread-/Slippage-Kosten korrekt gerichtet und nicht doppelt verrechnet; Sampleanzahl vorhanden |
| AT-044 | P1 | Historischer Deal ohne Quote/intendedPrice und Partial-Fills | Slippage als nicht verfügbar; gewichteter Fillpreis aus tatsächlich ausgeführten Lots |
| AT-045 | P1 | London-/New-York-/Asia-DST und Wochenendwechsel | UTC-Anker, Preisboxen, Opening Range, Swing-Bestätigung stimmen |
| AT-046 | P1 | Equal High/Sweep und angebliche Liquidity | Als Proxy markiert; keine „echten Stoporders“ oder Institutionen ohne Orderflowfeed |
| AT-047 | P1 | Deterministischer Marktregime-Klassifikator | Features, Thresholds, Hysterese, as-of und UNKNOWN bei Mangel stabil reproduzierbar |
| AT-048 | P1 | Regime-Performancevergleich | Nur reale belegte Trades, sample size/fees/OOS, keine Future-Features/Erfolgsversprechen |
| AT-049 | P0 | Mehrere Positions- und Deal-IDs, Trailing-/Teilfill-Events | Read-only Lifecycle korrekt, unbekannte historische Stopverläufe als Lücke |
| AT-050 | P0 | MFE/MAE mit Tickdaten vs. OHLC-only | Exakt/geschätzt sauber getrennt, intrabar-Reihenfolge ohne Ticks nicht erfunden |
| AT-051 | P2 | Replay startet vor realem Fill | Keine späteren Kerzen/Entscheidungen sichtbar, kein Look-ahead |
| AT-052 | P2 | Replay bei Position/SL/TP im LIVE-Konto | Sämtliche MT5-Mutationsrouten technisch verboten, Orders unverändert |
| AT-053 | P1 | Lizenzierter News-Event verschoben/abgesagt | Eventstatus/Timestamp korrekt; alte Warnung revidiert statt heimlich ersetzt |
| AT-054 | P1 | Newsfeed fehlt oder ist veraltet | Providerfehler sichtbar, EA-News-Guard vom UI-Overlay getrennt, keine fingierte Sperre |
| AT-055 | P0 | Broker-Entry und Exit mit/ohne aktiven Browser | Immutable Datensnapshot für beide, Idempotenz, Journalverlinkung; Bild optional |
| AT-056 | P0 | Snapshot öffnen nach TF-/Accountwechsel | Ursprünglicher as-of Chart oder korrekt beschrifteter Recompute, keine fremden Tickets/aktuellen EMAs |

**Testerweiterung (verbindlich):**
- Pure TS Unit-Tests für Confluence-/Regime-Zeitfenster, Liquidity-Pivots, What-if-Geometry sowie Snapshot-as-of; Python Fake-MT5-Tests für OrderCalc, Deal-Korrelation, Netto-Gebühren und Logger-Fallback.
- Playwright-E2E für fünf Klickpfade: Decision Inspector, A/B What-if, Trade-Lifecycle, Entry/Exit Snapshot, P1-Kontextpanel, mit aufgezeichneten Test-Fixures und mindestens einem Datenausfall.
- Performance: 500+ Decision-Events und 100+ Lifecycle-Events in einem Chartladen dürfen die chart-p95-Interaktionsbudgets aus PERF-001 nicht überschreiten. News-/Quote-/Telemetry-Backfills dürfen das MT5-Accountgateway nicht verhungern lassen.
- Sicherheits: Trading-Actions beim Replay, What-if-Draft oder Snapshot-Viewer blockieren. Ein MT5-Testauftrag darf erst nach tatsächlicher Benutzerfreigabe im Demo-Konto stattfinden.
- **Nachweise:** Video/Screenshots, Testlogs und drei Live-Demo-Audits (ein aufgezeichneter Trade, ein geschlossener Gewinn/Verlust und ein Account-/Serverfehler) protokollieren; ohne Live-Daten offen als „nicht live verifiziert“ deklarieren.

### 24.15 Nicht-Ziele, Datenqualität und verifizierbare Wertversprechen

- Die neuen Module sind **Analyse-/Erklärungs-/Datenjournal-Werkzeuge**. Kein Tool darf durch die reine Anzeige automatisch Orders erzeugen, EA-Trading aktivieren oder Risikogrenzen ändern.
- Ein schöner Decision-Inspector und ein schöner Profit-Chart sind kein Beleg für Profitabilität. Ursachen können aus Marktregime, Ausführung und Zufall resultieren; jede statistische Schlussfolgerung verlangt genügend Fälle, Kontrolle des Zeitraums und Out-of-Sample.
- Keine „KI weiß warum“-Prosa ohne Recorded Predicate/RuleCodes. Optional generierte Erklärung ist ausdrücklich Interpretation einer belegbaren Faktenliste und zeigt Links auf Eventquellen.
- Kein Rückwirkungsfehler: Warm-up, Candle-Close, Datenversion und damalige EA-Parameter sind Pflicht für jede historische „damals“-Aussage. Fehlende Original-Telemetrie wird nicht durch Rückrechnen geheilt.
- Beim manuellen Overlay-Löschen darf kein echter EA-/Broker-Verlauf gelöscht werden; ursprüngliche mt5.position/transaction log ist geschützt.
- Kein dauerhaftes Speichern hochauflösender Bilder ohne Quota, keine persönlichen Brokerdaten in öffentlich lesbarem Static-Verzeichnis kopieren.
- Kein Slippage-Wert ohne Orderversuch/Referenzkurs, kein nachweislicher Orderflow aus Candle-Tickvolume, keine garantierten hypothetischen Gewinne.
- Bestehendes \`Alle Strategien\`-Journal, das 2-Konten-Gateway, die Guard-Logik und die beiden EAs bleiben unverändert funktional.

### 24.16 Zusammenfassung der Architektur-Reihenfolge

Die Feature-Kette ist absichtlich datengetrieben:

\`Verified MT5/EA Event Recorder → Account-/Time-scoped Evidence Store → Decision/Lifecycle/Snapshot APIs → Chart Inspector + What-if P0 → Multi-TF/Execution/Regime/Sessions/News P1 → strikt read-only Replay P2\`.

**Abnahmeregel:** Ein Coding-Agent meldet FR-026–035 erst dann als umgesetzt, wenn die jeweiligen AT-036–056 mit Quellverweisen und belastbaren Testlogs bestanden wurden. Bei einer nicht instrumentierten historischen EA-Periode ist \`NOT_RECORDED\` ein **korrektes Produktverhalten**, kein Grund, Daten zu erfinden. Dieser §24 erweitert die bestehenden Sicherheits-, Performance-, Daten- und Layoutvorschriften aus §§0–23 und hat bei Widerspruch für die neu hinzugefügten Analytics-Features Vorrang; für Broker-Mutationen bleiben SEC-001 und POS-002 uneingeschränkt verbindlich.


**Ende der einzigen verbindlichen Master-Spezifikation für 2EAs Chart Studio.**
