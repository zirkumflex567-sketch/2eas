# EA-/Preset-Inventur: Read-only Demo-Belege (21.10.2026)

## Umfang und Grenzen

Die vorhandene `account_gateway.session` wurde nur mit den explizit freigegebenen Aliasen `titan`, `xau5m_m5`, `titan_m5`, `xau5m_500` und `goldm15` verwendet. Bei allen fünf stimmten konfigurierte Identität, Server und Terminalpfad; die Terminals waren verbunden. Blueberry wurde weder initialisiert noch abgefragt. Danach wurden ausschließlich deren Expertenlogs, gespeicherte Chartprofile und installierte EX5-Dateien gelesen.

Die Prüfung hat keinen Chart geöffnet oder verändert, keinen EA angehängt, kein Preset geladen, keine Handelsaktion ausgelöst und keine Terminal-Einstellung umgeschaltet. Logs und gespeicherte Profile belegen keinen vollständigen aktuellen In-Memory-Zustand.

## Neueste Expert-Logaktivität

| Alias | Logbeleg vom 21.10. | Einordnung |
|---|---|---|
| `titan` | `XAU_Titan_Pro_BasketGuard` auf XAUUSD/M15; erfolgreicher SELL-Eintrag um 03:15. | Widerspricht der Dashboard-Konfiguration `Marketplace XAUUSD 5 minute`; späterer In-Memory-Wechsel ist aus diesen Logs nicht belegbar. |
| `xau5m_m5` | `XAU_Titan_Pro_BasketGuard` auf XAUUSD.p/M15; wiederholte 0,01-Lot-Versuche wurden wegen `not enough money` abgewiesen, letzter gefundener Eintrag um 12:29. | Belegt EA-Aktivität und Ablehnung, nicht den geladenen `.set`-Hash. |
| `titan_m5` | `XAU_Titan_Pro_BasketGuard` auf XAUUSD.p/M15; erfolgreicher SELL-Eintrag um 03:15. | Historischer Aktivitätsbeleg, kein Hashnachweis des laufenden EA. |
| `xau5m_500` | Keine passende aktuelle Expert-Logzeile im jüngsten Tageslog. | Gespeicherte Profile unten zeigen Marketplace-Charts, aber nicht den aktuellen Attach. |
| `goldm15` | Keine passende aktuelle Expert-Logzeile im jüngsten Tageslog. | Gespeichertes Profil unten zeigt GoldM15, beweist aber keinen aktiven Attach. |

## Gespeicherte Profile und On-Disk-Dateien

Gespeicherte `MQL5/Profiles/Charts`-Dateien enthalten auf `xau5m_500` Marketplace-`XAUUSD 5 minute`-Charts für M5 und M15. Auf `goldm15` enthält ein gespeichertes M15-Profil `GoldM15_Reconstruction`. Diese Dateien können älter sein als der im Terminal aktuell offene Chart. Der Wert `LastExpert` in `terminal.ini` ist lediglich die zuletzt gewählte Expert-Datei und wird nicht als Attach-Nachweis verwendet.

Die Hashes der vier aktuellen, nicht-Blueberry-Setfiles im Nutzerordner `Downloads/backtest/set` sind:

| Aliaszuordnung | Datei | SHA-256 |
|---|---|---|
| `titan` / ICMarkets-10k | `icmarkets10k.set` | `C0320BE28583C9376852B0946C57F36742CC1120EFDD525DA35A5A89A9211E04` |
| `xau5m_m5` / PU Prime 250 | `puprime250.set` | `FF92CE8710E151CB73D304E411338C411DB487BC3983F15EEC541138A0AEA286` |
| `titan_m5` / PU Prime 500 Titan | `puprime500.set` | `FEB3030FEE155BB41E8604A67117519F97DB00BEAC614E103180813FAF697E69` |
| `xau5m_500` / PU Prime 500 Marketplace | `xauusd5min15m.set` | `32880024DC1ACCA8F31C75718D82ABD190D971350AB51C21131D648FF27C0385` |

Diese Hashes identifizieren nur die Dateien auf der Platte; sie beweisen nicht, dass ein aktiver Chart diese Dateien geladen hat. Für `goldm15` wurde aus diesem Vierer-Setfile-Satz keine Presetzuordnung abgeleitet.

Die isoliert gebauten Titan-RecordOnly-EAs liegen in getrennten Experts-Unterordnern und wurden nicht an Charts angehängt:

- `xau5m_m5`: `XAU_Titan_Pro_BasketGuard_EvidenceCapture_RecordOnly_xau5m_m5_8cf287e0.ex5`, SHA-256 `8CF287E0C42A891171285CB203918B25CA0960B8E5787C93989B1BB0024F2E45`.
- `titan_m5`: `XAU_Titan_Pro_BasketGuard_EvidenceCapture_RecordOnly_titan_m5_2cfaae0f.ex5`, SHA-256 `2CFAAE0F62B89E6065A5E0F33FD29295D70ED11D679C7BD07A080BEE33E17F33`.

## Ergebnis und nächster Nachweis

Der Recorderstatus nach dem Restart auf Main `2719359` meldete für alle fünf Demoaliase Lifecycle `OK/ROLLING_WINDOW` ohne Lücken oder Storeverluste. `xau5m_m5` und `titan_m5` hatten je 60 Temp-Dateien und null neue Decision-Imports; `titan` und `xau5m_500` waren `NOT_CONFIGURED`, `goldm15` wartete auf neue Events. Damit bleibt FR-026 offen.

Für einen frischen Decision-Nachweis muss auf einem zusätzlichen PU-Prime-500-Demo-Chart `XAUUSD.p/M15` der bereits installierte RecordOnly-Kandidat von `titan_m5` initialisiert werden. Der Nutzer hat diese manuelle Chartaktion erbeten, während Computer-Use ausgeschlossen bleibt. Danach kann der Read-only-Status auf einen neuen Import geprüft werden. Keine Backtests, keine Brokerwrites und keine Blueberry-Abfrage.
