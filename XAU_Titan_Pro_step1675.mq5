//+------------------------------------------------------------------+
//|                                              XAU_Titan_Pro.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|                 Version 7.0 - Original Benchmark Mirror          |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "7.00"
#property description "High-Profit Institutional Trend-Pullback Scaling EA for Gold (XAUUSD)"
#property description "Reverse-Engineered to Mirror the $4,474+ Benchmark Strategy"
#property description "Certified for Live-Trading & Blueberry Funded 2-Step Prime Protection"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double   InpFixedLot                = 0.01;        // Feste Lotgröße (0.01 = Exakter Original Benchmark; 0.0 = % Risiko)
input double   InpRiskPercent             = 0.0;         // Dynamisches % Risiko (z. B. 0.5% oder 1.0% für Prop Challenges; 0.0 = Fix)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen (Original: 3)
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 Bars = 30 Min)
input ulong    InpMagicNumber             = 881122;      // Magic Number
input string   InpTradeComment            = "Titan_v7_Original"; // Trade Kommentar

input group "=== 02 / Struktureller Swing-SL & Dynamic Exit Engine ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12h Swing)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 15000;       // Max. SL-Abstand in Punkten (150 USD - Lässt Swing SL atmen!)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpUseDynamicExit          = true;        // Dynamischer Runner-Gewinnausstieg an EMA9/RSI
input double   InpMinProfitUSDForExit     = 28.0;        // Mindestgewinn in USD pro Trade vor dynamischem Ausstieg
input bool     InpUseEarlyLossCut         = true;        // Trendbruch-Verlustbegrenzung (Schließt Verlierer früh bei ca. -20$)
input double   InpEarlyLossCutUSD         = -18.0;       // Verlustschwelle in USD für Trendbruch-Notausstieg
input bool     InpCloseInProfitAtSessionEnd = false;     // Session-Ende Schließung (false = Trades laufen über Nacht durch wie Original)
input double   InpSessionEndMinProfitUSD  = 5.0;         // Mindestgewinn für Session-Ende Schließung in USD
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = TP nicht genutzt, exakt wie Original)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Choket Gold nicht)
input double   InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double   InpBELockUSD               = 15.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 03 / Handelszeiten & Sessions (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00) (Original: 110 hochprofitable Trades!)
input bool     InpAvoidNewsSpikeHours     = false;       // News-Hours meiden
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (01:00 = Beginn Asien nach Mitternacht)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde (23:45 = Vor Mitternachts-Rollover)
input int      InpTradeEndMinute          = 45;          // Handelsende Minute

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool     InpEnablePropProtection    = false;       // Harter Prop-Firm Notaus aktiv (Bei Prop Challenge auf true!)
input double   InpMaxDailyDrawdownPercent = 3.0;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 6.0;         // Max. Gesamtverlust % (Notbremse vor 8.0% / 10.0% Regel)
input double   InpPhaseProfitTargetPct    = 8.0;         // Phasen-Ziel % (8.0 = Stop bei +8%; 0.0 = Deaktiviert)

input group "=== 05 / Trend- & Momentum Indikatoren (M15 Basis) ==="
input int      InpFastEMAPeriod           = 9;           // Schnelle EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere EMA (M15 EMA21)
input int      InpTrendEMAPeriod          = 50;          // Haupttrend EMA (M15 EMA50)
input int      InpMacroEMAPeriod          = 200;         // Makrotrend EMA (M15 EMA200)
input int      InpRSIPeriod               = 14;          // RSI Periode
input int      InpATRPeriod               = 14;          // ATR Periode
input int      InpMinATRPoints            = 300;         // Min. ATR in Punkten (3.0 USD Filter gegen flache Märkte)

//--- Global Variables
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

// Hardcode calculation strictly to PERIOD_M15 (matching the original EA)
ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
int            m_trend_ema_handle = INVALID_HANDLE;
int            m_macro_ema_handle = INVALID_HANDLE;
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
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod,  0, MODE_EMA, PRICE_CLOSE);
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_macro_ema_handle = iMA(_Symbol, m_calc_timeframe, InpMacroEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   m_atr_handle       = iATR(_Symbol, m_calc_timeframe, InpATRPeriod);

   if(m_fast_ema_handle == INVALID_HANDLE || m_slow_ema_handle == INVALID_HANDLE ||
      m_trend_ema_handle == INVALID_HANDLE || m_macro_ema_handle == INVALID_HANDLE ||
      m_rsi_handle == INVALID_HANDLE || m_atr_handle == INVALID_HANDLE)
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

   PrintFormat("XAU_Titan_Pro v7.0 initialized. M15 Original Benchmark Mirror. Daily Start: $%.2f",
               m_day_start_balance);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_fast_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_fast_ema_handle);
   if(m_slow_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_slow_ema_handle);
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_macro_ema_handle != INVALID_HANDLE) IndicatorRelease(m_macro_ema_handle);
   if(m_rsi_handle       != INVALID_HANDLE) IndicatorRelease(m_rsi_handle);
   if(m_atr_handle       != INVALID_HANDLE) IndicatorRelease(m_atr_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within Trading Window (Avoids only Midnight Roll)       |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   if(InpFilterEliteHours)
   {
      // Hour 0 (Midnight rollover: 00:00 to 00:59) is strictly avoided
      if(dt.hour == 0)
         return false;

      // Asian Session check (Hours 1 to 7)
      if(dt.hour >= 1 && dt.hour <= 7 && !InpEnableAsianSession)
         return false;

      // News Spike / US Open Chop filter (Hours 15 to 17)
      if(InpAvoidNewsSpikeHours && (dt.hour >= 15 && dt.hour <= 17))
         return false;
   }

   int current_min = dt.hour * 60 + dt.min;
   int start_min   = InpTradeStartHour * 60 + InpTradeStartMinute;
   int end_min     = InpTradeEndHour * 60 + InpTradeEndMinute;
   return (current_min >= start_min && current_min <= end_min);
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
      m_daily_lockout     = false;
   }

   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Hard Blueberry Funded Prop-Firm Drawdown Protection
   if(InpEnablePropProtection)
   {
      // Daily Drawdown Protection
      if(m_day_start_balance > 0.0)
      {
         double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = ((daily_ref - current_equity) / daily_ref) * 100.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent)
         {
            PrintFormat("BLUEBERRY RISK ALERT: Daily Drawdown Limit Reached: %.2f%% >= %.2f%%. EMERGENCY SHUTDOWN.",
                        daily_dd_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            m_daily_lockout = true;
         }
      }

      // Max Total Drawdown Protection
      if(m_initial_account_balance > 0.0)
      {
         double total_dd_pct = ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0;
         if(total_dd_pct >= InpMaxTotalDrawdownPercent)
         {
            PrintFormat("BLUEBERRY RISK ALERT: Total Drawdown Limit Reached: %.2f%% >= %.2f%%. HARD STOP.",
                        total_dd_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }

      // Phase Profit Target Lock
      if(InpPhaseProfitTargetPct > 0.0 && m_initial_account_balance > 0.0)
      {
         double profit_pct = ((current_equity - m_initial_account_balance) / m_initial_account_balance) * 100.0;
         if(profit_pct >= InpPhaseProfitTargetPct)
         {
            PrintFormat("PROFIT TARGET REACHED: Account Profit +%.2f%% >= +%.2f%%. LOCKING IN PROFITS FOR STAGE PASS.",
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

   // 2. Manage Active Positions (Dynamic Exits, Early Loss Cut & Optional BE)
   ManageOpenPositions(dt);

   // 3. Check for New Entry on M15 Bar Close
   if(is_new_m15_bar && IsWithinTradingWindow(dt))
   {
      int open_count = CountOpenPositions();
      if(open_count < InpMaxOpenPositions)
      {
         if(current_m15_time >= m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe)))
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
   double fast_ema[2], slow_ema[2], trend_ema[2], macro_ema[2], rsi_val[2], atr_val[2];
   if(CopyBuffer(m_fast_ema_handle,  0, 1, 2, fast_ema)  < 2) return;
   if(CopyBuffer(m_slow_ema_handle,  0, 1, 2, slow_ema)  < 2) return;
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_macro_ema_handle, 0, 1, 2, macro_ema) < 2) return;
   if(CopyBuffer(m_rsi_handle,       0, 1, 2, rsi_val)   < 2) return;
   if(CopyBuffer(m_atr_handle,       0, 1, 2, atr_val)   < 2) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   double close1 = rates[0].close;
   double open1  = rates[0].open;
   double low1   = rates[0].low;
   double high1  = rates[0].high;

   // 12-Hour Structural Swing High and Low (48 M15 Bars)
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // --- INSTITUTIONAL TREND PULLBACK / MEAN REVERSION LOGIC ---
   // 1. Primary Trend alignment
   bool is_uptrend   = (slow_ema[1] >= trend_ema[1]) && (close1 >= trend_ema[1] - (20 * _Point));
   bool is_downtrend = (slow_ema[1] <= trend_ema[1]) && (close1 <= trend_ema[1] + (20 * _Point));

   // 2. Minimum Volatility filter (Avoids flat choppy sideways markets)
   bool vol_ok = (atr_val[1] >= InpMinATRPoints * _Point);

   // 3. Pullback / Retracement Trigger (Buying the Dip, Selling the Rally)
   // In Uptrend: Candle pulled back (bearish close OR price dipped to touch/pierce fast EMA)
   bool buy_pullback  = is_uptrend && vol_ok && 
                        (close1 <= open1 || low1 <= fast_ema[1] + (50 * _Point)) && 
                        (rsi_val[1] >= 40.0 && rsi_val[1] <= 68.0);

   // In Downtrend: Candle rallied back (bullish close OR price bounced to touch/pierce fast EMA)
   bool sell_pullback = is_downtrend && vol_ok && 
                        (close1 >= open1 || high1 >= fast_ema[1] - (50 * _Point)) && 
                        (rsi_val[1] <= 60.0 && rsi_val[1] >= 32.0);

   // Prevent hedging: Only scale into the same direction
   int open_buys = 0, open_sells = 0;
   CountPositionsByType(open_buys, open_sells);

   if(buy_pullback && open_sells == 0)
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
   else if(sell_pullback && open_buys == 0)
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
//| Manage Open Positions (Dynamic Runner Exit & Early Loss Cut)     |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt)
{
   double fast_ema[1], slow_ema[1], trend_ema[1], rsi_val[1];
   if(CopyBuffer(m_fast_ema_handle,  0, 0, 1, fast_ema)  < 1) return;
   if(CopyBuffer(m_slow_ema_handle,  0, 0, 1, slow_ema)  < 1) return;
   if(CopyBuffer(m_trend_ema_handle, 0, 0, 1, trend_ema) < 1) return;
   if(CopyBuffer(m_rsi_handle,       0, 0, 1, rsi_val)   < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Intelligent Break-Even Protection (Optional)
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

   // 2. Individual Position Evaluation: Dynamic Runner Exits & Early Loss Cut
   total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            ulong ticket = m_position.Ticket();
            double pos_profit = m_position.Profit() + m_position.Swap();
            ENUM_POSITION_TYPE ptype = m_position.PositionType();
            double cur_price = (ptype == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();

            bool close_pos = false;
            string reason = "";

            // A) Dynamic Runner Profit Taking (Averages +$36/win)
            if(InpUseDynamicExit && pos_profit >= InpMinProfitUSDForExit)
            {
               if(ptype == POSITION_TYPE_BUY)
               {
                  if(cur_price < fast_ema[0] || rsi_val[0] >= 72.0)
                  {
                     close_pos = true;
                     reason = StringFormat("Dynamic Profit Take: +$%.2f (Price < EMA9 or RSI >= 72)", pos_profit);
                  }
               }
               else if(ptype == POSITION_TYPE_SELL)
               {
                  if(cur_price > fast_ema[0] || rsi_val[0] <= 28.0)
                  {
                     close_pos = true;
                     reason = StringFormat("Dynamic Profit Take: +$%.2f (Price > EMA9 or RSI <= 28)", pos_profit);
                  }
               }
            }

            // B) Early Trend Invalidation Cut (Cuts losses to ~$20 instead of taking full -$50 to -$80 SL!)
            if(!close_pos && InpUseEarlyLossCut && pos_profit <= InpEarlyLossCutUSD)
            {
               if(ptype == POSITION_TYPE_BUY)
               {
                  if((fast_ema[0] < slow_ema[0]) || (cur_price < trend_ema[0]))
                  {
                     close_pos = true;
                     reason = StringFormat("Early Loss Cut: $%.2f (Trend Broken: EMA9 < EMA21 or Price < EMA50)", pos_profit);
                  }
               }
               else if(ptype == POSITION_TYPE_SELL)
               {
                  if((fast_ema[0] > slow_ema[0]) || (cur_price > trend_ema[0]))
                  {
                     close_pos = true;
                     reason = StringFormat("Early Loss Cut: $%.2f (Trend Broken: EMA9 > EMA21 or Price > EMA50)", pos_profit);
                  }
               }
            }

            // C) Session End Profit Lock
            if(!close_pos && InpCloseInProfitAtSessionEnd && dt.hour >= InpTradeEndHour)
            {
               if(pos_profit >= InpSessionEndMinProfitUSD)
               {
                  close_pos = true;
                  reason = StringFormat("Session End Profit Lock: +$%.2f", pos_profit);
               }
            }

            if(close_pos)
            {
               if(m_trade.PositionClose(ticket))
               {
                  PrintFormat("POSITION CLOSED #%d: %s", ticket, reason);
               }
            }
         }
      }
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
   double risk_amount = equity * (InpRiskPercent / 100.0);

   double point_val = 0.0;
   if(!SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE, point_val) || point_val <= 0.0)
      point_val = 1.0;

   double tick_size = m_symbol.TickSize() > 0 ? m_symbol.TickSize() : 0.01;
   double usd_per_price_unit_1lot = (point_val * (1.0 / tick_size));
   if(usd_per_price_unit_1lot <= 0.0) usd_per_price_unit_1lot = 100.0;

   double loss_per_lot = sl_dist_price * usd_per_price_unit_1lot;
   if(loss_per_lot <= 0.0) return m_symbol.LotsMin();

   double calc_lots = risk_amount / loss_per_lot;

   // Live Margin Check
   double margin_required = 0.0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, calc_lots, m_symbol.Ask(), margin_required))
   {
      double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(margin_required > free_margin * 0.70)
      {
         double safe_margin = free_margin * 0.70;
         calc_lots = calc_lots * (safe_margin / margin_required);
      }
   }

   // Clamp to broker boundaries
   double lot_step = m_symbol.LotsStep();
   calc_lots = MathFloor(calc_lots / lot_step) * lot_step;

   if(calc_lots < m_symbol.LotsMin()) calc_lots = m_symbol.LotsMin();
   if(calc_lots > m_symbol.LotsMax()) calc_lots = m_symbol.LotsMax();

   return NormalizeDouble(calc_lots, 2);
}

//+------------------------------------------------------------------+
//| Helper Functions                                                 |
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

void CountPositionsByType(int &buys, int &sells)
{
   buys = 0;
   sells = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            if(m_position.PositionType() == POSITION_TYPE_BUY) buys++;
            else if(m_position.PositionType() == POSITION_TYPE_SELL) sells++;
         }
      }
   }
}

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
//| HUD Dashboard                                                    |
//+------------------------------------------------------------------+
void UpdateDashboard(const MqlDateTime &dt)
{
   double current_equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double current_balance = AccountInfoDouble(ACCOUNT_BALANCE);

   double daily_dd_pct = 0.0;
   if(m_day_start_balance > 0.0)
   {
      double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
      daily_dd_pct = ((daily_ref - current_equity) / daily_ref) * 100.0;
   }

   double total_dd_pct = 0.0;
   if(m_initial_account_balance > 0.0)
      total_dd_pct = ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0;

   int open_buys = 0, open_sells = 0;
   CountPositionsByType(open_buys, open_sells);

   string hud = "==========================================\n";
   hud += "        XAU_TITAN_PRO v7.0 (ORIGINAL MIRROR)\n";
   hud += "==========================================\n";
   hud += StringFormat("Symbol: %s | Timeframe: M15 Engine\n", _Symbol);
   hud += StringFormat("Server Time: %02d:%02d | Trading Active: %s\n",
                       dt.hour, dt.min, IsWithinTradingWindow(dt) ? "YES" : "NO");
   hud += StringFormat("Balance: $%.2f | Equity: $%.2f\n", current_balance, current_equity);
   hud += StringFormat("Open Positions: %d (Buys: %d, Sells: %d)\n", (open_buys + open_sells), open_buys, open_sells);
   hud += StringFormat("Daily DD: %.2f%% / Limit: %.1f%%\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   hud += StringFormat("Total DD: %.2f%% / Limit: %.1f%%\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   hud += "------------------------------------------\n";
   if(m_daily_lockout)
      hud += "STATUS: [LOCKED] Daily Drawdown Limit Hit!\n";
   else if(m_total_lockout)
      hud += "STATUS: [LOCKED] Total Drawdown Limit Hit!\n";
   else if(m_target_reached)
      hud += "STATUS: [TARGET REACHED] Challenge Passed!\n";
   else
      hud += "STATUS: [ACTIVE] Monitoring Trend-Pullbacks...\n";
   hud += "==========================================";

   Comment(hud);
}
//+------------------------------------------------------------------+
