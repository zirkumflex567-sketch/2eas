# MYTHIC FX / MT5 Celebration Toolbar

Die Toolbar befindet sich **direkt am Chart**, neben `CHART GROSS`, und ist über `✧ Chart-FX` ein-/ausklappbar.

- **Aus:** keine Chart-FX und keine Trade-/Gewinnanimation.
- **Mystisch:** seltenes sanftes Funkeln und kurze Bestätigungsblitze.
- **Chaos:** mehrere unregelmäßige Highlights über Charts und Dashboard-Elemente.
- **Eskalation:** besonders intensive, länger andauernde Blitze; bei profitablen Exits stärker.
- **Stärke 1–5**, einzelne Checkboxen für *bestätigte Trades*, *realisierte Gewinne* und *aktuelle EMA-Werte*.
- **Trade testen / Gewinn testen / Chaos testen** erzeugen ausdrücklich nur eine Demoanimation. Sie senden keine MT5-Order. Dauerhaft gespeicherte Einstellungen in `localStorage` können jederzeit über **Aus** deaktiviert werden.
- Die optionalen Live-Zahlen für EMA20, EMA50, EMA200 stammen aus der bereits geladenen Chart-Zeiteinheit und werden bei Timeframe- oder Kontowechsel zunächst geleert.

## Reale Ereignisse, nicht Signale

`StoneCelebration.observeTrades` erhält die per MT5-Account verifizierten Daten von `/api/status` sowie `/api/journal_summary`. Der **erste Snapshot eines Kontos** etabliert nur die Baseline; bestehende Positionen oder vergangene Gewinne werden beim Neuladen nicht erneut gefeiert. Danach gilt:

- **Trade bestätigt:** eine vorher nicht beobachtete `OPEN`-Position anhand des accountbezogenen Tickets.
- **Realisierter Gewinn:** ein neuer `CLOSED`-Deal mit positivem `net_profit_usd = profit + swap + commission`.
- IDs werden je Konto und Status dedupliziert, zusätzlich werden nur Ereignisse mit Zeitstempel aus den vergangenen 15 Minuten berücksichtigt. Negative realisierte PnL und rein positive offene PnL lösen keine Gewinnfeier aus.
- Bei gleichzeitig eintreffenden neuen Events erhält der Gewinn Priorität. Das Journal bleibt unabhängig vom Trading-Kontowechsel. Die Mode-Auswahl beeinflusst keine MT5-Einstellungen.

Die Effekte werden für das **Stein-Design** ausgeführt, respektieren `prefers-reduced-motion`, sind pointer-transparent und manipulieren keine Chartsignale, Orders, Candlewerte, Risiko- oder Broker-Funktionen.

## Technische Dateien

- `static/stone-celebrations.js` – Zustand, Benutzerbedienung, Read-Only-Trade-Erkennung, Dashboard-Funken
- `static/stone-chart-effects.js` – zeitlich begrenzte, chaotische EMA-/Candle-Bursts bei bestätigtem Ereignis; ansonsten sporadisches Funkeln
- `static/stone-asset-skin.css` – Toolbar und Effekt-Präsentation
- `app.py` – Skript-Einbindung, Read-Only-Hooks bei MT5-Journal/Status sowie EMA-Preisanzeige; Nettogewinn zusätzlich als Feld in den Journal-Antworten
- `tests/test_stone_celebrations_contract.py` – Regressionstests für Read-Only-Hooks und Sicherheit

## Abnahme

Statische Codeprüfung und simulierte Trade-/Gewinnfolge prüfen lediglich die Funktionslogik. **Im Live-Browser mit verbundenem MT5 müssen** die Darstellung, die Ein-/Ausklappfunktion, Konto- und Timeframe-Wechsel, Gewinnschließung, Reload-Baseline sowie die Performance während der Eskalation nochmals überprüft werden. Es darf kein Trade oder Gewinn allein durch einen Demo-Button ausgelöst werden.
