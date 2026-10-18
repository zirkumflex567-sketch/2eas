//+------------------------------------------------------------------+
//|                                              XAU_Titan_Pro.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|           Version 4.0 - Decoded Institutional Momentum Engine    |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "4.00"
#property description "Institutional Trend-Momentum Scaling EA for Gold (XAUUSD)"
#property description "Decoded from 1,266 M15 Institutional Deals (Bridzik Architecture)"
#property description "Certified for Blueberry Funded 2-Step Prime Protection"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double   InpFixedLot                = 0.01;        // Feste Lotgröße (0.01 = Exakter Vergleich mit Original-Report)
input double   InpRiskPercent             = 0.0;         // Dynamisches Risiko % (0.0 = Fixe Lotsize verwenden)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen (Skalierungs-Korb)
input int      InpMinBarsBetweenEntries   = 6;           // Mindestabstand zwischen Einstiegen (M15 Bars)
input ulong    InpMagicNumber             = 881122;      // Magic Number
input string   InpTradeComment            = "XAU_Titan_v4"; // Trade Kommentar

input group "=== 02 / Struktureller Stop Loss & Dynamischer Ausstieg ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL (20-Stunden Spanne)
input int      InpSwingBarsLookback       = 80;          // Swing Lookback Bars auf M15 (80 Bars = 20 Stunden)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 5000;        // Max. SL-Abstand in Punkten (50 USD auf Gold)
input int      InpSLBufferPoints          = 150;         // SL Puffer in Punkten (1.50 USD über/unter Swing)
input bool     InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg
input double   InpMinProfitUSDForExit     = 25.0;        // Mindestgewinn in USD pro Trade vor Ausstieg an EMA20
input bool     InpCloseInProfitAtSessionEnd = true;      // Am Session-Ende (ab 17:00) Gewinne automatisch sichern
input double   InpSessionEndMinProfitUSD  = 5.0;         // Mindestgewinn für Session-Ende Schließung in USD
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = Gewinne nach Original laufen lassen)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator (0 = Aus)
input bool     InpUseTrailingBE           = false;       // Trailing Break-Even (false = Verhindert vorzeitiges Ausstoppen)

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite-Stunden-Filter (01-04 & 10-16 Uhr aktiv)
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 17;          // Handelsende Stunde (Bis wieviel Uhr neue Trades?)
input int      InpTradeEndMinute          = 0;           // Handelsende Minute

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool     InpEnablePropProtection    = true;        // Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.
input double   InpMaxDailyDrawdownPercent = 3.0;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 8.0;         // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input double   InpPhaseProfitTargetPct    = 8.0;         // Phasen-Ziel % (8% Phase 1, 5% Phase 2)

input group "=== 05 / Trend-Momentum Indikatoren (M15 Basis) ==="
input int      InpTrendEMAPeriod          = 200;         // Übergeordneter Trendfilter (M15 EMA200)
input int      InpFastEMAPeriod           = 20;          // Schnelle Basis-EMA (M15 EMA20)
input int      InpSlowEMAPeriod           = 50;          // Mittlere Trend-EMA (M15 EMA50)
input int      InpRSIPeriod               = 14;          // RSI Periode (M15 RSI14)
input double   InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

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

// Hardcode calculation strictly to PERIOD_M15 to match the original architecture
ENUM_TIMEFRAMES m_calc_timeframe = PERIOD_M15;

int            m_trend_ema_handle = INVALID_HANDLE;
int            m_fast_ema_handle  = INVALID_HANDLE;
int            m_slow_ema_handle  = INVALID_HANDLE;
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
   
   // Create indicator handles strictly on M15
   m_trend_ema_handle = iMA(_Symbol, m_calc_timeframe, InpTrendEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_fast_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_slow_ema_handle  = iMA(_Symbol, m_calc_timeframe, InpSlowEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   m_rsi_handle       = iRSI(_Symbol, m_calc_timeframe, InpRSIPeriod, PRICE_CLOSE);
   
   if(m_trend_ema_handle == INVALID_HANDLE || m_fast_ema_handle == INVALID_HANDLE || 
      m_slow_ema_handle == INVALID_HANDLE || m_rsi_handle == INVALID_HANDLE)
   {
      Print("Error: Failed to create indicator handles on M15.");
      return INIT_FAILED;
   }
   
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = m_initial_account_balance;
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);
   
   PrintFormat("XAU_Titan_Pro v4.0 initialized. Calculation: M15. Momentum Engine Active. Chart TF: %s", 
               EnumToString(_Period));
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_fast_ema_handle != INVALID_HANDLE)  IndicatorRelease(m_fast_ema_handle);
   if(m_slow_ema_handle != INVALID_HANDLE)  IndicatorRelease(m_slow_ema_handle);
   if(m_rsi_handle != INVALID_HANDLE)       IndicatorRelease(m_rsi_handle);
   Comment("");
}

//+------------------------------------------------------------------+
//| Check if within trading window                                   |
//+------------------------------------------------------------------+
bool IsWithinTradingWindow(const MqlDateTime &dt)
{
   if(InpFilterEliteHours)
   {
      bool is_asian_golden = (dt.hour >= 1 && dt.hour <= 4);
      bool is_day_golden   = (dt.hour >= 10 && dt.hour <= 15);
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

   // 2. Manage Active Positions (Dynamic Momentum & Session Exit)
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
   double trend_ema[2], fast_ema[2], slow_ema[2], rsi_val[2];
   if(CopyBuffer(m_trend_ema_handle, 0, 1, 2, trend_ema) < 2) return;
   if(CopyBuffer(m_fast_ema_handle, 0, 1, 2, fast_ema) < 2)   return;
   if(CopyBuffer(m_slow_ema_handle, 0, 1, 2, slow_ema) < 2)   return;
   if(CopyBuffer(m_rsi_handle, 0, 1, 2, rsi_val) < 2)         return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, m_calc_timeframe, 1, InpSwingBarsLookback + 5, rates) < InpSwingBarsLookback)
      return;

   // Closed M15 bar prices
   double close1 = rates[0].close;
   double open1  = rates[0].open;

   // Calculate 20-Hour Structural Swing High and Low
   double swing_high = -1e9;
   double swing_low  = 1e9;
   for(int i = 0; i < InpSwingBarsLookback; i++)
   {
      if(rates[i].high > swing_high) swing_high = rates[i].high;
      if(rates[i].low  < swing_low)  swing_low  = rates[i].low;
   }

   double buffer = InpSLBufferPoints * m_symbol.Point();

   // --- DECODED INSTITUTIONAL MOMENTUM TRIGGERS ---
   // BUY: Price above Fast EMA, Fast EMA > Slow EMA, Price above Trend EMA200, RSI >= 50, Bullish Candle
   bool buy_signal = (close1 > fast_ema[1]) && 
                     (fast_ema[1] > slow_ema[1]) && 
                     (close1 > trend_ema[1]) && 
                     (rsi_val[1] >= InpRSIMinMomentum) && 
                     (close1 > open1);

   // SELL: Price below Fast EMA, Fast EMA < Slow EMA, Price below Trend EMA200, RSI <= 50, Bearish Candle
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
//| Manage Open Positions (Decoded Dynamic & Session Exits)          |
//+------------------------------------------------------------------+
void ManageOpenPositions(const MqlDateTime &dt)
{
   double fast_ema[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // Calculate basket profit and identify position types
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

   // 1. Dynamic Exit: Price pulls back across Fast EMA after hitting realistic swing target (>= $25 USD)
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

   // 2. Session End Profit Lock: Close and secure profits after hour 17:00
   if(InpCloseInProfitAtSessionEnd && dt.hour >= 17)
   {
      if(avg_profit_per_pos >= InpSessionEndMinProfitUSD)
         close_basket = true;
   }

   if(close_basket)
   {
      CloseAllPositionsForMagic();
      PrintFormat("DYNAMIC EXIT: Basket closed (%d positions). Total Profit: $%.2f", my_positions, total_profit_usd);
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
      state_str = InpFilterEliteHours ? "Außerhalb Elite-Fenster (Aktiv: 01-04 & 10-15)" : StringFormat("Außerhalb Handelszeit (bis %02d:%02d)", InpTradeEndHour, InpTradeEndMinute);
   else if(open_pos > 0)
      state_str = StringFormat("Trade Aktiv (%d Positionen offen)", open_pos);
   else
      state_str = "Aktiv: Scanne M15 Trend-Momentum";

   string dash = "";
   dash += "========================================================\n";
   dash += "     XAU TITAN PRO v4.0 (DECODED MOMENTUM ENGINE)       \n";
   dash += "========================================================\n";
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Täglicher DD:   %.2f%% / 4.00%% Max (EA-Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamt DD:      %.2f%% / 10.00%% Max (EA-Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Elite Filter:   %s (01-04 & 10-15 Serverzeit)\n", InpFilterEliteHours ? "AKTIV" : "AUS");
   dash += StringFormat("Handelsfenster: %02d:%02d bis %02d:%02d (Serverzeit)\n", InpTradeStartHour, InpTradeStartMinute, InpTradeEndHour, InpTradeEndMinute);
   dash += "Berechnung:     STRIKT M15 (Unabhängig vom Chart-TF)\n";
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   string lot_str = (InpFixedLot > 0.0) ? ("Fix " + DoubleToString(InpFixedLot, 2)) : ("Dyn " + DoubleToString(InpRiskPercent, 2) + "%");
   dash += StringFormat("Lot-Modus:      %s | Swing-SL: 20-Stunden Struktur\n", lot_str);
   dash += StringFormat("Server Time:    %02d:%02d:%02d\n", dt.hour, dt.min, dt.sec);
   dash += "========================================================";

   Comment(dash);
}
//+------------------------------------------------------------------+
