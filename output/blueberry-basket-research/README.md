# Blueberry MT5 BasketGuard backtests — 2026-10-14

Isolated portable copy of the Blueberry MT5 terminal; the running/live terminal, positions, and original EA files were not changed. Symbol XAUUSD.pi, M15, 2026-01-01 to 2026-10-14, USD 10,000 initial deposit, 1:10 leverage, M1 OHLC simulation (MT5 `Model=1`). All variants used the last saved Blueberry tester settings, including 0.55% risk, prop protection, and Friday/weekend filters. The all-guards-off new EA reproduced the old EA's result exactly, validating the comparison. Reports and exact set/ini files are in this directory.

| Variant | Net profit USD | Gross loss USD | Max equity DD USD | Max equity DD % | Trades |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old EA / new EA guards off | 4,497.49 | -17,887.02 | 1,824.07 | 12.91 | 711 |
| Hard basket exit -150 USD | 140.81 | -22,459.02 | 2,529.60 | 20.15 | 894 |
| Hard basket exit -200 USD | 1,624.79 | -20,400.34 | 2,018.83 | 16.54 | 783 |
| Trend-break exit only | 1,348.65 | -24,108.09 | 2,443.42 | 18.86 | 1,800 |
| Pyramid profit lock only | 1,249.35 | -18,098.09 | 2,451.71 | 18.58 | 754 |
| Basket profit trail only | 2,104.44 | -18,917.56 | 1,747.87 | 13.56 | 913 |
| Pre-entry basket risk gate 120 USD | 1,438.10 | -6,724.89 | 712.41 | 6.08 | 304 |
| Pre-entry basket risk gate 200 USD | 1,517.64 | -13,563.49 | 1,122.76 | 9.23 | 560 |
| Pre-entry basket risk gate 260 USD | 1,469.70 | -15,980.71 | 1,481.16 | 12.09 | 625 |
| Maximum 2 concurrent positions | 1,745.89 | -12,673.09 | 2,088.81 | 16.03 | 473 |
| Maximum 1 concurrent position | 1,287.05 | -6,485.57 | 974.59 | 8.39 | 253 |
| Minimum 4 M15 bars between entries | 1,401.07 | -18,517.75 | 2,759.41 | 20.33 | 681 |
| Minimum 6 M15 bars between entries | 148.10 | -18,355.54 | 2,893.75 | 23.12 | 652 |

Conclusion: None of the tested interventions reduced equity drawdown while preserving net profit. The strict risk gate reduced drawdown substantially but also removed many profitable trades. Forced exits at -150/-200 USD increased re-entry churn and worsened both net profit and drawdown. Increasing the minimum spacing to 4 or 6 bars also worsened profit and drawdown. Keep the new protection options disabled in a live account until a strategy passes real-tick, spread/slippage, and out-of-sample forward tests. The optimized 2026 sample is in-sample only and is not a promise of future performance. No live EA deployment was made.

The user-recalled $5,000+ profit was not reproduced with the saved Blueberry tester profile; the exact baseline here is $4,497.49. Another settings file, date interval, or tick model may explain the difference.

## Set-Dateien für eigene Real-Tick- und Forward-Vergleiche

EA: `XAU_Titan_Pro_BasketGuard.ex5` (Version 7.20), Symbol `XAUUSD.pi`, M15, Startkapital 10.000 USD, Hebel 1:10. Die Sets liegen im Ordner `sets/`. Alle Sets nutzen 0,55 % Risiko und die zuletzt gespeicherten Blueberry-Handelszeit-/Prop-Einstellungen. Sie betreffen **nicht** den alten EA und öffnen im Strategietester keine Live-Positionen.

| Set | Zweck |
| --- | --- |
| `all-off.set` | Referenz: neuer EA mit allen neuen Basket-Guard-Modulen aus; nur als Einzeltest laden. |
| `gate-120.set`, `gate-200.set`, `gate-260.set` | Feste Obergrenze der prognostizierten Korb-SL-Summe; jeweils nur dieses Schutzmodul an. |
| `loss-150.set`, `loss-200.set` | Harter Ausstieg bei schwebendem Korbverlust; 2026-M1-OHLC bisher schlechter als Referenz. |
| `trend-only.set`, `lock-only.set`, `trail-only.set` | Jeweils nur Trendbruch, Gewinn-SL oder Korbgewinn-Trail aktiv; bisher ebenfalls keine überzeugende Verbesserung. |
| `spacing-4.set`, `spacing-6.set`, `max-1.set`, `max-2.set` | Weniger häufige bzw. weniger parallele Einstiege; bisher geringerer Gewinn. |
| `opt-riskgate.set` | Optimiert **nur** `InpBasketMaxRiskUSD` von 100 bis 300 USD in 20-USD-Schritten; Guard aktiv, sonstige neue Module aus. |
| `opt-spacing.set` | Optimiert **nur** `InpMinBarsBetweenEntries` von 2 bis 4 M15-Kerzen; neue Guard-Module aus. |

Für einen fairen Vergleich alle Varianten mit **identischem Zeitraum, Tick-Modell und Kostenannahmen** testen. Im MT5-Strategietester `Jeder Tick anhand realer Ticks` wählen; bei den zwei `opt-*.set`-Dateien die Optimierung/Forward-Aufteilung aktivieren, bei festen Sets einen normalen Einzeltest. Zuerst `all-off.set` auf derselben Periode laufen lassen, danach die Varianten und insbesondere Nettogewinn, maximalen Equity-Drawdown, Anzahl Trades und Gewinn/Verlust-Verteilung vergleichen. Ein echter Live-Forward-Test erfordert noch nicht gesehene künftige Kurse; historische Forward-Aufteilung ist nur ein zeitlich getrennter Rücktest. Da die aggregierten 2026-Ergebnisse hier bereits angesehen wurden, ist 2026 für unsere Variantenauswahl nicht vollständig unberührt.

Die zwei neuen `opt-*.set`-Dateien wurden auf vollständige Übereinstimmung mit allen 65 EA-Inputs und genau **eine** aktive Optimierungsvariable geprüft. Sie wurden nicht real-tick-backgetestet. Der isolierte Real-Tick-Tester startete mangels synchronisierter Blueberry-Verbindung nicht; daraus gibt es ausdrücklich kein Performance-Ergebnis.
