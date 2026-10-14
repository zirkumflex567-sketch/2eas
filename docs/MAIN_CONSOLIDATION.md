# Main-Konsolidierung: 09.10.2026

Auftrag: mergefähige ChartStudio-/Auditfix-Arbeit zusammenführen, ausschließlich einen funktionierenden GitHub-Branch `main` behalten und die gesamte Restarbeit sichtbar machen.

## Integration und Grenzen

- Ausgangs-main `1013149f6fd7` enthält die bereits gemergten ChartStudio-PRs bis #26 und Performance-/UX-PR #3. Der aktuelle Auditfix-Kandidat basiert auf diesem main; spätere Chart-Pakete wurden ohne Konflikte in den Audit-Worktree übernommen.
- Auditfix und Konsolidierung werden über [PR #14](https://github.com/zirkumflex567-sketch/2eas/pull/14) integriert. Sein GitHub-Mergestatus und die verlinkten Checks sind der maßgebliche Remote-Beleg. Ein Merge erfolgt erst nach erfolgreichen Checks des aktuellen Heads; danach werden beide Workflows auf dem resultierenden main nochmals geprüft.
- Unabhängiges Source-Review: keine kritischen/wichtigen Regressionen gefunden. Alle zwölf vorhandenen ChartStudio-/Candle-Funktionen waren AST-identisch zu Ausgangs-main; produktive Chartmodule/v5-Adapter wurden nicht geändert. Die späteren Änderungen betreffen Testbedienung, CI und Dokumentation.
- MTF-Confluence bleibt teilweise: Der Branch integriert jetzt ein geschlossenes, read-only D1/H4/H1/M15/M5-EMA-Baselinepanel mit UTC-as-of, strengem MT5-Read-Provenienzvertrag, Scope-Abbruch und Node-/Chromium-CI-Smokes. EA-spezifische editierbare Struktur-/Setupregeln, historische Trade-Navigation und vollständige AT-041/042-, Demo- und Hardware-Abnahmen bleiben offen; siehe [FR-029-Plan](superpowers/plans/2026-10-14-fr029-mtf-confluence-baseline.md).
- Der lokale Commit `7ddbe43` enthält EMA9-/EA-/Launcher-/Sync-Arbeit außerhalb der getesteten Remote-PRs. Er bleibt privat über den lokalen Recovery-Tag `recovery/2026-10-09/local-main-before-consolidation` und ein lokales Git-Bundle erhalten. Ein Paket mit Zugangsdaten und unauthentisierten Git-Update-Routen wird nicht ungeprüft veröffentlicht. Nacharbeit: AUD-14 in OPEN_TASKS.
- Private/ungetrackte Dateien, bestehende andere lokale Worktrees und Liveberichte werden nicht auf GitHub hochgeladen. Vor dem Update des ursprünglichen Checkouts werden seine ungetrackten Dateien privat gesichert; `git reset --keep` verändert keine ungetrackten Daten und bricht bei Kollisionen ab.

## Lokale Abnahme des integrierten Kandidaten

| Prüfung | Ergebnis |
|---|---|
| Vollständige isolierte pytest-Suite | **302 Tests + 245 Subtests bestanden**, 342,47 s; keine echten Broker-Writes |
| Python compileall / Inline-JavaScript / git diff --check | Bestanden |
| Alle neun ChartStudio-Node-Math-/Schema-/Geometrieskripte | Bestanden |
| Native v5 TypeScript check/build | Bestanden, Lightweight Charts 5.2.1 |
| Alle zwölf ChartStudio-Chromium-Smoketests | Bestanden: Appearance, Averages, Beta, Types, Export, Fibo, Incremental, Objects, Oscillators, Replay, Responsive, v5 |
| Stone-Preview Desktop 1440 / Mobil 390 | Bestanden; sichtbare Frames, Canvas, deaktivierte Demo-Orders, kein Seitenoverflow/Browserfehler |
| Nicht-Chart-Assettransfer 390 / 768 | Je **3.093.164 Byte**, keine `/ready/`-Requests; CSS/Chart-Styles unverändert. Historische Baseline in dieser lokalen Abnahme je 19.665.638 Byte. |
| MTF-Archivpaket | Node-As-of/EMA/Warmup/No-lookahead und Panel-Syntax bestanden; keine integrierte UI-Abnahme |
| Vollständigkeit der Restliste | Alle **35 FR-IDs** und **56 AT-IDs**, sämtliche offenen/teilweisen Chart-Tasks und originale Performance-/Visual-/EA-/Hardening-Befunde abgebildet |

Die ursprüngliche Audit-CI scheiterte an einer festen historischen Asset-Baseline für einen responsiven Browser. Nun werden tatsächlich vollständig geladene Ressourcengrößen mit ihren Dateien verglichen, nach dem Sichtbarmachen dekorierter Panels auf Netzwerkruhe gewartet und die optimierte 3-MiB-/Keine-Originale-Grenze unverändert durchgesetzt.

Die bestehende Chart-CI konnte frühere Node-Fehler durch einen später erfolgreich beendeten Befehl verdecken. PowerShell-native Befehle sind jetzt fail-fast. PNG-/Fibo-Smoketests reproduzierten dabei Klicks außerhalb des Viewports; explizites Scrollen des echten Zeichen-Canvas behebt die Testbedienung, ohne Drawing-/Download-/No-write-Assertions zu entfernen. Beide Workflows prüfen künftig auch jeden main-Push.

## Archivierung / Abschlussprüfung

Für jeden entfernten Remote-Branch wird zuerst ein Tag `archive/2026-10-09/<alter-Branchname>` auf seinen aktuellen Head gepusht und dessen SHA remote nachgelesen. Erst danach wird der entsprechende Branch entfernt. Somit bleibt ungemergte Arbeit wiederherstellbar; `main` ist der einzige aktive Remote-Branch. Falls ein Branch zwischen Inventur und Löschung weiterläuft, wird er neu geprüft statt sein neuer Head gelöscht.

Die Abschlussprüfung liest GitHub erneut aus: keine offenen PRs, nur `refs/heads/main`, beide main-CI-Runs erfolgreich auf demselben Merge-SHA. Der lokale main wird auf diesen Remote-Stand aktualisiert, ohne private/ungetrackte Dateien zu entfernen.

**Weiterarbeit:** [OPEN_TASKS.md](OPEN_TASKS.md) ist die einzige konsolidierte Restliste. Historische Auditreports bleiben als Evidenz erhalten. Remote-Ingress-/Rollenprüfung, EA-Ack/Heartbeat, Broker-Demo-Mutationen, Hardware-Mobilabnahme und Last-/Langzeittests sind dort ausdrücklich offen; grüne Repository-CI ist keine Broker-Write-Releasefreigabe.
