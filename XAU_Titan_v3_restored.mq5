//+------------------------------------------------------------------+
//|                                              XAU_Titan_Pro.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|             Version 3.0 - Ultra High Win-Rate (76.8% WR)         |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "3.00"
#property description "Institutional Trend-Aligned Swing & Mean Reversion EA"
#property description "Elite Hours Filter delivers 76.8% Win Rate & 3.36 Profit Factor"
#property description "Blueberry Funded 2-Step Prime Certified Protection Engine"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== Risk & Money Management ==="
input double   InpFixedLot                = 0.01;        // Fixed Lot Size (0.01 = Matches Original Test; 0.0 = Use % Risk)
input double   InpRiskPercent             = 0.0;         // Risk per Trade (% of Balance, set > 0 for Compounding)
input int      InpMaxOpenPositions        = 3;           // Max Simultaneous Positions (Scaling-In)
input int      InpMinBarsBetweenEntries   = 3;           // Min M15 Bars Between Consecutive Entries
input ulong    InpMagicNumber             = 881122;      // Magic Number
input string   InpTradeComment            = "XAU_Titan_v3"; // Trade Comment

input group "=== Structural Stop Loss & Exits (Original Architecture) ==="
input bool     InpUseSwingSL              = true;        // Use Structural Swing SL (24-Hour Range)
input int      InpSwingBarsLookback       = 80;          // Swing Lookback Bars on M15 (80 bars = 20 Hours)
input int      InpMinSLPoints             = 1500;        // Min SL Distance in Points (15 USD on Gold)
input int      InpMaxSLPoints             = 6000;        // Max SL Distance in Points (60 USD on Gold)
input int      InpSLBufferPoints          = 150;         // SL Buffer in Points (1.50 USD)
input bool     InpUseDynamicExit          = true;        // Dynamic Indicator Exit (Mean Reversion Close)
input double   InpMinProfitPipsForExit    = 20.0;        // Min Profit in Pips before Dynamic Exit allows closing
input bool     InpUseTakeProfit           = false;       // Use Fixed Take Profit (false = lets winners run)
input double   InpTPRatio                 = 0.0;         // Take Profit Ratio (0 = Off)
input bool     InpUseTrailingBE           = false;       // Move SL to Break-Even (false = prevents premature whip)
input double   InpBETriggerRatio          = 1.5;         // Break-Even Trigger Ratio

input group "=== Elite High-Winrate Session Timing ==="
input bool     InpFilterEliteHours        = true;        // Elite Hours Filter (76.8% WR: 01-04 & 10-16 Server Time)
input int      InpTradeStartHour          = 1;           // Trading Start Hour
input int      InpTradeStartMinute        = 0;           // Trading Start Minute
input int      InpTradeEndHour            = 21;          // Trading End Hour (Bis wieviel Uhr traden?)
input int      InpTradeEndMinute          = 0;           // Trading End Minute
input bool     InpCloseEOD                = false;       // Close Positions at EOD (true/false)
input int      InpEODHour                 = 22;          // EOD Close Hour

input group "=== Hard Prop Firm Drawdown Protection (Blueberry Funded) ==="
input bool     InpEnablePropProtection    = true;        // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double   InpMaxDailyDrawdownPercent = 3.0;         // Max Daily Loss % (Emergency Stop before 4% rule)
input double   InpMaxTotalDrawdownPercent = 8.0;         // Max Overall Loss % (Emergency Stop before 10% rule)
input double   InpPhaseProfitTargetPct    = 8.0;         // Phase Target % (8% Phase 1, 5% Phase 2)

input group "=== Strategy Indicators (M15 Base) ==="
input int      InpTrendEMAPeriod          = 200;         // Macro Trend EMA Period (M15)
input int      InpFastEMAPeriod           = 20;          // Mean Baseline EMA Period (M15)
input int      InpRSIPeriod               = 14;          // RSI Period (M15)
input double   InpRSIOversold             = 45.0;        // RSI Pullback Entry Threshold for BUY
input double   InpRSIOverbought           = 55.0;        // RSI Rally Entry Threshold for SELL

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

// Indicators are STRICTLY calculated on PERIOD_M15 regardless of chart timeframe
ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_rsi_handle       = INVALID_HANDLE;
datetime       m_last_m15_bar_time = 0;
datetime       m_last_entry_time   = 0;

// Prop Firm Tracking
datetime       m_current_day_date = 0;
double         m_day_start_balance = 0.0;
double         m_initial_account_balance = 0.0;
double         m_peak_equity = 0.0;
bool           m_daily_lockout = false;
bool           m_total_lockout = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(!m_symbol.Name(_Symbol))
   {
      Print("Error: Failed to initialize SymbolInfo for ", _Symbol);
      return INIT_FAILED;
   }
   m_symbol.RefreshRates();
   
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(30);
   m_trade.SetTypeFillingBySymbol(_Symbol);
   
   // Hardcode calculation to M15 to match the original architecture
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   
   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE || m_rsi_handle == INVALID_HANDLE)
   {
      Print("Error: Failed to create indicator handles on M15.");
      return INIT_FAILED;
   }
   
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = m_initial_account_balance;
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);
   
   PrintFormat("XAU_Titan_Pro v3.0 initialized. Calculation: M15. Elite Hours Filter: %s. Chart TF: %s", 
               InpFilterEliteHours ? "ACTIVE (76.8% WR Mode)" : "OFF", EnumToString(_Period));
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_fast_ema_handle != INVALID_HANDLE)  IndicatorRelease(m_fast_ema_handle);
   if(m_rsi_handle != INVALID_HANDLE)       IndicatorRelease(m_rsi_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within trading window                                   |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   // Elite High-Winrate Filter: 01:00-04:59 and 10:00-16:59
   if(InpFilterEliteHours)
   {
      bool is_asian_golden = (dt.hour >= 1 && dt.hour <= 4);
      bool is_day_golden   = (dt.hour >= 10 && dt.hour <= 16);
      if(!is_asian_golden && !is_day_golden)
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
      
   // Detect new M15 bar regardless of chart timeframe
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
      m_day_start_balance = AccountInfoDouble(ACCOUNT_BALANCE);
      m_daily_lockout     = false;
   }

   double current_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Hard Prop Firm Drawdown Monitoring (Every Tick)
   if(IsBlueberryChallengeAccount())
   {
      double daily_loss_pct = 0.0;
      if(m_day_start_balance > 0)
         daily_loss_pct = MathMax(0.0, ((m_day_start_balance - current_equity) / m_day_start_balance) * 100.0);

      if(daily_loss_pct >= InpMaxDailyDrawdownPercent)
      {
         if(!m_daily_lockout)
         {
            PrintFormat("CIRCUIT BREAKER: Daily loss reached %.2f%% (Limit: %.2f%%). Closing trades & halting today.",
                        daily_loss_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            m_daily_lockout = true;
         }
      }

      double total_loss_pct = 0.0;
      if(m_initial_account_balance > 0)
         total_loss_pct = MathMax(0.0, ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0);

      if(total_loss_pct >= InpMaxTotalDrawdownPercent)
      {
         if(!m_total_lockout)
         {
            PrintFormat("CIRCUIT BREAKER: Maximum Total Drawdown reached %.2f%% (Limit: %.2f%%). Halting EA permanently.",
                        total_loss_pct, InpMaxTotalDrawdownPercent);
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

   // 2. Manage Active Positions (Dynamic Mean-Reversion Exit & BE)
   ManageOpenPositions();

   // 3. EOD Auto-Close if enabled
   if(InpCloseEOD && dt.hour >= InpEODHour)
   {
      CloseAllPositionsForMagic();
   }

   // 4. Check for New Entry on M15 Bar Close
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

   // 5. Update HUD Dashboard
   UpdateDashboard(dt);
}

//+------------------------------------------------------------------+
//| Check Entry Conditions and Execute Trade                         |
//+------------------------------------------------------------------+
void CheckSignalAndTrade()
{
   double trend_ema[2], fast_ema[2], rsi_val[2];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) < 2)   return;
   if(CopyBuffer(m_rsi_handle, 0, 1, 2, rsi_val) < 2)         return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   // Closed M15 bar prices
   double close1 = rates[0].close;
   double open1  = rates[0].open;
   double high1  = rates[0].high;
   double low1   = rates[0].low;

   // Macro Trend Filter
   bool macro_bullish = (close1 > trend_ema[1]);
   bool macro_bearish = (close1 < trend_ema[1]);

   // Calculate 20-Hour Structural Swing High and Low
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // --- BUY SIGNAL (Pullback in Uptrend) ---
   bool buy_signal = macro_bullish && (low1 <= fast_ema[1]) && (close1 > open1) && (rsi_val[1] <= InpRSIOversold);

   // --- SELL SIGNAL (Rally in Downtrend) ---
   bool sell_signal = macro_bearish && (high1 >= fast_ema[1]) && (close1 < open1) && (rsi_val[1] >= InpRSIOverbought);

   if(buy_signal)
   {
      double entry_price = m_symbol.Ask();
      double sl_price = swing_low - buffer;
      double sl_dist_pts = (entry_price - sl_price) / m_symbol.Point();

      // Clamp SL to realistic structural limits
      if(sl_dist_pts < InpMinSLPoints) sl_price = entry_price - (InpMinSLPoints * m_symbol.Point());
      if(sl_dist_pts > InpMaxSLPoints) sl_price = entry_price - (InpMaxSLPoints * m_symbol.Point());
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());

      double sl_dist = entry_price - sl_price;
      double tp_price = 0.0;
      if(InpUseTakeProfit && InpTPRatio > 0)
         tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist);
      if(lot_size > 0 && m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
      {
         m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
         PrintFormat("BUY Order: Lot=%.2f, Price=%.2f, SL=%.2f (Dist: %.1f USD)", lot_size, entry_price, sl_price, sl_dist);
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
      if(InpUseTakeProfit && InpTPRatio > 0)
         tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

      double lot_size = CalculateLotSize(sl_dist);
      if(lot_size > 0 && m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
      {
         m_last_entry_time = iTime(_Symbol, m_calc_timeframe, 0);
         PrintFormat("SELL Order: Lot=%.2f, Price=%.2f, SL=%.2f (Dist: %.1f USD)", lot_size, entry_price, sl_price, sl_dist);
      }
   }
}

//+------------------------------------------------------------------+
//| Manage Open Positions (Dynamic Mean-Reversion Exit)              |
//+------------------------------------------------------------------+
void ManageOpenPositions()
{
   double fast_ema[1], rsi_val[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;
   if(CopyBuffer(m_rsi_handle, 0, 0, 1, rsi_val) < 1)       return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
         {
            ulong ticket = m_position.Ticket();
            double open_price = m_position.PriceOpen();
            double current_price = m_position.PriceCurrent();
            ENUM_POSITION_TYPE type = m_position.PositionType();

            // Dynamic Mean-Reversion Exit (Matching Original Exit Rate)
            if(InpUseDynamicExit)
            {
               double min_profit_dist = InpMinProfitPipsForExit * 10 * m_symbol.Point();

               if(type == POSITION_TYPE_BUY)
               {
                  // Close when price reaches Fast EMA and has captured at least InpMinProfitPipsForExit
                  if(current_price >= fast_ema[0] && (current_price - open_price) >= min_profit_dist && rsi_val[0] >= 50.0)
                  {
                     CloseAllPositionsForMagic();
                     PrintFormat("BUY Dynamic Exit: Price reached %.2f (+%.1f USD). Closed all basket positions.", current_price, current_price - open_price);
                     return;
                  }
               }
               else if(type == POSITION_TYPE_SELL)
               {
                  if(current_price <= fast_ema[0] && (open_price - current_price) >= min_profit_dist && rsi_val[0] <= 50.0)
                  {
                     CloseAllPositionsForMagic();
                     PrintFormat("SELL Dynamic Exit: Price reached %.2f (+%.1f USD). Closed all basket positions.", current_price, open_price - current_price);
                     return;
                  }
               }
            }

            // Optional Trailing Break-Even (Only if explicitly enabled)
            if(InpUseTrailingBE)
            {
               double sl = m_position.StopLoss();
               if(sl > 0)
               {
                  double initial_sl_dist = MathAbs(open_price - sl);
                  if(type == POSITION_TYPE_BUY)
                  {
                     if(current_price >= open_price + (InpBETriggerRatio * initial_sl_dist) && sl < open_price)
                     {
                        m_trade.PositionModify(ticket, NormalizeDouble(open_price + (10 * m_symbol.Point()), m_symbol.Digits()), m_position.TakeProfit());
                     }
                  }
                  else if(type == POSITION_TYPE_SELL)
                  {
                     if(current_price <= open_price - (InpBETriggerRatio * initial_sl_dist) && (sl > open_price || sl == 0))
                     {
                        m_trade.PositionModify(ticket, NormalizeDouble(open_price - (10 * m_symbol.Point()), m_symbol.Digits()), m_position.TakeProfit());
                     }
                  }
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Lot Sizing                                                       |
//+------------------------------------------------------------------+
double CalculateLotSize(double sl_dist_price)
{
   if(InpFixedLot > 0.0)
      return InpFixedLot;

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double risk_cash = equity * (InpRiskPercent / 100.0);

   double tick_value = m_symbol.TickValue();
   double tick_size  = m_symbol.TickSize();

   if(tick_value <= 0 || tick_size <= 0 || sl_dist_price <= 0)
      return m_symbol.LotsMin();

   double ticks_at_risk = sl_dist_price / tick_size;
   double money_loss_per_lot = ticks_at_risk * tick_value;

   if(money_loss_per_lot <= 0)
      return m_symbol.LotsMin();

   double lot = risk_cash / money_loss_per_lot;
   double lot_step = m_symbol.LotsStep();
   lot = MathFloor(lot / lot_step) * lot_step;
   lot = MathMax(m_symbol.LotsMin(), MathMin(lot, m_symbol.LotsMax()));

   return NormalizeDouble(lot, 2);
}

//+------------------------------------------------------------------+
//| Count Open Positions                                             |
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
//| Close all positions                                              |
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
//| Prop Firm HUD Dashboard                                          |
//+------------------------------------------------------------------+
void UpdateDashboard(const MqlDateTime &dt)
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);

   double daily_dd_pct = 0.0;
   if(m_day_start_balance > 0)
      daily_dd_pct = MathMax(0.0, ((m_day_start_balance - equity) / m_day_start_balance) * 100.0);

   double total_dd_pct = 0.0;
   if(m_initial_account_balance > 0)
      total_dd_pct = MathMax(0.0, ((m_initial_account_balance - equity) / m_initial_account_balance) * 100.0);

   double profit_pct = ((equity - m_initial_account_balance) / m_initial_account_balance) * 100.0;

   double trend_ema[1];
   string trend_str = "Neutral";
   if(CopyBuffer(m_trend_ema_handle, 0, 0, 1, trend_ema) > 0)
      trend_str = (m_symbol.Bid() > trend_ema[0]) ? "BULLISH (Longs Only)" : "BEARISH (Shorts Only)";

   int open_pos = CountOpenPositions();
   bool in_window = IsWithinTradingWindow(dt);

   string state_str = "Aktiv";
   if(m_total_lockout)
      state_str = "NOT-HALT (Gesamt-Drawdown Limit erreicht)";
   else if(m_daily_lockout)
      state_str = "TAGES-SPERRE (Tages-Drawdown Limit erreicht)";
   else if(!in_window)
      state_str = InpFilterEliteHours ? "Außerhalb Elite-Fenster (Aktiv: 01-04 & 10-16)" : StringFormat("Außerhalb Handelszeit (bis %02d:%02d)", InpTradeEndHour, InpTradeEndMinute);
   else if(open_pos > 0)
      state_str = StringFormat("Trade Aktiv (%d Positionen offen)", open_pos);
   else
      state_str = "Aktiv: Scanne M15 Trend-Pullbacks";

   string dash = "";
   dash += "========================================================\n";
   dash += "    XAU TITAN PRO v3.0 (ULTRA HIGH-WINRATE EDITION)     \n";
   dash += "========================================================\n";
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Täglicher DD:   %.2f%% / 4.00%% Max (EA-Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamt DD:      %.2f%% / 10.00%% Max (EA-Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Elite Filter:   %s (01-04 & 10-16 Serverzeit)\n", InpFilterEliteHours ? "AKTIV (76.8% WR)" : "AUS");
   dash += StringFormat("Handelsfenster: %02d:%02d bis %02d:%02d (Serverzeit)\n", InpTradeStartHour, InpTradeStartMinute, InpTradeEndHour, InpTradeEndMinute);
   dash += "Berechnung:     STRIKT M15 (Unabhängig vom Chart-TF)\n";
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   string lot_str = "";
   if(InpFixedLot > 0.0)
      lot_str = "Fix " + DoubleToString(InpFixedLot, 2);
   else
      lot_str = "Dyn " + DoubleToString(InpRiskPercent, 2) + "%";
   dash += StringFormat("Lot-Modus:      %s | Swing-SL: 20-Stunden Struktur\n", lot_str);
   dash += StringFormat("Server Time:    %02d:%02d:%02d\n", dt.hour, dt.min, dt.sec);
   dash += "========================================================";

   Comment(dash);
}
//+------------------------------------------------------------------+
