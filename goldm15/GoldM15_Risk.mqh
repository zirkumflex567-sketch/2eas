#ifndef GOLD_M15_RISK
#define GOLD_M15_RISK
#include <Trade/Trade.mqh>
#include "GoldM15_RiskCore.mqh"
#include "GoldM15_News.mqh"
bool GoldRequestStore(string key,long ticket)
{
   int f=FileOpen(key+".request",FILE_WRITE|FILE_BIN|FILE_COMMON); if(f==INVALID_HANDLE) return false;
   bool ok=FileWriteLong(f,ticket)==8; FileFlush(f); FileClose(f); return ok;
}
bool GoldRequestLoad(string key,long &ticket)
{
   int f=FileOpen(key+".request",FILE_READ|FILE_BIN|FILE_COMMON); if(f==INVALID_HANDLE) return false;
   if(FileSize(f)!=8) { FileClose(f); return false; }
   ticket=FileReadLong(f); FileClose(f); return ticket>=-1;
}
bool GoldAccountStopRisks(double &risk,double &balance_risk,double cost)
{
   risk=0; balance_risk=0;
   if(!MathIsValidNumber(cost) || cost<0) return false;
   for(int i=0;i<PositionsTotal();i++)
   {
      if(PositionGetTicket(i)==0) return false;
      string symbol=PositionGetString(POSITION_SYMBOL); MqlTick tick;
      double sl=PositionGetDouble(POSITION_SL),profit=0,balance_profit=0;
      double entry=PositionGetDouble(POSITION_PRICE_OPEN),volume=PositionGetDouble(POSITION_VOLUME),swap=PositionGetDouble(POSITION_SWAP);
      if(!MathIsValidNumber(sl) || !MathIsValidNumber(entry) || !MathIsValidNumber(volume) || !MathIsValidNumber(swap) || sl<=0 || entry<=0 || volume<=0 ||
         !SymbolInfoTick(symbol,tick) || !MathIsValidNumber(tick.bid) || !MathIsValidNumber(tick.ask) || tick.bid<=0 || tick.ask<tick.bid) return false;
      ENUM_ORDER_TYPE type=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(type==ORDER_TYPE_BUY ? sl>=tick.bid : sl<=tick.ask) return false; // Crossed stop must settle before new exposure.
      if(!OrderCalcProfit(type,symbol,volume,type==ORDER_TYPE_BUY ? tick.bid : tick.ask,sl,profit) || !MathIsValidNumber(profit) ||
         !OrderCalcProfit(type,symbol,volume,entry,sl,balance_profit) || !MathIsValidNumber(balance_profit)) return false;
      risk+=MathMax(0,-profit)+cost; // Equity already includes the current floating P/L.
      balance_risk+=GoldBalanceStopLoss(balance_profit,swap)+cost; // Balance lacks floating P/L and unbooked negative swap.
   }
   for(int i=0;i<OrdersTotal();i++)
   {
      if(OrderGetTicket(i)==0) return false;
      ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      bool buy=type==ORDER_TYPE_BUY_LIMIT || type==ORDER_TYPE_BUY_STOP || type==ORDER_TYPE_BUY_STOP_LIMIT;
      if(!buy && type!=ORDER_TYPE_SELL_LIMIT && type!=ORDER_TYPE_SELL_STOP && type!=ORDER_TYPE_SELL_STOP_LIMIT) return false;
      // Stop-limit execution prices need a separate model; reject instead of underestimating.
      if(type==ORDER_TYPE_BUY_STOP_LIMIT || type==ORDER_TYPE_SELL_STOP_LIMIT) return false;
      double sl=OrderGetDouble(ORDER_SL),entry=OrderGetDouble(ORDER_PRICE_OPEN),profit=0,volume=OrderGetDouble(ORDER_VOLUME_CURRENT);
      if(!MathIsValidNumber(sl) || !MathIsValidNumber(entry) || !MathIsValidNumber(volume) || sl<=0 || entry<=0 || volume<=0 || (buy ? sl>=entry : sl<=entry) ||
         !OrderCalcProfit(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,OrderGetString(ORDER_SYMBOL),volume,entry,sl,profit) || !MathIsValidNumber(profit)) return false;
      risk+=MathMax(0,-profit)+cost;
      balance_risk+=MathMax(0,-profit)+cost;
   }
   return MathIsValidNumber(risk) && MathIsValidNumber(balance_risk);
}
bool GoldAccountStopRisk(double &risk,double cost)
{ double balance_risk; return GoldAccountStopRisks(risk,balance_risk,cost); }
// Disk backup keeps a permanent hard lock even after terminal global variables expire.
bool GoldSaveRisk(string key,GoldRiskState &s)
{
   if(GlobalVariableCheck(key+".hard") && GlobalVariableGet(key+".hard")==1) s.hard_lock=true;
   if(s.hard_lock && GlobalVariableSet(key+".hard",1)==0) return false;
   if(s.hard_lock) GlobalVariablesFlush();
   int f=FileOpen(key+".state",FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(f==INVALID_HANDLE) return false;
   bool written=FileWriteInteger(f,121)==4;
   written=FileWriteLong(f,(long)s.day)==8 && written; written=FileWriteDouble(f,s.base)==8 && written;
   written=FileWriteInteger(f,s.known ? 1 : 0)==4 && written;
   written=FileWriteInteger(f,s.hard_lock ? 1 : 0)==4 && written;
   written=FileWriteInteger(f,s.daily_lock ? 1 : 0)==4 && written;
   written=FileWriteInteger(f,s.reset_hour)==4 && written;
   FileFlush(f); FileClose(f);
   if(!written) return false;
   bool ok=GlobalVariableSet(key+".day",0)!=0;
   ok=GlobalVariableSet(key+".base",s.base)!=0 && ok;
   ok=GlobalVariableSet(key+".known",s.known ? 1 : 0)!=0 && ok;
   ok=GlobalVariableSet(key+".hard",s.hard_lock ? 1 : 0)!=0 && ok;
   ok=GlobalVariableSet(key+".daily",s.daily_lock ? 1 : 0)!=0 && ok;
   GlobalVariablesFlush();
   ok=GlobalVariableSet(key+".day",(double)s.day)!=0 && ok; GlobalVariablesFlush();
   return ok;
}
bool GoldLoadRisk(string key,GoldRiskState &s)
{
   int f=FileOpen(key+".state",FILE_READ|FILE_BIN|FILE_COMMON);
   if(f==INVALID_HANDLE) return false;
   if(FileSize(f)!=36 || FileReadInteger(f)!=121) { FileClose(f); return false; }
   s.day=(datetime)FileReadLong(f); s.base=FileReadDouble(f);
   int known=FileReadInteger(f),hard=FileReadInteger(f),daily=FileReadInteger(f); s.reset_hour=FileReadInteger(f); FileClose(f);
   if(s.day<=0 || !MathIsValidNumber(s.base) || s.base<0 || s.reset_hour<0 || s.reset_hour>23 || known<0 || known>1 || hard<0 || hard>1 || daily<0 || daily>1 || (known==1 && s.base<=0)) return false;
   s.known=known==1; s.hard_lock=hard==1; s.daily_lock=daily==1;
   // Existing globals must agree. An interrupted/corrupt write fails closed.
   if(GlobalVariableCheck(key+".day") && (GlobalVariableGet(key+".day")!=s.day || GlobalVariableGet(key+".base")!=s.base ||
      GlobalVariableGet(key+".known")!=known || GlobalVariableGet(key+".daily")!=daily)) return false;
   if(GlobalVariableCheck(key+".hard") && GlobalVariableGet(key+".hard")==1) s.hard_lock=true;
   return true;
}
int GoldRestoreRisk(string key,int reset,GoldRiskState &s)
{
   bool exists=FileIsExist(key+".state",FILE_COMMON) || GlobalVariableCheck(key+".day");
   if(!exists) return 0;
   if(!GoldLoadRisk(key,s) || s.reset_hour!=reset) return -1;
   return 1;
}
bool GoldRequestSettled(ulong ticket)
{
   if(ticket==0 || !HistoryOrderSelect(ticket)) return false;
   ENUM_ORDER_STATE status=(ENUM_ORDER_STATE)HistoryOrderGetInteger(ticket,ORDER_STATE);
   if(status!=ORDER_STATE_FILLED && status!=ORDER_STATE_CANCELED && status!=ORDER_STATE_REJECTED && status!=ORDER_STATE_EXPIRED) return false;
   double initial_volume=HistoryOrderGetDouble(ticket,ORDER_VOLUME_INITIAL),remaining=HistoryOrderGetDouble(ticket,ORDER_VOLUME_CURRENT);
   if(initial_volume<=0 || remaining<0 || remaining>initial_volume) return false;
   double filled=status==ORDER_STATE_FILLED ? initial_volume : initial_volume-remaining;
   long id=HistoryOrderGetInteger(ticket,ORDER_POSITION_ID);
   if(id<=0) return status!=ORDER_STATE_FILLED && filled<=1e-9;
   double visible=0,closed=0,executed=0;
   for(int i=0;i<PositionsTotal();i++) if(PositionGetTicket(i)>0 && PositionGetInteger(POSITION_IDENTIFIER)==id) visible+=PositionGetDouble(POSITION_VOLUME);
   if(HistorySelectByPosition(id)) for(int i=0;i<HistoryDealsTotal();i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      ENUM_DEAL_ENTRY entry=(ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry==DEAL_ENTRY_IN) executed+=HistoryDealGetDouble(deal,DEAL_VOLUME);
      if(entry==DEAL_ENTRY_OUT || entry==DEAL_ENTRY_OUT_BY) closed+=HistoryDealGetDouble(deal,DEAL_VOLUME);
   }
   return GoldFilledRiskAccounted(MathMax(filled,executed),visible,closed);
}
void GoldCancelOrders(CTrade &closer,long magic,bool all)
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i); long m=OrderGetInteger(ORDER_MAGIC);
      if(ticket>0 && (all || (OrderGetString(ORDER_SYMBOL)==_Symbol && m>magic && m<=magic+3)))
         if(!closer.OrderDelete(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK cancel retry %I64u: %u",ticket,closer.ResultRetcode());
   }
}
void GoldLiquidate(CTrade &closer,long magic,bool all)
{
   GoldCancelOrders(closer,magic,all);
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i); long m=PositionGetInteger(POSITION_MAGIC);
      if(ticket>0 && (all || (PositionGetString(POSITION_SYMBOL)==_Symbol && m>magic && m<=magic+3)))
      {
         closer.SetTypeFillingBySymbol(PositionGetString(POSITION_SYMBOL));
         if(!closer.PositionClose(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat("RISK close retry %I64u: %u",ticket,closer.ResultRetcode());
      }
   }
}
class GoldAccountGuard
{
public:
   GoldRiskState state;
   double initial,hard,percent,hard_buffer,daily_buffer,single_max,total_max,cost;
   int reset_hour,spread_max,rollover_minutes,holiday_early_hour;
   bool all_scope,news_filter,holiday_filter,tester,persistence_ok;
   double min_equity,min_balance,max_daily_loss;
   long rejects,hard_breaches,daily_breaches,liquidations;
   long known_baseline_ticks,unknown_baseline_ticks,verified_resets,unverified_resets;
private:
   string key;
   int owner;
   datetime last_seen,last_save,last_liquidate,news_checked;
   double last_balance,last_equity;
   bool last_flat,news_ok;
   bool restored;
   long request_ticket;
   datetime news_from,news_to,news_times[];
   bool news_replay_valid;
   datetime holiday_from,holiday_to,holiday_times[],holiday_checked,holiday_checked_day;
   bool holiday_replay_valid,holiday_ok;
   GoldCalendarCache live_calendar;
public:
   bool Init(double initial_value,double hard_value,double daily_percent,double hard_reserve,double daily_reserve,
             double per_trade,double aggregate,double cost_value,int reset,int spread,int rollover,bool all,bool news,double manual_base,bool holidays=false,int early_hour=19)
   {
      initial=initial_value; hard=hard_value; percent=daily_percent; hard_buffer=hard_reserve; daily_buffer=daily_reserve;
      single_max=per_trade; total_max=aggregate; cost=cost_value; reset_hour=reset; spread_max=spread;
      rollover_minutes=rollover; all_scope=all; news_filter=news; tester=(bool)MQLInfoInteger(MQL_TESTER);
      holiday_filter=holidays;
      holiday_early_hour=early_hour;
      holiday_from=0; holiday_to=0; holiday_checked=0; holiday_checked_day=0;
      ArrayResize(holiday_times,0); holiday_replay_valid=false; holiday_ok=false;
      live_calendar.from=0; live_calendar.to=0; live_calendar.checked=0; live_calendar.valid=false;
      owner=INVALID_HANDLE; persistence_ok=true; restored=false;
      state.day=0; state.base=0; state.known=false; state.hard_lock=false; state.daily_lock=false;
      state.reset_hour=reset; request_ticket=-1;
      news_from=0; news_to=0; ArrayResize(news_times,0); news_replay_valid=false;
      last_seen=0; last_save=0; last_liquidate=0; news_checked=0; last_flat=false; news_ok=false;
      min_equity=DBL_MAX; min_balance=DBL_MAX; max_daily_loss=0; rejects=0; hard_breaches=0; daily_breaches=0; liquidations=0;
      known_baseline_ticks=0; unknown_baseline_ticks=0; verified_resets=0; unverified_resets=0;
      if(!MathIsValidNumber(initial) || !MathIsValidNumber(hard) || !MathIsValidNumber(percent) || !MathIsValidNumber(hard_buffer) ||
         !MathIsValidNumber(daily_buffer) || !MathIsValidNumber(single_max) || !MathIsValidNumber(total_max) || !MathIsValidNumber(cost) || !MathIsValidNumber(manual_base) ||
         AccountInfoString(ACCOUNT_CURRENCY)!="USD" || initial<=0 || hard<=0 || hard>=initial || percent<=0 || percent>3.5 ||
         hard<9100 || initial!=10000 || hard_buffer<0 || daily_buffer<0 || single_max<=cost || total_max<single_max || cost<0 ||
         reset<0 || reset>23 || spread<1 || rollover<2 || rollover>60 || early_hour<0 || early_hour>19) return false;
      // One active instance per account across terminals on this computer.
      uint hash=2166136261; string identity=AccountInfoString(ACCOUNT_SERVER)+":"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
      for(int i=0;i<StringLen(identity);i++) hash=(hash^StringGetCharacter(identity,i))*16777619;
      key="GoldM15Risk_"+IntegerToString(hash);
      if(!tester)
      {
         owner=FileOpen(key+".owner",FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);
         if(owner==INVALID_HANDLE) { Print("RISK: another account instance owns the common-file lock, or storage is unavailable."); return false; }
         int restore=GoldRestoreRisk(key,reset,state); restored=restore==1;
         if(restore<0) { persistence_ok=false; Print("RISK: inconsistent saved state or changed reset configuration; recovery required."); }
         if(FileIsExist(key+".request",FILE_COMMON) && !GoldRequestLoad(key,request_ticket)) persistence_ok=false;
         if(GlobalVariableCheck(key+".hard") && GlobalVariableGet(key+".hard")==1) state.hard_lock=true;
         last_seen=(datetime)GlobalVariableGet(key+".seen"); last_balance=GlobalVariableGet(key+".balance");
         last_equity=GlobalVariableGet(key+".equity"); last_flat=GlobalVariableGet(key+".flat")==1;
      }
      datetime now=TimeCurrent(),day=GoldRiskDay(now,reset_hour);
      if((state.day==0 || (state.day==day && !state.known)) && persistence_ok && manual_base>0)
      { state.day=day; state.base=MathMax(manual_base,MathMax(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY))); state.known=true; }
      // Tester starts with a known flat deposit; no inferred live midnight equity.
      if(tester) { state.day=day; state.base=AccountInfoDouble(ACCOUNT_BALANCE); state.known=true; }
      if(tester && news_filter)
      {
         news_replay_valid=GoldLoadNews("GoldM15_USD_HighImpact.csv",AccountInfoString(ACCOUNT_SERVER),news_from,news_to,news_times);
         if(!news_replay_valid) Print("RISK NEWS: historical calendar missing, invalid or for another broker; entries blocked.");
      }
      if(tester && holiday_filter)
      {
         holiday_replay_valid=GoldLoadNews("GoldM15_USD_Holidays.csv",AccountInfoString(ACCOUNT_SERVER),holiday_from,holiday_to,holiday_times);
         if(!holiday_replay_valid) Print("RISK HOLIDAY: historical calendar missing, invalid or for another broker; exposure blocked.");
      }
      if(state.day==0) state.day=day;
      if(!tester && !restored && manual_base<=0) Print("RISK: no verified daily start equity; entries blocked until a verified reset.");
      return true;
   }
   double Floor() { return GoldProtectedFloor(hard,hard_buffer,GoldDailyFloor(initial,state.base,percent),daily_buffer); }
   void Persist()
   {
      if(tester || !persistence_ok) return; // Never overwrite untrusted recovery evidence.
      if(!GoldSaveRisk(key,state)) persistence_ok=false;
      GlobalVariableSet(key+".seen",(double)last_seen); GlobalVariableSet(key+".balance",last_balance);
      GlobalVariableSet(key+".equity",last_equity); GlobalVariableSet(key+".flat",last_flat ? 1 : 0); GlobalVariablesFlush();
   }
   void Shutdown() { Persist(); if(owner!=INVALID_HANDLE) { FileClose(owner); owner=INVALID_HANDLE; } }
   bool Service(CTrade &closer,long magic)
   {
      datetime now=tester ? TimeCurrent() : TimeTradeServer(); if(now<=0) now=TimeCurrent();
      if(!tester) live_calendar.ObserveConnection((bool)TerminalInfoInteger(TERMINAL_CONNECTED));
      double balance=AccountInfoDouble(ACCOUNT_BALANCE),equity=AccountInfoDouble(ACCOUNT_EQUITY);
      datetime day=GoldRiskDay(now,reset_hour); bool change=day!=state.day;
      bool flat=PositionsTotal()==0 && OrdersTotal()==0;
      bool verified=false;
      if(change && last_seen>0)
      {
         verified=GoldResetKnown(day,now,last_seen,last_flat,flat,balance,last_balance) &&
                  request_ticket==-1 && (tester || TerminalInfoInteger(TERMINAL_CONNECTED));
      }
      // The isolated tester has no unobserved external trades. A flat, unchanged deposit/book
      // remains a known baseline across its quote gaps. This exception never runs on a chart.
      if(tester && change && flat && request_ticket==-1 && (last_flat || last_seen==0) &&
         MathAbs(balance-(last_seen>0 ? last_balance : state.base))<0.001) verified=true;
      if(change)
      {
         if(verified) verified_resets++;
         else
         {
            unverified_resets++;
            if(tester) PrintFormat("RESET_UNVERIFIED now=%s last=%s flat=%d previous_flat=%d request=%I64d balance=%.2f previous_balance=%.2f",
               TimeToString(now,TIME_DATE|TIME_SECONDS),TimeToString(last_seen,TIME_DATE|TIME_SECONDS),flat,last_flat,request_ticket,balance,last_balance);
         }
      }
      bool was_hard=state.hard_lock,was_daily=state.daily_lock;
      state.Observe(day,balance,equity,verified,hard,hard_buffer,initial,percent,daily_buffer);
      if(change && verified) state.base=MathMax(state.base,MathMax(last_balance,last_equity)); // Conservative boundary snapshot.
      // Recheck against the possibly higher conservative baseline.
      state.Observe(day,balance,equity,verified,hard,hard_buffer,initial,percent,daily_buffer);
      min_equity=MathMin(min_equity,equity); min_balance=MathMin(min_balance,balance);
      if(state.known) known_baseline_ticks++; else unknown_baseline_ticks++;
      if(state.known) { max_daily_loss=MathMax(max_daily_loss,MathMax(0,state.base-MathMin(balance,equity))); if(MathMin(balance,equity)<=GoldDailyFloor(initial,state.base,percent)) daily_breaches++; }
      if(MathMin(balance,equity)<=hard) hard_breaches++;
      last_seen=now; last_balance=balance; last_equity=equity; last_flat=flat;
      if(change || was_hard!=state.hard_lock || was_daily!=state.daily_lock || now-last_save>=5)
      { Persist(); last_save=now; }
      // Persist lock before liquidation; protection runs regardless of entry filters.
      bool rollover=(day+86400-now<=rollover_minutes*60);
      bool close=state.hard_lock || state.daily_lock || rollover || !state.known || !persistence_ok || !HolidayAllowed(now);
      if(close && now-last_liquidate>=2)
      { last_liquidate=now; if(!flat) liquidations++; GoldLiquidate(closer,magic,all_scope); }
      // Pending activation is also a new entry. Entry-only news veto must cancel eligible orders.
      if(news_filter && OrdersTotal()>0 && !NewsAllowed(now)) GoldCancelOrders(closer,magic,all_scope);
      if(request_ticket>0 && GoldRequestSettled((ulong)request_ticket))
      {
         request_ticket=-1; if(!tester && !GoldRequestStore(key,-1)) persistence_ok=false;
      }
      RefreshCalendarWhenFlat();
      return !close && state.known && persistence_ok;
   }
   void RefreshCalendarWhenFlat()
   {
      // Calendar I/O is permitted only without account exposure or unresolved
      // submissions. Protective servicing with open positions stays local.
      if(tester || (!news_filter && !holiday_filter) || PositionsTotal()>0 || OrdersTotal()>0 || request_ticket!=-1) return;
      datetime now=TimeTradeServer(); if(now<=0) now=TimeCurrent();
      // Keep the flat reset observation continuous instead of starting calendar
      // network I/O near the daily boundary.
      if(GoldRiskDay(now,reset_hour)+86400-now<=rollover_minutes*60) return;
      if(!live_calendar.ObserveConnection((bool)TerminalInfoInteger(TERMINAL_CONNECTED))) return;
      if(live_calendar.Fresh(now,15)) return;
      if(live_calendar.checked>0 && now>=live_calendar.checked && now-live_calendar.checked<15) return;
      live_calendar.checked=now; live_calendar.valid=false;
      datetime day=(datetime)((long)now-(long)now%86400);
      MqlCalendarValue values[]; ResetLastError();
      int n=CalendarValueHistory(values,day-86400,day+8*86400,NULL,"USD");
      if(n<=0 || GetLastError()!=0 || !TerminalInfoInteger(TERMINAL_CONNECTED)) return;
      datetime high[],holidays[]; int nh=0,nd=0;
      for(int i=0;i<n;i++)
      {
         // Prior/current/next-day holidays determine the conservative session pause.
         if(values[i].time<day-86400 || values[i].time>=day+2*86400) continue;
         MqlCalendarEvent event;
         if(!CalendarEventById(values[i].event_id,event)) return;
         if(event.importance==CALENDAR_IMPORTANCE_HIGH && values[i].time>=day-135 && values[i].time<day+86400+135)
         { if(ArrayResize(high,nh+1)!=nh+1) return; high[nh++]=values[i].time; }
         if(event.type==CALENDAR_TYPE_HOLIDAY) { if(ArrayResize(holidays,nd+1)!=nd+1) return; holidays[nd++]=values[i].time; }
      }
      if(!TerminalInfoInteger(TERMINAL_CONNECTED) || GoldRiskDay(TimeTradeServer(),0)!=day) return;
      ArraySort(high); ArraySort(holidays);
      if(!GoldReplaceCalendar(high,news_times) || !GoldReplaceCalendar(holidays,holiday_times)) return;
      live_calendar.from=day; live_calendar.to=day+86400; live_calendar.valid=true;
   }
   bool NewsAllowed(datetime now)
   {
      if(!news_filter) return true;
      if(tester) return news_replay_valid && now>=news_from && now<news_to && !GoldNewsBlocked(now,news_times,135);
      return live_calendar.ObserveConnection((bool)TerminalInfoInteger(TERMINAL_CONNECTED)) && live_calendar.Fresh(now,900) && !GoldNewsBlocked(now,news_times,135);
   }
   bool HolidayAllowed(datetime now)
   {
      if(!holiday_filter) return true;
      if(tester)
      {
         if(!holiday_replay_valid || now<holiday_from || now>=holiday_to || GoldHolidayBlocked(now,holiday_times)) return false;
         MqlDateTime clock; if(!TimeToStruct(now,clock)) return false;
         datetime day=(datetime)((long)now-(long)now%86400);
         // Late entry requires coverage of tomorrow's full day and, on Friday,
         // the preceding Thursday; missing neighboring data cannot imply safety.
         if(clock.hour>=holiday_early_hour && (day+2*86400>holiday_to || (clock.day_of_week==5 && day-86400<holiday_from))) return false;
         return !GoldHolidayEarlyPause(now,holiday_times,holiday_early_hour);
      }
      return live_calendar.ObserveConnection((bool)TerminalInfoInteger(TERMINAL_CONNECTED)) && live_calendar.Covered(now) &&
             !GoldHolidayBlocked(now,holiday_times) && !GoldHolidayEarlyPause(now,holiday_times,holiday_early_hour);
   }
   bool CanEnter(int side,double lots,double entry,double sl,double reserved)
   {
      datetime now=tester ? TimeCurrent() : TimeTradeServer(); if(now<=0) now=TimeCurrent();
      MqlTick tick; double book=0,balance_book=0,profit=0,margin=0;
      bool ok=state.known && state.day==GoldRiskDay(now,reset_hour) && persistence_ok && !state.hard_lock && !state.daily_lock && request_ticket==-1 &&
              (tester || (TerminalInfoInteger(TERMINAL_CONNECTED) && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && MQLInfoInteger(MQL_TRADE_ALLOWED))) &&
              now-GoldRiskDay(now,reset_hour)>=rollover_minutes*60 &&
              GoldRiskDay(now,reset_hour)+86400-now>rollover_minutes*60 &&
              NewsAllowed(now) && HolidayAllowed(now) && MathIsValidNumber(entry) && entry>0 && (side==1 || side==-1) &&
              SymbolInfoTick(_Symbol,tick) && tick.ask>=tick.bid && tick.bid>0 &&
              (tick.ask-tick.bid)/_Point<=spread_max &&
              (side==1 ? tick.bid-sl : sl-tick.ask)>SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point &&
              GoldAccountStopRisks(book,balance_book,cost) && reserved>=0 &&
              OrderCalcProfit(side==1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,_Symbol,lots,side==1 ? tick.ask : tick.bid,sl,profit) && profit<0 &&
              OrderCalcMargin(side==1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL,_Symbol,lots,side==1 ? tick.ask : tick.bid,margin) && AccountInfoDouble(ACCOUNT_MARGIN_FREE)-margin>100;
      if(ok) ok=GoldAccountBudget(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY),Floor(),balance_book,book,reserved,-profit+cost,single_max,total_max);
      if(!ok) rejects++;
      return ok;
   }
   bool BeginEntry()
   {
      if(request_ticket!=-1 || !persistence_ok) return false;
      request_ticket=0; // A crash before a confirmed result must block another entry.
      if(!tester && !GoldRequestStore(key,0)) { persistence_ok=false; return false; }
      return true;
   }
   bool SubmissionPending() { return request_ticket!=-1; }
   void EndEntry(uint result,ulong ticket)
   {
      request_ticket=(result==TRADE_RETCODE_PLACED || result==TRADE_RETCODE_DONE || result==TRADE_RETCODE_DONE_PARTIAL || result==TRADE_RETCODE_TIMEOUT || result==TRADE_RETCODE_CONNECTION) ? (long)ticket : -1;
      if(request_ticket<0 && ticket>(ulong)LONG_MAX) { request_ticket=0; persistence_ok=false; }
      // Retcode alone never frees a reservation: broker history and visible/closed
      // volume must prove that the account book already contains the full fill.
      if(request_ticket>0 && GoldRequestSettled((ulong)request_ticket)) request_ticket=-1;
      if(!tester && !GoldRequestStore(key,request_ticket)) persistence_ok=false;
   }
   void Audit()
   {
      PrintFormat("RISK_AUDIT {\"min_equity\":%.2f,\"min_balance\":%.2f,\"max_daily_loss\":%.2f,\"hard_breach_ticks\":%I64d,\"daily_breach_ticks\":%I64d,\"entry_rejections\":%I64d,\"liquidation_cycles\":%I64d,\"news_filter\":%s,\"reset_hour\":%d,\"news_replay\":%s,\"news_events\":%d,\"known_baseline_ticks\":%I64d,\"unknown_baseline_ticks\":%I64d,\"verified_resets\":%I64d,\"unverified_resets\":%I64d,\"close_before_reset\":true,\"holiday_filter\":%s,\"holiday_replay\":%s,\"holiday_events\":%d,\"holiday_eve_close_hour\":%d}",min_equity,min_balance,max_daily_loss,hard_breaches,daily_breaches,rejects,liquidations,news_filter ? "true" : "false",reset_hour,news_replay_valid ? "true" : "false",ArraySize(news_times),known_baseline_ticks,unknown_baseline_ticks,verified_resets,unverified_resets,holiday_filter ? "true" : "false",holiday_replay_valid ? "true" : "false",ArraySize(holiday_times),holiday_early_hour);
   }
};
#endif
