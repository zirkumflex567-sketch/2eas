# Zwei Konten im Live-Cockpit

Dashboard: http://127.0.0.1:8050. Oben zwischen XAU Titan Pro (53087839) und GoldM15 Reconstruction (53090070) wechseln. Auswahl und Hell/Dunkel-Thema bleiben im Browser gespeichert. Beide Ansichten haben Chart, EMA-/S/R-Linien, tägliches/wöchentliches Volumenprofil, Long-/Short-Zielmatrix, Drawdown-Anzeige und Positionsmanager mit SL/TP-Dollarwerten, Schnellaktionen und Schließen.

Alle MT5-Abfragen und Positionsaktionen werden an das ausgewählte Terminal gebunden und durch Login, Server und Terminalverzeichnis geprüft. Ein gemeinsamer Lock verhindert paralleles Wechseln der Python-MT5-Verbindung während einer Anfrage. Fehlt ein Terminal oder stimmt das Konto nicht, zeigt die Ansicht einen Fehler; es gibt keinen automatischen Ersatzaccount und keinen Login. Terminals selbst öffnen und beim angegebenen Konto angemeldet lassen.

## GoldM15

Die sechs Einstiegsbedingungen zeigen RSI-Trend und RSI-Pullback je System 1–3. Die drei Momentum-Karten zeigen die getrennten Long-/Short-Ausstiegsziele. Berechnung ausschließlich aus abgeschlossenen M15-Kerzen; historische Pfeile kennzeichnen neue RSI-Setups, keine tatsächlichen Orderausführungen. Prozentbalken zählen erfüllte Bedingungen und sind keine Gewinnwahrscheinlichkeit oder vollständige Handelsfreigabe. Slot-Belegung, News, Feiertage, Spread und Risikobudget werden zusätzlich im EA geprüft.

Die Parameter stammen aus `C:\Users\zirku\Documents\goldm5\.mt5-demo\MQL5\Presets\GoldM15_Demo_Guarded.set`. Bei manueller Änderung der EA-Einstellungen muss dieses Preset ebenfalls aktualisiert werden. RSI verwendet Wilder-Glättung mit 5000 verfügbaren Kerzen; bei weniger Historie können kleine Initialisierungsabweichungen gegenüber MT5 auftreten.

Der Schutzstatus liest die persistierte v1.21-Datei `GoldM15Risk_573369822.state` ausschließlich lesend. Gültige Tagesbasis und Reset-Stunde werden geprüft. Die tatsächlichen Puffer verwenden wie der EA den niedrigeren Wert aus Balance und Equity: tägliche feste Grenze $350, Tagesreserve $75, Mindestkonto $9100, geschützte Untergrenze $9200. Fehlende/ungültige Tagesbasis wird als unbekannt angezeigt. Diese Anzeige bestätigt nicht die vollständige Handelsfreigabe.

Golds **Anzeige-Reset** betrifft nur `drawdown_config_goldm15.json`. Er verändert weder EA-Baseline noch Sperren. Titans bestehende `drawdown_config.json` und Common-Datei `titan_dd_reset.json` werden ausschließlich durch Titan-Resetaktionen verwendet.

## Betrieb und Prüfung

Start im Dashboard-Ordner: `C:\Python314\python.exe app.py`. Port standardmäßig 8050; `DASHBOARD_PORT` erlaubt eine separate Vorschau. Der Server ist nur an 127.0.0.1 gebunden.

Backend-Prüfung: `C:\Python314\python.exe -m unittest discover -s tests -p test_multi_account.py -v` — 20 Tests, darunter Account-/Terminalfehler, parallele Isolation, Aktionsrouting, Schutzstatus und M15-Signale. Browser-Prüfung in `output/playwright/validate_dashboard.js` — 18 Prüfungen einschließlich später Antworten, Offlinezustand, Theme, Mobilansicht und Account-Routing. Positionsaktionen und Reset wurden im Browser abgefangen; keine echten Testorders oder Resets gesendet.

Vorherige App und Titan-Konfiguration sind unter `dashboard-backups/20261008-multi-account/` gesichert. Während der Erweiterung wurden die Titan-Signalregeln parallel geändert; diese im aktuellen `app.py` vorhandenen Änderungen wurden beibehalten. Die erste Sicherung enthält den Stand vor dieser parallelen Änderung. Deshalb bei Rollback gezielt Änderungen vergleichen, nicht blind die gesamte Datei zurückkopieren. MT5-Terminals und EA-Dateien wurden für die Dashboard-Erweiterung nicht verändert.

Verbindungs-API: [offizielle MT5-Dokumentation](https://www.mql5.com/en/docs/python_metatrader5/mt5initialize_py). Die Anwendung prüft vorher, ob der exakt konfigurierte Terminalprozess bereits läuft, weil initialize andernfalls ein Terminal starten kann.
