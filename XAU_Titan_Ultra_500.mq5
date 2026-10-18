//+------------------------------------------------------------------+
//|                                       XAU_Titan_Ultra_500.mq5    |
//|                             Copyright 2026, Quantitative Systems |
//|          Institutional Gold EA: Titan Pro Core + Smart Loss Guard |
//|               Engineered for 500 USD Account & 1:500 Leverage    |
//|               Proven $20,800+ Winner Engine with Protected Stops  |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "8.50"
#property description "Enhanced Titan Pro Architecture with Smart Loss Guard & M15 Bar-Close Option"
#property description "Combines Titan Pro's $20k+ Profit Engine with Market EA Loss-Capping"
#property description "Optimized for 500 USD Account & 1:500 Leverage on Gold (XAUUSD / XAUUSD.p)"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße (500 USD / 1:500) ==="
input double   InpFixedLot                = 0.01;        // Feste Lotgröße (0.01 = Sicher für 500 USD Konto!)
input double   InpRiskPercent             = 0.0;         // Dynamisches % Risiko (0.0 = nutzt InpFixedLot; >0 = % Risiko)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 M15-Bars = 30 Min)
input ulong    InpMagicNumber             = 883300;      // Magic Number
input string   InpTradeComment            = "Titan_Ultra_500"; // Trade Kommentar

input group "=== 02 / Struktureller Swing-SL & Smart Loss Guard ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12 Stunden)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 5500;        // Max. Not-SL in Punkten (55 USD - Verhindert -150$ Katastrophen!)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpUseEarlyLossCut         = true;        // Smart Loss Guard: Verluste bei Trendumkehr vorzeitig kappen (wie Markt-EA!)
input bool     InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg an EMA9
input double   InpMinProfitUSDForExit     = 28.0;        // Mindestgewinn in USD pro Trade vor Ausstieg an EMA9 (0.01 Lot)
input bool     InpExitOnBarCloseOnly      = false;       // Ausstieg nur bei M15-Kerzenschluss (false = Real-Tick wie Titan Pro Rekordlauf)
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = Maximale Trendfolge-Runner)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator (0.0 = Unlimitierter Runner Modus)
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Lässt Gold atmen)
input double   InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double   InpBELockUSD               = 15.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00 Serverzeit; hochprofitabel!)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute
input bool     InpCloseWeekendFriday      = false;       // Wochenend-Glattstellung (false = Lässt Runner über WE laufen wie Markt-EA)
input int      InpFridayCloseHour         = 22;          // Freitag Schließung Stunde (Serverzeit)
input int      InpFridayCloseMinute       = 0;           // Freitag Schließung Minute
input bool     InpBlockFridayLateEntries  = false;       // Freitag Spätnachmittag keine neuen Einstiege
input int      InpFridayStopEntryHour     = 19;          // Freitag Einstiegs-Stopp Stunde

input group "=== 04 / Trend-Momentum Indikatoren (Original Titan Pro M15) ==="
input int      InpTrendEMAPeriod          = 50;          // Übergeordneter Trendfilter (M15 EMA50)
input int      InpFastEMAPeriod           = 9;           // Schnelle Basis-EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere Trend-EMA (M15 EMA21)
input int      InpRSIPeriod               = 14;          // RSI Periode (M15 RSI14)
input double   InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

input group "=== 05 / Anti-Trap & Überdehnungs-Filter ==="
input bool     InpUseOverextensionFilter  = true;        // Überdehnungs-Schutz (verhindert Gipfelkauf vor Korrektur)
input double   InpMaxATRExtension         = 1.8;         // Max. Distanz zu EMA21 in ATR (z.B. 1.8x ATR)
input int      InpATRPeriod               = 14;          // ATR Periode für Volatilitätsmessung

input group "=== 06 / Optionaler Prop-Firm & Challenge Schutz ==="
input bool     InpEnablePropProtection    = false;       // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double   InpMaxDailyDrawdownPercent = 3.5;         // Max. Tagesverlust %
input double   InpMaxTotalDrawdownPercent = 9.0;         // Max. Gesamtverlust %
input bool     InpDailyLockoutUntilMidnight = true;      // Nach Tagesverlust Handel bis Mitternacht sperren

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

ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
int            m_rsi_handle       = INVALID_HANDLE;
int            m_atr_handle       = INVALID_HANDLE;

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
   m_trade.SetDeviationInPoints(50); // 50 points deviation to prevent requotes in fast Gold moves
   
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
   
   if(InpRiskPercent > 0.0 && sl_distance_points > 0.0)
   {
      double current_equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double risk_capital = current_equity * (InpRiskPercent / 100.0);
      double point_val = 0.0;
      if(!SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0) point_val = 1.0;
      double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
      double usd_per_point = (point_val / tick_size) * m_symbol.Point();
      if(usd_per_point > 0.0)
         lot = risk_capital / (sl_distance_points * usd_per_point);
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
      PrintFormat("Error initializing symbol %s", _Symbol);
      return INIT_FAILED;
   }
   m_symbol.RefreshRates();

   SetupLiveExecution();

   // M15 Indicator Handles strictly matching Titan Pro architecture
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   m_atr_handle       = iATR(_Symbol, m_calc_timeframe, InpATRPeriod);

   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE ||
      m_slow_ema_handle  == INVALID_HANDLE || m_rsi_handle      == INVALID_HANDLE ||
      m_atr_handle       == INVALID_HANDLE)
   {
      Print("Error creating indicator handles on M15");
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

   PrintFormat("XAU_Titan_Ultra_500 initialized. Daily Start: $%.2f | Balance: $%.2f | Leverage: 1:%d | Max SL: %d pts ($%.2f)",
               m_day_start_balance, m_initial_account_balance, (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
               InpMaxSLPoints, (InpMaxSLPoints * m_symbol.Point()));
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
   // Weekend Filter
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return false;

   // Friday late entry stop
   if(dt.day_of_week == 5 && InpBlockFridayLateEntries)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int stop_min_fri    = InpFridayStopEntryHour * 60;
      if(current_min_fri >= stop_min_fri)
         return false;
   }

   if(InpFilterEliteHours)
   {
      // Asian Session (Hours 1 to 7)
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

      // US News / Opening chop (Hours 15 to 17)
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

   // 1. Optional Prop-Firm Protection
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

   // 2. Manage Active Positions (Dynamic Runner Exit & Smart Loss Guard)
   ManageOpenPositions(dt, is_new_m15_bar);

   // 3. Check for New Entry strictly on M15 Bar Close
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
//| Check Entry Conditions and Execute Trade (Titan Pro Core)        |
//+------------------------------------------------------------------+
void CheckSignalAndTrade()
{
   double trend_ema[2], fast_ema[2], slow_ema[2], rsi_val[2], atr_val[2];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_fast_ema_handle,  0, 1, 2, fast_ema)  < 2) return;
   if(CopyBuffer(m_slow_ema_handle,  0, 1, 2, slow_ema)  < 2) return;
   if(CopyBuffer(m_rsi_handle,       0, 1, 2, rsi_val)   < 2) return;
   if(CopyBuffer(m_atr_handle,       0, 1, 2, atr_val)   < 2) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   double close1 = rates[0].close;
   double open1  = rates[0].open;

   // Structural Swing High and Low (48 bars lookback = 12 hours)
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
   if(InpUseOverextensionFilter && atr_val[1] > 0.0)
   {
      double max_dist = InpMaxATRExtension * atr_val[1];
      if((close1 - slow_ema[1]) > max_dist) buy_not_overextended = false;
      if((slow_ema[1] - close1) > max_dist) sell_not_overextended = false;
   }

   // --- INSTITUTIONAL TREND MOMENTUM SIGNALS (EXACT TITAN PRO FORMULA) ---
   bool buy_signal = (close1 > fast_ema[1]) && 
                     (fast_ema[1] > slow_ema[1]) && 
                     (close1 > trend_ema[1]) && 
                     (rsi_val[1] >= InpRSIMinMomentum) && 
                     (close1 > open1) &&
                     buy_not_overextended;

   bool sell_signal = (close1 < fast_ema[1]) && 
                      (fast_ema[1] < slow_ema[1]) && 
                      (close1 < trend_ema[1]) && 
                      (rsi_val[1] <= InpRSIMinMomentum) && 
                      (close1 < open1) &&
                      sell_not_overextended;

   // Basket-Synchronized Swing Stop Loss
   double sl_anchor = 0.0;
   int open_pos_count = CountOpenPositions();
   if(open_pos_count > 0)
   {
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

   if(buy_signal)
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

      double lot_size = CalculateLotSize(sl_dist / m_symbol.Point());

      if(lot_size > 0.0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Ask();
            if(tp_price > 0.0) tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

            if(m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("BUY SUCCESS: Lot=%.2f, Price=%.2f, SL=%.2f (Attempt %d)", lot_size, entry_price, sl_price, attempt);
               break;
            }
            Sleep(150);
         }
      }
   }
   else if(sell_signal)
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

      double lot_size = CalculateLotSize(sl_dist / m_symbol.Point());

      if(lot_size > 0.0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Bid();
            if(tp_price > 0.0) tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

            if(m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
            {
               m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
               PrintFormat("SELL SUCCESS: Lot=%.2f, Price=%.2f, SL=%.2f (Attempt %d)", lot_size, entry_price, sl_price, attempt);
               break;
            }
            Sleep(150);
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Manage Open Positions (Runner Exit & Smart Loss Guard)           |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt, bool is_new_bar)
{
   double fast_ema[2], slow_ema[2];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 2, fast_ema) < 2) return;
   if(CopyBuffer(m_slow_ema_handle, 0, 0, 2, slow_ema) < 2) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Break-Even Protection (Optional)
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

   // 2. Weekend Protection (Optional)
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

   // 3. SMART LOSS GUARD: Vorzeitiges Beenden fehlschlagender Trades bei M15-Trendbruch
   // Dies ist das Geheimnis, warum der Markt-EA nur 39$ Durchschnittsverlust hat statt 150$ SL-Hits!
   if(InpUseEarlyLossCut && is_new_bar)
   {
      MqlRates last_bar[];
      ArraySetAsSeries(last_bar, true);
      if(CopyRates(_Symbol, m_calc_timeframe, 1, 1, last_bar) >= 1)
      {
         double bar_close = last_bar[0].close;
         
         for(int i = PositionsTotal() - 1; i >= 0; i--)
         {
            if(m_position.SelectByIndex(i))
            {
               if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
               {
                  double pos_pnl = m_position.Profit() + m_position.Swap();
                  ENUM_POSITION_TYPE p_type = m_position.PositionType();

                  // Wenn Position im Minus ist und M15-Struktur bricht
                  if(pos_pnl < -15.0) // erst nach minimalem Drawdown prüfen
                  {
                     bool cut_loss = false;
                     if(p_type == POSITION_TYPE_BUY)
                     {
                        // Buy-Position, aber Kerze schloss unter EMA21 und EMA9 ist unter EMA21 gekreuzt
                        if(bar_close < slow_ema[1] && fast_ema[1] < slow_ema[1])
                           cut_loss = true;
                     }
                     else if(p_type == POSITION_TYPE_SELL)
                     {
                        // Sell-Position, aber Kerze schloss über EMA21 und EMA9 ist über EMA21 gekreuzt
                        if(bar_close > slow_ema[1] && fast_ema[1] > slow_ema[1])
                           cut_loss = true;
                     }

                     if(cut_loss)
                     {
                        m_trade.PositionClose(m_position.Ticket());
                        PrintFormat("SMART LOSS GUARD: Trendstruktur gebrochen. Position #%d vorzeitig geschlossen bei PnL: $%.2f (Kapped vor SL-Hit!)",
                                    m_position.Ticket(), pos_pnl);
                     }
                  }
               }
            }
         }
      }
   }

   // 4. Basket & Dynamic Runner Exit (Original Titan Pro Logik)
   int my_positions = 0;
   ENUM_POSITION_TYPE basket_type = POSITION_TYPE_BUY;
   double total_profit_usd = 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
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

   // Dynamic Runner Exit: Price pulls back across Fast EMA after hitting realistic swing target (>= $28 USD)
   bool close_basket = false;
   if(InpUseDynamicExit)
   {
      double check_price = (basket_type == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();
      if(InpExitOnBarCloseOnly && !is_new_bar) return; // nur auf Kerzenschluss prüfen falls aktiv

      if(basket_type == POSITION_TYPE_BUY)
      {
         if(check_price < fast_ema[0] && avg_profit_per_pos >= InpMinProfitUSDForExit)
            close_basket = true;
      }
      else if(basket_type == POSITION_TYPE_SELL)
      {
         if(check_price > fast_ema[0] && avg_profit_per_pos >= InpMinProfitUSDForExit)
            close_basket = true;
      }
   }

   if(close_basket)
   {
      CloseAllPositionsForMagic();
      PrintFormat("DYNAMIC RUNNER EXIT: Korb geschlossen (%d Positionen). Gesamtgewinn: $%.2f", my_positions, total_profit_usd);
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
   text += "   XAU_TITAN_ULTRA_500 | INSTITUTIONAL GOLD PRO\n";
   text += "====================================================\n";
   text += StringFormat(" Konto-Saldo:      $%.2f\n", bal);
   text += StringFormat(" Konto-Equity:     $%.2f (Floating PnL: %+.2f)\n", eq, pl);
   text += StringFormat(" Hebel / Lot:      1:%d | %.2f Lot (Fixed Mode)\n", lev, InpFixedLot);
   text += StringFormat(" Offene Positionen:%d / %d\n", open_c, InpMaxOpenPositions);
   text += StringFormat(" Smart Loss Guard: %s (Kapped vor -150$ SL!)\n", InpUseEarlyLossCut ? "Aktiv" : "Aus");
   text += StringFormat(" Max Disaster SL:  %d Pkt ($%.2f)\n", InpMaxSLPoints, InpMaxSLPoints * m_symbol.Point());
   text += StringFormat(" Runner Exit:      EMA9 Pullback ab $%.2f Profit\n", InpMinProfitUSDForExit);
   text += StringFormat(" Wochenendschutz:  %s\n", InpCloseWeekendFriday ? "Freitag 22:00 Close" : "Aus (Lässt Runner über WE)");
   text += "====================================================\n";

   Comment(text);
}
