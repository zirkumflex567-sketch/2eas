# BACKTEST — BasketGuard v7.20: profitbewusstes Drawdown-Research

**Status: Hypothesen / nicht ausgeführt. Keine Set-Datei ist bereits als besser nachgewiesen.**

Dies ist eine **neue, vollständig isolierte** Versuchsreihe für `XAU_Titan_Pro_BasketGuard.ex5` v7.20, nicht für das Original-`XAU_Titan_Pro.ex5`. Alle 40 Sets enthalten **exakt 65 unveränderte oder gezielt veränderte EA-Input-Namen** aus dem tatsächlichen Quellcode; keine spekulativen MQL5-Parameter. Keine EA-/EX5-Änderung. Keine Live-Deployments.

## Sofortige Erkenntnis aus den 13 hochgeladenen Berichten (2026)

| Variante | Netto USD | Max. Equity-DD USD | Equity-DD | Trades |
|---|---:|---:|---:|---:|
| Alle neuen Guards aus | **+4.472,07** | 1.823,40 | 12,91 % | 711 |
| Risk-Gate 120 | +1.419,35 | 711,27 | 6,07 % | 304 |
| Risk-Gate 200 | +1.490,14 | 1.122,47 | 9,23 % | 560 |
| Risk-Gate 260 | +1.443,53 | 1.480,55 | 12,08 % | 625 |
| Basket-Notaus -150 | +114,65 | 2.456,58 | 19,57 % | 894 |
| Basket-Notaus -200 | +1.599,19 | 2.018,10 | 16,53 % | 783 |
| Trendbruch-Exit allein | +1.353,65 | 2.443,01 | 18,85 % | 1.800 |
| Pyramid-Profitlock allein | +1.223,84 | 2.448,49 | 18,55 % | 754 |
| Korb-Profittrail allein | +2.110,98 | 1.744,71 | 13,53 % | 913 |
| Max 1 Position | +1.278,60 | 973,98 | 8,39 % | 253 |
| Max 2 Positionen | +1.729,14 | 2.087,06 | 16,01 % | 473 |
| Spacing 4 | +1.375,52 | 2.757,53 | 20,31 % | 681 |
| Spacing 6 | +122,70 | 2.890,44 | 23,09 % | 652 |

**Quelle:** 13 vom Nutzer bereitgestellte native MT5-XLSX-Strategietester-Exporte, Reportstand 2026.01.01 bis 2026.10.13, XAUUSD.pi / M15 / 10.000 USD / 1:10. Die vorherigen Forschungsreports im Repo weichen um einige Dollar ab; in diesem Ordner gelten die **hochgeladenen XLSX** als Datengrundlage. Dieselben 2026-Kurse sind **bereits gesehen** und deshalb kein unabhängiger OOS-Nachweis.

### Risikodiagnose statt Parameterraten

- Die Referenz erwirtschaftete im Januar **+3.392,35 USD** und in den restlichen Monaten zusammen nur **+1.079,72 USD**. Frühe Gewinne dominieren den Gesamteindruck.
- 200 mit `sl ...` kommentierte Schließungen summierten sich auf ungefähr **−15.719 USD**, die übrigen Exit-Schließungen zusammen auf ungefähr +20.191 USD. Dies ist eine Deal-Kommentar-Auswertung, **kein kausales Gegenfaktum**.
- **26.03.2026:** −498,28 USD realisiert, davon drei einzelne Stops je ungefähr −152,16 USD. **08.04.2026:** −488,29 USD, davon drei Stops je −149,07 USD. Die Verluste häufen sich in korrelierten Basket-Ausgängen.
- Zu harte Basket-Schließung produziert mehr Wieder-Einstiege und schlechten Gewinn/Verlust-Ausgleich. Selbst bei reduziertem DD kann ein enger Gate den entscheidenden Profitcluster blockieren.
- Das Gate prüft den geschätzten Korbverlust am SL **vor** dem Trade; `InpBasketLossExit`/Trendbruch/Trail schließen dagegen laufende Trades. Die Instrumente sind nicht gleichwertig.
- Ein niedrigeres `InpRiskPercent` garantiert bei Broker-Mindestlot **keine** proportionale Risikoreduktion. Ein engeres `InpMaxSLPoints` kann Stop-outs erhöhen.
- `InpUsePyramidProfitLock` und `InpUseBreakEven` können Gewinner früh ausstoppen. Late-Varianten sind Experimente, keine validierten Verbesserungen.
- **Kein Nachweis für Prop-Firm-Konformität:** Der größte Peak-to-Trough-Equity-DD ist nicht identisch mit einer statischen 10-%-Floor-Regel; historische Tages-Equity- und Broker-Reset-Events werden benötigt.

Die Berichte wurden mit MT5 **M1-OHLC (Model=1)** erzeugt. Report-`History Quality 100%` ist **kein** Nachweis für Real-Tick-Modell, Spread- oder Slippage-Treue. **Neue Favoriten nur aus separaten Broker-Real-Tick-Tests und nicht gesehenen Zeitfenstern ableiten.**

## Testverfahren — nacheinander, nicht alle blind optimieren

1. Öffne ein **eigenes** MT5-Strategietester-/Demo-Terminal, Experte `XAU_Titan_Pro_BasketGuard.ex5`, Symbol `XAUUSD.pi`, M15, USD 10.000, 1:10, unveränderte Kosten. Set-Dateien unter `sets/` einzeln laden.
2. Erst `00_REF_ALL_OFF.set` als identische Real-Tick-Referenz im gewählten Zeitfenster. Eine andere Baseline macht den gesamten Vergleich ungültig.
3. **Phase 1:** 01–09. Prüfe Gate-Limits 300–650 und Stop-Distanzen separat. Ziel: große Stop-Cluster abschwächen, ohne profitable Körbe komplett zu verhindern.
4. **Phase 2:** 10–18. Teste Swing-Lookback und weiche Entry-Filter einzeln. Keinen Exit gleichzeitig verändern.
5. **Phase 3:** 19–27. Später BE/Pyramidenlock/Trail sowie dynamischen Runner-Exit nur separat testen.
6. **Phase 4:** 28–39 nur nach Sichtung der Einzeltests. Alle Kombinationen sind **vorab festgelegt**, nicht bereits als erfolgreich getestet. Siehe `manifest.json` für Hypothese und vollständige Deltas.
7. Halte Testmodell, Zeitfenster, Brokeraccount, Kosten und Leverage für **jeden** Vergleich identisch; im MT5-Auswahltest `Jeder Tick anhand realer Ticks` verwenden.
8. Trage Ergebnisse in `RESULTS_TEMPLATE.csv` ein; teste die besten Kandidaten in einem **anderen historischen Regime** und später vorwärts auf Demo. 2026-Daten sind für unsere Auswahl schon in-sample.

**Vorläufiges Screening** (kein automatischer Trade-Freigabewert): gleiche Testbedingungen, mindestens **80 %** des Real-Tick-Referenzprofits und maximal **80 %** ihres Equity-Drawdowns, ausreichende Tradezahl, robuste Monatsverteilung und keine Regelverletzung im Prop-Eval. Wenn kein Kandidat beide Ziele erfüllt: *kein Gewinner*; kein Verbiegen der Grenzwerte im Nachhinein.

**Nicht ändern:** `InpUseBasketLossExit=false`, `InpUseTrendInvalidationExit=false` und `InpGuardCooldownBars=0`, außer bei ausdrücklich ausgewiesenen späten Basket-Trails. Die bisherigen Kurzschluss-Exit-Tests waren schlechter und dienen als Vergleich, nicht als Vorbild.

### Warum nicht noch mehr wahllose Kombinationen?

40 vorab definierte, gestufte Kandidaten reduzieren die Zahl irrelevanter Vergleiche gegenüber einem riesigen 65-dimensionalen Optimierungsraum. Trotzdem entstehen durch viele Tests False Positives. Ein zufällig gutes Set auf bekannten Kursen ist **keine** robuste Strategie. Falls die folgenden Varianten scheitern, ist eher eine Änderung der Entry-/Pyramiding-Logik erforderlich als ein weiteres Set mit kosmetischen Zahlen.

## Vollständige Testreihenfolge

| Nr. | Gruppe | Datei | Änderung gegenüber Referenz |
|---:|---|---|---|
| 00 | reference | `sets/00_REF_ALL_OFF.set` | Exakte unveränderte Referenz |
| 01 | risk | `sets/01_GATE_300.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=300 |
| 02 | risk | `sets/02_GATE_340.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=340 |
| 03 | risk | `sets/03_GATE_380.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=380 |
| 04 | risk | `sets/04_GATE_440.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=440 |
| 05 | risk | `sets/05_GATE_500.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500 |
| 06 | risk | `sets/06_GATE_650.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=650 |
| 07 | risk | `sets/07_SL_CAP_10000.set` | MaxSLPoints=10000 |
| 08 | risk | `sets/08_SL_CAP_12000.set` | MaxSLPoints=12000 |
| 09 | risk | `sets/09_SL_CAP_13500.set` | MaxSLPoints=13500 |
| 10 | entries | `sets/10_SWING_LOOKBACK_32.set` | SwingBarsLookback=32 |
| 11 | entries | `sets/11_SWING_LOOKBACK_72.set` | SwingBarsLookback=72 |
| 12 | entries | `sets/12_EXTENSION_2p2.set` | UseOverextensionFilter=true, MaxATRExtension=2.2 |
| 13 | entries | `sets/13_EXTENSION_2p8.set` | UseOverextensionFilter=true, MaxATRExtension=2.8 |
| 14 | entries | `sets/14_EXTENSION_3p5.set` | UseOverextensionFilter=true, MaxATRExtension=3.5 |
| 15 | entries | `sets/15_CLIMAX_4.set` | UseConsecutiveRunFilter=true, MaxConsecutiveBars=4 |
| 16 | entries | `sets/16_CLIMAX_5.set` | UseConsecutiveRunFilter=true, MaxConsecutiveBars=5 |
| 17 | entries | `sets/17_SR_ROOM_200.set` | UseSRDistanceFilter=true, MinSRRoomPoints=200 |
| 18 | entries | `sets/18_SR_ROOM_400.set` | UseSRDistanceFilter=true, MinSRRoomPoints=400 |
| 19 | exits | `sets/19_LATE_BE_80_5.set` | UseBreakEven=true, BETriggerUSD=80, BELockUSD=5 |
| 20 | exits | `sets/20_LATE_BE_120_10.set` | UseBreakEven=true, BETriggerUSD=120, BELockUSD=10 |
| 21 | exits | `sets/21_LATE_PYRAMID_90_10.set` | UsePyramidProfitLock=true, PyramidLockTriggerUSD=90, PyramidLockProfitUSD=10 |
| 22 | exits | `sets/22_LATE_PYRAMID_130_15.set` | UsePyramidProfitLock=true, PyramidLockTriggerUSD=130, PyramidLockProfitUSD=15 |
| 23 | exits | `sets/23_LATE_TRAIL_180_120.set` | UseBasketProfitTrail=true, BasketTrailStartUSD=180, BasketTrailGivebackUSD=120, GuardCooldownBars=2 |
| 24 | exits | `sets/24_LATE_TRAIL_280_180.set` | UseBasketProfitTrail=true, BasketTrailStartUSD=280, BasketTrailGivebackUSD=180, GuardCooldownBars=2 |
| 25 | exits | `sets/25_RUNNER_EXIT_20.set` | MinProfitUSDForExit=20 |
| 26 | exits | `sets/26_RUNNER_EXIT_40.set` | MinProfitUSDForExit=40 |
| 27 | exits | `sets/27_RISK_PCT_0p50.set` | RiskPercent=0.5 |
| 28 | combinations | `sets/28_COMBO_GATE440_SL12000.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=440, MaxSLPoints=12000 |
| 29 | combinations | `sets/29_COMBO_GATE500_SL12000.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, MaxSLPoints=12000 |
| 30 | combinations | `sets/30_COMBO_GATE440_EXT2p8.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=440, UseOverextensionFilter=true, MaxATRExtension=2.8 |
| 31 | combinations | `sets/31_COMBO_GATE500_EXT2p8.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, UseOverextensionFilter=true, MaxATRExtension=2.8 |
| 32 | combinations | `sets/32_COMBO_SL12000_EXT2p8.set` | MaxSLPoints=12000, UseOverextensionFilter=true, MaxATRExtension=2.8 |
| 33 | combinations | `sets/33_COMBO_GATE500_LATE_BE120.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, UseBreakEven=true, BETriggerUSD=120, BELockUSD=10 |
| 34 | combinations | `sets/34_COMBO_GATE500_LATE_TRAIL280.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, UseBasketProfitTrail=true, BasketTrailStartUSD=280, BasketTrailGivebackUSD=180, GuardCooldownBars=2 |
| 35 | combinations | `sets/35_COMBO_GATE440_RUNNER20.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=440, MinProfitUSDForExit=20 |
| 36 | combinations | `sets/36_COMBO_GATE500_SL12000_EXT2p8.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, MaxSLPoints=12000, UseOverextensionFilter=true, MaxATRExtension=2.8 |
| 37 | combinations | `sets/37_COMBO_GATE650_SL10000.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=650, MaxSLPoints=10000 |
| 38 | combinations | `sets/38_COMBO_GATE440_CLIMAX4.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=440, UseConsecutiveRunFilter=true, MaxConsecutiveBars=4 |
| 39 | combinations | `sets/39_COMBO_GATE500_SR200.set` | UseBasketRiskGate=true, BasketMaxRiskUSD=500, UseSRDistanceFilter=true, MinSRRoomPoints=200 |

## Validierung und Rückmeldungen

```powershell
python BACKTEST/validate_sets.py
```

Danach `RESULTS_TEMPLATE.csv` ausfüllen und die individuellen MT5-Reports (inklusive Deals und Equity-Kurve) lokal aufbewahren. Hier liegen **nur Setfiles, die Manifest-/Vergleichsvorlage und Analysedokumentation**, keine erfundenen Backtestergebnisse.