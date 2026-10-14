//+------------------------------------------------------------------+
//|                                           XAU_Titan_Pro_25k.mq5  |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|               Special 25k 1:10 Leverage & Prop Firm Safe Edition |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "7.25"
#property description "High-Profit Institutional Trend-Pullback Scaling EA for Gold"
#property description "Dedicated 25,000 USD Account Edition with 1:10 Leverage Guard"
#property description "Preemptive Drawdown Protection: 3.2% Daily Brake & $23,000 Static Floor Guard"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße (1:10 Hebel) ==="
input double   InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = % Risiko; z.B. 0.03 oder 0.04)
input double   InpRiskPercent             = 0.4;         // Dynamisches % Risiko (0.4% = $100 pro Trade bei $25k)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 Bars = 30 Min)
input ulong    InpMagicNumber             = 881125;      // Magic Number (Dediziert für 25k Konto)
input string   InpTradeComment            = "Titan_25k_1to10"; // Trade Kommentar

input group "=== 02 / Struktureller Swing-SL & Runner-Ausstieg ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12 Stunden)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 15000;       // Max. SL-Abstand in Punkten (150 USD - Lässt Swing SL atmen!)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg an EMA9
input bool     InpAutoExitTargetPoints    = true;        // Automatische Skalierung des Mindestgewinns nach Punkten
input int      InpMinProfitPointsForExit  = 2800;        // Mindest-Trenddistanz in Punkten (2800 Pkt = $28.00 Gold Swing)
input double   InpMinProfitUSDForExit     = 112.0;       // Mindestgewinn in USD (Fallback wenn AutoExit false)
input bool     InpCloseInProfitAtSessionEnd = false;     // Session-Ende Schließung (false = Lässt Runner über Nacht laufen)
input double   InpSessionEndMinProfitUSD  = 20.0;        // Mindestgewinn für Session-Ende Schließung in USD
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = Maximale Trendfolge-Runner)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator (0.0 = Unlimitierter Runner Modus)
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Choket Gold nicht)
input double   InpBETriggerUSD            = 150.0;       // BE Trigger in USD
input double   InpBELockUSD               = 50.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute
input bool     InpCloseWeekendFriday      = true;        // Wochenend-Schutz: Freitags vor Marktschluss Positionen schließen
input int      InpFridayCloseHour         = 22;          // Freitag Schließung Stunde (Serverzeit, z.B. 22:00)
input int      InpFridayCloseMinute       = 0;           // Freitag Schließung Minute
input bool     InpBlockFridayLateEntries  = true;        // Freitag Spätnachmittag: Keine neuen Einstiege vor Wochenende
input int      InpFridayStopEntryHour     = 19;          // Freitag Einstiegs-Stopp Stunde (Serverzeit, z.B. 19:00)

input group "=== 04 / Preemptive Drawdown-Schutz (25k / 4% Daily / 10% Static) ==="
input bool     InpEnablePropProtection    = true;        // Harter Prop-Firm Notaus aktiv
input double   InpInitialBalance          = 25000.0;     // Feste Start-Balance ($25.000 für statischen DD)
input double   InpMaxDailyDrawdownPercent = 3.2;         // Notbremse Tagesverlust % (Stoppt bei $800 vor 4.0% = $1.000)
input double   InpMaxTotalDrawdownPercent = 8.0;         // Notbremse Gesamtverlust % (Stoppt bei $2.000 vor 10.0% = $2.500)
input double   InpHardFloorEquityStop     = 23000.0;     // Absoluter Equity-Boden ($23.000 = $500 Puffer vor $22.500)
input bool     InpTotalDDBasedOnInitial   = true;        // Statisch vom Startkapital ($25.000)
input bool     InpDailyLockoutUntilMidnight = true;      // Nach Tagesverlust: Pause bis Mitternacht
input double   InpPhaseProfitTargetPct    = 0.0;         // Phasen-Ziel % (0.0 = Deaktiviert / Fortlaufend traden)

input group "=== 05 / Trend-Momentum Indikatoren (M15 Basis) ==="
input int      InpTrendEMAPeriod          = 50;          // Übergeordneter Trendfilter (M15 EMA50)
input int      InpFastEMAPeriod           = 9;           // Schnelle Basis-EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere Trend-EMA (M15 EMA21)
input int      InpRSIPeriod               = 14;          // RSI Periode (M15 RSI14)
input double   InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

input group "=== 06 / Anti-Trap & Überdehnungs-Filter ==="
input bool     InpUseOverextensionFilter  = false;       // Überdehnungs-Schutz (Standard aus endstation.set)
input double   InpMaxATRExtension         = 1.8;         // Max. Distanz zu EMA21 in ATR
input bool     InpUseConsecutiveRunFilter = false;       // Kerzen-Erschöpfungsfilter (Standard aus endstation.set)
input int      InpMaxConsecutiveBars      = 3;           // Max. gleichfarbige Kerzen am Stück vor Einstieg
input bool     InpUseSRDistanceFilter     = false;       // S/R-Widerstandsfilter (Standard aus endstation.set)
input int      InpMinSRRoomPoints         = 300;         // Min. Freiraum zum Swing-Widerstand
input int      InpATRPeriod               = 14;          // ATR Periode für Volatilitätsmessung

//--- Global Variables
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
int            m_rsi_handle       = INVALID_HANDLE;
int            m_atr_handle       = INVALID_HANDLE;
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

//+------------------------------------------------------------------+
//| Setup Robust Live Execution & Broker Filling                     |
//+------------------------------------------------------------------+
void SetupLiveExecution()
{
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(50);
   
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

   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   m_atr_handle       = iATR(_Symbol, m_calc_timeframe, InpATRPeriod);

   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE ||
      m_slow_ema_handle == INVALID_HANDLE || m_rsi_handle == INVALID_HANDLE ||
      m_atr_handle == INVALID_HANDLE)
   {
      Print("Error creating indicator handles on M15");
      return INIT_FAILED;
   }

   MqlDateTime dt;
   TimeCurrent(dt);
   m_current_day_date        = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   
   // Robust starting balance: use explicit InpInitialBalance if set, else account balance
   if(InpInitialBalance > 0.0)
      m_initial_account_balance = InpInitialBalance;
   else
      m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   m_day_start_balance       = CalculateDailyStartBalance(m_current_day_date);
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);

   m_last_m15_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time   = GetLastEntryTimeForMagic();

   PrintFormat("XAU_Titan_Pro_25k initialized. Static Base: $%.2f | Hard Floor: $%.2f | Daily Start: $%.2f | Anti-Trap: %s",
               m_initial_account_balance, InpHardFloorEquityStop, m_day_start_balance,
               InpUseOverextensionFilter ? "Active" : "Disabled");
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
   if(m_atr_handle       != INVALID_HANDLE) IndicatorRelease(m_atr_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within Elite Trading Window                             |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return false;

   if(dt.day_of_week == 5 && InpBlockFridayLateEntries)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int stop_min_fri    = InpFridayStopEntryHour * 60;
      if(current_min_fri >= stop_min_fri)
         return false;
   }

   if(InpFilterEliteHours)
   {
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

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

   // 1. Preemptive Prop-Firm Circuit Breakers (4% Daily / 10% Static)
   if(InpEnablePropProtection)
   {
      // 1.1 Hard Floor Absolute Equity Protection ($23,000.00)
      if(InpHardFloorEquityStop > 0.0 && current_equity <= InpHardFloorEquityStop && !m_total_lockout)
      {
         PrintFormat("PREEMPTIVE HARD FLOOR TRIGGERED: Equity $%.2f <= Floor $%.2f. Closing all positions and halting EA permanently.",
                     current_equity, InpHardFloorEquityStop);
         CloseAllPositionsForMagic();
         m_total_lockout = true;
      }

      // 1.2 Daily Drawdown Preemptive Protection (Default 3.2% = $800 max daily loss)
      if(InpMaxDailyDrawdownPercent > 0.0 && m_day_start_balance > 0.0)
      {
         double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = (current_equity < daily_ref) ? (((daily_ref - current_equity) / daily_ref) * 100.0) : 0.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent && !m_daily_lockout)
         {
            PrintFormat("PREEMPTIVE DAILY BRAKE TRIGGERED: Daily DD %.2f%% >= Limit %.2f%% ($%.2f loss). Closing all positions.",
                        daily_dd_pct, InpMaxDailyDrawdownPercent, (daily_ref - current_equity));
            CloseAllPositionsForMagic();
            if(InpDailyLockoutUntilMidnight)
            {
               m_daily_lockout = true;
               Print("Daily trading locked until 00:00 midnight to protect 4.0% broker rule.");
            }
            else
            {
               m_day_start_balance = AccountInfoDouble(ACCOUNT_BALANCE);
               Print("Positions closed for daily cut. Resuming search for new trades.");
            }
         }
      }

      // 1.3 Total Static Drawdown Preemptive Protection (Default 8.0% = $2,000 max loss)
      if(InpMaxTotalDrawdownPercent > 0.0)
      {
         double total_dd_pct = 0.0;
         if(InpTotalDDBasedOnInitial)
         {
            if(m_initial_account_balance > 0.0 && current_equity < m_initial_account_balance)
               total_dd_pct = ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0;
         }
         else
         {
            if(m_peak_equity > 0.0 && current_equity < m_peak_equity)
               total_dd_pct = ((m_peak_equity - current_equity) / m_peak_equity) * 100.0;
         }

         if(total_dd_pct >= InpMaxTotalDrawdownPercent && !m_total_lockout)
         {
            PrintFormat("PREEMPTIVE TOTAL DD BRAKE: Total DD %.2f%% >= Limit %.2f%%. Halting EA permanently to protect 10.0% floor.",
                        total_dd_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }

      // 1.4 Profit Target Protection
      if(InpPhaseProfitTargetPct > 0.0)
      {
         double profit_pct = ((current_equity - m_initial_account_balance) / m_initial_account_balance) * 100.0;
         if(profit_pct >= InpPhaseProfitTargetPct && !m_target_reached)
         {
            PrintFormat("PROFIT TARGET REACHED: Profit %.2f%% >= Target %.2f%%. Halting EA.",
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

   // 2. Manage Active Positions
   ManageOpenPositions(dt);

   // 3. Check for New Entry on M15 Bar Close
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
   double trend_ema[2], fast_ema[2], slow_ema[2], rsi_val[2], atr_val[2];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) < 2)   return;
   if(CopyBuffer(m_slow_ema_handle, 0, 1, 2, slow_ema) < 2)   return;
   if(CopyBuffer(m_rsi_handle, 0, 1, 2, rsi_val) < 2)         return;
   if(CopyBuffer(m_atr_handle, 0, 1, 2, atr_val) < 2)         return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   double close1 = rates[0].close;
   double open1  = rates[0].open;

   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   bool buy_not_overextended = true;
   bool sell_not_overextended = true;
   if(InpUseOverextensionFilter && atr_val[1] > 0.0)
   {
      double max_dist = InpMaxATRExtension * atr_val[1];
      if((close1 - slow_ema[1]) > max_dist)
         buy_not_overextended = false;
      if((slow_ema[1] - close1) > max_dist)
         sell_not_overextended = false;
   }

   bool buy_run_ok = true;
   bool sell_run_ok = true;
   if(InpUseConsecutiveRunFilter)
   {
      int green_count = 0;
      int red_count = 0;
      for(int k = 0; k < InpMaxConsecutiveBars; k++)
      {
         if(rates[k].close > rates[k].open) green_count++;
         if(rates[k].close < rates[k].open) red_count++;
      }
      if(green_count >= InpMaxConsecutiveBars) buy_run_ok = false;
      if(red_count >= InpMaxConsecutiveBars) sell_run_ok = false;
   }

   bool buy_sr_ok = true;
   bool sell_sr_ok = true;
   if(InpUseSRDistanceFilter)
   {
      double local_res = -1e9;
      double local_sup = 1e9;
      for(int k = 3; k < InpSwingBarsLookback; k++)
      {
         if(rates[k].high > local_res) local_res = rates[k].high;
         if(rates[k].low  < local_sup) local_sup = rates[k].low;
      }
      double min_room = InpMinSRRoomPoints * m_symbol.Point();
      if(local_res > close1 && (local_res - close1) < min_room)
         buy_sr_ok = false;
      if(close1 > local_sup && (close1 - local_sup) < min_room)
         sell_sr_ok = false;
   }

   bool base_buy = (close1 > fast_ema[1]) && 
                   (fast_ema[1] > slow_ema[1]) && 
                   (close1 > trend_ema[1]) && 
                   (rsi_val[1] >= InpRSIMinMomentum) && 
                   (close1 > open1);

   bool base_sell = (close1 < fast_ema[1]) && 
                    (fast_ema[1] < slow_ema[1]) && 
                    (close1 < trend_ema[1]) && 
                    (rsi_val[1] <= InpRSIMinMomentum) && 
                    (close1 < open1);

   bool buy_signal  = base_buy && buy_not_overextended && buy_run_ok && buy_sr_ok;
   bool sell_signal = base_sell && sell_not_overextended && sell_run_ok && sell_sr_ok;

   if(buy_signal)
   {
      double entry_price = m_symbol.Ask();
      double sl_price = swing_low - buffer;
      double sl_dist_pts = (entry_price - sl_price) / m_symbol.Point();

      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price - (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price - (InpMaxSLPoints * m_symbol.Point());
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
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price + (InpMaxSLPoints * m_symbol.Point());
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
//| Manage Open Positions (Dynamic Runner Exit & Session Guard)      |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt)
{
   double fast_ema[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Intelligent Break-Even Protection (optional)
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

   // 2. Basket Evaluation
   int my_positions = 0;
   ENUM_POSITION_TYPE basket_type = POSITION_TYPE_BUY;
   double total_profit_usd = 0.0;
   double total_volume = 0.0;

   for(int i = total - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            my_positions++;
            basket_type = m_position.PositionType();
            total_profit_usd += m_position.Profit() + m_position.Swap();
            total_volume += m_position.Volume();
         }
      }
   }

   if(my_positions == 0) return;

   // 2.5 Weekend Protection
   if(InpCloseWeekendFriday && dt.day_of_week == 5)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int close_min_fri   = InpFridayCloseHour * 60 + InpFridayCloseMinute;
      if(current_min_fri >= close_min_fri)
      {
         CloseAllPositionsForMagic();
         PrintFormat("WEEKEND PROTECTION EXIT: Friday close %02d:%02d reached. Basket closed. PnL: $%.2f",
                     dt.hour, dt.min, total_profit_usd);
         return;
      }
   }
   if(InpCloseWeekendFriday && (dt.day_of_week == 0 || dt.day_of_week == 6))
   {
      CloseAllPositionsForMagic();
      return;
   }

   double current_price = (basket_type == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();
   double avg_profit_per_pos = total_profit_usd / my_positions;
   double avg_vol_per_pos = total_volume / my_positions;

   // 3. Dynamic Runner Exit
   bool close_basket = false;
   if(InpUseDynamicExit)
   {
      double required_profit = InpMinProfitUSDForExit;
      if(InpAutoExitTargetPoints)
      {
         // Points-based target scaled by position volume: e.g. 2800 points * Volume
         double point_val = 0.0;
         if(!m_symbol.RefreshRates() || !SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0) point_val = 1.0;
         double tick_sz = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
         required_profit = (InpMinProfitPointsForExit * m_symbol.Point() / tick_sz) * point_val * avg_vol_per_pos;
         if(required_profit < 10.0) required_profit = 10.0;
      }

      if(basket_type == POSITION_TYPE_BUY)
      {
         if(current_price < fast_ema[0] && avg_profit_per_pos >= required_profit)
            close_basket = true;
      }
      else if(basket_type == POSITION_TYPE_SELL)
      {
         if(current_price > fast_ema[0] && avg_profit_per_pos >= required_profit)
            close_basket = true;
      }
   }

   // 4. Session End Profit Lock
   if(InpCloseInProfitAtSessionEnd && dt.hour >= InpTradeEndHour)
   {
      if(avg_profit_per_pos >= InpSessionEndMinProfitUSD)
         close_basket = true;
   }

   if(close_basket)
   {
      CloseAllPositionsForMagic();
      PrintFormat("DYNAMIC RUNNER EXIT: Basket closed (%d positions, vol %.2f). Total Profit: $%.2f",
                  my_positions, total_volume, total_profit_usd);
   }
}

//+------------------------------------------------------------------+
//| Lot Sizing (Normalized for 1:10 Leverage & Account Safety)       |
//+------------------------------------------------------------------+
double CalculateLotSize(double sl_dist_price)
{
   double lot = 0.0;
   double step    = m_symbol.LotsStep();
   double min_lot = m_symbol.LotsMin();
   double max_lot = m_symbol.LotsMax();
   if(step <= 0.0) step = 0.01;

   if(InpFixedLot > 0.0)
   {
      lot = InpFixedLot;
   }
   else
   {
      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double risk_cash = equity * (InpRiskPercent / 100.0);

      double point_val = 0.0;
      if(!m_symbol.RefreshRates() || !SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0)
         point_val = 1.0;

      double tick_size = m_symbol.TickSize();
      if(tick_size <= 0.0) tick_size = m_symbol.Point();

      double loss_per_lot = (sl_dist_price / tick_size) * point_val;
      if(loss_per_lot <= 0.0)
         return min_lot;

      double raw_lot = risk_cash / loss_per_lot;
      lot = MathFloor((raw_lot + 1e-7) / step) * step;
   }

   // Strict 1:10 Leverage Free Margin Check
   // Prevents margin call (error 10019) and ensures total open volume never stresses 1:10 margin
   double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double margin_req_one = 0.0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, 1.0, m_symbol.Ask(), margin_req_one) && margin_req_one > 0.0)
   {
      // Cap per-position margin to max 35% of free margin divided by allowed positions
      double max_lot_by_margin = (free_margin * 0.35) / (margin_req_one * MathMax(1, InpMaxOpenPositions));
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
   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin_free = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double margin_used = AccountInfoDouble(ACCOUNT_MARGIN);
   long   leverage    = AccountInfoInteger(ACCOUNT_LEVERAGE);

   double daily_dd_pct = 0.0;
   double daily_dd_usd = 0.0;
   if(m_day_start_balance > 0.0)
   {
      double daily_ref = (balance > m_day_start_balance) ? balance : m_day_start_balance;
      daily_dd_usd = MathMax(0.0, (daily_ref - equity));
      daily_dd_pct = (daily_dd_usd / daily_ref) * 100.0;
   }

   double total_dd_pct = 0.0;
   double total_dd_usd = 0.0;
   if(m_initial_account_balance > 0.0)
   {
      total_dd_usd = MathMax(0.0, (m_initial_account_balance - equity));
      total_dd_pct = (total_dd_usd / m_initial_account_balance) * 100.0;
   }

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
      state_str = "NOT-HALT: Gesamt-Drawdown / Floor Schutz aktiv!";
   else if(m_daily_lockout)
      state_str = "TAGES-SPERRE: Tages-Drawdown Notbremse erreicht!";
   else if(dt.day_of_week == 0 || dt.day_of_week == 6)
      state_str = "WOCHENENDE (Markt geschlossen)";
   else if(dt.day_of_week == 5 && InpCloseWeekendFriday && (dt.hour * 60 + dt.min >= InpFridayCloseHour * 60 + InpFridayCloseMinute))
      state_str = "WOCHENENDE-SCHUTZ AKTIV (Freitagabend Glattstellung)";
   else if(dt.day_of_week == 5 && InpBlockFridayLateEntries && (dt.hour >= InpFridayStopEntryHour))
      state_str = "FREITAG-STOPP (Keine neuen Einstiege vor Wochenende)";
   else if(!in_window)
      state_str = "Warten auf Handelsfenster (07:00-18:00 oder 22:00-02:00 DE)";

   string lot_display = (InpFixedLot > 0.0) ? StringFormat("Fix %.2f Lot", InpFixedLot) : StringFormat("%.2f%% Dynamisch", InpRiskPercent);

   double floor_cushion = equity - InpHardFloorEquityStop;
   double daily_limit_usd = m_day_start_balance * (InpMaxDailyDrawdownPercent / 100.0);
   double daily_cushion = daily_limit_usd - daily_dd_usd;

   string dash = "";
   dash += "========================================================\n";
   dash += "   XAU TITAN PRO 25k (1:10 HEBEL & PROP FIRM SAFE)      \n";
   dash += "========================================================\n";
   dash += StringFormat("Zeit:           Server %02d:%02d | DEUTSCHLAND %02d:%02d\n", dt.hour, dt.min, german_hour, dt.min);
   dash += StringFormat("Konto-Status:   Balance $%.2f | Equity $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Hebel & Margin: 1:%d | Margin: $%.2f | Freie Margin: $%.2f\n", leverage, margin_used, margin_free);
   dash += StringFormat("Positionsgröße: %s | Max Positionen: %d\n", lot_display, InpMaxOpenPositions);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("TAGES-BREMSE:   -%.2f%% / Max 4.00%% (EA-Stopp: %.2f%% = -$%.2f)\n",
                        daily_dd_pct, InpMaxDailyDrawdownPercent, daily_limit_usd);
   dash += StringFormat("Tages-Puffer:   $%.2f Rest-Verlust bis Tages-Pause\n", MathMax(0.0, daily_cushion));
   dash += StringFormat("STATISCH-FLOOR: -%.2f%% / Max 10.00%% (Boden: $%.2f)\n",
                        total_dd_pct, InpHardFloorEquityStop);
   dash += StringFormat("Boden-Puffer:   $%.2f Sicherheits-Abstand vor Not-Halt ($23.000)\n", MathMax(0.0, floor_cushion));
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Handelsfenster: %s (07:00-18:00 & 22:00-02:00 DE)\n", in_window ? "OFFEN" : "GESCHLOSSEN");
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("EA Status:      %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   dash += "========================================================\n";

   Comment(dash);
}
//+------------------------------------------------------------------+
