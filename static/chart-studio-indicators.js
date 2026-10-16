/* 2EAs Chart Studio — independent, read-only indicator calculation and pane adapter.
 * LWC v4 compatibility layer. Never reads MT5 credentials or places orders.
 * Incremental chart migration to v5 must replace only this adapter, not indicator math.
 */
(()=>{
"use strict";
const REGISTRY=Object.freeze({
 rsi:{name:"RSI (Wilder)",type:"oscillator",period:14,min:2,max:200},
 macd:{name:"MACD",type:"oscillator",fast:12,slow:26,signal:9},
 atr:{name:"ATR (Wilder)",type:"oscillator",period:14,min:2,max:200},
 volume:{name:"Volumen (Tick/Real)",type:"histogram",upColor:"#41cce9",downColor:"#f7758b"},
 adx:{name:"ADX +DI / −DI (Wilder)",type:"oscillator",period:14,min:2,max:200},
 stochastic:{name:"Stochastic %K/%D",type:"oscillator",period:14,smoothK:3,smoothD:3,min:2,max:200},
 stochrsi:{name:"StochRSI %K/%D",type:"oscillator",period:14,stochPeriod:14,smoothK:3,smoothD:3,min:2,max:200},
 supertrend:{name:"Supertrend",type:"overlay",period:10,multiplier:3,min:2,max:200},
 cci:{name:"Commodity Channel Index",type:"oscillator",period:20,min:2,max:200},
 momentum:{name:"Momentum",type:"oscillator",period:10,min:2,max:200},
 roc:{name:"Rate of Change (%)",type:"oscillator",period:10,min:2,max:200},
 sar:{name:"Parabolic SAR",type:"overlay",step:.02,maxStep:.2},
 obv:{name:"On-Balance Volume (Broker-Volumen)",type:"oscillator"},
 mfi:{name:"Money Flow Index (Volumenproxy)",type:"oscillator",period:14,min:2,max:200},
 donchian:{name:"Donchian-Kanal",type:"overlay",period:20,min:2,max:200},
 keltner:{name:"Keltner-Kanal",type:"overlay",period:20,atrPeriod:10,multiplier:2,min:2,max:200},
 atrBands:{name:"ATR Bands",type:"overlay",period:20,atrPeriod:14,multiplier:2,min:2,max:200},
 linearRegression:{name:"Linear Regression Channel",type:"overlay",period:20,multiplier:2,min:2,max:200},
 ichimoku:{name:"Ichimoku Cloud",type:"overlay",tenkanPeriod:9,kijunPeriod:26,senkouBPeriod:52,displacement:26,min:2,max:200},
 pivots:{name:"Pivot Points · MT5",type:"overlay",basis:"D1"},
 vwap:{name:"Session-VWAP (Volumenproxy)",type:"overlay",timeZone:"UTC",sessionStart:"00:00"}
});
const storagePrefix="2eas:studio:indicators:v1:";
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
function validateBars(input){
 if(!Array.isArray(input))return[];
 return input.filter(x=>x&&Number.isFinite(+x.time)&&Number.isFinite(+x.close) &&
 Number.isFinite(+x.high)&&Number.isFinite(+x.low)&&Number.isFinite(+x.open))
 .map(x=>({time:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,
 tick_volume:Math.max(0,finite(x.tick_volume)||0),real_volume:Math.max(0,finite(x.real_volume)||0)}))
 .sort((a,b)=>a.time-b.time).filter((x,i,arr)=>i===0||x.time!==arr[i-1].time);
}
function ema(values,period){
 const out=new Array(values.length).fill(null),factor=2/(period+1);let previous=null;
 for(let i=0;i<values.length;i++){
  const v=finite(values[i]);if(v===null)continue;
  previous=previous===null?v:previous+factor*(v-previous);
  if(i>=period-1)out[i]=previous;
 }
 return out;
}
function rsi(input,period=14){
 const bars=validateBars(input),out=[];period=Math.trunc(period);
 if(period<2||period>200||bars.length<=period)return out;
 let up=0,down=0;
 for(let i=1;i<=period;i++){const change=bars[i].close-bars[i-1].close;up+=Math.max(change,0);down+=Math.max(-change,0)}
 up/=period;down/=period;
 function value(g,l){if(g===0&&l===0)return 50;if(l===0)return 100;if(g===0)return 0;return 100-100/(1+g/l)}
 out.push({time:bars[period].time,value:value(up,down)});
 for(let i=period+1;i<bars.length;i++){
  const change=bars[i].close-bars[i-1].close;
  up=(up*(period-1)+Math.max(change,0))/period;
  down=(down*(period-1)+Math.max(-change,0))/period;
  out.push({time:bars[i].time,value:value(up,down)});
 }
 return out;
}
function stochastic(input,period=14,smoothK=3,smoothD=3){
 const bars=validateBars(input),stochK=[],stochD=[];
 period=Math.trunc(period);smoothK=Math.trunc(smoothK);smoothD=Math.trunc(smoothD);
 if(period<2||period>200||smoothK<1||smoothK>100||smoothD<1||smoothD>100)return {stochK,stochD};
 const raw=[];
 for(let i=period-1;i<bars.length;i++){
  let highest=-Infinity,lowest=Infinity;
  for(let j=i-period+1;j<=i;j++){highest=Math.max(highest,bars[j].high);lowest=Math.min(lowest,bars[j].low)}
  raw.push({time:bars[i].time,value:highest===lowest?50:100*(bars[i].close-lowest)/(highest-lowest)});
 }
 let sum=0;
 for(let i=0;i<raw.length;i++){
  sum+=raw[i].value;if(i>=smoothK)sum-=raw[i-smoothK].value;
  if(i>=smoothK-1)stochK.push({time:raw[i].time,value:sum/smoothK});
 }
 sum=0;
 for(let i=0;i<stochK.length;i++){
  sum+=stochK[i].value;if(i>=smoothD)sum-=stochK[i-smoothD].value;
  if(i>=smoothD-1)stochD.push({time:stochK[i].time,value:sum/smoothD});
 }
 return {stochK,stochD};
}
function stochRsi(input,period=14,stochPeriod=14,smoothK=3,smoothD=3){
 const bars=validateBars(input),stochRsiK=[],stochRsiD=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isInteger(stochPeriod)||stochPeriod<2||stochPeriod>200||
    !Number.isInteger(smoothK)||smoothK<1||smoothK>100||!Number.isInteger(smoothD)||smoothD<1||smoothD>100)return {stochRsiK,stochRsiD};
 const relative=rsi(bars,period),raw=[];
 for(let i=stochPeriod-1;i<relative.length;i++){
  let highest=-Infinity,lowest=Infinity;
  for(let j=i-stochPeriod+1;j<=i;j++){highest=Math.max(highest,relative[j].value);lowest=Math.min(lowest,relative[j].value)}
  raw.push({time:relative[i].time,value:highest===lowest?50:100*(relative[i].value-lowest)/(highest-lowest)});
 }
 let sum=0;
 for(let i=0;i<raw.length;i++){
  sum+=raw[i].value;if(i>=smoothK)sum-=raw[i-smoothK].value;
  if(i>=smoothK-1)stochRsiK.push({time:raw[i].time,value:sum/smoothK});
 }
 sum=0;
 for(let i=0;i<stochRsiK.length;i++){
  sum+=stochRsiK[i].value;if(i>=smoothD)sum-=stochRsiK[i-smoothD].value;
  if(i>=smoothD-1)stochRsiD.push({time:stochRsiK[i].time,value:sum/smoothD});
 }
 return {stochRsiK,stochRsiD};
}
function cci(input,period=20){
 const bars=validateBars(input),out=[];
 if(!Number.isInteger(period)||period<2||period>200)return out;
 for(let i=period-1;i<bars.length;i++){
  const typical=[];let sum=0;
  for(let j=i-period+1;j<=i;j++){const b=bars[j],value=(b.high+b.low+b.close)/3;typical.push(value);sum+=value}
  const mean=sum/period;let deviation=0;for(const value of typical)deviation+=Math.abs(value-mean);
  const current=typical[typical.length-1];out.push({time:bars[i].time,value:deviation===0?0:(current-mean)/(0.015*deviation/period)});
 }
 return out;
}
function momentum(input,period=10){
 const bars=validateBars(input),out=[];
 if(!Number.isInteger(period)||period<2||period>200)return out;
 for(let i=period;i<bars.length;i++)out.push({time:bars[i].time,value:bars[i].close-bars[i-period].close});
 return out;
}
function roc(input,period=10){
 const bars=validateBars(input),out=[];
 if(!Number.isInteger(period)||period<2||period>200)return out;
 for(let i=period;i<bars.length;i++){
  const reference=bars[i-period].close;
  if(reference===0)continue;
  out.push({time:bars[i].time,value:(bars[i].close/reference-1)*100});
 }
 return out;
}
function parabolicSar(input,step=.02,maxStep=.2){
 const bars=validateBars(input),out=[];
 const validAf=value=>Number.isFinite(value)&&value>=.01&&value<=.5&&Math.abs(value*100-Math.round(value*100))<1e-8;
 if(bars.length<2||!validAf(step)||!validAf(maxStep)||step>.1||maxStep<step)return out;
 let up=bars[1].close>=bars[0].close;
 let sar=up?Math.min(bars[0].low,bars[1].low):Math.max(bars[0].high,bars[1].high);
 let extreme=up?Math.max(bars[0].high,bars[1].high):Math.min(bars[0].low,bars[1].low);
 let acceleration=step;
 out.push({time:bars[1].time,value:sar,trend:up?"UP":"DOWN",color:up?"#41d89a":"#f47789"});
 for(let i=2;i<bars.length;i++){
  let projected=sar+acceleration*(extreme-sar);
  projected=up?Math.min(projected,bars[i-1].low,bars[i-2].low):Math.max(projected,bars[i-1].high,bars[i-2].high);
  const reversed=up?bars[i].low<=projected:bars[i].high>=projected;
  if(reversed){
   sar=extreme;up=!up;extreme=up?bars[i].high:bars[i].low;acceleration=step;
  }else{
   sar=projected;
   const extended=up?bars[i].high>extreme:bars[i].low<extreme;
   if(extended){extreme=up?bars[i].high:bars[i].low;acceleration=Math.min(maxStep,acceleration+step)}
  }
  out.push({time:bars[i].time,value:sar,trend:up?"UP":"DOWN",color:up?"#41d89a":"#f47789"});
 }
 return out;
}
function brokerVolume(bar){return bar.real_volume>0?bar.real_volume:bar.tick_volume}
function obv(input){
 const bars=validateBars(input),out=[];
 if(!bars.length)return out;
 let value=0;out.push({time:bars[0].time,value});
 for(let i=1;i<bars.length;i++){
  if(bars[i].close>bars[i-1].close)value+=brokerVolume(bars[i]);
  else if(bars[i].close<bars[i-1].close)value-=brokerVolume(bars[i]);
  out.push({time:bars[i].time,value});
 }
 return out;
}
function mfi(input,period=14){
 const bars=validateBars(input),out=[];
 if(!Number.isInteger(period)||period<2||period>200||bars.length<=period)return out;
 const positive=new Array(bars.length).fill(0),negative=new Array(bars.length).fill(0),volume=new Array(bars.length).fill(0);
 const typical=bar=>(bar.high+bar.low+bar.close)/3;
 for(let i=1;i<bars.length;i++){
  const flow=typical(bars[i])*brokerVolume(bars[i]),now=typical(bars[i]),before=typical(bars[i-1]);
  if(now>before)positive[i]=flow;else if(now<before)negative[i]=flow;
  volume[i]=brokerVolume(bars[i]);
 }
 for(let i=period;i<bars.length;i++){
  let pos=0,neg=0,totalVolume=0;
  for(let j=i-period+1;j<=i;j++){pos+=positive[j];neg+=negative[j];totalVolume+=volume[j]}
  if(totalVolume<=0)continue;
  out.push({time:bars[i].time,value:pos+neg===0?50:100*pos/(pos+neg)});
 }
 return out;
}
function trueRange(bars,i){const b=bars[i],previous=bars[i-1]?.close;
 return Math.max(b.high-b.low,
  previous===undefined?0:Math.abs(b.high-previous),
  previous===undefined?0:Math.abs(b.low-previous));}
function atr(input,period=14){
 const bars=validateBars(input),out=[];period=Math.trunc(period);
 if(period<2||period>200||bars.length<period)return out;
 let mean=0;for(let i=0;i<period;i++)mean+=trueRange(bars,i);
 mean/=period;out.push({time:bars[period-1].time,value:mean});
 for(let i=period;i<bars.length;i++){
  mean=(mean*(period-1)+trueRange(bars,i))/period;
  out.push({time:bars[i].time,value:mean});
 }
 return out;
}
function macd(input,fast=12,slow=26,signal=9){
 const bars=validateBars(input);fast=Math.trunc(fast);slow=Math.trunc(slow);signal=Math.trunc(signal);
 if(fast<2||slow<=fast||slow>300||signal<2||signal>200)return {macd:[],signal:[],histogram:[]};
 const values=bars.map(b=>b.close),f=ema(values,fast),sl=ema(values,slow);
 const out={macd:[],signal:[],histogram:[]};let smooth=null,ready=0;
 for(let i=0;i<bars.length;i++){
  if(f[i]===null||sl[i]===null)continue;
  const value=f[i]-sl[i];out.macd.push({time:bars[i].time,value});
  ready++;smooth=smooth===null?value:smooth+2/(signal+1)*(value-smooth);
  if(ready<signal)continue;
  out.signal.push({time:bars[i].time,value:smooth});
  out.histogram.push({time:bars[i].time,value:value-smooth,
    color:value>=smooth?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)"});
 }
 return out;
}
function volumes(input,settings={}){
 const validColor=value=>typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toLowerCase():null;
 const upColor=validColor(settings.upColor)||"#41cce9";
 const downColor=validColor(settings.downColor)||"#f7758b";
 return validateBars(input).map(b=>({time:b.time,value:b.real_volume>0?b.real_volume:b.tick_volume,
  color:b.close>=b.open?upColor:downColor,
  kind:b.real_volume>0?"real":"tick"}));
}
function adx(input,period=14){
 const bars=validateBars(input),out={adx:[],plusDi:[],minusDi:[]};
 period=Math.trunc(period);
 if(period<2||period>200||bars.length<=period)return out;
 const tr=[],pDM=[],mDM=[];
 for(let i=1;i<bars.length;i++){
  const a=bars[i],b=bars[i-1],up=a.high-b.high,down=b.low-a.low;
  tr[i]=trueRange(bars,i);pDM[i]=up>down&&up>0?up:0;
  mDM[i]=down>up&&down>0?down:0;
 }
 let trSum=0,pSum=0,mSum=0;
 for(let i=1;i<=period;i++){trSum+=tr[i];pSum+=pDM[i];mSum+=mDM[i]}
 const dxFirst=[];let average=null;
 for(let i=period;i<bars.length;i++){
  if(i>period){
   trSum=trSum-trSum/period+tr[i];
   pSum=pSum-pSum/period+pDM[i];
   mSum=mSum-mSum/period+mDM[i];
  }
  const pdi=trSum>0?100*pSum/trSum:0,mdi=trSum>0?100*mSum/trSum:0;
  const total=pdi+mdi,dx=total>0?100*Math.abs(pdi-mdi)/total:0;
  out.plusDi.push({time:bars[i].time,value:pdi});
  out.minusDi.push({time:bars[i].time,value:mdi});
  if(dxFirst.length<period){
   dxFirst.push(dx);
   if(dxFirst.length===period){
    average=dxFirst.reduce((acc,v)=>acc+v,0)/period;
    out.adx.push({time:bars[i].time,value:average});
   }
  }else{
   average=(average*(period-1)+dx)/period;
   out.adx.push({time:bars[i].time,value:average});
  }
 }
 return out;
}
function supertrend(input,period=10,multiplier=3){
 const bars=validateBars(input),out=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return out;
 const ranges=atr(bars,period);let previousUpper=null,previousLower=null,previousDirection=false;
 for(let offset=0;offset<ranges.length;offset++){
  const range=ranges[offset],i=period-1+offset;
  const bar=bars[i],mid=(bar.high+bar.low)/2,basicUpper=mid+multiplier*range.value,basicLower=mid-multiplier*range.value;
  const upper=previousUpper===null?basicUpper:basicUpper<previousUpper||bars[i-1].close>previousUpper?basicUpper:previousUpper;
  const lower=previousLower===null?basicLower:basicLower>previousLower||bars[i-1].close<previousLower?basicLower:previousLower;
  const direction=previousUpper===null?false:previousDirection?!(bar.close<lower):bar.close>upper;
  out.push({time:bar.time,value:direction?lower:upper,trend:direction?"UP":"DOWN",color:direction?"#41d89a":"#f47789"});
  previousUpper=upper;previousLower=lower;previousDirection=direction;
 }
 return out;
}
function donchian(input,period=20){
 const bars=validateBars(input),upper=[],middle=[],lower=[];
 if(!Number.isInteger(period)||period<2||period>200)return {upper,middle,lower};
 for(let i=period-1;i<bars.length;i++){
  let high=-Infinity,low=Infinity;
  for(let j=i-period+1;j<=i;j++){high=Math.max(high,bars[j].high);low=Math.min(low,bars[j].low)}
  const time=bars[i].time;upper.push({time,value:high});middle.push({time,value:(high+low)/2});lower.push({time,value:low});
 }
 return {upper,middle,lower};
}
function keltner(input,period=20,atrPeriod=10,multiplier=2){
 const bars=validateBars(input),upper=[],middle=[],lower=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isInteger(atrPeriod)||atrPeriod<2||atrPeriod>200||
  !Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return {upper,middle,lower};
 const means=ema(bars.map(bar=>bar.close),period),ranges=new Map(atr(bars,atrPeriod).map(point=>[point.time,point.value]));
 for(let i=0;i<bars.length;i++){
  const range=ranges.get(bars[i].time),mean=means[i];if(range===undefined||mean===null)continue;
  middle.push({time:bars[i].time,value:mean});upper.push({time:bars[i].time,value:mean+range*multiplier});lower.push({time:bars[i].time,value:mean-range*multiplier});
 }
 return {upper,middle,lower};
}
function atrBands(input,period=20,atrPeriod=14,multiplier=2){
 const bars=validateBars(input),upper=[],middle=[],lower=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isInteger(atrPeriod)||atrPeriod<2||atrPeriod>200||
  !Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return {upper,middle,lower};
 const ranges=new Map(atr(bars,atrPeriod).map(point=>[point.time,point]));let sum=0;
 for(let i=0;i<bars.length;i++){
  sum+=bars[i].close;if(i>=period)sum-=bars[i-period].close;
  if(i<period-1)continue;
  const range=ranges.get(bars[i].time);if(!range)continue;
  const center=sum/period,width=range.value*multiplier,time=bars[i].time;
  middle.push({time,value:center});upper.push({time,value:center+width});lower.push({time,value:center-width});
 }
 return {upper,middle,lower};
}
function linearRegressionChannel(input,period=20,multiplier=2){
 const bars=validateBars(input),upper=[],middle=[],lower=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return {upper,middle,lower};
 const xMean=(period-1)/2,denominator=period*(period*period-1)/12;
 for(let end=period-1;end<bars.length;end++){
  let ySum=0;for(let x=0;x<period;x++)ySum+=bars[end-period+1+x].close;
  const yMean=ySum/period;let covariance=0;
  for(let x=0;x<period;x++)covariance+=(x-xMean)*(bars[end-period+1+x].close-yMean);
  const slope=covariance/denominator,intercept=yMean-slope*xMean,center=intercept+slope*(period-1);
  let squaredResiduals=0;
  for(let x=0;x<period;x++){const residual=bars[end-period+1+x].close-(intercept+slope*x);squaredResiduals+=residual*residual}
  const width=Math.sqrt(squaredResiduals/period)*multiplier,time=bars[end].time;
  middle.push({time,value:center});upper.push({time,value:center+width});lower.push({time,value:center-width});
 }
 return {upper,middle,lower};
}
function ichimoku(input,settings={}){
 const bars=validateBars(input),tenkan=[],kijun=[],senkouA=[],senkouB=[],chikou=[];
 const tenkanPeriod=settings.tenkanPeriod??9,kijunPeriod=settings.kijunPeriod??26;
 const senkouBPeriod=settings.senkouBPeriod??52,displacement=settings.displacement??26;
 const secondsByTimeframe={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800};
 const seconds=secondsByTimeframe[settings.timeframe];
 if(![tenkanPeriod,kijunPeriod,senkouBPeriod].every(value=>Number.isInteger(value)&&value>=2&&value<=200)||
    !Number.isInteger(displacement)||displacement<0||displacement>200)return {tenkan,kijun,senkouA,senkouB,chikou};
 const midpoint=(index,period)=>{
  if(index<period-1)return null;
  let high=-Infinity,low=Infinity;
  for(let j=index-period+1;j<=index;j++){high=Math.max(high,bars[j].high);low=Math.min(low,bars[j].low)}
  return (high+low)/2;
 };
 const tenkanByIndex=new Map(),kijunByIndex=new Map(),spanBByIndex=new Map();
 for(let i=0;i<bars.length;i++){
  const t=midpoint(i,tenkanPeriod),k=midpoint(i,kijunPeriod),b=midpoint(i,senkouBPeriod);
  if(t!==null){tenkan.push({time:bars[i].time,sourceTime:bars[i].time,value:t});tenkanByIndex.set(i,t)}
  if(k!==null){kijun.push({time:bars[i].time,sourceTime:bars[i].time,value:k});kijunByIndex.set(i,k)}
  if(i>=displacement){const sourceIndex=i-displacement;chikou.push({time:bars[sourceIndex].time,sourceTime:bars[i].time,value:bars[i].close,projectedBack:true})}
  if(b!==null)spanBByIndex.set(i,b);
 }
 for(let i=0;i<bars.length;i++){
  const t=tenkanByIndex.get(i),k=kijunByIndex.get(i),b=spanBByIndex.get(i);
  const targetIndex=i+displacement;
  let targetTime,projected=false;
  if(targetIndex<bars.length)targetTime=bars[targetIndex].time;
  else if(seconds){targetTime=bars.at(-1).time+(targetIndex-(bars.length-1))*seconds;projected=true}
  else continue;
  if(t!==undefined&&k!==undefined)senkouA.push({time:targetTime,sourceTime:bars[i].time,value:(t+k)/2,...(projected?{projected:true}:{})});
  if(b!==undefined)senkouB.push({time:targetTime,sourceTime:bars[i].time,value:b,...(projected?{projected:true}:{})});
 }
 return {tenkan,kijun,senkouA,senkouB,chikou};
}
function sessionConfig(settings={}){
 const timeZone=settings.timeZone??"UTC",sessionStart=settings.sessionStart??"00:00";
 if(typeof timeZone!=="string"||timeZone.length>64||typeof sessionStart!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionStart))return null;
 try{new Intl.DateTimeFormat("en-CA",{timeZone}).format(new Date(0))}catch(_){return null}
 const [hour,minute]=sessionStart.split(":").map(Number);
 return {timeZone,sessionStart,minutes:hour*60+minute,formatter:new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})};
}
function vwap(input,settings={}){
 // OTC XAUUSD/FX tick_volume is a weighted-price PROXY, not exchange orderflow.
 // Session reset follows the selected wall-clock time and IANA timezone.
 const config=sessionConfig(settings);if(!config)return[];
 const bars=validateBars(input),out=[];
 let session=null,sumPV=0,sumVolume=0;
 for(const b of bars){
  const parts=Object.fromEntries(config.formatter.formatToParts(new Date(b.time*1000)).map(p=>[p.type,p.value]));
  const y=Number(parts.year),m=Number(parts.month),day=Number(parts.day),minute=Number(parts.hour)*60+Number(parts.minute);
  const sessionDay=new Date(Date.UTC(y,m-1,day)-(minute<config.minutes?86400000:0));
  const key=sessionDay.toISOString().slice(0,10);
  if(key!==session){session=key;sumPV=0;sumVolume=0}
  const volume=b.real_volume>0?b.real_volume:b.tick_volume;
  if(volume<=0)continue;
  const typical=(b.high+b.low+b.close)/3;
  sumPV+=typical*volume;sumVolume+=volume;
  out.push({time:b.time,value:sumPV/sumVolume});
 }
 return out;
}
function calc(kind,candles,settings={}){
 if(kind==="rsi")return {rsi:rsi(candles,settings.period||14)};
 if(kind==="atr")return {atr:atr(candles,settings.period||14)};
 if(kind==="macd")return macd(candles,settings.fast||12,settings.slow||26,settings.signal||9);
 if(kind==="volume")return {volume:volumes(candles,settings)};
 if(kind==="adx")return adx(candles,settings.period||14);
 if(kind==="supertrend")return {supertrend:supertrend(candles,settings.period??10,settings.multiplier??3)};
 if(kind==="stochastic")return stochastic(candles,settings.period||14,settings.smoothK||3,settings.smoothD||3);
 if(kind==="stochrsi")return stochRsi(candles,settings.period??14,settings.stochPeriod??14,settings.smoothK??3,settings.smoothD??3);
 if(kind==="cci")return {cci:cci(candles,settings.period??20)};
 if(kind==="momentum")return {momentum:momentum(candles,settings.period??10)};
 if(kind==="roc")return {roc:roc(candles,settings.period??10)};
 if(kind==="sar")return {sar:parabolicSar(candles,settings.step??.02,settings.maxStep??.2)};
 if(kind==="obv")return {obv:obv(candles)};
 if(kind==="mfi")return {mfi:mfi(candles,settings.period??14)};
 if(kind==="vwap")return {vwap:vwap(candles,settings)};
 if(kind==="donchian")return {donchian:donchian(candles,settings.period??20)};
 if(kind==="keltner")return {keltner:keltner(candles,settings.period??20,settings.atrPeriod??10,settings.multiplier??2)};
 if(kind==="atrBands")return {atrBands:atrBands(candles,settings.period??20,settings.atrPeriod??14,settings.multiplier??2)};
 if(kind==="linearRegression")return {linearRegression:linearRegressionChannel(candles,settings.period??20,settings.multiplier??2)};
 if(kind==="ichimoku")return {ichimoku:ichimoku(candles,settings)};
 if(kind==="pivots")return {pivots:pivotPoints(settings.sourceBars||[],candles,settings.basis||"D1")};
 throw Error("Unknown indicator: "+kind);
}
function pivotPoints(sourceInput,targetInput,basis="D1"){
 const empty={available:false,reason:"Keine bestätigte MT5-Quellhistorie verfügbar.",algorithmVersion:"classic-floor-v1",source:"MT5_VERIFIED",basis,lines:{p:[],r1:[],r2:[],r3:[],s1:[],s2:[],s3:[]}};
 if(!["D1","W1"].includes(basis)||!Array.isArray(sourceInput)||!Array.isArray(targetInput)||sourceInput.length<2)return empty;
 const source=[];let previous=0;
 for(const raw of sourceInput){
  if(!raw||!Number.isSafeInteger(raw.time)||raw.time<=previous||![raw.open,raw.high,raw.low,raw.close].every(Number.isFinite))return {...empty,reason:"MT5-Quellkerzen sind ungültig, unsortiert oder enthalten doppelte Zeitstempel."};
  const bar={time:raw.time,open:raw.open,high:raw.high,low:raw.low,close:raw.close};
  if(bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close,bar.high))return {...empty,reason:"MT5-Quellkerze hat inkonsistente OHLC-Werte."};
  source.push(bar);previous=bar.time;
 }
 const lines={p:[],r1:[],r2:[],r3:[],s1:[],s2:[],s3:[]};let interval=0;
 for(const raw of targetInput){
  const time=Number(raw?.time);if(!Number.isSafeInteger(time)||time<=0)continue;
  while(interval+1<source.length-1&&time>=source[interval+2].time)interval++;
  if(time<source[1].time)continue;
  const from=source[interval+1],bar=source[interval],p=(bar.high+bar.low+bar.close)/3,range=bar.high-bar.low;
  const values={p,r1:2*p-bar.low,s1:2*p-bar.high,r2:p+range,s2:p-range,r3:bar.high+2*(p-bar.low),s3:bar.low-2*(bar.high-p)};
  const validTo=source[interval+2]?.time??null;
  for(const key of Object.keys(lines))lines[key].push({time,value:values[key],sourceTime:bar.time,validFrom:from.time,validTo});
 }
 return {...empty,available:Object.values(lines).some(points=>points.length),reason:null,lines};
}
function createIncremental(kind,input,settings={}){
 if(!["rsi","atr","macd"].includes(kind))throw Error("Unsupported incremental indicator");
 const normalized=kind==="macd"?{fast:settings.fast,slow:settings.slow,signal:settings.signal}:{period:settings.period};
 if(kind==="macd"){
  if(!Number.isInteger(normalized.fast)||normalized.fast<2||normalized.fast>300||
     !Number.isInteger(normalized.slow)||normalized.slow<3||normalized.slow>300||normalized.fast>=normalized.slow||
     !Number.isInteger(normalized.signal)||normalized.signal<2||normalized.signal>200)throw Error("Invalid incremental MACD settings");
 }else if(!Number.isInteger(normalized.period)||normalized.period<2||normalized.period>200)throw Error("Invalid incremental period");
 const bars=validateBars(input),keys=kind==="macd"?["macd","signal","histogram"]:[kind];
 const values=Object.fromEntries(keys.map(key=>[key,[]]));
 const initial=()=>kind==="rsi"?{count:0,gainSum:0,lossSum:0,gain:null,loss:null}:
  kind==="atr"?{count:0,sum:0,average:null}:{fast:null,slow:null,signal:null,ready:0};
 const step=(prior,bar,index,previous)=>{
  const next={...prior},points=Object.fromEntries(keys.map(key=>[key,[]]));
  const add=(key,value,color)=>{const row={time:bar.time,value};if(color)row.color=color;points[key].push(row)};
  if(kind==="rsi"){
   if(index===0)return {state:next,points};
   const change=bar.close-previous.close;
   if(next.count<normalized.period){next.gainSum+=Math.max(change,0);next.lossSum+=Math.max(-change,0);next.count++;
    if(next.count===normalized.period){next.gain=next.gainSum/normalized.period;next.loss=next.lossSum/normalized.period}}
   else{next.gain=(next.gain*(normalized.period-1)+Math.max(change,0))/normalized.period;
    next.loss=(next.loss*(normalized.period-1)+Math.max(-change,0))/normalized.period}
   if(next.count>=normalized.period){const gain=next.gain,loss=next.loss;
    add("rsi",gain===0&&loss===0?50:loss===0?100:gain===0?0:100-100/(1+gain/loss))}
  }else if(kind==="atr"){
   const tr=Math.max(bar.high-bar.low,previous?Math.abs(bar.high-previous.close):0,previous?Math.abs(bar.low-previous.close):0);
   if(next.count<normalized.period){next.sum+=tr;next.count++;if(next.count===normalized.period)next.average=next.sum/normalized.period}
   else next.average=(next.average*(normalized.period-1)+tr)/normalized.period;
   if(next.average!==null)add("atr",next.average);
  }else{
   const {fast,slow,signal}=normalized;
   next.fast=next.fast===null?bar.close:next.fast+2/(fast+1)*(bar.close-next.fast);
   next.slow=next.slow===null?bar.close:next.slow+2/(slow+1)*(bar.close-next.slow);
   if(index>=slow-1){const value=next.fast-next.slow;next.ready++;
    next.signal=next.signal===null?value:next.signal+2/(signal+1)*(value-next.signal);
    add("macd",value);
    if(next.ready>=signal){add("signal",next.signal);add("histogram",value-next.signal,value>=next.signal?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)")}}
  }
  return {state:next,points};
 };
 let current=initial(),beforeCurrent=current;
 for(let i=0;i<bars.length;i++){
  beforeCurrent=current;
  const result=step(current,bars[i],i,bars[i-1]);current=result.state;
  for(const key of keys)values[key].push(...result.points[key]);
 }
 const snapshot=()=>Object.fromEntries(keys.map(key=>[key,values[key].map(row=>({...row}))]));
 return Object.freeze({snapshot,updateLast(bar){
  const checked=validateBars([bar]);
  if(checked.length!==1)throw Error("Invalid incremental candle");
  const candidate=checked[0],last=bars.at(-1),replace=!!last&&candidate.time===last.time;
  if(last&&candidate.time<last.time)throw Error("Incremental history is out of order");
  let index,previous,baseline;
  if(replace){index=bars.length-1;previous=bars[index-1];baseline=beforeCurrent;bars[index]=candidate}
  else{index=bars.length;previous=last;baseline=current;beforeCurrent=current;bars.push(candidate)}
  const result=step(baseline,candidate,index,previous);current=result.state;
  const delta={};
  for(const key of keys){const rows=result.points[key],series=values[key];
   if(replace&&series.at(-1)?.time===candidate.time)series.pop();
   if(rows.length){series.push(...rows);delta[key]=rows.map(row=>({...row}))}else delta[key]=[];
  }
  return delta;
 }});
}
function defaults(){
 return {rsi:{enabled:false,period:14},macd:{enabled:false,fast:12,slow:26,signal:9},
  atr:{enabled:false,period:14},volume:{enabled:false,upColor:"#41cce9",downColor:"#f7758b"},adx:{enabled:false,period:14},
  stochastic:{enabled:false,period:14,smoothK:3,smoothD:3},stochrsi:{enabled:false,period:14,stochPeriod:14,smoothK:3,smoothD:3},cci:{enabled:false,period:20},
  momentum:{enabled:false,period:10},roc:{enabled:false,period:10},sar:{enabled:false,step:.02,maxStep:.2},obv:{enabled:false},mfi:{enabled:false,period:14},supertrend:{enabled:false,period:10,multiplier:3},
  donchian:{enabled:false,period:20},keltner:{enabled:false,period:20,atrPeriod:10,multiplier:2},atrBands:{enabled:false,period:20,atrPeriod:14,multiplier:2},linearRegression:{enabled:false,period:20,multiplier:2},ichimoku:{enabled:false,tenkanPeriod:9,kijunPeriod:26,senkouBPeriod:52,displacement:26},pivots:{enabled:false,basis:"D1",algorithmVersion:"classic-floor-v1",source:"MT5_VERIFIED",sourceWindow:null},vwap:{enabled:false,timeZone:"UTC",sessionStart:"00:00"}};
}
function restore(account){
 try{const raw=JSON.parse(localStorage.getItem(storagePrefix+account)||"null");
  const result=defaults();
  if(raw&&typeof raw==="object")for(const id of Object.keys(REGISTRY)){
   if(raw[id]&&typeof raw[id]==="object"){
    result[id].enabled=raw[id].enabled===true;
    for(const prop of ["period","atrPeriod","stochPeriod","fast","slow","signal","smoothK","smoothD","tenkanPeriod","kijunPeriod","senkouBPeriod","displacement"]){
     const minimum=prop==="displacement"?0:prop==="smoothK"||prop==="smoothD"?1:2,maximum=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:200;
     if(Object.hasOwn(result[id],prop)&&Number.isInteger(raw[id][prop])&&raw[id][prop]>=minimum&&raw[id][prop]<=maximum)
      result[id][prop]=raw[id][prop];
    }
    if(id==="sar")for(const prop of ["step","maxStep"])
     if(Number.isFinite(raw[id][prop])&&raw[id][prop]>=.01&&raw[id][prop]<=.5&&Math.abs(raw[id][prop]*100-Math.round(raw[id][prop]*100))<1e-8&&(prop!=="step"||raw[id][prop]<=.1))result.sar[prop]=raw[id][prop];
    if(id==="sar"&&result.sar.step>result.sar.maxStep)result.sar={...defaults().sar,enabled:result.sar.enabled};
    if(["supertrend","keltner","atrBands","linearRegression"].includes(id)&&Number.isFinite(raw[id].multiplier)&&raw[id].multiplier>=.1&&raw[id].multiplier<=10&&Math.abs(raw[id].multiplier*10-Math.round(raw[id].multiplier*10))<1e-8)result[id].multiplier=raw[id].multiplier;
    if(id==="volume")for(const prop of ["upColor","downColor"])
     if(typeof raw[id][prop]==="string"&&/^#[0-9a-fA-F]{6}$/.test(raw[id][prop]))result[id][prop]=raw[id][prop].toLowerCase();
    if(id==="vwap"){const config=sessionConfig(raw[id]);if(config){result.vwap.timeZone=config.timeZone;result.vwap.sessionStart=config.sessionStart}}
    if(id==="pivots"){
     if(["D1","W1"].includes(raw[id].basis))result.pivots.basis=raw[id].basis;
     if(raw[id].algorithmVersion==="classic-floor-v1"&&raw[id].source==="MT5_VERIFIED"&&raw[id].sourceWindow&&Number.isSafeInteger(raw[id].sourceWindow.from)&&Number.isSafeInteger(raw[id].sourceWindow.to)&&raw[id].sourceWindow.from>0&&raw[id].sourceWindow.to>=raw[id].sourceWindow.from)
      result.pivots.sourceWindow={from:raw[id].sourceWindow.from,to:raw[id].sourceWindow.to};
    }
   }
  }
  return result;
 }catch(_){return defaults()}
}
let state=null;
function settings(){return state?JSON.parse(JSON.stringify(state.settings)):defaults()}
function persist(){try{localStorage.setItem(storagePrefix+state.account,JSON.stringify(state.settings))}catch(_){}}
function box(kind){
 const cfg=REGISTRY[kind],settings=state.settings[kind];
 const row=document.createElement("label");row.className="cs-indicator-control";
 const chk=document.createElement("input");chk.type="checkbox";chk.checked=settings.enabled;
 chk.setAttribute("aria-label",cfg.name+" anzeigen");chk.dataset.kind=kind;
 const name=document.createElement("strong");name.textContent=cfg.name;
 row.append(chk,name);
 for(const prop of kind==="volume"?["upColor","downColor"]:[]){
  const label=document.createElement("span");label.textContent=prop==="upColor"?"Aufwärtsfarbe":"Abwärtsfarbe";
  const input=document.createElement("input");input.type="color";input.value=settings[prop];input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+label.textContent);row.append(label,input);
 }
 if(kind==="vwap")for(const [prop,labelText] of [["timeZone","IANA-Zeitzone"],["sessionStart","Sessionstart (HH:MM)"]]){
  const label=document.createElement("span");label.textContent=labelText;
  const input=document.createElement("input");input.type="text";input.value=settings[prop];input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+labelText);label.append(input);row.append(label);
 }
 if(kind==="pivots"){
  const label=document.createElement("span");label.textContent="Basis";
  const select=document.createElement("select");select.dataset.parameter="basis";select.dataset.kind=kind;select.setAttribute("aria-label","Pivot Points Basis");
  for(const value of ["D1","W1"]){const option=document.createElement("option");option.value=value;option.textContent=value;option.selected=settings.basis===value;select.append(option)}
  row.append(label,select);
 }
 for(const prop of ["period","atrPeriod","fast","slow","signal","smoothK","smoothD","multiplier","step","maxStep","tenkanPeriod","kijunPeriod","senkouBPeriod","displacement"]){
  if(!Object.hasOwn(cfg,prop))continue;
  const label=document.createElement("span");label.textContent=prop==="smoothK"?"%K Glättung":prop==="smoothD"?"%D Glättung":prop==="multiplier"?"Faktor":prop==="step"?"AF-Schritt":prop==="maxStep"?"AF-Maximum":prop==="period"?"Periode":prop==="tenkanPeriod"?"Tenkan":prop==="kijunPeriod"?"Kijun":prop==="senkouBPeriod"?"Senkou B":"Versatz";
  const input=document.createElement("input");input.type="number";input.min=prop==="smoothK"||prop==="smoothD"?1:prop==="multiplier"?.1:prop==="step"||prop==="maxStep"?.01:prop==="displacement"?0:2;input.max=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:prop==="multiplier"?10:prop==="step"?.1:prop==="maxStep"?.5:200;
  input.step=prop==="multiplier"?.1:prop==="step"||prop==="maxStep"?.01:1;input.value=String(settings[prop]);input.dataset.parameter=prop;input.dataset.kind=kind;
  input.setAttribute("aria-label",cfg.name+": "+prop);
  row.append(label,input);
 }
 return row;
}
function syncPanel(){
 if(!state)return;
 state.controls.replaceChildren();
 for(const id of Object.keys(REGISTRY))state.controls.append(box(id));
}
function data(kind){return calc(kind,state.bars,kind==="ichimoku"?{...state.settings[kind],timeframe:state.timeframe}:state.settings[kind])}
const STREAM_KINDS=new Set(["rsi","macd","atr"]);
function streamSettings(kind){
 const cfg=state.settings[kind];
 return kind==="macd"?{fast:cfg.fast,slow:cfg.slow,signal:cfg.signal}:{period:cfg.period};
}
function streamKey(kind){return JSON.stringify([kind,streamSettings(kind)])}
function sameBar(a,b){return a&&b&&a.time===b.time&&a.open===b.open&&a.high===b.high&&a.low===b.low&&
 a.close===b.close&&a.tick_volume===b.tick_volume&&a.real_volume===b.real_volume}
function oneTailChange(previous,next){
 if(!previous.length||!next.length)return false;
 const sameLength=next.length===previous.length,append=next.length===previous.length+1;
 if(!sameLength&&!append)return false;
 const untouched=sameLength?previous.length-1:previous.length;
 for(let i=0;i<untouched;i++)if(!sameBar(previous[i],next[i]))return false;
 return sameLength?previous.at(-1).time===next.at(-1).time:next.at(-1).time>previous.at(-1).time;
}
function addReadout(kind,calculated,onlyTime=null){
 const labels={rsi:["RSI"],atr:["ATR"],macd:["MACD","Signal","Histogram"],volume:["Volumen"],adx:["ADX","+DI","−DI"],stochastic:["%K","%D"],stochrsi:["StochRSI %K","StochRSI %D"],supertrend:["Supertrend"],cci:["CCI"],momentum:["Momentum"],roc:["ROC (%)"],sar:["SAR"],obv:["OBV · Broker-Volumen"],mfi:["MFI · Volumenproxy"],donchian:["Upper","Middle","Lower"],keltner:["Upper","Middle","Lower"],atrBands:["Upper","Middle","Lower"],linearRegression:["Upper","Middle","Lower"],ichimoku:["Tenkan","Kijun","Senkou A (Quelle)","Senkou B (Quelle)","Chikou (Quelle)"],vwap:["VWAP"]}[kind];
 if(kind==="ichimoku"){
  for(const [component,label] of [["tenkan",labels[0]],["kijun",labels[1]],["senkouA",labels[2]],["senkouB",labels[3]],["chikou",labels[4]]])for(const point of calculated.ichimoku[component]){
   if(onlyTime!==null&&point.sourceTime!==onlyTime)continue;
   const rows=state.readouts.get(point.sourceTime)||[];rows.push({kind,label,value:point.value});state.readouts.set(point.sourceTime,rows);
  }
  return;
 }
 if(kind==="donchian"||kind==="keltner"||kind==="atrBands"||kind==="linearRegression"){
  const components=["upper","middle","lower"];
  for(let i=0;i<components.length;i++)for(const point of calculated[kind][components[i]]){
   if(onlyTime!==null&&point.time!==onlyTime)continue;
   const rows=state.readouts.get(point.time)||[];rows.push({kind,label:labels[i],value:point.value});state.readouts.set(point.time,rows);
  }
  return;
 }
 const keys=Object.keys(calculated);
 for(let i=0;i<keys.length;i++)for(const point of calculated[keys[i]]||[]){
  if(onlyTime!==null&&point.time!==onlyTime)continue;
  const rows=state.readouts.get(point.time)||[];
  rows.push({kind,label:labels[i],value:point.value,trend:point.trend});state.readouts.set(point.time,rows);
 }
}
function syncRanges(){
 if(!state)return;
 let range=null;
 try{range=state.chart.timeScale().getVisibleLogicalRange()}catch(_){}
 if(!range)return;
 for(const pane of state.panes.values())try{pane.chart.timeScale().setVisibleLogicalRange(range)}catch(_){}
}
function destroyPane(kind){
 const p=state.panes.get(kind);if(!p)return;
 p.observer?.disconnect();p.chart.remove();p.shell.remove();state.panes.delete(kind);
}
function createPane(kind){
 const conf=REGISTRY[kind],shell=document.createElement("section");
 shell.className="cs-indicator-pane";shell.dataset.indicator=kind;
 const title=document.createElement("div");title.className="cs-indicator-pane-title";
 title.textContent=conf.name+" · "+(["volume","obv","mfi"].includes(kind)?"Broker Tick-/Realvolumen":"eigene Skala");
 const close=document.createElement("button");close.type="button";close.title="Pane schließen";
 close.textContent="✕";close.addEventListener("click",()=>{state.settings[kind].enabled=false;persist();syncPanel();renderPanes()});
 title.append(close);shell.append(title);
 const plot=document.createElement("div");plot.className="cs-indicator-pane-plot";shell.append(plot);
 state.stack.append(shell);
 const chart=LightweightCharts.createChart(plot,{
  width:Math.max(220,plot.clientWidth||state.host.clientWidth),height:Math.max(115,plot.clientHeight||133),
  layout:{background:{color:"#0b1a24"},textColor:"#b8d4db",fontSize:10},
  grid:{vertLines:{visible:false},horzLines:{color:"#24404d"}},
  rightPriceScale:{borderVisible:false,scaleMargins:{top:.12,bottom:.12}},
  leftPriceScale:{visible:false},
  crosshair:{mode:0},
  timeScale:{visible:false,borderVisible:false,rightOffset:7,barSpacing:7},
  handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
  handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false,axisDoubleClickReset:false}
 });
 const lines={};const series=(name,color,type)=>{
  lines[name]=type==="hist"?chart.addHistogramSeries({color,priceLineVisible:false,lastValueVisible:false,
   priceFormat:{type:"volume"}}):chart.addLineSeries({color,lineWidth:2,
   priceLineVisible:false,lastValueVisible:false});
 };
 if(kind==="rsi")series("rsi","#e9bb72");
 if(kind==="atr")series("atr","#a68eff");
  if(kind==="macd"){series("macd","#55d7ee");series("signal","#f3c56a");series("histogram","#53dabd","hist")}
 if(kind==="volume")series("volume","#5de1d8","hist");
 if(kind==="adx"){series("adx","#e9bc72");series("plusDi","#55deaa");series("minusDi","#f17e97")}
 if(kind==="stochastic"){series("stochK","#55d7ee");series("stochD","#f3c56a")}
 if(kind==="stochrsi"){series("stochRsiK","#55d7ee");series("stochRsiD","#f3c56a")}
 if(kind==="cci")series("cci","#a995ff");
 if(kind==="momentum")series("momentum","#55d7ee");
 if(kind==="roc")series("roc","#f3c56a");
 if(kind==="obv")series("obv","#55deaa");
 if(kind==="mfi")series("mfi","#e9bc72");
 const pane={shell,chart,plot,lines,observer:null};
 if(typeof ResizeObserver!=="undefined"){pane.observer=new ResizeObserver(()=>{
  chart.applyOptions({width:Math.max(180,plot.clientWidth),height:Math.max(80,plot.clientHeight)});
 });pane.observer.observe(plot)}
 state.panes.set(kind,pane);
 return pane;
}
function renderPanes(incrementalUpdates=null){
 if(!state)return;
 if(!incrementalUpdates)state.streams.clear();
 const readoutTime=incrementalUpdates?state.bars.at(-1)?.time:null;
 if(!incrementalUpdates)state.readouts=new Map();
 else state.readouts.delete(readoutTime);
 for(const id of Object.keys(REGISTRY)){
  if(id==="pivots"){
   const calculated=state.settings.pivots.enabled&&state.pivotSource?pivotPoints(state.pivotSource,state.bars,state.settings.pivots.basis):null;
   const keys=["p","r1","r2","r3","s1","s2","s3"],colors={p:"#f4d35e",r1:"#54d6ef",r2:"#41d89a",r3:"#b58aff",s1:"#f47789",s2:"#ffae57",s3:"#e6e6e6"};
   if(!state.pivotOverlays&&state.settings.pivots.enabled)state.pivotOverlays=Object.fromEntries(keys.map(key=>[key,state.chart.addLineSeries({title:"Pivot "+key.toUpperCase(),color:colors[key],lineWidth:key==="p"?2:1,lastValueVisible:true,priceLineVisible:false})]));
   if(state.pivotOverlays)for(const key of keys){const series=state.pivotOverlays[key];series.applyOptions({visible:!!state.settings.pivots.enabled,title:"Pivot "+key.toUpperCase()+" · "+state.settings.pivots.basis});
    const points=calculated?.lines[key]||[],byTime=new Map(points.map(point=>[point.time,point]));series.setData(state.bars.map(bar=>byTime.has(bar.time)?{time:bar.time,value:byTime.get(bar.time).value}:{time:bar.time}));}
   state.pivotMetaByTime.clear();if(calculated?.available){for(const point of calculated.lines.p)state.pivotMetaByTime.set(point.time,{sourceTime:point.sourceTime,validFrom:point.validFrom,validTo:point.validTo,basis:calculated.basis,algorithmVersion:calculated.algorithmVersion});
    const labels={p:"P",r1:"R1",r2:"R2",r3:"R3",s1:"S1",s2:"S2",s3:"S3"};for(const key of keys)for(const point of calculated.lines[key]){if(readoutTime!==null&&point.time!==readoutTime)continue;const rows=state.readouts.get(point.time)||[];rows.push({kind:"pivots",label:labels[key],value:point.value});state.readouts.set(point.time,rows)}}
   continue;
  }
  if(id==="ichimoku"){
   const calculated=state.settings.ichimoku.enabled?data(id):null,key="ichimokuOverlays";state.ichimokuValues=calculated?.ichimoku??null;
   if(calculated)addReadout(id,calculated,readoutTime);
   if(!state[key]&&state.settings[id].enabled){state[key]={tenkan:state.chart.addLineSeries({title:"Ichimoku Tenkan",color:"#55d7ee",lineWidth:1,lastValueVisible:false,priceLineVisible:false}),kijun:state.chart.addLineSeries({title:"Ichimoku Kijun",color:"#f3c56a",lineWidth:1,lastValueVisible:false,priceLineVisible:false}),senkouA:state.chart.addLineSeries({title:"Ichimoku Senkou A",color:"#41d89a",lineWidth:1,lastValueVisible:false,priceLineVisible:false}),senkouB:state.chart.addLineSeries({title:"Ichimoku Senkou B",color:"#f47789",lineWidth:1,lastValueVisible:false,priceLineVisible:false}),chikou:state.chart.addLineSeries({title:"Ichimoku Chikou",color:"#b58aff",lineWidth:1,lastValueVisible:false,priceLineVisible:false})};}
   if(state[key])for(const component of ["tenkan","kijun","senkouA","senkouB","chikou"]){const series=state[key][component];series.applyOptions({visible:!!state.settings[id].enabled});if(calculated){const points=calculated.ichimoku[component];series.setData(points.map(point=>({time:point.time,value:point.value})))}}
   continue;
  }
  if(id==="donchian"||id==="keltner"||id==="atrBands"||id==="linearRegression"){
   const calculated=state.settings[id].enabled?data(id):null,key=id+"Overlays";
   if(calculated)addReadout(id,calculated,readoutTime);
   if(!state[key]&&state.settings[id].enabled){
    state[key]={
     upper:state.chart.addLineSeries({title:id+" Upper",color:"#55d7ee",lineWidth:2,lastValueVisible:true,priceLineVisible:false}),
     middle:state.chart.addLineSeries({title:id+" Mitte",color:"#b7c8d0",lineWidth:1,lastValueVisible:false,priceLineVisible:false}),
     lower:state.chart.addLineSeries({title:id+" Lower",color:"#f3c56a",lineWidth:2,lastValueVisible:true,priceLineVisible:false})
    };
   }
   const visible=!!state.settings[id].enabled,settings=state.settings[id],suffix=id==="donchian"?String(settings.period):id==="keltner"||id==="atrBands"?settings.period+" / "+settings.atrPeriod+" × "+settings.multiplier:id==="linearRegression"?settings.period+" × "+settings.multiplier+"σ":"";
   if(state[key])for(const line of ["upper","middle","lower"]){
    const series=state[key][line];series.applyOptions({visible,title:id+" "+line+" · "+suffix});
    if(calculated){const byTime=new Map(calculated[id][line].map(point=>[point.time,point]));series.setData(state.bars.map(bar=>byTime.get(bar.time)||{time:bar.time}));}
   }
   continue;
  }
  if(id==="supertrend"){
   const calculated=state.settings.supertrend.enabled?data("supertrend"):null;
   if(calculated)addReadout(id,calculated,readoutTime);
   if(!state.supertrendUpOverlay&&state.settings.supertrend.enabled)state.supertrendUpOverlay=state.chart.addLineSeries({title:"Supertrend · Aufwärtstrend",color:"#41d89a",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   if(!state.supertrendDownOverlay&&state.settings.supertrend.enabled)state.supertrendDownOverlay=state.chart.addLineSeries({title:"Supertrend · Abwärtstrend",color:"#f47789",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   const visible=!!state.settings.supertrend.enabled,titleSuffix=" · ATR "+state.settings.supertrend.period+" × "+state.settings.supertrend.multiplier;
   if(state.supertrendUpOverlay)state.supertrendUpOverlay.applyOptions({visible,title:"Supertrend · Aufwärtstrend"+titleSuffix});
   if(state.supertrendDownOverlay)state.supertrendDownOverlay.applyOptions({visible,title:"Supertrend · Abwärtstrend"+titleSuffix});
   if(calculated){const byTime=new Map(calculated.supertrend.map(point=>[point.time,point]));
    state.supertrendUpOverlay.setData(state.bars.map(bar=>{const point=byTime.get(bar.time);return point?.trend==="UP"?{time:bar.time,value:point.value}:{time:bar.time}}));
    state.supertrendDownOverlay.setData(state.bars.map(bar=>{const point=byTime.get(bar.time);return point?.trend==="DOWN"?{time:bar.time,value:point.value}:{time:bar.time}}));
   }
   continue;
  }
  if(id==="sar"){
   const calculated=state.settings.sar.enabled?data("sar"):null;
   if(calculated)addReadout(id,calculated,readoutTime);
   if(!state.sarUpOverlay&&state.settings.sar.enabled)state.sarUpOverlay=state.chart.addLineSeries({title:"Parabolic SAR · Aufwärtstrend",color:"#41d89a",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   if(!state.sarDownOverlay&&state.settings.sar.enabled)state.sarDownOverlay=state.chart.addLineSeries({title:"Parabolic SAR · Abwärtstrend",color:"#f47789",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   const visible=!!state.settings.sar.enabled,suffix=" · AF "+state.settings.sar.step+" / "+state.settings.sar.maxStep;
   state.sarUpOverlay?.applyOptions({visible,title:"Parabolic SAR · Aufwärtstrend"+suffix});
   state.sarDownOverlay?.applyOptions({visible,title:"Parabolic SAR · Abwärtstrend"+suffix});
   if(calculated){const byTime=new Map(calculated.sar.map(point=>[point.time,point]));
    state.sarUpOverlay.setData(state.bars.map(bar=>{const point=byTime.get(bar.time);return point?.trend==="UP"?{time:bar.time,value:point.value}:{time:bar.time}}));
    state.sarDownOverlay.setData(state.bars.map(bar=>{const point=byTime.get(bar.time);return point?.trend==="DOWN"?{time:bar.time,value:point.value}:{time:bar.time}}));
   }
   continue;
  }
  if(id==="vwap"){
   const calculated=state.settings.vwap.enabled?data("vwap"):null;
   if(calculated)addReadout(id,calculated,readoutTime);
   if(state.settings.vwap.enabled&&!state.vwapOverlay){
    state.vwapOverlay=state.chart.addLineSeries({title:"Session-VWAP "+state.settings.vwap.sessionStart+" "+state.settings.vwap.timeZone+" · Tick-/Realvolumenproxy",
     color:"#f1da9b",lineWidth:2,lastValueVisible:true,priceLineVisible:false});
   }
   if(state.vwapOverlay){
    state.vwapOverlay.applyOptions({visible:!!state.settings.vwap.enabled,title:"Session-VWAP "+state.settings.vwap.sessionStart+" "+state.settings.vwap.timeZone+" · Tick-/Realvolumenproxy"});
    if(calculated)state.vwapOverlay.setData(calculated.vwap);
   }
   continue;
  }
  if(!state.settings[id].enabled){destroyPane(id);continue}
  const pane=state.panes.get(id)||createPane(id);
  let stream=null;
  if(STREAM_KINDS.has(id)){
   stream=state.streams.get(id);
   if(!incrementalUpdates||!stream||stream.key!==streamKey(id)){
    const api=window.ChartStudioIndicators;
    stream=typeof api?.createIncremental==="function"?{key:streamKey(id),engine:api.createIncremental(id,state.bars,streamSettings(id))}:null;
    if(stream)state.streams.set(id,stream);else state.streams.delete(id);
   }
  }
  const delta=incrementalUpdates?.get(id);
  const calculated=delta||(stream?stream.engine.snapshot():data(id));
  addReadout(id,calculated,readoutTime);
  if(delta){
   const time=state.bars.at(-1)?.time;
   for(const [key,series] of Object.entries(pane.lines)){
    const point=(delta[key]||[]).at(-1);
    if(point)series.update(point);else if(time)series.update({time});
   }
   continue;
  }
  for(const [key,series] of Object.entries(pane.lines)){
   // Align warm-up bars to the primary chart's logical coordinates.
   const byTime=new Map((calculated[key]||[]).map(p=>[p.time,p]));
   series.setData(state.bars.map(bar=>byTime.get(bar.time)||{time:bar.time}));
  }
 }
 syncRanges();
 window.ChartStudioBeta?.refreshDataWindowIndicators();
 state.onRender?.();
}
function readout(time){
 if(!state)return "";
 const rows=state.readouts.get(Number(time))||[];
 const values=[];
 const components={rsi:["RSI"],atr:["ATR"],macd:["MACD","Signal","Histogram"],volume:["Volumen"],adx:["ADX","+DI","−DI"],stochastic:["%K","%D"],stochrsi:["StochRSI %K","StochRSI %D"],supertrend:["Supertrend"],cci:["CCI"],momentum:["Momentum"],roc:["ROC (%)"],sar:["SAR"],obv:["OBV · Broker-Volumen"],mfi:["MFI · Volumenproxy"],donchian:["Upper","Middle","Lower"],keltner:["Upper","Middle","Lower"],atrBands:["Upper","Middle","Lower"],linearRegression:["Upper","Middle","Lower"],ichimoku:["Tenkan","Kijun","Senkou A (Quelle)","Senkou B (Quelle)","Chikou (Quelle)"],pivots:["P","R1","R2","R3","S1","S2","S3"],vwap:["VWAP"]};
 for(const id of Object.keys(REGISTRY))if(state.settings[id].enabled){
  for(const label of components[id]){
   const row=rows.find(item=>item.kind===id&&item.label===label);
   if(row)values.push(row.label+" "+(row.kind==="volume"?row.value.toFixed(0):row.value.toFixed(2))+(row.trend?" · "+(row.trend==="UP"?"Aufwärtstrend":"Abwärtstrend"):""));
   else values.push(id==="vwap"?"VWAP · Kein Volumen":id==="pivots"?"Pivot · nicht verfügbar":label+" · Warm-up");
  }
 }
 const pivotMeta=state.pivotMetaByTime.get(Number(time));if(state.settings.pivots.enabled&&pivotMeta)values.push("Quelle "+pivotMeta.basis+" "+new Date(pivotMeta.sourceTime*1000).toISOString().slice(0,10)+" · gültig ab "+new Date(pivotMeta.validFrom*1000).toISOString()+" · "+pivotMeta.algorithmVersion);
 return values.join(" · ")||"Keine aktiven Indikatoren";
}
let pivotRequestGeneration=0;
function schedulePivotRefresh(){
 if(!state)return;
 clearInterval(state.pivotRefreshTimer);state.pivotRefreshTimer=null;
 if(state.settings.pivots.enabled)state.pivotRefreshTimer=setInterval(()=>{if(state?.settings.pivots.enabled)loadPivotSource()},5*60*1000);
}
function loadPivotSource(){
 if(!state)return;
 state.pivotController?.abort();state.pivotController=null;
 const generation=++pivotRequestGeneration,scope={account:state.account,symbol:state.symbol,timeframe:state.timeframe,basis:state.settings.pivots.basis};
 state.pivotSource=null;state.pivotMetaByTime.clear();
 schedulePivotRefresh();
 if(!state.settings.pivots.enabled){renderPanes();return}
 state.settings.pivots.algorithmVersion="classic-floor-v1";state.settings.pivots.source="MT5_VERIFIED";state.settings.pivots.sourceWindow=null;persist();
 if(!scope.account||!scope.symbol){state.notice.textContent="Pivot Points nicht verfügbar · Konto oder Broker-Symbol fehlt.";renderPanes();return}
 const controller=new AbortController();state.pivotController=controller;renderPanes();
 const root=window.location.pathname.startsWith("/stt")?"/stt":"";
 const url=root+"/api/candles?"+new URLSearchParams({account:scope.account,symbol:scope.symbol,tf:scope.basis,count:"500"});
 fetch(url,{method:"GET",cache:"no-store",signal:controller.signal}).then(async response=>{
  const payload=await response.json();
  if(response.status<200||response.status>=300)throw Error(payload?.detail||"MT5-Historie konnte nicht geladen werden.");
  if(generation!==pivotRequestGeneration||state.account!==scope.account||state.symbol!==scope.symbol||state.timeframe!==scope.timeframe||state.settings.pivots.basis!==scope.basis)return;
  if(payload?.source!=="MT5_VERIFIED"||payload?.canExecute!==false||payload?.accountId!==scope.account||payload?.symbol!==scope.symbol||payload?.timeframe!==scope.basis||!Array.isArray(payload?.candles))throw Error("MT5-Historie weicht bei Konto, Symbol, Basis oder Provenienz vom angeforderten Scope ab.");
  const probe=pivotPoints(payload.candles,[{time:Number(payload.candles[1]?.time)}],scope.basis);
  if(!probe.available)throw Error(probe.reason||"Keine abgeschlossene Pivot-Periode verfügbar.");
  state.pivotSource=payload.candles.map(bar=>({...bar}));state.settings.pivots.sourceWindow={from:Number(payload.candles[0].time),to:Number(payload.candles.at(-1).time)};persist();state.notice.textContent="Pivot Points · "+scope.basis+" · MT5_VERIFIED · "+payload.symbol;renderPanes();
 }).catch(error=>{
  if(error?.name==="AbortError"||generation!==pivotRequestGeneration)return;
  state.pivotSource=null;state.pivotMetaByTime.clear();state.notice.textContent="Pivot Points nicht verfügbar · "+String(error?.message||error);renderPanes();
 });
}
function updateBars(bars){
 if(!state||!Array.isArray(bars))return;
 const last=bars.at(-1)||{};
 const signature=window.ChartStudioDataSignature?.signature(bars)||
  [bars.length,last.time,last.close,last.high,last.low,last.tick_volume,last.real_volume].join(":");
 if(signature===state.signature)return;
 const previous=state.bars,next=window.ChartStudioIndicators?.math.validateBars(bars)||[];
 if(oneTailChange(previous,next)){
  const active=Object.keys(REGISTRY).filter(id=>STREAM_KINDS.has(id)&&state.settings[id].enabled);
  const updates=new Map();let valid=active.length>0;
  for(const id of active){const stream=state.streams.get(id);if(!stream||stream.key!==streamKey(id)){valid=false;break}}
  if(valid){
   try{for(const id of active)updates.set(id,state.streams.get(id).engine.updateLast(next.at(-1)))}
   catch(_){state.streams.clear();updates.clear()}
  }
  state.signature=signature;state.bars=next;
  if(updates.size){renderPanes(updates);return}
 }else state.streams.clear();
 state.signature=signature;state.bars=next;
 renderPanes();
}
function switchAccount(account,symbol=null){
 if(!state)return;
 state.account=account;if(typeof symbol==="string")state.symbol=symbol;
 state.settings=restore(account);state.signature=null;state.bars=[];
 loadPivotSource();syncPanel();renderPanes();
}
function setScope(account,symbol,timeframe){
 if(!state)return;
 const changed=state.account!==account||state.symbol!==symbol||state.timeframe!==timeframe;
 state.account=account;state.symbol=symbol;state.timeframe=timeframe;
 if(changed){state.pivotController?.abort();state.pivotSource=null;state.pivotMetaByTime.clear();loadPivotSource()}
 renderPanes();
}
function updateConfig(kind,prop,val){
 if(!state||!REGISTRY[kind])return false;
 if(prop==="enabled")state.settings[kind].enabled=val===true;
 else if(kind==="pivots"&&prop==="basis"){
  if(!["D1","W1"].includes(String(val)))return false;
  state.settings.pivots.basis=String(val);state.settings.pivots.sourceWindow=null;state.pivotSource=null;state.pivotMetaByTime.clear();loadPivotSource();
 }
 else if(kind==="volume"&&["upColor","downColor"].includes(prop)){
  if(typeof val!=="string"||!/^#[0-9a-fA-F]{6}$/.test(val))return false;
  state.settings.volume[prop]=val.toLowerCase();
 }
 else if(kind==="vwap"&&["timeZone","sessionStart"].includes(prop)){
  const candidate={...state.settings.vwap,[prop]:String(val)};
  if(!sessionConfig(candidate)){state.notice.textContent=prop==="timeZone"?"Ungültige IANA-Zeitzone.":"Sessionstart muss HH:MM sein.";syncPanel();return false}
  state.settings.vwap[prop]=String(val);
 }
 else if(["supertrend","keltner","atrBands","linearRegression"].includes(kind)&&prop==="multiplier"){
  const n=Number(val);if(!Number.isFinite(n)||n<.1||n>10||Math.abs(n*10-Math.round(n*10))>1e-8){state.notice.textContent="Faktor muss zwischen 0,1 und 10,0 in 0,1-Schritten liegen.";syncPanel();return false}state.settings[kind].multiplier=n;
 }
 else if(kind==="sar"&&["step","maxStep"].includes(prop)){
  const n=Number(val),candidate={...state.settings.sar,[prop]:n};
  if(!Number.isFinite(n)||n<.01||n>.5||Math.abs(n*100-Math.round(n*100))>1e-8||prop==="step"&&n>.1||candidate.step>candidate.maxStep){state.notice.textContent="SAR benötigt AF-Schritt 0,01–0,10 und AF-Maximum ≥ Schritt bis 0,50, jeweils in 0,01-Schritten.";syncPanel();return false}
  state.settings.sar[prop]=n;
 }
 else if(Object.hasOwn(REGISTRY[kind],prop)){
  const n=Number(val),minimum=prop==="displacement"?0:prop==="smoothK"||prop==="smoothD"?1:2,maximum=prop==="slow"?300:prop==="smoothK"||prop==="smoothD"?100:200;
  if(!Number.isInteger(n)||n<minimum||n>maximum){state.notice.textContent="Ungültiger Parameter ("+minimum+"–"+maximum+")";return false}
  state.settings[kind][prop]=n;
 }
 if(kind==="macd"&&state.settings.macd.fast>=state.settings.macd.slow){
  state.settings.macd.fast=Math.min(state.settings.macd.fast,state.settings.macd.slow-1);
  state.notice.textContent="MACD benötigt fast < slow; Werte korrigiert.";
 }
 persist();syncPanel();renderPanes();state.notice.textContent=REGISTRY[kind].name+" aktualisiert.";
 if(kind==="pivots"&&prop==="enabled"&&val===true)loadPivotSource();
 if(kind==="pivots"&&prop==="enabled"&&val!==true){state.pivotController?.abort();state.pivotController=null;pivotRequestGeneration++;state.pivotSource=null;state.pivotMetaByTime.clear();schedulePivotRefresh()}
 return true;
}
function applySettings(raw){
 if(!state||!raw||typeof raw!=="object")return;
 const fresh=defaults();
 for(const id of Object.keys(REGISTRY)){
  const input=raw[id];if(!input||typeof input!=="object")continue;
  fresh[id].enabled=input.enabled===true;
  if(id==="pivots"){
   if(["D1","W1"].includes(input.basis))fresh.pivots.basis=input.basis;
   if(input.algorithmVersion==="classic-floor-v1"&&input.source==="MT5_VERIFIED"&&input.sourceWindow&&Number.isSafeInteger(input.sourceWindow.from)&&Number.isSafeInteger(input.sourceWindow.to)&&input.sourceWindow.from>0&&input.sourceWindow.to>=input.sourceWindow.from)
    fresh.pivots.sourceWindow={from:input.sourceWindow.from,to:input.sourceWindow.to};
  }
  if(id==="volume")for(const key of ["upColor","downColor"])
   if(typeof input[key]==="string"&&/^#[0-9a-fA-F]{6}$/.test(input[key]))fresh.volume[key]=input[key].toLowerCase();
  if(id==="vwap"){const config=sessionConfig(input);if(config){fresh.vwap.timeZone=config.timeZone;fresh.vwap.sessionStart=config.sessionStart}}
  for(const key of ["period","atrPeriod","fast","slow","signal","smoothK","smoothD","multiplier","step","maxStep"]){
   const value=Number(input[key]);
   if(key==="multiplier"&&["supertrend","keltner","atrBands","linearRegression"].includes(id)){if(Number.isFinite(value)&&value>=.1&&value<=10&&Math.abs(value*10-Math.round(value*10))<1e-8)fresh[id][key]=value;continue}
   if(id==="sar"&&["step","maxStep"].includes(key)){if(Number.isFinite(value)&&value>=.01&&value<=.5&&Math.abs(value*100-Math.round(value*100))<1e-8&&(key!=="step"||value<=.1))fresh.sar[key]=value;continue}
   const minimum=key==="displacement"?0:key==="smoothK"||key==="smoothD"?1:2,maximum=key==="slow"?300:key==="smoothK"||key==="smoothD"?100:200;
   if(Object.hasOwn(fresh[id],key)&&Number.isInteger(value)&&value>=minimum&&value<=maximum)
    fresh[id][key]=value;
  }
 }
 if(fresh.sar.step>fresh.sar.maxStep)fresh.sar={...defaults().sar,enabled:fresh.sar.enabled};
 if(fresh.macd.fast>=fresh.macd.slow)fresh.macd.fast=Math.max(2,fresh.macd.slow-1);
  state.settings=fresh;persist();syncPanel();renderPanes();if(fresh.pivots.enabled)loadPivotSource();
}
function mount({chart,host,panel,account="titan",symbol="XAUUSD",onRender}){
 if(state||!chart||!host||!panel)return;
 const stack=document.createElement("div");stack.className="cs-indicator-panes";
 host.parentElement.insertAdjacentElement("afterend",stack);
 const controls=document.createElement("div");controls.className="cs-indicator-controls";
 const head=document.createElement("div");head.className="cs-indicator-controls-title";
 head.textContent="Zusätzliche Indikator-Panes · unabhängig ein-/ausblendbar";panel.append(head,controls);
 const notice=document.createElement("p");notice.className="cs-indicator-notice";notice.textContent="Indikatoren basieren auf geladenen Brokerkerzen. Warm-up erforderlich.";
 panel.append(notice);
 state={chart,host,stack,controls,notice,account,symbol,onRender,timeframe:"M15",settings:restore(account),bars:[],signature:null,panes:new Map(),streams:new Map(),vwapOverlay:null,supertrendUpOverlay:null,supertrendDownOverlay:null,sarUpOverlay:null,sarDownOverlay:null,donchianOverlays:null,keltnerOverlays:null,ichimokuValues:null,readouts:new Map(),pivotSource:null,pivotOverlays:null,pivotMetaByTime:new Map(),pivotController:null,pivotRefreshTimer:null};
 controls.addEventListener("change",evt=>{
  const target=evt.target;
  if(!target.dataset.kind)return;
  if(target.type==="checkbox")updateConfig(target.dataset.kind,"enabled",target.checked);
  else updateConfig(target.dataset.kind,target.dataset.parameter,target.value);
 });
 chart.timeScale().subscribeVisibleLogicalRangeChange(syncRanges);
 syncPanel();renderPanes();if(state.settings.pivots.enabled)loadPivotSource();
}
function setTimeframe(timeframe){if(!state||!Object.hasOwn({M1:1,M5:1,M15:1,M30:1,H1:1,H4:1,D1:1,W1:1},timeframe))return;setScope(state.account,state.symbol,timeframe)}
window.ChartStudioIndicators=Object.freeze({mount,updateBars,switchAccount,setScope,setTimeframe,updateConfig,settings,readout,ichimokuValues:()=>state?.ichimokuValues??null,createIncremental,
 registry:REGISTRY,calculate:calc,applySettings,math:Object.freeze({validateBars,ema,rsi,stochastic,stochRsi,cci,momentum,roc,parabolicSar,obv,mfi,macd,atr,adx,supertrend,donchian,keltner,atrBands,linearRegressionChannel,ichimoku,pivotPoints,vwap,volumes})});
})();
