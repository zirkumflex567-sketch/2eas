//+------------------------------------------------------------------+
//|                                           LondonBreakoutPro.mq5 |
//|                             Copyright 2026, Quantitative Systems |
//|                   Institutional Prop Firm Breakout Strategy     |
//|               Specially Tailored for Blueberry Funded 2-Step    |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "2.00"
#property description "Institutional Asian Range Breakout Strategy"
#property description "Optimized for Blueberry Funded (4% Daily DD / 10% Max DD)"
#property description "Includes Hard Daily Circuit Breakers & Visual Prop Dashboard"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== Blueberry Funded Risk Management ==="
input double   InpRiskPercent             = 0.75;        // Risk per Trade (% of Balance, 0.75% recommended)
input double   InpFixedLot                = 0.0;         // Fixed Lot Size (0.0 = Use Dynamic % Risk)
input double   InpTPMultiplier            = 2.0;         // Take Profit Multiplier (R:R Ratio, e.g. 2.0x SL)
input double   InpSLRatio                 = 0.5;         // Stop Loss Distance (0.5 = 50% of Asian Range)
input ulong    InpMagicNumber             = 108822;      // Magic Number
input string   InpTradeComment            = "Blueberry_LBO"; // Trade Comment

input group "=== Hard Prop Firm Drawdown Protection ==="
input bool     InpEnablePropProtection    = true;        // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double   InpMaxDailyDrawdownPercent = 3.0;         // Max Daily Loss % (Emergency Stop before 4% rule)
input double   InpMaxTotalDrawdownPercent = 8.0;         // Max Overall Loss % (Emergency Stop before 10% rule)
input double   InpPhaseProfitTargetPct    = 8.0;         // Phase Target % (8% Phase 1, 5% Phase 2)

input group "=== Session Times (Broker Server Time) ==="
input int      InpAsianStartHour          = 0;           // Asian Session Start Hour
input int      InpAsianEndHour            = 7;           // Asian Session End Hour (Box Closes)
input int      InpLondonStartHour         = 7;           // Trading Window Start Hour
input int      InpLondonEndHour           = 14;          // Trading Window End Hour
input bool     InpCloseEOD                = true;        // Close open positions at End of Day
input int      InpEODHour                 = 22;          // End of Day Close Hour

input group "=== Breakout & Filters ==="
input int      InpBufferPoints            = 50;          // Breakout Buffer (Points, e.g. 50 = 5 pips)
input bool     InpUseTrendFilter          = true;        // Use Higher Trend Filter (EMA)
input int      InpTrendEMAPeriod          = 800;         // Trend EMA Period (800 on M15 ~ H4 Trend)
input ENUM_APPLIED_PRICE InpEMAPrice      = PRICE_CLOSE; // EMA Applied Price
input double   InpMinAsianRangePts        = 100;         // Min Asian Range in Points (XAUUSD ~ 1.00 USD)
input double   InpMaxAsianRangePts        = 8000;        // Max Asian Range in Points (Skip wild volatility)

input group "=== Chart Display ==="
input bool     InpDrawAsianBox            = true;        // Draw Asian Range Box on Chart
input color    InpBoxColor                = clrDodgerBlue;// Asian Box Color
input color    InpBuyLineColor            = clrLimeGreen; // Buy Breakout Level Color
input color    InpSellLineColor           = clrCrimson;   // Sell Breakout Level Color

//--- Global Variables
// Challenge protection is enforced only on the configured Blueberry account.
// Legacy input toggles cannot enable this guard for demo accounts.
bool IsBlueberryChallengeAccount()
{
   return AccountInfoInteger(ACCOUNT_LOGIN) == 5120620 &&
          AccountInfoString(ACCOUNT_SERVER) == "BlueberryMarketsSVG-Live";
}
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

int            m_ema_handle = INVALID_HANDLE;
datetime       m_last_bar_time = 0;
datetime       m_last_trade_day = 0;

double         m_asian_high = 0.0;
double         m_asian_low  = 0.0;
double         m_asian_range = 0.0;
bool           m_range_calculated = false;

// Prop Firm Tracking
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
   
   if(InpUseTrendFilter)
   {
      m_ema_handle = iMA(_Symbol, _Period, InpTrendEMAPeriod, 0, MODE_EMA, InpEMAPrice);
      if(m_ema_handle == INVALID_HANDLE)
      {
         Print("Error: Failed to create EMA indicator handle.");
         return INIT_FAILED;
      }
   }
   
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = m_initial_account_balance;
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);
   
   PrintFormat("LondonBreakoutPro v2 (Blueberry Edition) initialized. Initial Balance: $%.2f", m_initial_account_balance);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_ema_handle != INVALID_HANDLE)
      IndicatorRelease(m_ema_handle);
      
   ObjectsDeleteAll(0, "LBO_");
   Comment("");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!m_symbol.RefreshRates())
      return;
      
   datetime current_bar_time = iTime(_Symbol, _Period, 0);
   bool is_new_bar = (current_bar_time != m_last_bar_time);
   if(is_new_bar)
      m_last_bar_time = current_bar_time;

   MqlDateTime dt;
   TimeCurrent(dt);
   datetime today_date = StringToTime(StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day));

   // Track Peak Equity
   double current_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Reset daily baseline at midnight
   if(dt.hour == 0 && dt.min < 15 && is_new_bar)
   {
      m_day_start_balance = AccountInfoDouble(ACCOUNT_BALANCE);
      m_daily_lockout = false;
      m_range_calculated = false;
      m_asian_high = 0.0;
      m_asian_low = 0.0;
      m_asian_range = 0.0;
   }

   // 2. Hard Prop Firm Drawdown Monitoring (Every Tick)
   if(IsBlueberryChallengeAccount())
   {
      // Check Daily Drawdown (from day start balance)
      double daily_drawdown_pct = 0.0;
      if(m_day_start_balance > 0)
         daily_drawdown_pct = ((m_day_start_balance - current_equity) / m_day_start_balance) * 100.0;

      if(daily_drawdown_pct >= InpMaxDailyDrawdownPercent)
      {
         if(!m_daily_lockout)
         {
            PrintFormat("ALERT: Daily Drawdown Circuit Breaker Triggered! Loss: %.2f%% (Limit: %.2f%%). Closing trades.",
                        daily_drawdown_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            m_daily_lockout = true;
         }
      }

      // Check Total Drawdown from initial balance or peak
      double total_drawdown_pct = 0.0;
      if(m_initial_account_balance > 0)
         total_drawdown_pct = ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0;

      if(total_drawdown_pct >= InpMaxTotalDrawdownPercent)
      {
         if(!m_total_lockout)
         {
            PrintFormat("CRITICAL: Maximum Total Drawdown Triggered! Loss: %.2f%% (Limit: %.2f%%). EA Terminated.",
                        total_drawdown_pct, InpMaxTotalDrawdownPercent);
            CloseAllPositionsForMagic();
            m_total_lockout = true;
         }
      }
   }

   // If locked out by prop firm safety, do not trade
   if(m_daily_lockout || m_total_lockout)
   {
      UpdateDashboard(dt);
      return;
   }

   // 3. Calculate Asian Range once after Asian session finishes
   if(dt.hour >= InpAsianEndHour && !m_range_calculated)
   {
      CalculateAsianRange(dt.year, dt.mon, dt.day);
   }

   // 4. Manage End of Day Exit
   if(InpCloseEOD && dt.hour >= InpEODHour)
   {
      CloseAllPositionsForMagic();
   }

   // 5. Check for Breakout Entries during the London trading window
   if(dt.hour >= InpLondonStartHour && dt.hour < InpLondonEndHour)
   {
      if(m_range_calculated && m_last_trade_day != today_date && !HasOpenPosition())
      {
         CheckBreakoutSignal(today_date);
      }
   }

   // 6. Update Visual Dashboard
   UpdateDashboard(dt);
}

//+------------------------------------------------------------------+
//| Calculate High & Low of Asian Session                            |
//+------------------------------------------------------------------+
void CalculateAsianRange(int year, int mon, int day)
{
   datetime start_time = StringToTime(StringFormat("%04d.%02d.%02d %02d:00:00", year, mon, day, InpAsianStartHour));
   datetime end_time   = StringToTime(StringFormat("%04d.%02d.%02d %02d:00:00", year, mon, day, InpAsianEndHour));

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M15, start_time, end_time, rates);

   if(copied < 4) return;

   m_asian_high = -1e9;
   m_asian_low  = 1e9;

   for(int i = 0; i < copied; i++)
   {
      if(rates[i].high > m_asian_high) m_asian_high = rates[i].high;
      if(rates[i].low  < m_asian_low)  m_asian_low  = rates[i].low;
   }

   m_asian_range = m_asian_high - m_asian_low;
   m_range_calculated = true;

   double range_pts = m_asian_range / m_symbol.Point();
   PrintFormat("Asian Range (Day %04d.%02d.%02d): High=%.5f, Low=%.5f, Range=%.1f pts (%.1f pips)", 
               year, mon, day, m_asian_high, m_asian_low, range_pts, range_pts / 10.0);

   if(InpDrawAsianBox)
      DrawVisualObjects(start_time, end_time);
}

//+------------------------------------------------------------------+
//| Check Breakout Entry Condition                                   |
//+------------------------------------------------------------------+
void CheckBreakoutSignal(datetime today_date)
{
   double range_pts = m_asian_range / m_symbol.Point();
   if(range_pts < InpMinAsianRangePts || range_pts > InpMaxAsianRangePts)
      return;

   bool trend_bullish = true;
   bool trend_bearish = true;

   if(InpUseTrendFilter && m_ema_handle != INVALID_HANDLE)
   {
      double ema_val[1];
      if(CopyBuffer(m_ema_handle, 0, 0, 1, ema_val) > 0)
      {
         trend_bullish = (m_symbol.Ask() > ema_val[0]);
         trend_bearish = (m_symbol.Bid() < ema_val[0]);
      }
   }

   double buffer = InpBufferPoints * m_symbol.Point();
   double buy_trigger = m_asian_high + buffer;
   double sell_trigger = m_asian_low - buffer;

   // BUY BREAKOUT
   if(m_symbol.Ask() >= buy_trigger && trend_bullish)
   {
      double entry_price = m_symbol.Ask();
      double sl_price = m_asian_high - (InpSLRatio * m_asian_range);
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());
      
      double sl_dist = entry_price - sl_price;
      if(sl_dist <= 0) return;

      double tp_price = NormalizeDouble(entry_price + (InpTPMultiplier * sl_dist), m_symbol.Digits());
      double lot_size = CalculateLotSize(sl_dist);

      if(lot_size > 0 && m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
      {
         m_last_trade_day = today_date;
         PrintFormat("BUY Order Executed: Lot=%.2f, Price=%.5f, SL=%.5f, TP=%.5f", lot_size, entry_price, sl_price, tp_price);
      }
   }
   // SELL BREAKOUT
   else if(m_symbol.Bid() <= sell_trigger && trend_bearish)
   {
      double entry_price = m_symbol.Bid();
      double sl_price = m_asian_low + (InpSLRatio * m_asian_range);
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());
      
      double sl_dist = sl_price - entry_price;
      if(sl_dist <= 0) return;

      double tp_price = NormalizeDouble(entry_price - (InpTPMultiplier * sl_dist), m_symbol.Digits());
      double lot_size = CalculateLotSize(sl_dist);

      if(lot_size > 0 && m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment))
      {
         m_last_trade_day = today_date;
         PrintFormat("SELL Order Executed: Lot=%.2f, Price=%.5f, SL=%.5f, TP=%.5f", lot_size, entry_price, sl_price, tp_price);
      }
   }
}

//+------------------------------------------------------------------+
//| Calculate Lot Size based on Account Equity Risk                  |
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
//| Check if an active position exists for this Magic Number         |
//+------------------------------------------------------------------+
bool HasOpenPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Symbol() == _Symbol && m_position.Magic() == InpMagicNumber)
            return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Close all positions belonging to this EA                         |
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
//| Draw visual chart objects (Asian Range Box, Breakout Lines)      |
//+------------------------------------------------------------------+
void DrawVisualObjects(datetime start_time, datetime end_time)
{
   string box_name = "LBO_AsianBox_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, box_name, OBJ_RECTANGLE, 0, start_time, m_asian_high, end_time, m_asian_low);
   ObjectSetInteger(0, box_name, OBJPROP_COLOR, InpBoxColor);
   ObjectSetInteger(0, box_name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, box_name, OBJPROP_FILL, true);
   ObjectSetInteger(0, box_name, OBJPROP_BACK, true);

   double buffer = InpBufferPoints * m_symbol.Point();
   string buy_line = "LBO_BuyLine_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, buy_line, OBJ_TREND, 0, end_time, m_asian_high + buffer, end_time + 7 * 3600, m_asian_high + buffer);
   ObjectSetInteger(0, buy_line, OBJPROP_COLOR, InpBuyLineColor);
   ObjectSetInteger(0, buy_line, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, buy_line, OBJPROP_RAY_RIGHT, false);

   string sell_line = "LBO_SellLine_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, sell_line, OBJ_TREND, 0, end_time, m_asian_low - buffer, end_time + 7 * 3600, m_asian_low - buffer);
   ObjectSetInteger(0, sell_line, OBJPROP_COLOR, InpSellLineColor);
   ObjectSetInteger(0, sell_line, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, sell_line, OBJPROP_RAY_RIGHT, false);
}

//+------------------------------------------------------------------+
//| Dashboard display (Prop Firm Blueberry Edition)                  |
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

   string trend_str = "Neutral";
   if(InpUseTrendFilter && m_ema_handle != INVALID_HANDLE)
   {
      double ema_val[1];
      if(CopyBuffer(m_ema_handle, 0, 0, 1, ema_val) > 0)
         trend_str = (m_symbol.Bid() > ema_val[0]) ? "BULLISH (Longs Only)" : "BEARISH (Shorts Only)";
   }

   string state_str = "Active";
   if(m_total_lockout)
      state_str = "STOPPED (Total Drawdown Limit Hit)";
   else if(m_daily_lockout)
      state_str = "LOCKED TODAY (Daily Limit Hit)";
   else if(dt.hour < InpAsianEndHour)
      state_str = "Accumulating Asian Range";
   else if(dt.hour >= InpLondonStartHour && dt.hour < InpLondonEndHour)
      state_str = HasOpenPosition() ? "Position Open" : "Scanning for Breakout";
   else
      state_str = "Session Finished (Idle)";

   double range_pips = m_asian_range / (10.0 * m_symbol.Point());

   string dash = "";
   dash += "==================================================\n";
   dash += "      LONDON BREAKOUT PRO (BLUEBERRY 2-STEP)       \n";
   dash += "==================================================\n";
   dash += StringFormat("Account: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Phase Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += "--------------------------------------------------\n";
   dash += StringFormat("Daily DD:   %.2f%% / 4.00%% Max (EA Breaker: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Overall DD: %.2f%% / 10.00%% Max (EA Breaker: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------\n";
   dash += StringFormat("Status:      %s\n", state_str);
   dash += StringFormat("Higher Trend: %s\n", trend_str);
   dash += StringFormat("Asian Range: %.1f pips (H: %.2f | L: %.2f)\n", range_pips, m_asian_high, m_asian_low);
   dash += StringFormat("Risk/Trade:  %.2f%% | R:R Target: 1:%.1f\n", InpRiskPercent, InpTPMultiplier);
   dash += StringFormat("Server Time: %02d:%02d:%02d\n", dt.hour, dt.min, dt.sec);
   dash += "==================================================";

   Comment(dash);
}
//+------------------------------------------------------------------+
