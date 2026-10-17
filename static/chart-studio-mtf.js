/* Deterministic, read-only multi-timeframe feature calculations. */
(()=>{
"use strict";
const SECONDS=Object.freeze({D1:86400,H4:14400,H1:3600,M15:900,M5:300});
const FRAMES=Object.freeze(Object.keys(SECONDS));
const WARMUP_BARS=250;
function isGoldSymbol(symbol){return typeof symbol==="string"&&/^XAUUSD(?:[._-][A-Z0-9]+)*$/i.test(symbol);}
function assertAsOf(value){if(!Number.isFinite(value)||value<=0)throw new TypeError("Invalid as-of timestamp");}
function validCandle(c){
 return c&&typeof c==="object"&&!Array.isArray(c)&&Number.isSafeInteger(c.time)&&c.time>0&&
  [c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&
  c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close,c.high);
}
function isWeekendGap(previous,next,tf,symbol){
 if(!isGoldSymbol(symbol))return false;
 const delta=next-previous,a=new Date(previous*1000),b=new Date(next*1000),day=a.getUTCDay();
 // XAU feeds close over the weekend. Without broker-session metadata we
 // tolerate only bounded, observed gold bar-open closures; other holes remain UNKNOWN.
 if(delta>(tf==="D1"?4*86400:60*3600))return false;
 if(tf==="D1")return day===4&&b.getUTCDay()===0&&delta>=60*3600&&delta<=84*3600;
 return day===5&&(b.getUTCDay()===0||b.getUTCDay()===1);
}
function isDailyMaintenanceGap(previous,next,tf,symbol){
 if(!isGoldSymbol(symbol)||!["H1","M15","M5"].includes(tf))return false;
 const a=new Date(previous*1000),b=new Date(next*1000),day=a.getUTCDay();
 if(day<1||day>4||a.getUTCFullYear()!==b.getUTCFullYear()||a.getUTCMonth()!==b.getUTCMonth()||a.getUTCDate()!==b.getUTCDate()||
    b.getUTCHours()!==22||b.getUTCMinutes()!==0||b.getUTCSeconds()!==0)return false;
 const previousClose={H1:[20,0],M15:[20,45],M5:[20,55]}[tf];
 return a.getUTCHours()===previousClose[0]&&a.getUTCMinutes()===previousClose[1]&&
  a.getUTCSeconds()===0&&next-previous<3*3600;
}
function frame(candles,tf,asOfUtc,symbol=""){
 if(!Object.hasOwn(SECONDS,tf))throw new TypeError("Invalid timeframe");assertAsOf(asOfUtc);
 if(!Array.isArray(candles))throw new TypeError("Invalid candles");
 let previous=0;
 for(const candle of candles){
  if(!validCandle(candle))throw new TypeError("Invalid candle shape");
  if(candle.time<=previous)throw new TypeError(candle.time===previous?"Duplicate candle time":"Candle order conflict");
  previous=candle.time;
 }
 const step=SECONDS[tf],closed=candles.filter(c=>c.time+step<=asOfUtc);
 const future=candles.some(c=>c.time+step>asOfUtc);
 const result={timeframe:tf,status:"INSUFFICIENT",bias:"UNKNOWN",reason:"WARMUP_INSUFFICIENT",source:"MT5_VERIFIED",
  sourceTime:null,lastClosedBarTime:null,asOfUtc,closedBars:closed.length,dataQuality:"OK",futureBarsExcluded:future,ema20:null,ema50:null,ema200:null};
 if(!closed.length&&future){result.status="UNKNOWN";result.reason="HISTORICAL_DATA_UNAVAILABLE";result.dataQuality="UNAVAILABLE";return result;}
 if(closed.length){
  result.lastClosedBarTime=closed[closed.length-1].time;result.sourceTime=result.lastClosedBarTime;
  let sessionHeuristic=false;
  for(let i=1;i<closed.length;i++){
   const delta=closed[i].time-closed[i-1].time;
   if(delta>step*1.5){
    if(isWeekendGap(closed[i-1].time,closed[i].time,tf,symbol)||isDailyMaintenanceGap(closed[i-1].time,closed[i].time,tf,symbol)){sessionHeuristic=true;continue;}
    result.status="UNKNOWN";result.reason="DATA_GAP";result.dataQuality="GAP";return result;
   }
  }
  if(sessionHeuristic)result.dataQuality="SESSION_HEURISTIC";
  // A live feed that has no recent closed source bar cannot be described as current.
  const maxAge=step*(tf==="D1"?4:3);
  if(asOfUtc-result.lastClosedBarTime>maxAge){result.status="UNKNOWN";result.reason="STALE_OR_MISSING_HISTORY";result.dataQuality="STALE";return result;}
 }
 if(closed.length<WARMUP_BARS)return result;
 const ema=(period)=>{
  const alpha=2/(period+1);let value=closed[0].close;
  for(let i=1;i<closed.length;i++)value+=alpha*(closed[i].close-value);
  return value;
 };
 result.ema20=ema(20);result.ema50=ema(50);result.ema200=ema(200);
 const close=closed[closed.length-1].close;
 result.bias=result.ema20>result.ema50&&result.ema50>result.ema200&&close>result.ema20?"UP":
  result.ema20<result.ema50&&result.ema50<result.ema200&&close<result.ema20?"DOWN":"NEUTRAL";
 result.status="READY";result.reason="CLOSED_BAR_EMA_ALIGNMENT";return result;
}
function calculate(input,asOfUtc,symbol=""){
 assertAsOf(asOfUtc);const frames={};let ready=0,coverage=0;
 for(const tf of FRAMES){
  if(!Array.isArray(input?.[tf]))frames[tf]={timeframe:tf,status:"UNAVAILABLE",bias:"UNKNOWN",reason:"SOURCE_UNAVAILABLE",source:"MT5_VERIFIED",sourceTime:null,lastClosedBarTime:null,asOfUtc,closedBars:0,dataQuality:"UNAVAILABLE"};
  else{coverage++;frames[tf]=frame(input[tf],tf,asOfUtc,symbol);}
  if(frames[tf].status==="READY")ready++;
 }
 const biases=FRAMES.map(tf=>frames[tf].bias);
 const agreement=ready!==FRAMES.length?"UNKNOWN":biases.every(x=>x===biases[0])?biases[0]:"MIXED_OR_UNKNOWN";
 return {schemaVersion:1,source:"MT5_VERIFIED",asOfUtc,coverage,ready,agreement,frames};
}
window.ChartStudioMTF=Object.freeze({SECONDS,FRAMES,WARMUP_BARS,frame,calculate});
})();
