# MT5-Dateiverteilung – 14.10.2026

- 19 vorhandene lokale MT5-Installationen erkannt; 31 nutzbare Datenordner (portable und Standard-Datenordner) befüllt.
- Pro Datenordner `MQL5/Experts/XAU_Titan_Pro_BasketGuard.ex5` und `.mq5` installiert.
- Alle 15 Sets pro Datenordner nach `MQL5/Presets/BasketGuard_v720/` und als `BasketGuard_v720-<Name>.set` nach `MQL5/Profiles/Tester/` kopiert.
- 992 Zieldateien per SHA-256 gegen die Quellen geprüft: 0 Abweichungen.
- EX5-SHA-256: `133C9E7EBA4F5A318D41553FF49872D8B143337BAC3D8587B329CD362A4BB716`.
- Vorhandene alte EA-Dateien, Charts, Profile, Einstellungen und Live-Positionen nicht verändert. Der neue EA wurde auf keinem Live-Chart gestartet. Ein identisches EX5 in der isolierten Testkopie blieb unverändert.

Die Sets wurden für das Blueberry-Profil `XAUUSD.pi`/M15 vorbereitet. Auf anderen Brokern/Symbolen müssen Kontraktspezifikation, Spread, Ausführungsbedingungen und Kontoregeln vor einem Einsatz separat geprüft werden. `all-off.set` ist die Vergleichsreferenz; die beiden `opt-*.set`-Dateien optimieren jeweils nur einen Parameter. Ein laufendes Terminal zeigt neue EA-Dateien gegebenenfalls erst nach einem Navigator-Refresh oder Neustart an.
