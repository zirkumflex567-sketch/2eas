# Performance-Audit — 2EAS (2026-10-09)

**Basis:** Quellcode von `main` bei Auditbeginn `5244b9e8fa9315284b78c70f1b9f1f1204ee9b7a`.  
**Evidenzarten:** `[CODE]` = direkt gelesen; `[TREE]` = Git-Blob-Größen; `[HYPOTHESIS]` = Wirkung braucht Live-Profiling. Es wurden **keine** Millisekunden, FPS, RAM- oder Lighthouse-Scores gemessen.

## PERF-01 · P1 · MT5-Abfragen werden global serialisiert und jedes Mal neu verbunden

**Beleg:** `account_gateway.py:83-109`: `threading.RLock`, `terminal_running()`, `mt5.shutdown()`, `mt5.initialize(... timeout=5000)`, `verify_identity()`, erneutes `mt5.shutdown()` im `finally`. `@scoped(mt5)` liegt u.a. auf `/api/status`, `/api/candles`, `/api/journal_summary` (`app.py:630-654`). **[CODE]**

**Auswirkung:** Eine langsame Anfrage blockiert unter demselben Lock die andere MT5-Anfrage. Das ist eine architektonische Quelle für UI-Latenzspitzen und hohen Verbindungs-Overhead, gerade bei mehreren Browser-Tabs oder zwei Accounts. Es verhindert allerdings das gefährliche, unkontrollierte parallele Nutzen eines einzigen MT5-Python-Handles — diese Kontosicherheit muss erhalten bleiben.

**Empfehlung:** Ein dedizierter Worker pro Terminal/Account oder ein geprüfter Snapshot-Prozess mit eigener MT5-Verbindung, strikt getrennter Kontenidentität, validiertem Login/Server/Terminal-Pfad. Status-Reads aus einem aktuellen Snapshot ausliefern, nicht aus einer beliebigen laufenden MT5-Sitzung. Order-Write-Endpunkte müssen eigenständig authentifiziert/validiert bleiben und dürfen **nicht** aus einem veralteten Cache handeln. Zuerst Verbindungsdauer/Lock-Wait/Accountwechsel messen.

## PERF-02 · P1 · Datenbeschaffung und Berechnung zu häufig

**Beleg:** `app.py:2559-2561`: `updateStatus` alle **1,5 s**, `loadCandles` alle **5 s**, `refreshJournal` alle **30 s**. Pro Status holt `get_live_market_data()` **1000** oder für GoldM15 **5000** M15-Rates (`app.py:253`), macht DataFrame-/EMA-/RSI-/ATR-/VP-Berechnungen und erstellt `build_trade_journal(...)` (`app.py:573-610`). Candle-Pfad lädt `count+250` Rates (Default 150) beziehungsweise **mindestens 5000** für GoldM15/M15 (`app.py:654-679`). **[CODE]**

**Auswirkung:** Arbeit wiederholt sich zwischen Requests, obwohl sich Indikatorhistorie meistens nur beim Kerzenwechsel verändert. `/api/status` liefert Journal und weitere große Teilstrukturen mit, während `/api/journal_summary` dasselbe Journal separat abruft. **[HYPOTHESIS]** JSON-Größe und Verbindungskosten können das Live-Gefühl beeinträchtigen.

**Empfehlung:**
- `/api/status-lite` nur für Preis, Spread, Verbindung, Positions-PnL, DD und UI-Deltas; schwere Signal-/Volumen-/Historien-Daten getrennt.
- Indikatoren/VP/Chartmarkierungen nur bei neuer M15-Kerze oder relevanter Korrektur neu berechnen, ansonsten Tick-/Preisupdate; Konten-/Timeframe-/Symbolcache strikt schlüsseln.
- Journal nur bei neuer Position/Deal oder auf expliziten Abruf aktualisieren; separate `journal_version`/ETag für Delta-Reads; bereits vorhandene Account-Generationslogik erhalten.
- API-Antwortdaten auf strikt benötigte Felder reduzieren, übereinstimmende Status- und Journal-Daten nicht doppelt ausliefern.
- Polling adaptiv (sichtbar/inaktiv, Markt offen/geschlossen), EventSource/WebSocket nur bei stabiler Implementierung und korrekter Account-Zuordnung evaluieren.
- Poller/Timeouts nicht so ändern, dass ein fehlender MT5-Snapshot irrtümlich als aktuelle Handelsfreigabe erscheint.

## PERF-03 · P1 · Assetgrößen / Netzwerklast

**Git-Tree-Inventar (nicht: Seiten-Waterfall):**

| Pfadgruppe | Anzahl Dateien | Größe gesamt |
|---|---:|---:|
| `static/stone-assets/ready/` | 56 | **47,16 MiB** |
| `static/stone-assets/source/` | 50 | **32,06 MiB** |
| `Okt 08 - 23_25/` | 51 | **34,25 MiB** |
| In CSS/HTML referenzierte eindeutige `ready/`-Dateien | **37** | **34,31 MiB** aufsummiert |

Die letzte Zeile ist **kein** Nachweis, dass 34,31 MiB beim Start heruntergeladen werden: CSS-Selektoren, Theme-Status, Caching und Browser-Netzwerkverhalten entscheiden über tatsächliche Requests. Sie beschreibt aber das exponierte Volumen an Bild-URLs. **[TREE]**

Beispiele: `11_master_dashboard_panel.png` 3,12 MB; `25_rune_crest_emblem.png` 1,92 MB; `19_entry_matrix_frame.png` 1,76 MB; `13_volume_frame_tall.png` 1,66 MB; `12_chart_frame_wide.png` 1,60 MB. Größeneinheiten hier dezimale MB, im Tabelleninventar MiB. **[TREE]**

**Empfehlung:** Versionierte, sichtbare CSS-Assets nach Bedarf laden, dekorative Vollauflösungs-PNGs auf tatsächliche Darstellungsgrößen reduzieren, Alpha-WebP/AVIF (mit Browser-Fallback) und verlustarme PNG-Quantisierung visuell vergleichen. Für winzige Ornamente CSS/SVG statt Bitmap erwägen, ohne die hochwertige Steinoptik zu opfern. Getrennte Desktop-/Mobilvarianten nur bei nachweislich unterschiedlichen Zielgrößen. Originale in einen historischen Git-LFS-/Release-/Archivprozess auslagern, **nicht** ohne Freigabe löschen. Pro Variante Screenshot-Diff und Transparenz prüfen (insbesondere 11/12/13/17/18/19/26/35).

## PERF-04 · P1 · Python-Iterationen und Journal-Lookups

**Beleg:** `compute_volume_profile` iteriert `df_subset.iterrows()` (`app.py:92-108`), während pandas/numpy bereits verfügbar sind. `build_trade_journal` liest Deals ab festem Zeitpunkt `2026-10-08 22:00` und sucht **für jeden** Exit erneut in allen Deals über Listenverständnis (`app.py:157-205`). **[CODE]**

**Auswirkung:** Für wachsende Deal-Historie skaliert das verschachtelte Lookup quadratisch zur Zahl der Deals, sofern viele Exits anfallen. Außerdem wird der betrachtete Zeitraum ohne Rotation immer länger. `JOURNAL_CACHE` enthält komplette Einträge und gelangt zusammen mit anderen Statusdaten in Antworten.

**Empfehlung:** Lookup-Index per `position_id/order` einmal aufbauen (`dict`), Zeitraum-/Seitenlimit für sichtbare Historie, inkrementelle Historien-Fortsetzung anhand letztem verifizierten Deal, PnL-Aggregat getrennt vorhalten. Für Volume-Bins `numpy.searchsorted/bincount` oder äquivalente Arrayoperationen einsetzen. Fachliche Zuordnung und `net_profit_usd` nachher mit Golden Fixtures vergleichen.

## PERF-05 · P1 · Vollständiger DOM-Ersatz beim Live-Tick

**Beleg:** `updateStatus()` triggert `renderMatrix`, `renderVolumeProfile`, `renderPositions` (`app.py:1984-1991`). Diese bauen Tabellen, Balken und Positionen durch `innerHTML = ...` neu (`app.py:2003-2029,2065-2087,2089-2139`). Letztere enthalten editierbare `sl-input-...` und `tp-input-...`. **[CODE]**

**Auswirkung:** Fokussierte Zahlenfelder werden ersetzt, Cursorzustand/ungesendete Änderungen gehen verloren; unnötige Layout-/Paint-Arbeit. Die tatsächlich beobachtete Eingabestörung muss im Browser reproduziert werden, die DOM-Ersatzsemantik ist eindeutig.

**Empfehlung:** Positionszeilen nach `ticket` keyed wiederverwenden, Zahlen durch `textContent`/Styles gezielt aktualisieren, fokussiertes Eingabefeld nicht überschreiben, Draft-Werte bis zum expliziten `Set` erhalten. Matrix-/VP-Markup nur bei strukturellen Datenänderungen neu erstellen; Preis-/Volumenwerte gezielt updaten. Chart/SL/TP-Trade-Aktionen mit Browser-Regression prüfen.

## PERF-06 · P1 · Tailwind Play-CDN im Browser

**Beleg:** `app.py:884` lädt `<script src="https://cdn.tailwindcss.com"></script>` ohne lokale Produktions-CSS-Datei. **[CODE]**

**Auswirkung:** Tailwind selbst bezeichnet den Play-CDN-Modus als Entwicklungslösung, nicht für Produktion. Abhängigkeit von externer CDN-Auslieferung und unnötige Browser-Laufzeitkosten.

**Empfehlung:** CSS in einer festen Build-Stufe erzeugen, versioniert lokal statisch ausliefern. Dynamisch zusammengesetzte Utility-Klassen/Theme-Zustände vor dem Tree-Shaking safelisten. Die Stone-Theme-Varianten visuell vergleichen.

**Referenz:** https://v3.tailwindcss.com/docs/installation/play-cdn

## PERF-07 · P2 · 100-ms-Chart-FX-Loop

**Beleg:** `static/stone-chart-effects.js:415` startet `setInterval(render,100)`; `render()` prüft Aktivität, ruft bei aktivem Theme `prepareSize()` und `ctx.clearRect()` auf (`281-313`). `prepareSize()` liest `getBoundingClientRect()` (`46-74`). Bei Effekten werden mehrere hundert Chartpunkte mit `timeToCoordinate`/`priceToCoordinate` umgerechnet, bis zu drei Shadow-Blur-Passes gezeichnet (`85-100,171-231`). **[CODE]**

**Empfehlung:** `requestAnimationFrame` nur während aktiven Bursts/Dimensionänderungen; zwischen Events ein einzelner Timer bis zur nächsten Startzeit (keine 100-ms-Leerlaufschleife). Bei Theme-Aus, Tab-Hidden oder `prefers-reduced-motion` Render-Cycle vollständig stoppen; bei Wiederaufnahme sauber neu initialisieren. Koordinaten nur bei Geometrie/Scale/Datenänderung neu ableiten, sichtbares Fenster binär/indiziert schneiden. 100-ms-Loop nicht durch dauerhaftes 60-FPS-Loop ersetzen.

## PERF-08 · P2 · Sechs transparente EMA-Linien

**Beleg:** `app.py:1620-1629`: sechs Glow-Linien zusätzlich zu drei EMA-Kernserien und Kerzen; `syncEmaGlows()` aktualisiert ihre Daten (`1775-1783`). `stone-chart-effects.js:35-44` setzt diese transparent. **[CODE]**

**Empfehlung:** Chart-Serien vollständig entfernen, wenn sie nachweislich von keiner anderen Logik gebraucht werden; anschließend Chart-Linien, Scroll/Zoom, PriceScale, Signalmarker und Browser-Snapshots vergleichen. Das reduziert Chart-Datenstrukturen und Updates, ohne die eigentlichen EMAs zu löschen.

## PERF-09 · P2 · CSS-Daueranimation und Effektspitzen

**Beleg:** `static/stone-cockpit.js:136-168` erzeugt 7 Ambience-Gruppen mit insgesamt **61 Sparks + 14 Vapor-Spans**. `stone-asset-skin.css:582-667` definiert dauerhaft laufende `filter`, `box-shadow`, `blur`, `mix-blend-mode` und Animationen. Profitfeiern animieren in `stone-celebrations.js:43-85` mehrere Ziele mit `filter/boxShadow` und zusätzlichen Spark-Nodes. **[CODE]**

**Empfehlung:** Effekte als `Low/Standard/Full`-Qualitätsstufen, `Off` strikt ohne Daueranimation; `prefers-reduced-motion` beibehalten; Idle-Effekte deutlich reduzieren, bei Gewinn gezielt kurzfristige Bursts. In Chrome Performance/Rendering prüfen, welche Paint- und Composite-Kosten entstehen. Nur `transform/opacity` bevorzugen, soweit Look erhalten bleibt; teure Shadow-/Filter-Animationen isolieren, keine pauschale `will-change`-Verwendung.

**Referenz:** https://web.dev/articles/animations-guide

## Zielmetriken / keine behaupteten Ist-Werte

Vorher/Nachher messen: P50/P95/P99 von `/api/status`/`/api/candles`/`/api/journal_summary`; Zeit in Lock/MT5-Initialize/History/Indicators/Serialization; Requests/Minute je Browser/Account; Server-CPU und Gesamt-JSON-Bytes; Browser-Long-Tasks, FPS/Frame-Drops im Idle und bei Gewinnerskalation; tatsächliche Bildtransfergröße und Resource-Waterfall; Speicherkurve nach 30/60 Minuten sowie Wechsel von zwei Konten. Vergleich unter identischer MT5-Historie und identischer Animationseinstellung.

**Sicherheitsbedingung:** Keine Optimierung darf Konto-/Terminal-Isolation, Trade-Schreibberechtigungen, Drawdown-/Risk-Gates, Signalberechnung oder PnL-Semantik unbemerkt ändern.
