# Reproduzierbare Audit-Abnahme / Benchmark-Plan (2026-10-09)

**Status aller nachstehenden Tests:** **NICHT AUSGEFÜHRT**. Dieser Report ist ein Prüfprotokoll für eine Entwicklungsumgebung mit lokaler Webapp, zwei vorhandenen MT5-Terminals und Browser; er enthält bewusst **keine erfundenen Messwerte**.

## 1. Baseline reproduzierbar erfassen

1. Git-SHA der Anwendung, Windows-Version, MT5-Build, Python-Version, Browser/Version, Auflösung, Zoom, DPR, GPU, Netzwerkkonditionen, MT5-Login **nur lokal/privat** und Zeitzone dokumentieren.
2. 2EAS unverändert starten; einzeln `titan`, einzeln `goldm15`, anschließend beide Journale und zwei Browser-Tabs. Jede Messphase mindestens 5 Minuten, davon einmal Hintergrundtab und einmal aktive FX.
3. Vor Messungen keine laufenden Optimierer/Strategy-Tester, die CPU und MT5 gleichzeitig belasten. Identische Candle-/Deal-Historie und denselben visuellen Modus in Vorher/Nachher-Vergleichen nutzen.
4. Chrome DevTools Performance (CPU-Sampling, Long Tasks, Frames, Layout/Paint/Composite), Network (request count, Wasserfall, Bytes, Initiators) und Memory (Heap-Snapshots/Timeline) speichern. Browser kein „Disable cache“ nur im Cold-Load-Test; zusätzlich Warm-Load mit Cache.
5. Backend-Logging **ohne Secrets/Kontodaten**: `request_ms`, `lock_wait_ms`, `mt5_init_ms`, `rates_ms`, `history_ms`, `indicators_ms`, `json_bytes`, `cache_hit`, `account_kind`, `endpoint`; je P50/P95/P99, Maximum und Fehlerquote.

## 2. Testmatrix

| Szenario | Ausführung | Beurteilung |
|---|---|---|
| Cold/Warm Load | Stone/Dark/Light je 1920×1080 und 390×844 | Wasserfall, notwendige Bilddownloads, erste interaktive Ansicht, Bilddarstellung |
| Idle Render | Stone 5 min mit FX-Off/Mystic/Full | CPU, laufende Timer, Frame-Drops, Long Tasks, Speicherkurve |
| Gewinnfeier | Demo-Buttons Trade/Gewinn/Chaos mehrfach, anschließend echte Daten nur im gesicherten Demo-Umfeld | Spitzenbelastung, weiterhin bedienbarer Chart, keine Order durch FX |
| Live-Status | Nur Titan, nur GoldM15, beide Journalquellen, zwei Tabs | P95 API-Zeit, Warteschlangen, konto-/ticketkorrekte Daten |
| Eingabe-Härtetest | Offene Position im Demo-Konto, SL/TP-Zahl 20 s editieren ohne `Set` | Wert, Fokus und Cursor bleiben während aller Polls erhalten |
| Order-Management | Demo-Broker: Set/BE/TP/Close; Fehlermeldungen auslösen | Kein Doppelauftrag, explizite Bestätigung, keine alten Werte |
| Account-Race | 10× schnell Konten wechseln während Status/Candles/Journal laden | Keine fremden Daten, kein stale overwrite, `AbortError` kontrolliert |
| Chart-Genauigkeit | 7 Timeframes, Preisachse/Zoom/Scroll, Expanded und Normal | Echte Linien unverändert, Glow auf korrekten Kerzen-/EMA-Koordinaten |
| Reduzierte Bewegung | OS `prefers-reduced-motion: reduce`, FX-Modi durchschalten | Keine erzwungenen FX, weiterhin volle Funktionalität |
| Mobile | 1280×800, 768×1024, 430×932, 390×844; 100/125/200% Zoom | Keine unzugänglichen Bedienelemente, gut lesbare Zahlen, Tabelle erreichbar |
| Langzeit | 30 und 60 Minuten mit Polling, FX an/aus | Keine fortlaufende Speicher-/Timer-/Listener-Anhäufung |
| Verlustfälle | MT5 offline, Konto falsch, Timeout, leere Rates, API 503 | Keine falsche „LIVE“-Meldung, kein Cross-Account-Leak, kein Auto-Trade |
| EA-Risiko | MT5 Strategy Tester/Demo und kontrollierter Orderfail | Daily-/Total-DD, Pendingorder, Hard Lock, Retry, News unverändert |

## 3. Visuelles Golden-Screenshot-Set

Für `stone` jeweils `idle`, `entry-confirmed`, `profit-realized`, `fx-off`, `expanded-chart`, `modal-open`, `journal-all`, `two-accounts`. Für Dark/Light mindestens `idle`, `modal-open`, `positions-editing`. Screenshotnamen versionieren als `<viewport>_<theme>_<state>_<git-short-sha>.png`. Screenshots von echten Accounts vor dem Speichern anonymisieren (Account-Login, Ordertickets, persönliche Daten).

**Asset-QA:** Über die Preview-/Kontaktblätter von `static/stone-assets/ready/previews/` die 50 Bilder vergleichen, speziell die `manual_review`-IDs **11,12,13,17,18,19,26,35**. Freistellungsfehler bei Checkerboards, Rahmenlöchern und Hairline-Halos prüfen. Keine 1:1-Farb-/Alpha-Konvertierung ohne Abnahme.

## 4. Automatisierbare Regressionstests

Vorhandene statische Contract-Tests: `tests/test_stone_theme_contract.py`, `tests/test_stone_celebrations_contract.py`, `tests/test_journal_multi_strategy_contract.py`, `tests/test_multi_account.py`. Vorhandenes Browser-Skript: `output/playwright/validate_dashboard.js`.

Zu ergänzen:

- Playback-Fixtures für 150, 1000 und 5000 Candles sowie 0/1/100/1000 Deals; gleiche Indikator-, Signal- und Journalwerte vor/nach Caching.
- Isolations-/Concurrency-Tests für gesperrte MT5-Verbindungen, mehrere Browser, unterschiedliche Account-Snapshots und Konto-Generationen; niemals eine fremde MT5-Position verändern.
- Stabile keyed DOM-Karten mit künstlichen 1,5-s-Statusupdates; SL/TP-Input darf nicht ersetzt werden, solange er editierbar ist.
- Timer-/Observer-Teardown beim Chartwechsel, FX-Off, Reduced Motion und Resize; inaktiv möglichst keine Canvas-Renderarbeit.
- Festes Screenshot-Golden-Set für Grafikrahmen, Line/PriceScale-Overlays, Journal/Toolbar/Popup und responsive Breakpoints.
- Farbkontrast-Fälle, Fokus-/Tab-Reihenfolge, Tastatur-/Escape-Steuerung, `aria-expanded` und Statusansagen.
- Ein `main`-CI-Gate mit `python -m unittest discover -s tests -v` (nach Umgebungsvorbereitung), statischer Asset-Manifest-Verifikation, selektierten JS-/Browser-Tests und optionalem Bildgrößen-Budget. Das vorhandene Asset-Workflow triggert per Push **nicht** auf `main`.

**Nicht** Teil eines normalen CI-Laufs: reale Brokerorders, live MT5-Zugang, echtes Challenge-Konto oder versehentliche Tests mit Schreibzugriff.

## 5. Vorher/Nachher-Erfolgsdefinition

Anforderung | Messgröße | Erfolgsregel
--- | --- | ---
MT5-Kommunikation | P95 API + Lock-Wait + Fehlerquote | Nach Optimierung nachweisbar niedriger unter gleicher Last; keine neuen Konto-Fehler
Datenpfad | Rates-/History-Zugriffe pro Minute, CPU | Weniger redundante History-/Indikatorarbeit ohne Value-Drift
Chart | FPS/Long Tasks/Idle-CPU | Geringere Leerlaufbelastung, keine verlorenen Signale oder Skalierungsabweichungen
Assets | Cold/Warm transferierte KB, Anzahl Requests | Weniger Byte-Volumen und kein sichtbarer Qualitätsverlust
Editing | Fokus/SL-/TP-Werte während Polls | **100 % Erhalt** bis Speichern/Abbrechen
Visuell | Screenshot-Diff, Accessibility, manuelle QA | Keine neue Überlagerung, keine abgeschnittenen Kontrollen, klare Handelsinformationen
Funktion | Risk/Order/Journal-Snapshots | **0** Cross-Account-Mischungen, kein unbeabsichtigter Write, identische Schutzwirkung

Konkrete Millisekunden-/KB-/FPS-SLOs werden **erst nach Messung der Baseline** festgesetzt. Keine unbewiesenen „x% schneller“-Versprechen.

## 6. Risiken bei der Umsetzung

- Trading-Writes immer durch verifizierte MT5-Identität und live aktuelle Risiko-/Orderchecks autorisieren; UI-Caches sind nicht autoritativ.
- EMA20/EMA21-Namensabweichung als gesonderten Korrektheitsfall testen, nicht unbemerkt in EAs korrigieren.
- FX-Demo-Buttons dürfen unter keinen Umständen Order-Endpunkte auslösen.
- Beim Cache-Fehler lieber „Daten veraltet/nicht erreichbar“ anzeigen, niemals eine falsche Freigabe.
- Report schließen und Findings als „fixed“ markieren **nur** mit Commitverweis und reproduzierter Vorher/Nachher-Evidenz.

Weitere Details: [README.md](./README.md) · [PERFORMANCE.md](./PERFORMANCE.md) · [VISUAL_UX.md](./VISUAL_UX.md) · [EA_RUNTIME.md](./EA_RUNTIME.md).
