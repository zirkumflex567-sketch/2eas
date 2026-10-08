# Strategieanalyse – GoldM15 v1.21

Historischer M15-Nachweis. v1.22 ergänzt ausschließlich die auswählbare Signalperiode; die unten beschriebenen Parameter bleiben gleich. Die bisherigen Ergebnisse gelten für `SignalTimeframe=M15`. Automatische andere Perioden und deren Funktionstest sind in [TIMEFRAME.md](TIMEFRAME.md) dokumentiert.

Stand 08.10.2026. Ziel dieser Fortsetzung ist wieder mindestens 5.000 USD im untersuchten 2026-Vergleich bei weiter aktiven Nutzerlimits. Die finale Variante erreicht +5.421,79 USD. 2024 ist kein Auswahlgate; 2025 liefert zusätzlich +1.106,66 USD. Es ist kein 1:1-Nachbau der unbekannten Originalsignale.

| Nativer Vergleich 2026 | Original | v1.11 ohne neuen Kontoschutz | v1.21 mit Sperren |
|---|---:|---:|---:|
| Netto | +4.474,25 USD | +5.819,20 USD | +5.421,79 USD |
| Trades | 403 | 566 | 3.186 |
| Trefferquote | ca. 67 % | 40,81 % | 54,90 % |
| Profitfaktor | 1,82 | 1,56 | 1,25 |
| Maximaler Equity-DD über den Zeitraum | 794,71 USD | 904,28 USD | 748,10 USD |
| Lot je Einstieg | 0,01 | 0,01 | 0,01 |

v1.21 erreicht rund 93 % des früheren v1.11-Gewinns, mit anderer Handelsfrequenz und höherer Trefferquote. Gewinnähnlichkeit weist weder identische Trades noch Originalgleichheit nach. Der niedrigere Profitfaktor und wiederholte Auswahl auf bekannten Daten begrenzen die Aussagekraft für zukünftiges Trading.

## Mechanik und eingefrorene Parameter

Drei korrelierte Slots mit maximal je einer Position, intern M15 auf einem Hedging-Konto. Nur abgeschlossene Kerzen erzeugen Signale. Keine historischen Tradezeitlisten, kein TP, kein Trailing-Stop und kein Martingale. Jeder Einstieg verwendet 0,01 Lot.

Ein Swing benötigt zehn abgeschlossene Nachbarn auf jeder Seite. Der jüngste bestätigte Pivot wird bis Shift 60 gesucht. Kaufstop = Swingtief minus 0,05 USD; Verkaufsstop = Swinghoch plus 0,05 USD. Fehlt ein zulässiger Swing, gilt der feste Ersatzabstand vom Bid für Käufe bzw. Ask für Verkäufe. Die frühere Originaldiagnose erklärt 392 Swing-Stops und elf Ersatzfälle, aber nicht alle Auslösebedingungen; sie liegt unter analysis/autotrading/v1_11/STRATEGIE_ANALYSE.md.

| Regel auf abgeschlossener M15-Kerze | Slot 1 | Slot 2 | Slot 3 |
|---|---:|---:|---:|
| Schneller RSI | 2 | 2 | 5 |
| Kauf-Trend RSI / mindestens | 70 / 45 | 70 / 45 | 40 / 55 |
| Kauf: schneller RSI höchstens | 45 | 45 | 35 |
| Verkauf-Trend RSI / höchstens | 30 / 55 | 30 / 55 | 20 / 55 |
| Verkauf: schneller RSI mindestens | 70 | 70 | 55 |
| Kauf-Momentum-Ausstieg | ROC(6) ≥ +0,20 % | ROC(6) ≥ +0,20 % | ROC(5) ≥ +0,70 % |
| Verkauf-Momentum-Ausstieg | ROC(5) ≤ −0,20 % | ROC(5) ≤ −0,30 % | ROC(8) ≤ −0,70 % |
| Ersatzstop, absoluter USD-Kursabstand | 28,00 | 28,00 | 30,37 |

Alle drei Slots verwenden Momentum-Ausstiege; die gespeicherten RSI-Ausstiegswerte sind bei ExitMode=1 inaktiv. ROC = 100 × (Close[t−1] / Close[t−1−Periode] − 1). Nach einem Ausstieg kein neuer Einstieg desselben Slots auf derselben Signalkerze. Schutzschließungen und Stops können zwischen Signalzeitpunkten erfolgen. Die sehr ähnlichen Slots 1 und 2 erhöhen gemeinsame Exposition; sie sind keine unabhängige Diversifikation.

## Änderungen und Auswahl

Zwei belegte Ausführungsprobleme wurden mit Regressionen korrigiert. Die bisherige Risikorechnung konnte offene Gewinne doppelt gegen die gemeinsame Untergrenze belasten; jetzt werden Balance und Equity getrennt bis zum Stop projiziert und konservativ geprüft. Negative Swaps und Kontofremdrisiken zählen mit. Zweitens verlor die globale Brokeranfrage-Sperre weitere Slot-Signale vor bestätigtem Fill. Die Warteschlange bewahrt Signale und gibt sie erst nach endgültiger Orderhistorie und vollständig sichtbarer/geschlossener Ausführung frei. Vor einem Einstieg werden Preis, Spread, Stoprisiko und Margin erneut geprüft.

Der interne Konto-Stoprisikodeckel steigt von 180 auf 275 USD. Einzelgrenze 75 USD, Kostenreserve 2 USD, Schutzreserven 100/75 USD und Nutzerlimits 9.100/350 USD bleiben unverändert. Beide projizierten Kontowerte müssen oberhalb der strengeren aktiven Schutzschwelle bleiben. Derselbe ausgewählte Kalender-/Queue-Kandidat erreicht mit Deckel 180 USD +5.185,81 USD, mit 275 USD +5.421,79 USD.

Fünf Kandidaten unter identischen nativen Bedingungen und Feiertagsvorabend-Pause ab 19:00 ergaben 2026 +5.315,94, +5.415,99, +5.185,81, +5.421,79 und +5.319,45 USD. Die Auswahl guardprofit_eve19_top5_cap275_2026 hat den höchsten Gewinn dieser Runde und eine positive 2025-Diagnose. Frühere Läufe mit höherem Gewinn, aber ungeklärten Tageswechseln sind keine finale Freigabe.

USD-Feiertage werden vollständig ausgespart. Frühere Glattstellung am Tag vor einem Feiertag und am Freitag nach einem Donnerstag-Feiertag beseitigt die beobachteten nicht verifizierbaren Baselines bei frühen Handelsschlüssen. Keine einzelnen Verlusttage werden gespeichert. Kalender- und Nachbartagsabdeckung müssen nachgewiesen sein. Overnight-Portfolios sind nicht Bestandteil dieser Freigabe.

## Finaler Nachweis

Die endgültige EX5 reproduziert 2026 +5.421,79 USD, 54,90 %, PF1,25; das vollständige SET liefert identische Kennzahlen. 2025 erreicht +1.106,66 USD, 51,95 %, PF1,06. Niedrigste Equity: 9.583,13 bzw. 9.764,37 USD. Größter Tagesverlust inkl. Floating: 266,27 bzw. 254,97 USD. In beiden Läufen sind unbekannte Baseline-Beobachtungen, ungeklärte Resets und beobachtete Nutzergrenzverletzungen null. Die als „ticks“ benannten Coverage-Zähler zählen Service-Aufrufe aus Ticks und Timern, keine unterschiedlichen Marktquotes oder Zeitdauer.

Alle 70 Eingaben werden gegen MQ5, SET und tatsächlichen MT5-Bericht geprüft. Tatsächliche Einstiege werden unabhängig gegen das ±135-Sekunden-Newsfenster, Feiertage und frühen Cutoff geprüft. 172 native Prüfungen und 111 Python-Tests bestanden, null Compilerfehler/-warnungen. Unabhängige Spezifikations- und Codeprüfung ohne verbleibende P1/P2-Befunde.

Bedingungen: 10.000 USD, XAUUSD, 0,01 Lot, 1:10, ICMarketsEU-Demo, M1 OHLC und 117 ms. Reale Ticks, Blueberry-Konto und unberührter Holdout wurden nicht geprüft. 2024 wurde für die finale Version nicht erneut getestet. Prime-Reset öffentlich nicht verifiziert; 00:00 Serverzeit bleibt Testannahme. Ausführungsrisiko und Zulässigkeit stehen in AUTOTRADING.md. Keine Live-Aktivierung oder Garantie künftiger Gewinne und absoluter Kontountergrenzen.
