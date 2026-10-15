import type {Candle,AveragePoint} from "./adapter";

export type OscillatorKind="rsi"|"atr"|"macd"|"adx"|"stochastic"|"cci";
export type OscillatorSettings={period:number}|{fast:number;slow:number;signal:number}|{period:number;smoothK:number;smoothD:number};
export type OscillatorValues=Record<string,AveragePoint[]>;
export type IncrementalOscillator={snapshot():OscillatorValues;updateLast(bar:Candle):OscillatorValues};
export const MAX_OSCILLATOR_BARS=150000;
const bounded=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;
function checkBars(input:readonly Candle[]):Candle[]{
 if(!Array.isArray(input)||input.length>MAX_OSCILLATOR_BARS)throw Error("Invalid oscillator history");
 let previous=0;
 for(const bar of input){
  if(!Number.isSafeInteger(bar.time)||bar.time<=previous||!Number.isFinite(bar.open)||!Number.isFinite(bar.high)||!Number.isFinite(bar.low)||!Number.isFinite(bar.close))throw Error("Invalid oscillator candles");
  previous=bar.time;
 }
 return [...input];
}
function ema(values:readonly number[],period:number):Array<number|null>{
 const out=new Array<number|null>(values.length).fill(null),factor=2/(period+1);let previous:number|null=null;
 for(let i=0;i<values.length;i++){previous=previous===null?values[i]:previous+factor*(values[i]-previous);if(i>=period-1)out[i]=previous}
 return out;
}
function point(bars:readonly Candle[],index:number,value:number):AveragePoint{return {time:bars[index].time,value}}
function rsi(bars:readonly Candle[],period:number):AveragePoint[]{
 const out:AveragePoint[]=[];if(bars.length<=period)return out;
 let up=0,down=0;for(let i=1;i<=period;i++){const d=bars[i].close-bars[i-1].close;up+=Math.max(d,0);down+=Math.max(-d,0)}up/=period;down/=period;
 const value=()=>up===0&&down===0?50:down===0?100:up===0?0:100-100/(1+up/down);
 out.push(point(bars,period,value()));
 for(let i=period+1;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;up=(up*(period-1)+Math.max(d,0))/period;down=(down*(period-1)+Math.max(-d,0))/period;out.push(point(bars,i,value()))}
 return out;
}
function stochastic(bars:readonly Candle[],period:number,smoothK:number,smoothD:number):OscillatorValues{
 const stochK:AveragePoint[]=[],stochD:AveragePoint[]=[];
 if(bars.length<period||smoothK<1||smoothD<1)return {stochK,stochD};
 const raw:AveragePoint[]=[];
 for(let i=period-1;i<bars.length;i++){
  let high=-Infinity,low=Infinity;
  for(let j=i-period+1;j<=i;j++){high=Math.max(high,bars[j].high);low=Math.min(low,bars[j].low)}
  raw.push(point(bars,i,high===low?50:100*(bars[i].close-low)/(high-low)));
 }
 let sum=0;
 for(let i=0;i<raw.length;i++){sum+=raw[i].value;if(i>=smoothK)sum-=raw[i-smoothK].value;if(i>=smoothK-1)stochK.push({time:raw[i].time,value:sum/smoothK})}
 sum=0;
 for(let i=0;i<stochK.length;i++){sum+=stochK[i].value;if(i>=smoothD)sum-=stochK[i-smoothD].value;if(i>=smoothD-1)stochD.push({time:stochK[i].time,value:sum/smoothD})}
 return {stochK,stochD};
}
function cci(bars:readonly Candle[],period:number):AveragePoint[]{
 const out:AveragePoint[]=[],window:number[]=[];let sum=0;
 for(let i=0;i<bars.length;i++){
  const b=bars[i],value=(b.high+b.low+b.close)/3;window.push(value);sum+=value;
  if(window.length>period)sum-=window.shift()!;
  if(window.length<period)continue;
  const mean=sum/period;let deviation=0;for(const sample of window)deviation+=Math.abs(sample-mean);
  out.push(point(bars,i,deviation===0?0:(value-mean)/(0.015*deviation/period)));
 }
 return out;
}
function tr(bars:readonly Candle[],i:number){const b=bars[i],prev=bars[i-1]?.close;return Math.max(b.high-b.low,prev===undefined?0:Math.abs(b.high-prev),prev===undefined?0:Math.abs(b.low-prev))}
function atr(bars:readonly Candle[],period:number):AveragePoint[]{
 const out:AveragePoint[]=[];if(bars.length<period)return out;let mean=0;for(let i=0;i<period;i++)mean+=tr(bars,i);mean/=period;out.push(point(bars,period-1,mean));
 for(let i=period;i<bars.length;i++){mean=(mean*(period-1)+tr(bars,i))/period;out.push(point(bars,i,mean))}return out;
}
function macd(bars:readonly Candle[],fast:number,slow:number,signal:number):OscillatorValues{
 const values=bars.map(b=>b.close),f=ema(values,fast),s=ema(values,slow),out={macd:[],signal:[],histogram:[]} as OscillatorValues;let smooth:number|null=null,ready=0;
 for(let i=0;i<bars.length;i++){if(f[i]===null||s[i]===null)continue;const value=f[i]!-s[i]!;out.macd.push(point(bars,i,value));ready++;smooth=smooth===null?value:smooth+2/(signal+1)*(value-smooth);if(ready<signal)continue;out.signal.push(point(bars,i,smooth));out.histogram.push({...point(bars,i,value-smooth),color:value>=smooth?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)"} as AveragePoint)}return out;
}
function adx(bars:readonly Candle[],period:number):OscillatorValues{
 const out={adx:[],plusDi:[],minusDi:[]} as OscillatorValues;if(bars.length<=period)return out;
 const trValues:number[]=[],plus:number[]=[],minus:number[]=[];
 for(let i=1;i<bars.length;i++){const a=bars[i],b=bars[i-1],u=a.high-b.high,d=b.low-a.low;trValues[i]=tr(bars,i);plus[i]=u>d&&u>0?u:0;minus[i]=d>u&&d>0?d:0}
 let t=0,p=0,m=0;for(let i=1;i<=period;i++){t+=trValues[i];p+=plus[i];m+=minus[i]}
 const dxValues:number[]=[];let average:number|null=null;
 for(let i=period;i<bars.length;i++){if(i>period){t=t-t/period+trValues[i];p=p-p/period+plus[i];m=m-m/period+minus[i]}
  const pd=t>0?100*p/t:0,md=t>0?100*m/t:0,total=pd+md,dx=total>0?100*Math.abs(pd-md)/total:0;
  out.plusDi.push(point(bars,i,pd));out.minusDi.push(point(bars,i,md));
  if(dxValues.length<period){dxValues.push(dx);if(dxValues.length===period){average=dxValues.reduce((a,v)=>a+v,0)/period;out.adx.push(point(bars,i,average))}}
  else{average=(average!*(period-1)+dx)/period;out.adx.push(point(bars,i,average))}
 }return out;
}
export function calculateOscillator(input:readonly Candle[],kind:OscillatorKind,settings:OscillatorSettings):OscillatorValues{
 const bars=checkBars(input);
 validateSettings(kind,settings);
 if(kind==="macd")return macd(bars,(settings as {fast:number}).fast,(settings as {slow:number}).slow,(settings as {signal:number}).signal);
 if(kind==="stochastic")return stochastic(bars,(settings as {period:number}).period,(settings as {smoothK:number}).smoothK,(settings as {smoothD:number}).smoothD);
 if(kind==="cci")return {cci:cci(bars,(settings as {period:number}).period)};
 if(kind==="rsi")return {rsi:rsi(bars,(settings as {period:number}).period)};
 if(kind==="atr")return {atr:atr(bars,(settings as {period:number}).period)};
 if(kind==="adx")return adx(bars,(settings as {period:number}).period);
 throw Error("Unknown oscillator kind");
}

type StreamState=
 |{kind:"rsi";count:number;gainSum:number;lossSum:number;gain:number|null;loss:number|null}
 |{kind:"atr";count:number;sum:number;average:number|null}
 |{kind:"macd";fast:number|null;slow:number|null;signal:number|null;ready:number}
 |{kind:"adx";tr:number;plus:number;minus:number;dxCount:number;dxSum:number;average:number|null}
 |{kind:"stochastic";raw:number[];k:number[];sumRaw:number;sumK:number}
 |{kind:"cci";window:number[];sum:number};
type StreamStep={state:StreamState;points:OscillatorValues};
function initialState(kind:OscillatorKind):StreamState{
 if(kind==="rsi")return {kind,count:0,gainSum:0,lossSum:0,gain:null,loss:null};
 if(kind==="atr")return {kind,count:0,sum:0,average:null};
 if(kind==="macd")return {kind,fast:null,slow:null,signal:null,ready:0};
 if(kind==="adx")return {kind,tr:0,plus:0,minus:0,dxCount:0,dxSum:0,average:null};
 if(kind==="cci")return {kind,window:[],sum:0};
 return {kind,raw:[],k:[],sumRaw:0,sumK:0};
}
function oscillatorStep(state:StreamState,bar:Candle,index:number,previous:Candle|undefined,bars:readonly Candle[],settings:OscillatorSettings):StreamStep{
 const points:OscillatorValues={};
 const add=(key:string,value:number,color?:string)=>{
  const row:AveragePoint&{color?:string}={time:bar.time,value};if(color)row.color=color;points[key]=[row];
 };
 if(state.kind==="rsi"){
  const period=(settings as {period:number}).period;
  if(index===0)return {state,points};
  const delta=bar.close-previous!.close;let gain=state.gain,loss=state.loss,count=state.count,gainSum=state.gainSum,lossSum=state.lossSum;
  if(count<period){gainSum+=Math.max(delta,0);lossSum+=Math.max(-delta,0);count++;if(count===period){gain=gainSum/period;loss=lossSum/period}}
  else{gain=(gain!*(period-1)+Math.max(delta,0))/period;loss=(loss!*(period-1)+Math.max(-delta,0))/period}
  if(count>=period){const g=gain!,d=loss!,value=g===0&&d===0?50:d===0?100:g===0?0:100-100/(1+g/d);add("rsi",value)}
  return {state:{kind:"rsi",count,gainSum,lossSum,gain,loss},points};
 }
 if(state.kind==="atr"){
  const period=(settings as {period:number}).period,current=tr(bars,index);let count=state.count,sum=state.sum,average=state.average;
  if(count<period){sum+=current;count++;if(count===period)average=sum/period}
  else average=(average!*(period-1)+current)/period;
  if(average!==null)add("atr",average);
  return {state:{kind:"atr",count,sum,average},points};
 }
 if(state.kind==="macd"){
  const {fast,slow,signal}=settings as {fast:number;slow:number;signal:number};
  const fastValue=state.fast===null?bar.close:state.fast+2/(fast+1)*(bar.close-state.fast);
  const slowValue=state.slow===null?bar.close:state.slow+2/(slow+1)*(bar.close-state.slow);
  let ready=state.ready,signalValue=state.signal;
  if(index>=slow-1){const value=fastValue-slowValue;ready++;signalValue=signalValue===null?value:signalValue+2/(signal+1)*(value-signalValue);add("macd",value);if(ready>=signal){add("signal",signalValue);add("histogram",value-signalValue,value>=signalValue?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)")}}
  return {state:{kind:"macd",fast:fastValue,slow:slowValue,signal:signalValue,ready},points};
 }
 if(state.kind==="adx"){
  const period=(settings as {period:number}).period;
  if(index===0)return {state,points};
  const up=bar.high-previous!.high,down=previous!.low-bar.low,currentTr=tr(bars,index);
  const currentPlus=up>down&&up>0?up:0,currentMinus=down>up&&down>0?down:0;
  let total=state.tr,plus=state.plus,minus=state.minus;
  if(index<=period){total+=currentTr;plus+=currentPlus;minus+=currentMinus}
  else{total=total-total/period+currentTr;plus=plus-plus/period+currentPlus;minus=minus-minus/period+currentMinus}
  if(index<period)return {state:{...state,tr:total,plus,minus},points};
  const pd=total>0?100*plus/total:0,md=total>0?100*minus/total:0,sum=pd+md,dx=sum>0?100*Math.abs(pd-md)/sum:0;
  let dxCount=state.dxCount,dxSum=state.dxSum,average=state.average;
  if(dxCount<period){dxCount++;dxSum+=dx;if(dxCount===period)average=dxSum/period}
  else average=(average!*(period-1)+dx)/period;
  add("plusDi",pd);add("minusDi",md);if(average!==null)add("adx",average);
  return {state:{kind:"adx",tr:total,plus,minus,dxCount,dxSum,average},points};
 }
 if(state.kind==="cci"){
  const period=(settings as {period:number}).period,value=(bar.high+bar.low+bar.close)/3;
  const window=[...state.window,value];let sum=state.sum+value;
  if(window.length>period)sum-=window.shift()!;
  if(window.length===period){const mean=sum/period;let deviation=0;for(const sample of window)deviation+=Math.abs(sample-mean);add("cci",deviation===0?0:(value-mean)/(0.015*deviation/period))}
  return {state:{kind:"cci",window,sum},points};
 }
 const {period,smoothK,smoothD}=settings as {period:number;smoothK:number;smoothD:number};
 let raw=state.raw,k=state.k,sumRaw=state.sumRaw,sumK=state.sumK;
 if(index>=period-1){
  let high=-Infinity,low=Infinity;
  for(let i=index-period+1;i<index;i++){high=Math.max(high,bars[i].high);low=Math.min(low,bars[i].low)}
  high=Math.max(high,bar.high);low=Math.min(low,bar.low);
  const rawValue=high===low?50:100*(bar.close-low)/(high-low),nextRaw=[...raw,rawValue];sumRaw+=rawValue;
  if(nextRaw.length>smoothK)sumRaw-=nextRaw.shift()!;
  raw=nextRaw;
  if(raw.length===smoothK){const kValue=sumRaw/smoothK;add("stochK",kValue);const nextK=[...k,kValue];sumK+=kValue;if(nextK.length>smoothD)sumK-=nextK.shift()!;k=nextK;if(k.length===smoothD)add("stochD",sumK/smoothD)}
 }
 return {state:{kind:"stochastic",raw,k,sumRaw,sumK},points};
}
export function createIncrementalOscillator(input:readonly Candle[],kind:OscillatorKind,settings:OscillatorSettings):IncrementalOscillator{
 validateSettings(kind,settings);
 const bars=checkBars(input),configuration={...settings};
 const keys=kind==="rsi"?["rsi"]:kind==="atr"?["atr"]:kind==="macd"?["macd","signal","histogram"]:kind==="adx"?["adx","plusDi","minusDi"]:kind==="cci"?["cci"]:["stochK","stochD"];
 const values:OscillatorValues=Object.fromEntries(keys.map(key=>[key,[]]));
 const snapshot=()=>Object.fromEntries(Object.entries(values).map(([key,points])=>[key,points.map(point=>({...point}))]));
 let state=initialState(kind),beforeCurrent=state;
 for(let index=0;index<bars.length;index++){
  beforeCurrent=state;const step=oscillatorStep(state,bars[index],index,bars[index-1],bars,configuration);state=step.state;
  for(const [key,points] of Object.entries(step.points))values[key].push(...points);
 }
 return {snapshot,updateLast(bar:Candle){
  if(!bar||!Number.isSafeInteger(bar.time)||bar.time<=0||![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)||bar.high<bar.low)throw Error("Invalid oscillator candle");
  const last=bars[bars.length-1],replace=last?.time===bar.time;
  if(last&&bar.time<last.time)throw Error("Cannot update oscillator history out of order");
  if(!replace&&bars.length>=MAX_OSCILLATOR_BARS)throw Error("Oscillator history limit reached");
  let index:number,previous:Candle|undefined,baseline:StreamState;
  if(replace){index=bars.length-1;previous=bars[index-1];baseline=beforeCurrent;bars[index]={...bar}}
  else{index=bars.length;previous=last;beforeCurrent=state;baseline=state;bars.push({...bar})}
  const step=oscillatorStep(baseline,bar,index,previous,bars,configuration);state=step.state;
  const delta:OscillatorValues={};
  for(const key of keys){const rows=step.points[key]??[],current=values[key];if(replace&&current.length&&current[current.length-1].time===bar.time)current.pop();
   if(rows.length){current.push(...rows);delta[key]=rows.map(point=>({...point}))}else delta[key]=[];
  }
  return delta;
 }};
}
function validateSettings(kind:OscillatorKind,settings:OscillatorSettings){
 if(!settings||typeof settings!=="object"||Array.isArray(settings))throw Error("Invalid oscillator settings");
 const keys=Object.keys(settings).sort().join(","),expected=kind==="macd"?"fast,signal,slow":kind==="stochastic"?"period,smoothD,smoothK":"period";
 if(keys!==expected)throw Error("Invalid oscillator settings");
 if(kind==="macd"){
  if(!("fast" in settings)||!bounded(settings.fast,2,300)||!bounded(settings.slow,3,300)||settings.fast>=settings.slow||!bounded(settings.signal,2,200))throw Error("Invalid MACD settings");
  return;
 }
 if(kind==="stochastic"){
  if(!("period" in settings)||!("smoothK" in settings)||!("smoothD" in settings)||
   !bounded(settings.period,2,200)||!bounded(settings.smoothK,1,100)||!bounded(settings.smoothD,1,100))
   throw Error("Invalid Stochastic settings");
  return;
 }
 if(!("period" in settings)||!bounded(settings.period,2,200))throw Error("Invalid oscillator period");
 if(kind!=="rsi"&&kind!=="atr"&&kind!=="adx"&&kind!=="cci")throw Error("Unknown oscillator kind");
}
