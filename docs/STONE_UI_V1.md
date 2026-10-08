# STONE / RUNE V1 — Echtes Asset-Skin für 2EAs

**Status:** optionaler visueller Modus der echten MT5-Webapp, ohne Änderungen an Trading-Logik, Konto-Gateway oder Backend-Endpunkten.

## Start und Wechsel

`python app.py` starten, `http://127.0.0.1:8050` öffnen, im Kopfbereich `ᛟ STEIN` auswählen. Alternativ `static/stone-preview.html` als Design-Demo mit **synthetischen** Charts betrachten. `◈ DUNKEL` und `☼ HELL` bleiben als Ausweichdesigns erhalten. Modusauswahl wird unter `two_eas_visual_theme` lokal gespeichert.

## Integration

- `static/stone-cockpit.css`: bestehende optionale Stone-Darstellung, CSS-Animationen, Live-Volumenprofil-Seitenleiste.
- `static/stone-asset-skin.css`: **neue Ebene mit echten PNG/WebP-Assets** aus `static/stone-assets/ready/`, nur aktiv unter `body.theme-stone`. 35 eindeutig benannte Asset-Dateien für Basalt-/Metalltexturen, Panelrahmen, Runen, Energie, Chart, Volumen, Buttons und Warndialog.
- `static/stone-cockpit.js`: erkennt existierende Live-Widgets anhand unveränderter IDs und ergänzt Klassen für Chart, Volumen, Diagnose, Matrix, Positionen, Journal und Header. Es werden keinerlei Zahlen, Signale, Orders, PnL-Werte oder API-Aktionen simuliert.
- `app.py`: lädt nur das zusätzliche CSS nach dem vorhandenen Skin. Backend, Interaktionen und vorhandenes HTML bleiben unverändert.
- `static/stone-preview.html`: lädt denselben Skin; **nur dort** werden ausdrücklich gekennzeichnete synthetische Marktdaten gezeigt.

Die Ersatzdateien `11_master_dashboard_panel.png` und `19_entry_matrix_frame.png` sind weiterhin im richtigen `ready/`-Pfad. Der Matrix-Rahmen #19 wird als Nine-Slice-/Border-Image um dynamische HTML-Inhalte gezogen. #11 ist eine hohe, opake Steinplatte und wird nicht als großflächiger Tabellengrund missbraucht.

## Designregeln

- Die Chartbibliothek erhält echte Kerzen aus MT5; Steingrafiken liegen nur in CSS-Hintergründen und Rahmen.
- Text, Eingaben, Scrollbereiche und Klickziele bleiben echte DOM-Elemente; dekorative Seitenleitern sperren keine Pointer-Events.
- Das CSS verwendet überwiegend Border-Images, damit die Ecken bei wechselnder Kartengröße nicht vollflächig gestreckt werden. Die Originalbilder bleiben erhalten.
- `prefers-reduced-motion` respektiert reduzierte Animationen.
- Kleine Viewports erhalten schmalere Rahmen; die breite Matrix bleibt horizontal scrollbar.
- Die vorhandenen Trading- und Risiko-Controls dürfen nicht von der Vorschau übernommen oder überschrieben werden.

## Abnahme / offene Punkte

1. **Live prüfen:** Kontowechsel, echte Preisaktualisierung, Timeframes, Zoom/Scroll im Chart, SL/TP-Manager, Journal, Tages-DD-Reset/Modal und Handelsfenster auf einer Windows-MT5-Instanz testen. Diese Integration ersetzt keinen MT5-End-to-End-Test.
2. **Grafik prüfen:** Sichtbarkeit der Assets auf 390/768/1440/1920 px, Nine-Slice-Kanten, Transparenz der Ersatzgrafik #19 und Kontrast bei hohen Datenmengen beurteilen.
3. Falls ein Browser einen Rahmen verzerrt: die jeweiligen `border-image-slice`-/`border-image-width`-Werte in `static/stone-asset-skin.css` nach tatsächlicher Assetauflösung nachjustieren.

**Rollback:** Im UI auf `◈ DUNKEL` oder `☼ HELL` schalten; alternativ den zweiten CSS-Link aus `app.py` entfernen. Keine Tradingdaten werden durch den Skin migriert.
