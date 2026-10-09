# Explizite Brokerzeit: UTC+3 für die beiden Demo-Konten

Der Live-GET-Test bestätigte am 09.10.2026 bei Titan/GoldM15 auf ICMarketsEU-Demo einen Tickzeitwert rund 10800 Sekunden vor dem UTC-Epochwert der Systemuhr. Die neue strikte Frischeprüfung sperrte damit zunächst korrekt alle Steueraktionen. Der Benutzer hat ausdrücklich zugestimmt, **UTC+3 pro Konto** zu konfigurieren und weiterzutesten.

`account_gateway.ACCOUNTS[*].broker_utc_offset_seconds = 10800` ist eine explizite Deployment-Policy, kein automatisch aus laufenden Quotes ermittelter Offset. `broker_clock.py` validiert den Offset. Ein Brokerwechsel auf UTC+2 bleibt ohne bewusste Konfigurationsänderung gesperrt; kein Ausweiten der 30s-Frischegrenze und keine automatische Reparatur der Uhr.

- Tick-Frische: `quote_broker_time_epoch` ist roh; `quote_time_epoch` ist um 10800s normalisierter UTC-Epochwert für den Browser. `quote_age_seconds` vergleicht diesen mit der tatsächlichen UTC-Wanduhr.
- Header: SERVER zeigt rohe Brokerzeit; DE verwendet normalisierten UTC-Epochwert plus Europe/Berlin. Journal verwendet denselben Vertrag.
- Risikotag: Broker-Mitternacht/konfigurierte Resetstunde wird von **Wanduhr UTC + konfiguriertem Offset**, nicht vom letzten Tick abgeleitet. Persistierte Resetzeitstempel sind UTC; Risiko-Datum ist das Datum des Broker-Risikotags. Vorherige Konfigurationen werden nicht auf Platte geändert.
- MT5-Historienabfragen: Datumsgrenzen werden in die konfigurierte Broker-Epochbasis übersetzt. Historischer Cutoff bleibt ausdrücklich `08.10.2026 23:00 UTC`; offene Positionen bleiben unabhängig davon sichtbar.
- Guarddatei: Tagesvalidierung benutzt Broker-Wanduhrbasis passend zur EA-Datei; daraus wird weiterhin kein EA-Heartbeat oder Ausführungsnachweis behauptet.
- Charts und EAs: Chart-Zeitdaten/Endpunkte bleiben unverändert. Keine Orders, Resets oder EA-Parameter live geändert.

Tests: UTC+3 Quote, alte Quote, falscher Offset/DST-Wechsel, Frischegrenze, Broker-Mitternacht, Header-/Journal-Berlin-Zeit und Historienquerygrenzen. Brokerfreie Standardfixtures deklarieren UTC+0; separate Offsettests prüfen die echte UTC+3-Policy. Diese deklarierte Fixturebasis darf nicht als Realbroker-Test missverstanden werden.

Live-Nachweis nach Konfiguration: beide Konten HTTP200, `source_fresh=true`, Quote-Alter etwa 0–1s; Header Server09:54/DE08:54; Gold-Tagesbasis bestätigt. Reine GETs, keine Mutationen.
