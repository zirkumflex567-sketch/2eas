# GoldM15 v1.22 – Signalzeitrahmen

Die erste Eingabe `SignalTimeframe` bestimmt sämtliche RSI-Indikatoren, die abgeschlossenen Kerzen für Swing-Stops und Momentum-Ausstiege sowie den Zeitpunkt neuer Signale.

| Auswahl in MT5 | SET-Wert | Wirkung |
|---|---:|---|
| current / PERIOD_CURRENT | 0 | Übernimmt den Zeitraum des Strategietesters bzw. Charts |
| M5 | 5 | Verwendet immer M5 |
| M15 | 15 | Verwendet immer M15; bisherige Strategie |
| H1 | 16385 | Verwendet immer H1 |

Alle von MT5 angebotenen Standardperioden sind wählbar. Die Periodenzahlen bleiben gleich: Ein RSI mit Periode 70 verwendet 70 Kerzen des ausgewählten Zeitrahmens. Sechs Momentum-Kerzen entsprechen auf M5 30 Minuten, auf H1 sechs Stunden. Geldbeträge, Prozentwerte, Lotgröße, Stop-Puffer, News-Zeitfenster und serverzeitabhängige Kontosperren werden nicht skaliert.

## Im Strategietester verwenden

1. Im Navigator aktualisieren und den neuen EA unter **GoldM15_v122 / GoldM15_Reconstruction** auswählen.
2. `GoldM15_v122_Auto.set` laden. `SignalTimeframe` steht ganz oben auf `current` / `PERIOD_CURRENT` (0).
3. Den Tester-Zeitrahmen auf M5, M15, H1 usw. stellen und den Test starten. Datumsbereich, Tickmodell, Symbol und übrige Einstellungen für Vergleiche gleich halten.
4. Für die bisherige M15-Strategie stattdessen `GoldM15_v122_FixedM15.set` laden oder `SignalTimeframe=M15` wählen. Dann darf ein Wechsel des Tester-Zeitrahmens die Signale weiterhin unverändert lassen.

Das Journal protokolliert `SIGNAL_TIMEFRAME input=... effective=... chart=...`. `effective` ist der tatsächlich verwendete Signalzeitrahmen. Ältere SET-Dateien ohne die neue Eingabe sollten für Vergleiche durch eines der neuen vollständigen SETs ersetzt werden. Der Forschungsrunner `tools.run_candidate` setzt ohne explizite Vorgabe weiterhin M15, damit historische Optimierungsergebnisse vergleichbar bleiben; explizites `SignalTimeframe=0` wird übernommen.

Die beiden SETs enthalten dieselben bisherigen 70 Parameter. Sie sperren neue Einstiege auf normalen Charts mit `AllowLiveTrading=false`; im Strategietester sind Einstiege erlaubt. Ein Wechsel des Signalzeitrahmens ist eine Strategieänderung. Die dokumentierten historischen +5.421,79 USD beziehen sich auf M15, nicht auf automatische M5-/H1-Signale.

## Prüfung

Native Zeitrahmenproben prüfen neun RSI-Handles, beide Swing-Stops und die Kerzenerkennung. Alle fünf Kombinationen bestanden: automatisch M5/M15/H1 sowie festes M15 auf M5 und H1 (60 Prüfungen). Vor der Änderung scheiterte die automatische M5-Probe mit elf Fehlern.

Zusätzlich wurden fünf native MT5-Testläufe für XAUUSD vom **14.09.2026 bis 21.09.2026 exklusiv** mit unveränderten Parametern und M1-OHLC-Ticks verglichen:

| Variante | Abgeschlossene Trades | Nettogewinn USD |
|---|---:|---:|
| v1.21, intern M15 | 88 | +132,38 |
| v1.22, fest M15 auf Tester M5 | 88 | +132,38 |
| v1.22, automatisch auf Tester M5 | 139 | −347,43 |
| v1.22, automatisch auf Tester M15 | 88 | +132,38 |
| v1.22, automatisch auf Tester H1 | 31 | −277,82 |

Die vollständigen Handelsfolgen von v1.21 und festem M15 stimmen exakt überein. Automatisches M15 stimmt ebenfalls überein. Die drei automatischen Perioden erzeugen verschiedene Handelsfolgen. In allen fünf Läufen meldet der Guard null Tages-/Gesamtgrenzverletzungen, null unbekannte Tagesbasis-Beobachtungen und null ungeklärte Resets. Der gesamte Equity-Rückgang über mehrere Tage ist kein täglicher Drawdown.

Zusätzlich reproduziert v1.22 mit festem M15 den vollständigen bisherigen 2026-Lauf vom 01.01. bis 07.10. exklusiv: **+5.421,79 USD, 3.186 Trades**, exakt identische Handelsfolge und Kennzahlen zur v1.21. Auch in diesem Lauf gibt es null beobachtete Tages-/Gesamtgrenzverletzungen oder Lücken in der Tagesbasis-Verifikation.

Nachweise: `analysis/timeframe/native_probes.json`, `analysis/timeframe/trade_comparison.json`, `analysis/timeframe/native_regression/native_checks.json` und `analysis/timeframe/fixed_m15_2026_regression.json`. M5 und H1 wurden nicht neu optimiert.

## Installation und laufendes Konto

Die neue Version liegt separat in `MQL5/Experts/GoldM15_v122`. Die bestehende EA-Datei, Chart-Zuordnung, Kontoanmeldung und AutoTrading-Einstellung der Nutzerterminals werden nicht ersetzt. Alle 22 gefundenen Datenorte von 14 MT5-Installationen einschließlich Demo- und Testterminals erhalten beide Tester-SETs unter `MQL5/Profiles/Tester`. Verteilnachweis: `analysis/deployment/deployment_manifest_v122.json`.

Der aktuell laufende EA und sein Dashboard verwenden weiterhin die bisherige Strategie. Bei einem späteren Wechsel auf einem normalen Chart muss der Signalzeitrahmen bewusst gewählt werden; für das bisherige Verhalten M15 wählen. Dashboard-Anzeigen für andere Signalperioden sind nicht Teil dieser Tester-Erweiterung. Kontoschutz und dessen persistenter Zustand bleiben unverändert.
