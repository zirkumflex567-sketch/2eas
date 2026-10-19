/* Deterministic, read-only multi-timeframe feature calculations. */
(()=>{
"use strict";
const SECONDS=Object.freeze({D1:86400,H4:14400,H1:3600,M15:900,M5:300});
const FRAMES=Object.freeze(Object.keys(SECONDS));
const WARMUP_BARS=250;
const EMA_CALCULATION_VERSION="EMA20_50_200_FIRST_CLOSED_CLOSE_V1";
const RULE_STATUSES=Object.freeze(["ANY","UP","DOWN","NEUTRAL"]);
const SLOPE_STATUSES=Object.freeze(["ANY","RISING","FALLING","FLAT"]);
const PROFILE_KEYS_V1=Object.freeze(["schemaVersion","ruleVersion","revision","profileId","accountId","symbol","predicates","updatedAtUtc"]);
const PROFILE_KEYS_V2=Object.freeze([...PROFILE_KEYS_V1,"slopePredicates","slopeFlatThresholdPercent"]);
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
 if(tf==="D1")return delta<=4*86400&&day===4&&b.getUTCDay()===0&&delta>=60*3600&&delta<=84*3600;
 if(tf==="H4")return day===5&&b.getUTCDay()===0&&a.getUTCHours()===17&&a.getUTCMinutes()===0&&
  a.getUTCSeconds()===0&&b.getUTCHours()===21&&b.getUTCMinutes()===0&&b.getUTCSeconds()===0&&delta===52*3600;
 if(!["H1","M15","M5"].includes(tf)||day!==5||b.getUTCDay()!==0)return false;
 const fridayClose={H1:[20,0],M15:[20,45],M5:[20,55]}[tf];
 const sundayOpen=[22,0];
 return a.getUTCHours()===fridayClose[0]&&a.getUTCMinutes()===fridayClose[1]&&a.getUTCSeconds()===0&&
  b.getUTCHours()===sundayOpen[0]&&b.getUTCMinutes()===sundayOpen[1]&&b.getUTCSeconds()===0;
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
  sourceTime:null,lastClosedBarTime:null,asOfUtc,closedBars:closed.length,dataQuality:"OK",futureBarsExcluded:future,ema20:null,ema50:null,ema200:null,ema20SlopePercent:null};
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
 const ema=(period,end=closed.length)=>{
  const alpha=2/(period+1);let value=closed[0].close;
  for(let i=1;i<end;i++)value+=alpha*(closed[i].close-value);
  return value;
 };
 result.ema20=ema(20);result.ema50=ema(50);result.ema200=ema(200);
 const previousEma20=ema(20,closed.length-1);
 result.ema20SlopePercent=100*(result.ema20-previousEma20)/previousEma20;
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
 const firstTimes=FRAMES.map(tf=>{const bars=input?.[tf];if(!Array.isArray(bars))return null;const first=bars.find(c=>c.time+SECONDS[tf]<=asOfUtc);return first?first.time:null;}).filter(Number.isFinite);
 const windowStartUtc=firstTimes.length?Math.min(...firstTimes):asOfUtc;
 const provenanceFrames={};
 for(const tf of FRAMES){const r=frames[tf],bars=Array.isArray(input?.[tf])?input[tf]:[];
  const closed=bars.filter(c=>c.time+SECONDS[tf]<=asOfUtc);
  provenanceFrames[tf]={granularitySeconds:SECONDS[tf],firstInputBarTime:closed.length?closed[0].time:null,sourceTime:r.sourceTime,
   observedClosedBars:r.closedBars,requiredWarmupBars:WARMUP_BARS,emaSeedVersion:"FIRST_CLOSED_CLOSE_V1",
   emaCalculationVersion:EMA_CALCULATION_VERSION,closedSourceWindow:{startUtc:closed.length?closed[0].time:null,endUtc:closed.length?closed[closed.length-1].time:null},
   status:r.status,reason:r.reason,dataQuality:r.dataQuality};
 }
 const featureSnapshot={schemaVersion:1,decisionTimeUtc:asOfUtc,asOfUtc,ema20SlopeDefinition:"ONE_CLOSED_BAR_PERCENT_CHANGE_V1",firstClosedInputOpenUtc:windowStartUtc,
  decisionWindow:{startUtc:windowStartUtc,endUtc:asOfUtc,startInclusive:true,endExclusive:true},emaCalculationVersion:EMA_CALCULATION_VERSION,frames:provenanceFrames};
 return {schemaVersion:1,source:"MT5_VERIFIED",asOfUtc,coverage,ready,agreement,frames,featureSnapshot};
}
function isPlainObject(value){if(value===null||typeof value!=="object"||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);if(p===null)return true;return Object.getPrototypeOf(p)===null&&Object.hasOwn(p,"constructor")&&typeof p.constructor==="function"&&p.constructor.name==="Object"&&Object.hasOwn(p,"hasOwnProperty")&&Object.hasOwn(p,"toString");}
function exactKeys(value,keys,label){if(!isPlainObject(value))throw new TypeError(label+" must be a plain object");const actual=Object.keys(value).sort(),expected=[...keys].sort();if(actual.length!==expected.length||actual.some((k,i)=>k!==expected[i]))throw new TypeError(label+" has missing or extra keys");}
function validIsoUtc(value){if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))return false;const ms=Date.parse(value);if(!Number.isFinite(ms))return false;const normalized=value.includes(".")?value.replace(/\.(\d{1,3})Z$/,(_,digits)=>"."+digits.padEnd(3,"0")+"Z"):value.replace(/Z$/,".000Z");return new Date(ms).toISOString()===normalized;}
function validateRuleSet(profile){
 if(!isPlainObject(profile))throw new TypeError("Rule set must be a plain object");
 if(profile.schemaVersion===1)exactKeys(profile,PROFILE_KEYS_V1,"Rule set");
 else if(profile.schemaVersion===2)exactKeys(profile,PROFILE_KEYS_V2,"Rule set");
 else throw new TypeError("Invalid schema version");
 if(typeof profile.ruleVersion!=="string"||!new RegExp("^"+profile.schemaVersion+"\\.\\d+\\.\\d+$").test(profile.ruleVersion))throw new TypeError("Invalid rule version");
 if(!Number.isSafeInteger(profile.revision)||profile.revision<=0)throw new TypeError("Invalid revision");
 for(const key of ["profileId","accountId","symbol"])if(typeof profile[key]!=="string"||!profile[key].trim())throw new TypeError("Invalid "+key);
 exactKeys(profile.predicates,FRAMES,"Predicates");
 for(const tf of FRAMES)if(!RULE_STATUSES.includes(profile.predicates[tf]))throw new TypeError("Invalid predicate for "+tf);
 if(profile.schemaVersion===2){
  exactKeys(profile.slopePredicates,FRAMES,"Slope predicates");
  for(const tf of FRAMES)if(!SLOPE_STATUSES.includes(profile.slopePredicates[tf]))throw new TypeError("Invalid slope predicate for "+tf);
  if(!Number.isFinite(profile.slopeFlatThresholdPercent)||profile.slopeFlatThresholdPercent<0||profile.slopeFlatThresholdPercent>5)throw new TypeError("Invalid slope flat threshold");
 }
 if(!validIsoUtc(profile.updatedAtUtc))throw new TypeError("Invalid updatedAtUtc timestamp");
 return true;
}
function validateRuleSetTransition(current,candidate){
 validateRuleSet(current);validateRuleSet(candidate);
 if(candidate.profileId!==current.profileId||candidate.accountId!==current.accountId||candidate.symbol!==current.symbol)throw new TypeError("Rule set transition scope/profile mismatch");
 if(candidate.schemaVersion<current.schemaVersion)throw new TypeError("Rule set schema version cannot move backwards");
 if(candidate.revision<=current.revision)throw new TypeError("Revision must increase monotonically");
 return true;
}
function createRuleSet(args){
 if(!isPlainObject(args))throw new TypeError("Rule set arguments must be a plain object");
 if(args.revision!==1)throw new TypeError("Initial revision must be 1");
 const version2=args.slopePredicates!==undefined||args.slopeFlatThresholdPercent!==undefined;
 const profile=version2?{schemaVersion:2,ruleVersion:"2.0.0",revision:args.revision,profileId:args.profileId,accountId:args.accountId,symbol:args.symbol,predicates:args.predicates,
  slopePredicates:args.slopePredicates,slopeFlatThresholdPercent:args.slopeFlatThresholdPercent,updatedAtUtc:args.updatedAtUtc}:
  {schemaVersion:1,ruleVersion:"1.0.0",revision:args.revision,profileId:args.profileId,accountId:args.accountId,symbol:args.symbol,predicates:args.predicates,updatedAtUtc:args.updatedAtUtc};
 validateRuleSet(profile);return Object.freeze({...profile,predicates:Object.freeze({...profile.predicates}),...(version2?{slopePredicates:Object.freeze({...profile.slopePredicates})}:{})});
}
function evaluateRuleSet(profile,features,context){
 validateRuleSet(profile);exactKeys(context,["accountId","symbol","asOfUtc"],"Evaluation context");
 if(context.accountId!==profile.accountId)throw new TypeError("Account mismatch");if(context.symbol!==profile.symbol)throw new TypeError("Symbol mismatch");
 assertAsOf(context.asOfUtc);if(!isPlainObject(features)||!isPlainObject(features.frames))throw new TypeError("Invalid feature result");
 if(features.asOfUtc!==context.asOfUtc||!isPlainObject(features.featureSnapshot)||features.featureSnapshot.decisionTimeUtc!==context.asOfUtc)throw new TypeError("Evaluation as-of does not match feature decision as-of");
 const criteria={},slopeCriteria={};let required=0,unknown=0,contradicted=0,matched=0;
 for(const tf of FRAMES){const expected=profile.predicates[tf],frameResult=features.frames[tf];
  if(expected==="ANY")criteria[tf]={status:"NOT_REQUIRED",expected,actual:frameResult?.bias??"UNKNOWN",reason:null,sourceTime:frameResult?.sourceTime??null};
  else{
   required++;const ready=frameResult&&frameResult.status==="READY"&&["UP","DOWN","NEUTRAL"].includes(frameResult.bias);
   if(!ready){unknown++;criteria[tf]={status:"UNKNOWN",expected,actual:"UNKNOWN",reason:frameResult?.reason||"SOURCE_UNAVAILABLE",sourceTime:frameResult?.sourceTime??null};}
   else{const status=frameResult.bias===expected?"MATCH":frameResult.bias==="NEUTRAL"&&expected!=="NEUTRAL"?"PARTIAL":"CONTRADICTED";
    if(status==="MATCH")matched++;else if(status==="CONTRADICTED")contradicted++;
    criteria[tf]={status,expected,actual:frameResult.bias,reason:null,sourceTime:frameResult.sourceTime??null};}
  }
  const slopeExpected=profile.schemaVersion===2?profile.slopePredicates[tf]:"ANY",slope=frameResult?.ema20SlopePercent;
  if(slopeExpected==="ANY"){slopeCriteria[tf]={status:"NOT_REQUIRED",expected:slopeExpected,actual:Number.isFinite(slope)?slope:"UNKNOWN",classification:"NOT_REQUIRED",thresholdPercent:profile.schemaVersion===2?profile.slopeFlatThresholdPercent:0,reason:null,sourceTime:frameResult?.sourceTime??null};continue;}
  required++;const slopeReady=frameResult?.status==="READY"&&Number.isFinite(slope);
  if(!slopeReady){unknown++;const reason=frameResult?.status==="READY"?"EMA20_SLOPE_UNAVAILABLE":frameResult?.reason||"SOURCE_UNAVAILABLE";slopeCriteria[tf]={status:"UNKNOWN",expected:slopeExpected,actual:"UNKNOWN",classification:"UNKNOWN",thresholdPercent:profile.slopeFlatThresholdPercent,reason,sourceTime:frameResult?.sourceTime??null};continue;}
  const threshold=profile.slopeFlatThresholdPercent,actual=Math.abs(slope)<=threshold?"FLAT":slope>0?"RISING":"FALLING";
  const status=actual===slopeExpected?"MATCH":actual==="FLAT"&&slopeExpected!=="FLAT"?"PARTIAL":"CONTRADICTED";
  if(status==="MATCH")matched++;else if(status==="CONTRADICTED")contradicted++;
  slopeCriteria[tf]={status,expected:slopeExpected,actual:slope,classification:actual,thresholdPercent:threshold,reason:actual==="FLAT"?"WITHIN_FLAT_THRESHOLD":null,sourceTime:frameResult.sourceTime??null};
 }
 const aggregate=required===0?"UNCONFIGURED":unknown>0?"INCOMPLETE":contradicted>0?"CONTRADICTORY":matched===required?"SATISFIED":"PARTIAL";
 const snapshot=features.featureSnapshot||null;
 return {schemaVersion:profile.schemaVersion,profile:{...profile,predicates:{...profile.predicates},...(profile.schemaVersion===2?{slopePredicates:{...profile.slopePredicates}}:{})},revision:profile.revision,profileId:profile.profileId,ruleVersion:profile.ruleVersion,
  algorithmVersion:EMA_CALCULATION_VERSION,slopeAlgorithmVersion:"ONE_CLOSED_BAR_PERCENT_WITH_FLAT_THRESHOLD_V1",asOfUtc:context.asOfUtc,sourceTime:snapshot?.frames?Object.fromEntries(FRAMES.map(tf=>[tf,snapshot.frames[tf].sourceTime])):null,
  status:aggregate,criteria,slopeCriteria};
}
window.ChartStudioMTF=Object.freeze({SECONDS,FRAMES,WARMUP_BARS,frame,calculate,validateRuleSet,validateRuleSetTransition,createRuleSet,evaluateRuleSet});
})();
