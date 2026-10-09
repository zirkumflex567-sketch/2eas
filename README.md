# 2EAs & Unified Institutional Cockpit

Vollständiges Repository für den parallelen Betrieb von zwei komplementären MetaTrader 5 Expert Advisors (Gold/XAUUSD) inklusive eines einheitlichen Web-Dashboards (Cockpit) zur Echtzeit-Überwachung und Steuerung.

Aktueller Arbeitsstand: [Offene ChartStudio- und Auditfix-Aufgaben](docs/OPEN_TASKS.md) und [Main-Konsolidierung / Testnachweise](docs/MAIN_CONSOLIDATION.md). Die ChartStudio-Beta bleibt für Brokerorders read-only; der native v5-Adapter ist noch ein isolierter Prototyp.

---

## 🤖 1. Die beiden Handelsstrategien (2 EAs)

### A. XAU Titan Pro (v6.0 LIVE)
- **Typ:** Trend-Folge & Momentum-Runner
- **Basis-Timeframe:** M15 (XAUUSD)
- **Hauptlogik:**
  - 1. Bullischer/Bärischer Trend-Fächer (EMA9 vs. EMA21)
  - 2. Trendfilter (EMA50)
  - 3. Basis-EMA Momentum (EMA9)
  - 4. RSI-Momentum (50er Schwelle)
  - 5. Bestätigungskerze (Close > Open)
  - Anti-Trap Schutzfilter: ATR-Überdehnung, Erschöpfungs-Climax & S/R-Widerstandspuffer.
- **Exit:** Dynamischer Trailing-Runner Modus (mind. +$28.00 Gewinn und M15-Schluss unter EMA9) sowie struktureller Swing-SL.

### B. GoldM15 Reconstruction (v1.22 GUARDED)
- **Typ:** Mean-Reversion Pullback mit Multi-Subsystem (S1, S2, S3)
- **Basis-Timeframe:** M15 (XAUUSD)
- **Hauptlogik:**
  - 3 unabhängige Subsysteme mit schnellen RSI-Pullback-Spikes (RSI2, RSI5) im übergeordneten Trendfilter (RSI30, RSI40).
  - Rate-of-Change (ROC) Momentum-Ausstiege.
  - Integrierter News-Filter (USD High-Impact), Feiertagsfilter und Prop-Firm Schutzfilter (Hard-Lock bei Überschreiten der $350 Tagesgrenze).

---

## 🖥️ 2. Institutional Cockpit Dashboard (`app.py`)

Zentrales Dashboard zur Überwachung beider EAs im Browser (lokal und via Reverse-SSH-Tunnel auf Server/Handy erreichbar):

- **Multi-Konto-Gateway (`account_gateway.py`):**
  - Schnelles Umschalten zwischen beiden MT5-Terminals/Konten ohne Neustart.
  - Sichere Isolierung von State und Kontodaten.
- **TradingView Lightweight Charts:**
  - Optimale Ansicht ab Start mit 12 Balken Puffer zur Preisskala.
  - Timeframe-Umschaltung (M1, M5, M15, M30, H1, H4, D1).
  - Ein-/Ausschaltbarer EA-Statustext & Signal-Pfeile (`[ 🏷️ EA-Text: AN/AUS ]`).
  - Automatische Dämpfung weit entfernter S/R-Linien zur Vermeidung von Skalierungsverzerrungen.
- **Volumenprofil & Institutional S/R:**
  - Tägliches und wöchentliches POC, VAH und VAL.
- **Getrenntes Trade-Journal mit PnL-Echtzeit-Tracking:**
  - Strikt nach ausgewählter Strategie getrennt.
  - Prominente PnL-Ausweisung (`LIVE PnL: +$X.XX` bei offenen Trades, `REALISIERT: -$X.XX` bei geschlossenen Trades).
  - Gesamt-PnL, Live-PnL und Realisierter PnL im Kopfbereich.
- **Drawdown- & Risikomanagement:**
  - Live-Puffer, High-Water-Mark und Reset-Funktion.

---

## 🚀 3. Starten des Cockpits

```bash
# Abhängigkeiten installieren
pip install fastapi uvicorn MetaTrader5 pandas numpy pydantic

# Dashboard starten (Standard: Port 8050)
python app.py
```

Im Browser öffnen: `http://127.0.0.1:8050`
