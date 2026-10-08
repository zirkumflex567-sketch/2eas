#ifndef GOLD_M15_RISK_CORE
#define GOLD_M15_RISK_CORE
struct GoldCalendarCache
{
   datetime from,to,checked;
   bool valid;
   bool ObserveConnection(bool connected) { if(!connected) valid=false; return connected; }
   bool Covered(datetime now) { return valid && now>=from && now<to; }
   bool Fresh(datetime now,int max_age) { return Covered(now) && checked>0 && now>=checked && now-checked<=max_age; }
};
bool GoldFilledRiskAccounted(double filled,double visible,double closed)
{
   return MathIsValidNumber(filled) && MathIsValidNumber(visible) && MathIsValidNumber(closed) &&
          filled>0 && visible>=0 && closed>=0 && visible+closed+1e-9>=filled;
}
bool GoldResetKnown(datetime day,datetime now,datetime last_seen,bool last_flat,bool flat,double balance,double last_balance)
{
   return last_seen>0 && last_seen<=day && now>=day && now-day<=2 && day-last_seen<=2 &&
          last_flat && flat && MathIsValidNumber(balance) && MathAbs(balance-last_balance)<0.001;
}
double GoldDailyFloor(double initial,double base,double percent) { return base-initial*percent/100.0; }
double GoldProtectedFloor(double hard,double hard_buffer,double daily,double daily_buffer)
{ return MathMax(hard+hard_buffer,daily+daily_buffer); }
bool GoldBudget(double equity,double floor,double existing,double proposed,double single_max,double total_max)
{
   if(!MathIsValidNumber(equity) || !MathIsValidNumber(floor) || !MathIsValidNumber(existing) ||
      !MathIsValidNumber(proposed) || equity<=0 || floor<=0 || existing<0 || proposed<=0 ||
      single_max<=0 || total_max<=0) return false;
   return proposed<=single_max && existing+proposed<=total_max && equity-existing-proposed>floor;
}
bool GoldAccountBudget(double balance,double equity,double floor,double balance_risk,double equity_risk,
                       double reserved,double proposed,double single_max,double total_max)
{
   if(!MathIsValidNumber(reserved) || reserved<0 || balance_risk<0 || equity_risk<0) return false;
   return GoldBudget(balance,floor,balance_risk+reserved,proposed,single_max,total_max) &&
          GoldBudget(equity,floor,equity_risk+reserved,proposed,single_max,total_max);
}
double GoldBalanceStopLoss(double price_profit,double swap)
{ return MathMax(0,-(price_profit+MathMin(0,swap))); }
datetime GoldRiskDay(datetime now,int reset_hour)
{ long shifted=(long)now-reset_hour*3600; return (datetime)(shifted-shifted%86400+reset_hour*3600); }
struct GoldRiskState
{
   datetime day;
   double base;
   bool known,hard_lock,daily_lock;
   int reset_hour;
   void Observe(datetime next,double balance,double equity,bool reset_known,double hard,double hard_buffer,double initial,double percent,double daily_buffer)
   {
      if(next!=day) { day=next; known=reset_known; if(known) { daily_lock=false; base=MathMax(balance,equity); } }
      double value=MathMin(balance,equity);
      if(!MathIsValidNumber(value) || value<=hard+hard_buffer) hard_lock=true;
      if(known && value<=GoldDailyFloor(initial,base,percent)+daily_buffer) daily_lock=true;
   }
};
#endif
