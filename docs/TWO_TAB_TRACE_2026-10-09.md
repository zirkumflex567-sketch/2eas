# Fünf-Minuten-Abnahme: zwei echte Dashboard-Tabs

Stand: 09.10.2026; laufender main 043d7b6, Chromium headless unter Windows. Zwei authentisierte öffentliche `/stt`-Tabs mit Titan/GoldM15, ChartStudio geöffnet, reduced_motion=reduce. Alle API-Methoden außer GET/HEAD waren durch die Browserroute gesperrt.

| Konto | Statusantworten | P50 / P95 / P99 HTTP ms | Fehlerhafte Antworten | Long Tasks gesamt / längster |
|---|---:|---|---:|---|
| Titan | 202 | 131,84 / 267,05 / 381,36 | 0 | 7 / 223 ms |
| GoldM15 | 200 | 151,93 / 335,25 / 558,12 | 0 | 5 / 141 ms |

Laufzeit 300,01 Sekunden, 590 zusätzliche Prüfungen von activeAccount/currentData/source freshness. Keine Konto-Verwechslung, keine veraltete oder fehlgeschlagene Statusantwort, keine Browserfehler und keine API-Mutationsanfrage. Die Long Tasks wurden beim Laden erfasst; im weiteren Fünf-Minuten-Fenster kamen keine hinzu.

PerformanceResourceTiming meldet beim Laden rund 11,14/11,16 MB Transfer und 72/75 Ressourcen. Das sind sichtbare Browser-Timing-Werte für diesen Ablauf, kein vollständiger Netzwerk-/Decode-/Paint-Nachweis, keine universelle Gesamtseitenmessung und kein ≤3-MiB-Versprechen. Das Nicht-Chart-Assetbudget ist gesondert. Der Browser meldet gerundete Heapwerte; daraus wird keine 30-/60-Minuten-Speicherstabilität abgeleitet.

Grenzen: bereits laufender Backendprozess, kein Cold-Server-Start; HTTP enthält Netzwerk/Proxy/Gateway, aber keine getrennten MT5-init/history/Lock-Wait-Spans. Keine physische Mobil-/Touch-/150%-DPI-/FPS-/CPU-Abnahme, kein Full/Celebration-Motionvergleich. AUD-01/02/04/06 bleiben entsprechend teilweise offen.

Private Einzelmessungen bleiben unter ignoriertem output/integration-live/runtime-20261009/two-tab-five-minute-trace.json. Gespeichert werden Kontoalias, Status, Frische und Laufzeiten; keine Finanzpayloads, Zugangsdaten oder Cookie-Werte.
