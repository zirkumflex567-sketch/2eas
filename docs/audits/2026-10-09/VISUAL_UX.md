# Visual-/UX-Audit — Stone / Rune Cockpit (2026-10-09)

**Prüftyp:** CSS-/HTML-/Asset-/Interaktionscode-Review auf `main`, Ausgangscommit `5244b9e8fa9315284b78c70f1b9f1f1204ee9b7a`.  
**Wichtig:** Keine Pixel-Aussagen als „gesehen“ ausgegeben: kein Live-Screenshot bei 1920/1440/768/390 px und keine vollständige manuelle Sichtprüfung des Bildmaterials verfügbar. Aussagen mit **sichtbar im Code** sind bestätigt; optische Auswirkungen sind als **zu prüfen** markiert.

## Gestaltungsvorgabe bei einer Überarbeitung

Das bionisch-mechanische, dunkle Stone/Rune-Design ist ein ausdrücklich gewünschtes Merkmal. **Nicht** zu einem austauschbaren „Flat Dashboard“ glätten. Stattdessen: klare Hierarchie, tiefe Materialien, gezielte helle Cyan-/Amber-Energieakzente, seltene mythische Zufallseffekte im Idle und eskalierende, aber kurze Bestätigungs-/Gewinn-Highlights. Aktive Kerzen, EMAs, Preisachse, Orderbuttons und Risk-Warnungen haben immer Vorrang vor Dekor.

## VIS-01 · P1 · Permanente Animation und optische Konkurrenz

**Bestätigt:** `static/stone-cockpit.js:136-168` erzeugt 61 CSS-Sparks und 14 Vapor-Elemente in 7 Bereichen. `stone-asset-skin.css:582-667` animiert Filter, Glows und Rauch fortlaufend. Zusätzlich `stone-celebrations.js:43-85` temporäre Celebration-Animationen und `stone-chart-effects.js` zufällige EMA-/Candle-Bursts. `prefers-reduced-motion` ist immerhin bereits umgesetzt.

**Visuelles Risiko:** Zu viele gleichzeitig aktive Glanzstellen verwässern die gewollte Signalwirkung von echten bestätigten Trades. Die überlagernden Ebenen können Lesbarkeit/Chartfokus reduzieren; reales Ausmaß ist **nicht gemessen**.

**Verbesserung:** Idle-Design überwiegend ruhig; maximal wenige aktive Highlights in verschiedenen Regionen, seltene gestaffelte Sweep-Ereignisse. Trading-Event: kurze, lokalisierte Impulse; realisierter Gewinn: intensiver, aber befristeter Effekt mit klarer Hierarchie. FX-Off muss wirklich **alle** optischen Effekte kontrollieren, nicht nur die Chart-FX (aktueller Schalter steuert primär Chart-/Celebration-FX, die statische Ambience ist separat). Visuell zwischen `Low`, `Mystic` und `Full` abstufen. Den vorhandenen Aus-/Ein-Schalter nicht entfernen.

**Abnahme:** Bei normaler Idle-Ansicht sind Labels, Candle-Wicks, EMA-Verlauf und Risk-Text im Stillbild sofort lesbar; bei Ereignissen bleiben Klickflächen bedienbar. Visuell mit reduziertem Motion-Betrieb vergleichen.

## VIS-02 · P1 · Positionseingaben verlieren potenziell den Fokus

**Bestätigt:** `renderPositions` erzeugt alle Positionskarten samt editierbaren SL-/TP-Feldern mit `innerHTML` neu (`app.py:2089-2139`). `updateStatus` löst das alle 1,5 s aus (`app.py:1984-1991,2559`).

**Risiko:** Benutzer schreibt `SL -70`, während der nächste Tick das Input ersetzt; Cursor/Draft verschwinden. **Keine Live-Reproduktion**, aber klare Folge des DOM-Austauschs.

**UX-Korrektur:** Ticketgebundene keyed Komponenten, Dirty-Input-Zustand getrennt vom Broker-Snapshot, Editierindikator „ungespeichert“, nur bei explizitem Klick das SL-/TP-Update. Bei konkurrierendem Serverwert Differenz anzeigen statt Eingaben zu überschreiben. Nach Set bestätigt der Server die neuen Werte; im Fehlerfall Werte/Fehlermeldung sichtbar halten.

## VIS-03 · P2 · Zu kleine Schrift und unklare Prioritäten

**Bestätigt:** Matrix- und Statusbausteine verwenden `text-[9px]`/`text-[10px]` im Hauptinhalt (`app.py:2007-2025`, `stone-asset-skin.css:905-910`). Die Stone-Flächen besitzen zusätzlich detailreiche Texturen und Leuchteffekte.

**Zu prüfen:** 9-/10-px-Schriften auf 100%-Zoom, Laptop, Tablet, 125%-Windows-Skalierung, High-DPI, mobilem Portrait. Bei schwachem Kontrast können Kleinsttexte auf Relief untergehen.

**Verbesserung:** Primärdaten mindestens ca. 12–14 px (bei normaler Darstellung), wirklich nachrangige Metadaten 11–12 px; wichtige Zahlen (PnL, Daily-DD, Risk-Buffer, Price) höher gewichten. Kontrast in Texturflächen stabilisieren, nicht durch stärkere Schrift-Glows kompensieren. Regionale Kontrast-Samples messen (WCAG 2.2: für gewöhnlichen Text mindestens 4.5:1).

## VIS-04 · P2 · Responsive-Matrix mit widersprüchlich wirkenden Breiten

**Bestätigt:** Basis-Matrix `min-width:560px` (`stone-asset-skin.css:485-508`), bei max-width 600 px zunächst 440 px (`319-325`), später max-width 720 px wieder 560 px (`677-680`), bei max-width 650 px 530 px `!important` (`918-921`). Dieses vielschichtige Cascade-Verhalten erschwert die Vorhersage der tatsächlich wirksamen Größe.

**Zu prüfen:** Horizontales Scrollen und Randbeschnitt bei 390/430/600/768 px; Matrix-Header bleibt den Werten zugeordnet, keine Preis-/Statusspalte außerhalb des bedienbaren Bereichs, kein horizontaler Body-Scroll.

**Verbesserung:** Eine konsistente Breakpoint-Strategie, Desktop-Matrix ab ausreichend Breite, kompakte Karten/Accordion oder zugänglich scrollbar auf Mobil; horizontale Scroll-Indikatoren, Sticky-Kopf und klar lesbare Spaltenbeschriftungen. `overflow-x:auto` gezielt auf Tabellencontainer statt auf Body.

## VIS-05 · P2 · CSS-Spezifität und wartungsintensive Overrides

**Bestätigt:** `static/stone-asset-skin.css` umfasst 1234 Zeilen, viele `!important`-Overrides, mehrfach überlagernde Breakpoints (600, 650, 720, 750, 800, 900, 1120, 1200, 1280, 1360 px). `stone-cockpit.css` ergänzt weitere ca. 342 Zeilen. Das Inline-CSS in `app.py` kommt hinzu.

**Risiko:** Kleine UI-Änderungen brechen auf anderen Viewports/Themes oder zeigen unerwartete Override-Konflikte.

**Verbesserung:** Style-Layer/Token-System für Material, Typografie, Sizing und FX (`--stone-...`), deduplizierte CSS-Regeln und ein einheitliches Breakpoint-Raster. Dark/Light/Stone als explizite Variablen, keine pauschalen Eingriffe in Order-/Chart-Controls. Nach jeder Änderung Screenshot-Diffs auf mehreren Größen.

## VIS-06 · P2 · Bildfreistellung an acht Assets manuell kontrollieren

**Bestätigt:** `static/stone-assets/ready/processing-report.json` markiert ausdrücklich Asset-IDs **11, 12, 13, 17, 18, 19, 26, 35** zur manuellen Qualitätskontrolle. Das Skript nennt „heuristic background removal“ und warnt vor falscher Annahme, dass ins JPEG eingebrannte Schachbretthintergründe echte Transparenz seien (`scripts/process_stone_assets.py:67-125,234-240`). In der JSON-Liste sind zwar keine automatischen Warnungen vermerkt, das ersetzt keine Sichtkontrolle.

**Manuell prüfen:** Ränder, schwarze/weiße Halos, ausgeschnittene Innenlöcher von Chart-/Volumenrahmen, ungewollte Löcher in massiven Steinplatten, abgeschnittene Glows, Verzerrung durch 9-Slice `border-image`. Auf dunklem und hellem Prüfhintergrund sowie in Originalgröße und Zielgröße ansehen.

**Verbesserung:** Nicht pauschal neu freistellen; nur visuell erkannte Fehler korrigieren. Ein goldenes Kontaktblatt für alle Assets und Einzelvergleiche der acht riskanten Dateien erstellen.

## VIS-07 · P2 · Chart-Overlay ist an interne DOM-Struktur gekoppelt

**Bestätigt:** `stone-chart-effects.js:46-74` sucht `table tbody tr:first-child td:first-child` im Lightweight-Charts-Container und liest dessen Abmessungen als Plotfläche. Das ist eine Kopplung an intern gerendertes Markup; bei Charts-Library-Upgrade oder Scale-Konfiguration potenziell instabil.

**Zu prüfen:** Kerzen-/EMA-FX liegen pixelgenau auf der echten Price-Pane (nicht Preisachse oder Time-Axis), bei Expanded Chart, Browser-Zoom, verschobener Preisachse, Zeitrahmenwechsel, vertikalem Price-Scale-Zoom und Resize. Die tatsächlichen Datenlinien dürfen nicht deformiert oder überstrahlt werden.

**Verbesserung:** Dokumentierte Chart-Pane-Koordinaten/API soweit verfügbar verwenden, Koordinaten bei Skalenänderungen invalidieren; automatisierte Screenshots mit Testmarker und Überlagerungstoleranz.

## VIS-08 · P2 · Status-EMA20 und Chart-EMA20 könnten auseinanderlaufen

**Bestätigt:** `app.py:261-265` setzt `df['ema20'] = df['ema21']` im Status, während `/api/candles` `ewm(span=20)` als EMA20 berechnet (`app.py:665-669`). `stone-celebrations.js:19-27` zeigt die Werte des zuletzt geladenen Charts.

**Folge:** Wenn Zahlen im Diagnose-/Statusbereich als EMA20 beschrieben werden, können diese vom echten Chart-EMA20 abweichen. Das ist kein reines Schönheitsproblem: visuelle Datenglaubwürdigkeit leidet. **Echte Auswirkungen in der Live-Ansicht noch nicht gemessen.**

**Empfehlung:** EMA20 explizit als span=20 konsistent rechnen; bewusst verwendete EMA21 eigenständig als EMA21 benennen, keine stillschweigende Alias-Verwechslung. Strategielogik/Backtests unverändert lassen, bis exakte fachliche Zuordnung dokumentiert und abgesichert ist.

## VIS-09 · P3 · Legacy-CSS-Kandidaten

**Bestätigt:** In `stone-cockpit.css:264` steht `body.theme-stone #tv-chart.parent`. Dieser Selektor greift nur, falls dasselbe Element die ID `tv-chart` **und** die Klasse `parent` trägt, nicht bei einem Parent-Element von `#tv-chart`. Es gibt weitere ältere Dauer-Glow-Deklarationen, die spätere V7-Regeln deaktivieren (`stone-asset-skin.css:1135-1151`).

**Empfehlung:** Selektoren und tote Regeln mittels DevTools-Coverage und DOM-Inspektion verifizieren. Unbenutzte Regeln nach Screenshot-Regression entfernen, keine kosmetische Korrektur ohne Test der Chartgröße.

## Visuelles Abnahmeziel

- **Trading zuerst:** Preis, Candles, EMAs, Orders, Signale, SL/TP und DD jederzeit klar lesbar und eindeutig.
- **Mythischer Look bleibt:** Materialtiefe, Metallkanten, Cyan-/Amber-Akzente und gelegentliche Energieimpulse behalten; Leuchteffekte dienen der Informationshierarchie.
- **Drei Visual-Presets:** Idle Low, Mythic Default, Celebration Full; dauerhaft speicherbar und abschaltbar.
- **Kein Eingabeverlust:** 20 Sekunden durchgehend SL/TP editieren und Statusdaten weiter empfangen; Cursor bleibt stabil.
- **Responsive:** 1920×1080, 1440×900, 1280×800, 768×1024, 430×932, 390×844 und 200%-Zoom prüfen.
- **Keine Fake-Belege:** Erst nach echten Browser-Screenshots konkrete Pixelmängel und `PASS`/ `FAIL` protokollieren.

**Abhängigkeit:** Testplanung siehe [VALIDATION_PLAN.md](./VALIDATION_PLAN.md). Performance-Ursachen siehe [PERFORMANCE.md](./PERFORMANCE.md).
