//+------------------------------------------------------------------+
//|                                  XAU_Titan_Pro_BasketGuard.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|                 Version 7.20 - Basket risk and managed exits      |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "7.20"
#property description "Experimental Titan Pro with basket risk limits and managed exits"
#property description "Separate variant; validate in Strategy Tester before any live use"

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>
string CSParameterSetCanonical();
string CSParameterSetHash="";
bool IsBlueberryChallengeAccount();
#include "ChartStudioEvidenceSpool.mqh"

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double   InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = % Risiko; >0.0 = Fixe Lotgröße)
input double   InpRiskPercent             = 0.5;         // Dynamisches % Risiko (0.5% = Original guter5er Rekordlauf)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 Bars = 30 Min)
input ulong    InpMagicNumber             = 881142;      // Separate magic; does not manage old Titan positions
input string   InpTradeComment            = "Titan_BasketGuard_v720";

input group "=== 02 / Struktureller Swing-SL & High-Profit Runner-Ausstieg ==="
input bool     InpUseSwingSL              = true;        // Struktureller Swing-SL
input int      InpSwingBarsLookback       = 48;          // Swing Lookback Bars auf M15 (48 Bars = 12 Stunden)
input int      InpMinSLPoints             = 1500;        // Min. SL-Abstand in Punkten (15 USD auf Gold)
input int      InpMaxSLPoints             = 15000;       // Max. SL-Abstand in Punkten (150 USD - Lässt Swing SL atmen!)
input int      InpSLBufferPoints          = 250;         // SL Puffer in Punkten (2.50 USD über/unter Swing)
input bool     InpUseDynamicExit          = true;        // Dynamischer Trendfolge-Ausstieg an EMA9
input double   InpMinProfitUSDForExit     = 28.0;        // Mindestgewinn in USD pro Trade vor Ausstieg an EMA9
input bool     InpCloseInProfitAtSessionEnd = false;     // Session-Ende Schließung (false = Lässt Runner über Nacht laufen wie Original)
input double   InpSessionEndMinProfitUSD  = 5.0;         // Mindestgewinn für Session-Ende Schließung in USD
input bool     InpUseTakeProfit           = false;       // Fester Take Profit (false = Maximale Trendfolge-Runner)
input double   InpTPRatio                 = 0.0;         // TP-Multiplikator (0.0 = Unlimitierter Runner Modus)
input bool     InpUseBreakEven            = false;       // Vorzeitiger Break-Even (false = Choket Gold nicht)
input double   InpBETriggerUSD            = 40.0;        // BE Trigger in USD
input double   InpBELockUSD               = 15.0;        // Gesicherter Gewinn in USD bei Break-Even

input group "=== 02b / Basket Guard (alle Werte in Kontowaehrung) ==="
input bool     InpUseBasketRiskGate       = true;        // Gesamtverlust aller SLs vor jedem Einstieg begrenzen
input double   InpBasketMaxRiskUSD        = 120.0;       // Max. prognostizierter Korbverlust an den SLs
input double   InpBasketRiskReserveUSD    = 5.0;         // Puffer pro Position fuer Kosten/Slippage
input bool     InpUseBasketLossExit       = true;        // Letzter Notaus bei schwebendem Korbverlust
input double   InpBasketMaxLossUSD        = 120.0;       // Korb schliessen ab diesem Verlust
input bool     InpUseTrendInvalidationExit = true;       // M15-Trendbruch nach abgeschlossenen Kerzen
input int      InpTrendBreakConfirmBars   = 1;          // 1..3 abgeschlossene M15-Kerzen
input double   InpTrendBreakATRBuffer     = 0.25;       // Abstand hinter EMA21 in ATR
input bool     InpUsePyramidProfitLock    = true;        // SL einzelner Gewinner fuer Nachkaeufe sichern
input double   InpPyramidLockTriggerUSD   = 45.0;       // Gewinnschwelle pro Position
input double   InpPyramidLockProfitUSD    = 5.0;        // Mindestgewinn am neuen SL
input bool     InpUseBasketProfitTrail    = true;        // Korbgewinn nach deutlichem Vorsprung sichern
input double   InpBasketTrailStartUSD     = 100.0;      // Trail erst ab diesem Korbgewinn
input double   InpBasketTrailGivebackUSD  = 65.0;       // Erlaubter Rueckgang vom Korb-Hoechstgewinn
input int      InpGuardCooldownBars       = 2;          // M15-Bars Pause nach Guard-Ausstieg

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00) (Original: hochprofitabel!)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute
input bool     InpCloseWeekendFriday      = true;        // Freitagabend vor Marktschluss schliessen
input int      InpFridayCloseHour         = 22;
input int      InpFridayCloseMinute       = 0;
input bool     InpBlockFridayLateEntries  = true;        // Keine neuen Freitagstrades nach Stopstunde
input int      InpFridayStopEntryHour     = 19;

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool     InpEnablePropProtection    = false;       // Legacy-setfile-Feld; der Challenge-Schutz ist hart an Blueberry gebunden
input double   InpMaxDailyDrawdownPercent = 3.5;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 9.0;         // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input bool     InpTotalDDBasedOnInitial   = true;        // Max Drawdown Basis (true = Statisch vom Startkapital wie Blueberry; false = Trailing)
input bool     InpDailyLockoutUntilMidnight = true;      // Nach Tagesverlust (true = Pause bis Mitternacht; false = Sofort weiter traden)
input double   InpPhaseProfitTargetPct    = 0.0;         // Phasen-Ziel % (0.0 = Deaktiviert / Fortlaufend traden)

input group "=== 05 / Trend-Momentum Indikatoren (M15 Basis) ==="
input int      InpTrendEMAPeriod          = 50;          // Übergeordneter Trendfilter (M15 EMA50)
input int      InpFastEMAPeriod           = 9;           // Schnelle Basis-EMA (M15 EMA9)
input int      InpSlowEMAPeriod           = 21;          // Mittlere Trend-EMA (M15 EMA21)
input int      InpRSIPeriod               = 14;          // RSI Periode (M15 RSI14)
input double   InpRSIMinMomentum          = 50.0;        // RSI Momentum Schwelle (>= 50 für Buy, <= 50 für Sell)

input group "=== 06 / Anti-Trap & Überdehnungs-Filter ==="
input bool     InpUseOverextensionFilter  = true;        // Überdehnungs-Schutz (ATR-Distanz zur EMA21)
input double   InpMaxATRExtension         = 1.8;         // Max. Distanz zu EMA21 in ATR (z.B. 1.8x ATR; verhindert Gipfelkauf)
input bool     InpUseConsecutiveRunFilter = true;        // Kerzen-Erschöpfungsfilter (Climax Run)
input int      InpMaxConsecutiveBars      = 3;           // Max. gleichfarbige Kerzen am Stück vor Einstieg
input bool     InpUseSRDistanceFilter     = true;        // S/R-Widerstandsfilter (Kein Kauf direkt in Supply-Zone)
input int      InpMinSRRoomPoints         = 300;         // Min. Freiraum zum Swing-Widerstand (300 Pkt = 3.00 USD)
input int      InpATRPeriod               = 14;          // ATR Periode für Volatilitätsmessung

string CSParameterSetCanonical()
  {
   string result="";
   result+="InpFixedLot="+DoubleToString(InpFixedLot,16)+"\n";
   result+="InpRiskPercent="+DoubleToString(InpRiskPercent,16)+"\n";
   result+="InpMaxOpenPositions="+IntegerToString(InpMaxOpenPositions)+"\n";
   result+="InpMinBarsBetweenEntries="+IntegerToString(InpMinBarsBetweenEntries)+"\n";
   result+="InpMagicNumber="+IntegerToString((long)InpMagicNumber)+"\n";
   result+="InpTradeComment="+CSJsonQuote(InpTradeComment)+"\n";
   result+="InpUseSwingSL="+(InpUseSwingSL ? "1" : "0")+"\n";
   result+="InpSwingBarsLookback="+IntegerToString(InpSwingBarsLookback)+"\n";
   result+="InpMinSLPoints="+IntegerToString(InpMinSLPoints)+"\n";
   result+="InpMaxSLPoints="+IntegerToString(InpMaxSLPoints)+"\n";
   result+="InpSLBufferPoints="+IntegerToString(InpSLBufferPoints)+"\n";
   result+="InpUseDynamicExit="+(InpUseDynamicExit ? "1" : "0")+"\n";
   result+="InpMinProfitUSDForExit="+DoubleToString(InpMinProfitUSDForExit,16)+"\n";
   result+="InpCloseInProfitAtSessionEnd="+(InpCloseInProfitAtSessionEnd ? "1" : "0")+"\n";
   result+="InpSessionEndMinProfitUSD="+DoubleToString(InpSessionEndMinProfitUSD,16)+"\n";
   result+="InpUseTakeProfit="+(InpUseTakeProfit ? "1" : "0")+"\n";
   result+="InpTPRatio="+DoubleToString(InpTPRatio,16)+"\n";
   result+="InpUseBreakEven="+(InpUseBreakEven ? "1" : "0")+"\n";
   result+="InpBETriggerUSD="+DoubleToString(InpBETriggerUSD,16)+"\n";
   result+="InpBELockUSD="+DoubleToString(InpBELockUSD,16)+"\n";
   result+="InpUseBasketRiskGate="+(InpUseBasketRiskGate ? "1" : "0")+"\n";
   result+="InpBasketMaxRiskUSD="+DoubleToString(InpBasketMaxRiskUSD,16)+"\n";
   result+="InpBasketRiskReserveUSD="+DoubleToString(InpBasketRiskReserveUSD,16)+"\n";
   result+="InpUseBasketLossExit="+(InpUseBasketLossExit ? "1" : "0")+"\n";
   result+="InpBasketMaxLossUSD="+DoubleToString(InpBasketMaxLossUSD,16)+"\n";
   result+="InpUseTrendInvalidationExit="+(InpUseTrendInvalidationExit ? "1" : "0")+"\n";
   result+="InpTrendBreakConfirmBars="+IntegerToString(InpTrendBreakConfirmBars)+"\n";
   result+="InpTrendBreakATRBuffer="+DoubleToString(InpTrendBreakATRBuffer,16)+"\n";
   result+="InpUsePyramidProfitLock="+(InpUsePyramidProfitLock ? "1" : "0")+"\n";
   result+="InpPyramidLockTriggerUSD="+DoubleToString(InpPyramidLockTriggerUSD,16)+"\n";
   result+="InpPyramidLockProfitUSD="+DoubleToString(InpPyramidLockProfitUSD,16)+"\n";
   result+="InpUseBasketProfitTrail="+(InpUseBasketProfitTrail ? "1" : "0")+"\n";
   result+="InpBasketTrailStartUSD="+DoubleToString(InpBasketTrailStartUSD,16)+"\n";
   result+="InpBasketTrailGivebackUSD="+DoubleToString(InpBasketTrailGivebackUSD,16)+"\n";
   result+="InpGuardCooldownBars="+IntegerToString(InpGuardCooldownBars)+"\n";
   result+="InpFilterEliteHours="+(InpFilterEliteHours ? "1" : "0")+"\n";
   result+="InpEnableAsianSession="+(InpEnableAsianSession ? "1" : "0")+"\n";
   result+="InpAvoidNewsSpikeHours="+(InpAvoidNewsSpikeHours ? "1" : "0")+"\n";
   result+="InpTradeStartHour="+IntegerToString(InpTradeStartHour)+"\n";
   result+="InpTradeStartMinute="+IntegerToString(InpTradeStartMinute)+"\n";
   result+="InpTradeEndHour="+IntegerToString(InpTradeEndHour)+"\n";
   result+="InpTradeEndMinute="+IntegerToString(InpTradeEndMinute)+"\n";
   result+="InpCloseWeekendFriday="+(InpCloseWeekendFriday ? "1" : "0")+"\n";
   result+="InpFridayCloseHour="+IntegerToString(InpFridayCloseHour)+"\n";
   result+="InpFridayCloseMinute="+IntegerToString(InpFridayCloseMinute)+"\n";
   result+="InpBlockFridayLateEntries="+(InpBlockFridayLateEntries ? "1" : "0")+"\n";
   result+="InpFridayStopEntryHour="+IntegerToString(InpFridayStopEntryHour)+"\n";
   result+="InpEnablePropProtection="+(IsBlueberryChallengeAccount() ? "1" : "0")+"\n";
   result+="InpMaxDailyDrawdownPercent="+DoubleToString(InpMaxDailyDrawdownPercent,16)+"\n";
   result+="InpMaxTotalDrawdownPercent="+DoubleToString(InpMaxTotalDrawdownPercent,16)+"\n";
   result+="InpTotalDDBasedOnInitial="+(InpTotalDDBasedOnInitial ? "1" : "0")+"\n";
   result+="InpDailyLockoutUntilMidnight="+(InpDailyLockoutUntilMidnight ? "1" : "0")+"\n";
   result+="InpPhaseProfitTargetPct="+DoubleToString(InpPhaseProfitTargetPct,16)+"\n";
   result+="InpTrendEMAPeriod="+IntegerToString(InpTrendEMAPeriod)+"\n";
   result+="InpFastEMAPeriod="+IntegerToString(InpFastEMAPeriod)+"\n";
   result+="InpSlowEMAPeriod="+IntegerToString(InpSlowEMAPeriod)+"\n";
   result+="InpRSIPeriod="+IntegerToString(InpRSIPeriod)+"\n";
   result+="InpRSIMinMomentum="+DoubleToString(InpRSIMinMomentum,16)+"\n";
   result+="InpUseOverextensionFilter="+(InpUseOverextensionFilter ? "1" : "0")+"\n";
   result+="InpMaxATRExtension="+DoubleToString(InpMaxATRExtension,16)+"\n";
   result+="InpUseConsecutiveRunFilter="+(InpUseConsecutiveRunFilter ? "1" : "0")+"\n";
   result+="InpMaxConsecutiveBars="+IntegerToString(InpMaxConsecutiveBars)+"\n";
   result+="InpUseSRDistanceFilter="+(InpUseSRDistanceFilter ? "1" : "0")+"\n";
   result+="InpMinSRRoomPoints="+IntegerToString(InpMinSRRoomPoints)+"\n";
   result+="InpATRPeriod="+IntegerToString(InpATRPeriod)+"\n";
   return result;
  }
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
datetime       m_last_guard_exit_time = 0;
bool           m_wait_for_signal_reset = false;

// Challenge protection belongs only to the explicitly configured Blueberry account.
bool IsBlueberryChallengeAccount()
{
   return AccountInfoInteger(ACCOUNT_LOGIN) == 5120620 &&
          AccountInfoString(ACCOUNT_SERVER) == "BlueberryMarketsSVG-Live";
}
double         m_basket_peak_profit = 0.0;
int            m_basket_peak_count = 0;
double         m_basket_ticket_sum = 0.0;

string BasketStateKey(const string field)
{
   return StringFormat("TBG_%I64d_%s_%I64u_%s",
                       AccountInfoInteger(ACCOUNT_LOGIN), _Symbol, InpMagicNumber, field);
}

bool PersistGuardState()
{
   return !MQLInfoInteger(MQL_TESTER);
}

void SaveBasketPeak()
{
   if(!PersistGuardState())
      return;
   GlobalVariableSet(BasketStateKey("peak"), m_basket_peak_profit);
   GlobalVariableSet(BasketStateKey("count"), m_basket_peak_count);
   GlobalVariableSet(BasketStateKey("tickets"), m_basket_ticket_sum);
}

double BasketTicketSum()
{
   double ticket_sum = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i) && m_position.Symbol() == _Symbol &&
         m_position.Magic() == InpMagicNumber)
         ticket_sum += (double)m_position.Ticket();
   }
   return ticket_sum;
}

// A stop-risk estimate is deliberately unavailable when a position has no SL.
// In that case the risk gate blocks a new order instead of guessing a value.
bool BasketRiskAtStops(double &signed_stop_result, int &count)
{
   double stop_result = 0.0;
   count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!m_position.SelectByIndex(i) || m_position.Symbol() != _Symbol ||
         m_position.Magic() != InpMagicNumber)
         continue;

      double existing_sl = m_position.StopLoss();
      if(existing_sl <= 0.0)
         return false;
      ENUM_ORDER_TYPE order_type = (m_position.PositionType() == POSITION_TYPE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double at_stop = 0.0;
      if(!OrderCalcProfit(order_type, _Symbol, m_position.Volume(),
                          m_position.PriceOpen(), existing_sl, at_stop))
         return false;
      stop_result += at_stop + m_position.Swap();
      count++;
   }
   signed_stop_result = stop_result;
   return true;
}

bool CanOpenWithinBasketRisk(ENUM_ORDER_TYPE order_type, double volume,
                             double candidate_entry, double candidate_sl)
{
   if(!InpUseBasketRiskGate)
      return true;
   if(candidate_sl <= 0.0)
      return false;
   if(volume <= 0.0 || InpBasketMaxRiskUSD <= 0.0)
      return false;
   if((order_type == ORDER_TYPE_BUY && candidate_sl >= candidate_entry) ||
      (order_type == ORDER_TYPE_SELL && candidate_sl <= candidate_entry))
      return false;
   double existing_stop_result = 0.0;
   int existing_count = 0;
   if(!BasketRiskAtStops(existing_stop_result, existing_count))
      return false;

   double candidate_at_stop = 0.0;
   if(!OrderCalcProfit(order_type, _Symbol, volume,
                       candidate_entry, candidate_sl, candidate_at_stop))
      return false;
   double projected_risk = MathMax(0.0, -(existing_stop_result + candidate_at_stop)) +
                           (existing_count + 1) * InpBasketRiskReserveUSD;
   if(projected_risk > InpBasketMaxRiskUSD + 0.01)
   {
      PrintFormat("BASKET RISK BLOCK: projected %.2f > limit %.2f (%d existing)",
                  projected_risk, InpBasketMaxRiskUSD, existing_count);
      return false;
   }
   return true;
}

double BasketFloatingProfit(int &count, ENUM_POSITION_TYPE &direction, bool &mixed)
{
   double profit = 0.0;
   count = 0;
   mixed = false;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!m_position.SelectByIndex(i) || m_position.Symbol() != _Symbol ||
         m_position.Magic() != InpMagicNumber)
         continue;
      if(count > 0 && m_position.PositionType() != direction)
         mixed = true;
      direction = m_position.PositionType();
      profit += m_position.Profit() + m_position.Swap();
      count++;
   }
   return profit;
}

bool HasConfirmedTrendBreak(ENUM_POSITION_TYPE direction)
{
   int bars = InpTrendBreakConfirmBars;
   if(bars < 1 || bars > 3)
      return false;
   double fast[], slow[], atr[];
   MqlRates rates[];
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(atr, true);
   ArraySetAsSeries(rates, true);
   if(CopyBuffer(m_fast_ema_handle, 0, 1, bars, fast) < bars ||
      CopyBuffer(m_slow_ema_handle, 0, 1, bars, slow) < bars ||
      CopyBuffer(m_atr_handle, 0, 1, bars, atr) < bars ||
      CopyRates(_Symbol, m_calc_timeframe, 1, bars, rates) < bars)
      return false;
   for(int i = 0; i < bars; i++)
   {
      double threshold = InpTrendBreakATRBuffer * atr[i];
      if(direction == POSITION_TYPE_BUY)
      {
         if(rates[i].close >= slow[i] - threshold || fast[i] >= slow[i])
            return false;
      }
      else
      {
         if(rates[i].close <= slow[i] + threshold || fast[i] <= slow[i])
            return false;
      }
   }
   return true;
}

void ManagePyramidLocks()
{
   if(!InpUsePyramidProfitLock)
      return;
   double tick_size = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tick_size <= 0.0)
      return;
   double min_stop_distance = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * m_symbol.Point();
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!m_position.SelectByIndex(i) || m_position.Symbol() != _Symbol ||
         m_position.Magic() != InpMagicNumber)
         continue;
      if(m_position.Profit() + m_position.Swap() < InpPyramidLockTriggerUSD)
         continue;

      bool is_buy = (m_position.PositionType() == POSITION_TYPE_BUY);
      ENUM_ORDER_TYPE order_type = is_buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double open_price = m_position.PriceOpen();
      double one_tick_result = 0.0;
      if(!OrderCalcProfit(order_type, _Symbol, m_position.Volume(), open_price,
                          open_price + (is_buy ? tick_size : -tick_size), one_tick_result) ||
         one_tick_result <= 0.0)
         continue;
      double ticks_to_lock = InpPyramidLockProfitUSD / one_tick_result;
      double target_sl = NormalizeDouble(open_price + (is_buy ? 1.0 : -1.0) *
                                         ticks_to_lock * tick_size, m_symbol.Digits());
      double current_sl = m_position.StopLoss();
      if(is_buy && (target_sl <= current_sl || target_sl >= m_symbol.Bid() - min_stop_distance))
         continue;
      if(!is_buy && ((current_sl > 0.0 && target_sl >= current_sl) ||
                     target_sl <= m_symbol.Ask() + min_stop_distance))
         continue;
      ulong ticket = m_position.Ticket();
      if(m_trade.PositionModify(ticket, target_sl, m_position.TakeProfit()) &&
         m_trade.ResultRetcode() == TRADE_RETCODE_DONE)
         PrintFormat("PYRAMID LOCK: #%I64u SL %.2f; budget can now be recalculated", ticket, target_sl);
      else
         PrintFormat("PYRAMID LOCK FAILED: #%I64u retcode %u", ticket, m_trade.ResultRetcode());
   }
}

void CloseGuardedBasket(const string reason)
{
   PrintFormat("BASKET GUARD EXIT: %s", reason);
   m_last_guard_exit_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_wait_for_signal_reset = true;
   if(PersistGuardState())
   {
      GlobalVariableSet(BasketStateKey("exit"), (double)m_last_guard_exit_time);
      GlobalVariableSet(BasketStateKey("wait"), 1.0);
   }
   CloseAllPositionsForMagic();
}

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
   if(InpBasketMaxRiskUSD <= 0.0 || InpBasketMaxLossUSD <= 0.0 ||
      InpBasketRiskReserveUSD < 0.0 || InpTrendBreakConfirmBars < 1 ||
      InpTrendBreakConfirmBars > 3 || InpTrendBreakATRBuffer < 0.0 ||
      InpPyramidLockTriggerUSD <= 0.0 || InpPyramidLockProfitUSD < 0.0 ||
      InpBasketTrailStartUSD <= 0.0 || InpBasketTrailGivebackUSD <= 0.0 ||
      InpGuardCooldownBars < 0)
   {
      Print("Invalid Basket Guard inputs");
      return INIT_PARAMETERS_INCORRECT;
   }
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
   m_initial_account_balance = AccountInfoDouble(ACCOUNT_BALANCE);
   m_day_start_balance       = CalculateDailyStartBalance(m_current_day_date);
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);

   // Live Restart Protection: Synchronize bar time and last entry time from history/positions
   m_last_m15_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time   = GetLastEntryTimeForMagic();
   PrintFormat("Blueberry challenge protection binding: %s",
               IsBlueberryChallengeAccount() ? "ACTIVE" : "disabled for non-Blueberry account");
   if(PersistGuardState() && GlobalVariableCheck(BasketStateKey("exit")))
      m_last_guard_exit_time = (datetime)GlobalVariableGet(BasketStateKey("exit"));
   if(PersistGuardState() && GlobalVariableCheck(BasketStateKey("wait")))
      m_wait_for_signal_reset = GlobalVariableGet(BasketStateKey("wait")) > 0.5;
   int restored_count = CountOpenPositions();
   if(PersistGuardState() && restored_count > 0 && GlobalVariableCheck(BasketStateKey("count")) &&
      (int)GlobalVariableGet(BasketStateKey("count")) == restored_count &&
      GlobalVariableCheck(BasketStateKey("tickets")) &&
      GlobalVariableGet(BasketStateKey("tickets")) == BasketTicketSum() &&
      GlobalVariableCheck(BasketStateKey("peak")))
   {
      m_basket_peak_count = restored_count;
      m_basket_ticket_sum = BasketTicketSum();
      m_basket_peak_profit = GlobalVariableGet(BasketStateKey("peak"));
   }

#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   CSParameterSetHash=CSHashText(CSParameterSetCanonical());
   if(CSParameterSetHash=="")
      Print("ChartStudio evidence recorder disabled: parameter hash unavailable.");
   else if(CSInitializeEvidenceProducer() && !EventSetTimer(1))
     {
      Print("ChartStudio evidence recorder disabled: timer unavailable.");
      CSRecorderReady=false;
      CSRecorderDisabled=true;
     }
#endif

   PrintFormat("XAU_Titan_Pro initialized. Daily Start: $%.2f | Last Entry: %s | Current Bar: %s | Anti-Trap: %s",
               m_day_start_balance,
               (m_last_entry_time > 0) ? TimeToString(m_last_entry_time, TIME_DATE|TIME_MINUTES|TIME_SECONDS) : "None",
               TimeToString(m_last_m15_bar_time, TIME_DATE|TIME_MINUTES),
               InpUseOverextensionFilter ? "Active" : "Disabled");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   EventKillTimer();
#endif
   if(m_trend_ema_handle != INVALID_HANDLE) IndicatorRelease(m_trend_ema_handle);
   if(m_fast_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_fast_ema_handle);
   if(m_slow_ema_handle  != INVALID_HANDLE) IndicatorRelease(m_slow_ema_handle);
   if(m_rsi_handle       != INVALID_HANDLE) IndicatorRelease(m_rsi_handle);
   if(m_atr_handle       != INVALID_HANDLE) IndicatorRelease(m_atr_handle);
   Comment("");
}

void OnTimer()
  {
   CSFlushEvidenceQueue();
  }

// Deal/lifecycle recording remains owned by the broker-side evidence adapter;
// this EA hook intentionally performs no duplicate history or file I/O.
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
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
      int stop_min_fri = InpFridayStopEntryHour * 60;
      if(current_min_fri >= stop_min_fri)
         return false;
   }
   if(InpFilterEliteHours)
   {
      // 1. Asian Night Session (Hours 1 to 7) - empirically 97.8% loss rate on Gold
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
   if(IsBlueberryChallengeAccount())
   {
      // Daily Drawdown Protection (Calculated against true day start balance)
      if(InpMaxDailyDrawdownPercent > 0.0 && m_day_start_balance > 0.0)
      {
         double daily_ref = (current_balance > m_day_start_balance) ? current_balance : m_day_start_balance;
         double daily_dd_pct = (current_equity < daily_ref) ? (((daily_ref - current_equity) / daily_ref) * 100.0) : 0.0;

         if(daily_dd_pct >= InpMaxDailyDrawdownPercent && !m_daily_lockout)
         {
            PrintFormat("RISK GUARD BREACH [%s | %s | %s]: Daily DD %.2f%% >= Limit %.2f%%. Closing all positions.",
                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),
                        daily_dd_pct, InpMaxDailyDrawdownPercent);
            CloseAllPositionsForMagic();
            if(InpDailyLockoutUntilMidnight)
            {
               m_daily_lockout = true;
               Print("Daily trading locked until 00:00 midnight to protect broker rules.");
            }
            else
            {
               // Resumes immediately for next signal
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
            // Blueberry Funded Official Rule: Static relative to initial deposit ($10,000 -> Stop at $9,100)
            if(m_initial_account_balance > 0.0 && current_equity < m_initial_account_balance)
               total_dd_pct = ((m_initial_account_balance - current_equity) / m_initial_account_balance) * 100.0;
         }
         else
         {
            // Trailing Drawdown from Peak Equity
            if(m_peak_equity > 0.0 && current_equity < m_peak_equity)
               total_dd_pct = ((m_peak_equity - current_equity) / m_peak_equity) * 100.0;
         }

         if(total_dd_pct >= InpMaxTotalDrawdownPercent && !m_total_lockout)
         {
            PrintFormat("RISK GUARD BREACH [%s | %s | %s]: Total DD %.2f%% >= Limit %.2f%%. Closing all positions and halting EA permanently.",
                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),
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
            PrintFormat("PROFIT TARGET REACHED [%s | %s | %s]: Profit %.2f%% >= Target %.2f%%. Halting EA.",
                        AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period()),
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

   // 2. Manage Active Positions (Dynamic Momentum & Session Exit & Optional BE)
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

   // 20-Hour Structural Swing High and Low
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
      PrintFormat("TITAN ANTI-TRAP: Long blockiert! Überdehnt=%s (Dist=%.2f > Max=%.2f) | ClimaxRunOk=%s | SROk=%s",
                  buy_not_overextended ? "Nein" : "JA (Gipfelkauf)",
                  (close1 - slow_ema[1]), (InpMaxATRExtension * atr_val[1]),
                  buy_run_ok ? "JA" : "Blockiert (Kerzen-Erschöpfung)",
                  buy_sr_ok ? "JA" : "Blockiert (Nahe Widerstand)");
   }
   if(base_sell && (!sell_not_overextended || !sell_run_ok || !sell_sr_ok))
   {
      PrintFormat("TITAN ANTI-TRAP: Short blockiert! Überdehnt=%s (Dist=%.2f > Max=%.2f) | ClimaxRunOk=%s | SROk=%s",
                  sell_not_overextended ? "Nein" : "JA (Bodenverkauf)",
                  (slow_ema[1] - close1), (InpMaxATRExtension * atr_val[1]),
                  sell_run_ok ? "JA" : "Blockiert (Kerzen-Erschöpfung)",
                  sell_sr_ok ? "JA" : "Blockiert (Nahe Support)");
   }

   bool buy_signal  = base_buy && buy_not_overextended && buy_run_ok && buy_sr_ok;
   bool sell_signal = base_sell && sell_not_overextended && sell_run_ok && sell_sr_ok;

#ifdef CS_EVIDENCE_CAPTURE_ENABLED
   string timeframe="M15";
   string features=CSFeature("close_1",CSNumber(close1,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("open_1",CSNumber(open1,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("trend_ema_1",CSNumber(trend_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("fast_ema_1",CSNumber(fast_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("slow_ema_1",CSNumber(slow_ema[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("rsi_1",CSNumber(rsi_val[1],4),"rsi_points",timeframe)+","+
      CSFeature("atr_1",CSNumber(atr_val[1],m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("swing_high",CSNumber(swing_high,m_symbol.Digits()),"price",timeframe)+","+
      CSFeature("swing_low",CSNumber(swing_low,m_symbol.Digits()),"price",timeframe);
   string predicates=CSPredicate("base_buy",CSBoolNumber(base_buy),"EQ","1",base_buy ? "PASS" : "BLOCK","BASE_BUY")+","+
      CSPredicate("base_sell",CSBoolNumber(base_sell),"EQ","1",base_sell ? "PASS" : "BLOCK","BASE_SELL")+","+
      CSPredicate("buy_not_overextended",CSBoolNumber(buy_not_overextended),"EQ","1",buy_not_overextended ? "PASS" : "BLOCK","BUY_EXTENSION")+","+
      CSPredicate("sell_not_overextended",CSBoolNumber(sell_not_overextended),"EQ","1",sell_not_overextended ? "PASS" : "BLOCK","SELL_EXTENSION")+","+
      CSPredicate("buy_run_ok",CSBoolNumber(buy_run_ok),"EQ","1",buy_run_ok ? "PASS" : "BLOCK","BUY_RUN")+","+
      CSPredicate("sell_run_ok",CSBoolNumber(sell_run_ok),"EQ","1",sell_run_ok ? "PASS" : "BLOCK","SELL_RUN")+","+
      CSPredicate("buy_sr_ok",CSBoolNumber(buy_sr_ok),"EQ","1",buy_sr_ok ? "PASS" : "BLOCK","BUY_SR")+","+
      CSPredicate("sell_sr_ok",CSBoolNumber(sell_sr_ok),"EQ","1",sell_sr_ok ? "PASS" : "BLOCK","SELL_SR")+","+
      CSPredicate("buy_signal",CSBoolNumber(buy_signal),"EQ","1",buy_signal ? "PASS" : "BLOCK","BUY_SIGNAL")+","+
      CSPredicate("sell_signal",CSBoolNumber(sell_signal),"EQ","1",sell_signal ? "PASS" : "BLOCK","SELL_SIGNAL");
   CSEnqueueDecision("SIGNAL",(buy_signal || sell_signal) ? "PASS" : "BLOCK",
                     rates[0].time,features,predicates);
#endif

   if(m_wait_for_signal_reset)
   {
      if(!buy_signal && !sell_signal)
      {
         m_wait_for_signal_reset = false;
         if(PersistGuardState())
            GlobalVariableSet(BasketStateKey("wait"), 0.0);
      }
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      CSEnqueueDecision("ENTRY_FILTER","BLOCK",rates[0].time,features,
                        CSPredicate("signal_reset_wait", "1","EQ","0","BLOCK","WAIT_FOR_RESET"));
#endif
      return;
   }
   if(m_last_guard_exit_time > 0 && InpGuardCooldownBars > 0 &&
      iTime(_Symbol, m_calc_timeframe, 0) <= m_last_guard_exit_time +
      InpGuardCooldownBars * PeriodSeconds(m_calc_timeframe))
   {
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
      CSEnqueueDecision("ENTRY_FILTER","BLOCK",rates[0].time,features,
                        CSPredicate("guard_cooldown", "1","EQ","0","BLOCK","COOLDOWN"));
#endif
      return;
   }

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
            bool risk_allowed = CanOpenWithinBasketRisk(ORDER_TYPE_BUY, lot_size, entry_price, sl_price);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            CSEnqueueDecision("RISK_GUARD",risk_allowed ? "PASS" : "BLOCK",rates[0].time,features,
               CSPredicate("basket_risk",risk_allowed ? "1" : "0","EQ","1",
                           risk_allowed ? "PASS" : "BLOCK","BASKET_RISK"));
#endif
            if(!risk_allowed)
               break;
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price + (InpTPRatio * sl_dist), m_symbol.Digits());

#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            MqlTick cs_tick={};
            bool cs_quote_ok=SymbolInfoTick(_Symbol,cs_tick) && cs_tick.time_msc>0 &&
                             cs_tick.bid>0.0 && cs_tick.ask>=cs_tick.bid;
            double cs_bid=cs_tick.bid,cs_ask=cs_tick.ask;
            string cs_quote_time=CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
            datetime cs_request_utc=TimeGMT();
            string cs_request_time=CSUtc(cs_request_utc);
            double cs_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
            double cs_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
            string cs_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
#endif
            bool order_sent=m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment);
            uint order_retcode=m_trade.ResultRetcode();
            bool entry_accepted=order_sent &&
               (order_retcode == TRADE_RETCODE_DONE || order_retcode == TRADE_RETCODE_DONE_PARTIAL);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            datetime cs_ack_utc=TimeGMT();
            ulong cs_order_ticket=entry_accepted ? m_trade.ResultOrder() : 0;
            string cs_attempt_id="attempt_"+IntegerToString((long)GetTickCount64())+"_"+
                                  IntegerToString((long)(CSEventCounter+1));
            if(cs_quote_ok && cs_tick_size>0.0)
              {
               string cs_attempt=CSOrderAttemptJson(cs_attempt_id,"BUY",entry_price,lot_size,
                  cs_bid,cs_ask,cs_tick_size,cs_tick_value,cs_currency,cs_quote_time,
                  cs_request_time,CSUtc(cs_ack_utc),order_retcode,cs_order_ticket);
               CSEnqueueDecision("ORDER_ATTEMPT",entry_accepted ? "PASS" : "BLOCK",rates[0].time,
                  features,CSPredicate("broker_order",entry_accepted ? "1" : "0","EQ","1",
                     entry_accepted ? "PASS" : "BLOCK","BROKER_RESULT"),cs_attempt,
                  cs_attempt_id,cs_order_ticket,cs_request_time);
              }
            else
               CSEnqueueDecision("ORDER_ATTEMPT",entry_accepted ? "PASS" : "BLOCK",rates[0].time,
                  features,CSPredicate("broker_order",entry_accepted ? "1" : "0","EQ","1",
                     entry_accepted ? "PASS" : "BLOCK","BROKER_RESULT"));
#endif
            if(entry_accepted)
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
            bool risk_allowed = CanOpenWithinBasketRisk(ORDER_TYPE_SELL, lot_size, entry_price, sl_price);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            CSEnqueueDecision("RISK_GUARD",risk_allowed ? "PASS" : "BLOCK",rates[0].time,features,
               CSPredicate("basket_risk",risk_allowed ? "1" : "0","EQ","1",
                           risk_allowed ? "PASS" : "BLOCK","BASKET_RISK"));
#endif
            if(!risk_allowed)
               break;
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price - (InpTPRatio * sl_dist), m_symbol.Digits());

#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            MqlTick cs_tick={};
            bool cs_quote_ok=SymbolInfoTick(_Symbol,cs_tick) && cs_tick.time_msc>0 &&
                             cs_tick.bid>0.0 && cs_tick.ask>=cs_tick.bid;
            double cs_bid=cs_tick.bid,cs_ask=cs_tick.ask;
            string cs_quote_time=CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS);
            datetime cs_request_utc=TimeGMT();
            string cs_request_time=CSUtc(cs_request_utc);
            double cs_tick_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
            double cs_tick_value=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
            string cs_currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
#endif
            bool order_sent=m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment);
            uint order_retcode=m_trade.ResultRetcode();
            bool entry_accepted=order_sent &&
               (order_retcode == TRADE_RETCODE_DONE || order_retcode == TRADE_RETCODE_DONE_PARTIAL);
#ifdef CS_EVIDENCE_CAPTURE_ENABLED
            datetime cs_ack_utc=TimeGMT();
            ulong cs_order_ticket=entry_accepted ? m_trade.ResultOrder() : 0;
            string cs_attempt_id="attempt_"+IntegerToString((long)GetTickCount64())+"_"+
                                  IntegerToString((long)(CSEventCounter+1));
            if(cs_quote_ok && cs_tick_size>0.0)
              {
               string cs_attempt=CSOrderAttemptJson(cs_attempt_id,"SELL",entry_price,lot_size,
                  cs_bid,cs_ask,cs_tick_size,cs_tick_value,cs_currency,cs_quote_time,
                  cs_request_time,CSUtc(cs_ack_utc),order_retcode,cs_order_ticket);
               CSEnqueueDecision("ORDER_ATTEMPT",entry_accepted ? "PASS" : "BLOCK",rates[0].time,
                  features,CSPredicate("broker_order",entry_accepted ? "1" : "0","EQ","1",
                     entry_accepted ? "PASS" : "BLOCK","BROKER_RESULT"),cs_attempt,
                  cs_attempt_id,cs_order_ticket,cs_request_time);
              }
            else
               CSEnqueueDecision("ORDER_ATTEMPT",entry_accepted ? "PASS" : "BLOCK",rates[0].time,
                  features,CSPredicate("broker_order",entry_accepted ? "1" : "0","EQ","1",
                     entry_accepted ? "PASS" : "BLOCK","BROKER_RESULT"));
#endif
            if(entry_accepted)
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
   int guard_count = 0;
   ENUM_POSITION_TYPE guard_direction = POSITION_TYPE_BUY;
   bool mixed_directions = false;
   double basket_profit = BasketFloatingProfit(guard_count, guard_direction, mixed_directions);
   double ticket_sum = BasketTicketSum();
   if(guard_count == 0)
   {
      m_basket_peak_count = 0;
      m_basket_peak_profit = 0.0;
      m_basket_ticket_sum = 0.0;
      if(PersistGuardState())
      {
         GlobalVariableDel(BasketStateKey("peak"));
         GlobalVariableDel(BasketStateKey("count"));
         GlobalVariableDel(BasketStateKey("tickets"));
      }
      return;
   }
   if(guard_count != m_basket_peak_count || ticket_sum != m_basket_ticket_sum)
   {
      m_basket_peak_count = guard_count;
      m_basket_ticket_sum = ticket_sum;
      m_basket_peak_profit = basket_profit;
      SaveBasketPeak();
   }
   else if(basket_profit > m_basket_peak_profit)
   {
      m_basket_peak_profit = basket_profit;
      SaveBasketPeak();
   }

   // Hard money loss is checked on every tick, even when indicators are unavailable.
   if(InpUseBasketLossExit && basket_profit <= -InpBasketMaxLossUSD)
   {
      CloseGuardedBasket(StringFormat("floating %.2f <= -%.2f", basket_profit, InpBasketMaxLossUSD));
      return;
   }
   if(InpUseTrendInvalidationExit && basket_profit < 0.0 &&
      !mixed_directions && HasConfirmedTrendBreak(guard_direction))
   {
      CloseGuardedBasket(StringFormat("confirmed M15 trend break, floating %.2f", basket_profit));
      return;
   }
   if(InpUseBasketProfitTrail && m_basket_peak_profit >= InpBasketTrailStartUSD &&
      m_basket_peak_profit - basket_profit >= InpBasketTrailGivebackUSD)
   {
      CloseGuardedBasket(StringFormat("peak %.2f, current %.2f", m_basket_peak_profit, basket_profit));
      return;
   }
   ManagePyramidLocks();

   double fast_ema[1];
   if(CopyBuffer(m_fast_ema_handle, 0, 0, 1, fast_ema) < 1) return;

   int total = PositionsTotal();
   if(total == 0) return;

   // 1. Intelligent Break-Even Protection (Moves SL into profit to prevent full -$50 losses)
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

   if(InpCloseWeekendFriday && dt.day_of_week == 5)
   {
      int current_min_fri = dt.hour * 60 + dt.min;
      int close_min_fri = InpFridayCloseHour * 60 + InpFridayCloseMinute;
      if(current_min_fri >= close_min_fri)
      {
         CloseAllPositionsForMagic();
         PrintFormat("WEEKEND PROTECTION EXIT: Freitag %02d:%02d, Korb %d, PnL %.2f",
                     dt.hour, dt.min, my_positions, total_profit_usd);
         return;
      }
   }
   if(InpCloseWeekendFriday && (dt.day_of_week == 0 || dt.day_of_week == 6))
   {
      CloseAllPositionsForMagic();
      Print("WEEKEND PROTECTION EXIT: Weekend");
      return;
   }

   double current_price = (basket_type == POSITION_TYPE_BUY) ? m_symbol.Bid() : m_symbol.Ask();
   double avg_profit_per_pos = total_profit_usd / my_positions;

   // 3. Dynamic Runner Exit: Price pulls back across Fast EMA after hitting realistic swing target (>= $25 USD)
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

   // 4. Session End Profit Lock: Close and secure profits at session end (InpTradeEndHour)
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
            ulong ticket = m_position.Ticket();
            if(!m_trade.PositionClose(ticket) ||
               (m_trade.ResultRetcode() != TRADE_RETCODE_DONE &&
                m_trade.ResultRetcode() != TRADE_RETCODE_DONE_PARTIAL))
               PrintFormat("POSITION CLOSE FAILED: #%I64u retcode %u", ticket, m_trade.ResultRetcode());
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
      state_str = "PROFITZIEL ERREICHT! (Bestanden)";
   else if(m_total_lockout)
      state_str = "NOT-HALT (Gesamt-Drawdown Limit erreicht)";
   else if(m_daily_lockout)
      state_str = "TAGES-SPERRE (Tages-Drawdown Limit erreicht)";
   else if(dt.day_of_week == 0 || dt.day_of_week == 6)
      state_str = "WOCHENENDE (Markt geschlossen / Weekend Protection)";
   else if(dt.day_of_week == 5 && InpCloseWeekendFriday &&
           dt.hour * 60 + dt.min >= InpFridayCloseHour * 60 + InpFridayCloseMinute)
      state_str = "WOCHENENDE-SCHUTZ AKTIV (Freitagabend Glattstellung)";
   else if(dt.day_of_week == 5 && InpBlockFridayLateEntries && dt.hour >= InpFridayStopEntryHour)
      state_str = "FREITAG-STOPP (Keine neuen Einstiege vor Wochenende)";
   else if(!in_window)
      state_str = "Warten auf Handelsfenster (07:00-18:00 oder 22:00-02:00 DE)";

   string lot_display = (InpFixedLot > 0.0) ? StringFormat("Fix %.2f Lot", InpFixedLot) : StringFormat("%.2f%% Dynamisch", InpRiskPercent);

   string dash = "";
   dash += "========================================================\n";
   dash += "   XAU TITAN PRO v7.1 (ANTI-TRAP & HIGH-PROFIT EDITION)  \n";
   dash += "========================================================\n";
   dash += StringFormat("Zeit:           Server %02d:%02d | DEUTSCHLAND %02d:%02d\n", dt.hour, dt.min, german_hour, dt.min);
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += StringFormat("Positionsgröße: %s | Max Positionen: %d\n", lot_display, InpMaxOpenPositions);
   dash += StringFormat("Tages DD:       %.2f%% / 4.00%% Max (EA-Notaus: %.1f%%)\n", daily_dd_pct, InpMaxDailyDrawdownPercent);
   dash += StringFormat("Gesamt DD:      %.2f%% / 10.00%% Max (EA-Notaus: %.1f%%)\n", total_dd_pct, InpMaxTotalDrawdownPercent);
   dash += "--------------------------------------------------------\n";
   dash += StringFormat("Handelsfenster: %s (07:00-18:00 & 22:00-02:00 DE)\n", in_window ? "OFFEN (Trades erlaubt)" : "GESCHLOSSEN");
   dash += "Berechnung:     STRIKT M15 | Execution: Auto Filling & Retry Loop\n";
   dash += StringFormat("Offene Trades:  %d / %d erlaubt\n", open_pos, InpMaxOpenPositions);
   dash += StringFormat("Status:         %s\n", state_str);
   dash += StringFormat("Trend Regime:   %s\n", trend_str);
   dash += StringFormat("Anti-Trap Guard: %s (ATR: %.1fx | Climax: %dBars | SR: %dpt)\n",
                        InpUseOverextensionFilter ? "AKTIV (Gipfelschutz)" : "AUS",
                        InpMaxATRExtension, InpMaxConsecutiveBars, InpMinSRRoomPoints);
   dash += "========================================================\n";

   Comment(dash);
}
//+------------------------------------------------------------------+

