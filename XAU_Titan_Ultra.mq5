//+------------------------------------------------------------------+
//|                                             XAU_Titan_Ultra.mq5  |
//|                             Copyright 2026, Quantitative Systems |
//|           Institutional Gold Trend & Pullback EA - FORK v8.0     |
//|                 LOW-LOSS CHAMPION ULTRA (HEBEL 1, 2, 3)          |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "8.00"
#property description "XAU Titan Ultra - Low-Loss Fork with Trend Invalidation & Profit Lock"
#property description "Hebel 1: Trend-Invalidation Exit (Trendbruch-Notaus)"
#property description "Hebel 2: SL-Deckelung auf 9.000 Punkte (Kappt $150 Riesen-Verluste)"
#property description "Hebel 3: Soft-Profit-Lock (Sichert Runner ab $45 vor -$80 Rückfall)"
#property description "Blueberry Funded Prop-Firm Ready (3.5% Daily / 9.0% Total Drawdown)"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double   InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = % Risiko; >0.0 = Fixe Lotgröße)
input double   InpRiskPercent             = 0.5;         // Dynamisches % Risiko (0.5% = Rekord-Benchmark)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 Bars = 30 Min)
input ulong    InpMagicNumber             = 881133;      // Magic Number (881133 für Ultra Fork)
input string   InpTradeComment            = "Titan_Ultra_v8"; // Trade Kommentar

input group "=== 02 / Struktureller Swing-SL & Runner-Ausstieg ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12 Stunden)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 9000;        // HEBEL 2: Max. SL-Abstand in Punkten (Gedeckelt auf 90 USD - keine $150 Riesen-Verluste!)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg an EMA9
input double   InpMinProfitUSDForExit     = 28.0;        // Mindestgewinn in USD pro Trade vor Ausstieg an EMA9
input bool     InpCloseInProfitAtSessionEnd = false;     // Session-Ende Schließung
input double   InpSessionEndMinProfitUSD  = 5.0;         // Mindestgewinn für Session-Ende Schließung in USD
input bool     InpUseTakeProfit           = false;       // Fester Take Profit
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator

input group "=== 02b / HEBEL 1: Trend-Invalidation Exit (Trendbruch Notaus) ==="
input bool     InpUseTrendInvalidationExit = true;       // Trend-Invalidation aktiv (Beendet Verlusttrades früh bei Trendbruch)

input group "=== 02c / HEBEL 3: Soft-Profit-Lock (Gewinnsicherung) ==="
input bool     InpUseSoftProfitLock       = true;        // Soft-Profit-Lock aktiv
input double   InpSoftLockTriggerUSD      = 45.0;        // Trigger: Sobald Position +$45 Gewinn erreicht
input double   InpSoftLockProtectUSD      = 5.0;         // Sicherung: SL auf +$5 nachziehen (schützt vor vollem -$80 Rückfall)

input group "=== 02d / Klassischer Break-Even (Optional, Standard: Aus) ==="
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (Standard: false)
input double   InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double   InpBELockUSD               = 15.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00) (hochprofitabel!)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden (false = Pflicht, da 15-17 Uhr Rekordgewinne bringt!)
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool     InpEnablePropProtection    = true;        // Harter Prop-Firm Notaus aktiv
input double   InpMaxDailyDrawdownPercent = 3.5;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 9.0;         // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input bool     InpTotalDDBasedOnInitial   = true;        // Max Drawdown Basis (statisch vom Startkapital)
input bool     InpDailyLockoutUntilMidnight = true;      // Pause bis Mitternacht nach Tagesverlust
input double   InpPhaseProfitTargetPct    = 0.0;         // Phasen-Ziel % (0.0 = Deaktiviert)

input group "=== 05 / Trend-Momentum Indikatoren (M15 Basis) ==="
input int      InpTrendEMAPeriod          = 50;          // Übergeordneter Trendfilter (M15 EMA50)
input int      InpFastEMAPeriod           = 9;           // Schnelle Basis-EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere Trend-EMA (M15 EMA21)
input int      InpRSIPeriod               = 14;          // RSI Periode (M15 RSI14)
input double   InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

//--- Global Variables
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

// Hardcode calculation strictly to PERIOD_M15 to match the original architecture
ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
int            m_rsi_handle       = INVALID_HANDLE;
datetime       m_last_m15_bar_time = 0;
datetime       m_last_entry_time   = 0;

// Prop Firm & Daily State Tracking
datetime       m_current_day_date = 0;
double         m_day_start_balance = 0.0;
double         m_initial_account_balance = 0.0;
double         m_peak_equity = 0.0;
bool           m_daily_lockout = false;
bool           m_total_lockout = false;
bool           m_target_reached = false;

// Forward declarations
void SetupLiveExecution();
double CalculateDailyStartBalance(datetime today_midnight);
bool IsWithinTradingWindow(const MqlDateTime &dt);
void CheckSignalAndTrade();
void ManageOpenPositions(const MqlDateTime &dt);
double CalculateLotSize(double sl_dist_price);
int CountOpenPositions();
void CloseAllPositionsForMagic();
void UpdateDashboard(const MqlDateTime &dt);

//+------------------------------------------------------------------+
//| Setup Robust Live Execution & Broker Filling                     |
//+------------------------------------------------------------------+
void SetupLiveExecution()
{
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(50); // 50 points deviation to prevent requotes in fast Gold moves
   
   // Auto-detect broker filling mode
   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((filling & SYMBOL_FILLING_FOK) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      m_trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

//+------------------------------------------------------------------+
//| Calculate True Daily Starting Balance (Live Restart Safe)        |
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

   double start_bal = current_balance - realized_today;
   return (start_bal > 0) ? start_bal : current_balance;
}

//+------------------------------------------------------------------+
//| Get Last Entry Time from Open Positions and Deal History         |
//+------------------------------------------------------------------+
datetime GetLastEntryTimeForMagic()
{
   datetime last_time = 0;

   // 1. Check currently open positions for this magic number
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            datetime pos_time = (datetime)m_position.Time();
            if(pos_time > last_time)
               last_time = pos_time;
         }
      }
   }

   // 2. Check deals in recent history (past 48 hours)
   datetime now = TimeCurrent();
   if(HistorySelect(now - 172800, now))
   {
      int deals = HistoryDealsTotal();
      for(int i = deals - 1; i >= 0; i--)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
         {
            long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
            string sym = HistoryDealGetString(ticket, DEAL_SYMBOL);
            long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
            if(magic == InpMagicNumber && sym == _Symbol && entry == DEAL_ENTRY_IN)
            {
               datetime deal_time = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
               if(deal_time > last_time)
                  last_time = deal_time;
            }
         }
      }
   }

   return last_time;
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(!m_symbol.Name(_Symbol))
   {
      PrintFormat("Error initializing symbol %s", _Symbol);
      return INIT_FAILED;
   }
   m_symbol.RefreshRates();

   SetupLiveExecution();

   // Create indicator handles strictly on M15
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);

   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE ||
      m_slow_ema_handle == INVALID_HANDLE  || m_rsi_handle == INVALID_HANDLE)
   {
      Print("FATAL: Failed to create indicator handles on M15.");
      return INIT_FAILED;
   }

   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_peak_equity = AccountInfoDouble(ACCOUNT_EQUITY);

   MqlDateTime dt;
   TimeCurrent(dt);
   m_current_day_date  = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   m_day_start_balance = CalculateDailyStartBalance(m_current_day_date);

   // Live Restart Protection: Synchronize bar time and last entry time from history/positions
   m_last_m15_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time   = GetLastEntryTimeForMagic();

   PrintFormat("=== XAU TITAN ULTRA v8.0 INITIALIZED ===");
   PrintFormat("Symbol: %s | Timeframe: M15 | Balance: $%.2f | Day Start: $%.2f | Last Entry: %s",
               _Symbol, m_initial_account_balance, m_day_start_balance,
               (m_last_entry_time > 0) ? TimeToString(m_last_entry_time, TIME_DATE|TIME_MINUTES|TIME_SECONDS) : "None");
   PrintFormat("Hebel 1 (Trend Invalidation): %s | Hebel 2 (Max SL): %d pts | Hebel 3 (Soft Profit Lock): %s (Trigger $%.1f)",
               InpUseTrendInvalidationExit ? "ON" : "OFF", InpMaxSLPoints, InpUseSoftProfitLock ? "ON" : "OFF", InpSoftLockTriggerUSD);

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_fast_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_fast_ema_handle);
   if(m_slow_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_slow_ema_handle);
   if(m_rsi_handle       != INVALID_HANDLE) IndicatorRelease(m_rsi_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Institutional Trading Window (Server Time Filtering)             |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   if(InpFilterEliteHours)
   {
      // 1. Asian Session Switch (Hours 1 to 7)
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

      // 2. US News Spike & London Fixing (Hours 15 to 17)
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

   // Daily reset at midnight (Live robust)
   if(today_date != m_current_day_date)
   {
      m_current_day_date  = today_date;
      m_day_start_balance = CalculateDailyStartBalance(m_current_day_date);
      if(m_daily_lockout)
      {
         m_daily_lockout = false;
         PrintFormat("NEW DAY UNLOCK: Daily Lockout reset for %04d.%02d.%02d. Start Balance: $%.2f. Trading resumed.",
                     dt.year, dt.mon, dt.day, m_day_start_balance);
      }
   }

   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Hard Blueberry Funded Prop-Firm Drawdown Protection
   if(InpEnablePropProtection)
   {
      // Daily Drawdown Protection (Calculated against true day start balance)
      if(InpMaxDailyDrawdownPercent > 0.0 && m_day_start_balance > 0.0)
      {
         double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = (current_equity < daily_ref) ? (((daily_ref - current_equity) / daily_ref) * 100.0) : 0.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent && !m_daily_lockout)
         {
            PrintFormat("BLUEBERRY RISK BREACH: Daily DD %.2f%% >= Limit %.2f%%. Closing all positions.",
                        daily_dd_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            if(InpDailyLockoutUntilMidnight)
            {
               m_daily_lockout = true;
               Print("DAILY LOCKOUT ENGAGED: Trading paused until 00:00 midnight server time.");
            }
         }
      }

      // Total Overall Drawdown Protection
      if(InpMaxTotalDrawdownPercent > 0.0)
      {
         double total_dd_pct = 0.0;
         if(InpTotalDDBasedOnInitial)
         {
            total_dd_pct = (current_equity < m_initial_account_balance) ?
               (((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0) : 0.0;
         }
         else
         {
            total_dd_pct = (current_equity < m_peak_equity && m_peak_equity > 0.0) ?
               (((m_peak_equity - current_equity) / m_peak_equity) * 100.0) : 0.0;
         }

         if(total_dd_pct >= InpMaxTotalDrawdownPercent && !m_total_lockout)
         {
            PrintFormat("BLUEBERRY RISK BREACH: Total DD %.2f%% >= Limit %.2f%%. Permanent kill switch.",
                        total_dd_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }

      // Profit Target Protection (Lock Phase Pass)
      if(InpPhaseProfitTargetPct > 0.0)
      {
         double profit_pct = ((current_equity - m_initial_account_balance) / m_initial_account_balance) * 100.0;
         if(profit_pct >= InpPhaseProfitTargetPct && !m_target_reached)
         {
            PrintFormat("BLUEBERRY GOAL REACHED! Profit reached %.2f%% >= Target %.2f%%. Halting EA.",
                        profit_pct, InpPhaseProfitTargetPct);
            CloseAllPositionsForMagic();
            m_target_reached = true;
         }
      }
   }

   if(m_daily_lockout || m_total_lockout || m_target_reached)
   {
      UpdateDashboard(dt);
      return;
   }

   // 2. Manage Active Positions (Dynamic Momentum & Invalidation & Soft Lock)
   ManageOpenPositions(dt);

   // 3. Check for New Entry on M15 Bar Close (Live Race Condition Protected)
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
//| Check Entry Conditions and Execute Trade (With Retry Logic)      |
//+------------------------------------------------------------------+
void CheckSignalAndTrade()
{
   double trend_ema[2], fast_ema[2], slow_ema[2], rsi_val[2];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) < 2)   return;
   if(CopyBuffer(m_slow_ema_handle, 0, 1, 2, slow_ema) < 2)   return;
   if(CopyBuffer(m_rsi_handle, 0, 1, 2, rsi_val) < 2)         return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   double close1 = rates[0].close;
   double open1  = rates[0].open;

   // 12-Hour Structural Swing High and Low
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // --- INSTITUTIONAL TREND MOMENTUM SIGNALS ---
   bool buy_signal = (close1 > fast_ema[1]) && 
                     (fast_ema[1] > slow_ema[1]) && 
                     (close1 > trend_ema[1]) && 
                     (rsi_val[1] >= InpRSIMinMomentum) && 
                     (close1 > open1);

   bool sell_signal = (close1 < fast_ema[1]) && 
                      (fast_ema[1] < slow_ema[1]) && 
                      (close1 < trend_ema[1]) && 
                      (rsi_val[1] <= InpRSIMinMomentum) && 
                      (close1 < open1);

   if(buy_signal)
   {
      double entry_price = m_symbol.Ask();
      double sl_price = swing_low - buffer;
      double sl_dist_pts = (entry_price - sl_price) / m_symbol.Point();

      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price - (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price - (InpMaxSLPoints * m_symbol.Point()); // Hebel 2 Cap
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());

      double sl_dist = entry_price - sl_price;
      double tp_price = 0.0;
      if(InpUseTakeProfit && InpTPRatio > 0.0)
         tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist);

      if(lot_size > 0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Ask();
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

            if(m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("BUY SUCCESS: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f (Attempt %d)", lot_size, entry_price, sl_price, tp_price, attempt);
               break;
            }
            Sleep(200);
         }
      }
   }
   else if(sell_signal)
   {
      double entry_price = m_symbol.Bid();
      double sl_price = swing_high + buffer;
      double sl_dist_pts = (sl_price - entry_price) / m_symbol.Point();

      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price + (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price + (InpMaxSLPoints * m_symbol.Point()); // Hebel 2 Cap
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());

      double sl_dist = sl_price - entry_price;
      double tp_price = 0.0;
      if(InpUseTakeProfit && InpTPRatio > 0.0)
         tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist);

      if(lot_size > 0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Bid();
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

            if(m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("SELL SUCCESS: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f (Attempt %d)", lot_size, entry_price, sl_price, tp_price, attempt);
               break;
            }
            Sleep(200);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Manage Open Positions (High-Profit Runner & Dynamic Exits)       |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt)
{
   double fast_ema[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. HEBEL 3: Soft-Profit-Lock (Schützt erreichte Teilstrecke ab $45 vor vollem -$80 Rückfall)
   if(InpUseSoftProfitLock)
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
               
               double point_val = 0.0;
               if(!m_symbol.RefreshRates() || !SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0) point_val = 1.0;
               double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
               double usd_per_price_unit = (vol / 0.01) * (point_val * (1.0 / tick_size)) * 0.01;
               if(usd_per_price_unit <= 0.0) usd_per_price_unit = 100.0 * vol;

               double lock_price_dist = InpSoftLockProtectUSD / usd_per_price_unit;

               if(m_position.PositionType() == POSITION_TYPE_BUY)
               {
                  double target_sl = NormalizeDouble(open_p + lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpSoftLockTriggerUSD && (cur_sl < target_sl || cur_sl == 0.0))
                  {
                     m_trade.PositionModify(ticket, target_sl, m_position.TakeProfit());
                     PrintFormat("SOFT-PROFIT-LOCK (BUY #%d): Profit erreichte $%.2f >= $%.2f. SL nachgezogen auf %.2f (+$%.2f gesichert)",
                                 ticket, pos_profit, InpSoftLockTriggerUSD, target_sl, InpSoftLockProtectUSD);
                  }
               }
               else if(m_position.PositionType() == POSITION_TYPE_SELL)
               {
                  double target_sl = NormalizeDouble(open_p - lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpSoftLockTriggerUSD && (cur_sl > target_sl || cur_sl == 0.0))
                  {
                     m_trade.PositionModify(ticket, target_sl, m_position.TakeProfit());
                     PrintFormat("SOFT-PROFIT-LOCK (SELL #%d): Profit erreichte $%.2f >= $%.2f. SL nachgezogen auf %.2f (+$%.2f gesichert)",
                                 ticket, pos_profit, InpSoftLockTriggerUSD, target_sl, InpSoftLockProtectUSD);
                  }
               }
            }
         }
      }
   }

   // 2. Optionaler klassischer Break-Even (falls separat aktiviert)
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
               
               double point_val = 0.0;
               if(!m_symbol.RefreshRates() || !SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0) point_val = 1.0;
               double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
               double usd_per_price_unit = (vol / 0.01) * (point_val * (1.0 / tick_size)) * 0.01;
               if(usd_per_price_unit <= 0.0) usd_per_price_unit = 100.0 * vol;

               double lock_price_dist = InpBELockUSD / usd_per_price_unit;

               if(m_position.PositionType() == POSITION_TYPE_BUY)
               {
                  double be_target_sl = NormalizeDouble(open_p + lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpBETriggerUSD && (cur_sl < open_p || cur_sl == 0.0))
                  {
                     m_trade.PositionModify(ticket, be_target_sl, m_position.TakeProfit());
                  }
               }
               else if(m_position.PositionType() == POSITION_TYPE_SELL)
               {
                  double be_target_sl = NormalizeDouble(open_p - lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpBETriggerUSD && (cur_sl > open_p || cur_sl == 0.0))
                  {
                     m_trade.PositionModify(ticket, be_target_sl, m_position.TakeProfit());
                  }
               }
            }
         }
      }
   }

   // 3. Basket Evaluation
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

   // 4. HEBEL 1: TREND-INVALIDATION EXIT (Trendbruch-Notausstieg)
   // Wenn Position im Minus ist und M15-Trend klar gebrochen ist -> Sofort beenden!
   if(InpUseTrendInvalidationExit && total_profit_usd < 0.0)
   {
      double trend_ema[2], slow_ema[2];
      if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) >= 2 &&
         CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) >= 1 &&
         CopyBuffer(m_slow_ema_handle, 0, 1, 2, slow_ema) >= 2)
      {
         MqlRates last_rates[];
         ArraySetAsSeries(last_rates, true);
         if(CopyRates(_Symbol, m_calc_timeframe, 1, 2, last_rates) >= 1)
         {
            double close1 = last_rates[0].close;

            // Long-Position im Verlust, aber Kurs schließt unter EMA50 und Fast EMA < Slow EMA -> Trend gebrochen!
            if(basket_type == POSITION_TYPE_BUY)
            {
               if(close1 < trend_ema[0] && fast_ema[0] < slow_ema[0])
               {
                  PrintFormat("TREND-INVALIDATION EXIT (BUY): Trend gebrochen (Close %.2f < EMA50 %.2f & EMA9 < EMA21). Verlust frühzeitig begrenzt bei $%.2f",
                              close1, trend_ema[0], total_profit_usd);
                  CloseAllPositionsForMagic();
                  return;
               }
            }
            // Short-Position im Verlust, aber Kurs schließt über EMA50 und Fast EMA > Slow EMA -> Trend gebrochen!
            else if(basket_type == POSITION_TYPE_SELL)
            {
               if(close1 > trend_ema[0] && fast_ema[0] > slow_ema[0])
               {
                  PrintFormat("TREND-INVALIDATION EXIT (SELL): Trend gebrochen (Close %.2f > EMA50 %.2f & EMA9 > EMA21). Verlust frühzeitig begrenzt bei $%.2f",
                              close1, trend_ema[0], total_profit_usd);
                  CloseAllPositionsForMagic();
                  return;
               }
            }
         }
      }
   }

   double current_price = (basket_type == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();
   double avg_profit_per_pos = total_profit_usd / my_positions;

   // 5. Dynamic Runner Exit: Price pulls back across Fast EMA after hitting realistic swing target (>= $28 USD)
   bool close_basket = false;
   if(InpUseDynamicExit)
   {
      if(basket_type == POSITION_TYPE_BUY)
      {
         if(current_price < fast_ema[0] && avg_profit_per_pos >= InpMinProfitUSDForExit)
            close_basket = true;
      }
      else if(basket_type == POSITION_TYPE_SELL)
      {
         if(current_price > fast_ema[0] && avg_profit_per_pos >= InpMinProfitUSDForExit)
            close_basket = true;
      }
   }

   // 6. Session End Profit Lock: Close and secure profits at session end (InpTradeEndHour)
   if(InpCloseInProfitAtSessionEnd && dt.hour >= InpTradeEndHour)
   {
      if(avg_profit_per_pos >= InpSessionEndMinProfitUSD)
         close_basket = true;
   }

   if(close_basket)
   {
      CloseAllPositionsForMagic();
      PrintFormat("DYNAMIC RUNNER EXIT: Basket closed (%d positions). Total Profit: $%.2f", my_positions, total_profit_usd);
   }
}

//+------------------------------------------------------------------+
//| Lot Sizing (Normalized for Live Broker Constraints)              |
//+------------------------------------------------------------------+
double CalculateLotSize(double sl_dist_price)
{
   if(InpFixedLot > 0.0)
      return InpFixedLot;

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double risk_cash = equity * (InpRiskPercent / 100.0);

   double point_val = 0.0;
   if(!m_symbol.RefreshRates() || !SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0)
   {
      point_val = 1.0; // Standard fallback for 1 lot Gold (1 pt = 1 USD on 100oz)
   }

   double tick_size = m_symbol.TickSize();
   if(tick_size <= 0.0) tick_size = m_symbol.Point();

   double loss_per_lot = (sl_dist_price / tick_size) * point_val;
   if(loss_per_lot <= 0.0)
      return m_symbol.LotsMin();

   double raw_lot = risk_cash / loss_per_lot;
   double step    = m_symbol.LotsStep();
   double min_lot = m_symbol.LotsMin();
   double max_lot = m_symbol.LotsMax();

   if(step <= 0.0) step = 0.01;
   double lot = MathFloor((raw_lot + 1e-7) / step) * step;

   // Broker Free Margin Safety Check (Prevents error 10019 on low leverage like 1:10 / 1:20)
   double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double margin_req_one = 0.0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, 1.0, m_symbol.Ask(), margin_req_one) && margin_req_one > 0.0)
   {
      double max_lot_by_margin = (free_margin * 0.70) / (margin_req_one * MathMax(1, InpMaxOpenPositions));
      if(lot > max_lot_by_margin && max_lot_by_margin >= min_lot)
      {
         lot = MathFloor((max_lot_by_margin + 1e-7) / step) * step;
      }
   }

   if(lot < min_lot) lot = min_lot;
   if(lot > max_lot) lot = max_lot;

   return NormalizeDouble(lot, 2);
}

//+------------------------------------------------------------------+
//| Count Open Positions for Magic                                   |
//+------------------------------------------------------------------+
int CountOpenPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
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
//| Close All Positions for Magic                                    |
//+------------------------------------------------------------------+
void CloseAllPositionsForMagic()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
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
//| Update HUD Dashboard                                             |
//+------------------------------------------------------------------+
void UpdateDashboard(const MqlDateTime &dt)
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);

   double daily_dd_pct = 0.0;
   if(m_day_start_balance > 0.0)
   {
      double daily_ref = (balance > m_day_start_balance) ? balance : m_day_start_balance;
      daily_dd_pct = MathMax(0.0, ((daily_ref - equity) / daily_ref) * 100.0);
   }

   double total_dd_pct = 0.0;
   if(m_peak_equity > 0.0)
      total_dd_pct = MathMax(0.0, ((m_peak_equity - equity) / m_peak_equity) * 100.0);

   double profit_pct = ((equity - m_initial_account_balance) / m_initial_account_balance) * 100.0;
   int open_pos = CountOpenPositions();

   double trend_ema[1];
   string trend_str = "Neutral";
   if(CopyBuffer(m_trend_ema_handle, 0, 0, 1, trend_ema) > 0)
   {
      trend_str = (m_symbol.Bid() > trend_ema[0]) ? "BULLISH (Trend-Longs Active)" : "BEARISH (Trend-Shorts Active)";
   }

   bool in_window = IsWithinTradingWindow(dt);
   int german_hour = (dt.hour >= 3) ? (dt.hour - 3) : (dt.hour + 21);

   string state_str = "Aktiv - Scannt jede M15 Kerze";
   if(m_target_reached)
      state_str = "BLUEBERRY TARGET ERREICHT! (Bestanden)";
   else if(m_total_lockout)
      state_str = "NOT-HALT (Gesamt-Drawdown Limit erreicht)";
   else if(m_daily_lockout)
      state_str = "TAGES-SPERRE (Tages-Drawdown Limit erreicht)";
   else if(!in_window)
      state_str = "Warten auf Handelsfenster (07:00-18:00 oder 22:00-02:00 DE)";

   string lot_display = (InpFixedLot > 0.0) ? StringFormat("Fix %.2f Lot", InpFixedLot) : StringFormat("%.2f%% Dynamisch", InpRiskPercent);

   string dash = "";
   dash += "========================================================\n";
   dash += "     XAU TITAN ULTRA v8.0 (LOW-LOSS FORK HEBEL 123)     \n";
   dash += "========================================================\n";
   dash += StringFormat("Zeit:           Server %02d:%02d | DEUTSCHLAND %02d:%02d\n", dt.hour, dt.min, german_hour, dt.min);
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += StringFormat("Positionsgröße: %s | Max Positionen: %d\n", lot_display, InpMaxOpenPositions);
   dash += StringFormat("Tages DD:       %.2f%% / 4.00%% Max (EA-Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamt DD:      %.2f%% / 10.00%% Max (EA-Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Hebel 1 (Trend-Invalidation): %s (Beendet Fehlausbrüche früh)\n", InpUseTrendInvalidationExit ? "AKTIV" : "AUS");
   dash += StringFormat("Hebel 2 (Max SL-Deckelung):  %d Pkt ($%.2f Max Risk)\n", InpMaxSLPoints, InpMaxSLPoints * m_symbol.Point());
   dash += StringFormat("Hebel 3 (Soft-Profit-Lock):   %s (Trigger: $%.1f -> Lock: +$%.1f)\n", InpUseSoftProfitLock ? "AKTIV" : "AUS", InpSoftLockTriggerUSD, InpSoftLockProtectUSD);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Handelsfenster: %s (07:00-18:00 & 22:00-02:00 DE)\n", in_window ? "OFFEN (Trades erlaubt)" : "GESCHLOSSEN");
   dash += "Berechnung:     STRIKT M15 | Execution: Auto Filling & Retry Loop\n";
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   dash += "========================================================\n";

   Comment(dash);
}
//+------------------------------------------------------------------+
