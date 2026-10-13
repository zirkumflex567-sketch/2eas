//+------------------------------------------------------------------+
//|                               XAU_PrimeTitan_Challenge_M15.mq5   |
//|                             Copyright 2026, Quantitative Systems |
//|           Reverse-Engineered & Optimized Institutional Gold EA   |
//|                     Independent Prime M15, research edition      |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Quantitative Systems"
#property link        "https://www.mql5.com"
#property version     "1.00"
#property description "Standalone XAUUSD M15 Challenge Research EA, derived from original Titan logic"
#property description "Keeps XAU_Titan_Pro.mq5 unchanged; separate magic number / original source"
#property description "RESEARCH until verified by broker MT5 real-tick test; risk controls do not guarantee prop compliance."

#include <Trade\Trade.mqh>
#include <Trade\SymbolInfo.mqh>
#include <Trade\PositionInfo.mqh>
#include "TitanChallengeGuard.mqh"

//--- Input Parameters
input group "=== 01 / Risikomanagement & Positionsgröße ==="
input double   InpFixedLot                = 0.0;         // Feste Lotgröße (0.0 = % Risiko; >0.0 = Fixe Lotgröße)
input double   InpRiskPercent             = 0.5;         // Dynamisches % Risiko (0.5% = Original guter5er Rekordlauf)
input int      InpMaxOpenPositions        = 3;           // Max. gleichzeitige Positionen im Trend
input int      InpMinBarsBetweenEntries   = 2;           // Mindestabstand zwischen Einstiegen (2 Bars = 30 Min)
input ulong    InpMagicNumber             = 882720;      // Magic Number
input string   InpTradeComment            = "PrimeTitan_Research"; // Trade Kommentar

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

input group "=== 03 / Handelszeiten & Elite-Filter (Serverzeit) ==="
input bool     InpFilterEliteHours        = true;        // Elite Zeitfenster aktiv
input bool     InpEnableAsianSession      = true;        // Asien-Session aktiv (01:00-08:00) (Original: hochprofitabel!)
input bool     InpAvoidNewsSpikeHours     = false;       // US-News/Opening-Chop meiden
input int      InpTradeStartHour          = 1;           // Handelsstart Stunde (Serverzeit 01:00)
input int      InpTradeStartMinute        = 0;           // Handelsstart Minute
input int      InpTradeEndHour            = 23;          // Handelsende Stunde
input int      InpTradeEndMinute          = 45;          // Handelsende Minute

input group "=== 04 / Blueberry Funded Prop-Firm Schutz ==="
input bool     InpEnablePropProtection    = true;        // Harter Prop-Firm Notaus aktiv (Standard: true für maximalen Kontoschutz)
input double   InpMaxDailyDrawdownPercent = 3.5;         // Max. Tagesverlust % (Notbremse vor 4.0% Regel)
input double   InpMaxTotalDrawdownPercent = 8.0;          // 9200 USD static internal hard equity floor         // Max. Gesamtverlust % (Notbremse vor 10.0% Regel)
input bool     InpTotalDDBasedOnInitial   = true;        // MANDATORY static hard floor        // Max Drawdown Basis (true = Statisch vom Startkapital wie Blueberry; false = Trailing)
input bool     InpDailyLockoutUntilMidnight = true;      // Deprecated: always lock until correct day-reset      // Nach Tagesverlust (true = Pause bis Mitternacht; false = Sofort weiter traden)
input double   InpPhaseProfitTargetPct    = 0.0;
input group "=== 04b / Absolute Challenge Risk Budget (10k USD) ==="
input double   InpOriginalAccountUSD       = 10000.0;   // Original account; NEVER reset to grown balance
input double   InpGuardSafetyBufferUSD     = 35.0;      // Emergency floor above official internal limit
input int      InpDailyResetHourServer     = 0;         // SET to server equivalent of 5pm New York
input int      InpDailyResetMinuteServer   = 0;
input int      InpMaxSnapshotDelaySeconds  = 120;       // Missed reset -> fail CLOSED
input bool     InpServerResetConfirmed     = false;     // LIVE requires explicit broker-time verification
input bool     InpTesterAssumeFirstDay     = true;      // Tester only: first partial day approximation
input double   InpMaxBasketSLRiskUSD       = 150.0;     // Cumulative all-open + proposed SL risk
input double   InpMaxOneEntrySLRiskUSD     = 50.0;      // Per position even if lot fixed
input double   InpMaxSyntheticMarginFraction = 0.90;   // 1:10 leverage with 10% free buffer
input double   InpMinFreeMarginBufferPct   = 30.0;
input double   InpExecutionRiskMultiplier  = 1.25;     // Worst-case slippage/fees headroom, not gap guarantee
input double   InpMaxSpreadPriceUSD        = 0.75;
input bool     InpRequireBrokerNewsGuard   = true;     // Fail closed live on calendar read errors
input bool     InpTesterSkipCalendar       = true;     // Backtest only; news-rule NOT verified
input int      InpHighImpactNewsBufferSec  = 150;
input group "=== 06b / Optional research profit improvements ==="
input bool     InpProfitSelectivePyramiding= false;     // Require favorable move before extra positions
input double   InpMinPyramidMoveATR       = 0.70;
input double   InpMinBasketFloatingUSD    = 25.0;
input bool     InpUseM15VolumeConfirm     = false;     // Research: filter weak momentum candles
input double   InpM15VolumeFactor        = 1.15;      // Current closed tick-volume / previous 20 average
input bool     InpUseEMA50SlopeConfirm   = false;     // Research: need rising/falling EMA50 (4 bars)
input bool     InpUseTrendRunnerATRStop   = false;     // EMA21/ATR-based profit protection
input double   InpATRRunnerStartProfitUSD = 90.0;
input double   InpATRRunnerMult           = 1.70;         // Phasen-Ziel % (0.0 = Deaktiviert / Fortlaufend traden)

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

//--- Global Variables
CTrade         m_trade;
CSymbolInfo    m_symbol;
CPositionInfo  m_position;
CTitanChallengeGuard m_challenge;

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
//| Firm-wide protective close: every position and pending order    |
//+------------------------------------------------------------------+
void TitanFlattenAccount(const string reason)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong id=OrderGetTicket(i);
      if(id!=0 && !m_trade.OrderDelete(id))
         PrintFormat("GUARD %s failed pending order delete #%I64u: %s",
                     reason,id,m_trade.ResultRetcodeDescription());
   }
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong id=PositionGetTicket(i);
      if(id!=0 && !m_trade.PositionClose(id))
         PrintFormat("GUARD %s failed close position #%I64u: %s",
                     reason,id,m_trade.ResultRetcodeDescription());
   }
}
bool TitanSafetyCheck(const bool flatten)
{
   datetime now=TimeTradeServer();
   if(now<=0) now=TimeCurrent();
   bool observed=m_challenge.Observe(now,InpTesterAssumeFirstDay);
   if(m_challenge.MustFlatten() && flatten)
      TitanFlattenAccount(m_challenge.HardLocked()?"STATIC":"DAILY");
   return observed && m_challenge.Valid();
}
bool TitanNoExternalOrdersOrPositions()
{
   if(OrdersTotal()>0) return false;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(PositionGetTicket(i)==0) return false;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=(long)InpMagicNumber) return false;
   }
   return true;
}
bool TitanNewsSafe()
{
   if(!InpRequireBrokerNewsGuard) return true;
   if(MQLInfoInteger(MQL_TESTER) && InpTesterSkipCalendar) return true;
   datetime now=TimeTradeServer();
   if(now<=0) return false;
   MqlCalendarValue values[];
   ResetLastError();
   int cnt=CalendarValueHistory(values,now-InpHighImpactNewsBufferSec,
                              now+InpHighImpactNewsBufferSec,NULL,"USD");
   if(cnt<0)
   {
      PrintFormat("Fail-closed: news calendar unavailable, error %d",GetLastError());
      return false;
   }
   for(int i=0;i<cnt;i++)
   {
      MqlCalendarEvent ev;
      if(!CalendarEventById(values[i].event_id,ev)) return false;
      if(ev.importance==CALENDAR_IMPORTANCE_HIGH) return false;
   }
   return true;
}
double TitanOpenPortfolioStopRisk()
{
   double total=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(PositionGetTicket(i)==0) return DBL_MAX;
      string sym=PositionGetString(POSITION_SYMBOL);
      double lots=PositionGetDouble(POSITION_VOLUME);
      double stop=PositionGetDouble(POSITION_SL);
      MqlTick t;
      if(stop<=0 || lots<=0 || !SymbolInfoTick(sym,t)) return DBL_MAX;
      ENUM_ORDER_TYPE type=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?
                           ORDER_TYPE_BUY:ORDER_TYPE_SELL;
      double current=type==ORDER_TYPE_BUY?t.bid:t.ask;
      if(current<=0 || (type==ORDER_TYPE_BUY && stop>=current) ||
         (type==ORDER_TYPE_SELL && stop<=current)) return DBL_MAX;
      double future=0;
      if(!OrderCalcProfit(type,sym,lots,current,stop,future)) return DBL_MAX;
      double remaining=MathMax(0.0,-future);
      total+=remaining*InpExecutionRiskMultiplier;
   }
   return total;
}
double TitanSyntheticMarginUsed()
{
   double total=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(PositionGetTicket(i)==0) return DBL_MAX;
      string sym=PositionGetString(POSITION_SYMBOL);
      double contract=SymbolInfoDouble(sym,SYMBOL_TRADE_CONTRACT_SIZE);
      double open=PositionGetDouble(POSITION_PRICE_OPEN);
      double lots=PositionGetDouble(POSITION_VOLUME);
      // Strict only for the single XAUUSD instrument with USD quote.
      if(sym!=_Symbol || contract<=0 || open<=0) return DBL_MAX;
      total+=lots*contract*open/10.0;
   }
   return total;
}
bool TitanPyramidOK()
{
   if(!InpProfitSelectivePyramiding || CountOpenPositions()==0) return true;
   double basket=0;
   double newestPrice=0;
   long direction=0;
   datetime last=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(PositionGetTicket(i)==0) return false;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=(long)InpMagicNumber) return false;
      basket+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      datetime t=(datetime)PositionGetInteger(POSITION_TIME);
      if(t>=last)
      {
         last=t;
         newestPrice=PositionGetDouble(POSITION_PRICE_OPEN);
         direction=PositionGetInteger(POSITION_TYPE);
      }
   }
   if(basket<InpMinBasketFloatingUSD) return false;
   double atr[];
   if(CopyBuffer(m_atr_handle,0,1,1,atr)!=1 || atr[0]<=0) return false;
   if(direction==POSITION_TYPE_BUY)
      return m_symbol.Bid()-newestPrice>=InpMinPyramidMoveATR*atr[0];
   return newestPrice-m_symbol.Ask()>=InpMinPyramidMoveATR*atr[0];
}
void TitanProfitRunnerStop()
{
   if(!InpUseTrendRunnerATRStop) return;
   double ema[],atr[];
   if(CopyBuffer(m_slow_ema_handle,0,1,1,ema)!=1 ||
      CopyBuffer(m_atr_handle,0,1,1,atr)!=1 || atr[0]<=0) return;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      if(!m_position.SelectByIndex(i) ||
         m_position.Symbol()!=_Symbol || m_position.Magic()!=InpMagicNumber) continue;
      if(m_position.Profit()+m_position.Swap()<InpATRRunnerStartProfitUSD) continue;
      double oldSL=m_position.StopLoss();
      double target=m_position.PositionType()==POSITION_TYPE_BUY?
                    ema[0]-atr[0]*InpATRRunnerMult:
                    ema[0]+atr[0]*InpATRRunnerMult;
      target=NormalizeDouble(target,m_symbol.Digits());
      double minDist=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point +
                     2*m_symbol.Point();
      bool can=m_position.PositionType()==POSITION_TYPE_BUY?
               (target>oldSL+2*m_symbol.Point() &&
                target<m_symbol.Bid()-minDist):
               (oldSL<=0 || target<oldSL-2*m_symbol.Point()) &&
                target>m_symbol.Ask()+minDist;
      if(can && !m_trade.PositionModify(m_position.Ticket(),target,m_position.TakeProfit()))
         PrintFormat("ATR runner trail refused %I64u: %s",
                     m_position.Ticket(),m_trade.ResultRetcodeDescription());
   }
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
   if(_Period!=PERIOD_M15)
   {
      Print("PrimeTitan requires XAUUSD* with chart period M15, not another chart timeframe");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringFind(_Symbol,"XAUUSD")!=0 ||
      (InpMaxOpenPositions>1 &&
       AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING))
   {
      Print("Require XAUUSD* and MT5 hedging account for stacked positions");
      return INIT_PARAMETERS_INCORRECT;
   }
   m_symbol.RefreshRates();

   if(!InpEnablePropProtection || !InpTotalDDBasedOnInitial ||
      !InpDailyLockoutUntilMidnight || InpOriginalAccountUSD!=10000.0 ||
      InpMaxDailyDrawdownPercent<=0 || InpMaxDailyDrawdownPercent>3.5 ||
      InpMaxTotalDrawdownPercent<=0 || InpMaxTotalDrawdownPercent>8.0 ||
      InpRiskPercent<=0 || InpRiskPercent>0.5 ||
      InpMaxOpenPositions<1 || InpMaxOpenPositions>3 ||
      InpMaxOneEntrySLRiskUSD<=0 || InpMaxBasketSLRiskUSD<=0 ||
      InpMaxBasketSLRiskUSD>150.0 || InpMaxOneEntrySLRiskUSD>50.0 ||
      InpExecutionRiskMultiplier<1.0 || InpMaxSyntheticMarginFraction<=0 ||
      InpMaxSyntheticMarginFraction>1.0 || InpGuardSafetyBufferUSD<25 ||
      InpHighImpactNewsBufferSec<120 || InpMaxSpreadPriceUSD<=0 ||
      InpMinFreeMarginBufferPct<5 || InpMinFreeMarginBufferPct>90 ||
      InpMinPyramidMoveATR<0 || InpATRRunnerMult<=0 || InpM15VolumeFactor<=0 ||
      InpMaxSnapshotDelaySeconds<0 || InpMaxSnapshotDelaySeconds>600 ||
      (InpRequireBrokerNewsGuard==false && !MQLInfoInteger(MQL_TESTER)) ||
      (!InpServerResetConfirmed && !MQLInfoInteger(MQL_TESTER)) ||
      AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {
      Print("INVALID / UNSAFE CHALLENGE CONFIGURATION: live use requires verified server reset & mandatory risk rules.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(!m_challenge.Init(InpOriginalAccountUSD,InpMaxDailyDrawdownPercent,
                        InpMaxTotalDrawdownPercent,InpGuardSafetyBufferUSD,
                        InpDailyResetHourServer,InpDailyResetMinuteServer,
                        InpMaxSnapshotDelaySeconds,InpTesterAssumeFirstDay))
      return INIT_FAILED;
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
   m_initial_account_balance = InpOriginalAccountUSD;
   m_day_start_balance       = m_challenge.DailyReference();
   m_peak_equity             = AccountInfoDouble(ACCOUNT_EQUITY);

   // Live Restart Protection: Synchronize bar time and last entry time from history/positions
   m_last_m15_bar_time = iTime(_Symbol, m_calc_timeframe, 0);
   m_last_entry_time   = GetLastEntryTimeForMagic();

   if(!EventSetTimer(1))
   {
      Print("FAIL CLOSED: could not arm 1-second equity safety timer");
      return INIT_FAILED;
   }
   PrintFormat("XAU_PrimeTitan_M15 GUARD v1.00: static floor %.2f, day floor %.2f, day known %s, configured server reset %02d:%02d",
               m_challenge.StaticFloor(),m_challenge.DailyFloor(),
               m_challenge.Valid()?"YES":"NO",InpDailyResetHourServer,
               InpDailyResetMinuteServer);
   PrintFormat("XAU_PrimeTitan_M15 initialized. Daily Start: $%.2f | Last Entry: %s | Current Bar: %s | Anti-Trap: %s",
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
   EventKillTimer();
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
   if(!TitanSafetyCheck(true))
   {
      m_day_start_balance=m_challenge.DailyReference();
      UpdateDashboard(dt);
      return;
   }
   m_day_start_balance=m_challenge.DailyReference();
   double current_equity=AccountInfoDouble(ACCOUNT_EQUITY);
   if(current_equity>m_peak_equity) m_peak_equity=current_equity;
   if(InpPhaseProfitTargetPct>0 &&
      (current_equity-InpOriginalAccountUSD)/InpOriginalAccountUSD*100.0 >=
      InpPhaseProfitTargetPct)
   {
      m_target_reached=true;
      TitanFlattenAccount("PHASE TARGET");
      UpdateDashboard(dt);
      return;
   }
   if(m_target_reached)
   {
      UpdateDashboard(dt);
      return;
   }

   // 2. Manage Active Positions (Dynamic Momentum & Session Exit & Optional BE)
   ManageOpenPositions(dt);
   TitanProfitRunnerStop();

   // 3. Check for New Entry on M15 Bar Close (Live Race Condition Protected)
   if(is_new_m15_bar && IsWithinTradingWindow(dt) &&
      TitanNoExternalOrdersOrPositions() && TitanNewsSafe() && TitanPyramidOK())
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

void OnTimer()
{
   // A stopped or sleeping symbol must not entirely disable the risk watchdog.
   TitanSafetyCheck(true);
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

   // These filters are OFF by default: original Titan entries remain
   // unchanged unless the separate research preset enables them.
   bool volume_ok=true;
   if(InpUseM15VolumeConfirm)
   {
      double avg=0;
      for(int k=1;k<=20;k++) avg+=(double)rates[k].tick_volume;
      avg/=20;
      volume_ok=avg>0 && (double)rates[0].tick_volume>=avg*InpM15VolumeFactor;
   }
   bool slope_buy=true,slope_sell=true;
   if(InpUseEMA50SlopeConfirm)
   {
      double past[1];
      if(CopyBuffer(m_trend_ema_handle,0,5,1,past)!=1) return;
      slope_buy=trend_ema[1]>past[0];
      slope_sell=trend_ema[1]<past[0];
   }

   bool buy_signal  = base_buy && buy_not_overextended && buy_run_ok && buy_sr_ok &&
                      volume_ok && slope_buy;
   bool sell_signal = base_sell && sell_not_overextended && sell_run_ok && sell_sr_ok &&
                      volume_ok && slope_sell;

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

      double lot_size = CalculateLotSize(1,entry_price,sl_price);

      if(lot_size > 0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Ask();
            if(!TitanSafetyCheck(false) || !TitanNewsSafe()) break;
            lot_size=CalculateLotSize(1,entry_price,sl_price);
            if(lot_size<=0) break;
            double stopPoints=(entry_price-sl_price)/m_symbol.Point();
            if(stopPoints<(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+2) break;
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price + (InpTPRatio * (entry_price-sl_price)), m_symbol.Digits());

            if(m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment) &&
               (m_trade.ResultRetcode()==TRADE_RETCODE_DONE ||
                m_trade.ResultRetcode()==TRADE_RETCODE_DONE_PARTIAL ||
                m_trade.ResultRetcode()==TRADE_RETCODE_PLACED))
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

      double lot_size = CalculateLotSize(-1,entry_price,sl_price);

      if(lot_size > 0)
      {
         for(int attempt = 1; attempt <= 3; attempt++)
         {
            m_symbol.RefreshRates();
            entry_price = m_symbol.Bid();
            if(!TitanSafetyCheck(false) || !TitanNewsSafe()) break;
            lot_size=CalculateLotSize(-1,entry_price,sl_price);
            if(lot_size<=0) break;
            double stopPoints=(sl_price-entry_price)/m_symbol.Point();
            if(stopPoints<(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+2) break;
            if(tp_price > 0.0)
               tp_price = NormalizeDouble(entry_price - (InpTPRatio * (sl_price-entry_price)), m_symbol.Digits());

            if(m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment) &&
               (m_trade.ResultRetcode()==TRADE_RETCODE_DONE ||
                m_trade.ResultRetcode()==TRADE_RETCODE_DONE_PARTIAL ||
                m_trade.ResultRetcode()==TRADE_RETCODE_PLACED))
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
double CalculateLotSize(const int side,const double entry,const double stop)
{
   if(!TitanSafetyCheck(false) || !TitanNoExternalOrdersOrPositions()) return 0;
   if(entry<=0 || stop<=0 || (side>0 && stop>=entry) ||
      (side<0 && stop<=entry)) return 0;
   if(!m_symbol.RefreshRates() ||
      m_symbol.Ask()-m_symbol.Bid()>InpMaxSpreadPriceUSD) return 0;
   double currentEQ=AccountInfoDouble(ACCOUNT_EQUITY);
   double floor=m_challenge.SafeFloor();
   double already=TitanOpenPortfolioStopRisk();
   if(already==DBL_MAX || already>InpMaxBasketSLRiskUSD) return 0;
   ENUM_ORDER_TYPE kind=side>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   double oneLotPnL=0;
   if(!OrderCalcProfit(kind,_Symbol,1.0,entry,stop,oneLotPnL) ||
      oneLotPnL>=0) return 0;
   double worstLotRisk=-oneLotPnL*InpExecutionRiskMultiplier;
   if(worstLotRisk<=0 || !MathIsValidNumber(worstLotRisk)) return 0;

   // In addition to a nominal 0.5% cap, restrict every entry to USD 50
   // from original capital. Never let accumulated stops eat the day buffer.
   double cashRisk=MathMin(InpOriginalAccountUSD*InpRiskPercent/100.0,
                           InpMaxOneEntrySLRiskUSD);
   double totalAvailable=MathMax(0,InpMaxBasketSLRiskUSD-already);
   double floorAvailable=MathMax(0,currentEQ-floor-already);
   cashRisk=MathMin(cashRisk,MathMin(totalAvailable,floorAvailable));
   if(cashRisk<=0) return 0;
   double preferred=InpFixedLot>0 ?
                    MathMin(InpFixedLot,cashRisk/worstLotRisk):
                    cashRisk/worstLotRisk;
   double step=m_symbol.LotsStep();
   double minLot=m_symbol.LotsMin();
   double maxLot=m_symbol.LotsMax();
   double contract=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_CONTRACT_SIZE);
   if(step<=0 || minLot<=0 || maxLot<minLot || contract<=0) return 0;
   double lot=NormalizeDouble(MathFloor(MathMin(preferred,maxLot)/step+1e-8)*step,8);
   // Never promote min lot when its calculated loss breaches limits.
   double used=TitanSyntheticMarginUsed();
   if(used==DBL_MAX) return 0;
   double freeMargin=AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   for(int n=0;n<1000 && lot>=minLot-1e-8;n++)
   {
      double planned=lot*worstLotRisk;
      double required=0;
      if(!OrderCalcMargin(kind,_Symbol,lot,entry,required)) return 0;
      double additionalSynthetic=entry*contract*lot/10.0;
      bool exposureOK=used+additionalSynthetic<=
                      currentEQ*InpMaxSyntheticMarginFraction;
      bool brokerMarginOK=required>0 &&
                          required<=freeMargin*(1.0-InpMinFreeMarginBufferPct/100.0);
      if(TitanRiskAllowed(currentEQ,floor,already,planned,
                          InpMaxBasketSLRiskUSD) &&
         planned<=InpMaxOneEntrySLRiskUSD && exposureOK && brokerMarginOK)
         return lot;
      lot=NormalizeDouble(lot-step,8);
   }
   return 0;
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

   double daily_dd_pct = m_challenge.DailyReference()>0 ?
      MathMax(0.0,(m_challenge.DailyReference()-equity)/InpOriginalAccountUSD*100.0):0.0;

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
   if(!m_challenge.Valid()) state_str="LOCKED / NO VERIFIED RISK DAY";
   if(m_target_reached)
      state_str = "CHALLENGE PHASE TARGET - LOCKED";
   else if(m_challenge.HardLocked())
      state_str = "HARD LOCK: STATIC FLOOR";
   else if(m_challenge.DailyLocked())
      state_str = "DAILY LOCK / UNKNOWN RESET";
   else if(!in_window)
      state_str = "Warten auf Handelsfenster (07:00-18:00 oder 22:00-02:00 DE)";

   string lot_display = (InpFixedLot > 0.0) ? StringFormat("Fix %.2f Lot", InpFixedLot) : StringFormat("%.2f%% Dynamisch", InpRiskPercent);

   string dash = "";
   dash += "========================================================\n";
   dash += "   PRIME TITAN M15 v1.00 | INDEPENDENT 10K RESEARCH  \n";
   dash += "========================================================\n";
   dash += StringFormat("Zeit:           Server %02d:%02d | DEUTSCHLAND %02d:%02d\n", dt.hour, dt.min, german_hour, dt.min);
   dash += StringFormat("Account Balance: $%.2f | Equity: $%.2f (P/L: %+.2f%%)\n", balance, equity, profit_pct);
   dash += StringFormat("Target Progress: %+.2f%% / %.1f%% (Blueberry Target)\n", profit_pct, InpPhaseProfitTargetPct);
   dash += StringFormat("Positionsgröße: %s | Max Positionen: %d\n", lot_display, InpMaxOpenPositions);
   dash += StringFormat("Daily DD: %.2f%% | daily floor $%.2f | $%.2f headroom\n",
                        daily_dd_pct,m_challenge.DailyFloor(),m_challenge.Headroom());
   dash += StringFormat("Static floor $%.2f | historical peak DD %.2f%% (non-fatal)\n",
                        m_challenge.StaticFloor(),total_dd_pct);
   dash += StringFormat("Reset (broker server) %02d:%02d | Lock %s | global SL budget $%.2f\n",
                        InpDailyResetHourServer,InpDailyResetMinuteServer,
                        m_challenge.Valid()?"CLEAR":"ACTIVE",InpMaxBasketSLRiskUSD);
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
