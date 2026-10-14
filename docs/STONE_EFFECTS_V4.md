# Stone/Rune V4 – pixelgenaue EMA-Glows, farbiges Volumen, individuelle Target-Plates

## Problem / Ursache

Im bisherigen Release wurden die EMA-Werte ein zweites Mal auf einem frei positionierten Overlay-Canvas nachgezeichnet. Dessen Layer und Repaint wurden unabhängig vom Lightweight-Charts-Renderer ausgeführt; bei Chart-Resize, Zoom und Skalenverschiebungen entstanden sichtbar versetzte Lichtlinien. Native Serien verwenden dagegen dieselben Zeichenkoordinaten und dieselbe Preisskala.

Außerdem waren Volumenbins außerhalb der Value Area über `data-kind="off"` absichtlich grau. Der Matrix wurde mindestens eine 560px breite Tabelle erzwungen; die vierte Spalte `LIVE-WERT` konnte deshalb in schmaleren Containern abgeschnitten werden.

## Umsetzung

- **EMA20/50/200:** jeweils zwei native Lightweight-Charts-Linien hinter der jeweiligen Original-EMA (3/4 Pixel, unterdrückter Preislinienmarker) plus die normale 2px-EMA. Die Glow-Linien werden mit **exakt denselben Zeitstempeln und Preiswerten** synchronisiert: bei Erstladung `setData`, bei laufender Kerze `update`, bei neuen Kerzen `setData`, beim Kontowechsel `setData([])`. Die optionale StoneChartFX-Engine animiert nur deren RGBA-Farben (ca. alle 260ms), niemals Preiswerte oder Zeitachsen. Der alte Canvas-EMA-Pfad wurde entfernt. Ein Canvas bleibt ausschließlich für kurzzeitige Kerzenglints.
- **Alle Volumenbalken farbig:** POC gold, andere Bins abwechselnd cyan und amber – **auch außerhalb der VA**. `data-kind` bleibt als Information erhalten, seine Graudarstellung wird durch neue farbige Regeln überschrieben. Ungefüllte Teile der Trägerschiene sind dunkler Stein, nicht eine künstlich verlängerte Volumenanzeige. Histogramm-Länge und echte POC-/VA-Berechnungen bleiben unverändert.
- **Target-Matrix:** fünf vorhandene Asset-Grafiken wechseln zyklisch pro Datenreihe: `47_table_row_metal.png`, `48_tooltip_engraved_plate.png`, `17_trade_ticket_cartridge.png`, `14_long_volume_plate.png`, `20_guard_warning_plaque.png`. Jede Platte besitzt eine dunkle Mittelschicht, leuchtende Randakzente und gut lesbare Inhalte. Die Tabelle verteilt den verfügbaren Platz auf 32% Regel / 18% Short / 18% Long / 32% Live-Wert, erlaubt Umbruch für die letzte Spalte und bleibt nur bei sehr schmalen Viewports horizontal scrollbar.
- **Demo:** nutzt dieselbe neue native Glow-Technik und dieselben Farbregeln mit **ausdrücklich synthetischen** Demo-Daten.

## Unverändert

Keine Anpassungen an Broker/MT5-Endpunkten, Risiko-, Signal- oder Orderlogik. Die Farben im Volumenprofil sind gestalterisch und behaupten **kein Bid-/Ask-, Buy-/Sell- oder Orderflow-Volumen**. Der Vergrößerungsmodus, Candle-Glints, Dampf und Funken aus V3 bleiben bestehen. Bei DARK/LIGHT und bei reduzierter Bewegung werden die Glow-Linien ausgeblendet.

## Prüfungen / Abnahme

1. Syntax der Inline-Skripte von `app.py` und `stone-preview.html` sowie von `stone-chart-effects.js` prüfen.
2. Alle im CSS referenzierten Grafikpfade müssen in `static/stone-assets/ready` existieren.
3. Im Browser den Chart über Zeitfenster, Zoom, Drag, Expand und Pane-Resize prüfen – Glow und originale EMAs sollen zusammenfallen.
4. Matrix mit 5 und 7+ Zeilen sowie langem Live-Wert auf üblichen Desktopbreiten und kleinen Displays ansehen.
5. VA und Nicht-VA müssen cyan/amber sein, POC gold, mit realen Volumenlängen.
6. Auf echtem MT5 prüfen, dass Konto-/Timeframe-Wechsel keine Daten aus dem vorherigen Konto zurücklassen und alle Orders wie bisher funktionieren.

Ein statisch bestandener Check ersetzt weder visuelle Browsertests noch den MT5-End-to-End-Test.


## Chart canvas placement

The optional FX canvas now derives its plot bounds from the public Lightweight Charts 4.1 time-scale width/height and left/right price-scale widths. Candle and EMA marks continue to use series price coordinates and the time-scale time conversion. It no longer queries the library-generated table/cell DOM. Isolated Chromium checks compare canvas placement with public API dimensions within one CSS pixel at 150% device scale; live scale-label reflow and target-hardware resize acceptance remain open.
