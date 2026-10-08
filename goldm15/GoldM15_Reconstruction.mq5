#property strict
#property version "1.22"
#property tester_file "GoldM15_USD_HighImpact.csv"
#property tester_file "GoldM15_USD_Holidays.csv"
#property description "Selectable signal timeframe: swing stops, RSI pullbacks and momentum exits. Not a 1:1 clone."
#include <Trade/Trade.mqh>
#include "GoldM15_Core.mqh"
#include "GoldM15_Risk.mqh"

input group "Signal-Zeitrahmen: automatisch oder fest"
input ENUM_TIMEFRAMES SignalTimeframe=PERIOD_CURRENT; // 0: Tester-/Chart-Zeitrahmen; otherwise fixed.
input group "Grundparameter"
input double Entry_Amount=0.01;
input bool Use_Swing_SL=true;
input long MagicBase=14733200;
input bool AllowLiveTrading=false; // Blocks new chart entries; protective exits remain active.
input int DeviationPoints=30;
input group "Kontoschutz: 10.000 USD, Prime mit strengeren Nutzerlimits"
input bool EnableRiskGuard=true; // Disabling is permitted ONLY in Strategy Tester.
input double InitialBalanceUSD=10000.0;
input double MinimumAccountUSD=9100.0;
input double DailyLossPercent=3.5;
input double HardReserveUSD=100.0;
input double DailyReserveUSD=75.0;
input double MaxPositionRiskUSD=75.0;
input double MaxAccountStopRiskUSD=275;
input double CostReservePerPositionUSD=2.0; // Commission, swap/slippage allowance; not an execution guarantee.
input int RiskResetHourServer=0; // Blueberry reset timezone must be confirmed before funded use.
input double VerifiedDayStartBaseUSD=0.0; // Only a verified higher balance/equity snapshot, never guessed.
input bool LiquidateWholeAccount=false; // Foreign-trade liquidation requires explicit opt-in.
input int MaxSpreadPoints=80;
input int RolloverPauseMinutes=10; // Flat own exposure before reset, entry pause after reset.
input bool UseNewsFilter=true; // Missing calendar blocks entries; tester needs separate news replay.
input bool UseHolidayFilter=true; // No own exposure on USD holiday days or unavailable calendar.
input int HolidayEveCloseHourServer=19; // Earlier only: holiday eves and Fridays after Thursday holidays.
input group "Belegte Swing-Mechanik"
input int SwingWidth=10;
input int SwingMaximumShift=60;
input double SwingBuffer=0.05; // Absolute quote distance, not broker points.
input group "Kandidat System 1: nicht identifizierte Originalsignale"
input int S1_FastRSI=2;
input int S1_BuyTrendRSI=70;
input int S1_SellTrendRSI=30;
input double S1_BuyTrend=45.0;
input double S1_SellTrend=55.0;
input double S1_BuyEntry=45.0;
input double S1_SellEntry=70.0;
input double S1_BuyExit=97.0;
input double S1_SellExit=35.0;
input double S1_FixedSL=28.0;
input int S1_ExitMode=1; // 0: RSI recovery; 1: completed-close percentage momentum.
input int S1_BuyMomentumPeriod=6;
input int S1_SellMomentumPeriod=5;
input double S1_BuyMomentumThreshold=0.2;
input double S1_SellMomentumThreshold=0.2;
input group "Kandidat System 2: nicht identifizierte Originalsignale"
input int S2_FastRSI=2;
input int S2_BuyTrendRSI=70;
input int S2_SellTrendRSI=30;
input double S2_BuyTrend=45.0;
input double S2_SellTrend=55.0;
input double S2_BuyEntry=45.0;
input double S2_SellEntry=70.0;
input double S2_BuyExit=97.0;
input double S2_SellExit=35.0;
input double S2_FixedSL=28.0;
input int S2_ExitMode=1;
input int S2_BuyMomentumPeriod=6;
input int S2_SellMomentumPeriod=5;
input double S2_BuyMomentumThreshold=0.2;
input double S2_SellMomentumThreshold=0.3;
input group "Kandidat System 3: nicht identifizierte Originalsignale"
input int S3_FastRSI=5;
input int S3_BuyTrendRSI=40;
input int S3_SellTrendRSI=20;
input double S3_BuyTrend=55.0;
input double S3_SellTrend=55.0;
input double S3_BuyEntry=35.0;
input double S3_SellEntry=55.0;
input double S3_BuyExit=60.0;
input double S3_SellExit=10.0;
input double S3_FixedSL=30.37;
input int S3_ExitMode=1;
input int S3_BuyMomentumPeriod=5;
input int S3_SellMomentumPeriod=8;
input double S3_BuyMomentumThreshold=0.7;
input double S3_SellMomentumThreshold=0.7;

struct SystemConfig
{
   int fast_period,buy_period,sell_period;
   double buy_trend,sell_trend,buy_entry,sell_entry,buy_exit,sell_exit,fixed_sl;
   int exit_mode,buy_momentum_period,sell_momentum_period;
   double buy_momentum_threshold,sell_momentum_threshold;
};
SystemConfig cfg[3];
int fast_handle[3],buy_handle[3],sell_handle[3];
bool pending_close[3];
int pending_open[3];
ulong accepted_order[3];
datetime last_attempt[3],last_bar=0;
double buy_swing=0.0,sell_swing=0.0;
CTrade trade;
GoldAccountGuard risk_guard;
bool risk_active=false;
double accepted_risk[3];
ENUM_TIMEFRAMES signal_timeframe=PERIOD_CURRENT;

void Configure(const int i,const int fast,const int buy_period,const int sell_period,
               const double buy_trend,const double sell_trend,const double buy_entry,const double sell_entry,
               const double buy_exit,const double sell_exit,const double fixed_sl,
               const int exit_mode=0,const int buy_momentum_period=3,const int sell_momentum_period=3,
               const double buy_momentum_threshold=0.5,const double sell_momentum_threshold=0.5)
{
   cfg[i].fast_period=fast; cfg[i].buy_period=buy_period; cfg[i].sell_period=sell_period;
   cfg[i].buy_trend=buy_trend; cfg[i].sell_trend=sell_trend;
   cfg[i].buy_entry=buy_entry; cfg[i].sell_entry=sell_entry;
   cfg[i].buy_exit=buy_exit; cfg[i].sell_exit=sell_exit; cfg[i].fixed_sl=fixed_sl;
   cfg[i].exit_mode=exit_mode; cfg[i].buy_momentum_period=buy_momentum_period;
   cfg[i].sell_momentum_period=sell_momentum_period; cfg[i].buy_momentum_threshold=buy_momentum_threshold;
   cfg[i].sell_momentum_threshold=sell_momentum_threshold;
}
bool ValidConfig(const SystemConfig &c)
{
   return c.fast_period>=2 && c.buy_period>=2 && c.sell_period>=2 && c.fixed_sl>0 &&
          c.buy_trend>=0 && c.buy_trend<=100 && c.sell_trend>=0 && c.sell_trend<=100 &&
          c.buy_entry>=0 && c.buy_entry<c.buy_exit && c.buy_exit<=100 &&
          c.sell_exit>=0 && c.sell_exit<c.sell_entry && c.sell_entry<=100 &&
          c.exit_mode>=0 && c.exit_mode<=1 && c.buy_momentum_period>=1 && c.sell_momentum_period>=1 &&
          c.buy_momentum_threshold>0 && c.sell_momentum_threshold>0;
}
int OnInit()
{
   ArrayInitialize(fast_handle,INVALID_HANDLE);
   ArrayInitialize(buy_handle,INVALID_HANDLE);
   ArrayInitialize(sell_handle,INVALID_HANDLE);
   signal_timeframe=GoldResolveSignalTimeframe(SignalTimeframe,Period());
   if(signal_timeframe==PERIOD_CURRENT)
   { Print("Invalid signal timeframe."); return INIT_PARAMETERS_INCORRECT; }
   if(StringFind(_Symbol,"XAUUSD")<0 || Entry_Amount<=0 || MagicBase<=0 || DeviationPoints<0 ||
      SwingWidth<1 || SwingMaximumShift<=SwingWidth || SwingBuffer<0) return INIT_PARAMETERS_INCORRECT;
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
   { Print("A hedging account is required to preserve independent positions."); return INIT_FAILED; }
   Configure(0,S1_FastRSI,S1_BuyTrendRSI,S1_SellTrendRSI,S1_BuyTrend,S1_SellTrend,S1_BuyEntry,S1_SellEntry,S1_BuyExit,S1_SellExit,S1_FixedSL,S1_ExitMode,S1_BuyMomentumPeriod,S1_SellMomentumPeriod,S1_BuyMomentumThreshold,S1_SellMomentumThreshold);
   Configure(1,S2_FastRSI,S2_BuyTrendRSI,S2_SellTrendRSI,S2_BuyTrend,S2_SellTrend,S2_BuyEntry,S2_SellEntry,S2_BuyExit,S2_SellExit,S2_FixedSL,S2_ExitMode,S2_BuyMomentumPeriod,S2_SellMomentumPeriod,S2_BuyMomentumThreshold,S2_SellMomentumThreshold);
   Configure(2,S3_FastRSI,S3_BuyTrendRSI,S3_SellTrendRSI,S3_BuyTrend,S3_SellTrend,S3_BuyEntry,S3_SellEntry,S3_BuyExit,S3_SellExit,S3_FixedSL,S3_ExitMode,S3_BuyMomentumPeriod,S3_SellMomentumPeriod,S3_BuyMomentumThreshold,S3_SellMomentumThreshold);
   if(GoldNormalizeLots(Entry_Amount,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP))<=0)
      return INIT_PARAMETERS_INCORRECT;
   for(int i=0;i<3;i++)
   {
      if(!ValidConfig(cfg[i])) return INIT_PARAMETERS_INCORRECT;
      fast_handle[i]=iRSI(_Symbol,signal_timeframe,cfg[i].fast_period,PRICE_CLOSE);
      buy_handle[i]=iRSI(_Symbol,signal_timeframe,cfg[i].buy_period,PRICE_CLOSE);
      sell_handle[i]=iRSI(_Symbol,signal_timeframe,cfg[i].sell_period,PRICE_CLOSE);
      if(fast_handle[i]==INVALID_HANDLE || buy_handle[i]==INVALID_HANDLE || sell_handle[i]==INVALID_HANDLE) return INIT_FAILED;
   }
   trade.SetAsyncMode(false);
   trade.SetDeviationInPoints((ulong)DeviationPoints);
   trade.SetTypeFillingBySymbol(_Symbol);
   if(!EnableRiskGuard && !MQLInfoInteger(MQL_TESTER)) return INIT_PARAMETERS_INCORRECT;
   if(EnableRiskGuard)
   {
      if(!risk_guard.Init(InitialBalanceUSD,MinimumAccountUSD,DailyLossPercent,HardReserveUSD,DailyReserveUSD,
         MaxPositionRiskUSD,MaxAccountStopRiskUSD,CostReservePerPositionUSD,RiskResetHourServer,MaxSpreadPoints,
         RolloverPauseMinutes,LiquidateWholeAccount,UseNewsFilter,VerifiedDayStartBaseUSD,UseHolidayFilter,HolidayEveCloseHourServer)) return INIT_FAILED;
      risk_active=true;
      if(!EventSetTimer(1)) return INIT_FAILED;
   }
   Print("CANDIDATE: stop mechanics reconstructed; entry/exit signals are unverified approximations.");
   PrintFormat("SIGNAL_TIMEFRAME input=%s effective=%s chart=%s",EnumToString(SignalTimeframe),EnumToString(signal_timeframe),EnumToString(Period()));
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   EventKillTimer();
   if(risk_active) risk_guard.Shutdown();
   for(int i=0;i<3;i++)
   {
      if(fast_handle[i]!=INVALID_HANDLE) IndicatorRelease(fast_handle[i]);
      if(buy_handle[i]!=INVALID_HANDLE) IndicatorRelease(buy_handle[i]);
      if(sell_handle[i]!=INVALID_HANDLE) IndicatorRelease(sell_handle[i]);
   }
}
int OwnExposureCount()
{
   int count=0;
   for(int i=0;i<PositionsTotal();i++)
      if(PositionGetTicket(i)>0 && PositionGetString(POSITION_SYMBOL)==_Symbol && GoldOwnMagic(PositionGetInteger(POSITION_MAGIC),MagicBase,3)) count++;
   for(int i=0;i<OrdersTotal();i++)
      if(OrderGetTicket(i)>0 && OrderGetString(ORDER_SYMBOL)==_Symbol && GoldOwnMagic(OrderGetInteger(ORDER_MAGIC),MagicBase,3)) count++;
   // Reserve accepted requests even if the terminal has not yet published them.
   for(int i=0;i<3;i++)
      if(accepted_order[i]>0 && !OrderSelect(accepted_order[i]) && SystemPosition(i)==0) count++;
   return count;
}
bool HasOwnPendingOrder(const int system)
{
   for(int i=0;i<OrdersTotal();i++)
      if(OrderGetTicket(i)>0 && OrderGetString(ORDER_SYMBOL)==_Symbol && OrderGetInteger(ORDER_MAGIC)==MagicBase+system+1) return true;
   return false;
}
bool RequestInFlight(const int system)
{
   if(HasOwnPendingOrder(system)) return true; // Also recovers outstanding orders after restart.
   ulong ticket=accepted_order[system];
   if(ticket==0) return false;
   if(HistoryOrderSelect(ticket))
   {
      ENUM_ORDER_STATE state=(ENUM_ORDER_STATE)HistoryOrderGetInteger(ticket,ORDER_STATE);
      if(state==ORDER_STATE_FILLED || state==ORDER_STATE_CANCELED || state==ORDER_STATE_REJECTED || state==ORDER_STATE_EXPIRED)
      { accepted_order[system]=0; accepted_risk[system]=0; }
   }
   return true; // Observe resulting positions on the next tick before submitting again.
}
ulong SystemPosition(const int system)
{
   for(int i=0;i<PositionsTotal();i++)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket>0 && PositionGetString(POSITION_SYMBOL)==_Symbol && PositionGetInteger(POSITION_MAGIC)==MagicBase+system+1) return ticket;
   }
   return 0;
}
bool RefreshSignals()
{
   double fast[3],buy_trend[3],sell_trend[3],value[1];
   for(int i=0;i<3;i++)
   {
      if(CopyBuffer(fast_handle[i],0,1,1,value)!=1) return false; fast[i]=value[0];
      if(CopyBuffer(buy_handle[i],0,1,1,value)!=1) return false; buy_trend[i]=value[0];
      if(CopyBuffer(sell_handle[i],0,1,1,value)!=1) return false; sell_trend[i]=value[0];
   }
   buy_swing=0; sell_swing=0;
   MqlRates rates[];
   int needed=Use_Swing_SL ? SwingMaximumShift+SwingWidth+1 : 0;
   for(int i=0;i<3;i++)
      if(cfg[i].exit_mode==1) needed=MathMax(needed,MathMax(cfg[i].buy_momentum_period,cfg[i].sell_momentum_period)+1);
   if(needed>0 && CopyRates(_Symbol,signal_timeframe,1,needed,rates)!=needed) return false;
   if(Use_Swing_SL)
   {
      double high[],low[];
      ArrayResize(high,needed); ArrayResize(low,needed);
      for(int i=0;i<needed;i++) { high[i]=rates[i].high; low[i]=rates[i].low; }
      buy_swing=GoldFractalStop(1,high,low,SwingWidth,SwingBuffer,SwingMaximumShift);
      sell_swing=GoldFractalStop(-1,high,low,SwingWidth,SwingBuffer,SwingMaximumShift);
   }
   for(int i=0;i<3;i++)
   {
      ulong ticket=SystemPosition(i);
      if(ticket>0)
      {
         int side=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
         bool exit=GoldRecoveryExit(side,fast[i],cfg[i].buy_exit,cfg[i].sell_exit);
         if(cfg[i].exit_mode==1)
         {
            int period=side==1 ? cfg[i].buy_momentum_period : cfg[i].sell_momentum_period;
            exit=GoldMomentumExit(side,rates[needed-1].close,rates[needed-1-period].close,
                                  cfg[i].buy_momentum_threshold,cfg[i].sell_momentum_threshold);
         }
         if(exit) pending_close[i]=true;
         pending_open[i]=0;
      }
      else
      {
         pending_close[i]=false;
         pending_open[i]=GoldPullbackSignal(fast[i],buy_trend[i],cfg[i].buy_entry,cfg[i].sell_entry,cfg[i].buy_trend,cfg[i].sell_trend,sell_trend[i]);
      }
   }
   return true;
}
void OnTick()
{
   bool entries_allowed=!risk_active || risk_guard.Service(trade,MagicBase);
   entries_allowed=entries_allowed && (MQLInfoInteger(MQL_TESTER) || AllowLiveTrading);
   datetime bar=iTime(_Symbol,signal_timeframe,0);
   if(bar<=0) return;
   if(bar!=last_bar)
   {
      if(RefreshSignals()) last_bar=bar;
      else ArrayInitialize(pending_open,0); // Existing closing intent remains serviceable.
   }
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<tick.bid) return;
   for(int i=0;i<3;i++)
   {
      if(RequestInFlight(i)) continue;
      if(last_attempt[i]>0 && TimeCurrent()-last_attempt[i]<5) continue;
      ulong ticket=SystemPosition(i);
      trade.SetExpertMagicNumber((ulong)(MagicBase+i+1));
      if(ticket>0)
      {
         pending_open[i]=0;
         if(!pending_close[i]) continue;
         last_attempt[i]=TimeCurrent();
         bool closed=trade.PositionClose(ticket);
         uint close_result=trade.ResultRetcode();
         if(closed && close_result==TRADE_RETCODE_PLACED) accepted_order[i]=trade.ResultOrder();
         if(!closed || !GoldAcceptedResult(close_result)) PrintFormat("Close %I64u: %u %s",ticket,close_result,trade.ResultRetcodeDescription());
         // Keep close intent until the position has actually disappeared (partial fills/rejections).
         continue;
      }
      pending_close[i]=false;
      int side=pending_open[i];
      if(side==0 || OwnExposureCount()>=3 || !entries_allowed) continue;
      if(risk_active && risk_guard.SubmissionPending()) continue;
      if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<tick.bid) continue;
      double stop=GoldSelectStop(side,tick.bid,tick.ask,side==1 ? buy_swing : sell_swing,cfg[i].fixed_sl,SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE));
      double reference=side==1 ? tick.bid : tick.ask;
      double minimum=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
      if(!GoldValidStop(side,reference,stop,minimum)) { pending_open[i]=0; continue; }
      double lots=GoldNormalizeLots(Entry_Amount,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP));
      if(lots<=0) { pending_open[i]=0; continue; }
      double reservation=0;
      for(int r=0;r<3;r++) if(accepted_order[r]>0) reservation+=accepted_risk[r];
      double execution=side==1 ? tick.ask : tick.bid;
      if(risk_active && !risk_guard.CanEnter(side,lots,execution,stop,reservation)) { pending_open[i]=0; continue; }
      if(risk_active && !risk_guard.BeginEntry()) { pending_open[i]=0; continue; }
      last_attempt[i]=TimeCurrent();
      string comment=StringFormat("Gold candidate S%d",i+1);
      bool sent=side==1 ? trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)
                       : trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment);
      uint result=trade.ResultRetcode();
      if(risk_active) risk_guard.EndEntry(result,trade.ResultOrder());
      if(sent && GoldAcceptedResult(result))
      {
         pending_open[i]=0;
         if(result==TRADE_RETCODE_PLACED || result==TRADE_RETCODE_DONE_PARTIAL)
         { accepted_order[i]=trade.ResultOrder(); accepted_risk[i]=MaxPositionRiskUSD; }
      }
      else PrintFormat("Open S%d: %u %s",i+1,result,trade.ResultRetcodeDescription());
   }
}
void OnTimer()
{
   if(risk_active) risk_guard.Service(trade,MagicBase);
}
double OnTester() { if(risk_active) risk_guard.Audit(); return AccountInfoDouble(ACCOUNT_BALANCE)-InitialBalanceUSD; }
