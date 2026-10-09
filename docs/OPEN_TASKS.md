# Offene Aufgaben: ChartStudio und Auditfix

Stand: 09.10.2026. Diese Liste ist die zentrale Restarbeit nach der Repository-Konsolidierung. Der ursprüngliche [Master-Spec](CHART_STUDIO_MASTER_SPEC.md) bleibt verbindlich. Historische Auditberichte und Branch-Notizen sind Ausgangsbefunde; ihre alten Statusangaben sind keine aktuelle To-do-Liste.

`Teilweise` bedeutet: Eine getestete Teilfunktion ist vorhanden, die vollständige Anforderung bleibt offen. Grüne Python-/Chromium-Tests ersetzen keine Broker-Demo-, Mobilgeräte- oder Deployment-Abnahme. Die ChartStudio-Beta bleibt gegenüber Handelsorders read-only.

## Bereits integriert / überprüfbare Teilfunktionen

- PRs [#3](https://github.com/zirkumflex567-sketch/2eas/pull/3), [#4–#13](https://github.com/zirkumflex567-sketch/2eas/pulls?q=is%3Apr+is%3Amerged+chart) und [#15–#26](https://github.com/zirkumflex567-sketch/2eas/pull/26): Performance-Basis, Chart-Beta, What-if, SQLite-Workspaces, ADX/VWAP, Zeichnungen, Multi-MA, Erscheinungsbild, mehrere Oszillatoren, Diagrammarten, Objektmanager, inkrementelles Rendern, EMA-Schnellzugriff, Katalog, isolierter v5-Adapter, Replay-Vorschau, Shortcuts, responsive Emulation, Fibo-Level und lokaler PNG-Export. Letzter Ausgangs-main: `1013149` (#26).
- [Auditfix #14](https://github.com/zirkumflex567-sketch/2eas/pull/14): Kontopflicht/Positionsscope, Stop-Quantisierung, frische Quellen, fail-closed Historie, atomare Persistenz pro Datei, Journal-FIFO/Kosten/ehrliche Unbekannt-Werte, lokale Steuer-Sitzung/CSRF/Host/Origin, stabile Eingabeentwürfe, Accessibility, Light-Status, Cache und optimierte Nicht-Chart-Assets. Aktueller Merge-/CI-Status und genaue Nachweise stehen in [MAIN_CONSOLIDATION.md](MAIN_CONSOLIDATION.md).
- Repository-CI prüft beide Pakete auf PRs und auf `main`; mehrzeilige PowerShell-Schritte brechen bei jedem fehlgeschlagenen nativen Befehl ab. Die responsive Assetmessung prüft tatsächlich geladene Dateigrößen; optimierte Nicht-Chart-Downloads müssen weiterhin ohne alte `/ready/`-Assets und innerhalb von 3 MiB bleiben. Historisch gemessene 19.665.638 → 3.093.164 Byte sind kein Versprechen für jeden Viewport und keine Gesamtseitenmessung.

## Reihenfolge der verbleibenden Arbeit

1. P0: Deployment-/Demo-Abnahme, echtes EA-Decision- und Lifecycle-Recording, autoritative Broker-Readmodelle und vollständiges What-if.
2. P0: Native v5-Produktmigration mit Zeichnungen/Panes/Layouts, inklusive Datenfenster und Preis-/Währungssemantik.
3. Gesondertes Write-Release: Rollen, versionierte Vorschläge, Konflikt-/Idempotenzschutz, Readback, Demo-E2E und explizite Freigabe.
4. P1: Werkzeuge, Sync-/Mehrchart-Bedienung, Confluence, Sessions, Execution Quality, Regime und News.
5. P2: vollständiger EA-Replay, Footprint, sichere Scripts und geräteübergreifender Sync; parallel die messbaren Performance-/Asset-/EA-Auditnacharbeiten.

## ChartStudio: vollständiger Anforderungsabgleich

Jede Zeile bleibt eine offene Aufgabe bis ihr Restumfang und ihre Abnahme erfüllt sind. Die Task-IDs beziehen sich auf [CHART_STUDIO_TASKS.md](CHART_STUDIO_TASKS.md).

| ID / Priorität | Stand und noch zu liefern | Abnahme / Abhängigkeit / Task |
|---|---|---|
| FR-001 / P0 | Teilweise: lokale/SQLite-Layouts vorhanden. Vollständiges Umbenennen/Kopieren/Zurücksetzen, symbolbezogene v5-Ansichten, Migration und Konfliktmerge liefern. | AT-001/033; v5 und ACL; 2.4/2.5 |
| FR-002 / P0/P1 | Teilweise: Katalog, bis 16 MA und 8 Oszillatorinstanzen. RMA/SMMA, Perioden 1–1000, reiner Display-Shift, konfigurierbare Bollinger-Periode/StdDev/Fill, Session-VWAP, Volume-Farboptionen, 9/21/50-Anzeigepreset und vollständige native v5-Parameter-/Stil-/Paneverwaltung liefern. P1-Katalog: Stochastic/StochRSI, CCI, Momentum/ROC, Supertrend, Donchian/Keltner, Ichimoku, SAR, OBV/MFI, Pivots, dokumentierter Auto-Fibo, Sessionboxen, Regression, ATR-Bands und Volumenzonen. | AT-002/003/025; Master-Spec §7.1–7.3, referenzierte Algorithmen/Warmup/Algorithmusversion; 1.8/2.2 |
| FR-003 / P0 | Teilweise: H-Linie, Trend, Rechteck, Fibo, Strahl, Kanal, Messung. V-Linie/Text, Annotationseinstellungen, v5-Primitives, Drag/Snap/Hit-Test-Prioritäten und Touch ergänzen. | AT-004–007/034; 2.1/2.3 |
| FR-004 / P0 | Teilweise: kontogebundene offene Positionen sichtbar. Autoritative Symbol-/Strategie-/Ticketfilter und alle Broker-Readmodelle liefern. | AT-008/009/021; 3.1/3.2 |
| FR-005 / P0 | Teilweise: echte Entry/SL/TP-Overlays. Native Zonen/Labels mit Seite, Hedging/Netting, Kontowährung und verifizierter USD-Konversion. | AT-010/018–021; 3.2 |
| FR-006 / P0 | Teilweise: virtuelle PLAN-SL/TP-Griffe. Reale ticketgebundene Maus-/Touch-Drafts mit versionierter Broker-Preview und Stop-/Freeze-/Guard-Prüfung. | AT-011/012/016/034; 3.3/4.2; keine Drag-Writes |
| FR-007 / P0 | Offen: abgesicherter Chart-Commit samt Bestätigung, Rolle, Revision, Idempotenz, Brokerantwort und Readback. | AT-013–017/030/032; 4.1–4.5; Demo-/Release-Gate |
| FR-008 / P0 | Offen: OHLC-/Indikator-/Spread-Datenfenster mit Kerzenzeit, gepinntem Crosshair und Quellenkennzeichnung. | Master-Spec-Datenfenster und v5-Parität; 1.8/5.7 |
| FR-009 / P0 | Teilweise: Zeit-/Preisanker, Undo/Redo, Snap/Lock, JSON/SQLite. Vollständiger Import, Versionsmigration, Konfliktauflösung und v5-Persistenz. | AT-006/007/033; 2.1/2.4 |
| FR-010 / P0 | Teilweise: vorhandene S/R-/Volumenlevel. Jedes Tages-/Wochen-/POC-/VAH-/VAL-Level einzeln schaltbar mit überlappungsfreien Labels. | AT-022/024; 2.5/5.2 |
| FR-011 / P0 | Teilweise: expandierbarer v4-Chart und v5-PoC-Panes. Produktion auf v5 umstellen, volle Pane-/Achsen-/Fullscreen-Parität und Rollback. | AT-023/031/034; 1.7/1.8/2.2 |
| FR-012 / P0 | Teilweise: Kontoisolation und fail-closed Scope in Regressionstests. Beide echten Demo-Terminals, Symbolwechsel und rasche Race-Wechsel unabhängig abnehmen. | AT-008/015/016/026/028/031/035; 0.6/3.1/4.4 |
| FR-013 / P1 | Teilweise: Candles/Bar/Line/Area vorhanden. Heikin-Ashi/Hollow Candles und weitere freigegebene Typen/Presets mit klarer Derivatkennzeichnung. | Type-/Profil-/Ankerregression, v5; 2.5 |
| FR-014 / P1 | Teilweise: konfigurierbare Retracement-Level. Extension/Fan/Time-Zones/Trend-Based-Fibo samt Styles und Persistenz. | Geometrie, Import, steigende/fallende Anker; 2.3 |
| FR-015 / P1 | Teilweise: Strahl/Kanal/Messung. Regression, Positions-/R:R-Box, Winkel und optional Pitchfork integrieren. | Snap-/Hit-Test-/Touch-Tests; 2.1/2.3 |
| FR-016 / P1 | Teilweise: Layouts, MA-Presets und feste Shortcuts. Favoriten, individuelle Shortcuts und vollständige Indikator-Templates. | Kontoisolation, Tastatur/Input-Fokus, Persistenz; 2.2/2.4 |
| FR-017 / P1 | Offen: Echtzeit-Preisalarme und Browserbenachrichtigungen, Berechtigungs-/Stale-/Deduplogik, kein Auto-Trade. | Quellenfrische, Konto-/Symbolkontext, kein Brokerwrite; 5.7 |
| FR-018 / P1 | Offen: Symbol-Watchlist und synchronisierbare 2-/4-Chart-Workspaces mit Zeit-/Crosshair-Linkage und gespeicherten Layouts. | Resize, Konto-/Symbolisolation, AT-025/031/033; 2.5 |
| FR-019 / P1 | Offen: echte Pending-Orders mit autoritativen Brokerrevisionen und separater Guard-Anbindung anzeigen. | AT-015/021/026; 3.1; Writes separat |
| FR-020 / P1 | Offen: Portfolio-/Korrelations-/erweiterter Positionsplaner, autoritative Lots/Margin/Währung. | Risikoszenarien und Datenlücken; 3.4 |
| FR-021 / P1 | Offen: optionales reales Trade-Ticket mit eigenem Confirm/Auth-Flow; nie What-if oder Drag als Order ausführen. | Gleiche Gates wie FR-007; 4.1–4.5 |
| FR-022 / P2 | Teilweise: eingefrorene Candle-Replay-Vorschau. Historienpagination/-warmup und isolierte reproduzierbare Simulationsinfrastruktur. | AT-025/051/052; 2.6/5.6 |
| FR-023 / P2 | Offen: Footprint ausschließlich mit belegten Bid/Ask-/Tick-Orderflow-Daten und klarer Lizenz/Provenienz. | Echtdatenfeed erforderlich; keine OTC-Volumen-Proxies als Orderflow |
| FR-024 / P2 | Offen: begrenzte Indikator-Sandbox, sichere/signierte Imports und CPU-/Speicherlimits. | Ressourcen-/Sicherheitsreview; kein beliebiges eval |
| FR-025 / P2 | Offen: Geräte-Sync mit Nutzer-/Rollenrechten, Verschlüsselung und Versionskonflikten. | Multi-User-ACL und FR-001/009; 2.4 |
| FR-026 / P0 | Teilweise: ehrliche Shift-1-Referenz und unbekannte Gründe. Echte unveränderliche EA-DecisionEvents/ReasonCodes/Parameterstände, Inspector und Logger-Ausfallsemantik liefern. | AT-036–038; EA-Instrumentierung ohne Tradingänderung; 3.5 |
| FR-027 / P0 | Teilweise: Long/Short-Broker-Profit-/Margin-Preview und virtuelle Pläne. A/B, Lotsizing, Guard-/DD-Abstand, Währungsumrechnung, Speichern/Export und Demo-Nachweis ergänzen. | AT-039/040; 3.3/3.4 |
| FR-028 / P2 | Teilweise: browserseitiges Candle-Replay. EA-/Entscheidungs-/Indikator-/Positions-Replay aus belegten Snapshots mit as-of-Provenienz und Performancebudget. | AT-051/052; FR-026/033/035; 5.6 |
| FR-029 / P1 | Begonnen, nicht integriert: archivierter MTF-EMA-Kern/Panel. HTML-Mount/Context-Hooks, Browser-/CI-Tests, D1/H4/H1/M15/M5, Struktur/Setup, historische As-of- und Datenlücken-/Warmup-Abnahme liefern. | AT-041/042; Archiv in MAIN_CONSOLIDATION; 5.1 |
| FR-030 / P1 | Offen: DST-korrekte Asia/London/New-York-Sessions, Opening Range, bestätigte Swings und ausdrücklich beschriftete Liquidity-Proxies. | AT-045/046; Kalender-/Zeitprovenienz; 5.2 |
| FR-031 / P1 | Offen: IntendedPrice-/Quote-/Deal-basierte Fill-, Spread-, Slippage- und Partial-Fill-Kosten. Historische fehlende Baselines als unbekannt. | AT-043/044; echtes Recording; 5.3 |
| FR-032 / P1 | Offen: deterministische Regime-Features/Thresholds/Hysterese, as-of/UNKNOWN, Gebühren/Samples und OOS-Auswertung. | AT-047/048; 5.4 |
| FR-033 / P0 | Teilweise: korrektes Netto-/FIFO-Journal. Unveränderliche Lifecycle-Ereignisse, Trailing-/Teilfill-Provenienz, MFE/MAE exakt oder OHLC-geschätzt und Journalverknüpfung. | AT-049/050; Positions-/Deal-Recording; 3.6 |
| FR-034 / P1 | Offen: lizenzierter Newsfeed, Änderungen/Absagen/Stale-Zustände, UI-Events vom echten EA-News-Guard trennen. | AT-053/054; Provider/Lizenz; 5.5 |
| FR-035 / P0 | Teilweise: manueller lokaler PNG-Export. Automatische immutable Entry-/Exit-Datensnapshots ohne Browser, Idempotenz, Historienansicht, Journalverknüpfung und v5-Mehrpane-Export. | AT-055/056; FR-026/033; 3.6/5.7 |

## Übergreifende ChartStudio-Gates

- [ ] Tasks 0.6/1.7: beide MT5-Demos, echte Mobilhardware, Windows 150% DPI, alle Themes, Zoom/Fullscreen, Eingabe-/Touch- und Langzeitabnahme protokollieren; Chromium-Emulation ist nur Teilleistung.
- [ ] Task 0.7/4.1: tatsächliche Tunnel-/Proxy-/Firewall-/Host-/TLS-Topologie prüfen, authentisierte Remote-Nutzer und Read/Layout/Trade-Rollen liefern. Lokale Steuer-Capability ist umgesetzt, Remote-Login und Rollen sind offen.
- [ ] Tasks 1.8/2.1/2.2/2.4: v5-PoC zur Produktionsengine migrieren, Primitives/Pane-/Layoutmanager und Schema-Parität liefern; v4 bleibt bis dahin die Produktionsengine.
- [ ] Task 2.6: paginierte MT5-Historie, volle Warmups, inkrementelle RSI/MACD/ATR, Streaming/adaptives Polling und reproduzierbare Benchmarks; AT-025/031 mit Speicher-/CPU-/Latenznachweisen. Die derzeitige SQLite-Grenze von 500 Zeichnungen und die Abnahme mit 1.000 Zeichnungen müssen bewusst aufgelöst werden.
- [ ] Tasks 3.1–3.6: Broker-Readmodelle, native Overlays, echte Ticket-Drafts, erweitertes What-if, DecisionEvents und Lifecycle wie oben liefern.
- [ ] Tasks 4.2/4.3: kurzlebige Proposal-IDs/Revisionen, Risiko-/Hard-Lock-/Freeze-Prüfung, zweistufige Bestätigung, Idempotenz, EA-Trailing-Konflikte, Broker-Readback und append-only Auditlog.
- [ ] Tasks 4.4/4.5: ausschließlich autorisierte Demo-E2E für beide Konten, Ablehnungen/Timeout/Doppelconfirm/409 testen; Sicherheits-/Performance-Review, Release-/Rollbackplan und explizite Write-Freigabe.
- [ ] Tasks 5.1–5.6: Intelligence-/Replay-Module gemäß FR-028–034 abnehmen.
- [ ] Task 5.7: jede FR-001–035 und AT-001–056 mit Beleg/Status in der Abnahmematrix führen, vollständige Legacy-Parität und Rollout/Rollback nachweisen. Fehlende Historie bleibt NOT_RECORDED/UNKNOWN.

## Auditfix: noch offene Nacharbeiten

IDs im Summary-Audit, detaillierten VISUAL_UX-Report und späteren Hardening-Ledger unterscheiden sich. `Summary PERF-03` bedeutet Assetumfang, `Hardening PERF-03` bedeutet Motion/DOM. Bei Visual-IDs wird der Quellreport ausdrücklich genannt.

| Restaufgabe | Konkrete Lieferung und Abnahme | Herkunft / Abhängigkeit |
|---|---|---|
| AUD-01 / P1 | Backend-P50/P95/P99 inkl. MT5-init/rates/history/Lock-Wait, zwei Konten/zwei Tabs, Cold/Warm-Load, Fehlerquote und mindestens 5-Minuten-Traces messen. Account-Worker/Snapshots nur bei belegtem Nutzen und Isolation einsetzen. | Original PERF-01/02/04; Session-Reuse, Light-Status, VP-Vektorisierung und Caches sind vorhanden, Live-Lastbudget offen. |
| AUD-02 / P1 | Gesamte Seitenbytes, Requests, Decode/Paint und Cold/Warm-Waterfall messen; Chart-/Volumenassets separat budgetieren, responsive Varianten und Archiv/LFS-Konzept bewerten. | Original PERF-03; Nicht-Chart-Budget ist umgesetzt; gesamte Seite nicht ≤3 MiB. Originale bleiben erhalten. |
| AUD-03 / P2 | Acht manuell markierte Ready-Assets 11/12/13/17/18/19/26/35 sowie fünf Contact Sheets auf Alpha/Fransen/Freiraum prüfen und protokollieren. | Summary VIS-03 / detailliert VISUAL_UX VIS-06; Processing-Report, Desktop-/Mobile-Ansichten. Screenshot-RMS ersetzt diese Freigabe nicht. |
| AUD-04 / P1 | 5-Minuten-Idle/Low/Off/Full-/Celebration-Traces, FPS/Long Tasks/CPU/Paint und 30/60-Minuten-Heap messen; Hidden/Offscreen/Motionpause, Resizes, Scroll/PriceScale/Fullscreen/Zoom und Golden-Screenshots abnehmen. | Original PERF-07/08/VIS-01 und VISUAL_UX §Chart-FX; transparente Zusatzserien entfernt, Motionkontrollen geliefert, Hardwarebudget offen. |
| AUD-05 / P1 | Textur-Kontraste, alle scoped axe-incomplete Fälle, Tastatur-/Screenreader-/Touch-/Zoom-Abnahme auf Hardware abschließen; primäre Werte ausreichend lesbar halten. | Summary VIS-02 / VISUAL_UX VIS-02/03/04; Hardening VIS-01–03/A11Y-01, Farben/Labels/Fokus/320px-Reflow geliefert. |
| AUD-06 / P1 | Das vollständige ursprüngliche VALIDATION_PLAN mit reproduzierbarer Baseline, kontrolliertem Vorher/Nachher, Netzfehlern/Account-Races, Trade-Eingaben und Langzeit-Limits abnehmen. | QA-01/VALIDATION_PLAN; CI-Syntax/Unit/Chromium vorhanden; kein pauschaler Speedup-/vollständiger Liveabnahme-Beleg. |
| AUD-07 / P0 vor Remote-Write | Authentisierten TLS-Proxy, Forwarded-/root_path-Konfiguration, Hostallowlist, Rollen, Session-/Token-Schutz und alle Ingresspfade tatsächlich prüfen. | Hardening SEC-01, Chart 0.7/4.1; Capability schützt vor fremden Browserseiten, lokale Prozesse/unauthentisierter Proxy bleiben Vertrauensgrenze. |
| AUD-08 / P1 | Erwartete Prop-Risikotage und Resetzeiten je Broker/Konto, DST/Rollover und zukünftige Offsetwechsel belegen; explizites UTC+3-Demoprofil ist keine allgemeine Broker-Zeit-Erkennung. | Hardening REL-01/03/SAFE-03/04, BROKER_CLOCK_POLICY; Demo-Profilquelle dokumentiert. |
| AUD-09 / P1 | Crash zwischen zwei Resetdateien und Recovery-Verhalten testen; EA-Ack/Heartbeat und Laufzeitpreset-/Binary-Identität wirklich instrumentieren. Kein erfolgreicher Dateischreibvorgang als EA-Bestätigung ausgeben. | Hardening SAFE-02/DATA-02/03; atomar pro Datei mit Rollback, keine crash-atomare Zwei-Datei-Transaktion. |
| AUD-10 / P1 | Autorisierte Demo-Tests für SL/TP/BE/Entfernen/Close/Reset, frische Quelle vor Versand, EA-Trailing-Races, Requotes/Rejects, doppelte Bestätigung und Readback; keine funded-account Tests. | Hardening SAFE-01/REL-02/UX-01; gemockte Backend-/Browserpayload-Regression grün, reale Write-Abnahme offen. |
| AUD-11 / P1 | Journal vollständig aus instrumentierten Decision-/Lifecycle-Events machen; MFE/MAE/Entry-/Exit-Provenienz, gemischte Eigentümer und Teilfills auf Demo-Echtdaten prüfen. | Hardening DATA-01–03; FIFO/Netto/Unknown/All-strategy-Anzeige vorhanden; FR-026/033/035. |
| AUD-12 / P2 | Aktive EA-Versionen mit Quellen-/Compiler-/ex5-/Preset-Manifest abnehmen; Strategy-Tester-/Build-Gate für aktive EAs und Spread/Slippage/Gap-/Guardregression. | EA-05/Variantenmanagement; Dashboard-CI kompiliert kein MQL5. |
| AUD-13 / P2 | Tick-HUD, Retry-Sleep und GoldM15-Service auf OnTick/Timer messen. HUD-Delta/Drossel oder begrenzte Retry-State-Machine nur bei belegtem Nutzen entwickeln; Schutzzyklen/Risikogates erhalten. | EA-01/02/03/04; kein EA-CPU- oder Brokerfehler-Profilnachweis, keine blind entfernten Sleeps/Services. |
| AUD-14 / P1 | Lokalen EMA9-/EA-/Launcher-/Auto-Sync-Entwurf getrennt reviewen und zerlegen: Broker-/Compiler-/UI-Tests, keine unauthentisierte Git-Pull-Route, keine eingebetteten Zugangsdaten, kein unkontrolliertes Aktualisieren laufender Software. | Lokaler Commit 7ddbe43, nur privat gesichert; nicht als geprüfte Auditfix-Änderung gemergt. |
| AUD-15 / P2 | CSS-Layer-/Token-System und einheitliche Breakpoints liefern, doppelte !important-/Theme-/Inline-Regeln deduplizieren; Controls und Chartgröße durch Screenshotmatrix schützen. Tote Selektoren und überdeckte Legacy-Glow-Regeln erst nach DOM-/Coverage-Nachweis entfernen. | Detailliert VISUAL_UX VIS-05/09; neue Accessibility-Tokens lösen die alte Stylesheet-Schichtung noch nicht vollständig. |
| AUD-16 / P2 | Chart-FX von internem table/td-Markup auf dokumentierte Pane-/Koordinaten-APIs migrieren; Scale-/Resize-/TF-Invalidierung und pixelgenaue Testmarker mit Toleranz liefern. | Detailliert VISUAL_UX VIS-07; v5-Migration; AUD-04 enthält zusätzliche Hardware-/Visual-Abnahme. |

Bereits behobene ursprüngliche Befunde: PERF-05 (keyed Eingaben/Journal), PERF-06 (generierte Tailwind-CSS), COR-01 (eigene EMA20 getrennt von EA-EMA21), QA-01 (automatische main-CI; verbleibende Abnahme in AUD-06). Tests: test_dashboard_frontend.py, test_stone_theme_contract.py, test_performance_regressions.py und die beiden CI-Workflows. Hardening REL-01–03, UX-01, SAFE-01–04, SEC-01, A11Y-01, PERF-01–03, DATA-01–03 und OPS-01 haben implementierte Regressionen; die hier angegebenen Realwelt-Grenzen bleiben offen.

## Abnahmematrix AT-001–AT-056

Die folgende Matrix enthält jede verbindliche AT-ID. `Offen (Gesamtabnahme)` bedeutet, dass vorhandene Teiltests noch keine vollständige Produktfreigabe beweisen. Prüfdefinitionen stammen aus dem Master-Spec. Teilbelege: Python-Tests, scripts/test_chart_studio_*.cjs, scripts/smoke_chart_studio_*.cjs sowie PR-/CI-Nachweise in MAIN_CONSOLIDATION.md. Broker-/Hardware-/Lastabhängigkeiten und konkrete Lieferung sind oben den FRs/AUDs zugeordnet.

| Test | Prüfdefinition | Status |
|---|---|---|
| AT-001 | Indikatorsuche zeigt alle P0-Indikatoren, jede Instanz lässt sich konfigurieren | Offen (Gesamtabnahme) |
| AT-002 | 2× EMA20 mit verschiedenen Farben/Parametern ohne gegenseitige Störung | Offen (Gesamtabnahme) |
| AT-003 | RSI im separaten Pane, eigene Skala und Höhe per Drag einstellbar | Offen (Gesamtabnahme) |
| AT-004 | 1000-Bar-Pan/Zoom: Trendlinie hält exakt ihre Anker | Offen (Gesamtabnahme) |
| AT-005 | Fibo Retracement 0.236/0.382/0.5/0.618/0.786/1 korrekt bei steigenden/fallenden Ankern | Offen (Gesamtabnahme) |
| AT-006 | 10 beliebige Zeichnungen bleiben nach Refresh/TF-/Kontowechsel korrekt im Scope | Offen (Gesamtabnahme) |
| AT-007 | Objekte lassen sich verstecken, sperren, löschen, duplizieren, undo/redo | Offen (Gesamtabnahme) |
| AT-008 | Kontospezifische Position erscheint nicht beim falschen Account | Offen (Gesamtabnahme) |
| AT-009 | Toggle „Positionen“ versteckt Overlay, lässt Backend-Position unverändert | Offen (Gesamtabnahme) |
| AT-010 | Entry, SL, TP mit korrekter Seite/Preis für BUY und SELL | Offen (Gesamtabnahme) |
| AT-011 | Drag-SL zeigt Live-Preis, vorläufige USD-Schätzung, verfügbare Broker-Preview | Offen (Gesamtabnahme) |
| AT-012 | Drag bei StopLimit-Verletzung sichtbar abgelehnt, kein commit möglich | Offen (Gesamtabnahme) |
| AT-013 | Beim Drag KEIN order_send, bei bestätigtem Commit genau eine geprüfte MT5-Änderung | Offen (Gesamtabnahme) |
| AT-014 | Nach Commit zeigt UI nur tatsächlich rückgelesene Broker-Level | Offen (Gesamtabnahme) |
| AT-015 | Ohne Kontoidentität, bei falschem Ticket/Symbol oder Hard-Lock sichere Ablehnung | Offen (Gesamtabnahme) |
| AT-016 | Account/Timeframe-Wechsel während Draft bricht sicher ab | Offen (Gesamtabnahme) |
| AT-017 | Stale Revision durch EA-Trailing ergibt 409, neue Brokerwerte bleiben | Offen (Gesamtabnahme) |
| AT-018 | USD-Berechnung entspricht order_calc_profit für 4 Symbol-/Accountkonstellationen | Offen (Gesamtabnahme) |
| AT-019 | Fremdwährungskonto zeigt Account-Currency korrekt; USD-Wert nur mit gültiger Konversion | Offen (Gesamtabnahme) |
| AT-020 | Kein TP/SL ergibt „nicht gesetzt“, nicht Phantom-0-Zone | Offen (Gesamtabnahme) |
| AT-021 | Mehrere Tickets derselben Symbolrichtung und gegenläufige Tickets korrekt getrennt | Offen (Gesamtabnahme) |
| AT-022 | Keine überlappenden/abgeschnittenen Daily-High-, POC- und Order-Axis-Labels | Offen (Gesamtabnahme) |
| AT-023 | Stone/Dark/Light und Fullscreen erhalten Zeichnungen, Achsen und Chartfunktionen | Offen (Gesamtabnahme) |
| AT-024 | Session-/DST-Wechsel ändert Zeitdarstellung, aber nicht ursprüngliche UTC-Anker | Offen (Gesamtabnahme) |
| AT-025 | 5.000 Bar + 20 Indikatoren + 1.000 Zeichnungen in definiertem Budget | Offen (Gesamtabnahme) |
| AT-026 | Fehlende MT5-Daten erzeugen sichtbaren Fehler und KEINE falsche Orderanzeige | Offen (Gesamtabnahme) |
| AT-027 | Journal zeigt nach der Migration weiterhin „Alle Strategien“ | Offen (Gesamtabnahme) |
| AT-028 | Tages-DD, Guard, EA-Logik und MT5-Accounts bleiben wie zuvor geschützt | Offen (Gesamtabnahme) |
| AT-029 | Demo-/Replay-/Visual-FX-Knöpfe senden keine echten Handelsmutationen | Offen (Gesamtabnahme) |
| AT-030 | Jede echte Änderung ist in einem Audit-Log nachvollziehbar, ohne Passwörter | Offen (Gesamtabnahme) |
| AT-031 | Symbol-/Konto-/TF-Wechsel 20-mal ohne Memory-Leak, stale UI oder Event-Duplikat | Offen (Gesamtabnahme) |
| AT-032 | Preview-Timeout, doppelte Bestätigung, 409-Konflikt, MT5-Retcode-Ablehnung korrekt | Offen (Gesamtabnahme) |
| AT-033 | Layout exportieren/importieren, neu laden, Schema-Migration und Konfliktfälle | Offen (Gesamtabnahme) |
| AT-034 | Touch-Drag unter 390px und Windows 150% DPI korrekt | Offen (Gesamtabnahme) |
| AT-035 | Kein Signalmarker wird versehentlich zu einer echten Position/Order umgedeutet | Offen (Gesamtabnahme) |
| AT-036 | P0 — Titan und GoldM15 mit aufgezeichnetem Candidate/Signal/Reject — Decision Inspector zeigt damals protokollierte Bedingungen, ReasonCodes, Parameter- und EMA-/RSI-Werte exakt | Offen (Gesamtabnahme) |
| AT-037 | P0 — Nicht instrumentierter Alt-Trade — „Nicht aufgezeichnet“; keine frei erfundenen Gründe, kein nachträglicher Fill aus Setupmarker | Offen (Gesamtabnahme) |
| AT-038 | P0 — Aufzeichnung deaktivieren oder Logger-Fehler — EA-Signal/Trade gleich wie vorher, Lossy-Datenlücke sichtbar, kein blockierter MT5-Handel | Offen (Gesamtabnahme) |
| AT-039 | P0 — What-if Long und Short in USD-/Nicht-USD-Konto — Broker-order_calc_profit/-margin stimmen, Lots/Stop-/R:R-Kalkulation mit ticksize/lotstep korrekt | Offen (Gesamtabnahme) |
| AT-040 | P0 — Was-wäre-wenn verschieben/speichern/exportieren — Null MT5-Schreibaufrufe; Plan klar als SIMULATION/DRAFT; Konflikt nach Kontowechsel | Offen (Gesamtabnahme) |
| AT-041 | P1 — Historischen M15-Einstieg mit H4-Filter prüfen — Nur vorher abgeschlossene H4-Werte; künftiges H4-Bar wird nie berücksichtigt | Offen (Gesamtabnahme) |
| AT-042 | P1 — Confluence bei Datenlücke/TF-Wechsel — UNKNOWN und sourceTime angezeigt, keine täuschende 100%-Bewertung | Offen (Gesamtabnahme) |
| AT-043 | P1 — Execution Quality mit intendedPrice, Quote und Deal — Fill-/Spread-/Slippage-Kosten korrekt gerichtet und nicht doppelt verrechnet; Sampleanzahl vorhanden | Offen (Gesamtabnahme) |
| AT-044 | P1 — Historischer Deal ohne Quote/intendedPrice und Partial-Fills — Slippage als nicht verfügbar; gewichteter Fillpreis aus tatsächlich ausgeführten Lots | Offen (Gesamtabnahme) |
| AT-045 | P1 — London-/New-York-/Asia-DST und Wochenendwechsel — UTC-Anker, Preisboxen, Opening Range, Swing-Bestätigung stimmen | Offen (Gesamtabnahme) |
| AT-046 | P1 — Equal High/Sweep und angebliche Liquidity — Als Proxy markiert; keine „echten Stoporders“ oder Institutionen ohne Orderflowfeed | Offen (Gesamtabnahme) |
| AT-047 | P1 — Deterministischer Marktregime-Klassifikator — Features, Thresholds, Hysterese, as-of und UNKNOWN bei Mangel stabil reproduzierbar | Offen (Gesamtabnahme) |
| AT-048 | P1 — Regime-Performancevergleich — Nur reale belegte Trades, sample size/fees/OOS, keine Future-Features/Erfolgsversprechen | Offen (Gesamtabnahme) |
| AT-049 | P0 — Mehrere Positions- und Deal-IDs, Trailing-/Teilfill-Events — Read-only Lifecycle korrekt, unbekannte historische Stopverläufe als Lücke | Offen (Gesamtabnahme) |
| AT-050 | P0 — MFE/MAE mit Tickdaten vs. OHLC-only — Exakt/geschätzt sauber getrennt, intrabar-Reihenfolge ohne Ticks nicht erfunden | Offen (Gesamtabnahme) |
| AT-051 | P2 — Replay startet vor realem Fill — Keine späteren Kerzen/Entscheidungen sichtbar, kein Look-ahead | Offen (Gesamtabnahme) |
| AT-052 | P2 — Replay bei Position/SL/TP im LIVE-Konto — Sämtliche MT5-Mutationsrouten technisch verboten, Orders unverändert | Offen (Gesamtabnahme) |
| AT-053 | P1 — Lizenzierter News-Event verschoben/abgesagt — Eventstatus/Timestamp korrekt; alte Warnung revidiert statt heimlich ersetzt | Offen (Gesamtabnahme) |
| AT-054 | P1 — Newsfeed fehlt oder ist veraltet — Providerfehler sichtbar, EA-News-Guard vom UI-Overlay getrennt, keine fingierte Sperre | Offen (Gesamtabnahme) |
| AT-055 | P0 — Broker-Entry und Exit mit/ohne aktiven Browser — Immutable Datensnapshot für beide, Idempotenz, Journalverlinkung; Bild optional | Offen (Gesamtabnahme) |
| AT-056 | P0 — Snapshot öffnen nach TF-/Accountwechsel — Ursprünglicher as-of Chart oder korrekt beschrifteter Recompute, keine fremden Tickets/aktuellen EMAs | Offen (Gesamtabnahme) |
