# Isolierter EA-Compiler-Nachweis

Stand: 09.10.2026, Repository-Quellen von main 043d7b6. Kopien wurden in einem neuen ignorierten Compile-Verzeichnis gebaut, mit MetaEditor 5.0.0.6230 und der installierten MQL5-Standardbibliothek. Kein EX5 wurde in einen aktiven Experts-Ordner kopiert, kein Chart/EA neu angehängt und kein MT5-/SSH-Prozess ersetzt.

| Quelle / Quellversion | Compilerlog | Source SHA256 | Frisch erzeugte EX5 SHA256 |
|---|---|---|---|
| XAU_Titan_Pro.mq5 / 7.10 | 0 Fehler, 0 Warnungen | 518bff6d8f729261ba807c5d8f1fca023cf6ad2baf46d7d2be9e907ea24dc0d2 | e4893244720cf4a37ba8561e1a4af442001d30203c4446dfa6e98b0d2951b4a5 |
| goldm15/GoldM15_Reconstruction.mq5 / 1.22 | 0 Fehler, 0 Warnungen | 6dcd7c7a62d66a5e517e6813aae6b88b9b16b551fd3f9ad77e027fbb7ac65573 | eb53e836676908f208ff23f4249a015377e5d3c2cb9b5d82f0a362544beed03e |

Aufruf gemäß [offizieller MetaEditor-CLI-Dokumentation](https://www.metatrader5.com/en/metaeditor/help/beginning/integration_ide): explizite /compile-Quellkopie, /include-MQL5-Verzeichnis und /log; Start-Process mit verborgenem Fenster und 60-Sekunden-Grenze für genau den gestarteten Compiler. Erfolg wird aus dem eindeutigen neuen EX5 und Compilerlog beurteilt; beide Prozesse lieferten Exitcode 1, der allein keine Abnahme ist.

Dies belegt Kompilierbarkeit dieser Quellkopien. Es ist kein vollständiger reproduzierbarer transitive-Include-/Preset-/Build-Manifestnachweis und kein Nachweis, dass eine dieser Binarys aktuell im Terminal geladen ist. Aktive EA-/Preset-Identität, automatisches Compiler-/Strategy-Tester-Gate und Signal-/Guard-/Spread-/Slippage-/Gap-Regressionsabnahme bleiben AUD-12. Handelslogik wurde nicht geändert.

Gefilterte Metadaten und isolierte Artefakte bleiben unter ignoriertem output/integration-live/runtime-20261009/. Die originalen laufenden Terminals und der reverse SSH-Tunnel behalten ihre ursprünglichen Prozess-Startzeiten.

## Zusätzlicher read-only Artefaktabgleich

Die gespeicherte Titan-Profilkonfiguration nennt `anti`; dessen Chart referenziert `Experts/XAU_Titan_Pro.ex5`. Die vorhandene Quelldatei trägt Version 7.10 und SHA256 `518bff6d8f729261ba807c5d8f1fca023cf6ad2baf46d7d2be9e907ea24dc0d2`, identisch zur geprüften Repository-Quelle. Die installierte Binary hat SHA256 `bf17bf43769e813ca4dfaf65f00b4ad5cc380e9f265d4f12ad8523d3e562d1c5`; sie ist nicht bytegleich zum isolierten frischen Compilergebnis. Das beweist weder die Compilerursache noch die aktuell geladene In-Memory-Binary.

Das gespeicherte GoldM15-Default-Profil referenziert `Experts/GoldM15_Reconstruction.ex5`. Die daneben installierte Quelle ist Version 1.21, SHA256 `ad898e5a8a10df7f55512b64da63a25c884241678565e89a3363bf04715b346a`; die Binary hat SHA256 `b7c2345ffa921882a13fa9ab05e1bdab96c18b75924cff7af169e3a3349bb0b1`. Die Repository-Version 1.22 ist damit kein belegter Stand dieses installierten Profilpfads. Ein zusätzliches Verzeichnis `GoldM15_v122` existiert, aber dessen bloße Existenz beweist keine laufende Anbindung.

Profil-Dateien sind gespeicherte Zustände, keine Live-Abfrage des Charts. Es wurden keine Profile, Parameter, Quellen oder Binaries verändert und keine EAs neu angehängt. Für den Recording-Rollout fehlen weiterhin ein vollständiges Include-/Compiler-/Preset-Manifest, eine belegte aktive EA-Identität und die Signal-/Handelsparität. Versionslabels des Dashboards bleiben ausdrücklich unzureichend.

## Zweite isolierte Kompilierung mit Input-Manifest

Auf main aa6bf085 wurden beide Quellen erneut in einem frischen ignorierten Verzeichnis kompiliert: jeweils 0 Fehler/0 Warnungen. [EA_COMPILE_INPUT_MANIFEST.json](audits/2026-10-09/EA_COMPILE_INPUT_MANIFEST.json) bindet den Compiler, beide Hauptquellen, alle vier lokalen Includes und die acht tatsächlich verwendeten Standard-Includes an SHA256 und Dateigröße. Die 15 Input-Artefakte waren vor/nach dem Lauf unverändert; die Includes in beiden tatsächlichen Compilerlogs stimmen mit dem Manifest überein. Absolute private Pfade sind nicht im öffentlichen Manifest enthalten.

Die frischen EX5-Hashes unterscheiden sich vom ersten isolierten Lauf, obwohl die Hauptquellen gleich sind. Byte-reproduzierbare EX5-Erzeugung ist damit nicht nachgewiesen; die Ursache wird nicht aus diesem Vergleich geraten. Die Ergebnisse wurden nicht deployed oder an Charts angehängt. Aktive In-Memory-Binary, Preset-Manifest und Strategy-Tester-Handelsparität bleiben offen. Dieses Manifest schließt den Input-Hash-Nachweis des zweiten isolierten Compilerlaufs, nicht AUD-12 insgesamt.

Nutzerpriorisierung: Strategy-Tester-/Backtest-Paritätsläufe sind auf später verschoben. Die isolierte Kompilierung und technische Sicherheitsregressionen bleiben zulässig; die ausstehende Handelsparität wird nicht als geliefert bezeichnet.
