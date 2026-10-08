# GoldM15 v1.22 – Kontoschutz und Betrieb

v1.22 ergänzt die Signalzeitrahmenwahl. Die Schutzimplementierung, Eingaben und persistente Zustandsversion bleiben unverändert gegenüber v1.21. Die unten genannten historischen Gewinnnachweise gehören zu M15. Für bisheriges Verhalten `SignalTimeframe=M15` verwenden; für Tester-/Chart-Folge `PERIOD_CURRENT`. Details: [TIMEFRAME.md](TIMEFRAME.md). Das laufende Demo-Terminal wird durch die Installation der separaten Version nicht umgestellt.

Stand 08.10.2026. Forschungsprofil für ein Hedging-Testkonto mit 10.000 USD Initialbalance. Die aktuelle Auswertung steht in analysis/autotrading/final_result.json. Alle betrachteten Jahre sind Entwicklungsdaten.

## Grenzen und Reserve

| Einstellung | Vorgabe | Verhalten |
|---|---:|---|
| MinimumAccountUSD | 9.100 USD | Statische Nutzergrenze |
| DailyLossPercent | 3,5 % initial | Festes Tagesbudget 350 USD |
| HardReserveUSD | 100 USD | Eigene Positionen bereits bei 9.200 USD schließen |
| DailyReserveUSD | 75 USD | Eigene Positionen bei Tagesbasis minus 275 USD schließen |
| MaxPositionRiskUSD | 75 USD | Größere Einstiegsrisiken ablehnen |
| MaxAccountStopRiskUSD | 275 USD | Beide Kontorisikoprojektionen begrenzen |
| CostReservePerPositionUSD | 2 USD | Reserve je Position/Order |
| MaxSpreadPoints | 80 | Broker-Point-Spanne für Einstiege |

Tagesbasis = höhere Balance oder Equity am verifizierten Tagesbeginn. Beispiel: Balance 10.500, Equity 10.600 USD ergibt Basis 10.600 USD und Schutzschwelle 10.325 USD. Es gilt die höhere Tages-/Gesamtschutzschwelle. Aktuelle Balance und Equity werden einschließlich offener Ergebnisse geprüft.

Alle Kontopositionen und Pending Orders zählen im Risikobudget. Equity-Risiko wird vom aktuellen Bid/Ask zum SL berechnet; Balance-Risiko vom tatsächlichen Einstieg zum SL plus negativem offenem Swap. Positive Gewinne verrechnen kein zusätzliches Verlustpotenzial anderer Positionen. Beide Summen und projizierten Kontowerte müssen die Budgets einhalten. Fehlender SL, gekreuzter Stop, unbekanntes Risiko, unzureichende Margin und ungeklärte Brokeranfragen verhindern neue Einstiege.

Standardmäßig schließt der EA nur eigenes Symbol mit MagicBase+1 bis MagicBase+3. Fremde Trades werden gemessen, aber nicht geschlossen; sie können weiter Grenzen verletzen. LiquidateWholeAccount=true erlaubt ausdrücklich die Schließung aller Kontopositionen und Löschung aller Pending Orders. Diese Option bleibt false. Das Testprofil sollte auf einem Konto ohne andere Strategien laufen.

## Neustart und Ausführung

AllowLiveTrading=false sperrt neue Einstiege auf normalen Charts. Schutz und Ausstiege bestehender eigener Positionen bleiben aktiv, wenn MT5/Broker Handelsaktionen erlauben. Kein Chart wurde aktiviert und AutoTrading nicht eingeschaltet. Der Guard ist auf normalen Charts nicht deaktivierbar.

Timer und Ticks prüfen zuerst den Kontoschutz. Tageslocks bleiben bis zum verifizierten neuen Tag bestehen; Gesamtlocks bleiben dauerhaft. Terminal-Globalvariablen und kontobezogene Dateien im MT5-Common-Verzeichnis speichern den Zustand. Beschädigter oder widersprüchlicher Speicher sperrt Einstiege und wird nicht automatisch überschrieben. Ungeklärte Anfragen, Teilfüllungen und Zeitüberschreitungen bleiben reserviert, bis endgültige Orderhistorie und vollständiges tatsächliches Exposure nachgewiesen sind.

Pro Konto ist auf diesem Computer nur eine aktive Instanz zulässig, auch über mehrere Terminals. Die Sperre koordiniert keine anderen Computer/VPS.

Beim ersten Start mitten am Tag ist Tagesstart-Equity unbekannt. Dann schließt der EA eigene Positionen und wartet auf einen vollständig beobachteten, verbundenen Tageswechsel mit flachem Konto und unveränderter Balance. VerifiedDayStartBaseUSD darf nur mit einem tatsächlich verifizierten höheren Startwert gesetzt werden. Aktuelle Balance ist kein Ersatz für eine unbekannte Tagesbasis. Eine Reset-Änderung bei bestehendem Speicher sperrt statt still zurückzusetzen.

Kurslücken, Slippage, Verbindungs-/Stromausfälle und verspätete Ausführung können Reserven überschreiten. Ohne Terminal oder Handelsberechtigung kann der EA nicht schließen. Eine absolute Garantie, dass Equity niemals 9.100 USD erreicht, ist technisch nicht möglich.

## Tageswechsel, News und Feiertage

RiskResetHourServer=0 ist die Testannahme 00:00 MT5-Serverzeit. Die genaue Prime-Reset-Uhrzeit und Sommerzeit-Zuordnung sind in den geprüften offiziellen Prime-Quellen nicht veröffentlicht. Für das konkrete Konto muss der Reset bestätigt werden; Legacy-2-Step-Angaben wurden nicht übernommen.

Eigene Positionen werden zehn Minuten vor Reset geschlossen; bis zehn Minuten danach gibt es keine Einstiege. Nur im Tester kann ein flacher unveränderter Kontostand ohne externe Eingriffe über eine Quotierungslücke verifiziert werden. Eine unbekannte nichtflache Tagesbasis wird nie geschätzt.

Der Newsfilter sperrt Einstiege ±135 Sekunden um USD-High-Impact-News: zwei Minuten je Seite plus 15 Sekunden Reserve. Bestehende Positionen bleiben verwaltbar. USD-Feiertage sperren den ganzen Broker-Tag und schließen eigene Exposition. Ab HolidayEveCloseHourServer=19 gilt dasselbe am Tag vor einem USD-Feiertag und am Freitag nach einem Donnerstag-Feiertag. Der Cutoff lässt sich nur früher (0–19) setzen. Nachbartagsabdeckung ist zwingend. Das ist eine konservative allgemeine Kalenderregel, kein vollständiger Broker-Handelszeitenkalender.

Live-Daten werden ausschließlich bei vollständig flachem Konto ohne Pending Orders oder ungeklärte Anfrage vom MT5-Kalender aktualisiert, gewöhnlich im Abstand von 15 Sekunden. Der finale Zeitraum vor Reset wird dabei ausgespart, um die kontinuierliche Reset-Beobachtung zu erhalten. Bei vorhandenem Exposure verwenden Schutz und Einstiegsprüfung nur den lokalen Cache. Newsdaten dürfen für neue Einstiege höchstens 900 Sekunden alt sein; danach sind zusätzliche Einstiege gesperrt, bestehende Positionen weiterhin verwaltbar. Feiertagsdaten müssen den relevanten Tag und bei frühem Cutoff die nötigen Nachbartage abdecken. Verbindungsausfall invalidiert den Cache; Wiederverbindung allein gibt ihn nicht frei. Fehlende Feiertagsdaten schließen eigene Exposition. Kalendersperren löschen eigene Pending Orders.

Für historische Tests liegen zwei CSVs in MQL5/Files: 1.376 High-Impact-Werte und 31 USD-Feiertage aus dem offiziellen MT5-Kalender des Vergleichsservers ICMarketsEU-Demo. Abdeckung: 01.01.2024 bis 09.10.2026 exklusiv. Falscher Server, fehlende Dateien oder fehlende Abdeckung sperren Tester-Handel. Live wird der tatsächlich verbundene Broker-Kalender verwendet. Die separate Prüfung tatsächlicher Einstiege bestätigt Replay-Einhaltung, keine Übereinstimmung mit Blueberry-Kalender oder unangekündigten Ereignissen.

Die finalen 2025/2026-Läufe haben null unbekannte Baseline-Service-Beobachtungen und null ungeklärte Resets. Die Coverage-Zähler umfassen Ticks und Timer; sie messen keine unterschiedlichen Quotes oder verstrichene Zeit. Alte v1.20-Audits ohne Coverage-Zähler liefern diesen Nachweis nicht.

## Blueberry Prime

Die offiziellen Prime-Grenzen sind 4 % initialer Balance täglich und 10 % statisch insgesamt. Bei 10.000 USD sind das 400 USD täglich bzw. 9.000 USD Gesamtfloor; bereits das Erreichen verletzt die Regel. Das ausgelieferte Profil bleibt mit 350 USD täglich und 9.100 USD strenger. [Drawdown-Regeln](https://help.blueberryfunded.com/en/articles/12136586-what-are-the-drawdown-limits-on-a-prime-account)

Phase 1 verlangt 8 %, Phase 2 6 %. Veröffentlicht sind 80 % Gewinnanteil, ein 14-Tage-Zyklus und Hebel 1:30. Prime hat keine Consistency-Regel, Lotgrößenbeschränkung oder Obergrenze pro Trade-Idee. Für Käufe ab 17.08.2026 nennt die Übersicht drei aktive Tage pro Reward-Zyklus, davor fünf. Ein aktiver Tag erfordert mindestens 0,5 % abgeschlossenen Gewinn, bei 10.000 USD also 50 USD; offene Gewinne zählen nicht. Der EA erzwingt keine zusätzlichen Trades, um diese Anforderung zu erreichen. [Prime-Übersicht](https://help.blueberryfunded.com/en/articles/12136509-what-is-the-prime-challenge)

Neue Einstiege sind zwei Minuten vor und nach geplanten High-Impact-News verboten, Verwaltung und Ausstiege bleiben erlaubt. [Newsregel](https://help.blueberryfunded.com/en/articles/12140938-news-trading-policy-for-prime-challenge)

Blueberry erlaubt EAs nur unter den veröffentlichten Eigentums- und Strategiebedingungen und mit vorheriger Offenlegung/Zustimmung, auch während der Evaluation. Market-, geteilte, gemietete und beauftragte EAs sind ausgeschlossen. Der Besitz dieser Quelldateien allein weist die Zulässigkeit des Nachbaus nicht nach. **Dieses Paket ist nicht als Blueberry-Funded-konform freigegeben.** Vor dortigem Einsatz müssen Eigentum, Strategie, Zustimmung und Reset geklärt sein. [EA-Regel](https://help.blueberryfunded.com/en/articles/9550892-do-you-allow-bots-and-ea-expert-advisor-trading)
