#ifndef GOLD_M15_CORE_MQH
#define GOLD_M15_CORE_MQH
ENUM_TIMEFRAMES GoldResolveSignalTimeframe(const ENUM_TIMEFRAMES requested,const ENUM_TIMEFRAMES chart)
{
   ENUM_TIMEFRAMES resolved=requested==PERIOD_CURRENT ? chart : requested;
   switch(resolved)
   {
      case PERIOD_M1: case PERIOD_M2: case PERIOD_M3: case PERIOD_M4: case PERIOD_M5:
      case PERIOD_M6: case PERIOD_M10: case PERIOD_M12: case PERIOD_M15: case PERIOD_M20: case PERIOD_M30:
      case PERIOD_H1: case PERIOD_H2: case PERIOD_H3: case PERIOD_H4: case PERIOD_H6: case PERIOD_H8: case PERIOD_H12:
      case PERIOD_D1: case PERIOD_W1: case PERIOD_MN1: return resolved;
   }
   return PERIOD_CURRENT; // Invalid/unresolved timeframe: caller must reject initialization.
}
// All arrays contain completed bars in chronological order (oldest first).
double GoldNormalizeLots(const double requested,const double minimum,const double maximum,const double step)
{
   if(!MathIsValidNumber(requested) || requested<minimum || requested>maximum ||
      minimum<=0.0 || maximum<minimum || step<=0.0) return 0.0;
   double volume=MathFloor(requested/step+1e-9)*step;
   if(volume<minimum-1e-9 || volume>maximum+1e-9) return 0.0;
   return NormalizeDouble(volume,8);
}
double GoldRangeStop(const int direction,const double &high[],const double &low[],const int lookback,const double buffer)
{
   int n=ArraySize(high);
   if((direction!=1 && direction!=-1) || lookback<1 || n<lookback || ArraySize(low)!=n || buffer<0.0) return 0.0;
   double stop=(direction==1 ? low[n-1] : high[n-1]);
   for(int i=n-lookback;i<n;i++)
   {
      if(!MathIsValidNumber(high[i]) || !MathIsValidNumber(low[i]) || low[i]<=0.0 || high[i]<low[i]) return 0.0;
      stop=(direction==1 ? MathMin(stop,low[i]) : MathMax(stop,high[i]));
   }
   return direction==1 ? stop-buffer : stop+buffer;
}
bool GoldValidStop(const int direction,const double entry,const double stop,const double minimum_distance)
{
   if(!MathIsValidNumber(entry) || !MathIsValidNumber(stop) || entry<=0.0 || stop<=0.0 || minimum_distance<0.0) return false;
   if(direction==1) return stop<entry && entry-stop>=minimum_distance;
   if(direction==-1) return stop>entry && stop-entry>=minimum_distance;
   return false;
}
bool GoldOwnMagic(const long magic,const long base,const int systems)
{
   return systems>0 && magic>base && magic-base<=systems;
}
double GoldFractalStop(const int direction,const double &high[],const double &low[],const int width,const double buffer,const int maximum_shift=60)
{
   int n=ArraySize(high);
   if((direction!=1 && direction!=-1) || width<1 || maximum_shift<=width || n<2*width+1 || ArraySize(low)!=n || buffer<0.0) return 0.0;
   int oldest=width;
   if(n-maximum_shift>oldest) oldest=n-maximum_shift;
   for(int i=n-1-width;i>=oldest;i--)
   {
      bool pivot=true;
      for(int k=1;k<=width;k++)
      {
         if(direction==1 && (low[i]>=low[i-k] || low[i]>=low[i+k])) { pivot=false; break; }
         if(direction==-1 && (high[i]<=high[i-k] || high[i]<=high[i+k])) { pivot=false; break; }
      }
      if(pivot) return direction==1 ? low[i]-buffer : high[i]+buffer;
   }
   return 0.0;
}
int GoldPullbackSignal(const double fast,const double slow,const double buy_entry,const double sell_entry,const double buy_trend,const double sell_trend,const double sell_slow=-1.0)
{
   if(!MathIsValidNumber(fast) || !MathIsValidNumber(slow) || fast<0.0 || fast>100.0 || slow<0.0 || slow>100.0) return 0;
   double sell_trend_value=sell_slow<0.0 ? slow : sell_slow;
   if(!MathIsValidNumber(sell_trend_value) || sell_trend_value>100.0) return 0;
   if(fast<=buy_entry && slow>=buy_trend) return 1;
   if(fast>=sell_entry && sell_trend_value<=sell_trend) return -1;
   return 0;
}
bool GoldRecoveryExit(const int direction,const double oscillator,const double buy_exit,const double sell_exit)
{
   if(!MathIsValidNumber(oscillator) || oscillator<0.0 || oscillator>100.0) return false;
   return (direction==1 && oscillator>=buy_exit) || (direction==-1 && oscillator<=sell_exit);
}
double GoldSelectStop(const int direction,const double bid,const double ask,const double swing,const double fixed_distance,const double tick_size)
{
   if((direction!=1 && direction!=-1) || bid<=0.0 || ask<bid || tick_size<=0.0 || fixed_distance<=0.0) return 0.0;
   double price=swing;
   if(price<=0.0) price=direction==1 ? bid-fixed_distance : ask+fixed_distance;
   if(direction==1) return MathFloor(price/tick_size+1e-9)*tick_size;
   return MathCeil(price/tick_size-1e-9)*tick_size;
}
bool GoldAcceptedResult(const uint result)
{
   return result==TRADE_RETCODE_PLACED || result==TRADE_RETCODE_DONE || result==TRADE_RETCODE_DONE_PARTIAL;
}
bool GoldMomentumExit(const int direction,const double completed_close,const double prior_close,
                      const double buy_threshold,const double sell_threshold)
{
   if((direction!=1 && direction!=-1) || !MathIsValidNumber(completed_close) ||
      !MathIsValidNumber(prior_close) || completed_close<=0 || prior_close<=0 ||
      !MathIsValidNumber(buy_threshold) || !MathIsValidNumber(sell_threshold) ||
      buy_threshold<=0 || sell_threshold<=0) return false;
   double momentum=100.0*(completed_close/prior_close-1.0);
   return direction==1 ? momentum+1e-10>=buy_threshold : momentum-1e-10<=-sell_threshold;
}
#endif
