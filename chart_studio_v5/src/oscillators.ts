import type {Candle,AveragePoint} from "./adapter";

export type OscillatorKind="rsi"|"atr"|"macd"|"adx";
export type OscillatorSettings={period:number}|{fast:number;slow:number;signal:number};
export type OscillatorValues=Record<string,AveragePoint[]>;
const bounded=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;
function checkBars(input:readonly Candle[]):Candle[]{
 if(!Array.isArray(input)||input.length>150000)throw Error("Invalid oscillator history");
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
 if(kind==="macd"){
  if(!("fast" in settings)||!bounded(settings.fast,2,300)||!bounded(settings.slow,3,300)||settings.fast>=settings.slow||!bounded(settings.signal,2,200))throw Error("Invalid MACD settings");
  return macd(bars,settings.fast,settings.slow,settings.signal);
 }
 if(!("period" in settings)||!bounded(settings.period,2,200))throw Error("Invalid oscillator period");
 if(kind==="rsi")return {rsi:rsi(bars,settings.period)};
 if(kind==="atr")return {atr:atr(bars,settings.period)};
 if(kind==="adx")return adx(bars,settings.period);
 throw Error("Unknown oscillator kind");
}
