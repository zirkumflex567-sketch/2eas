# STONE // RUNE COCKPIT — Design- und Implementierungsvorgaben

**Status:** Optionaler, grafisch animierter Design-Layer für das echte 2EAs-Cockpit. Die Handelslogik bleibt unverändert.

## Start & Dateien

1. Git-Branch: **feature/stone-rune-cockpit**.
2. **Ohne MT5:** Die Datei **static/stone-preview.html** im Browser öffnen. Sie enthält synthetische, ausdrücklich als DEMO bezeichnete Candles, Volumenwerte und Positionen. Handelsbuttons sind deaktiviert.
3. **Mit MT5:** Das vorhandene Dashboard wie bisher mit **python app.py** starten, im Browser unter **http://127.0.0.1:8050** öffnen. Die Designauswahl ist oben rechts: **ᛟ STEIN / ◈ DUNKEL / ☼ HELL**. Standard ist STEIN beim ersten Aufruf.
4. Die Einstellung wird unter localStorage-Schlüssel two_eas_visual_theme gespeichert.

| Datei | Zweck |
| --- | --- |
| static/stone-texture.svg | Selbst gezeichnete Vektoroberfläche mit Relief, Fraktalrauschen und Steinbrüchen |
| static/stone-cockpit.css | Steinmaterial, Gravuren, gefaste Metallkanten, Beleuchtung, Hover, Responsive, Glow |
| static/stone-cockpit.js | Theme-Umschalter, animierte Außenleiterbahnen, Runensiegel, gespiegeltes Live-Volumenprofil |
| static/stone-preview.html | Standalone-Design-Vorschau mit synthetischem interaktiven Chart und Demo-Handelsdaten |
| app.py | Lädt nur die zwei zusätzlichen Dateien. Alle Backendfunktionen bleiben erhalten |

## Kopierfähiges Briefing für einen Frontend-KI-Agenten

Entwickle ein optisch außergewöhnliches, hochwertiges und spielerisch-mechanisches Trading-Cockpit. Referenzstil: eine alt wirkende magische Steintafel, die mit moderner Cyberpunk-Technik verbunden wurde. Das Dashboard sieht wie ein physisches Gerät aus mehreren **gebrochenen Basalt-/Schieferplatten** aus. Zwischen den Platten verlaufen leuchtende blaue und bernsteinfarbene elektrische Leiterbahnen. Eingravierte Runen, antike Schildzeichen, Bronze/Metall-Einfassungen und kleine elektrische Lichtimpulse vermitteln den Eindruck einer uralten, elektrisch aufgeladenen Maschine. Keine flachen, einfachen Standardkarten, kein gewöhnliches Glassmorphism, kein Screenshot als Hintergrund der gesamten UI.

### Materialien und Geometrie

- Basisstein: Anthrazit-Schiefer, Dunkelgrau/Blaugrau **#131C23 bis #303B43**. Reliefoberflächen über SVG Fractal Noise, leichte Mikrostruktur, Variation in den Panelrändern. Kanten sind unregelmäßig und zeigen schmale Risse, Spalten, kleine herausgebrochene Ecken. Keine zwei Panels sollen wie identische Standard-Rechtecke aussehen.
- Die Panels haben sichtbare Dicke. Helle Oberkante und leicht kantige Linkskante; tiefer innerer Schatten und nach außen geworfener Schatten unten rechts. Der Betrachter soll glauben, ein Panel sei eine eigenständige massive Steinplatte.
- Kleine Schrauben, verstärkte Metallwinkel, gravierte Verbindungslinien, Schmutz und leichte Gebrauchsspuren dürfen vorkommen, aber niemals Live-Zahlen überdecken.
- Verschachtelte kleine Knöpfe erinnern an versenkte mechanische Tasten: 3D-Fase, leichter Click-Travel, bei Aktivität leuchtender Rand.
- Empfohlene Panel-Ecken: 22px 16px 25px 17px. Bei hochwertigen Bildern später gerne gezeichnete Alpha-Masken beziehungsweise nine-slice Raster mit transparenten, beschädigten Rändern einsetzen.
- Für die perfekte Referenztreue können ergänzend eigene PBR-Texturen entstehen: Albedo, Roughness, Normal, AO, Emissive. Verwende diese nur als wiederholbare **Material-Layer**, nicht als UI-Screenshot. Sämtliche Steuerelemente bleiben live.

### Licht und Farbpalette

| Funktion | Farbe | Verhalten |
| --- | --- | --- |
| Stromlinien, aktives Zeitfenster, Fokus | Cyan **#37D7FF** | 1–2 px Lichtbahn, Glow 4–9 px |
| Positive Werte, LONG, verbunden | Türkisgrün **#36EDB2** | Leise pulsierender Neonrand |
| SHORT, Verluste, Risiko | Glutrot **#FF635E** | Rot-Orange-Glühen ohne Datenverfälschung |
| POC / Volume High / mechanische Kante | Bernstein **#F4AD56** | Tiefes goldenes Metalllicht |
| Primärtext | **#D7E4E9** | Kleine Tiefenprägung und gute Lesbarkeit |
| Sekundärtext | **#9CAAB4** | Ruhig, aber klar lesbar |

Besondere Effekte: schräg gravierte Runensymbole mit zartem Bloom, energieführende Verbindungen entlang äußerer UI-Kanten, sehr leichte Glut an ausgewählten Rissen. Keinesfalls dauerhafte, blitzende, bildschirmfüllende Effekte.

### Animation

- Außenleiterbahnen: 10–14 s für einen durchwandernden Lichtimpuls mit SVG-Stroke-Dashoffset. Leichte Gegenläufigkeit der zwei Seiten.
- Aktive Steintasten: 3,8 s ganz sanfter Glow.
- Rote und grüne Prozentbalken: 2,2–2,6 s Lichtintensität, aber **niemals die Breite oder Live-Prozentzahl animiert erfinden**.
- Mouse Hover: 180–250 ms schwache Aufhellung der Gravur, hellerer Rand.
- Click: ca. 2 px vertikale mechanische Bewegung.
- Volumenhistogramm: 300–450 ms Breitenübergang beim Wechsel von echten Daten.
- prefers-reduced-motion respektieren. Kein hochfrequentes Partikelsystem, keine dauerhaft schwere WebGL-Szene auf normalen Dashboardseiten.

### Daten und Funktionsparität

Es gibt bereits ein FastAPI-Dashboard mit Inline-HTML in app.py, TradingView Lightweight Charts und echten MetaTrader5-Daten. Jede existierende Funktion muss erhalten bleiben:

1. Auswahl zwischen XAU Titan Pro und GoldM15 Reconstruction, inklusive getrennten Konten und Session-State.
2. Kopfzeile: EA-Name, Version, Live-Bid/Ask, Spread, Drawdown, Risikopuffer, Server-/DE-Zeit, M15-Bar-Countdown.
3. Echte Candlestick-Chartreihe, EMA20/50/200, S/R/POC, alle vorhandenen Markerpfeile und EA-Status-Overlay.
4. M1/M5/M15/M30/H1/H4/D1, Wheel-Zoom, Drag, Auto-Reset, Chart-Vertical-Margin.
5. Volume Profile Daily/Weekly. Optional rechts am Chart ein zweites **nur lesendes Histogramm** aus denselben Originaldaten anzeigen. Niemals künstliche Daten oder ein separates Dummy-Profil im Livebetrieb.
6. Live-Diagnose, RSI-Systeme 1–3 oder Titan-Regeln, LONG/SHORT-Readiness und Momentum-Ziele.
7. Positionen samt Ticket, Richtung, Lotgröße, Profit/PnL, editierbaren SL/TP-Dollarwerten, BE/Quick-Adjust und Schließen-Funktion. Alle existierenden Eventhandler weiterverwenden.
8. Journal mit echten Einstiegs-/Ausstiegserklärungen, getrennt nach EA und aktivem Konto, Live-PnL, Historie und Gesamtergebnis.
9. Blueberry-DD-Reset-Dialog und automatische Sicherheitsregeln; ausschließlich optische Änderungen.

Besonders wichtig: **Keine MQL5- oder Python-Berechnungen ändern.** Keine API-Routen, Symbolfiltern, Guard-Limits, Positionsticket-IDs, Kontenlogik oder Handelsfreigaben anpassen. Die neue Skin verwendet bestehende HTML-IDs und reichert rein dekorative DOM-Elemente an. CSS nur innerhalb des theme-stone-Namensraums.

### Responsive Zielgrößen

- **1920×1080 / 1440×900:** Breites 2-Spalten-Dashboard, großer interaktiver Chart, seitlich eine schmale vertikale Volumenleiter, darunter vollständige Diagnose und Positionstabelle.
- **Tablet 768 px:** Bei Platzmangel Seitenvolumenleiter ausblenden, statt den Chart oder seine Controls zu verengen. Panels stapeln.
- **Mobile 390 px:** Vollbreite Panels, lesbare Werte, horizontal umbrechende Timeframe- und Orderbuttons, niemals verdeckte Dialoge oder abgeschnittene Orderaktionen.
- Browser unter Reverse-Proxy-Pfad /stt/ berücksichtigen. Assets müssen relativ von der CSS-Datei aus geladen werden.

### Nicht nur Optik – Prüfpflichten

1. Design-Vorschau per Doppelklick öffnen: Runen, Steinplatten, Glühlinien, grafischer Chart und zwei Profile erscheinen. Sie enthält ausschließlich gekennzeichnete Demo-Daten.
2. Im echten Dashboard die drei Themes wechseln; bestehendes Originaldesign bei DUNKEL/HELL unverändert.
3. Kontowechsel XAU Titan → GoldM15 → XAU Titan auf Demo-Konten testen, inkl. Account-ID, Kontostand, Chart und Journal.
4. Timeframes, Pan/Zoom/Reset, Indicator-Overlays und Markerpfeile testen.
5. Daily ↔ Weekly und POC/VAH/VAL der Seitenskala gegen die Haupt-Volumentabelle vergleichen.
6. Drawdown-Risikopuffer, Guard-Status, Reset-Dialog und Session-Zeiten kontrollieren.
7. Auf einem **Testkonto**, nicht live: SL/TP, BE, Schließen und Fehlerdialoge visuell und funktionell verifizieren.
8. Leere Daten, Verbindungsverlust, sehr viele offene Positionen, unterschiedliche Bildschirmgrößen, Tastaturfokus und Reduce-Motion testen.
9. Browserperformance und SVG-Filter insbesondere auf älteren Mobilgeräten profilieren.

## Qualitätsstatus

Diese erste Umsetzung enthält eine **echte prozedurale Steinoberfläche** samt elektrischen SVG-Leiterbahnen und funktionswahrender Skin, nicht bloß eine Bildbeschreibung. Die referenznahe **fotorealistische 4K-PBR-Assetstufe**, voll individualisierte Steinformen pro Karte und umfangreiche Browser-End-to-End-Tests sind sinnvolle weitere Iterationen.

**Ziel:** Der User kann die neue Oberfläche nutzen und jederzeit ohne Änderung an MT5 und Risikologik zurück zur bisherigen Darstellung wechseln.
