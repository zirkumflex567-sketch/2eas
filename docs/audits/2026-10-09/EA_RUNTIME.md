# MT5-EAs und Runtime — ergänzender statischer Performance-Check (2026-10-09)

**Scope:** `XAU_Titan_Pro.mq5`, `XAU_Titan_M5.mq5`, `XAU_Titan_Ultra.mq5`, `BlueberryGuardian.mq5`, `goldm15/GoldM15_Reconstruction.mq5`, `goldm15/GoldM15_Risk.mqh` sowie Überblick über die weiteren im Repo liegenden `.mq5`-Varianten. **Kein** MT5-Compiler, Strategy Tester, Broker-Terminal oder EA-CPU-Profiling in dieser Auditumgebung. Alle Aussagen beziehen sich auf Quellcode; kein automatischer Handel/Trade wurde ausgeführt.

## Umfang des untersuchten Codebestands

Das Repository enthält unter anderem `XAU_Titan_Pro`, `XAU_Titan_M5`, `XAU_Titan_Ultra`, mehrere historische `step`-/`restored`-Varianten, London-Breakout-EAs, `BlueberryGuardian` und `goldm15/GoldM15_Reconstruction`. Ein Build-/Regressions-Gate für alle aktiven Strategien auf `main` ist aus `.github/workflows/` nicht ersichtlich (dort liegt aktuell ein einzelner Asset-Workflow für einen Feature-Branch).

## EA-01 · P2 · Tick-HUDs aktualisieren ohne sichtbares Delta

`BlueberryGuardian.mq5:60-146` erzeugt bei **jedem Tick** einen mehrzeiligen Statusstring und schreibt ihn via `Comment(dash)` neu. `XAU_Titan_Pro.mq5:855` schreibt ebenfalls eine Chart-Kommentaranzeige. Das ist programmatisch bestätigt, jedoch ohne gemessenen CPU-Anteil. Bei hoher Tickfrequenz können wiederholte Textformatierung/Chart-UI-Updates unnötig sein.

**Maßnahme:** Anzeigeinhalt bei Bedarf höchstens alle 250–1000 ms oder bei Statusänderung erneuern; **Risikoprüfung, Schutzschließungen und Event-Erkennung weiterhin auf jedem Tick** ausführen. HUD-Drossel strikt von Trading-/Schutzlogik trennen.

## EA-02 · P2 · Synchroner Retry-Sleep in Orderpfaden

`XAU_Titan_Pro.mq5:539-588` enthält Order-Retry-Schleifen mit `Sleep(200)`. Das ist im normalen Erfolgsfall nicht zwangsläufig relevant; bei Ablehnungen/Requotes kann es die EA-Eventverarbeitung kurz blockieren.

**Maßnahme:** Nur im simulierten Fehlerfall profilieren. Falls relevant, endlichen Trade-State-Machine-/Timer-Retry unter Beibehaltung von Brokerretcodes, Duplicate-Order-Sperren und Risikogrenzen entwickeln. Nicht blind `Sleep` löschen oder die Retry-Zahl erhöhen.

## EA-03 · P2 · GoldM15-Schutzservice auf Tick und 1-s-Timer

`goldm15/GoldM15_Reconstruction.mq5:160-168,271-274,333-335` setzt `EventSetTimer(1)` und ruft `risk_guard.Service(...)` sowohl im `OnTick` als auch im `OnTimer` auf. Die Risikoengine führt Zustands-, Positions-/Pendingorder-Checks und zeitweise Persistenz aus. `goldm15/GoldM15_Risk.mqh:271-285` schreibt Schutzstatus bei Zustandswechsel oder ungefähr alle fünf Sekunden; Kalenderzugriff ist auf geeignete Flat-Zustände und Zeitfenster begrenzt (`:287-318`).

**Maßnahme:** Dauer pro `Service`-Durchlauf und Persistenzhäufigkeit mit MT5-Testlogs messen. **Keinen Schutzzyklus entfernen**, bevor gesichert ist, dass auch ohne neue Ticks Hard-Locks, Daily-Reset, Pending-Orders, News und Liquidationen rechtzeitig verarbeitet werden. Die aktuelle Doppelansteuerung kann bewusst sicherheitsrelevant sein.

## EA-04 · P2 · Historienzugriffe an passende Trigger gebunden halten

`XAU_Titan_Pro.mq5:122-149` nutzt `HistorySelect` für Tages-Startbalance. Der sichtbare Aufruf erfolgt beim Start und bei Tageswechsel (`:231,302`). `GetLastEntryTimeForMagic` sucht 48h-Historie (`:154-195`) und wird beim Init aufgerufen (`:236`). **Hier ist kein pauschaler teurer Historienabruf pro Tick nachgewiesen.** Diese bereits sinnvolle Trennung bei Optimierungen erhalten.

## EA-05 · P2 · Performance- und Sicherheitsabnahme sind nicht gleich

Die EAs müssen bei jeder Optimierung folgende Garantien behalten: Stop-/Lot-/Tickwert-Berechnung, Equity- und Daily-Drawdown-Schutz, Hard-Lock-Persistenz, accountweite Exposition, News-Filter, Pendingorders, Orderretcodes, Marktöffnungs-/Rollover-Behandlung. MT5-Tests mit realistischen Spread-/Slippage-/Gapszenarien sind vor Einsatz notwendig; Profilergebnisse allein beweisen keine Profitabilität.

## Variantenmanagement

Historische `step`-/`restored`-EAs und kompilierte `.ex5` können vom aktuell aktiven Quellstand abweichen. Für jede **aktiv verwendete** Version sollte ein Manifest die `.mq5`-/`.mqh`-Quellen, Compiler-Build, `.ex5`-Hash, `.set`-Profil, MT5-Terminal und tatsächlichen Broker-Account getrennt dokumentieren. Nicht funktionierende oder veraltete Varianten nicht ohne Rücksprache löschen. Eine Übereinstimmung zwischen vorhandenen `.ex5` und dem Quellcode wurde nicht verifiziert.

## Ergebnisse

**Nicht belegt:** P0-EA-Performance-Fehler oder behauptete Profitabilität.  
**Codebelegte Prüfstellen:** Tick-HUD, Retry-Sleep, doppelter Schutzservice und Versions-/Build-Sichtbarkeit.  
**Wichtigste unmittelbare Optimierungspriorität bleibt das Dashboard-Backend**, nicht die Handels- oder Schutzregeln. Siehe [PERFORMANCE.md](./PERFORMANCE.md).
