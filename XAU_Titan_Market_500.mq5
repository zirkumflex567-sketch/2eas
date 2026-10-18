//+------------------------------------------------------------------+
//|                                     XAU_Titan_Market_500.mq5     |
//|                             Copyright 2026, Quantitative Systems |
//|        Hybrid Institutional Gold EA: Titan Pro + Market Engine   |
//|               Engineered for 500 USD Account & 1:500 Leverage    |
//|                 Strict M15 Bar-Close Robustness & Mean-Reversion  |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "8.00"
#property description "Hybrid Gold EA combining Titan Pro Momentum with XAUUSD 5 Minute Market Architecture"
#property description "Dual-Engine: Pullback Mean-Reversion & Momentum Swing Scaler"
#property description "Optimized for 500 USD account, 1:500 leverage and M15 Bar-Close Execution"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Kapital- & Risikomanagement (500 USD / 1:500) ==="
input double   InpFixedLot                = 0.01;        // Feste Lotgröße (0.01 = Standard für 500 USD Konto)
input double   InpAutoLotPerBalance       = 0.0;         // Auto-Compounding (z.B. 0.01 Lot je 500 USD; 0.0 = Deaktiviert)
input double   InpRiskPercent             = 0.0;         // Dynamisches % Risiko (0.0 = nutzt InpFixedLot; >0 = Risiko je Trade)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen (Original: 3)
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 M15-Bars = 30 Min)
input ulong    InpMagicNumber             = 885500;      // Magic Number
input string   InpTradeComment            = "Titan_Mkt_500"; // Trade Kommentar

input group "=== 02 / Dual-System Signalarchitektur ==="
input bool     InpEnablePullbackEngine    = true;        // Engine 1: Mean-Reversion Pullback-Einstieg (wie Markt-EA)
input bool     InpEnableMomentumEngine    = true;        // Engine 2: Titan Trend-Momentum Ausbruch
input int      InpTrendEMAPeriod          = 50;          // Mittlerer Trendfilter (M15 EMA50)
input int      InpMacroEMAPeriod          = 200;         // Übergeordneter Trendfilter (M15 EMA200)
input int      InpFastEMAPeriod           = 9;           // Schnelle EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere EMA (M15 EMA21)
input int      InpRSIPeriod               = 14;          // RSI Periode
input double   InpRSIBuyDipThreshold      = 48.0;        // Pullback Buy: RSI Schwelle (<= 48 für Dip-Kauf)
input double   InpRSISellRallyThreshold   = 52.0;        // Pullback Sell: RSI Schwelle (>= 52 für Rally-Verkauf)
input double   InpRSIMinMomentum          = 50.0;        // Momentum Engine: Mindest-RSI (>= 50 für Buy, <= 50 für Sell)
input bool     InpUseMacroTrendFilter     = true;        // Nur in Richtung der übergeordneten EMA200 handeln

input group "=== 03 / Struktureller Swing-SL & Runner-Ausstieg ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL (Original Markt-EA Logik)
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12 Std.)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 15000;       // Max. SL-Abstand in Punkten (150 USD auf Gold)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpExitOnBarCloseOnly      = true;        // Ausstieg nur bei M15-Kerzenschluss (Verhindert Tick-Fehlausstiege!)
input bool     InpUseDynamicExit          = true;        // Dynamischer Ausstieg an EMA9 bei Pullback
input double   InpMinProfitUSDForExit     = 25.0;        // Mindestgewinn in USD je Position vor Dynamic-Exit (0.01 Lot)
input bool     InpAllowIndividualExits    = true;        // Erlaube individuellen Ausstieg einzelner profitabler Positionen
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = Maximale Trendfolge-Runner)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator (0.0 = Unlimitierter Runner Modus)
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Lässt Gold atmen)
input double   InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double   InpBELockUSD               = 15.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 04 / Handelszeiten & Wochenendschutz ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00 Serverzeit; hochprofitabel!)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden (15:00-17:00)
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (01:00 Serverzeit)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute
input bool     InpCloseWeekendFriday      = false;       // Wochenendschutz (false = lässt Runner über Wochenende laufen wie Markt-EA)
input int      InpFridayCloseHour         = 22;          // Freitag Schließung Stunde (Serverzeit)
input int      InpFridayCloseMinute       = 0;           // Freitag Schließung Minute
input bool     InpBlockFridayLateEntries  = false;       // Freitag Spätnachmittag keine neuen Einstiege

input group "=== 05 / Anti-Trap & Überdehnungs-Filter ==="
input bool     InpUseOverextensionFilter  = true;        // Überdehnungs-Schutz (verhindert Gipfelkauf / Bodenverkauf)
input double   InpMaxATRExtension         = 2.0;         // Max. Distanz zu EMA21 in ATR (z.B. 2.0x ATR)
input int      InpATRPeriod               = 14;          // ATR Periode für Volatilitätsmessung

input group "=== 06 / Optionaler Prop-Firm & Drawdown-Schutz ==="
input bool     InpEnablePropProtection    = false;       // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double   InpMaxDailyDrawdownPercent = 4.0;         // Max. Tagesverlust %
input double   InpMaxTotalDrawdownPercent = 10.0;        // Max. Gesamtverlust %
input bool     InpDailyLockoutUntilMidnight = true;      // Nach Tagesverlust Handel bis Mitternacht sperren

//--- Globale Variablen
// Challenge protection is enforced only on the configured Blueberry account.
// This deliberately ignores legacy setfile toggles on every other account.
bool IsBlueberryChallengeAccount()
{
   return AccountInfoInteger(ACCOUNT_LOGIN) == 5120620 &&
          AccountInfoString(ACCOUNT_SERVER) == "BlueberryMarketsSVG-Live";
}
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle  = INVALID_HANDLE;
int            m_macro_ema_handle  = INVALID_HANDLE;
int            m_fast_ema_handle   = INVALID_HANDLE;
int            m_slow_ema_handle   = INVALID_HANDLE;
int            m_rsi_handle        = INVALID_HANDLE;
int            m_atr_handle        = INVALID_HANDLE;

datetime       m_last_m15_bar_time = 0;
datetime       m_last_entry_time   = 0;

// Prop Firm & Daily Tracking
datetime       m_current_day_date        = 0;
double         m_day_start_balance       = 0.0;
double         m_initial_account_balance = 0.0;
double         m_peak_equity             = 0.0;
bool           m_daily_lockout           = false;
bool           m_total_lockout           = false;

//+------------------------------------------------------------------+
//| Setup Robust Live Execution & Broker Filling                     |
//+------------------------------------------------------------------+
void SetupLiveExecution()
{
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(60); // 60 points deviation buffer for Gold
   
   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((filling & SYMBOL_FILLING_FOK) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      m_trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

//+------------------------------------------------------------------+
//| Calculate True Daily Starting Balance                            |
//+------------------------------------------------------------------+
double CalculateDailyStartBalance(datetime today_midnight)
{
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double realized_today = 0.0;

   if(HistorySelect(today_midnight, TimeCurrent()))
   {
      int deals = HistoryDealsTotal();
      for(int i = 0; i < deals; i++)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
         {
            long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
            if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
            {
               realized_today += HistoryDealGetDouble(ticket, DEAL_PROFIT);
               realized_today += HistoryDealGetDouble(ticket, DEAL_SWAP);
               realized_today += HistoryDealGetDouble(ticket, DEAL_COMMISSION);
               realized_today += HistoryDealGetDouble(ticket, DEAL_FEE);
            }
         }
      }
   }
   return (current_balance - realized_today);
}

//+------------------------------------------------------------------+
//| Find Last Entry Time For Magic                                   |
//+------------------------------------------------------------------+
datetime GetLastEntryTimeForMagic()
{
   datetime last_time = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            datetime pos_time = (datetime)m_position.Time();
            if(pos_time > last_time) last_time = pos_time;
         }
      }
   }
   return last_time;
}

//+------------------------------------------------------------------+
//| Count Open Positions For Magic                                   |
//+------------------------------------------------------------------+
int CountOpenPositions()
{
   int count = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            count++;
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Calculate Lot Size: Optimized for 500 USD & 1:500 Leverage       |
//+------------------------------------------------------------------+
double CalculateLotSize(double sl_distance_points)
{
   double lot = InpFixedLot;
   double current_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   // Auto-Compounding Mode (e.g. 0.01 lot per 500 USD)
   if(InpAutoLotPerBalance > 0.0)
   {
      double base_capital = MathMin(current_equity, current_balance);
      int steps = (int)MathFloor(base_capital / InpAutoLotPerBalance);
      if(steps < 1) steps = 1;
      lot = steps * (InpFixedLot > 0.0 ? InpFixedLot : 0.01);
   }
   // Dynamic % Risk Mode (if specified > 0)
   else if(InpRiskPercent > 0.0 && sl_distance_points > 0.0)
   {
      double risk_capital = current_equity * (InpRiskPercent / 100.0);
      double tick_value = 0.0;
      if(!SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, tick_value) || tick_value <= 0.0)
         tick_value = 1.0;
      double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
      double point_val = (tick_value / tick_size) * m_symbol.Point();
      if(point_val > 0.0)
         lot = risk_capital / (sl_distance_points * point_val);
   }

   // Broker Limits
   double min_lot = m_symbol.LotsMin();
   double max_lot = m_symbol.LotsMax();
   double step    = m_symbol.LotsStep();

   if(step > 0.0)
      lot = MathFloor(lot / step) * step;

   if(lot < min_lot) lot = min_lot;
   if(lot > max_lot) lot = max_lot;

   return NormalizeDouble(lot, 2);
}

//+------------------------------------------------------------------+
//| Close All Positions For Magic                                    |
//+------------------------------------------------------------------+
void CloseAllPositionsForMagic()
{
   int total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            m_trade.PositionClose(m_position.Ticket());
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(!m_symbol.Name(_Symbol))
   {
      PrintFormat("Fehler beim Initialisieren des Symbols %s", _Symbol);
      return INIT_FAILED;
   }
   m_symbol.RefreshRates();

   SetupLiveExecution();

   // M15 Indikator-Handles
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_macro_ema_handle = iMA(_Symbol, m_calc_timeframe, InpMacroEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   m_atr_handle       = iATR(_Symbol, m_calc_timeframe, InpATRPeriod);

   if(m_trend_ema_handle == INVALID_HANDLE || m_macro_ema_handle == INVALID_HANDLE ||
      m_fast_ema_handle  == INVALID_HANDLE || m_slow_ema_handle  == INVALID_HANDLE ||
      m_rsi_handle       == INVALID_HANDLE || m_atr_handle       == INVALID_HANDLE)
   {
      Print("Fehler beim Erstellen der Indikator-Handles auf M15!");
      return INIT_FAILED;
   }

   MqlDateTime dt;
   TimeCurrent(dt);
   m_current_day_date        = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = CalculateDailyStartBalance(m_current_day_date);
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);

   m_last_m15_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time   = GetLastEntryTimeForMagic();

   PrintFormat("XAU_Titan_Market_500 initialized. Balance: $%.2f | Leverage: 1:%d | M15 Bar-Close Mode: %s",
               m_initial_account_balance, (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
               InpExitOnBarCloseOnly ? "YES" : "TICK");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_macro_ema_handle != INVALID_HANDLE) IndicatorRelease(m_macro_ema_handle);
   if(m_fast_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_fast_ema_handle);
   if(m_slow_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_slow_ema_handle);
   if(m_rsi_handle       != INVALID_HANDLE) IndicatorRelease(m_rsi_handle);
   if(m_atr_handle       != INVALID_HANDLE) IndicatorRelease(m_atr_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within Trading Window                                   |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   // Weekend Check
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return false;

   // Friday late entry block
   if(dt.day_of_week == 5 && InpBlockFridayLateEntries)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int stop_min_fri    = InpFridayCloseHour * 60;
      if(current_min_fri >= stop_min_fri)
         return false;
   }

   if(InpFilterEliteHours)
   {
      // Asian Session check (Hours 1 to 7)
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

      // News Spike / London Fixing check (Hours 15 to 17)
      if(InpAvoidNewsSpikeHours && (dt.hour >= 15 && dt.hour <= 17))
         return false;
   }

   int current_min = dt.hour * 60 + dt.min;
   int start_min   = InpTradeStartHour * 60 + InpTradeStartMinute;
   int end_min     = InpTradeEndHour * 60 + InpTradeEndMinute;
   return (current_min >= start_min && current_min < end_min);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!m_symbol.RefreshRates())
      return;

   datetime current_m15_time = iTime(_Symbol, m_calc_timeframe, 0);
   bool is_new_m15_bar = (current_m15_time != m_last_m15_bar_time);
   if(is_new_m15_bar)
      m_last_m15_bar_time = current_m15_time;

   MqlDateTime dt;
   TimeCurrent(dt);
   datetime today_date = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));

   // Daily reset at midnight
   if(today_date != m_current_day_date)
   {
      m_current_day_date  = today_date;
      m_day_start_balance = CalculateDailyStartBalance(m_current_day_date);
      if(m_daily_lockout)
      {
         m_daily_lockout = false;
         PrintFormat("NEW DAY UNLOCK: Daily Lockout reset. Start Balance: $%.2f", m_day_start_balance);
      }
   }

   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Optional Prop-Firm Drawdown Protection
   if(IsBlueberryChallengeAccount())
   {
      if(InpMaxDailyDrawdownPercent > 0.0 && m_day_start_balance > 0.0)
      {
         double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = (current_equity < daily_ref) ? (((daily_ref - current_equity) / daily_ref) * 100.0) : 0.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent && !m_daily_lockout)
         {
            PrintFormat("PROP RISK BREACH: Daily DD %.2f%% >= Limit %.2f%%. Closing positions.",
                        daily_dd_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            if(InpDailyLockoutUntilMidnight)
               m_daily_lockout = true;
         }
      }

      if(InpMaxTotalDrawdownPercent > 0.0 && m_initial_account_balance > 0.0)
      {
         double total_dd_pct = (current_equity < m_initial_account_balance) ?
                               (((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0) : 0.0;
         if(total_dd_pct >= InpMaxTotalDrawdownPercent && !m_total_lockout)
         {
            PrintFormat("PROP RISK BREACH: Total DD %.2f%% >= Limit %.2f%%. Halting EA.",
                        total_dd_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }
   }

   if(m_daily_lockout || m_total_lockout)
   {
      UpdateDashboard(dt);
      return;
   }

   // 2. Manage Active Positions (Dynamic Runner Exit)
   // If InpExitOnBarCloseOnly is true, only evaluate exit at completed M15 candle close!
   if(!InpExitOnBarCloseOnly || is_new_m15_bar)
   {
      ManageOpenPositions(dt, is_new_m15_bar);
   }

   // 3. New Entry Checks strictly on M15 Bar Close
   if(is_new_m15_bar && IsWithinTradingWindow(dt))
   {
      int open_count = CountOpenPositions();
      if(open_count < InpMaxOpenPositions)
      {
         if(current_m15_time > m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe)))
         {
            CheckSignalAndTrade();
         }
      }
   }

   // 4. Update HUD Dashboard
   UpdateDashboard(dt);
}

//+------------------------------------------------------------------+
//| Check Entry Conditions and Execute Trade                         |
//+------------------------------------------------------------------+
void CheckSignalAndTrade()
{
   double trend_ema[3], macro_ema[3], fast_ema[3], slow_ema[3], rsi_val[3], atr_val[3];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 3, trend_ema) < 3) return;
   if(CopyBuffer(m_macro_ema_handle, 0, 1, 3, macro_ema) < 3) return;
   if(CopyBuffer(m_fast_ema_handle,  0, 1, 3, fast_ema)  < 3) return;
   if(CopyBuffer(m_slow_ema_handle,  0, 1, 3, slow_ema)  < 3) return;
   if(CopyBuffer(m_rsi_handle,       0, 1, 3, rsi_val)   < 3) return;
   if(CopyBuffer(m_atr_handle,       0, 1, 3, atr_val)   < 3) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   double close1 = rates[0].close;
   double open1  = rates[0].open;
   double high1  = rates[0].high;
   double low1   = rates[0].low;

   // Structural Swing High and Low
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // Anti-Trap & Overextension Guard
   bool buy_not_overextended  = true;
   bool sell_not_overextended = true;
   if(InpUseOverextensionFilter && atr_val[0] > 0.0)
   {
      double max_dist = InpMaxATRExtension * atr_val[0];
      if((close1 - slow_ema[0]) > max_dist) buy_not_overextended = false;
      if((slow_ema[0] - close1) > max_dist) sell_not_overextended = false;
   }

   // Directional Macro Trend Filter
   bool macro_uptrend   = true;
   bool macro_downtrend = true;
   if(InpUseMacroTrendFilter)
   {
      macro_uptrend   = (close1 > macro_ema[0]) || (trend_ema[0] > macro_ema[0]);
      macro_downtrend = (close1 < macro_ema[0]) || (trend_ema[0] < macro_ema[0]);
   }

   // --- ENGINE 1: Pullback Mean-Reversion Signal (Markt-EA Architektur) ---
   // In einem Aufwärtstrend dippt der Preis in die EMA9/EMA21 Zone (RSI fällt ab) und schließt bullisch
   bool pullback_buy = false;
   bool pullback_sell = false;

   if(InpEnablePullbackEngine)
   {
      // Buy: Übergeordnet aufwärts, Candle berührte EMA9/EMA21 von oben, RSI war im Dip, Candle schließt grün über EMA9
      if(macro_uptrend && (trend_ema[0] >= macro_ema[0] || close1 > trend_ema[0]))
      {
         bool touched_value = (low1 <= fast_ema[0] || low1 <= slow_ema[0]);
         bool rsi_in_dip    = (rsi_val[0] <= InpRSIBuyDipThreshold || rsi_val[1] <= InpRSIBuyDipThreshold);
         bool bullish_turn  = (close1 > open1) && (close1 >= fast_ema[0]);
         if(touched_value && rsi_in_dip && bullish_turn && buy_not_overextended)
            pullback_buy = true;
      }

      // Sell: Übergeordnet abwärts, Candle rallyte in EMA9/EMA21 Zone, RSI war erhöht, Candle schließt rot unter EMA9
      if(macro_downtrend && (trend_ema[0] <= macro_ema[0] || close1 < trend_ema[0]))
      {
         bool touched_value  = (high1 >= fast_ema[0] || high1 >= slow_ema[0]);
         bool rsi_in_rally   = (rsi_val[0] >= InpRSISellRallyThreshold || rsi_val[1] >= InpRSISellRallyThreshold);
         bool bearish_turn   = (close1 < open1) && (close1 <= fast_ema[0]);
         if(touched_value && rsi_in_rally && bearish_turn && sell_not_overextended)
            pullback_sell = true;
      }
   }

   // --- ENGINE 2: Titan High-Momentum Trend Continuation Signal ---
   bool momentum_buy = false;
   bool momentum_sell = false;

   if(InpEnableMomentumEngine)
   {
      momentum_buy = (close1 > fast_ema[0]) && 
                     (fast_ema[0] > slow_ema[0]) && 
                     (close1 > trend_ema[0]) && 
                     (rsi_val[0] >= InpRSIMinMomentum) && 
                     (close1 > open1) &&
                     macro_uptrend &&
                     buy_not_overextended;

      momentum_sell = (close1 < fast_ema[0]) && 
                      (fast_ema[0] < slow_ema[0]) && 
                      (close1 < trend_ema[0]) && 
                      (rsi_val[0] <= InpRSIMinMomentum) && 
                      (close1 < open1) &&
                      macro_downtrend &&
                      sell_not_overextended;
   }

   bool final_buy  = (pullback_buy || momentum_buy);
   bool final_sell = (pullback_sell || momentum_sell);

   // Synchronisierter Swing-SL für die gesamte Basket-Gruppe (wie im Markt-EA)
   double sl_anchor = 0.0;
   int open_pos_count = CountOpenPositions();
   if(open_pos_count > 0)
   {
      // Lese bestehenden SL der offenen Positionen aus
      for(int i = 0; i < PositionsTotal(); i++)
      {
         if(m_position.SelectByIndex(i))
         {
            if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            {
               double pos_sl = m_position.StopLoss();
               if(pos_sl > 0.0) { sl_anchor = pos_sl; break; }
            }
         }
      }
   }

   if(final_buy)
   {
      double entry_price = m_symbol.Ask();
      double sl_price    = (sl_anchor > 0.0) ? sl_anchor : (swing_low - buffer);
      double sl_dist_pts = (entry_price - sl_price) / m_symbol.Point();

      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price - (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price - (InpMaxSLPoints * m_symbol.Point());
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());

      double sl_dist = entry_price - sl_price;
      double tp_price = 0.0;
      if(InpUseTakeProfit && InpTPRatio > 0.0)
         tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist_pts);
      string comment = StringFormat("%s_%s", InpTradeComment, pullback_buy ? "PB" : "MOM");

      if(lot_size > 0.0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Ask();
            if(m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, comment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("BUY SUCCESS [%s]: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f",
                           comment, lot_size, entry_price, sl_price, tp_price);
               break;
            }
            Sleep(150);
         }
      }
   }
   else if(final_sell)
   {
      double entry_price = m_symbol.Bid();
      double sl_price    = (sl_anchor > 0.0) ? sl_anchor : (swing_high + buffer);
      double sl_dist_pts = (sl_price - entry_price) / m_symbol.Point();

      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price + (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price + (InpMaxSLPoints * m_symbol.Point());
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());

      double sl_dist = sl_price - entry_price;
      double tp_price = 0.0;
      if(InpUseTakeProfit && InpTPRatio > 0.0)
         tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist_pts);
      string comment = StringFormat("%s_%s", InpTradeComment, pullback_sell ? "PB" : "MOM");

      if(lot_size > 0.0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Bid();
            if(m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, comment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("SELL SUCCESS [%s]: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f",
                           comment, lot_size, entry_price, sl_price, tp_price);
               break;
            }
            Sleep(150);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Manage Open Positions (High-Profit Runner & Dynamic Exits)       |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt, bool is_bar_close)
{
   double fast_ema[2];
   if(CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) < 2) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Optional Break-Even
   if(InpUseBreakEven)
   {
      for(int i = total - 1; i >= 0; i--)
      {
         if(m_position.SelectByIndex(i))
         {
            if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            {
               ulong ticket = m_position.Ticket();
               double open_p = m_position.PriceOpen();
               double cur_sl = m_position.StopLoss();
               double pos_profit = m_position.Profit() + m_position.Swap();
               double vol = m_position.Volume();
               
               double tick_val = 1.0;
               SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, tick_val);
               double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
               double usd_per_price_unit = (vol / 0.01) * (tick_val * (1.0 / tick_size)) * 0.01;
               if(usd_per_price_unit <= 0.0) usd_per_price_unit = 100.0 * vol;

               double lock_price_dist = InpBELockUSD / usd_per_price_unit;

               if(m_position.PositionType() == POSITION_TYPE_BUY)
               {
                  double be_target_sl = NormalizeDouble(open_p + lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpBETriggerUSD && (cur_sl < open_p || cur_sl == 0.0))
                     m_trade.PositionModify(ticket, be_target_sl, m_position.TakeProfit());
               }
               else if(m_position.PositionType() == POSITION_TYPE_SELL)
               {
                  double be_target_sl = NormalizeDouble(open_p - lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpBETriggerUSD && (cur_sl > open_p || cur_sl == 0.0))
                     m_trade.PositionModify(ticket, be_target_sl, m_position.TakeProfit());
               }
            }
         }
      }
   }

   // 2. Weekend Protection (Glattstellung vor dem Wochenende falls aktiv)
   if(InpCloseWeekendFriday && dt.day_of_week == 5)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int close_min_fri   = InpFridayCloseHour * 60 + InpFridayCloseMinute;
      if(current_min_fri >= close_min_fri)
      {
         CloseAllPositionsForMagic();
         PrintFormat("WEEKEND PROTECTION EXIT: Freitagabend %02d:%02d erreicht. Positionen geschlossen.", dt.hour, dt.min);
         return;
      }
   }

   // 3. Dynamic Runner Exit Evaluation
   if(!InpUseDynamicExit) return;

   // Lese letzten abgeschlossenen Kerzenkurs (M15 Close)
   MqlRates last_bar[];
   ArraySetAsSeries(last_bar, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, 1, last_bar) < 1) return;
   double check_price = InpExitOnBarCloseOnly ? last_bar[0].close : (m_symbol.Bid());

   // A) Individuelle Positions-Schließung (wie Markt-EA)
   if(InpAllowIndividualExits)
   {
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(m_position.SelectByIndex(i))
         {
            if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            {
               ulong ticket = m_position.Ticket();
               double pos_profit = m_position.Profit() + m_position.Swap();
               ENUM_POSITION_TYPE p_type = m_position.PositionType();

               if(pos_profit >= InpMinProfitUSDForExit)
               {
                  bool exit_pos = false;
                  if(p_type == POSITION_TYPE_BUY)
                  {
                     // Kerzenschluss unter EMA9 nach erreichter Mindestgewinnschwelle
                     if(check_price < fast_ema[0]) exit_pos = true;
                  }
                  else if(p_type == POSITION_TYPE_SELL)
                  {
                     // Kerzenschluss über EMA9 nach erreichter Mindestgewinnschwelle
                     if(check_price > fast_ema[0]) exit_pos = true;
                  }

                  if(exit_pos)
                  {
                     m_trade.PositionClose(ticket);
                     PrintFormat("INDIVIDUAL RUNNER EXIT (#%d): Profit: $%.2f (CheckPrice: %.2f vs EMA9: %.2f)",
                                 ticket, pos_profit, check_price, fast_ema[0]);
                  }
               }
            }
         }
      }
   }
   // B) Gesamt-Korb-Schließung
   else
   {
      int my_positions = 0;
      ENUM_POSITION_TYPE basket_type = POSITION_TYPE_BUY;
      double total_profit_usd = 0.0;

      for(int i = total - 1; i >= 0; i--)
      {
         if(m_position.SelectByIndex(i))
         {
            if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            {
               my_positions++;
               basket_type = m_position.PositionType();
               total_profit_usd += m_position.Profit() + m_position.Swap();
            }
         }
      }

      if(my_positions == 0) return;

      double avg_profit_per_pos = total_profit_usd / my_positions;
      if(avg_profit_per_pos >= InpMinProfitUSDForExit)
      {
         bool close_basket = false;
         if(basket_type == POSITION_TYPE_BUY && check_price < fast_ema[0])
            close_basket = true;
         else if(basket_type == POSITION_TYPE_SELL && check_price > fast_ema[0])
            close_basket = true;

         if(close_basket)
         {
            CloseAllPositionsForMagic();
            PrintFormat("BASKET RUNNER EXIT (%d pos): Total: $%.2f | Avg: $%.2f",
                        my_positions, total_profit_usd, avg_profit_per_pos);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Update Modern HUD Dashboard                                      |
//+------------------------------------------------------------------+
void UpdateDashboard(const MqlDateTime &dt)
{
   if(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE))
      return;

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   double pl  = eq - bal;
   int open_c = CountOpenPositions();
   int lev    = (int)AccountInfoInteger(ACCOUNT_LEVERAGE);

   string text = "";
   text += "====================================================\n";
   text += "   XAU_TITAN_MARKET_500 | HYBRID GOLD PRO ARCHITECTURE\n";
   text += "====================================================\n";
   text += StringFormat(" Konto-Saldo:      $%.2f\n", bal);
   text += StringFormat(" Konto-Equity:     $%.2f (Floating PnL: %+.2f)\n", eq, pl);
   text += StringFormat(" Hebel / Lot:      1:%d | %.2f Lot (%s)\n", lev, InpFixedLot, InpAutoLotPerBalance > 0 ? "Auto-Scale" : "Fixed");
   text += StringFormat(" Offene Positionen:%d / %d\n", open_c, InpMaxOpenPositions);
   text += StringFormat(" Ausführungsmodus: %s\n", InpExitOnBarCloseOnly ? "M15 Bar-Close (Robust)" : "Intrabar Tick");
   text += StringFormat(" Signal-Engines:   Pullback=%s | Momentum=%s\n", InpEnablePullbackEngine ? "ON" : "OFF", InpEnableMomentumEngine ? "ON" : "OFF");
   text += StringFormat(" Wochenendschutz:  %s\n", InpCloseWeekendFriday ? "Aktiv (Fr 22:00 Close)" : "Deaktiviert (Runner über WE)");
   text += "====================================================\n";

   Comment(text);
}
