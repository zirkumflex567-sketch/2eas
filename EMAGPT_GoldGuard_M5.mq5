//+------------------------------------------------------------------+
//| EMAGPT GoldGuard M5 - research Expert Advisor                    |
//| XAUUSD M5 EMA pullback + volume confirmation                     |
//| No profitability guarantee. Test broker real ticks before use.  |
//+------------------------------------------------------------------+
#property strict
#property version "1.10"
#property description "XAUUSD M5 trend pullback EA with conservative challenge risk guard"
#include <Trade/Trade.mqh>

input group "Account and challenge"
input double InpReferenceBalance=10000.0;       // Original challenge starting balance (USD)
input double InpDailyGuardPct=3.5;               // Daily equity loss guard
input double InpStaticGuardPct=8.0;              // Static loss vs original balance
input double InpEmergencyBufferUSD=25.0;        // Emergency close/entry safety buffer
input bool   InpAllowFirstPartialDay=false;     // False = wait for next broker day on first attach

input group "Execution and risk"
input long   InpMagic=26061013;
input double InpTradeRiskPct=0.25;               // Equity risk / trade, % (not lots)
input double InpMaxSyntheticMarginPct=55.0;     // Equity allocated to synthetic 1:10 margin
input double InpMaxActualMarginPct=65.0;        // Max fraction of broker free margin
input double InpMaxVolume=0.50;
input double InpMaxSpreadUSD=0.70;
input int    InpDeviationPoints=35;
input int    InpMaxTradesPerDay=3;
input int    InpMaxConsecutiveLosses=3;
input int    InpCooldownBars=6;

input group "Chart studio - auto visible indicators"
input bool   InpShowEMAs=true;                 // EMA 21/50/200 drawn on chart
input bool   InpShowTickVolume=true;          // Native tick volume histogram
input bool   InpShowADXWindow=false;          // Optional separate ADX pane
input bool   InpShowVolumeProfile=true;       // Approx tick volume by price
input int    InpVPBars=288;                   // Default approx one trading day
input int    InpVPBins=28;
input int    InpVPWidthBars=17;               // Horizontal chart-bar width
input int    InpVPRebuildEveryBars=6;
input bool   InpShowSupportResistance=true;
input bool   InpShowPreviousDayLevels=true;
input bool   InpShowSignals=true;
input bool   InpShowPositionZones=true;
input bool   InpShowRiskHUD=true;

input group "XAUUSD M5 setup"
input int    InpEMAFast=21;
input int    InpEMAMid=50;
input int    InpEMASlow=200;
input int    InpATRPeriod=14;
input int    InpADXPeriod=14;
input double InpMinADX=19.0;
input double InpVolumeFactor=1.00;
input double InpMinATRUSD=0.80;
input double InpMaxATRUSD=30.0;
input double InpStopATRMin=1.50;
input double InpStopATRMax=3.50;
input double InpRewardRisk=2.00;
input int    InpStartHourServer=7;
input int    InpEndHourServer=20;
input bool   InpAllowLong=true;
input bool   InpAllowShort=true;

CTrade trade;
int hFast=INVALID_HANDLE,hMid=INVALID_HANDLE,hSlow=INVALID_HANDLE;
int hATR=INVALID_HANDLE,hADX=INVALID_HANDLE,hVolumes=INVALID_HANDLE;
string visualPrefix="";
int visualBarCounter=0;
datetime lastBar=0;
string keyPrefix="";

string KV(const string suffix) { return keyPrefix+"."+suffix; }
double GV(const string suffix,const double fallback=0.0)
{
   string key=KV(suffix);
   return GlobalVariableCheck(key) ? GlobalVariableGet(key) : fallback;
}
void PutGV(const string suffix,const double value) { GlobalVariableSet(KV(suffix),value); }
datetime BrokerNow()
{
   datetime t=TimeTradeServer();
   if(t<=0) t=TimeCurrent();
   return t;
}
datetime StartOfDay(datetime t)
{
   return StringToTime(TimeToString(t,TIME_DATE));
}
bool EnsureDay()
{
   datetime day=StartOfDay(BrokerNow());
   if(day<=0) return false;
   bool exists=GlobalVariableCheck(KV("day"));
   if(!exists || (datetime)GV("day")!=day)
   {
      PutGV("day",(double)day);
      PutGV("base",MathMax(AccountInfoDouble(ACCOUNT_EQUITY),
                            AccountInfoDouble(ACCOUNT_BALANCE)));
      PutGV("daylock",0.0);
      // A first-day attach cannot reconstruct a historical midnight equity snapshot.
      PutGV("ready",exists || InpAllowFirstPartialDay ? 1.0 : 0.0);
      PrintFormat("Day reset: baseline=%.2f ready=%d (server day %s)",
                  GV("base"),(int)GV("ready"),TimeToString(day,TIME_DATE));
   }
   return true;
}
double StaticFloor() { return InpReferenceBalance*(1.0-InpStaticGuardPct/100.0); }
double DailyFloor()  { return GV("base")*(1.0-InpDailyGuardPct/100.0); }
void CloseOurPositions()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(!trade.PositionClose(ticket))
         PrintFormat("EMERGENCY close failed: %s, retcode=%u",
                     trade.ResultRetcodeDescription(),trade.ResultRetcode());
   }
}
bool SafetyGate(const bool emergency)
{
   if(!EnsureDay()) return false;
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double hard=StaticFloor(),daily=DailyFloor();
   if(eq<=hard+InpEmergencyBufferUSD)
   {
      PutGV("hardlock",1.0);
      if(emergency) CloseOurPositions();
   }
   if(eq<=daily+InpEmergencyBufferUSD)
   {
      PutGV("daylock",1.0);
      if(emergency) CloseOurPositions();
   }
   if(GV("hardlock")>0 || GV("daylock")>0) return false;
   return eq>hard+InpEmergencyBufferUSD && eq>daily+InpEmergencyBufferUSD;
}
bool NewM5Bar()
{
   datetime t=iTime(_Symbol,PERIOD_M5,0);
   if(t<=0 || t==lastBar) return false;
   lastBar=t;
   return true;
}
bool OurRecentTrades(int &entries,int &losses,int &lastEntryBarShift)
{
   entries=0;losses=0;lastEntryBarShift=100000;
   datetime day=StartOfDay(BrokerNow());
   if(!HistorySelect(day,BrokerNow())) return false;
   int n=HistoryDealsTotal();
   // Count all EA entry deals and consecutive net losing exit deals.
   bool countingStreak=true;
   for(int i=n-1;i>=0;i--)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0 || HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol ||
         HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_IN || entry==DEAL_ENTRY_INOUT)
      {
         entries++;
         if(lastEntryBarShift==100000)
         {
            datetime at=(datetime)HistoryDealGetInteger(deal,DEAL_TIME);
            lastEntryBarShift=iBarShift(_Symbol,PERIOD_M5,at,false);
         }
      }
      if((entry==DEAL_ENTRY_OUT || entry==DEAL_ENTRY_INOUT) && countingStreak)
      {
         double pnl=HistoryDealGetDouble(deal,DEAL_PROFIT)
                   +HistoryDealGetDouble(deal,DEAL_SWAP)
                   +HistoryDealGetDouble(deal,DEAL_COMMISSION)
                   +HistoryDealGetDouble(deal,DEAL_FEE);
         if(pnl<0) losses++;
         else if(pnl>0) countingStreak=false;
      }
   }
   return true;
}
double SnapPrice(const double p)
{
   double tick=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tick<=0) tick=_Point;
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   return NormalizeDouble(MathRound(p/tick)*tick,digits);
}
bool EntrySignal(int &direction,double &atr,double &swingStop)
{
   direction=0;atr=0;swingStop=0;
   MqlRates r[];
   ArraySetAsSeries(r,true);
   if(CopyRates(_Symbol,PERIOD_M5,0,230,r)<220) return false;
   double f[],m[],s[],a[],adx[],pdi[],mdi[];
   ArraySetAsSeries(f,true); ArraySetAsSeries(m,true); ArraySetAsSeries(s,true);
   ArraySetAsSeries(a,true); ArraySetAsSeries(adx,true);
   ArraySetAsSeries(pdi,true); ArraySetAsSeries(mdi,true);
   if(CopyBuffer(hFast,0,0,12,f)<12 || CopyBuffer(hMid,0,0,12,m)<12 ||
      CopyBuffer(hSlow,0,0,12,s)<12 || CopyBuffer(hATR,0,0,12,a)<12 ||
      CopyBuffer(hADX,0,0,12,adx)<12 || CopyBuffer(hADX,1,0,12,pdi)<12 ||
      CopyBuffer(hADX,2,0,12,mdi)<12) return false;
   atr=a[1];
   if(atr<InpMinATRUSD || atr>InpMaxATRUSD || adx[1]<InpMinADX) return true;
   double avgvol=0;
   for(int i=3;i<=22;i++) avgvol+=(double)r[i].tick_volume;
   avgvol/=20.0;
   if(avgvol<=0 || (double)r[1].tick_volume<avgvol*InpVolumeFactor) return true;
   double body=MathAbs(r[1].close-r[1].open);
   if(body<0.22*atr || MathAbs(r[1].close-f[1])>1.15*atr) return true;
   bool up=f[1]>m[1] && m[1]>s[1] && m[1]>m[8] && pdi[1]>mdi[1];
   bool down=f[1]<m[1] && m[1]<s[1] && m[1]<m[8] && mdi[1]>pdi[1];
   bool upPB=r[2].low<=f[2]+0.25*atr && r[2].close>=m[2]-0.25*atr;
   bool dnPB=r[2].high>=f[2]-0.25*atr && r[2].close<=m[2]+0.25*atr;
   if(InpAllowLong && up && upPB && r[1].close>r[2].high &&
      r[1].close>r[1].open && r[1].close>f[1])
   {
      direction=1;
      double lo=r[1].low;
      for(int j=2;j<=8;j++) lo=MathMin(lo,r[j].low);
      swingStop=lo-0.18*atr;
   }
   if(InpAllowShort && down && dnPB && r[1].close<r[2].low &&
      r[1].close<r[1].open && r[1].close<f[1])
   {
      direction=-1;
      double hi=r[1].high;
      for(int j=2;j<=8;j++) hi=MathMax(hi,r[j].high);
      swingStop=hi+0.18*atr;
   }
   return true;
}
double FitVolume(const int dir,const double entry,const double sl)
{
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double wanted=eq*InpTradeRiskPct/100.0;
   double oneLotPnl=0;
   ENUM_ORDER_TYPE typ=(dir>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   if(!OrderCalcProfit(typ,_Symbol,1.0,entry,sl,oneLotPnl) || oneLotPnl>=0) return 0;
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double minlot=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double maxlot=MathMin(InpMaxVolume,SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX));
   if(step<=0 || minlot<=0 || maxlot<minlot) return 0;
   double vol=MathMin(maxlot,wanted/(-oneLotPnl));
   vol=NormalizeDouble(MathFloor(vol/step+1e-9)*step,8);
   double contract=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_CONTRACT_SIZE);
   if(contract<=0) return 0;
   double free=AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   // Synthetic 1:10 exposure constraint even if broker's configured leverage is higher.
   for(int n=0;n<3000 && vol>=minlot-1e-8;n++)
   {
      double realMargin=0;
      if(!OrderCalcMargin(typ,_Symbol,vol,entry,realMargin)) return 0;
      double syntheticMargin=vol*contract*entry/10.0;
      double pnl=0;
      if(!OrderCalcProfit(typ,_Symbol,vol,entry,sl,pnl)) return 0;
      if(-pnl<=wanted+0.01 &&
         syntheticMargin<=eq*InpMaxSyntheticMarginPct/100.0 &&
         realMargin<=free*InpMaxActualMarginPct/100.0)
         return vol;
      vol=NormalizeDouble(vol-step,8);
   }
   return 0;
}
void TryEntry()
{
   if(!SafetyGate(false) || GV("ready")<0.5) return;
   if(PositionsTotal()>0 || OrdersTotal()>0) return; // Exclusive account for auditable limits
   if(AccountInfoDouble(ACCOUNT_BALANCE)<=0 || InpReferenceBalance<=0) return;
   MqlDateTime tm;
   TimeToStruct(BrokerNow(),tm);
   if(tm.hour<InpStartHourServer || tm.hour>=InpEndHourServer) return;
   int entries,losses,shift;
   if(!OurRecentTrades(entries,losses,shift)) return;
   if(entries>=InpMaxTradesPerDay || losses>=InpMaxConsecutiveLosses) return;
   if(shift>=0 && shift<InpCooldownBars) return;
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick) || tick.bid<=0 || tick.ask<=0) return;
   double spread=tick.ask-tick.bid;
   if(spread>InpMaxSpreadUSD) return;
   int dir;double atr,swing;
   if(!EntrySignal(dir,atr,swing) || dir==0) return;
   double entry=dir>0 ? tick.ask : tick.bid;
   double distance=MathMax(InpStopATRMin*atr,MathAbs(entry-swing));
   if(distance>InpStopATRMax*atr) return;
   double sl=SnapPrice(entry-dir*distance);
   double tp=SnapPrice(entry+dir*distance*InpRewardRisk);
   double actualStop=MathAbs(entry-sl);
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
   double ts=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(ts<=0) ts=_Point;
   if(actualStop<stops+2*ts || MathAbs(entry-tp)<stops+2*ts) return;
   if(dir>0 && (sl>=tick.bid-stops || tp<=tick.ask+stops)) return;
   if(dir<0 && (sl<=tick.ask+stops || tp>=tick.bid-stops)) return;
   double volume=FitVolume(dir,entry,sl);
   if(volume<=0) return;
   double lossAtSL=0;
   ENUM_ORDER_TYPE typ=(dir>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   if(!OrderCalcProfit(typ,_Symbol,volume,entry,sl,lossAtSL)) return;
   double expectedRisk=-lossAtSL;
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   // Reserve more than the planned SL loss: slippage and commission are not bounded.
   double worstBudget=expectedRisk*1.30 + InpEmergencyBufferUSD;
   if(eq-worstBudget<=DailyFloor() || eq-worstBudget<=StaticFloor()) return;
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviationPoints);
   trade.SetTypeFillingBySymbol(_Symbol);
   bool sent=(dir>0 ? trade.Buy(volume,_Symbol,0.0,sl,tp,"GoldGuard M5") :
                      trade.Sell(volume,_Symbol,0.0,sl,tp,"GoldGuard M5"));
   uint rc=trade.ResultRetcode();
   if(!sent || (rc!=TRADE_RETCODE_DONE && rc!=TRADE_RETCODE_DONE_PARTIAL))
      PrintFormat("Order rejected: %s (%u)",trade.ResultRetcodeDescription(),rc);
   else
      PrintFormat("ENTRY %s %.2f lot sl=%.2f tp=%.2f plannedLoss=%.2f",
                  (dir>0?"BUY":"SELL"),volume,sl,tp,expectedRisk);
}
// Visual helpers live at the bottom of this EA so installation needs no extra files.
bool VisualEnabled();
string VN(const string n);
void VisualProfile();
void VisualSR();
void VisualInit();
void VisualRefresh(const bool full);
void VisualHUD();
void VisualTradeMarkers();
void VisualSetupMarker(const int direction,const double atr);
void VisualDelete();
void VisualPositionZones();

bool IsPermittedDemoAccount()
{
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO)
      return false;
   long login=AccountInfoInteger(ACCOUNT_LOGIN);
   string server=AccountInfoString(ACCOUNT_SERVER);
   return (login==53087839 && server=="ICMarketsEU-Demo") ||
          (login==700194619 && server=="PUPrime-Demo") ||
          (login==700184986 && server=="PUPrime-Demo") ||
          (login==700194822 && server=="PUPrime-Demo") ||
          (login==53090070 && server=="ICMarketsEU-Demo");
}

int OnInit()
{
   if(!IsPermittedDemoAccount())
   {
      Print("GoldGuard refused account: only the five configured non-Blueberry demo identities are allowed.");
      return INIT_FAILED;
   }
   if(_Period!=PERIOD_M5 || StringFind(_Symbol,"XAUUSD")!=0)
   {
      Print("Attach only to broker XAUUSD* symbol on M5.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(AccountInfoString(ACCOUNT_CURRENCY)!="USD")
   {
      Print("USD account required for USD challenge floors and calculations.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(InpReferenceBalance<=0 || InpDailyGuardPct<=0 || InpDailyGuardPct>=10 ||
      InpStaticGuardPct<=0 || InpStaticGuardPct>=10 ||
      InpTradeRiskPct<=0 || InpTradeRiskPct>0.5 ||
      InpRewardRisk<=0 || InpStopATRMin<=0 || InpStopATRMax<InpStopATRMin ||
      InpStartHourServer<0 || InpEndHourServer>24 ||
      InpStartHourServer>=InpEndHourServer || InpMagic<=0 ||
      InpVPBins<12 || InpVPBins>60 || InpVPBars<60 || InpVPBars>700 ||
      InpVPWidthBars<1 || InpVPWidthBars>30 || InpVPRebuildEveryBars<1)
      return INIT_PARAMETERS_INCORRECT;
   keyPrefix=StringFormat("EG.%I64d.%I64d",AccountInfoInteger(ACCOUNT_LOGIN),InpMagic);
   // Each tester pass must be isolated. Live global variables intentionally persist.
   if(MQLInfoInteger(MQL_TESTER))
   {
      GlobalVariableDel(KV("day"));
      GlobalVariableDel(KV("base"));
      GlobalVariableDel(KV("ready"));
      GlobalVariableDel(KV("daylock"));
      GlobalVariableDel(KV("hardlock"));
   }
   hFast=iMA(_Symbol,PERIOD_M5,InpEMAFast,0,MODE_EMA,PRICE_CLOSE);
   hMid=iMA(_Symbol,PERIOD_M5,InpEMAMid,0,MODE_EMA,PRICE_CLOSE);
   hSlow=iMA(_Symbol,PERIOD_M5,InpEMASlow,0,MODE_EMA,PRICE_CLOSE);
   hATR=iATR(_Symbol,PERIOD_M5,InpATRPeriod);
   hADX=iADX(_Symbol,PERIOD_M5,InpADXPeriod);
   if(InpShowTickVolume) hVolumes=iVolumes(_Symbol,PERIOD_M5,VOLUME_TICK);
   if(hFast==INVALID_HANDLE || hMid==INVALID_HANDLE || hSlow==INVALID_HANDLE ||
      hATR==INVALID_HANDLE || hADX==INVALID_HANDLE ||
      (InpShowTickVolume && hVolumes==INVALID_HANDLE)) return INIT_FAILED;
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);
   lastBar=iTime(_Symbol,PERIOD_M5,0);
   visualPrefix=StringFormat("EMAGPT.%s.%I64d.",_Symbol,InpMagic);
   if(VisualEnabled())
   {
      VisualInit();
      EventSetTimer(2);
   }
   PrintFormat("GoldGuard started: reference=%.2f staticFloor=%.2f acctLeverage=1:%d",
               InpReferenceBalance,StaticFloor(),(int)AccountInfoInteger(ACCOUNT_LEVERAGE));
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
   EventKillTimer();
   VisualDelete();
   if(hFast!=INVALID_HANDLE) IndicatorRelease(hFast);
   if(hMid!=INVALID_HANDLE) IndicatorRelease(hMid);
   if(hSlow!=INVALID_HANDLE) IndicatorRelease(hSlow);
   if(hATR!=INVALID_HANDLE) IndicatorRelease(hATR);
   if(hADX!=INVALID_HANDLE) IndicatorRelease(hADX);
   if(hVolumes!=INVALID_HANDLE) IndicatorRelease(hVolumes);
}
void OnTick()
{
   SafetyGate(true);
   if(NewM5Bar())
   {
      int dir=0;
      double atr=0,swing=0;
      if(VisualEnabled() && InpShowSignals && EntrySignal(dir,atr,swing) && dir!=0)
         VisualSetupMarker(dir,atr);
      TryEntry();
      ++visualBarCounter;
      VisualRefresh(visualBarCounter%(int)MathMax(1,InpVPRebuildEveryBars)==0);
   }
}
void OnChartEvent(const int id,const long &lparam,const double &dparam,
                  const string &sparam)
{
   if(id==CHARTEVENT_CHART_CHANGE && VisualEnabled() && InpShowVolumeProfile)
   {
      VisualProfile(); // responsive to zoom and chart width
      ChartRedraw(0);
   }
}
void OnTimer()
{
   SafetyGate(true);
   VisualHUD();
   if(!VisualEnabled()) return;
   if(InpShowPositionZones) VisualPositionZones();
   // History is often still loading immediately after EA attach.
   if(InpShowVolumeProfile && ObjectFind(0,VN("VP.POC"))<0) VisualProfile();
   if(InpShowSupportResistance && ObjectFind(0,VN("SR.S0"))<0 &&
      ObjectFind(0,VN("SR.R0"))<0) VisualSR();
}
double OnTester()
{
   // Reject over-risk optimization passes. Actual compliance must be checked in tester equity curve.
   double dd=TesterStatistics(STAT_EQUITY_DDREL_PERCENT);
   double profit=TesterStatistics(STAT_PROFIT);
   double trades=TesterStatistics(STAT_TRADES);
   if(dd>InpStaticGuardPct || trades<30 || profit<=0) return -1.0;
   return profit/(1.0+dd*dd);
}
//+------------------------------------------------------------------+

// -------- MQL5 native chart visualizations (no external indicator required) ------
string VN(const string n) { return visualPrefix+n; }
void ObjStyle(const string name,const color c,const bool back=false)
{
   ObjectSetInteger(0,name,OBJPROP_COLOR,c);
   ObjectSetInteger(0,name,OBJPROP_BACK,back);
   ObjectSetInteger(0,name,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,name,OBJPROP_HIDDEN,true);
}
void HLevel(const string id,const double price,const color c,const ENUM_LINE_STYLE style,
            const int weight=1)
{
   if(price<=0) { ObjectDelete(0,VN(id)); return; }
   string n=VN(id);
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_HLINE,0,0,price);
   else ObjectMove(0,n,0,0,price);
   ObjStyle(n,c,true);
   ObjectSetInteger(0,n,OBJPROP_STYLE,style);
   ObjectSetInteger(0,n,OBJPROP_WIDTH,weight);
}
void TextAt(const string id,datetime at,double price,const string value,const color c,
            const int size=8)
{
   string n=VN(id);
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_TEXT,0,at,price);
   else ObjectMove(0,n,0,at,price);
   ObjectSetString(0,n,OBJPROP_TEXT,value);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetString(0,n,OBJPROP_FONT,"Arial");
   ObjStyle(n,c);
}
void LabelHUD(const string id,const string value,const int x,const int y,
              const color c,const int size=10)
{
   string n=VN(id);
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
   ObjectSetInteger(0,n,OBJPROP_ANCHOR,ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetString(0,n,OBJPROP_FONT,"Consolas");
   ObjectSetString(0,n,OBJPROP_TEXT,value);
   ObjStyle(n,c,false);
}
void RectangleAt(const string id,datetime t1,datetime t2,double p1,double p2,
                 const color c)
{
   string n=VN(id);
   if(t1>=t2 || p1>=p2) { ObjectDelete(0,n); return; }
   if(ObjectFind(0,n)<0) ObjectCreate(0,n,OBJ_RECTANGLE,0,t1,p1,t2,p2);
   else
   {
      ObjectMove(0,n,0,t1,p1);
      ObjectMove(0,n,1,t2,p2);
   }
   ObjectSetInteger(0,n,OBJPROP_FILL,true);
   ObjectSetInteger(0,n,OBJPROP_WIDTH,1);
   ObjStyle(n,c,true);
}
bool VisualEnabled()
{
   return !(MQLInfoInteger(MQL_TESTER) && !MQLInfoInteger(MQL_VISUAL_MODE));
}
void VisualInit()
{
   if(!VisualEnabled()) return;
   // Built-in EMAs remain real indicator plots: live, zoomable and visible in MT5.
   if(InpShowEMAs)
   {
      if(!ChartIndicatorAdd(0,0,hFast)) Print("Could not attach fast EMA: ",GetLastError());
      if(!ChartIndicatorAdd(0,0,hMid))  Print("Could not attach middle EMA: ",GetLastError());
      if(!ChartIndicatorAdd(0,0,hSlow)) Print("Could not attach slow EMA: ",GetLastError());
   }
   if(InpShowTickVolume && hVolumes!=INVALID_HANDLE)
   {
      int pane=(int)ChartGetInteger(0,CHART_WINDOWS_TOTAL);
      if(!ChartIndicatorAdd(0,pane,hVolumes))
         Print("Could not attach tick volume histogram: ",GetLastError());
   }
   if(InpShowADXWindow)
   {
      int pane=(int)ChartGetInteger(0,CHART_WINDOWS_TOTAL);
      if(!ChartIndicatorAdd(0,pane,hADX)) Print("Could not attach ADX: ",GetLastError());
   }
   // Reserve right-hand margin so histogram can be seen next to most recent candles.
   if(InpShowVolumeProfile)
   {
      ChartSetInteger(0,CHART_SHIFT,true);
      ChartSetDouble(0,CHART_SHIFT_SIZE,24.0);
   }
   ChartSetInteger(0,CHART_SHOW_TRADE_LEVELS,true);
   ChartSetInteger(0,CHART_SHOW_GRID,false);
   VisualRefresh(true);
   ChartRedraw(0);
}
void VisualProfile()
{
   if(!InpShowVolumeProfile) return;
   int count=MathMax(60,MathMin(700,InpVPBars));
   int bins=MathMax(12,MathMin(60,InpVPBins));
   MqlRates r[];
   ArraySetAsSeries(r,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,count,r);
   if(copied<60) return;
   double lo=DBL_MAX,hi=-DBL_MAX;
   for(int i=0;i<copied;i++)
   {
      lo=MathMin(lo,r[i].low);
      hi=MathMax(hi,r[i].high);
   }
   if(hi<=lo) return;
   double width=(hi-lo)/bins;
   double hist[];
   ArrayResize(hist,bins);
   ArrayInitialize(hist,0.0);
   // Uniformly distribute each candle's tick volume along its traded H-L range:
   // approximate volume-at-price, NOT true exchange volume or visible resting orders.
   for(int i=0;i<copied;i++)
   {
      double range=r[i].high-r[i].low;
      if(range<=0)
      {
         int idx=(int)MathFloor((r[i].close-lo)/width);
         idx=MathMax(0,MathMin(bins-1,idx));
         hist[idx]+=(double)r[i].tick_volume;
         continue;
      }
      int begin=MathMax(0,(int)MathFloor((r[i].low-lo)/width));
      int end=MathMin(bins-1,(int)MathFloor((r[i].high-lo)/width));
      for(int j=begin;j<=end;j++)
      {
         double overlap=MathMax(0.0,MathMin(r[i].high,lo+(j+1)*width)
                                              -MathMax(r[i].low,lo+j*width));
         hist[j]+=(double)r[i].tick_volume*overlap/range;
      }
   }
   double total=0,maxVol=0;
   int poc=0;
   for(int j=0;j<bins;j++)
   {
      total+=hist[j];
      if(hist[j]>maxVol) { maxVol=hist[j]; poc=j; }
   }
   if(maxVol<=0) return;
   int left=poc,right=poc;
   double aggregate=hist[poc];
   while(aggregate<0.7*total && (left>0 || right<bins-1))
   {
      double l=(left>0 ? hist[left-1] : -1.0);
      double rr=(right<bins-1 ? hist[right+1] : -1.0);
      if(l>=rr && left>0) aggregate+=hist[--left];
      else if(right<bins-1) aggregate+=hist[++right];
      else aggregate+=hist[--left];
   }
   int sec=PeriodSeconds(PERIOD_M5);
   datetime t0=iTime(_Symbol,PERIOD_M5,0)+(datetime)(sec*2);
   for(int j=0;j<bins;j++)
   {
      string id=StringFormat("VP.B%02d",j);
      // Fit within the right-margin indent even after chart zoom changes.
      int visible=(int)ChartGetInteger(0,CHART_VISIBLE_BARS);
      int maxWidth=MathMax(1,(int)MathMin(InpVPWidthBars,
                                MathFloor(MathMax(0,visible)*0.18)-2));
      int length=MathMax(1,(int)MathRound(maxWidth*hist[j]/maxVol));
      datetime tEnd=t0+(datetime)(sec*length);
      color c=(j==poc ? clrOrange : (j>=left && j<=right ? clrSteelBlue : clrDarkSlateGray));
      RectangleAt(id,t0,tEnd,lo+j*width,lo+(j+1)*width,c);
   }
   HLevel("VP.POC",lo+(poc+0.5)*width,clrOrange,STYLE_SOLID,2);
   HLevel("VP.VAH",lo+(right+1)*width,clrSlateGray,STYLE_DOT);
   HLevel("VP.VAL",lo+left*width,clrSlateGray,STYLE_DOT);
   TextAt("VP.T.POC",t0,lo+(poc+0.5)*width," POC",clrOrange);
   TextAt("VP.T.VAH",t0,lo+(right+1)*width," VAH 70%",clrSilver);
   TextAt("VP.T.VAL",t0,lo+left*width," VAL 70%",clrSilver);
}
void VisualSR()
{
   if(!InpShowSupportResistance) return;
   MqlRates r[];
   ArraySetAsSeries(r,true);
   if(CopyRates(_Symbol,PERIOD_M5,0,270,r)<245) return;
   double a[];
   ArraySetAsSeries(a,true);
   if(CopyBuffer(hATR,0,0,2,a)<2) return;
   double atr=a[1];
   if(atr<=0) return;
   double price=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double supports[3]={0,0,0};
   double resistances[3]={DBL_MAX,DBL_MAX,DBL_MAX};
   for(int i=3;i<240;i++)
   {
      bool pivotH=r[i].high>r[i-1].high && r[i].high>=r[i-2].high &&
                  r[i].high>r[i+1].high && r[i].high>=r[i+2].high;
      bool pivotL=r[i].low<r[i-1].low && r[i].low<=r[i-2].low &&
                  r[i].low<r[i+1].low && r[i].low<=r[i+2].low;
      if(pivotL && r[i].low<price-.3*atr)
      {
         double candidate=r[i].low;
         bool unique=true;
         for(int k=0;k<3;k++) if(MathAbs(supports[k]-candidate)<.7*atr) unique=false;
         if(unique)
         for(int k=0;k<3;k++)
            if(candidate>supports[k])
            {
               for(int j=2;j>k;j--) supports[j]=supports[j-1];
               supports[k]=candidate;
               break;
            }
      }
      if(pivotH && r[i].high>price+.3*atr)
      {
         double candidate=r[i].high;
         bool unique=true;
         for(int k=0;k<3;k++) if(MathAbs(resistances[k]-candidate)<.7*atr) unique=false;
         if(unique)
         for(int k=0;k<3;k++)
            if(candidate<resistances[k])
            {
               for(int j=2;j>k;j--) resistances[j]=resistances[j-1];
               resistances[k]=candidate;
               break;
            }
      }
   }
   datetime left=r[110].time;
   datetime right=r[0].time+(datetime)(PeriodSeconds(PERIOD_M5)*18);
   for(int k=0;k<3;k++)
   {
      string s=StringFormat("SR.S%d",k),rs=StringFormat("SR.R%d",k);
      if(supports[k]>0)
      {
         RectangleAt(s,left,right,supports[k]-.18*atr,supports[k]+.18*atr,clrDarkGreen);
         TextAt(s+".TEXT",right,supports[k],"S"+IntegerToString(k+1),clrMediumSeaGreen);
      }
      else {ObjectDelete(0,VN(s));ObjectDelete(0,VN(s+".TEXT"));}
      if(resistances[k]<DBL_MAX)
      {
         RectangleAt(rs,left,right,resistances[k]-.18*atr,resistances[k]+.18*atr,clrMaroon);
         TextAt(rs+".TEXT",right,resistances[k],"R"+IntegerToString(k+1),clrTomato);
      }
      else {ObjectDelete(0,VN(rs));ObjectDelete(0,VN(rs+".TEXT"));}
   }
   if(InpShowPreviousDayLevels)
   {
      HLevel("PDH",iHigh(_Symbol,PERIOD_D1,1),clrGoldenrod,STYLE_DASH);
      HLevel("PDL",iLow(_Symbol,PERIOD_D1,1),clrGoldenrod,STYLE_DASH);
      TextAt("PDH.T",right,iHigh(_Symbol,PERIOD_D1,1),"Prev Day H",clrGoldenrod);
      TextAt("PDL.T",right,iLow(_Symbol,PERIOD_D1,1),"Prev Day L",clrGoldenrod);
   }
}
void VisualTradeMarkers()
{
   if(!InpShowSignals) return;
   datetime from=BrokerNow()-14*86400;
   if(!HistorySelect(from,BrokerNow())) return;
   int plotted=0;
   for(int i=HistoryDealsTotal()-1;i>=0 && plotted<70;i--)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0 || HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic ||
         HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol ||
         HistoryDealGetInteger(deal,DEAL_ENTRY)!=DEAL_ENTRY_IN) continue;
      bool buy=HistoryDealGetInteger(deal,DEAL_TYPE)==DEAL_TYPE_BUY;
      string id=StringFormat("EXEC.%I64u",deal),name=VN(id);
      if(ObjectFind(0,name)<0)
      {
         datetime t=(datetime)HistoryDealGetInteger(deal,DEAL_TIME);
         double price=HistoryDealGetDouble(deal,DEAL_PRICE);
         if(!ObjectCreate(0,name,buy?OBJ_ARROW_BUY:OBJ_ARROW_SELL,0,t,price)) continue;
         ObjStyle(name,buy?clrLime:clrTomato);
         ObjectSetInteger(0,name,OBJPROP_WIDTH,2);
         ObjectSetString(0,name,OBJPROP_TOOLTIP,buy?"EMAGPT EXECUTED BUY":"EMAGPT EXECUTED SELL");
      }
      plotted++;
   }
}
void VisualSetupMarker(const int direction,const double atr)
{
   if(!VisualEnabled() || !InpShowSignals || direction==0) return;
   datetime t=iTime(_Symbol,PERIOD_M5,1);
   string n=VN("SETUP."+IntegerToString((int)t));
   if(ObjectFind(0,n)>=0) return;
   bool buy=direction>0;
   double price=buy ? iLow(_Symbol,PERIOD_M5,1)-.30*atr :
                       iHigh(_Symbol,PERIOD_M5,1)+.30*atr;
   if(!ObjectCreate(0,n,buy?OBJ_ARROW_UP:OBJ_ARROW_DOWN,0,t,price)) return;
   ObjStyle(n,clrGold);
   ObjectSetInteger(0,n,OBJPROP_WIDTH,1);
   ObjectSetString(0,n,OBJPROP_TOOLTIP,"Unconfirmed setup (not necessarily executed)");
}
void VisualPositionZones()
{
   if(!VisualEnabled() || !InpShowPositionZones) return;
   ulong ticket=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong x=PositionGetTicket(i);
      if(x>0 && PositionGetInteger(POSITION_MAGIC)==InpMagic &&
         PositionGetString(POSITION_SYMBOL)==_Symbol) {ticket=x;break;}
   }
   if(ticket==0)
   {
      ObjectDelete(0,VN("TRADE.ENTRY")); ObjectDelete(0,VN("TRADE.SL"));
      ObjectDelete(0,VN("TRADE.TP")); ObjectDelete(0,VN("TRADE.RISK"));
      ObjectDelete(0,VN("TRADE.REWARD"));
      ObjectDelete(0,VN("TRADE.INFO"));
      return;
   }
   double entry=PositionGetDouble(POSITION_PRICE_OPEN);
   double sl=PositionGetDouble(POSITION_SL);
   double tp=PositionGetDouble(POSITION_TP);
   double lots=PositionGetDouble(POSITION_VOLUME);
   datetime t1=iTime(_Symbol,PERIOD_M5,0);
   datetime t2=t1+(datetime)(PeriodSeconds(PERIOD_M5)*14);
   HLevel("TRADE.ENTRY",entry,clrWhite,STYLE_SOLID,2);
   HLevel("TRADE.SL",sl,clrTomato,STYLE_DASH,2);
   HLevel("TRADE.TP",tp,clrLimeGreen,STYLE_DASH,2);
   if(sl>0) RectangleAt("TRADE.RISK",t1,t2,MathMin(sl,entry),MathMax(sl,entry),clrMaroon);
   if(tp>0) RectangleAt("TRADE.REWARD",t1,t2,MathMin(tp,entry),MathMax(tp,entry),clrDarkGreen);
   double riskUSD=0,rewardUSD=0;
   ENUM_ORDER_TYPE typ=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
   bool riskKnown=sl>0 && OrderCalcProfit(typ,_Symbol,lots,entry,sl,riskUSD);
   bool rewardKnown=tp>0 && OrderCalcProfit(typ,_Symbol,lots,entry,tp,rewardUSD);
   string riskText=riskKnown ? StringFormat("SL %.0f USD",MathAbs(riskUSD)) : "SL n/a";
   string rewardText=rewardKnown ? StringFormat("TP +%.0f USD",rewardUSD) : "TP n/a";
   TextAt("TRADE.INFO",t2,entry,
          StringFormat(" LOT %.2f | %s | %s",lots,riskText,rewardText),clrWhite,9);
}
void VisualHUD()
{
   if(!VisualEnabled() || !InpShowRiskHUD) return;
   string bg=VN("HUD.BG");
   if(ObjectFind(0,bg)<0) ObjectCreate(0,bg,OBJ_RECTANGLE_LABEL,0,0,0);
   ObjectSetInteger(0,bg,OBJPROP_CORNER,CORNER_LEFT_UPPER);
   ObjectSetInteger(0,bg,OBJPROP_XDISTANCE,14);
   ObjectSetInteger(0,bg,OBJPROP_YDISTANCE,25);
   ObjectSetInteger(0,bg,OBJPROP_XSIZE,370);
   ObjectSetInteger(0,bg,OBJPROP_YSIZE,142);
   ObjectSetInteger(0,bg,OBJPROP_BGCOLOR,C'20,26,37');
   ObjectSetInteger(0,bg,OBJPROP_BORDER_TYPE,BORDER_FLAT);
   ObjStyle(bg,C'49,68,88',false);
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyLoss=MathMax(0.0,GV("base")-eq);
   double totalLoss=MathMax(0.0,InpReferenceBalance-eq);
   double a[],adx[],f[],m[],s[];
   ArraySetAsSeries(a,true); ArraySetAsSeries(adx,true);
   ArraySetAsSeries(f,true);ArraySetAsSeries(m,true);ArraySetAsSeries(s,true);
   bool ok=CopyBuffer(hATR,0,0,2,a)>=2 && CopyBuffer(hADX,0,0,2,adx)>=2 &&
           CopyBuffer(hFast,0,0,2,f)>=2 && CopyBuffer(hMid,0,0,2,m)>=2 &&
           CopyBuffer(hSlow,0,0,2,s)>=2;
   string mode=GV("hardlock")>0?"HARD LOCK":(GV("daylock")>0?"DAILY LOCK":
               (GV("ready")<.5?"DAY 1 WAIT":"MONITORING"));
   color mc=(mode=="MONITORING"?clrLimeGreen:clrOrangeRed);
   LabelHUD("HUD.TITLE","EMAGPT / GOLDGUARD    XAUUSD M5",27,34,clrDeepSkyBlue,11);
   LabelHUD("HUD.STATE","SYSTEM  "+mode,27,58,mc,10);
   LabelHUD("HUD.EQ",StringFormat("EQUITY   $%.2f   |  FLOOR $%.2f",eq,StaticFloor()),
            27,79,clrWhite,9);
   LabelHUD("HUD.DD",StringFormat("DAILY DD $%.2f / $%.2f    TOTAL $%.2f / $%.2f",
            dailyLoss,GV("base")*InpDailyGuardPct/100.0,totalLoss,
            InpReferenceBalance*InpStaticGuardPct/100.0),
            27,97,clrSilver,9);
   string trend="NO DATA";
   if(ok) trend=f[1]>m[1] && m[1]>s[1]?"BULLISH":
                (f[1]<m[1] && m[1]<s[1]?"BEARISH":"RANGE");
   LabelHUD("HUD.IND",StringFormat("TREND %s  |  ADX %.1f  |  ATR %.2f",
            trend,ok?adx[1]:0,ok?a[1]:0),27,115,clrSilver,9);
   LabelHUD("HUD.FOOT","VP = approximate tick volume, not order book",27,137,clrSlateGray,8);
}
void VisualRefresh(const bool full)
{
   if(!VisualEnabled()) return;
   VisualHUD();
   VisualPositionZones();
   if(full)
   {
      VisualProfile();
      VisualSR();
      VisualTradeMarkers();
      ChartRedraw(0);
   }
}
void VisualDelete()
{
   if(!VisualEnabled()) return;
   ObjectsDeleteAll(0,visualPrefix);
   ChartRedraw(0);
}
