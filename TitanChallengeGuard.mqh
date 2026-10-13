#ifndef TITAN_CHALLENGE_GUARD_MQH
#define TITAN_CHALLENGE_GUARD_MQH
// Strict internal 10k risk model. Broker-server reset hour MUST be calibrated to
// the prop firm's 17:00 New York trading-day reset, including DST changes.
// No account can be guaranteed compliant through gaps, disconnects or slippage.
double TitanStaticFloor(const double initial,const double percent)
{ return initial*(1.0-percent/100.0); }
double TitanDailyFloor(const double reference,const double initial,const double percent)
{ return reference-initial*percent/100.0; }
double TitanEffectiveFloor(const double static_floor,const double daily_floor,
                           const double safety)
{ return MathMax(static_floor,daily_floor)+safety; }
bool TitanRiskAllowed(const double equity,const double effective_floor,
                      const double open_sl_risk,const double new_sl_risk,
                      const double risk_limit)
{
   return MathIsValidNumber(equity) && MathIsValidNumber(open_sl_risk) &&
          MathIsValidNumber(new_sl_risk) && equity>effective_floor &&
          open_sl_risk>=0 && new_sl_risk>0 && risk_limit>0 &&
          open_sl_risk+new_sl_risk<=risk_limit+0.000001 &&
          equity-open_sl_risk-new_sl_risk>effective_floor;
}
datetime TitanRiskDay(const datetime server_now,const int hour,const int minute)
{
   // Server-local time, no UTC assumption. Handles normal midnight crossings.
   long shifted=(long)server_now-hour*3600-minute*60;
   return (datetime)(shifted-(shifted%86400)+hour*3600+minute*60);
}
class CTitanChallengeGuard
{
private:
   string prefix;
   double initial, daily_limit, total_limit, buffer;
   int reset_hour,reset_minute,capture_grace;
   datetime day_id;
   double day_ref;
   bool known,hard_lock,day_lock;
   string K(const string suffix){return prefix+"."+suffix;}
   bool HaveState()
   {
      return GlobalVariableCheck(K("day")) &&
             GlobalVariableCheck(K("reference")) &&
             GlobalVariableCheck(K("known")) &&
             GlobalVariableCheck(K("hard")) &&
             GlobalVariableCheck(K("daily"));
   }
   bool Save()
   {
      bool ok=GlobalVariableSet(K("known"),known?1.0:0.0)!=0;
      ok=GlobalVariableSet(K("reference"),day_ref)!=0 && ok;
      ok=GlobalVariableSet(K("hard"),hard_lock?1.0:0.0)!=0 && ok;
      ok=GlobalVariableSet(K("daily"),day_lock?1.0:0.0)!=0 && ok;
      // Day identifier is written LAST; crash before this fails closed.
      ok=GlobalVariableSet(K("day"),(double)day_id)!=0 && ok;
      GlobalVariablesFlush();
      return ok;
   }
public:
   CTitanChallengeGuard():initial(0),daily_limit(0),total_limit(0),
     buffer(0),reset_hour(0),reset_minute(0),capture_grace(120),
     day_id(0),day_ref(0),known(false),hard_lock(false),day_lock(true){}
   bool Init(const double start,const double daily_pct,const double static_pct,
             const double safety,const int server_hour,const int server_minute,
             const int grace,const bool tester_first_day)
   {
      if(start<=0 || daily_pct<=0 || static_pct<=0 || server_hour<0 ||
         server_hour>23 || server_minute<0 || server_minute>59 || grace<0 ||
         AccountInfoString(ACCOUNT_CURRENCY)!="USD") return false;
      initial=start;daily_limit=daily_pct;total_limit=static_pct;
      buffer=safety;reset_hour=server_hour;reset_minute=server_minute;
      capture_grace=grace;
      prefix=StringFormat("TITAN.RISK.%I64d",AccountInfoInteger(ACCOUNT_LOGIN));
      if(MQLInfoInteger(MQL_TESTER))
      {
         // Tester global variables could otherwise leak across optimization passes.
         string keys[]={"day","reference","known","hard","daily"};
         for(int i=0;i<ArraySize(keys);i++) GlobalVariableDel(K(keys[i]));
      }
      if(HaveState())
      {
         day_id=(datetime)GlobalVariableGet(K("day"));
         day_ref=GlobalVariableGet(K("reference"));
         known=GlobalVariableGet(K("known"))>=0.5;
         hard_lock=GlobalVariableGet(K("hard"))>=0.5;
         day_lock=GlobalVariableGet(K("daily"))>=0.5;
      }
      else
      {
         datetime now=TimeTradeServer();
         if(now<=0) now=TimeCurrent();
         datetime today=TitanRiskDay(now,reset_hour,reset_minute);
         bool can_capture=(now-today<=capture_grace);
         if(MQLInfoInteger(MQL_TESTER) && tester_first_day) can_capture=true;
         day_id=today;
         day_ref=can_capture?MathMax(AccountInfoDouble(ACCOUNT_BALANCE),
                                   AccountInfoDouble(ACCOUNT_EQUITY)):0.0;
         known=can_capture;
         day_lock=!known;
         hard_lock=false;
         if(!Save()) return false;
      }
      return true;
   }
   bool Observe(const datetime server_now,const bool tester_first_day)
   {
      if(server_now<=0) return false;
      datetime current=TitanRiskDay(server_now,reset_hour,reset_minute);
      double equity=AccountInfoDouble(ACCOUNT_EQUITY);
      double balance=AccountInfoDouble(ACCOUNT_BALANCE);
      if(equity<=0 || balance<=0 || !MathIsValidNumber(equity) ||
         !MathIsValidNumber(balance)) return false;
      if(current!=day_id)
      {
         // Avoid inventing the official reset snapshot after a long offline gap.
         bool valid=(server_now-current<=capture_grace);
         // Tester-only override is limited to the FIRST historical day by Init.
         day_id=current;
         day_ref=valid?MathMax(balance,equity):0;
         known=valid;
         day_lock=!valid;
         if(!Save()) return false;
      }
      bool modified=false;
      if(MathMin(equity,balance)<=StaticFloor()+buffer && !hard_lock)
      {hard_lock=true;modified=true;}
      if(known && MathMin(equity,balance)<=DailyFloor()+buffer && !day_lock)
      {day_lock=true;modified=true;}
      if(modified && !Save()) return false;
      return true;
   }
   double Initial(){return initial;}
   double StaticFloor(){return TitanStaticFloor(initial,total_limit);}
   double DailyFloor(){return known?TitanDailyFloor(day_ref,initial,daily_limit):DBL_MAX;}
   double SafeFloor(){return TitanEffectiveFloor(StaticFloor(),DailyFloor(),buffer);}
   double DailyReference(){return day_ref;}
   datetime DayId(){return day_id;}
   bool Valid(){return known && day_ref>0 && !hard_lock && !day_lock;}
   bool MustFlatten(){return hard_lock || day_lock;} // Unknown reset also liquidates: fail closed
   bool HardLocked(){return hard_lock;}
   bool DailyLocked(){return day_lock;}
   double Headroom()
   {
      return Valid()?MathMax(0.0,AccountInfoDouble(ACCOUNT_EQUITY)-SafeFloor()):0.0;
   }
};
#endif
