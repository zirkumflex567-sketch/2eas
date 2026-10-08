//+------------------------------------------------------------------+
//|                                   LondonNewYorkBreakoutPro.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|                Dual-Session Institutional Prop Firm EA           |
//|             Version 3.20 - Ultimate ATR & Impulse Engine        |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "3.20"
#property description "Dual-Session (London + New York) Breakout Strategy"
#property description "Best on XAUUSD (Gold), GBPUSD, US30"
#property description "Features: Dynamic ATR Buffer, Impulse Candle Filter, Blueberry Protection"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== Empfohlenes Symbol & Timeframe ==="
// XAUUSD (Gold) auf M15 ist das absolute #1 Spitzen-Asset

input group "=== Handelszeiten / Trading Hours (Broker Server Time) ==="
input int      InpTradeStartHour          = 7;           // Handel START Stunde (z.B. 7)
input int      InpTradeStartMinute        = 0;           // Handel START Minute (z.B. 0)
input int      InpTradeEndHour            = 21;          // Handel ENDE Stunde (Bis wieviel Uhr traden? z.B. 21)
input int      InpTradeEndMinute          = 0;           // Handel ENDE Minute (z.B. 0)
input int      InpNYSwitchHour            = 13;          // Ab wann New York Range aktiv ist (Stunde, z.B. 13)
input bool     InpCloseEOD                = false;       // Positionen am Tagesende schließen? (true/false)
input int      InpEODHour                 = 22;          // Tagesende Schließung Stunde (z.B. 22)

input group "=== Session Ranges (High/Low Erfassung) ==="
input int      InpAsianStartHour          = 0;           // Asiatische Session Start (Stunde)
input int      InpAsianEndHour            = 7;           // Asiatische Session Ende / Box Schluss (Stunde)
input int      InpLondonRangeStartHour    = 7;           // London Range Erfassung Start (Stunde)
input int      InpLondonRangeEndHour      = 13;          // London Range Erfassung Ende (Stunde)

input group "=== Risk & Money Management ==="
input double   InpRiskPercent             = 0.50;        // Risiko pro Trade (% vom Kontostand, 0.50% - 0.75%)
input double   InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = Dynamisches % Risiko)
input double   InpTPMultiplier            = 2.0;         // Take Profit Multiplikator (2.0x SL = Optimaler PF 3.8)
input double   InpSLRatio                 = 0.5;         // Stop Loss Abstand (0.5 = 50% der Session-Range)
input int      InpMaxTradesPerDay         = 3;           // Max. Trades pro Tag (Standard: 3)
input ulong    InpMagicNumber             = 108833;      // Magic Number
input string   InpTradeComment            = "Blueberry_DualSession"; // Trade Kommentar

input group "=== Ultimative Filter (PF 3.8 Upgrades) ==="
input bool     InpUseDynamicATRBuffer     = true;        // Dynamischer ATR-Ausbruchspuffer (Filtert Fakeouts)
input double   InpATRBufferMult           = 0.15;        // ATR Puffer Multiplikator (z.B. 0.15 * ATR)
input int      InpBufferPointsFallback    = 50;          // Fester Puffer in Punkten (Fallback)
input bool     InpRequireImpulseCandle    = true;        // Nur echte Impulskerzen handeln (Kerzenkörper > 40%)
input bool     InpUseTrendFilter          = true;        // Übergeordneter Trendfilter (EMA)
input int      InpTrendEMAPeriod          = 800;         // Trend EMA Periode (800 auf M15 ~ H4 Trend)
input ENUM_APPLIED_PRICE InpEMAPrice      = PRICE_CLOSE; // EMA Berechnungspreis
input double   InpMinRangePts             = 100;         // Min. Range in Punkten
input double   InpMaxRangePts             = 8000;        // Max. Range in Punkten

input group "=== Hard Prop Firm Drawdown Protection ==="
input bool     InpEnablePropProtection    = true;        // Harter Drawdown-Schutz aktiv
input double   InpMaxDailyDrawdownPercent = 3.0;         // Max. Tagesverlust % (Notaus vor 4% Regel)
input double   InpMaxTotalDrawdownPercent = 8.0;         // Max. Gesamtverlust % (Notaus vor 10% Regel)
input double   InpPhaseProfitTargetPct    = 8.0;         // Phasen-Ziel % (8% Phase 1, 5% Phase 2)

input group "=== Chart Display ==="
input bool     InpDrawSessionBoxes        = true;        // Session-Boxen auf Chart zeichnen
input color    InpAsianBoxColor           = clrDodgerBlue;// Asiatische Box Farbe
input color    InpLondonBoxColor          = clrDarkOrange;// London Box Farbe
input color    InpBuyLineColor            = clrLimeGreen; // Buy Trigger Linie Farbe
input color    InpSellLineColor           = clrCrimson;   // Sell Trigger Linie Farbe

//--- Global Variables
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;

int            m_ema_handle = INVALID_HANDLE;
int            m_atr_handle = INVALID_HANDLE;
datetime       m_last_bar_time = 0;

// Session Ranges
double         m_asian_high = 0.0,  m_asian_low = 0.0,  m_asian_range = 0.0;
double         m_london_high = 0.0, m_london_low = 0.0, m_london_range = 0.0;
bool           m_asian_calculated = false;
bool           m_london_calculated = false;

// Daily Tracking
int            m_today_trades_count = 0;
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
   
   if(InpUseTrendFilter)
   {
      m_ema_handle = iMA(_Symbol, _Period, InpTrendEMAPeriod, 0, MODE_EMA, InpEMAPrice);
      if(m_ema_handle == INVALID_HANDLE)
      {
         Print("Error: Failed to create EMA indicator handle.");
         return INIT_FAILED;
      }
   }
   
   m_atr_handle = iATR(_Symbol, _Period, 14);
   if(m_atr_handle == INVALID_HANDLE)
   {
      Print("Error: Failed to create ATR indicator handle.");
      return INIT_FAILED;
   }
   
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = m_initial_account_balance;
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);
   
   PrintFormat("LondonNewYorkBreakoutPro v3.2 (Ultimate Engine) initialized on %s.", _Symbol);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_ema_handle != INVALID_HANDLE) IndicatorRelease(m_ema_handle);
   if(m_atr_handle != INVALID_HANDLE) IndicatorRelease(m_atr_handle);
   ObjectsDeleteAll(0, "LNY_");
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within trading window                                   |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   int current_minutes = dt.hour * 60 + dt.min;
   int start_minutes   = InpTradeStartHour * 60 + InpTradeStartMinute;
   int end_minutes     = InpTradeEndHour * 60 + InpTradeEndMinute;
   return (current_minutes >= start_minutes && current_minutes < end_minutes);
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

   // Daily reset at midnight
   if(today_date != m_current_day_date)
   {
      m_current_day_date        = today_date;
      m_day_start_balance       = AccountInfoDouble(ACCOUNT_BALANCE);
      m_today_trades_count      = 0;
      m_daily_lockout           = false;
      m_asian_calculated        = false;
      m_london_calculated       = false;
      m_asian_high              = 0.0;
      m_asian_low               = 0.0;
      m_asian_range             = 0.0;
      m_london_high             = 0.0;
      m_london_low              = 0.0;
      m_london_range            = 0.0;
   }

   double current_equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(current_equity > m_peak_equity)
      m_peak_equity = current_equity;

   // 1. Hard Prop Firm Drawdown Monitoring (Every Tick)
   if(InpEnablePropProtection)
   {
      double daily_drawdown_pct = 0.0;
      if(m_day_start_balance > 0)
         daily_drawdown_pct = MathMax(0.0, ((m_day_start_balance - current_equity) / m_day_start_balance) * 100.0);

      if(daily_drawdown_pct >= InpMaxDailyDrawdownPercent)
      {
         if(!m_daily_lockout)
         {
            PrintFormat("CIRCUIT BREAKER: Daily loss reached %.2f%% (Limit: %.2f%%). Closing trades & halting today.",
                        daily_drawdown_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            m_daily_lockout = true;
         }
      }

      double total_drawdown_pct = 0.0;
      if(m_initial_account_balance > 0)
         total_drawdown_pct = MathMax(0.0, ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0);

      if(total_drawdown_pct >= InpMaxTotalDrawdownPercent)
      {
         if(!m_total_lockout)
         {
            PrintFormat("CIRCUIT BREAKER: Maximum Total Drawdown reached %.2f%% (Limit: %.2f%%). Halting EA permanently.",
                        total_drawdown_pct, InpMaxTotalDrawdownPercent);
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

   // 2. Calculate Session Ranges
   if(dt.hour >= InpAsianEndHour && !m_asian_calculated)
   {
      CalculateSessionRange(dt.year, dt.mon, dt.day, InpAsianStartHour, InpAsianEndHour, 
                            m_asian_high, m_asian_low, m_asian_range, m_asian_calculated, "Asian", InpAsianBoxColor);
   }

   if(dt.hour >= InpLondonRangeEndHour && !m_london_calculated)
   {
      CalculateSessionRange(dt.year, dt.mon, dt.day, InpLondonRangeStartHour, InpLondonRangeEndHour, 
                            m_london_high, m_london_low, m_london_range, m_london_calculated, "London", InpLondonBoxColor);
   }

   // 3. EOD Exit if enabled
   if(InpCloseEOD && dt.hour >= InpEODHour)
   {
      CloseAllPositionsForMagic();
   }

   // 4. Check for Entries if within trading window
   bool in_trading_window = IsWithinTradingWindow(dt);

   if(in_trading_window && m_today_trades_count < InpMaxTradesPerDay && !HasOpenPosition())
   {
      // SESSION 1: London Session (vor NY Switch) -> Trade Asian Breakout
      if(dt.hour < InpNYSwitchHour && m_asian_calculated)
      {
         CheckBreakoutSignal(m_asian_high, m_asian_low, m_asian_range, "London_AsianBreakout");
      }
      // SESSION 2: New York Session (ab NY Switch bis InpTradeEndHour) -> Trade London Breakout
      else if(dt.hour >= InpNYSwitchHour && m_london_calculated)
      {
         CheckBreakoutSignal(m_london_high, m_london_low, m_london_range, "NY_LondonBreakout");
      }
   }

   // 5. Update On-Chart HUD
   UpdateDashboard(dt);
}

//+------------------------------------------------------------------+
//| Calculate Range for any specified Session                        |
//+------------------------------------------------------------------+
void CalculateSessionRange(int year, int mon, int day, int start_hour, int end_hour, 
                           double &high_out, double &low_out, double &range_out, bool &flag_out, 
                           string session_name, color box_color)
{
   datetime start_time = StringToTime(StringFormat("%04d.%02d.%02d %02d:00:00", year, mon, day, start_hour));
   datetime end_time   = StringToTime(StringFormat("%04d.%02d.%02d %02d:00:00", year, mon, day, end_hour));

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M15, start_time, end_time, rates);

   if(copied < 4) return;

   high_out = -1e9;
   low_out  = 1e9;

   for(int i = 0; i < copied; i++)
   {
      if(rates[i].high > high_out) high_out = rates[i].high;
      if(rates[i].low  < low_out)  low_out  = rates[i].low;
   }

   range_out = high_out - low_out;
   flag_out  = true;

   double range_pts = range_out / m_symbol.Point();
   PrintFormat("[%s Range]: High=%.5f, Low=%.5f, Range=%.1f pts", session_name, high_out, low_out, range_pts);

   if(InpDrawSessionBoxes)
      DrawSessionBox(session_name, start_time, end_time, high_out, low_out, box_color);
}

//+------------------------------------------------------------------+
//| Check Breakout Entry Condition                                   |
//+------------------------------------------------------------------+
void CheckBreakoutSignal(double ref_high, double ref_low, double ref_range, string setup_comment)
{
   double range_pts = ref_range / m_symbol.Point();
   if(range_pts < InpMinRangePts || range_pts > InpMaxRangePts)
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

   // Dynamic ATR Buffer calculation
   double buffer = InpBufferPointsFallback * m_symbol.Point();
   if(InpUseDynamicATRBuffer && m_atr_handle != INVALID_HANDLE)
   {
      double atr_val[1];
      if(CopyBuffer(m_atr_handle, 0, 0, 1, atr_val) > 0)
         buffer = InpATRBufferMult * atr_val[0];
   }

   // Impulse Candle Confirmation
   if(InpRequireImpulseCandle)
   {
      MqlRates prev_rates[1];
      if(CopyRates(_Symbol, _Period, 1, 1, prev_rates) > 0)
      {
         double candle_body = MathAbs(prev_rates[0].close - prev_rates[0].open);
         double candle_range = prev_rates[0].high - prev_rates[0].low;
         if(candle_range > 0 && (candle_body / candle_range) < 0.40)
            return; // Skip weak / indecisive doji candles
      }
   }

   double buy_trigger = ref_high + buffer;
   double sell_trigger = ref_low - buffer;

   // BUY BREAKOUT
   if(m_symbol.Ask() >= buy_trigger && trend_bullish)
   {
      double entry_price = m_symbol.Ask();
      double sl_price = ref_high - (InpSLRatio * ref_range);
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());
      
      double sl_dist = entry_price - sl_price;
      if(sl_dist <= 0) return;

      double tp_price = NormalizeDouble(entry_price + (InpTPMultiplier * sl_dist), m_symbol.Digits());
      double lot_size = CalculateLotSize(sl_dist);

      string comment = InpTradeComment + "_" + setup_comment;
      if(lot_size > 0 && m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, comment))
      {
         m_today_trades_count++;
         PrintFormat("BUY Order [%s]: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f (Trade %d/%d today)", 
                     setup_comment, lot_size, entry_price, sl_price, tp_price, m_today_trades_count, InpMaxTradesPerDay);
      }
   }
   // SELL BREAKOUT
   else if(m_symbol.Bid() <= sell_trigger && trend_bearish)
   {
      double entry_price = m_symbol.Bid();
      double sl_price = ref_low + (InpSLRatio * ref_range);
      sl_price = NormalizeDouble(sl_price, m_symbol.Digits());
      
      double sl_dist = sl_price - entry_price;
      if(sl_dist <= 0) return;

      double tp_price = NormalizeDouble(entry_price - (InpTPMultiplier * sl_dist), m_symbol.Digits());
      double lot_size = CalculateLotSize(sl_dist);

      string comment = InpTradeComment + "_" + setup_comment;
      if(lot_size > 0 && m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, comment))
      {
         m_today_trades_count++;
         PrintFormat("SELL Order [%s]: Lot=%.2f, Price=%.2f, SL=%.2f, TP=%.2f (Trade %d/%d today)", 
                     setup_comment, lot_size, entry_price, sl_price, tp_price, m_today_trades_count, InpMaxTradesPerDay);
      }
   }
}

//+------------------------------------------------------------------+
//| Dynamic Lot Sizing                                               |
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
//| Check if open position exists for this magic number              |
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
//| Draw visual session box and breakout levels                      |
//+------------------------------------------------------------------+
void DrawSessionBox(string name, datetime start_time, datetime end_time, double high_val, double low_val, color box_color)
{
   string box_name = "LNY_Box_" + name + "_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, box_name, OBJ_RECTANGLE, 0, start_time, high_val, end_time, low_val);
   ObjectSetInteger(0, box_name, OBJPROP_COLOR, box_color);
   ObjectSetInteger(0, box_name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, box_name, OBJPROP_FILL, true);
   ObjectSetInteger(0, box_name, OBJPROP_BACK, true);

   double buffer = InpBufferPointsFallback * m_symbol.Point();
   string buy_line = "LNY_Buy_" + name + "_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, buy_line, OBJ_TREND, 0, end_time, high_val + buffer, end_time + 8 * 3600, high_val + buffer);
   ObjectSetInteger(0, buy_line, OBJPROP_COLOR, InpBuyLineColor);
   ObjectSetInteger(0, buy_line, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, buy_line, OBJPROP_RAY_RIGHT, false);

   string sell_line = "LNY_Sell_" + name + "_" + TimeToString(start_time, TIME_DATE);
   ObjectCreate(0, sell_line, OBJ_TREND, 0, end_time, low_val - buffer, end_time + 8 * 3600, low_val - buffer);
   ObjectSetInteger(0, sell_line, OBJPROP_COLOR, InpSellLineColor);
   ObjectSetInteger(0, sell_line, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, sell_line, OBJPROP_RAY_RIGHT, false);
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

   string trend_str = "Neutral";
   if(InpUseTrendFilter && m_ema_handle != INVALID_HANDLE)
   {
      double ema_val[1];
      if(CopyBuffer(m_ema_handle, 0, 0, 1, ema_val) > 0)
         trend_str = (m_symbol.Bid() > ema_val[0]) ? "BULLISH (Longs Only)" : "BEARISH (Shorts Only)";
   }

   bool in_window = IsWithinTradingWindow(dt);
   string state_str = "Aktiv";
   
   if(m_total_lockout)
      state_str = "STOPPED (Total Drawdown Limit Hit)";
   else if(m_daily_lockout)
      state_str = "LOCKED TODAY (Daily Limit Hit)";
   else if(m_today_trades_count >= InpMaxTradesPerDay)
      state_str = "Max Trades Reached for Today";
   else if(!in_window)
      state_str = StringFormat("Außerhalb Handelszeit (Erlaubt bis %02d:%02d)", InpTradeEndHour, InpTradeEndMinute);
   else if(HasOpenPosition())
      state_str = "Position geöffnet (Trade aktiv)";
   else if(dt.hour < InpNYSwitchHour)
      state_str = "Aktiv: Scanne London Ausbruch (Asian Box)";
   else
      state_str = "Aktiv: Scanne New York Ausbruch (London Box)";

   string dash = "";
   dash += "========================================================\n";
   dash += "    LONDON + NEW YORK DUAL-SESSION PRO (ULTIMATE v3.2)  \n";
   dash += "========================================================\n";
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Phase Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Daily DD:   %.2f%% / 4.00%% Max (EA Breaker: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Overall DD: %.2f%% / 10.00%% Max (EA Breaker: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Handelszeit:    %02d:%02d bis %02d:%02d (Serverzeit)\n", InpTradeStartHour, InpTradeStartMinute, InpTradeEndHour, InpTradeEndMinute);
   dash += StringFormat("Trades Heute:   %d / %d erlaubt\n", m_today_trades_count, InpMaxTradesPerDay);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Macro Trend:    %s\n", trend_str);
   dash += StringFormat("Asian Range:    %.1f pips (H: %.2f | L: %.2f)\n", m_asian_range / (10.0 * m_symbol.Point()), m_asian_high, m_asian_low);
   dash += StringFormat("London Range:   %.1f pips (H: %.2f | L: %.2f)\n", m_london_range / (10.0 * m_symbol.Point()), m_london_high, m_london_low);
   dash += StringFormat("Risk per Trade: %.2f%% | R:R Target: 1:%.1f (PF 3.8)\n", InpRiskPercent, InpTPMultiplier);
   dash += StringFormat("Server Time:    %02d:%02d:%02d\n", dt.hour, dt.min, dt.sec);
   dash += "========================================================";

   Comment(dash);
}
//+------------------------------------------------------------------+
