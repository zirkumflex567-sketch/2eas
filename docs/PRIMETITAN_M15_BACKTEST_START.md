# PrimeTitan M15 – separater XAUUSD-EA: Pull- und Backtest-Anleitung

**Original XAU_Titan_Pro.mq5 bleibt unverändert.** Neuer Expert: XAU_PrimeTitan_Challenge_M15.mq5, eigene Magic 882720, separate Risikodatei TitanChallengeGuard.mqh.

## Schnellstart

1. GitHub: Nach Merge auf main im lokalen Projektordner 'git pull origin main' ausführen. Alternativ vor dem Merge: den Branch feature/titan-prime-risk-profit-20261013 auschecken.
2. XAU_PrimeTitan_Challenge_M15.mq5 UND TitanChallengeGuard.mqh in denselben MetaTrader5/MQL5/Experts/PrimeTitan-Ordner kopieren. **Nicht XAU_Titan_Pro.mq5 überschreiben!**
3. MetaEditor öffnen, XAU_PrimeTitan_Challenge_M15.mq5 mit F7 kompilieren, auf 0 Fehler prüfen. Erst dann wird die EX5 angelegt. TitanGuardSelfTest.mq5 ist ein zusätzlicher separater MQL5-Selbsttest, der keine Trades eröffnet.
4. MT5-Strategietester Strg+R: Expert XAU_PrimeTitan_Challenge_M15, Symbol XAUUSD (Broker-Suffix erlaubt), **Zeitrahmen M15 = 15 Minuten**, USD-Testkonto **10.000 USD**, **Hebel 1:10**, Hedging-Modell. Modus **Every tick based on real ticks**.
5. Historische Testperiode beispielsweise **01.01.2026–13.10.2026** (Vergleich zum langen Fünfer). Zusätzlich vorangehende Marktphasen 2024/2025 prüfen, sofern echte Tickdaten des Brokers existieren.
6. Unter Eingabeparameter eine der beiden .set-Dateien laden:
   - presets/PrimeTitan_M15_Guarded_Baseline.set – alte Titan-Entries mit Challenge-Guard.
   - presets/PrimeTitan_M15_ProfitResearch.set – dieselben Verlustlimits, experimentelle Volumen-/Trend-/ATR-Verbesserungen.
7. **Handelsfenster:** 01:00–23:45 Uhr **Broker-Serverzeit** inklusive Asien; chart time frame ist **M15**.
8. **Wichtig:** die Server-Uhrzeit entsprechend dem offiziellen **17:00 Uhr New York** Tagesreset bestimmen und die beiden Inputs InpDailyResetHourServer/InpDailyResetMinuteServer setzen. Default 00:00 Brokerzeit ist nur ein Platzhalter. Der EA sperrt bei unbekannter Tagesreferenz bewusst. Bei USA-/Europa-DST-Verschiebungen kann sich die Serverzeit ändern. Nicht zum Erzwingen schöner Backtest-Ergebnisse einfach beliebige Reset-Zeiten setzen.
9. Backtest-Ergebnisse speichern: Nettoprofit, Monatsrenditen, **min. Tick-Equity**, Tagesverluste relativ zur korrrekten Reset-Referenz, Margin/Exposure, Tages- und Hard-Locks sowie Tradingkosten/Slippage.

## Interne Challenge-Vorgaben

- Original-Account 10.000 USD, **statische Untergrenze 9.200 USD** (kein High-Watermark-Trailing).
- **350 USD festes Tagesverlustbudget** vom höheren Balance/Equity-Wert zum offiziellen Reset. Profitwachstum erhöht den Tagesverlustbetrag NICHT.
- Schutzpuffer **35 USD** vor interner Grenze; kein Garant bei Gaps und schlechter Ausführung.
- Max. modellierter initialer SL-Verlust **50 USD je Trade, 150 USD je Basket**, Kostenfaktor mindestens 1,25, maximale synthetische Margin auf 1:10-Basis und Broker-Margin-Prüfung.
- 3 unabhängige XAUUSD-Positionen nur auf einem **Hedging-Konto**. Ein Notstopp kann **alle Kontopositionen** schließen.
- Livebetrieb erfordert manuelle Freigabe InpServerResetConfirmed=true nach bestätigtem Broker-Tagesreset. Default false blockiert live.

## Grenzen / kein Echtgeld-Release

Das Projekt hat bislang keinen MetaEditor-Kompilierungsnachweis und **keinen MT5-Real-Tick-Backtest des neu erzeugten EAs**. Die GitHub-CI-Prüfungen testen ausschließlich Schutzmathematik und statische Quellstruktur.

MT5-Strategietester reproduziert den internen Wirtschaftskalender nicht zuverlässig. Das Forschungsprofil setzt InpTesterSkipCalendar=true; somit ist ein erfolgreicher Tester-Run **kein** Beleg für die News-Compliance. Eine historische High-Impact-Event-Replay-Datei oder ein gesonderter Test ist nötig.

Die optionalen Gewinnfilter sind experimentell, 15–20 % monatlich sind **nicht nachgewiesen**.

Weitere Details in docs/TITAN_PRIME_10K_GUARD_RESEARCH.md.
