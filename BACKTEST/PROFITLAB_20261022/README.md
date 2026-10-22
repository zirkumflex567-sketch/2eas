# ProfitLab 7.21 — Forschungsbranch (2026-10-22)

**Status: 17 experimentelle .set-Profile, Quellcode-Codeprüfung ohne MetaEditor/MT5-Kompilierung, KEINE neuen MT5-Backtests durchgeführt.** Die Rendite ist nicht nachgewiesen. `main` ist unverändert.

## EA

Datei im Repository-Stamm: `XAU_Titan_Pro_BasketGuard_ProfitLab_v721.mq5` (bewahrt bestehende ChartStudioEvidenceSpool.mqh-Einbindung).
**Zum Testen die neue .mq5 mit MetaEditor kompilieren und die daraus entstehende .ex5 testen — NICHT den alten Titan oder die alte BasketGuard-.ex5!**
Bei gleichzeitigem Live-Betrieb mit v7.20 **nicht** dieselbe Magic verwenden; diese .set-Dateien verwenden fuer historische Vergleichbarkeit bewusst die Referenz-Magic 881142.

## Empirische Grundlage und Unterschiede

- `analysis_summary.csv`: 47 aufgelistete Konfigurationen (separater Abschlussmarker nennt 48), nur **6 eindeutige Ergebnisgruppen**. Original-Referenz: **+5.367,51 USD, PF 1,30, Equity-DD 12,03 %, 716 Trades**.
- Drei Konfigurationen mit `SL_CAP_10000/12000/13500`: **+5.376,54 USD**, PF 1,30, Equity-DD 12,02 % (Gewinnplus nur +9,03 USD; keine belastbare Verbesserung).
- Separater `ReportTester-5120620.xlsx`, XAUUSD.pi M15, 2026-01-01 bis 2026-10-21, `InpRiskPercent=0.55`, alle Basket- und Anti-Trap-Filter deaktiviert: **+3.947,63 USD, PF 1,210155, Equity-DD 12,91 %, 733 Trades**. Dieser Report ist kein Nachweis fuer die andere Referenz.
- Die Positionen des Excel-Reports wurden mittels FIFO-Volumen rekonstruiert und auf den **exakten Report-Gesamtertrag von 3.947,63 USD** reconciliert. Stunden-/Monatszuordnung ist nur Naeherung, da der Export keine explizite Position-ID enthaelt. Die starke Schwankung nach Marktphase ist ein **Hypothesengenerator**, kein Nachweis fuer Zeit-/Monatsfilter.
- BTCUSD.pi_M5/M15-Kursdateien sind nicht XAUUSD-Kursdaten und wurden **nicht** als Gold-Historie genutzt.

## Neu in v7.21: einzeln zuschaltbare Hypothesen

1. `InpPLUseTrendSlope`: Schlusskurs-basiert berechnete EMA50-Differenz ueber N abgeschlossene M15-Bars, skaliert mit ATR. Filtert schwache/gegenlaeufige Trends.
2. `InpPLUseATRRegime`: ATR der letzten geschlossenen Kerze im Verhaeltnis zum Mittel der VORANGEGANGENEN ATR-Bars (ohne aktuelle Kerze im Referenzmittel). Filtert extremes Regime.
3. `InpPLOnlyAddToProfit`: Adds nur bei bereits profitablen, gleichgerichteten Positionen. Erstorder bleibt unveraendert.
4. `InpPLRequirePyramidProgress`: Adds erst nach mindestens X ATR Kursfortschritt zur zuletzt eroeffneten Position.
5. `InpPLUseSpreadATR`: Spread-Obergrenze in Anteil der M15-ATR, auch direkt vor Order-Sendung erneut geprueft.

Alle neuen Schalter sind in Profil 00 explizit aus. Die Hash-Berechnung der bestehenden Evidence-Integration enthaelt die 13 neuen Inputs.

## Vorgehen — kontrollierter A/B-Test

1. .mq5 nach `MQL5/Experts` kopieren, ChartStudioEvidenceSpool.mqh liegt daneben unter `MQL5/Experts`; MetaEditor kompilieren. Keinen alten .ex5 auswaehlen.
2. MT5 Strategy Tester: **XAUUSD.pi / M15**, gleiche Historie **2026-01-01 bis 2026-10-21**, **echte Ticks**, gleiche Brokerdaten/Spread/Kommission, 10.000 USD, **1:10**, gleiche Ausfuehrungs-Einstellungen.
3. Zuerst Profil `00_CONTROL_V720_EQUIVALENT.set` laufen lassen. **Nur wenn** es die gewaehlte Referenz repliziert, duerfen die anderen gegen dieses Profil verglichen werden. Verschiedene Laufzeit, Testdaten, Build, Source oder Filter koennen Abweichungen erklaeren.
4. 01–06 zuerst **einzeln** testen; 07–09 und 16 erst im Anschluss. 10–15 sind gezielte Kontrollen bekannter oder bestehender Exit-/Positionsparameter.
5. Vergleich: Netto-Profit, Equity-DD absolut/%; PF, Trades, mittlerer Gewinn/Verlust, Erholungsfaktor, Jahresteile und echte Tick-Qualitaet. Kaum Trades oder Profitgewinn durch groesseren Drawdown ist keine Verbesserung.
6. **Unabhaengiger Forward-Test**: Start mit 2026-01 bis 2026-06 (In-Sample), pruefe unveraendert Jul–Okt (Out-of-Sample). Danach neuer Zeitraum oder Symbol-/Broker-Sensitivitaet, Parameter NICHT anhand OOS nachoptimieren.

Falls die v7.21-Control von v7.20 abweicht, Fehler zuerst lokalisieren, nicht die Abweichung als Vorteil bewerten.

## Presets (vollstaendiges Reset je Datei, nicht kumulativ)

| Profil | Isolierter Test |
|---|---|
| `00_CONTROL_V720_EQUIVALENT` | Keine experimentelle Filterung |
| `01_EMA_SLOPE_LIGHT` | UseTrendSlope=true, MinSlopeATR=0.08 |
| `02_EMA_SLOPE_STRICT` | UseTrendSlope=true, MinSlopeATR=0.20 |
| `03_ATR_REGIME_WIDE` | UseATRRegime=true, MinATRRatio=0.70, MaxATRRatio=2.20 |
| `04_ATR_REGIME_NARROW` | UseATRRegime=true, MinATRRatio=0.85, MaxATRRatio=1.65 |
| `05_PYRAMID_ONLY_PROFIT` | OnlyAddToProfit=true, MinBasketAddProfit=10.0 |
| `06_PYRAMID_PROGRESS` | RequirePyramidProgress=true, PyramidProgressATR=0.35 |
| `07_SLOPE_PLUS_PROFIT_ADDS` | UseTrendSlope=true, MinSlopeATR=0.08, OnlyAddToProfit=true, MinBasketAddProfit=10.0 |
| `08_SLOPE_PLUS_ATR` | UseTrendSlope=true, MinSlopeATR=0.08, UseATRRegime=true, MinATRRatio=0.75, MaxATRRatio=2.00 |
| `09_SLOPE_ATR_PROFIT_ADDS` | UseTrendSlope=true, MinSlopeATR=0.08, UseATRRegime=true, MinATRRatio=0.75, MaxATRRatio=2.00, OnlyAddToProfit=true |
| `10_ENTRY_SPACING_3` | MinBarsBetweenEntries=3 |
| `11_MAX_POSITIONS_2` | MaxOpenPositions=2 |
| `12_EXIT_THRESHOLD_18` | MinProfitUSDForExit=18.0 |
| `13_EXIT_THRESHOLD_40` | MinProfitUSDForExit=40.0 |
| `14_MAX_SL_10000` | MaxSLPoints=10000 |
| `15_SPREAD_ATR_GATE` | UseSpreadATR=true, MaxSpreadATR=0.08 |
| `16_SLOPE_ATR_PROGRESS_COMBO` | UseTrendSlope=true, MinSlopeATR=0.08, UseATRRegime=true, MinATRRatio=0.75, MaxATRRatio=2.00, RequirePyramidProgress=true, PyramidProgressATR=0.35 |

### Sicherheit

Aus der Historie allein kann kein Live-Gewinn abgeleitet werden. Margin-/Equity-Risiken, Broker-Stop-Level, Slippage und Prop-Firm-DD-Regeln gelten unveraendert. Vor Livebetrieb MetaEditor-Kompilierung, Ticks-Backtest, Forward-Test und Magic-Trennung pruefen.
