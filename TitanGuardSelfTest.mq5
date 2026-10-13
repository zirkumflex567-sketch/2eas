// Standalone MetaEditor compile/runtime smoke test.
// Run as SCRIPT on USD demo account; it does NOT open any positions.
#property strict
#property script_show_inputs
#include "TitanChallengeGuard.mqh"
int fails=0;
void AssertClose(const string title,const double got,const double want)
{
   if(MathAbs(got-want)>0.00001)
   {
      fails++;
      PrintFormat("FAIL %s: %.5f != %.5f",title,got,want);
   }
   else PrintFormat("PASS %s: %.5f",title,got);
}
void AssertFlag(const string title,const bool got,const bool want)
{
   if(got!=want)
   {
      fails++;
      PrintFormat("FAIL %s: %s != %s",title,got?"true":"false",
                  want?"true":"false");
   }
   else PrintFormat("PASS %s",title);
}
void OnStart()
{
   AssertClose("Static never trails",TitanStaticFloor(10000,8.0),9200.0);
   AssertClose("New-account daily USD",TitanDailyFloor(10000,10000,3.5),9650.0);
   AssertClose("Grown account daily USD",TitanDailyFloor(16000,10000,3.5),15650.0);
   AssertClose("Protected execution floor",TitanEffectiveFloor(9200,9650,35),9685.0);
   AssertFlag("Basket safe",TitanRiskAllowed(10000,9685,30,45,150),true);
   AssertFlag("Basket over cap",TitanRiskAllowed(10000,9685,145,20,150),false);
   AssertFlag("Floor crossed",TitanRiskAllowed(9750,9685,30,40,150),false);
   datetime t=StringToTime("2026.10.13 22:01:00");
   datetime d=TitanRiskDay(t,22,0);
   AssertClose("Server reset stable",double(d),
                double(StringToTime("2026.10.13 22:00:00")));
   PrintFormat("TitanChallengeGuard TEST %s; failures=%d",
               fails==0?"PASS":"FAIL",fails);
}
