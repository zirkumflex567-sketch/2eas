# Stone/Rune V3 — Funken, Dampf & lesbare Target-Matrix

Umsetzung anhand der Screenshots der echten 2EAs-Webapp (9. Oktober 2026).

## Behobener UI-Fehler

Die Target-Matrix hatte die ganze Metallgrafik `47_table_row_metal.png` als Zeilenhintergrund. Dabei wurde die Grafik immer wieder quer über **Text und Status-Chips** gerendert; manche Zeilen waren kaum zu lesen.

**Fix:** Wegfall dieser wiederholten Grafik auf Tabellenzeilen. Stattdessen dunkle, alternierende Datenzeilen, feine metallisch/cyanfarbene Trennlinien, kräftigere Status-Chips sowie ein horizontal scrollbar bleibendes Tabellenlayout für kleinere Screens. Die äußere Rahmenoptik bleibt erhalten. Die Originalgrafik #47 wird nicht gelöscht.

## Auffälligere Echtzeit-Effekte

- **EMA20 / EMA50 / EMA200:** dreifach gezeichneter, additiver, stärkerer Halo exakt entlang der live berechneten EMA-Datenreihe (Cyan, Amber und Violett). Glow-Fokus wandert zwischen den EMAs, ohne die Daten der Originalserien zu verändern.
- **Kerzenfunkeln:** zeitweise stärkerer Schatten und vierzackiger Glint an einer *sichtbaren* Kerze; wie vorher kurzfristige stärkere Betonung frisch erhaltener Signale, aber ausschließlich aus vom Backend gelieferten Chart-Markern.
- **Volume Profile:** deutlich intensivere cyan-/amberfarbene Lichtabstrahlung, golden hervorgehobener echter POC und kräftigere wandernde Glanzstreifen. Graue Low-Volume-Zonen bleiben zurückhaltend. Cyan-/Amber-Abwechslung ist **rein dekorativ und kein echtes Bid-/Ask- oder Kauf-/Verkaufsvolumen**.
- **Funken & Dampf:** diskrete, CSS-animierte Spark-Emitter und weiche aufsteigende Dampfwolken an den äußeren Panel-Ecken von Header, Chart, Volumen, Diagnose, Matrix, Positionen und Journal. Alle Partikel sind `aria-hidden`, `pointer-events:none`, und liegen unter den echten UI-Elementen; keine Auswirkungen auf Trading.
- **Responsive & Motion:** kleinerer Effektradius auf kleinen Bildschirmen und komplett abgeschaltete Dekoration bei `prefers-reduced-motion: reduce`. Außerdem sind Chart-Overlay-Animationen deaktiviert, wenn das Browserfenster nicht sichtbar ist oder ein anderes Theme aktiv ist.

## Chart vergrößern / verkleinern

Die bestehende Live-Webapp und die Design-Demo haben jetzt die Schaltfläche **⛶ Vergrößern** in der Chart-Kopfzeile. Sie erweitert denselben interaktiven Chart und das verbundene Live-Volumenprofil auf einen großen Overlaybereich. **⤢ Verkleinern** oder **Esc** stellt die ursprüngliche Ansicht wieder her. Das echte Chartobjekt wird dabei nicht neu erstellt; Zoom/Timeframe/MT5-Daten und Crosshair bleiben erhalten.

Umgesetzt mit:
- Präsentationszustand und Tastatursteuerung in `static/stone-cockpit.js`
- Größenanpassungen in `static/stone-asset-skin.css` (auch in DARK/HELL aktiv)
- Button in der bestehenden `app.py`-HTML-Ausgabe und in `static/stone-preview.html`
- Demo-ResizeObserver aktualisiert zusätzlich die Chart-Höhe.

Auf kleinen Bildschirmen verschwindet die zusätzliche Volumen-Seitenleiste im vergrößerten Modus, damit die Chartfläche nutzbar bleibt.

## Dateien

- `static/stone-asset-skin.css` — Matrix-Hintergrund-Fix und neue Licht-/Funken-/Dampfanimationen.
- `static/stone-chart-effects.js` — hellere Canvas-Halos und Stern-Glints.
- `static/stone-cockpit.js` — platziert DOM-Effektlayer an vorhandenen Layoutankern ohne die Trading-Elemente umzubauen.

`app.py`, Backend-Risikologik und MT5-Code **bleiben unverändert**. Dasselbe CSS/JS gilt für die vorhandene klar als Simulation gekennzeichnete Design-Demo und das Live-Cockpit.

## Prüfung und Abnahme

Statisch zu kontrollieren: JavaScript-Syntax, ausgeglichene CSS-Regeln, keine FX-Zugriffe auf API/Orders, nur optische Ergänzungen und keine verwaisten Asset-Verweise.

Manuell im Browser zu kontrollieren:
1. Target-Matrix ist auf jeder Zeile gut lesbar, inklusive SHORT/LONG-Labels und LIVE-WERT.
2. Cyan-/Orange-Funken sind an den Rändern sichtbar und der Dampf verdeckt keine Buttons, Zahlen oder Preisachsen.
3. EMA-Glows bleiben beim Zoom und Timescale-Wechsel exakt auf der Linie.
4. Live-Preise, PnL, Kontenwechsel, Modals und Stop-Loss/Take-Profit funktionieren wie vorher.
5. Dark/Light schaltet Effekte ab; Windows/Browser-Einstellung „Animationen reduzieren“ ebenfalls.
6. Ausgiebiger Live-MT5- und Browser-Performance-Test nach dem Pull.

**Hinweis:** Ein erfolgreicher Commit und statische Tests beweisen nicht die optische Qualität oder das Verhalten mit einem real verbundenen MT5-Terminal. Diese Schritte benötigen einen anschließenden Browsercheck.
