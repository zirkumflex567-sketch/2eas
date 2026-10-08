# STONE / RUNE · Visual Effects V2

## Änderungen

Das echte Dashboard und die **Demo** erhalten dieselben rein dekorativen Effekte:

- **Dynamische Volumen-Farbpalette:** ein POC aus den echten Histogrammdaten wird golden hervorgehoben; andere Value-Area-Zeilen wechseln cyan/amber; Zeilen außerhalb der Value Area werden neutral/grau. Die tatsächliche Volumenbreite und POC/VA-Berechnung bleiben unverändert. **Cyan/Amber kennzeichnet ausdrücklich NICHT Buy-/Sell-Volumen, Bid/Ask-Aggression oder Order-Flow.** Dafür wären separate gehandelte Kauf-/Verkaufsvolumendaten erforderlich.
- **POC-Verfügbarkeit:** beim Reduzieren auf acht Live-Zeilen ist der tatsächliche POC immer dabei, auch wenn er bei der bisherigen einfachen Halbierung ausgefallen wäre.
- **EMA-Glühen:** transparentes, pointer-freies Canvas über dem Chart folgt via `timeToCoordinate` / `priceToCoordinate` exakt den Original-EMAs (cyan EMA20, amber EMA50, violett EMA200). Rotierender Lichtfokus (5,7 s) — keine Änderungen an `setData`, Chartsignal, Markern oder Orders.
- **Candle-Glows:** ein dezentes, rein dekoratives Blitzen an ausgewählten sichtbaren Kerzen ca. alle 9,2 s; kurzzeitiger Halo bei einer neuen Kerze; kurzes Rot-/Grünsignal-Highlight **nur**, wenn ein neuer, vom Backend gelieferter Marker erkannt wird. Ambient-Glints sind KEINE Handelssignale.
- **Steinplatten-Polish:** strukturierte Tabellenzeilen, goldene Energie-Highlights, kurze Lichtläufe in den Volumenbalken und pulsierende EMA-Legende.

## Sicherheit und Bedienung

Alle Effekte sind im **Stein-Theme** aktiv und werden bei `DUNKEL`, `HELL`, ausgeblendetem Browser-Tab oder `prefers-reduced-motion: reduce` unterdrückt. Die Zeichnung belegt lediglich ein `pointer-events:none` Overlay, sodass Zoom/Pan, Crosshair, Timeframes, Kontenwechsel, SL/TP und Drawdown nicht manipuliert werden. Chart-Daten werden weiterhin ausschließlich aus MT5 / FastAPI geladen. Die Demo verwendet weiterhin gut sichtbar markierte **simulierte** Daten.

Die Live-Webapp bindet `static/stone-chart-effects.js` vor ihrem bisherigen Inline-Code ein und ruft das Modul ausschließlich per `window.StoneChartFX?.attach/update` mit `try/catch` auf. Ein Ausfall des Dekormoduls darf keine Chart- oder Backend-Updates verhindern.

## Manuelle Abnahme

1. Lokal `python app.py` starten und `http://127.0.0.1:8050/static/stone-preview.html` öffnen: mehrere Volumenfarben, POC-Gold, abwechselnde EMA-Lichter und gelegentliches Candle-Aufblitzen müssen sichtbar sein.
2. Timeframes wechseln, Candle-Chart scrollen/zoomen, tägliches/wochenweises Volumen auswählen. Der Chart-Cursor und die Zoomfunktion müssen vollständig weiterarbeiten; kein synthetisches Orderereignis in der Live-App.
3. Im Live-Dashboard Konten wechseln und die frisch angelieferten Chartdaten überprüfen; vorhandene Positionsaktionen sind unverändert.
4. Auf `DUNKEL` / `HELL` umschalten und in den Browser-Einstellungen reduzierte Animationen einschalten: keine laufenden Effekte sichtbar.
5. Auf breiten und schmalen Screenshots prüfen, ob das Design optisch dem Referenzbild näherkommt. **Automatisierte statische Prüfungen ersetzen keinen Browser-/MT5-End-to-End-Test.**

## Dateien

- `static/stone-chart-effects.js` — neue reine Overlay-Effekt-Engine
- `static/stone-asset-skin.css` — V2-Farb- und Animationsebene
- `static/stone-cockpit.js` — übernimmt die semantischen Volumen-Töne in die Seitenleiste
- `static/stone-preview.html` — Demo-Effekte mit weiterhin synthetischen Daten
- `app.py` — Darstellungshooks, POC-Row-Preservation; MT5-Gateway und Backend-Risikologik unverändert
