# GoldM15 v1.22

**Neu:** `SignalTimeframe` ganz oben übernimmt mit `PERIOD_CURRENT` (0) den Zeitraum des Strategietesters/Charts. RSI, Swing-Stops, Momentum und Signaltakt folgen gemeinsam dieser Auswahl. Alle bisherigen 70 Parameter und Kontosperren bleiben gleich. Für die bisherige Strategie M15 (15) wählen. Die neue Version wird separat unter `GoldM15_v122` installiert; laufende Charts werden nicht umgestellt. Anleitung und geprüfter Vergleich: [TIMEFRAME.md](TIMEFRAME.md).

Die folgenden Gewinnnachweise und Verteilangaben dokumentieren die historische **v1.21 mit M15-Signalen**. v1.22 mit festem M15 reproduziert den vollständigen 2026-Lauf exakt (+5.421,79 USD, 3.186 Trades). Für automatische M5-/H1-Signale gelten andere Ergebnisse. Die neue Verteilung umfasst 22 Datenorte von 14 Installationen; Details stehen in TIMEFRAME.md.

Die Gewinnvariante behält die verlangten Sperren bei: **9.100 USD Kontofloor und maximal 350 USD Tagesverlust** auf einem Konto mit 10.000 USD Initialbalance. Der native MT5-Vergleich erreicht **+5.421,79 USD in 2026**. Die Originalsignale des Market-EAs sind nicht vollständig identifiziert; dies ist eine eigenständige Gewinnannäherung.

| Endgültige Standardwerte | 2025 | 2026 bis 07.10. exklusiv |
|---|---:|---:|
| Nettogewinn nach Kosten | +1.106,66 USD | +5.421,79 USD |
| Trades | 3.669 | 3.186 |
| Trefferquote | 51,95 % | 54,90 % |
| Profitfaktor | 1,06 | 1,25 |
| Niedrigste Equity | 9.764,37 USD | 9.583,13 USD |
| Niedrigste Balance | 9.788,26 USD | 9.607,84 USD |
| Größter Tagesverlust inkl. Floating | 254,97 USD | 266,27 USD |
| Beobachtete Nutzergrenzverletzungen | 0 | 0 |
| Unbekannte Tagesbasis / ungeklärte Resets | 0 / 0 | 0 / 0 |

Bedingungen: XAUUSD, 0,01 Lot je Einstieg, Hedging, 10.000 USD, Hebel 1:10, ICMarketsEU-Demo, Tester M5 mit internen M15-Signalen, M1 OHLC und 117 ms Verzögerung. Das sind generierte Ticks, keine realen Ticks und kein Blueberry-Kontotest. Der maximale Equity-Rückgang über den ganzen Zeitraum beträgt 1.070,94 USD (2025) bzw. 748,10 USD (2026); das ist eine andere Größe als täglicher Verlust. Die drei Slots sind korreliert.

2024 ist gemäß Nutzerauftrag kein Auswahlgate und wurde mit dieser finalen Version nicht erneut geprüft. Alle betrachteten Jahre sind Entwicklungsdaten; es gibt keinen unberührten Holdout. MQ5, SET und alle 70 tatsächlich angewendeten Eingaben wurden abgeglichen. Ein weiterer nativer 2026-Lauf mit dem vollständigen SET reproduziert den Standardlauf exakt.

## Installation

1. EX5, MQ5, SET und vier GoldM15-Header nach MQL5/Experts kopieren.
2. GoldM15_USD_HighImpact.csv und GoldM15_USD_Holidays.csv nach MQL5/Files kopieren. Das SET zusätzlich unter MQL5/Profiles/Tester ablegen.
3. Navigator aktualisieren; im Strategietester GoldM15_Reconstruction.set laden. Alle Schutz- und Kalenderfilter eingeschaltet lassen.

Die Verteilung aktualisiert dieselben **18 Datenorte von zwölf Installationen** wie zuvor, einschließlich des bisherigen Forschungsterminals. Vorherige Dateien sind gesichert; das Manifest dokumentiert 180 geprüfte Zieldateien. Die zusätzliche .mt5-lab dient ausschließlich isolierten Tests. Charts, laufende Nutzerterminals und AutoTrading wurden nicht aktiviert oder neu gestartet. Bereits geladene EAs übernehmen die neue EX5 erst beim Neuladen.

AllowLiveTrading=false sperrt neue Einstiege auf normalen Charts. Schutz und Ausstiege vorhandener eigener Positionen bleiben aktiv, sofern MT5 Handelsaktionen erlaubt. Live-Kalender und Reset-Einstellung müssen für das konkrete Konto geprüft sein. Das Paket ist nicht als Blueberry-Funded-konform freigegeben; Details stehen in [AUTOTRADING.md](AUTOTRADING.md).

## Schutz und Nachweise

Der EA reagiert mit Reserve bei 9.200 USD bzw. Tagesbasis minus 275 USD. Einzelnes Stoprisiko ist auf 75 USD und gesamtes Konto-Stoprisiko auf 275 USD begrenzt. Getrennte Balance-/Equity-Projektionen berücksichtigen alle Positionen und Pending Orders, negative Swaps und 2 USD zusätzliche Reserve je Position/Order. Standardmäßig werden nur eigene Symbol-/Magic-Trades geschlossen. Fremde Trades werden gemessen, können aber ohne kontoweite Schließberechtigung weiterhin Grenzen gefährden.

USD-Feiertage sperren den ganzen Broker-Tag. Am Tag vor einem USD-Feiertag sowie am Freitag nach einem Donnerstag-Feiertag werden eigene Positionen ab 19:00 Serverzeit geschlossen. Diese generische Regel schützt vor den beobachteten frühen Handelsschlüssen; sie ist kein vollständiger Broker-Handelszeitenkalender. Fehlende Tagesbasis, Kalender-/Speicherfehler und ungeklärte Anfragen sperren Einstiege. Locks bleiben über Neustarts erhalten.

Kurslücken, Slippage, Ausfälle oder fehlende Handelsberechtigung können trotz Reserve eine Grenze überschreiten. Die Tabellen belegen das beobachtete Verhalten unter Testbedingungen, keine zukünftige Untergrenzengarantie.

- [Finaler Nachweis](analysis/autotrading/final_result.json): aktuelle EX5-Hashes, Eingaben und Prüfstatus.
- [2026 MT5-Bericht](analysis/profit_search/mt5/final_defaults_v121_2026.htm) und [2025 MT5-Bericht](analysis/profit_search/mt5/final_defaults_v121_2025.htm).
- [Strategie und Auswahl](STRATEGIE_ANALYSE.md), [öffentliche Paketprüfsummen](analysis/deployment/package_manifest_v121.json). Das vollständige Verteilmanifest mit lokalen Zielpfaden liegt nur im Arbeitsordner unter analysis/deployment/deployment_manifest.json.
- [Native Prüfungen](analysis/autotrading/native_checks.json): 172 bestanden. [Python-Prüfungen](analysis/autotrading/python_checks_v121.log): 111 bestanden. Compiler: null Fehler, null Warnungen. Unabhängige Spezifikations- und Codeprüfung ohne verbleibende P1/P2-Befunde.

Die Runner verwenden .mt5-lab mit Prozesssperre. Ein reconnectendes Dashboard wurde für die autorisierten Testbatches vorübergehend pausiert und anschließend fortgesetzt. Private Terminalkonfigurationen werden nicht weitergegeben; das ZIP hat eine explizite Dateiliste. m5.xlsx und XAUUSD 5 minute.ex5 sind unverändert. Frühere v1.20-Audits ohne Baseline-Coverage-Zähler gelten nicht als vollständiger Nachweis der Tagesüberwachung.
