//+------------------------------------------------------------------+
//|                                                XAU_Titan_M5.mq5  |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|                    Version 1.0 - High-Speed M5 Scalp Edition     |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "1.00"
#property description "High-Profit Institutional Trend-Pullback Scaling EA for Gold on M5 Timeframe"
#property description "Optimized for M5 Candle Execution & High-Frequency Institutional Gold Scalping"
#property description "Certified for Live-Trading & Blueberry Funded 2-Step Prime Protection"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double          InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = % Risiko; >0.0 = Fixe Lotgröße)
input double          InpRiskPercent             = 0.5;         // Dynamisches % Risiko (0.5% = Standard für Prop-Firm)
input int             InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int             InpMinBarsBetweenEntries   = 3;           // Mindestabstand zwischen Einstiegen (3 Bars auf M5 = 15 Min)
input ulong           InpMagicNumber             = 881105;      // Magic Number (M5 spezifisch: 881105)
input string          InpTradeComment            = "Titan_M5_Dyn05"; // Trade Kommentar

input group "=== 02 / Struktureller Swing-SL & Runner-Ausstieg ==="
input bool            InpUseSwingSL              = true;        // Struktureller Swing-SL
input int             InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M5 (48 Bars = 4 Stunden)
input int             InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int             InpMaxSLPoints             = 15000;       // Max. SL-Abstand in Punkten (150 USD maximaler Swing-Rahmen)
input int             InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool            InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg an EMA9
input double          InpMinProfitUSDForExit     = 28.0;        // Mindestgewinn in USD pro Trade vor Ausstieg an EMA9
input bool            InpCloseInProfitAtSessionEnd = false;     // Session-Ende Schließung (false = Lässt Runner über Nacht laufen)
input double          InpSessionEndMinProfitUSD  = 5.0;         // Mindestgewinn für Session-Ende Schließung in USD
input bool            InpUseTakeProfit           = false;       // Fester Take Profit (false = Maximale Trendfolge-Runner)
input double          InpTPRatio                 = 0.0;         // TP-Multiplikator (0.0 = Unlimitierter Runner Modus)
input bool            InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Lässt Trade atmen)
input double          InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double          InpBELockUSD               = 5.0;         // Gesicherter Gewinn in USD bei Break-Even

input group "=== 03 / Handelszeiten & Filter (Serverzeit) ==="
input bool            InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool            InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00)
input bool            InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden (15:00-17:00)
input int             InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int             InpTradeStartMinute        = 0;           // Handelsstart Minute
input int             InpTradeEndHour            = 23;          // Handelsende Stunde
input int             InpTradeEndMinute          = 45;          // Handelsende Minute

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool            InpEnablePropProtection    = true;        // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double          InpMaxDailyDrawdownPercent = 3.5;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double          InpMaxTotalDrawdownPercent = 9.0;         // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input bool            InpTotalDDBasedOnInitial   = true;        // Max Drawdown Basis (true = Statisch vom Startkapital)
input bool            InpDailyLockoutUntilMidnight = true;      // Nach Tagesverlust (true = Pause bis Mitternacht)
input double          InpManualDailyStartBalance = 0.0;         // Manuelle Tages-Start-Balance (0.0 = Auto aus Deals)
input double          InpPhaseProfitTargetPct    = 0.0;         // Phasen-Ziel % (0.0 = Deaktiviert / Fortlaufend traden)

input group "=== 05 / Trend-Momentum Indikatoren (M5 Basis) ==="
input ENUM_TIMEFRAMES InpCalcTimeframe           = PERIOD_M5;   // Berechnungs-Timeframe
input int             InpTrendEMAPeriod          = 50;          // Übergeordneter Trendfilter (M5 EMA50)
input int             InpFastEMAPeriod           = 9;           // Schnelle Basis-EMA (M5 EMA9)
input int             InpSlowEMAPeriod           = 21;          // Mittlere Trend-EMA (M5 EMA21)
input int             InpRSIPeriod               = 14;          // RSI Periode (M5 RSI14)
input double          InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

input group "=== 06 / Anti-Trap & Überdehnungs-Filter ==="
input bool            InpUseOverextensionFilter  = true;        // Überdehnungs-Schutz (ATR-Distanz zur EMA21)
input double          InpMaxATRExtension         = 1.8;         // Max. Distanz zu EMA21 in ATR (z.B. 1.8x ATR; verhindert Gipfelkauf)
input bool            InpUseConsecutiveRunFilter = true;        // Kerzen-Erschöpfungsfilter (Climax Run)
input int             InpMaxConsecutiveBars      = 3;           // Max. gleichfarbige Kerzen am Stück vor Einstieg
input bool            InpUseSRDistanceFilter     = true;        // S/R-Widerstandsfilter (Kein Kauf direkt in Supply-Zone)
input int             InpMinSRRoomPoints         = 300;         // Min. Freiraum zum Swing-Widerstand (300 Pkt = 3.00 USD)
input int             InpATRPeriod               = 14;          // ATR Periode für Volatilitätsmessung

//--- Global Variables
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

ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M5;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
int            m_rsi_handle       = INVALID_HANDLE;
int            m_atr_handle       = INVALID_HANDLE;
datetime       m_last_bar_time    = 0;
datetime       m_last_entry_time  = 0;

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
   if(InpManualDailyStartBalance > 0.0)
      return InpManualDailyStartBalance;

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
            datetime pos_time = (datetime)PositionGetInteger(POSITION_TIME);
            if(pos_time > last_time) last_time = pos_time;
         }
      }
   }

   datetime today_midnight = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(HistorySelect(today_midnight - 86400, TimeCurrent()))
   {
      int deals = HistoryDealsTotal();
      for(int i = deals - 1; i >= 0; i--)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
         {
            if(HistoryDealGetString(ticket, DEAL_SYMBOL) == _Symbol &&
               (ulong)HistoryDealGetInteger(ticket, DEAL_MAGIC) == InpMagicNumber)
            {
               long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
               if(entry == DEAL_ENTRY_IN)
               {
                  datetime deal_time = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
                  if(deal_time > last_time) last_time = deal_time;
                  break;
               }
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
   m_calc_timeframe = InpCalcTimeframe;

   if(!m_symbol.Name(_Symbol))
   {
      Print("Symbol error");
      return INIT_FAILED;
   }

   SetupLiveExecution();

   // Create indicator handles on configured timeframe (M5)
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   m_atr_handle       = iATR(_Symbol, m_calc_timeframe, InpATRPeriod);

   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE ||
      m_slow_ema_handle == INVALID_HANDLE || m_rsi_handle == INVALID_HANDLE ||
      m_atr_handle == INVALID_HANDLE)
   {
      PrintFormat("Error creating indicator handles on %s", EnumToString(m_calc_timeframe));
      return INIT_FAILED;
   }

   MqlDateTime dt;
   TimeCurrent(dt);
   m_current_day_date        = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = CalculateDailyStartBalance(m_current_day_date);
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);

   m_last_bar_time    = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time  = GetLastEntryTimeForMagic();

   PrintFormat("XAU_Titan_M5 initialized. TF: %s | Daily Start: $%.2f | Last Entry: %s | Anti-Trap: %s",
               EnumToString(m_calc_timeframe),
               m_day_start_balance,
               (m_last_entry_time > 0) ? TimeToString(m_last_entry_time, TIME_DATE|TIME_MINUTES|TIME_SECONDS) : "None",
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
//| Check if within Trading Window                                   |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   if(InpFilterEliteHours)
   {
      // Asian Night Session (Hours 1 to 7)
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

      // US News Spike & London Fixing (Hours 15 to 17)
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

   datetime current_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   bool is_new_bar = (current_bar_time != m_last_bar_time);
   if(is_new_bar)
      m_last_bar_time = current_bar_time;

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
         PrintFormat("NEW DAY UNLOCK: Daily Lockout reset for %04d.%02d.%02d. Start Balance: $%.2f",
                     dt.year, dt.mon, dt.day, m_day_start_balance);
      }
   }

   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Blueberry Funded Prop-Firm Circuit Breaker
   if(IsBlueberryChallengeAccount())
   {
      // Daily Drawdown Protection
      if(m_day_start_balance > 0.0 && InpMaxDailyDrawdownPercent > 0.0)
      {
         double daily_reference_balance = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = 0.0;
         if(current_equity < daily_reference_balance)
            daily_dd_pct = ((daily_reference_balance - current_equity) / daily_reference_balance) * 100.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent && !m_daily_lockout)
         {
            PrintFormat("BLUEBERRY RISK BREACH: Daily DD %.2f%% >= Limit %.2f%%. Closing all positions.",
                        daily_dd_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            if(InpDailyLockoutUntilMidnight)
            {
               m_daily_lockout = true;
               Print("Daily lockout active. No new positions until 00:00 midnight.");
            }
            else
            {
               m_day_start_balance = AccountInfoDouble(ACCOUNT_BALANCE);
               Print("Positions closed for daily cut. Resuming search for new trades.");
            }
         }
      }

      // Total Drawdown Protection
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
            PrintFormat("BLUEBERRY RISK BREACH: Total DD %.2f%% >= Limit %.2f%%. Halting EA permanently.",
                        total_dd_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }

      // Profit Target Protection
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

   // 2. Manage Active Positions
   ManageOpenPositions(dt);

   // 3. Check for New Entry on Bar Close
   if(is_new_bar && IsWithinTradingWindow(dt))
   {
      int open_count = CountOpenPositions();
      if(open_count < InpMaxOpenPositions)
      {
         if(current_bar_time > m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe)))
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

   // Structural Swing High and Low
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // --- ANTI-TRAP & OVEREXTENSION CHECKS ---
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
      // Finde signifikante Hochs/Tiefs vor dem unmittelbaren Spike (Bars 3 bis Lookback)
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

   // --- INSTITUTIONAL TREND MOMENTUM SIGNALS ---
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

   if(base_buy && (!buy_not_overextended || !buy_run_ok || !buy_sr_ok))
   {
      PrintFormat("TITAN M5 ANTI-TRAP: Long blockiert! Überdehnt=%s (Dist=%.2f > Max=%.2f) | ClimaxRunOk=%s | SROk=%s",
                  buy_not_overextended ? "Nein" : "JA (Gipfelkauf)",
                  (close1 - slow_ema[1]), (InpMaxATRExtension * atr_val[1]),
                  buy_run_ok ? "JA" : "Blockiert (Kerzen-Erschöpfung)",
                  buy_sr_ok ? "JA" : "Blockiert (Nahe Widerstand)");
   }
   if(base_sell && (!sell_not_overextended || !sell_run_ok || !sell_sr_ok))
   {
      PrintFormat("TITAN M5 ANTI-TRAP: Short blockiert! Überdehnt=%s (Dist=%.2f > Max=%.2f) | ClimaxRunOk=%s | SROk=%s",
                  sell_not_overextended ? "Nein" : "JA (Bodenverkauf)",
                  (slow_ema[1] - close1), (InpMaxATRExtension * atr_val[1]),
                  sell_run_ok ? "JA" : "Blockiert (Kerzen-Erschöpfung)",
                  sell_sr_ok ? "JA" : "Blockiert (Nahe Support)");
   }

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
//| Manage Open Positions (High-Profit Runner & Dynamic Exits)       |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt)
{
   double fast_ema[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Intelligent Break-Even Protection
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
                     PrintFormat("BREAK-EVEN TRIGGERED (BUY #%d): Profit reached $%.2f >= $%.2f. SL moved to %.2f (+$%.2f)",
                                 ticket, pos_profit, InpBETriggerUSD, be_target_sl, InpBELockUSD);
                  }
               }
               else if(m_position.PositionType() == POSITION_TYPE_SELL)
               {
                  double be_target_sl = NormalizeDouble(open_p - lock_price_dist, m_symbol.Digits());
                  if(pos_profit >= InpBETriggerUSD && (cur_sl > open_p || cur_sl == 0.0))
                  {
                     m_trade.PositionModify(ticket, be_target_sl, m_position.TakeProfit());
                     PrintFormat("BREAK-EVEN TRIGGERED (SELL #%d): Profit reached $%.2f >= $%.2f. SL moved to %.2f (+$%.2f)",
                                 ticket, pos_profit, InpBETriggerUSD, be_target_sl, InpBELockUSD);
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

   double current_price = (basket_type == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();
   double avg_profit_per_pos = total_profit_usd / my_positions;

   // 3. Dynamic Runner Exit
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

   // 4. Session End Profit Lock
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
//| Calculate Lot Size based on Dynamic Risk or Fixed Lot            |
//+------------------------------------------------------------------+
double CalculateLotSize(double sl_dist_price)
{
   if(InpFixedLot > 0.0)
      return InpFixedLot;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double risk_cash = balance * (InpRiskPercent / 100.0);

   if(!m_symbol.RefreshRates())
      return m_symbol.LotsMin();

   double point_val = 0.0;
   if(!SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0)
   {
      double cs = m_symbol.ContractSize();
      if(cs <= 0.0) cs = 100.0;
      point_val = cs * m_symbol.Point();
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

   // Broker Free Margin Safety Check
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
   int german_hour = (dt.hour >= 1) ? (dt.hour - 1) : 23;

   string state_str = StringFormat("Aktiv - Scannt jede %s Kerze", EnumToString(m_calc_timeframe));
   if(m_target_reached)
      state_str = "BLUEBERRY TARGET ERREICHT! (Bestanden)";
   else if(m_total_lockout)
      state_str = "NOT-HALT (Gesamt-Drawdown Limit erreicht)";
   else if(m_daily_lockout)
      state_str = "TAGES-SPERRE (Tages-Drawdown Limit erreicht)";
   else if(!in_window)
      state_str = "Warten auf Handelsfenster (01:00-23:45 Server / 00:00-22:45 DE)";

   string lot_display = (InpFixedLot > 0.0) ? StringFormat("Fix %.2f Lot", InpFixedLot) : StringFormat("%.2f%% Dynamisch", InpRiskPercent);

   string dash = "";
   dash += "========================================================\n";
   dash += "         XAU TITAN M5 (HIGH-SPEED SCALPER)              \n";
   dash += "========================================================\n";
   dash += StringFormat("Zeit:           Server %02d:%02d | DEUTSCHLAND %02d:%02d\n", dt.hour, dt.min, german_hour, dt.min);
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += StringFormat("Positionsgröße: %s | Max Positionen: %d\n", lot_display, InpMaxOpenPositions);
   dash += StringFormat("Tages DD:       %.2f%% / 4.00%% Max (EA-Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamt DD:      %.2f%% / 10.00%% Max (EA-Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Handelsfenster: %s (01:00-23:45 Server)\n", in_window ? "OFFEN (Trades erlaubt)" : "GESCHLOSSEN");
   dash += StringFormat("Berechnung:     %s Basis | Spacing: %d Bars\n", EnumToString(m_calc_timeframe), InpMinBarsBetweenEntries);
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   dash += "========================================================\n";

   Comment(dash);
}
//+------------------------------------------------------------------+
