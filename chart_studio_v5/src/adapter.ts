/**
 * Opt-in native LWC v5 read-only adapter for the existing 2EAs Chart Studio.
 * No execution routes, broker writes, credentials or global MT5 state.
 * Rendering remains isolated until the v4 -> v5 migration acceptance gate.
 */
import {createChart, CandlestickSeries, LineSeries, HistogramSeries, TickMarkType, type ISeriesPrimitive, type LogicalRange, type Time, type UTCTimestamp} from "lightweight-charts";
import type {CanvasRenderingTarget2D} from "fancy-canvas";
import {calculateOscillator,createIncrementalOscillator,MAX_OSCILLATOR_BARS,type IncrementalOscillator,type OscillatorKind,type OscillatorSettings} from "./oscillators";
import {calculateVolumeZones,type VolumeZone,type VolumeZoneResult} from "./volume-zones";
export {createIncrementalOscillator};
export {calculateVolumeZones};
export const VERSION = "5.2.1";
export type Candle = {time:UTCTimestamp;open:number;high:number;low:number;close:number;tick_volume?:number;real_volume?:number};
export type AveragePoint = {time:UTCTimestamp;value:number};
export type AverageOptions = {id:string;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
export type MovingAverageOptions = AverageOptions&{type:"EMA"|"SMA"|"WMA"|"RMA"|"SMMA";period:number;source?:"close"|"open"|"high"|"low"|"hl2"|"hlc3"|"ohlc4";displayShift?:number};
export type DonchianOptions = AverageOptions&{period:number};
export type BollingerOptions = AverageOptions&{period?:number;stdDev?:number};
export type SessionVwapOptions = AverageOptions&{timeZone?:string;sessionStart?:string};
export type SessionVwapResult = {points:AveragePoint[];volumeSource:"REAL_VOLUME"|"TICK_VOLUME_PROXY"|"MIXED"|"NO_VOLUME"};
export type KeltnerOptions = AverageOptions&{period:number;atrPeriod:number;multiplier:number};
export type AtrBandsOptions = AverageOptions&{period?:number;atrPeriod?:number;multiplier?:number};
export type LinearRegressionOptions = AverageOptions&{period:number;multiplier:number};
export type SupertrendOptions = AverageOptions&{period:number;multiplier:number};
export type ParabolicSarOptions = AverageOptions&{step:number;maxStep:number};
export type VolumeZonesOptions = {timeframeSeconds:number;lookback?:number;multiplier?:number;visible?:boolean};
export type VolumeZonesAsOf = {source:"MT5_VERIFIED";account:string;symbol:string;timeframe:string;timeUtc:number};
export type AutoFibonacciOptions = {timeframeSeconds:number;visible?:boolean};
export type IchimokuOptions = AverageOptions&{tenkanPeriod?:number;kijunPeriod?:number;senkouBPeriod?:number;displacement?:number};
export type IchimokuPoint = AveragePoint&{sourceTime:UTCTimestamp;projected?:true};
export type IchimokuValues = {tenkan:IchimokuPoint[];kijun:IchimokuPoint[];senkouA:IchimokuPoint[];senkouB:IchimokuPoint[];chikou:IchimokuPoint[]};
export type PivotPoint = AveragePoint&{sourceTime:UTCTimestamp;validFrom:UTCTimestamp;validTo:UTCTimestamp|null};
export type PivotValues = {available:boolean;algorithmVersion:"classic-floor-v1";source:"MT5_VERIFIED";basis:"D1"|"W1";reason?:string;lines:Record<"p"|"r1"|"r2"|"r3"|"s1"|"s2"|"s3",PivotPoint[]>};
export type PivotOptions = AverageOptions&{account:string;symbol:string;basis:"D1"|"W1";source:"MT5_VERIFIED";sourceWindow:{from:number;to:number}};
export type AutoFibonacciPivot = {type:"HIGH"|"LOW";time:UTCTimestamp;price:number;confirmedAt:UTCTimestamp};
export type AutoFibonacciLevel = {ratio:number;value:number|null;points:AveragePoint[]};
export type AutoFibonacciValues = {available:boolean;algorithmVersion:"confirmed-swing-auto-fib-v1";source:"MT5_VERIFIED";timeframe:string;swingStrength:2;reason:string|null;direction:"UP"|"DOWN"|null;start:AutoFibonacciPivot|null;end:AutoFibonacciPivot|null;confirmedAt:UTCTimestamp|null;lines:Record<"0"|"0.236"|"0.382"|"0.5"|"0.618"|"0.786"|"1",AutoFibonacciLevel>};
export type OscillatorOptions = {id:string;kind:OscillatorKind;settings:OscillatorSettings;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
export type PriceLevelOptions = {id:string;price:number;color:string;visible?:boolean;locked?:boolean};
export type TimeMarkerOptions = {id:string;time:UTCTimestamp;color:string;visible?:boolean;locked?:boolean};
export type TextAnnotationOptions = {id:string;time:UTCTimestamp;price:number;text:string;color:string;visible?:boolean;locked?:boolean};
export type TrendLineOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;color:string;visible?:boolean;locked?:boolean};
export type RectangleOptions = TrendLineOptions&{fill:boolean};
export type ChannelOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;offsetTime:UTCTimestamp;offsetPrice:number;color:string;visible?:boolean;locked?:boolean};
export type PitchforkOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;thirdTime:UTCTimestamp;thirdPrice:number;color:string;visible?:boolean;locked?:boolean};
export type RiskRewardOptions = {id:string;startTime:UTCTimestamp;entryPrice:number;stopTime:UTCTimestamp;stopPrice:number;endTime:UTCTimestamp;targetPrice:number;visible?:boolean;locked?:boolean};
export type MeasurementOptions = TrendLineOptions;
export type RayOptions = TrendLineOptions;
export type FibonacciOptions = TrendLineOptions&{levels?:number[]};
export type FibonacciFanOptions = TrendLineOptions&{ratios?:number[]};
export type TrendBasedFibonacciOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;thirdTime:UTCTimestamp;thirdPrice:number;color:string;ratios?:number[];visible?:boolean;locked?:boolean};
export type FibonacciTimeZoneOptions = {id:string;startTime:UTCTimestamp;endTime:UTCTimestamp;color:string;visible?:boolean;locked?:boolean};
export type ChartStorageScope = {symbol:string;timeframe:string};
export type PositionOverlayScope = {account:string;symbol:string;timeframe:string};
export type MarketLevelKey = "daily_high"|"daily_low"|"daily_poc"|"daily_vah"|"daily_val"|"weekly_high"|"weekly_low"|"weekly_poc"|"weekly_vah"|"weekly_val";
export type ReadOnlyMarketLevelsSnapshot = {scope:PositionOverlayScope;source:"MT5_VERIFIED";canExecute:false;asOfUtc:number;levels:Record<MarketLevelKey,number|null>;visible?:Partial<Record<MarketLevelKey,boolean>>};
export type ReadOnlyPositionOverlayPosition = {ticket:string;side:"BUY"|"SELL";entryPrice:number;stopLoss?:number|null;takeProfit?:number|null;volume:number;profit:number;swap:number;currency:string;usdConversion?:{state:"AVAILABLE";source:"ACCOUNT_CURRENCY"|"MT5_FX_QUOTE";amountsUsd:{profit:number;swap:number}}|{state:"UNAVAILABLE";source:"NONE";reason:string}};
export type ReadOnlyPositionOverlaySnapshot = {scope:PositionOverlayScope;source:"MT5_VERIFIED";canExecute:false;currency:string;marginMode:0|1|2;positions:ReadOnlyPositionOverlayPosition[]};
export type PositionOverlayLine = {ticket:string;side:"BUY"|"SELL";role:"Entry"|"SL"|"TP";price:number;label:string};
export type PositionOverlayLabel = {ticket:string;side:"BUY"|"SELL";volume:number;entryPrice:number;stopLoss:number|null;takeProfit:number|null;profit:number;swap:number;currency:string;label:string;usdProfit:number|null;usdSwap:number|null};
export type ReadOnlyBrokerDealMarker = {ticket:string;account:string;symbol:string;timeframe:string;side:"BUY"|"SELL";entry:"IN"|"OUT"|"INOUT"|"OUT_BY";price:number;fillTimeUtcMs:number;chartTimeSeconds:number;plotted:boolean;label:string};
export type ReadOnlyBrokerDealMarkerSnapshot = {scope:PositionOverlayScope;source:"MT5_VERIFIED";canExecute:false;markers:ReadOnlyBrokerDealMarker[]};
export type DataWindowReadout = {
 state:"AVAILABLE"|"UNAVAILABLE";account:string;source:"CHART_FEED";time:number;timeUtc:string;
 reason?:"BAR_NOT_LOADED";ohlc?:{open:number;high:number;low:number;close:number};
 volume?:{value:number|null;source:"REAL_VOLUME"|"TICK_VOLUME_PROXY"|"UNAVAILABLE"};
 volumeZones?:{status:VolumeZoneResult["status"];zones:Array<Pick<VolumeZone,"algorithmVersion"|"source"|"label"|"volume"|"medianVolume"|"threshold"|"multiplier"|"start"|"end"|"high"|"low">>};
 autoFibonacci?:Pick<AutoFibonacciValues,"algorithmVersion"|"source"|"timeframe"|"direction"|"start"|"end"|"confirmedAt">&{levels:Array<{ratio:number;value:number}>};
 indicators?:Array<{id:string;title:string;kind:"OVERLAY"|"PANE";value:number|null;direction?:"UP"|"DOWN";state:"AVAILABLE"|"WARMUP_OR_MISSING"}>;
};
export function calculateLinearRegressionChannel(input:readonly Candle[],period:number,multiplier:number):{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}{
 const upper:AveragePoint[]=[],middle:AveragePoint[]=[],lower:AveragePoint[]=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return {upper,middle,lower};
 const xMean=(period-1)/2,denominator=period*(period*period-1)/12;
 for(let end=period-1;end<input.length;end++){
  const window=input.slice(end-period+1,end+1);if(window.some(bar=>!bar||!Number.isFinite(bar.close)||!Number.isFinite(bar.time)))continue;
  let ySum=0;for(const bar of window)ySum+=bar.close;
  const yMean=ySum/period;let covariance=0;
  for(let x=0;x<period;x++)covariance+=(x-xMean)*(window[x].close-yMean);
  const slope=covariance/denominator,intercept=yMean-slope*xMean,center=intercept+slope*(period-1);
  let squaredResiduals=0;for(let x=0;x<period;x++){const residual=window[x].close-(intercept+slope*x);squaredResiduals+=residual*residual}
  const width=Math.sqrt(squaredResiduals/period)*multiplier,time=window[period-1].time;
  middle.push({time,value:center});upper.push({time,value:center+width});lower.push({time,value:center-width});
 }
 return {upper,middle,lower};
}
export function calculateIchimoku(input:readonly Candle[],options:{tenkanPeriod:number;kijunPeriod:number;senkouBPeriod:number;displacement:number;timeframe?:string}={tenkanPeriod:9,kijunPeriod:26,senkouBPeriod:52,displacement:26}):IchimokuValues{
 const values:IchimokuValues={tenkan:[],kijun:[],senkouA:[],senkouB:[],chikou:[]};
 const bars=input.filter(validBar).map(bar=>({...bar})).sort((a,b)=>a.time-b.time).filter((bar,index,all)=>index===0||bar.time!==all[index-1].time);
 const {tenkanPeriod,kijunPeriod,senkouBPeriod,displacement}=options??{};
 if(![tenkanPeriod,kijunPeriod,senkouBPeriod].every(value=>Number.isInteger(value)&&value>=2&&value<=200)||!Number.isInteger(displacement)||displacement<0||displacement>200)return values;
 const secondsByTimeframe:Record<string,number>={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800};
 const seconds=options.timeframe?secondsByTimeframe[options.timeframe]:undefined;
 const midpoint=(index:number,period:number)=>{if(index<period-1)return null;let high=-Infinity,low=Infinity;for(let j=index-period+1;j<=index;j++){high=Math.max(high,bars[j].high);low=Math.min(low,bars[j].low)}return (high+low)/2};
 const t=new Map<number,number>(),k=new Map<number,number>(),b=new Map<number,number>();
 for(let i=0;i<bars.length;i++){
  const tenkan=midpoint(i,tenkanPeriod),kijun=midpoint(i,kijunPeriod),spanB=midpoint(i,senkouBPeriod),time=bars[i].time as UTCTimestamp;
  if(tenkan!==null){t.set(i,tenkan);values.tenkan.push({time,sourceTime:time,value:tenkan})}
  if(kijun!==null){k.set(i,kijun);values.kijun.push({time,sourceTime:time,value:kijun})}
  if(spanB!==null)b.set(i,spanB);
  if(i>=displacement){const source=bars[i-displacement];values.chikou.push({time:source.time as UTCTimestamp,sourceTime:time,value:bars[i].close})}
 }
 for(let i=0;i<bars.length;i++){
  const target=i+displacement,sourceTime=bars[i].time as UTCTimestamp;
  let time:UTCTimestamp,projected=false;
  if(target<bars.length)time=bars[target].time as UTCTimestamp;
  else if(seconds&&bars.length){time=(bars[bars.length-1].time+(target-(bars.length-1))*seconds) as UTCTimestamp;projected=true}
  else continue;
  const tenkan=t.get(i),kijun=k.get(i),spanB=b.get(i);
  if(tenkan!==undefined&&kijun!==undefined)values.senkouA.push({time,sourceTime,value:(tenkan+kijun)/2,...(projected?{projected:true as const}:{})});
  if(spanB!==undefined)values.senkouB.push({time,sourceTime,value:spanB,...(projected?{projected:true as const}:{})});
 }
 return values;
}
export function calculatePivotPoints(sourceInput:readonly Candle[],targetInput:readonly Pick<Candle,"time">[],basis:"D1"|"W1"):PivotValues{
 const lines:PivotValues["lines"]={p:[],r1:[],r2:[],r3:[],s1:[],s2:[],s3:[]};
 const empty:PivotValues={available:false,algorithmVersion:"classic-floor-v1",source:"MT5_VERIFIED",basis,reason:"No confirmed MT5 source history.",lines};
 if((basis!=="D1"&&basis!=="W1")||!Array.isArray(sourceInput)||!Array.isArray(targetInput)||sourceInput.length<2)return empty;
 let previous=0;for(const bar of sourceInput){if(!validBar(bar)||!Number.isSafeInteger(bar.time)||bar.time<=previous)return {...empty,reason:"Malformed or unordered MT5 source candles."};previous=bar.time}
 let interval=0;for(const target of targetInput){const time=Number(target?.time);if(!Number.isSafeInteger(time)||time<=0)continue;while(interval+1<sourceInput.length-1&&time>=sourceInput[interval+2].time)interval++;if(time<sourceInput[1].time)continue;
  const current=sourceInput[interval],confirmedAt=sourceInput[interval+1].time,p=(current.high+current.low+current.close)/3,range=current.high-current.low;
  const values={p,r1:2*p-current.low,s1:2*p-current.high,r2:p+range,s2:p-range,r3:current.high+2*(p-current.low),s3:current.low-2*(current.high-p)},validTo=sourceInput[interval+2]?.time??null;
  for(const key of Object.keys(lines) as Array<keyof typeof lines>)lines[key].push({time:time as UTCTimestamp,value:values[key],sourceTime:current.time,validFrom:confirmedAt,validTo});
 }
 return {...empty,available:Object.values(lines).some(points=>points.length>0),reason:undefined,lines};
}
export function calculateAutoFibonacci(input:readonly Candle[],timeframe="M15",asOfUtc=Math.floor(Date.now()/1000)):AutoFibonacciValues{
 const ratios=[0,.236,.382,.5,.618,.786,1] as const,keys=["0","0.236","0.382","0.5","0.618","0.786","1"] as const;
 const cadences:Record<string,number>={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800},seconds=cadences[timeframe];
 const lines:AutoFibonacciValues["lines"]={"0":{ratio:0,value:null,points:[]},"0.236":{ratio:.236,value:null,points:[]},"0.382":{ratio:.382,value:null,points:[]},"0.5":{ratio:.5,value:null,points:[]},"0.618":{ratio:.618,value:null,points:[]},"0.786":{ratio:.786,value:null,points:[]},"1":{ratio:1,value:null,points:[]}};
 const empty:AutoFibonacciValues={available:false,algorithmVersion:"confirmed-swing-auto-fib-v1",source:"MT5_VERIFIED",timeframe,swingStrength:2,reason:"WARMUP_OR_MISSING",direction:null,start:null,end:null,confirmedAt:null,lines};
 if(!seconds||!Number.isSafeInteger(asOfUtc)||asOfUtc<=0||!Array.isArray(input)||input.length>MAX_OSCILLATOR_BARS)return {...empty,reason:"INVALID_INPUT_OR_TIMEFRAME"};
 let previous=0;for(const bar of input){if(!validBar(bar)||bar.time<=previous)return {...empty,reason:"INVALID_OHLC_ORDER_OR_TIMESTAMP"};previous=bar.time}
 const closed=input.filter(bar=>bar.time+seconds<=asOfUtc),pivots:AutoFibonacciPivot[]=[];
 for(let i=2;i<closed.length-2;i++){
  const bar=closed[i],left=closed.slice(i-2,i),right=closed.slice(i+1,i+3);
  const high=left.every(item=>bar.high>item.high)&&right.every(item=>bar.high>item.high),low=left.every(item=>bar.low<item.low)&&right.every(item=>bar.low<item.low);
  if(high===low)continue;
  const pivot:AutoFibonacciPivot={type:high?"HIGH":"LOW",time:bar.time as UTCTimestamp,price:high?bar.high:bar.low,confirmedAt:(closed[i+2].time+seconds) as UTCTimestamp};
  const prior=pivots[pivots.length-1];if(prior?.type===pivot.type){if(pivot.type==="HIGH"?pivot.price>prior.price:pivot.price<prior.price)pivots[pivots.length-1]=pivot}else pivots.push(pivot);
 }
 if(pivots.length<2)return empty;
 const start=pivots[pivots.length-2],end=pivots[pivots.length-1],direction=start.type==="LOW"&&end.type==="HIGH"?"UP":start.type==="HIGH"&&end.type==="LOW"?"DOWN":null,range=Math.abs(end.price-start.price);
 if(!direction||!Number.isFinite(range)||range<=0)return {...empty,reason:"NO_CONFIRMED_IMPULSE"};
 for(let i=0;i<ratios.length;i++){const ratio=ratios[i],value=direction==="UP"?end.price-range*ratio:end.price+range*ratio;if(!Number.isFinite(value))return {...empty,reason:"INVALID_LEVEL_PRICE"};lines[keys[i]]={ratio,value,points:input.filter(bar=>bar.time>=end.confirmedAt&&bar.time<=asOfUtc).map(bar=>({time:bar.time,value}))}}
 if(lines[keys[0]].points.length===0)return {...empty,reason:"NO_POST_CONFIRMATION_CANDLES",direction,start,end,confirmedAt:end.confirmedAt,lines};
 return {...empty,available:true,reason:null,direction,start,end,confirmedAt:end.confirmedAt,lines};
}
function utcDateForTime(time:Time):Date{
 if(typeof time==="number")return new Date(time*1000);
 if(typeof time==="string"){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(time);
  if(!match)throw Error("Invalid chart time");
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
 }
 return new Date(Date.UTC(time.year,time.month-1,time.day));
}
function timezoneParts(date:Date,formatter:Intl.DateTimeFormat){
 if(!Number.isFinite(date.getTime()))throw Error("Invalid chart time");
 const parts=formatter.formatToParts(date);
 return Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)])) as Record<"year"|"month"|"day"|"hour"|"minute"|"second",number>;
}
function utcOffsetSuffix(date:Date,local:Record<"year"|"month"|"day"|"hour"|"minute"|"second",number>){
 const localAsUtc=Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);
 const utcMinute=Math.floor(date.getTime()/60000)*60000,minutes=Math.round((localAsUtc-utcMinute)/60000);
 const absolute=Math.abs(minutes),hours=Math.trunc(absolute/60),remainder=absolute%60;
 return (minutes<0?"-":"+")+String(hours).padStart(2,"0")+(remainder?String(remainder).padStart(2,"0"):"");
}
function drawAnchorHandle(context:CanvasRenderingContext2D,x:number,y:number,color:string){
 context.save();context.fillStyle="#f8fafc";context.strokeStyle=color;context.lineWidth=2;
 context.beginPath();context.arc(x,y,6,0,Math.PI*2);context.fill();context.stroke();context.restore();
}
class PriceLevelPrimitive implements ISeriesPrimitive {
 private y:number|null=null;
 private selected=false;
 private visible=true;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private price:number,private color:string,visible=true){this.visible=visible}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.series=null;this.requestUpdate=null;this.y=null}
 updateAllViews(){this.y=this.series?.priceToCoordinate(this.price)??null}
 coordinate(){this.updateAllViews();return this.y}
 hitTest(_x:number,y:number){
  if(!this.visible)return null;
  const distance=this.y===null?null:Math.abs(this.y-y);
  if(distance===null||distance>6)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.y===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const y=this.y;if(y===null)return;
  target.useMediaCoordinateSpace(({context,mediaSize})=>{
   context.save();context.strokeStyle=this.color;context.lineWidth=this.selected?2:1;context.setLineDash([5,4]);
   context.beginPath();context.moveTo(0,y);context.lineTo(mediaSize.width,y);context.stroke();context.restore();
  });
 }} }]}
 set(price:number,color:string,visible=true){this.price=price;this.color=color;this.visible=visible;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class TimeMarkerPrimitive implements ISeriesPrimitive {
 private x:number|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private time:UTCTimestamp,private color:string,visible=true){this.visible=visible}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.requestUpdate=null;this.x=null}
 updateAllViews(){this.x=this.chart?.timeScale().timeToCoordinate(this.time)??null}
 coordinate(){this.updateAllViews();return this.x}
 hitTest(x:number,_y:number){
  if(!this.visible)return null;
  const distance=this.x===null?null:Math.abs(this.x-x);
  if(distance===null||distance>6)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.x===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const x=this.x;if(x===null)return;
  target.useMediaCoordinateSpace(({context,mediaSize})=>{
   context.save();context.strokeStyle=this.color;context.lineWidth=this.selected?2:1;context.setLineDash([3,4]);
   context.beginPath();context.moveTo(x,0);context.lineTo(x,mediaSize.height);context.stroke();context.restore();
  });
 }} }]}
 set(time:UTCTimestamp,color:string,visible=true){this.time=time;this.color=color;this.visible=visible;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class TextAnnotationPrimitive implements ISeriesPrimitive {
 private point:{x:number;y:number}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:TextAnnotationOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.point=null}
 updateAllViews(){
  const x=this.chart?.timeScale().timeToCoordinate(this.options.time)??null;
  const y=this.series?.priceToCoordinate(this.options.price)??null;
  this.point=x===null||y===null?null:{x,y};
 }
 coordinate(){this.updateAllViews();return this.point}
 hitTest(x:number,y:number){
  if(!this.visible||!this.point)return null;
  const left=this.point.x+7,top=this.point.y-18,width=this.options.text.length*7+12;
  if(x<left||x>left+width||y<top||y>top+21)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:2,distance:0};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.point===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const point=this.point;if(!point)return;
  target.useMediaCoordinateSpace(({context})=>{
   context.save();context.font="12px sans-serif";
   const width=context.measureText(this.options.text).width+12,left=point.x+7,top=point.y-18;
   context.fillStyle="rgba(9,25,35,0.94)";context.strokeStyle=this.options.color;
   context.lineWidth=this.selected?2:1;context.fillRect(left,top,width,21);context.strokeRect(left,top,width,21);
   context.fillStyle="#e8f2f6";context.textBaseline="middle";context.fillText(this.options.text,left+6,top+10.5);context.restore();
  });
 }} }]}
 set(options:TextAnnotationOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class TrendLinePrimitive implements ISeriesPrimitive {
 private points:{x1:number;y1:number;x2:number;y2:number}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:TrendLineOptions,private readout?:string){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.points=null}
 updateAllViews(){
  const x1=this.chart?.timeScale().timeToCoordinate(this.options.startTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null;
  const x2=this.chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  this.points=x1===null||y1===null||x2===null||y2===null?null:{x1,y1,x2,y2};
 }
 coordinates(){this.updateAllViews();return this.points}
 hitTest(x:number,y:number){
  if(!this.visible||!this.points)return null;
  const p=this.points;
  const dx=p.x2-p.x1,dy=p.y2-p.y1,length2=dx*dx+dy*dy;
  const t=length2===0?0:Math.max(0,Math.min(1,((x-p.x1)*dx+(y-p.y1)*dy)/length2));
  const distance=Math.hypot(x-(p.x1+t*dx),y-(p.y1+t*dy));
  return distance>6?null:{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:2,distance};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.points===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const p=this.points;if(!p)return;
  target.useMediaCoordinateSpace(({context})=>{
   context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;
   context.beginPath();context.moveTo(p.x1,p.y1);context.lineTo(p.x2,p.y2);context.stroke();
   if(this.readout){const text=this.readout;context.font="12px sans-serif";const width=context.measureText(text).width+12,x=(p.x1+p.x2)/2,y=(p.y1+p.y2)/2-20;context.fillStyle="rgba(9,25,35,0.94)";context.strokeStyle=this.options.color;context.fillRect(x-width/2,y-10,width,20);context.strokeRect(x-width/2,y-10,width,20);context.fillStyle="#e8f2f6";context.textBaseline="middle";context.textAlign="center";context.fillText(text,x,y)}
   context.restore();
   if(this.selected){drawAnchorHandle(context,p.x1,p.y1,this.options.color);drawAnchorHandle(context,p.x2,p.y2,this.options.color)}
  });
 }} }]}
 set(options:TrendLineOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setReadout(value:string){this.readout=value;this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class RayPrimitive implements ISeriesPrimitive {
 private points:{x1:number;y1:number;x2:number;y2:number}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:RayOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.points=null}
 updateAllViews(){
  const chart=this.chart,x1=chart?.timeScale().timeToCoordinate(this.options.startTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null;
  const x2=chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  if(!chart||x1===null||y1===null||x2===null||y2===null){this.points=null;return}
  const dx=x2-x1,dy=y2-y1,{width,height}=chart.paneSize();
  let endX:number,endY:number;
  if(Math.abs(dx)>0.001){endX=dx>0?width:0;endY=y1+dy*((endX-x1)/dx)}
  else{endX=x1;endY=dy>0?height:0}
  this.points={x1,y1,x2:endX,y2:endY};
 }
 coordinates(){this.updateAllViews();return this.points}
 hitTest(x:number,y:number){
  if(!this.visible||!this.points)return null;
  const p=this.points,dx=p.x2-p.x1,dy=p.y2-p.y1,length2=dx*dx+dy*dy;
  const t=length2===0?0:Math.max(0,Math.min(1,((x-p.x1)*dx+(y-p.y1)*dy)/length2));
  const distance=Math.hypot(x-(p.x1+t*dx),y-(p.y1+t*dy));
  return distance>6?null:{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.points===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const p=this.points;if(!p)return;
  target.useMediaCoordinateSpace(({context})=>{
   context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;
   context.beginPath();context.moveTo(p.x1,p.y1);context.lineTo(p.x2,p.y2);context.stroke();context.restore();
  });
 }} }]}
 set(options:RayOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
const FIBONACCI_RATIOS=[0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2.618] as const;
function fibonacciRatios(options:FibonacciOptions){
 return options.levels===undefined?FIBONACCI_RATIOS.map(ratio=>({level:ratio*100,ratio})):
  options.levels.map(level=>({level,ratio:level/100}));
}
class FibonacciPrimitive implements ISeriesPrimitive {
 private geometry:{x1:number;y1:number;x2:number;y2:number;levels:Array<{ratio:number;price:number;y:number}>}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:FibonacciOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.geometry=null}
 updateAllViews(){
  const chart=this.chart,x1=chart?.timeScale().timeToCoordinate(this.options.startTime)??null;
  const x2=chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null,y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  if(!chart||x1===null||x2===null||y1===null||y2===null||!this.series){this.geometry=null;return}
  const levels=fibonacciRatios(this.options).map(({ratio})=>{const price=this.options.startPrice+(this.options.endPrice-this.options.startPrice)*ratio,y=this.series!.priceToCoordinate(price);return y===null?null:{ratio,price,y}});
  if(levels.some(level=>level===null)){this.geometry=null;return}
  this.geometry={x1,y1,x2,y2,levels:levels as Array<{ratio:number;price:number;y:number}>};
 }
 coordinates(){this.updateAllViews();return this.geometry}
 hitTest(x:number,y:number){
  if(!this.visible||!this.geometry)return null;
  const {x1,x2,levels}=this.geometry;
  if(x<Math.min(x1,x2)-5||x>Math.max(x1,x2)+5)return null;
  const nearest=Math.min(...levels.map(level=>Math.abs(level.y-y)));
  return nearest>6?null:{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:nearest};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.geometry===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const g=this.geometry;if(!g)return;
  target.useMediaCoordinateSpace(({context})=>{
   context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1;
   for(const level of g.levels){context.beginPath();context.moveTo(g.x1,level.y);context.lineTo(g.x2,level.y);context.stroke()}
   context.restore();
   if(this.selected){drawAnchorHandle(context,g.x1,g.y1,this.options.color);drawAnchorHandle(context,g.x2,g.y2,this.options.color)}
  });
 }} }]}
 set(options:FibonacciOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
const FIBONACCI_FAN_RATIOS=[0.382,0.5,0.618] as const;
function fibonacciFanRatios(options:FibonacciFanOptions){return options.ratios===undefined?[...FIBONACCI_FAN_RATIOS]:[...options.ratios]}
type FibonacciFanRay={ratio:number;targetPrice:number;x1:number;y1:number;x2:number;y2:number};
class FibonacciFanPrimitive implements ISeriesPrimitive {
 private geometry:{x1:number;y1:number;x2:number;y2:number;rays:FibonacciFanRay[]}|null=null;
 private selected=false;private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:FibonacciFanOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.geometry=null}
 updateAllViews(){
  const chart=this.chart,x1=chart?.timeScale().timeToCoordinate(this.options.startTime)??null,x2=chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null,y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  if(!chart||!this.series||x1===null||x2===null||y1===null||y2===null){this.geometry=null;return}
  const {width,height}=chart.paneSize(),dx=x2-x1,ratios=fibonacciFanRatios(this.options),rays:FibonacciFanRay[]=[];
  if(Math.abs(dx)<1e-7||width<=0||height<=0){this.geometry=null;return}
  for(const ratio of ratios){
   const targetPrice=this.options.startPrice+(this.options.endPrice-this.options.startPrice)*ratio,targetY=this.series.priceToCoordinate(targetPrice);
   if(targetY===null){this.geometry=null;return}
   const rayDx=x2-x1,rayDy=targetY-y1,candidates:number[]=[];
   if(rayDx>0)candidates.push((width-x1)/rayDx);else if(rayDx<0)candidates.push((0-x1)/rayDx);
   if(rayDy>0)candidates.push((height-y1)/rayDy);else if(rayDy<0)candidates.push((0-y1)/rayDy);
   const positive=candidates.filter(value=>Number.isFinite(value)&&value>=0),scale=positive.length?Math.min(...positive):1;
   rays.push({ratio,targetPrice,x1,y1,x2:x1+rayDx*scale,y2:y1+rayDy*scale});
  }
  this.geometry={x1,y1,x2,y2,rays};
 }
 coordinates(){this.updateAllViews();return this.geometry?{x1:this.geometry.x1,y1:this.geometry.y1,x2:this.geometry.x2,y2:this.geometry.y2,rays:this.geometry.rays.map(ray=>({...ray}))}:null}
 hitTest(x:number,y:number){
  if(!this.visible||!this.geometry)return null;
  const distance=(ray:FibonacciFanRay)=>{const dx=ray.x2-ray.x1,dy=ray.y2-ray.y1,length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((x-ray.x1)*dx+(y-ray.y1)*dy)/length2)):0;return Math.hypot(x-(ray.x1+t*dx),y-(ray.y1+t*dy))};
  const nearest=Math.min(...this.geometry.rays.map(distance)),anchorDistance=Math.min(Math.hypot(x-this.geometry.x1,y-this.geometry.y1),Math.hypot(x-this.geometry.x2,y-this.geometry.y2));
  if(nearest>6&&anchorDistance>12)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:Math.min(nearest,anchorDistance)};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.geometry===null?null:{draw:(target:CanvasRenderingTarget2D)=>{const g=this.geometry;if(!g)return;target.useMediaCoordinateSpace(({context})=>{context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;for(const ray of g.rays){context.beginPath();context.moveTo(ray.x1,ray.y1);context.lineTo(ray.x2,ray.y2);context.stroke()}if(this.selected){drawAnchorHandle(context,g.x1,g.y1,this.options.color);drawAnchorHandle(context,g.x2,g.y2,this.options.color)}context.restore()})}}}]}
 set(options:FibonacciFanOptions){this.options={...options,ratios:options.ratios?[...options.ratios]:undefined};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
const TREND_FIB_RATIOS=[0,.382,.5,.618,1,1.618,2.618] as const;
function trendFibRatios(options:TrendBasedFibonacciOptions){return options.ratios===undefined?[...TREND_FIB_RATIOS]:[...options.ratios]}
type TrendFibLevel={ratio:number;price:number;y:number;x1:number;x2:number};
class TrendBasedFibonacciPrimitive implements ISeriesPrimitive {
 private geometry:{anchors:Array<{x:number;y:number}>;levels:TrendFibLevel[]}|null=null;
 private selected=false;private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:TrendBasedFibonacciOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.geometry=null}
 updateAllViews(){
  const chart=this.chart,series=this.series;if(!chart||!series){this.geometry=null;return}
  const anchors=[{time:this.options.startTime,price:this.options.startPrice},{time:this.options.endTime,price:this.options.endPrice},{time:this.options.thirdTime,price:this.options.thirdPrice}].map(anchor=>({x:chart.timeScale().timeToCoordinate(anchor.time)??null,y:series.priceToCoordinate(anchor.price)??null}));
  if(anchors.some(anchor=>anchor.x===null||anchor.y===null)){this.geometry=null;return}
  const {width,height}=chart.paneSize(),origin=anchors[2],x1=origin.x!,x2=width;
  if(width<=0||height<=0||x1>=width){this.geometry=null;return}
  const levels:TrendFibLevel[]=[];
  for(const ratio of trendFibRatios(this.options)){
   const price=this.options.thirdPrice+(this.options.endPrice-this.options.startPrice)*ratio,y=series.priceToCoordinate(price);
   if(y!==null&&y>=0&&y<=height)levels.push({ratio,price,y,x1,x2});
  }
  this.geometry={anchors:anchors as Array<{x:number;y:number}>,levels};
 }
 coordinates(){this.updateAllViews();return this.geometry?{anchors:this.geometry.anchors.map(anchor=>({...anchor})),levels:this.geometry.levels.map(level=>({...level}))}:null}
 hitTest(x:number,y:number){if(!this.visible||!this.geometry)return null;const anchorDistance=Math.min(...this.geometry.anchors.map(anchor=>Math.hypot(x-anchor.x,y-anchor.y))),lineDistance=Math.min(...this.geometry.levels.map(level=>x>=level.x1-4&&x<=level.x2+4?Math.abs(y-level.y):Infinity));if(anchorDistance>12&&lineDistance>6)return null;return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:Math.min(anchorDistance,lineDistance)}}
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.geometry===null?null:{draw:(target:CanvasRenderingTarget2D)=>{const g=this.geometry;if(!g)return;target.useMediaCoordinateSpace(({context})=>{context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;for(const level of g.levels){context.beginPath();context.moveTo(level.x1,level.y);context.lineTo(level.x2,level.y);context.stroke()}if(this.selected)for(const anchor of g.anchors)drawAnchorHandle(context,anchor.x,anchor.y,this.options.color);context.restore()})}}}]}
 set(options:TrendBasedFibonacciOptions){this.options={...options,ratios:options.ratios?[...options.ratios]:undefined};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
const FIBONACCI_TIME_FACTORS=[0,1,2,3,5,8,13,21,34,55] as const;
class FibonacciTimeZonePrimitive implements ISeriesPrimitive {
 private guides:Array<{factor:number;time:number;x:number}>|null=null;
 private selected=false; private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private options:FibonacciTimeZoneOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.requestUpdate=null;this.guides=null}
 updateAllViews(){
  const chart=this.chart;if(!chart){this.guides=null;return}
  const interval=this.options.endTime-this.options.startTime;
  const startX=chart.timeScale().timeToCoordinate(this.options.startTime),endX=chart.timeScale().timeToCoordinate(this.options.endTime);
  if(startX===null||endX===null){this.guides=null;return}
  this.guides=FIBONACCI_TIME_FACTORS.map(factor=>{const time=this.options.startTime+interval*factor,projected=chart.timeScale().timeToCoordinate(time as UTCTimestamp),x=projected??startX+(endX-startX)*factor;return {factor,time,x}});
 }
 coordinates(){this.updateAllViews();return this.guides}
 hitTest(x:number,y:number){if(!this.visible||!this.guides)return null;const nearest=Math.min(...this.guides.map(guide=>Math.abs(guide.x-x)));return nearest>6?null:{externalId:this.options.id,zOrder:"top" as const,cursorStyle:"ew-resize",hitTestPriority:1,distance:nearest}}
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.guides===null?null:{draw:(target:CanvasRenderingTarget2D)=>{const guides=this.guides;if(!guides)return;target.useMediaCoordinateSpace(({context})=>{context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.25;for(const guide of guides){context.beginPath();context.moveTo(guide.x,0);context.lineTo(guide.x,context.canvas.height);context.stroke()}if(this.selected){const start=guides.find(guide=>guide.factor===0),end=guides.find(guide=>guide.factor===1);if(start)drawAnchorHandle(context,start.x,20,this.options.color);if(end)drawAnchorHandle(context,end.x,20,this.options.color)}context.restore()})}}}]}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
 setOptions(options:FibonacciTimeZoneOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
}
class RectanglePrimitive implements ISeriesPrimitive {
 private rect:{left:number;top:number;right:number;bottom:number}|null=null;
 private anchors:{x1:number;y1:number;x2:number;y2:number}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:RectangleOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.rect=null;this.anchors=null}
 updateAllViews(){
  const x1=this.chart?.timeScale().timeToCoordinate(this.options.startTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null;
  const x2=this.chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  this.anchors=x1===null||y1===null||x2===null||y2===null?null:{x1,y1,x2,y2};
  this.rect=this.anchors===null?null:{left:Math.min(x1!,x2!),top:Math.min(y1!,y2!),right:Math.max(x1!,x2!),bottom:Math.max(y1!,y2!)};
 }
 coordinates(){this.updateAllViews();return this.rect}
 hitTest(x:number,y:number){
  if(!this.visible||!this.rect)return null;
  const r=this.rect,inside=x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
  const edgeDistance=inside?Math.min(x-r.left,r.right-x,y-r.top,r.bottom-y):
   Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));
  if((this.options.fill&&inside)||edgeDistance<=6)return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:0,distance:this.options.fill&&inside?0:edgeDistance};
  return null;
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.rect===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const r=this.rect;if(!r)return;
  target.useMediaCoordinateSpace(({context})=>{
   context.save();if(this.options.fill){context.globalAlpha=0.14;context.fillStyle=this.options.color;context.fillRect(r.left,r.top,r.right-r.left,r.bottom-r.top);context.globalAlpha=1}
   context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;context.strokeRect(r.left,r.top,r.right-r.left,r.bottom-r.top);context.restore();
   if(this.selected&&this.anchors){drawAnchorHandle(context,this.anchors.x1,this.anchors.y1,this.options.color);drawAnchorHandle(context,this.anchors.x2,this.anchors.y2,this.options.color)}
  });
 }} }]}
 set(options:RectangleOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class ChannelPrimitive implements ISeriesPrimitive {
 private geometry:{a:{x:number;y:number};b:{x:number;y:number};c:{x:number;y:number};d:{x:number;y:number};m1:{x:number;y:number};m2:{x:number;y:number}}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:ChannelOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.geometry=null}
 updateAllViews(){
  const chart=this.chart,series=this.series;
  const timeX=(time:number)=>chart?.timeScale().timeToCoordinate(time as UTCTimestamp)??null;
  const priceY=(value:number)=>series?.priceToCoordinate(value)??null;
  const ax=timeX(this.options.startTime),ay=priceY(this.options.startPrice),bx=timeX(this.options.endTime),by=priceY(this.options.endPrice),cx=timeX(this.options.offsetTime),cy=priceY(this.options.offsetPrice);
  if(ax===null||ay===null||bx===null||by===null||cx===null||cy===null){this.geometry=null;return}
  const slope=Math.abs(bx-ax)<1e-7?0:(by-ay)/(bx-ax),shift=cy-(ay+slope*(cx-ax));
  this.geometry={a:{x:ax,y:ay},b:{x:bx,y:by},c:{x:cx,y:cy},d:{x:bx,y:by+shift},m1:{x:ax,y:ay+shift/2},m2:{x:bx,y:by+shift/2}};
 }
 coordinates(){this.updateAllViews();return this.geometry}
 hitTest(x:number,y:number){
  if(!this.visible||!this.geometry)return null;
  const g=this.geometry,c={x:g.a.x,y:g.a.y+(g.d.y-g.b.y)},segments=[[g.a,g.b],[c,g.d],[g.m1,g.m2]] as const;
  let nearest=Infinity;
  for(const [p,q] of segments){const dx=q.x-p.x,dy=q.y-p.y,len=dx*dx+dy*dy,t=len===0?0:Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/len));nearest=Math.min(nearest,Math.hypot(x-(p.x+t*dx),y-(p.y+t*dy)))}
  return nearest>7?null:{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:nearest};
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.geometry===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const g=this.geometry;if(!g)return;
  target.useMediaCoordinateSpace(({context})=>{
   const c={x:g.a.x,y:g.a.y+(g.d.y-g.b.y)};
   context.save();context.beginPath();context.moveTo(g.a.x,g.a.y);context.lineTo(g.b.x,g.b.y);context.lineTo(g.d.x,g.d.y);context.lineTo(c.x,c.y);context.closePath();context.globalAlpha=.08;context.fillStyle=this.options.color;context.fill();context.globalAlpha=1;
   context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;context.beginPath();context.moveTo(g.a.x,g.a.y);context.lineTo(g.b.x,g.b.y);context.stroke();context.beginPath();context.moveTo(c.x,c.y);context.lineTo(g.d.x,g.d.y);context.stroke();context.setLineDash([3,4]);context.beginPath();context.moveTo(g.m1.x,g.m1.y);context.lineTo(g.m2.x,g.m2.y);context.stroke();context.restore();
   if(this.selected){drawAnchorHandle(context,g.a.x,g.a.y,this.options.color);drawAnchorHandle(context,g.b.x,g.b.y,this.options.color);drawAnchorHandle(context,g.c.x,g.c.y,this.options.color)}
  });
 }} }]}
 set(options:ChannelOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class PitchforkPrimitive implements ISeriesPrimitive {
 private points:{a:{x:number;y:number};b:{x:number;y:number};c:{x:number;y:number};m:{x:number;y:number};direction:{x:number;y:number};segments:Array<[{x:number;y:number},{x:number;y:number}]>}|null=null;
 private selected=false;private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:PitchforkOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.points=null}
 updateAllViews(){
  const chart=this.chart,series=this.series;if(!chart||!series){this.points=null;return}
  const point=(time:number,price:number)=>{const x=chart.timeScale().timeToCoordinate(time as UTCTimestamp),y=series.priceToCoordinate(price);return x===null||y===null?null:{x,y}};
  const a=point(this.options.startTime,this.options.startPrice),b=point(this.options.endTime,this.options.endPrice),c=point(this.options.thirdTime,this.options.thirdPrice);
  if(!a||!b||!c){this.points=null;return}
  const m={x:(b.x+c.x)/2,y:(b.y+c.y)/2},direction={x:m.x-a.x,y:m.y-a.y},width=chart.timeScale().width(),height=chart.panes()[0]?.getHeight()??0;
  const clip=(origin:{x:number;y:number})=>{let lo=0,hi=Infinity;for(const [p,d,max] of [[origin.x,direction.x,width],[origin.y,direction.y,height]] as const){if(Math.abs(d)<1e-9){if(p<0||p>max)return null;continue}const near=(0-p)/d,far=(max-p)/d;lo=Math.max(lo,Math.min(near,far));hi=Math.min(hi,Math.max(near,far))}if(hi<Math.max(lo,0))return null;const t=Math.max(lo,0),end=Number.isFinite(hi)?hi:100000;return [{x:origin.x+t*direction.x,y:origin.y+t*direction.y},{x:origin.x+end*direction.x,y:origin.y+end*direction.y}] as [{x:number;y:number},{x:number;y:number}]};
  const rays=[clip(a),clip(b),clip(c)];this.points={a,b,c,m,direction,segments:rays.filter((ray):ray is [{x:number;y:number},{x:number;y:number}]=>ray!==null)};
 }
 coordinates(){this.updateAllViews();return this.points}
 hitTest(x:number,y:number){if(!this.visible||!this.points)return null;let nearest=Infinity;for(const [a,b] of this.points.segments){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0;nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,y-a.y-t*dy))}return nearest>8?null:{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:nearest}}
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.points===null?null:{draw:(target:CanvasRenderingTarget2D)=>{const p=this.points;if(!p)return;target.useMediaCoordinateSpace(({context})=>{context.save();context.strokeStyle=this.options.color;context.lineWidth=this.selected?2:1.5;context.setLineDash([4,3]);for(const [a,b] of p.segments){context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke()}context.setLineDash([]);if(this.selected){drawAnchorHandle(context,p.a.x,p.a.y,this.options.color);drawAnchorHandle(context,p.b.x,p.b.y,this.options.color);drawAnchorHandle(context,p.c.x,p.c.y,this.options.color)}context.restore()})}}}]}
 set(options:PitchforkOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class MeasurementPrimitive extends TrendLinePrimitive {}
class RiskRewardPrimitive implements ISeriesPrimitive {
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 private geometry:{x1:number;x2:number;entryY:number;stopY:number;targetY:number;ratio:number}|null=null;
 private visible=true;private selected=false;
 constructor(private id:string,private options:RiskRewardOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews()}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.geometry=null}
 updateAllViews(){
  const chart=this.chart,series=this.series;if(!chart||!series){this.geometry=null;return}
  const x1=chart.timeScale().timeToCoordinate(this.options.startTime),x2=chart.timeScale().timeToCoordinate(this.options.endTime);
  const entryY=series.priceToCoordinate(this.options.entryPrice),stopY=series.priceToCoordinate(this.options.stopPrice),targetY=series.priceToCoordinate(this.options.targetPrice);
  if(x1===null||x2===null||entryY===null||stopY===null||targetY===null){this.geometry=null;return}
  this.geometry={x1,x2,entryY,stopY,targetY,ratio:Math.abs(this.options.targetPrice-this.options.entryPrice)/Math.abs(this.options.entryPrice-this.options.stopPrice)};
 }
 coordinates(){this.updateAllViews();return this.geometry}
 hitTest(x:number,y:number){
  if(!this.visible||!this.geometry)return null;const g=this.geometry,left=Math.min(g.x1,g.x2),right=Math.max(g.x1,g.x2);
  const inZone=(a:number,b:number)=>x>=left&&x<=right&&y>=Math.min(a,b)&&y<=Math.max(a,b);
  if(inZone(g.entryY,g.stopY)||inZone(g.entryY,g.targetY))return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:0};
  const yDistance=Math.min(Math.abs(y-g.entryY),Math.abs(y-g.stopY),Math.abs(y-g.targetY));
  return x>=left-5&&x<=right+5&&yDistance<=6?{externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance:yDistance}:null;
 }
 paneViews(){return !this.visible?[]:[{zOrder:()=>"top" as const,renderer:()=>this.geometry===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const g=this.geometry;if(!g)return;const left=Math.min(g.x1,g.x2),width=Math.abs(g.x2-g.x1);
  target.useMediaCoordinateSpace(({context})=>{
   const band=(a:number,b:number,color:string,label:string)=>{const top=Math.min(a,b),height=Math.abs(a-b);context.fillStyle=color;context.fillRect(left,top,width,height);context.strokeStyle=color.replace(".16)",".9)");context.lineWidth=this.selected?2:1;context.strokeRect(left,top,width,height);context.fillStyle="#e8f4ff";context.font="12px sans-serif";context.textAlign="right";context.textBaseline="bottom";context.fillText(label,Math.max(left+48,left+width-5),top+height-2)};
   context.save();band(g.entryY,g.stopY,"rgba(248,113,113,.16)","RISK");band(g.entryY,g.targetY,"rgba(65,216,154,.16)",`REWARD · R:R ${g.ratio.toFixed(2)}`);context.strokeStyle="#f4d35e";context.lineWidth=this.selected?2:1;context.setLineDash([4,3]);context.beginPath();context.moveTo(left,g.entryY);context.lineTo(left+width,g.entryY);context.stroke();context.setLineDash([]);context.restore();
   if(this.selected){drawAnchorHandle(context,g.x1,g.entryY,"#f4d35e");drawAnchorHandle(context,(g.x1+g.x2)/2,g.stopY,"#f87171");drawAnchorHandle(context,g.x2,g.targetY,"#41d89a")}
  });
 }} }]}
 set(options:RiskRewardOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class IchimokuCloudPrimitive implements ISeriesPrimitive {
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 private values:IchimokuValues={tenkan:[],kijun:[],senkouA:[],senkouB:[],chikou:[]};
 constructor(private visible:boolean=true){}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null}
 updateAllViews(){}
 paneViews(){if(!this.visible)return [];return [{zOrder:()=>"bottom" as const,renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>{
  const chart=this.chart,series=this.series;if(!chart||!series)return;
  const lower=new Map(this.values.senkouB.map(point=>[point.time,point]));
  target.useMediaCoordinateSpace(({context})=>{
   context.save();for(let i=0;i<this.values.senkouA.length-1;i++){
    const a0=this.values.senkouA[i],a1=this.values.senkouA[i+1],b0=lower.get(a0.time),b1=lower.get(a1.time);if(!b0||!b1)continue;
    const pts=[[chart.timeScale().timeToCoordinate(a0.time),series.priceToCoordinate(a0.value)],[chart.timeScale().timeToCoordinate(a1.time),series.priceToCoordinate(a1.value)],[chart.timeScale().timeToCoordinate(b1.time),series.priceToCoordinate(b1.value)],[chart.timeScale().timeToCoordinate(b0.time),series.priceToCoordinate(b0.value)]];
    if(pts.some(([x,y])=>x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y)))continue;
    const d0=a0.value-b0.value,d1=a1.value-b1.value,fill=(poly:readonly (readonly [number,number])[],green:boolean)=>{context.beginPath();context.moveTo(poly[0][0],poly[0][1]);for(let j=1;j<poly.length;j++)context.lineTo(poly[j][0],poly[j][1]);context.closePath();context.fillStyle=green?"rgba(65,216,154,.12)":"rgba(244,119,137,.12)";context.fill()};
    if(d0*d1<0){const t=d0/(d0-d1),cross:[number,number]=[pts[0][0]!+(pts[1][0]!-pts[0][0]!)*t,pts[0][1]!+(pts[1][1]!-pts[0][1]!)*t];fill([[pts[0][0]!,pts[0][1]!],cross,[pts[3][0]!,pts[3][1]!]],d0>0);fill([cross,[pts[1][0]!,pts[1][1]!],[pts[2][0]!,pts[2][1]!]],d1>0)}else fill(pts.map(([x,y])=>[x!,y!] as [number,number]),(d0===0?d1:d0)>=0);
   }context.restore();
  });
 }})}]}
 set(values:IchimokuValues,visible:boolean){this.values=values;this.visible=visible;this.requestUpdate?.()}
}
class VolumeZonePrimitive implements ISeriesPrimitive {
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private result:VolumeZoneResult,private visible=true){}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate}
 detached(){this.chart=null;this.series=null;this.requestUpdate=null}
 updateAllViews(){}
 paneViews(){if(!this.visible)return [];return [{zOrder:()=>"bottom" as const,renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>{
  const chart=this.chart,series=this.series;if(!chart||!series)return;
  target.useMediaCoordinateSpace(({context,mediaSize})=>{
   const scale=chart.timeScale();for(const zone of this.result.zones){const x1=scale.timeToCoordinate(zone.start);let x2:number|null=scale.timeToCoordinate(zone.end);
    if(x2===null&&zone.end===zone.observedEnd){const last=scale.timeToCoordinate(zone.lastClosedBarTime),previous=zone.previousClosedBarTime===null?null:scale.timeToCoordinate(zone.previousClosedBarTime);if(last!==null&&Number.isFinite(last))x2=last+(previous!==null&&last>previous?last-previous:0)}
    const a=series.priceToCoordinate(zone.high),b=series.priceToCoordinate(zone.low);if(x1===null||x2===null||a===null||b===null||![x1,x2,a,b].every(Number.isFinite))continue;
    const left=Math.max(0,Math.min(x1,x2)),right=Math.min(mediaSize.width,Math.max(x1,x2)),top=Math.max(0,Math.min(a,b)),bottom=Math.min(mediaSize.height,Math.max(a,b));if(right<=left||bottom<=top)continue;
    context.save();context.fillStyle=zone.source==="REAL_VOLUME"?"rgba(244,211,94,.14)":"rgba(255,174,87,.11)";context.strokeStyle=zone.source==="REAL_VOLUME"?"rgba(244,211,94,.8)":"rgba(255,174,87,.8)";context.setLineDash(zone.source==="REAL_VOLUME"?[]:[4,3]);context.fillRect(left,top,right-left,bottom-top);context.strokeRect(left,top,right-left,bottom-top);context.setLineDash([]);context.font="10px sans-serif";context.fillStyle="#fff1cf";context.fillText(zone.label+" · "+zone.multiplier+"× Median",left+3,Math.max(11,top+11),Math.max(20,right-left-6));context.restore();
   }
  });
 }})}]}
 set(result:VolumeZoneResult,visible:boolean){this.result=result;this.visible=visible;this.requestUpdate?.()}
}
class BrokerDealMarkersPrimitive implements ISeriesPrimitive {
 private markers:ReadOnlyBrokerDealMarker[]=[];
 private requestUpdate:(()=>void)|null=null;
 constructor(private readonly chart:Pick<ReturnType<typeof createChart>,"timeScale">,private readonly series:{priceToCoordinate(price:number):number|null}){}
 attached(param:{requestUpdate:()=>void}){this.requestUpdate=param.requestUpdate}
 detached(){this.requestUpdate=null}
 set(markers:readonly ReadOnlyBrokerDealMarker[]){this.markers=markers.map(marker=>({...marker}));this.requestUpdate?.()}
 paneViews(){
  const chart=this.chart,series=this.series,markers=this.markers;
  return [{zOrder:()=>"top" as const,renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context})=>{
   context.save();
   for(const marker of markers){
    if(!marker.plotted)continue;
    const x=chart.timeScale().timeToCoordinate(marker.chartTimeSeconds as UTCTimestamp),y=series.priceToCoordinate(marker.price);
    if(x===null||y===null)continue;
    const color=marker.side==="BUY"?"#49c6ff":"#ffb84d";context.fillStyle=color;context.strokeStyle="#07131d";context.lineWidth=1.5;
    context.beginPath();context.arc(x,y,6,0,Math.PI*2);context.fill();context.stroke();
    context.fillStyle="#061018";context.font="bold 8px sans-serif";context.textAlign="center";context.textBaseline="middle";
    context.fillText(({IN:"+",OUT:"−",INOUT:"↔",OUT_BY:"×"} as Record<ReadOnlyBrokerDealMarker["entry"],string>)[marker.entry],x,y);
    context.fillStyle=color;context.font="bold 9px sans-serif";context.textAlign="left";context.textBaseline="middle";context.fillText(`${marker.entry} #${marker.ticket}`,x+9,y-7);
   }
   context.restore();
  })})}];
 }
}
class PositionZonesPrimitive implements ISeriesPrimitive {
 private requestUpdate:(()=>void)|null=null;
 private positions:PositionOverlayLabel[]=[];
 constructor(private readonly series:{priceToCoordinate(price:number):number|null}){}
 attached(param:{requestUpdate:()=>void}){this.requestUpdate=param.requestUpdate}
 detached(){this.requestUpdate=null}
 set(positions:readonly PositionOverlayLabel[]){this.positions=positions.map(position=>({...position}));this.requestUpdate?.()}
 paneViews(){
  const series=this.series,positions=this.positions;
  return [
   {zOrder:()=>"bottom" as const,renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context,mediaSize})=>{
    context.save();context.beginPath();context.rect(0,0,mediaSize.width,mediaSize.height);context.clip();
    for(const position of positions){
     const entry=series.priceToCoordinate(position.entryPrice);if(entry===null||!Number.isFinite(entry))continue;
     for(const [price,color] of [[position.stopLoss,"rgba(244,94,112,.12)"],[position.takeProfit,"rgba(54,214,183,.10)"]] as const){
      if(price===null||price===undefined)continue;const targetY=series.priceToCoordinate(price);if(targetY===null||!Number.isFinite(targetY))continue;
      const top=Math.max(0,Math.min(entry,targetY)),bottom=Math.min(mediaSize.height,Math.max(entry,targetY));
      if(bottom<=top)continue;context.fillStyle=color;context.fillRect(0,top,mediaSize.width,bottom-top);
     }
    }
    context.restore();
   })})},
   {zOrder:()=>"top" as const,renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context,mediaSize})=>{
    context.save();context.font="10px monospace";context.textBaseline="middle";
    positions.forEach((position,index)=>{
     const entry=series.priceToCoordinate(position.entryPrice);if(entry===null||!Number.isFinite(entry))return;
     const y=Math.max(9,Math.min(mediaSize.height-9,entry-7+index*13));
     const width=Math.max(0,mediaSize.width-12);context.fillStyle="rgba(5,17,26,.82)";context.fillRect(4,y-8,width,16);
     context.fillStyle=position.side==="BUY"?"#b8eaff":"#ffe0a8";context.textAlign="left";
     context.fillText(position.label,8,y,Math.max(0,mediaSize.width-16));
    });context.restore();
   })})},
  ];
 }
}
const colorPattern = /^#[0-9a-fA-F]{6}$/;
function validBar(c:Candle):boolean {
 return Number.isSafeInteger(c.time) && c.time>0 && Number.isFinite(new Date(c.time*1000).getTime()) &&
  [c.open,c.high,c.low,c.close].every(n=>Number.isFinite(n)&&n>0) &&
  (c.tick_volume===undefined||(Number.isFinite(c.tick_volume)&&c.tick_volume>=0)) &&
  (c.real_volume===undefined||(Number.isFinite(c.real_volume)&&c.real_volume>=0)) &&
  c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close,c.high);
}
function normalizeCandles(data:readonly Candle[]):Candle[] {
 if(!Array.isArray(data)) throw Error("Invalid bars");
 if(data.length>MAX_OSCILLATOR_BARS)throw Error("History budget exceeded");
 const set=new Set<number>(),out:Candle[]=[];
 for(const item of data){
  if(!validBar(item))throw Error("Invalid OHLC candle");
  if(set.has(item.time))throw Error("Duplicate bar time");
  set.add(item.time);out.push({...item});
 }
 out.sort((a,b)=>a.time-b.time);return out;
}
function validSeriesData(data:readonly AveragePoint[]):AveragePoint[]{
 const out=data.map(v=>{
  if(!Number.isSafeInteger(v.time)||v.time<=0||!Number.isFinite(v.value))throw Error("Invalid indicator data");
  return {...v};
 }).sort((a,b)=>a.time-b.time);
 for(let i=1;i<out.length;i++)if(out[i-1].time===out[i].time)throw Error("Duplicate indicator timestamp");
 return out;
}
function movingAverageData(bars:readonly Candle[],options:MovingAverageOptions):{base:AveragePoint[];points:AveragePoint[]}{
 const {type,period,source="close",displayShift=0}=options;
 if(!["EMA","SMA","WMA","RMA","SMMA"].includes(type)||!Number.isInteger(period)||period<1||period>1000||
  !["close","open","high","low","hl2","hlc3","ohlc4"].includes(source)||!Number.isInteger(displayShift)||displayShift < -500||displayShift>500)
  throw Error("Invalid moving-average configuration");
 if(bars.length<period)return {base:[],points:[]};
 const valueAt=(bar:Candle)=>source==="hl2"?(bar.high+bar.low)/2:source==="hlc3"?(bar.high+bar.low+bar.close)/3:
  source==="ohlc4"?(bar.open+bar.high+bar.low+bar.close)/4:bar[source];
 const points:AveragePoint[]=[],shifted:AveragePoint[]=[];
 let sum=0,weighted=0,previous:number|null=null;
 for(let i=0;i<bars.length;i++){
  const value=valueAt(bars[i]);let result:number|null=null;
  if(type==="EMA"){
   previous=previous===null?value:previous+(2/(period+1))*(value-previous);
   if(i>=period-1)result=previous;
  }else if(type==="RMA"||type==="SMMA"){
   if(i<period)sum+=value;
   if(i===period-1)previous=sum/period;
   else if(i>=period)previous!+=(value-previous!)/period;
   if(i>=period-1)result=previous;
  }else{
   if(i<period){sum+=value;if(type==="WMA")weighted+=(i+1)*value}
   else{const dropped=valueAt(bars[i-period]);if(type==="WMA")weighted=weighted-sum+period*value;sum+=value-dropped}
   if(i>=period-1)result=type==="SMA"?sum/period:weighted/(period*(period+1)/2);
  }
  if(result!==null)points.push({time:bars[i].time,value:result});
 }
 if(displayShift===0)return {base:points,points};
 const values=new Map(points.map(point=>[point.time,point.value]));
 for(let target=0;target<bars.length;target++){
  const sourceIndex=target-displayShift;if(sourceIndex<0||sourceIndex>=bars.length)continue;
  const result=values.get(bars[sourceIndex].time);if(result!==undefined)shifted.push({time:bars[target].time,value:result});
 }
 return {base:points,points:shifted};
}
function donchianData(bars:readonly Candle[],period:number){
 if(!Number.isInteger(period)||period<2||period>200)throw Error("Invalid Donchian period");
 const upper:AveragePoint[]=[],middle:AveragePoint[]=[],lower:AveragePoint[]=[];
 for(let i=period-1;i<bars.length;i++){
  let high=-Infinity,low=Infinity;
  for(let j=i-period+1;j<=i;j++){high=Math.max(high,bars[j].high);low=Math.min(low,bars[j].low)}
  upper.push({time:bars[i].time,value:high});lower.push({time:bars[i].time,value:low});middle.push({time:bars[i].time,value:(high+low)/2});
 }
 return {upper,middle,lower};
}
export function calculateBollingerBands(input:readonly Candle[],period:number,stdDev:number):{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}{
 const upper:AveragePoint[]=[],middle:AveragePoint[]=[],lower:AveragePoint[]=[];
 if(!Number.isInteger(period)||period<2||period>300||!Number.isFinite(stdDev)||stdDev<.1||stdDev>10||Math.abs(stdDev*10-Math.round(stdDev*10))>1e-8)return {upper,middle,lower};
 let sum=0,squares=0,runLength=0;
 for(let i=0;i<input.length;i++){
  const bar=input[i];if(!bar||!validBar(bar)){sum=0;squares=0;runLength=0;continue}
  const value=bar.close;sum+=value;squares+=value*value;runLength++;
  if(runLength>period){const dropped=input[i-period].close;sum-=dropped;squares-=dropped*dropped;runLength=period}
  if(runLength===period){const mean=sum/period,deviation=Math.sqrt(Math.max(0,squares/period-mean*mean)),time=bar.time;
   middle.push({time,value:mean});upper.push({time,value:mean+stdDev*deviation});lower.push({time,value:mean-stdDev*deviation});
  }
 }
 return {upper,middle,lower};
}
export function calculateSessionVwap(input:readonly Candle[],options:Pick<SessionVwapOptions,"timeZone"|"sessionStart">={}):SessionVwapResult{
 const timeZone=options.timeZone??"UTC",sessionStart=options.sessionStart??"00:00";
 if(typeof timeZone!=="string"||timeZone.length<1||timeZone.length>64||
  typeof sessionStart!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionStart))throw Error("Invalid VWAP session configuration");
 let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})}
 catch(_){throw Error("Invalid VWAP timezone")}
 if(!Array.isArray(input))throw Error("Invalid VWAP bars");
 const points:AveragePoint[]=[],sources=new Set<"REAL_VOLUME"|"TICK_VOLUME_PROXY">();let session:string|null=null,sumPV=0,sumVolume=0;
 for(const bar of input){
  if(!bar||!validBar(bar))throw Error("Invalid VWAP candle");
  const parts=Object.fromEntries(formatter.formatToParts(new Date(bar.time*1000)).map(part=>[part.type,part.value]));
  const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day),minute=Number(parts.hour)*60+Number(parts.minute);
  const [startHour,startMinute]=sessionStart.split(":").map(Number),startMinutes=startHour*60+startMinute;
  const sessionDate=new Date(Date.UTC(year,month-1,day)-(minute<startMinutes?86400000:0));
  const key=sessionDate.toISOString().slice(0,10);
  if(key!==session){session=key;sumPV=0;sumVolume=0}
  const realVolume=bar.real_volume??0,tickVolume=bar.tick_volume??0;
  const real=realVolume>0,volume=real?realVolume:tickVolume;
  if(volume<=0)continue;
  const typical=(bar.high+bar.low+bar.close)/3,weighted=typical*volume,nextPV=sumPV+weighted,nextVolume=sumVolume+volume;
  if(!Number.isFinite(weighted)||!Number.isFinite(nextPV)||!Number.isFinite(nextVolume)||nextVolume<=0)throw Error("Invalid VWAP volume weights");
  sumPV=nextPV;sumVolume=nextVolume;sources.add(real?"REAL_VOLUME":"TICK_VOLUME_PROXY");
  points.push({time:bar.time,value:sumPV/sumVolume});
 }
 const volumeSource=sources.size===0?"NO_VOLUME":sources.size>1?"MIXED":sources.has("REAL_VOLUME")?"REAL_VOLUME":"TICK_VOLUME_PROXY";
 return {points,volumeSource};
}
function keltnerData(bars:readonly Candle[],options:KeltnerOptions){
 const {period,atrPeriod,multiplier}=options;
 if(!Number.isInteger(period)||period<2||period>200||!Number.isInteger(atrPeriod)||atrPeriod<2||atrPeriod>200||
  !Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)throw Error("Invalid Keltner configuration");
 const mean=movingAverageData(bars,{id:options.id,type:"EMA",period,source:"close",color:options.color}).base;
 const atrValues=calculateOscillator(bars,"atr",{period:atrPeriod}).atr;
 const ranges=new Map(atrValues.map(point=>[point.time,point.value])),upper:AveragePoint[]=[],middle:AveragePoint[]=[],lower:AveragePoint[]=[];
 for(const point of mean){const range=ranges.get(point.time);if(range===undefined)continue;middle.push(point);upper.push({time:point.time,value:point.value+range*multiplier});lower.push({time:point.time,value:point.value-range*multiplier})}
 return {upper,middle,lower};
}
export function calculateAtrBands(input:readonly Candle[],period:number,atrPeriod:number,multiplier:number):{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}{
 const upper:AveragePoint[]=[],middle:AveragePoint[]=[],lower:AveragePoint[]=[];
 if(!Number.isInteger(period)||period<2||period>200||!Number.isInteger(atrPeriod)||atrPeriod<2||atrPeriod>200||
  !Number.isFinite(multiplier)||multiplier<.1||multiplier>10||Math.abs(multiplier*10-Math.round(multiplier*10))>1e-8)return {upper,middle,lower};
 const ranges=new Map(calculateOscillator(input,"atr",{period:atrPeriod}).atr.map(point=>[point.time,point.value]));let sum=0,count=0;
 for(let i=0;i<input.length;i++){
  const bar=input[i];if(!bar||!validBar(bar)){sum=0;count=0;continue}
  sum+=bar.close;count++;
  if(count>period){sum-=input[i-period].close;count=period}
  if(count<period)continue;
  const range=ranges.get(bar.time);if(range===undefined)continue;
  const center=sum/period,width=range*multiplier;
  middle.push({time:bar.time,value:center});upper.push({time:bar.time,value:center+width});lower.push({time:bar.time,value:center-width});
 }
 return {upper,middle,lower};
}
type SupertrendState={count:number;sum:number;atr:number|null;upper:number|null;lower:number|null;direction:boolean};
type SupertrendValue=AveragePoint&{trend:"UP"|"DOWN"};
const initialSupertrendState=():SupertrendState=>({count:0,sum:0,atr:null,upper:null,lower:null,direction:false});
function supertrendStep(bars:readonly Candle[],index:number,options:SupertrendOptions,prior:SupertrendState){
 const bar=bars[index],previous=bars[index-1],range=Math.max(bar.high-bar.low,previous?Math.abs(bar.high-previous.close):0,previous?Math.abs(bar.low-previous.close):0);
 let count=prior.count,sum=prior.sum,atr=prior.atr;
 if(count<options.period){sum+=range;count++;if(count===options.period)atr=sum/options.period}
 else atr=(atr!*(options.period-1)+range)/options.period;
 if(atr===null)return {state:{...prior,count,sum},value:null as SupertrendValue|null};
 const mid=(bar.high+bar.low)/2,basicUpper=mid+options.multiplier*atr,basicLower=mid-options.multiplier*atr;
 const upper=prior.upper===null?basicUpper:basicUpper<prior.upper||previous!.close>prior.upper?basicUpper:prior.upper;
 const lower=prior.lower===null?basicLower:basicLower>prior.lower||previous!.close<prior.lower?basicLower:prior.lower;
 const direction=prior.upper===null?false:prior.direction?!(bar.close<lower):bar.close>upper;
 return {state:{count,sum,atr,upper,lower,direction},value:{time:bar.time,value:direction?lower:upper,trend:direction?"UP":"DOWN"} as SupertrendValue};
}
function supertrendData(bars:readonly Candle[],options:SupertrendOptions){
 const values:SupertrendValue[]=[];let state=initialSupertrendState(),beforeLast=state;
 for(let index=0;index<bars.length;index++){if(index===bars.length-1)beforeLast=state;const result=supertrendStep(bars,index,options,state);state=result.state;if(result.value)values.push(result.value)}
 return {values,up:values.filter(point=>point.trend==="UP"),down:values.filter(point=>point.trend==="DOWN"),state,beforeLast};
}
type ParabolicSarState={initialized:boolean;up:boolean;sar:number|null;extreme:number|null;acceleration:number};
type ParabolicSarValue=AveragePoint&{trend:"UP"|"DOWN"};
const initialParabolicSarState=():ParabolicSarState=>({initialized:false,up:true,sar:null,extreme:null,acceleration:0});
function parabolicSarStep(bars:readonly Candle[],index:number,options:ParabolicSarOptions,prior:ParabolicSarState){
 if(index<1)return {state:prior,value:null as ParabolicSarValue|null};
 const validInitial=()=>{
  const up=bars[1].close>=bars[0].close;
  const sar=up?Math.min(bars[0].low,bars[1].low):Math.max(bars[0].high,bars[1].high);
  const extreme=up?Math.max(bars[0].high,bars[1].high):Math.min(bars[0].low,bars[1].low);
  return {state:{initialized:true,up,sar,extreme,acceleration:options.step},value:{time:bars[1].time,value:sar,trend:up?"UP":"DOWN"} as ParabolicSarValue};
 };
 if(index===1||!prior.initialized)return validInitial();
 const bar=bars[index],previous=bars[index-1],beforePrevious=bars[index-2];
 let sar=prior.sar!,up=prior.up,extreme=prior.extreme!,acceleration=prior.acceleration;
 let projected=sar+acceleration*(extreme-sar);
 projected=up?Math.min(projected,previous.low,beforePrevious.low):Math.max(projected,previous.high,beforePrevious.high);
 const reversed=up?bar.low<=projected:bar.high>=projected;
 if(reversed){sar=extreme;up=!up;extreme=up?bar.high:bar.low;acceleration=options.step}
 else{sar=projected;const extended=up?bar.high>extreme:bar.low<extreme;if(extended){extreme=up?bar.high:bar.low;acceleration=Math.min(options.maxStep,acceleration+options.step)}}
 return {state:{initialized:true,up,sar,extreme,acceleration},value:{time:bar.time,value:sar,trend:up?"UP":"DOWN"} as ParabolicSarValue};
}
function parabolicSarData(bars:readonly Candle[],options:ParabolicSarOptions){
 const values:ParabolicSarValue[]=[];let state=initialParabolicSarState(),beforeLast=state;
 for(let index=0;index<bars.length;index++){if(index===bars.length-1)beforeLast=state;const result=parabolicSarStep(bars,index,options,state);state=result.state;if(result.value)values.push(result.value)}
 return {values,up:values.filter(point=>point.trend==="UP"),down:values.filter(point=>point.trend==="DOWN"),state,beforeLast};
}
export function createStudioV5(host:HTMLElement,accountId:string,scope?:ChartStorageScope){
 if(!host || !accountId || !/^[a-zA-Z0-9_-]{1,50}$/.test(accountId))throw Error("Invalid chart host/account");
 if(scope&&(!/^[a-zA-Z0-9._-]{1,32}$/.test(scope.symbol)||!/^[a-zA-Z0-9_-]{1,24}$/.test(scope.timeframe)))throw Error("Invalid chart storage scope");
 const drawingScope=scope?Object.freeze({...scope}):null;
 let displayTimeZone="UTC";
 const timeLocale=document.documentElement.lang||navigator.language||"en-US";
 const makeTimeFormatters=(timeZone:string)=>({
  year:new Intl.DateTimeFormat(timeLocale,{timeZone,year:"numeric"}),
  month:new Intl.DateTimeFormat(timeLocale,{timeZone,month:"short"}),
  day:new Intl.DateTimeFormat(timeLocale,{timeZone,day:"2-digit"}),
  parts:new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}),
  crosshair:new Intl.DateTimeFormat(timeLocale,{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",timeZoneName:"short",hourCycle:"h23"})
 });
 let timeFormatters=makeTimeFormatters(displayTimeZone);
 const formatTimeLabel=(time:Time,tickType:TickMarkType)=>{
  const date=utcDateForTime(time);
  if(tickType===TickMarkType.Year)return timeFormatters.year.format(date);
  if(tickType===TickMarkType.Month)return timeFormatters.month.format(date);
  if(tickType===TickMarkType.DayOfMonth)return timeFormatters.day.format(date);
  const parts=timezoneParts(date,timeFormatters.parts),clock=String(parts.hour).padStart(2,"0")+":"+String(parts.minute).padStart(2,"0");
  return clock+utcOffsetSuffix(date,parts);
 };
 const formatCrosshairTime=(time:Time)=>timeFormatters.crosshair.format(utcDateForTime(time));
 const chart=createChart(host,{autoSize:true,layout:{background:{color:"#091923"},textColor:"#d0e7ee"},
  grid:{vertLines:{visible:false},horzLines:{color:"#233b48"}},
  rightPriceScale:{minimumWidth:112},
  localization:{timeFormatter:formatCrosshairTime},
  timeScale:{timeVisible:true,borderVisible:true,rightOffset:8,tickMarkFormatter:formatTimeLabel},
  crosshair:{mode:0}});
 const price=chart.addSeries(CandlestickSeries,{upColor:"#1bca99",downColor:"#f16b8d",
  borderVisible:false,wickUpColor:"#1bca99",wickDownColor:"#f16b8d"});
 const brokerDealPrimitive=new BrokerDealMarkersPrimitive(chart,price);price.attachPrimitive(brokerDealPrimitive);
 let brokerDealMarkers:ReadOnlyBrokerDealMarker[]=[];
 const positionOverlayLines=new Map<string,{line:ReturnType<typeof price.createPriceLine>;readback:PositionOverlayLine}>();
 const positionZonesPrimitive=new PositionZonesPrimitive(price);price.attachPrimitive(positionZonesPrimitive);
 let positionOverlayPositions:PositionOverlayLabel[]=[],positionOverlayCurrency="",positionOverlayMarginMode:"NETTING"|"EXCHANGE"|"HEDGING"|"UNKNOWN"="UNKNOWN";
 const marketLevelLabels:Record<MarketLevelKey,string>={daily_high:"D-H",daily_low:"D-L",daily_poc:"D-POC",daily_vah:"D-VAH",daily_val:"D-VAL",weekly_high:"W-H",weekly_low:"W-L",weekly_poc:"W-POC",weekly_vah:"W-VAH",weekly_val:"W-VAL"};
 const marketLevelColors:Record<MarketLevelKey,string>={daily_high:"#f43f5e",daily_low:"#10b981",daily_poc:"#f59e0b",daily_vah:"#fb923c",daily_val:"#fbbf24",weekly_high:"#e11d48",weekly_low:"#059669",weekly_poc:"#06b6d4",weekly_vah:"#38bdf8",weekly_val:"#67e8f9"};
 const marketLevelStyles:Record<MarketLevelKey,0|1|2>={daily_high:2,daily_low:2,daily_poc:0,daily_vah:1,daily_val:1,weekly_high:1,weekly_low:1,weekly_poc:0,weekly_vah:1,weekly_val:1};
 const marketLevelKeys=Object.keys(marketLevelLabels) as MarketLevelKey[];
 const marketLevelLines=new Map<MarketLevelKey,{line:ReturnType<typeof price.createPriceLine>;price:number;label:string;visible:boolean}>();
 let marketLevelAsOfUtc:number|null=null;
 function clearMarketLevels(){guard();for(const item of marketLevelLines.values())price.removePriceLine(item.line);marketLevelLines.clear();marketLevelAsOfUtc=null}
 function setMarketLevels(snapshot:ReadOnlyMarketLevelsSnapshot){
  guard();const expected={account:activeAccount,symbol:drawingScope?.symbol??"",timeframe:drawingScope?.timeframe??""},received=snapshot?.scope;
  if(!received||received.account!==expected.account||received.symbol!==expected.symbol||received.timeframe!==expected.timeframe)throw Error("Market-level scope mismatch");
  if(snapshot.source!=="MT5_VERIFIED"||snapshot.canExecute!==false||!Number.isSafeInteger(snapshot.asOfUtc)||snapshot.asOfUtc<=0||!snapshot.levels||typeof snapshot.levels!=="object"||Array.isArray(snapshot.levels)||Object.keys(snapshot.levels).sort().join(",")!==[...marketLevelKeys].sort().join(","))throw Error("Invalid read-only market-level snapshot");
  if(snapshot.visible!==undefined&&(!snapshot.visible||typeof snapshot.visible!=="object"||Array.isArray(snapshot.visible)||Object.keys(snapshot.visible).some(key=>!marketLevelKeys.includes(key as MarketLevelKey))||Object.values(snapshot.visible).some(value=>typeof value!=="boolean")))throw Error("Invalid market-level visibility");
  const candidate:Array<{key:MarketLevelKey;price:number;label:string;visible:boolean;line:ReturnType<typeof price.createPriceLine>}>=[];
  try{for(const key of marketLevelKeys){const value=snapshot.levels[key];if(value===null)continue;if(!Number.isFinite(value)||value<=0)throw Error("Invalid market-level price");
   const visible=snapshot.visible?.[key]!==false,label=marketLevelLabels[key];
   candidate.push({key,price:value,label,visible,line:price.createPriceLine({price:value,color:marketLevelColors[key],lineWidth:key.endsWith("_poc")?2:1,lineStyle:marketLevelStyles[key],axisLabelVisible:visible,title:visible?label:"",lineVisible:visible})});
  }}catch(error){for(const item of candidate)price.removePriceLine(item.line);throw error}
  clearMarketLevels();for(const item of candidate)marketLevelLines.set(item.key,{line:item.line,price:item.price,label:item.label,visible:item.visible});marketLevelAsOfUtc=snapshot.asOfUtc;
  return readMarketLevels();
 }
 function readMarketLevels(){guard();const levels:Partial<Record<MarketLevelKey,{price:number;label:string;visible:boolean}>>={};for(const [key,item] of marketLevelLines)levels[key]={price:item.price,label:item.label,visible:item.visible};return {source:marketLevelAsOfUtc!==null?"MT5_VERIFIED":"NONE",asOfUtc:marketLevelAsOfUtc,count:marketLevelLines.size,levels}}
 function clearPositionOverlays(){guard();for(const item of positionOverlayLines.values())price.removePriceLine(item.line);positionOverlayLines.clear();positionOverlayPositions=[];positionOverlayCurrency="";positionOverlayMarginMode="UNKNOWN";positionZonesPrimitive.set([])}
 function setPositionOverlays(snapshot:ReadOnlyPositionOverlaySnapshot){
  guard();const expected={account:activeAccount,symbol:drawingScope?.symbol??"",timeframe:drawingScope?.timeframe??""},received=snapshot?.scope;
  if(!received||received.account!==expected.account||received.symbol!==expected.symbol||received.timeframe!==expected.timeframe){clearPositionOverlays();throw Error("Position overlay scope mismatch")}
  if(snapshot.source!=="MT5_VERIFIED"||snapshot.canExecute!==false||!Array.isArray(snapshot.positions)||snapshot.positions.length>500||typeof snapshot.currency!=="string"||!/^[A-Z]{3}$/.test(snapshot.currency)||![0,1,2].includes(snapshot.marginMode))throw Error("Invalid read-only position overlay snapshot");
  const tickets=new Set<string>(),candidate:PositionOverlayLine[]=[],positionModels:PositionOverlayLabel[]=[];
  const mode=({0:"NETTING",1:"EXCHANGE",2:"HEDGING"} as const)[snapshot.marginMode];
  for(const row of snapshot.positions){
   if(!row||typeof row.ticket!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(row.ticket)||tickets.has(row.ticket)||(row.side!=="BUY"&&row.side!=="SELL"))throw Error("Invalid or duplicate position ticket");tickets.add(row.ticket);
   if(!Number.isFinite(row.volume)||row.volume<0||!Number.isFinite(row.profit)||!Number.isFinite(row.swap)||row.currency!==snapshot.currency)throw Error("Invalid position money fields");
   let usdProfit:number|null=null,usdSwap:number|null=null;
   if(row.usdConversion?.state==="AVAILABLE"){
    if((row.usdConversion.source!=="ACCOUNT_CURRENCY"&&row.usdConversion.source!=="MT5_FX_QUOTE")||!Number.isFinite(row.usdConversion.amountsUsd?.profit)||!Number.isFinite(row.usdConversion.amountsUsd?.swap))throw Error("Invalid verified USD conversion");
    usdProfit=row.usdConversion.amountsUsd.profit;usdSwap=row.usdConversion.amountsUsd.swap;
   }else if(row.usdConversion!==undefined&&(row.usdConversion.state!=="UNAVAILABLE"||row.usdConversion.source!=="NONE"||typeof row.usdConversion.reason!=="string"))throw Error("Invalid unavailable USD conversion");
   for(const [role,value] of [["Entry",row.entryPrice],["SL",row.stopLoss],["TP",row.takeProfit]] as const){
    if((role==="Entry"||value!==undefined&&value!==null)&&(!Number.isFinite(value)||value!<=0))throw Error("Invalid position overlay price");
    if(value===undefined||value===null)continue;candidate.push({ticket:row.ticket,side:row.side,role,price:value,label:`${row.side} ${role}`});
   }
   const fmt=(value:number)=>value.toFixed(2),usdLabel=usdProfit===null?"":` · USD P/L ${fmt(usdProfit)} · Swap ${fmt(usdSwap!)}`;
   positionModels.push({ticket:row.ticket,side:row.side,volume:row.volume,entryPrice:row.entryPrice,stopLoss:row.stopLoss??null,takeProfit:row.takeProfit??null,profit:row.profit,swap:row.swap,currency:row.currency,usdProfit,usdSwap,
    label:`${mode} · ${row.side} ${row.volume.toFixed(2)}L #${row.ticket} @ ${fmt(row.entryPrice)} · P/L ${fmt(row.profit)} ${row.currency} · Swap ${fmt(row.swap)} ${row.currency}${usdLabel}`});
  }
  const created:Array<{line:ReturnType<typeof price.createPriceLine>;readback:PositionOverlayLine}>=[];
  try{for(const item of candidate){const line=price.createPriceLine({price:item.price,color:item.role==="SL"?"#ff657a":item.role==="TP"?"#35d6c2":item.side==="BUY"?"#49c6ff":"#ffb84d",lineWidth:item.role==="Entry"?2:1,lineStyle:item.role==="SL"?2:item.role==="TP"?1:0,axisLabelVisible:true,title:item.label});created.push({line,readback:item})}}
  catch(error){for(const item of created)price.removePriceLine(item.line);throw error}
  clearPositionOverlays();for(const item of created)positionOverlayLines.set(`${item.readback.ticket}:${item.readback.role}`,item);positionOverlayPositions=positionModels;positionOverlayCurrency=snapshot.currency;positionOverlayMarginMode=mode;positionZonesPrimitive.set(positionModels);
  return readPositionOverlays();
 }
 function readPositionOverlays(){guard();return {count:positionOverlayLines.size,lines:Array.from(positionOverlayLines.values(),item=>({...item.readback})),positionCount:positionOverlayPositions.length,zoneCount:positionOverlayPositions.reduce((count,row)=>count+(row.stopLoss!==null?1:0)+(row.takeProfit!==null?1:0),0),currency:positionOverlayCurrency,marginMode:positionOverlayMarginMode,positions:positionOverlayPositions.map(row=>({...row}))}}
 function setBrokerDealMarkers(snapshot:ReadOnlyBrokerDealMarkerSnapshot){
  guard();const expected={account:activeAccount,symbol:drawingScope?.symbol??"",timeframe:drawingScope?.timeframe??""},received=snapshot?.scope;
  if(!received||received.account!==expected.account||received.symbol!==expected.symbol||received.timeframe!==expected.timeframe)throw Error("Broker deal marker scope mismatch");
  if(snapshot.source!=="MT5_VERIFIED"||snapshot.canExecute!==false||!Array.isArray(snapshot.markers)||snapshot.markers.length>500)throw Error("Invalid read-only broker deal marker snapshot");
  const tickets=new Set<string>(),candidate:ReadOnlyBrokerDealMarker[]=[];
  for(const row of snapshot.markers){
   if(!row||typeof row.ticket!=="string"||!/^[1-9][0-9]{0,19}$/.test(row.ticket)||tickets.has(row.ticket)||row.account!==expected.account||row.symbol!==expected.symbol||row.timeframe!==expected.timeframe||
      (row.side!=="BUY"&&row.side!=="SELL")||!( ["IN","OUT","INOUT","OUT_BY"] as unknown[]).includes(row.entry)||!Number.isFinite(row.price)||row.price<=0||!Number.isSafeInteger(row.fillTimeUtcMs)||row.fillTimeUtcMs<=0||row.chartTimeSeconds!==Math.floor(row.fillTimeUtcMs/1000)||typeof row.plotted!=="boolean"||typeof row.label!=="string"||row.label.length>100)throw Error("Invalid broker deal marker");
   tickets.add(row.ticket);candidate.push({...row,plotted:barsByTime.has(row.chartTimeSeconds)});
  }
  brokerDealMarkers=candidate;brokerDealPrimitive.set(candidate);return readBrokerDealMarkers();
 }
 function readBrokerDealMarkers(){guard();const markers=brokerDealMarkers.map(row=>({...row}));return {plotted:markers.filter(row=>row.plotted).length,unplotted:markers.filter(row=>!row.plotted).length,markers}}
 const newLine=(opts:AverageOptions)=>chart.addSeries(LineSeries,{
  color:opts.color,lineWidth:opts.lineWidth??2,visible:opts.visible??true,
  title:opts.title??opts.id,priceLineVisible:false,lastValueVisible:true});
 type LineApi=ReturnType<typeof newLine>;
 const averages=new Map<string,LineApi>();
 type DonchianGroup={options:DonchianOptions;series:[LineApi,LineApi,LineApi]};
 const donchianOverlays=new Map<string,DonchianGroup>();
 type ResolvedBollingerOptions=Omit<BollingerOptions,"period"|"stdDev">&{period:number;stdDev:number};
 type BollingerGroup={options:ResolvedBollingerOptions;series:[LineApi,LineApi,LineApi];values:{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}};
 const bollingerOverlays=new Map<string,BollingerGroup>();
 type ResolvedSessionVwapOptions=Omit<SessionVwapOptions,"timeZone"|"sessionStart">&{timeZone:string;sessionStart:string};
 type SessionVwapGroup={options:ResolvedSessionVwapOptions;series:LineApi;result:SessionVwapResult};
 const sessionVwapOverlays=new Map<string,SessionVwapGroup>();
 type KeltnerGroup={options:KeltnerOptions;series:[LineApi,LineApi,LineApi]};
 const keltnerOverlays=new Map<string,KeltnerGroup>();
 type ResolvedAtrBandsOptions=Omit<AtrBandsOptions,"period"|"atrPeriod"|"multiplier">&{period:number;atrPeriod:number;multiplier:number};
 type AtrBandsGroup={options:ResolvedAtrBandsOptions;series:[LineApi,LineApi,LineApi];values:{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}};
 const atrBandsOverlays=new Map<string,AtrBandsGroup>();
 type ResolvedIchimokuOptions=Omit<IchimokuOptions,"tenkanPeriod"|"kijunPeriod"|"senkouBPeriod"|"displacement">&{tenkanPeriod:number;kijunPeriod:number;senkouBPeriod:number;displacement:number};
 type IchimokuGroup={options:ResolvedIchimokuOptions;series:[LineApi,LineApi,LineApi,LineApi,LineApi];cloud:IchimokuCloudPrimitive;values:IchimokuValues};
 const ichimokuOverlays=new Map<string,IchimokuGroup>();
 type PivotGroup={options:PivotOptions;series:Map<keyof PivotValues["lines"],LineApi>;sourceBars:Candle[];values:PivotValues};
 const pivotOverlays=new Map<string,PivotGroup>();
  type LinearRegressionGroup={options:LinearRegressionOptions;series:[LineApi,LineApi,LineApi];values:{upper:AveragePoint[];middle:AveragePoint[];lower:AveragePoint[]}};
  const linearRegressionOverlays=new Map<string,LinearRegressionGroup>();
 type SupertrendGroup={options:SupertrendOptions;up:LineApi;down:LineApi;state:SupertrendState;beforeLast:SupertrendState;lastTime:number|null};
 const supertrendOverlays=new Map<string,SupertrendGroup>();
  type ParabolicSarGroup={options:ParabolicSarOptions;up:LineApi;down:LineApi;state:ParabolicSarState;beforeLast:ParabolicSarState;lastTime:number|null};
  const parabolicSarOverlays=new Map<string,ParabolicSarGroup>();
 const managedMovingAverages=new Map<string,{options:MovingAverageOptions;base:Map<number,number>}>();
 const transientMovingAverages=new Set<string>();
 type ReadoutIndicator={id:string;title:string;kind:"OVERLAY"|"PANE";values:Map<number,number>;directions?:Map<number,"UP"|"DOWN">};
 const readoutIndicators=new Map<string,ReadoutIndicator>();
 // Independent native chart panes, not separate chart instances or duplicated time axes.
 const paneLines=new Map<string,LineApi>();
 const paneHeightOverrides=new Map<number,number>();
 type OscillatorGroup={options:OscillatorOptions;paneIndex:number;series:Map<string,ReturnType<typeof newLine>|ReturnType<typeof newHistogram>>;values:Map<string,Map<number,number>>;calculator:IncrementalOscillator};
 const oscillators=new Map<string,OscillatorGroup>();
 const transientOscillators=new Set<string>();
 const priceLevels=new Map<string,{primitive:PriceLevelPrimitive;options:PriceLevelOptions}>();
 const timeMarkers=new Map<string,{primitive:TimeMarkerPrimitive;options:TimeMarkerOptions}>();
 const textAnnotations=new Map<string,{primitive:TextAnnotationPrimitive;options:TextAnnotationOptions}>();
 const trendLines=new Map<string,{primitive:TrendLinePrimitive;options:TrendLineOptions}>();
 const rectangles=new Map<string,{primitive:RectanglePrimitive;options:RectangleOptions}>();
 const rays=new Map<string,{primitive:RayPrimitive;options:RayOptions}>();
 const fibonacci=new Map<string,{primitive:FibonacciPrimitive;options:FibonacciOptions}>();
 const fibonacciFans=new Map<string,{primitive:FibonacciFanPrimitive;options:FibonacciFanOptions}>();
 const trendBasedFibonaccis=new Map<string,{primitive:TrendBasedFibonacciPrimitive;options:TrendBasedFibonacciOptions}>();
 const fibonacciTimeZones=new Map<string,{primitive:FibonacciTimeZonePrimitive;options:FibonacciTimeZoneOptions}>();
 const channels=new Map<string,{primitive:ChannelPrimitive;options:ChannelOptions}>();
 const pitchforks=new Map<string,{primitive:PitchforkPrimitive;options:PitchforkOptions}>();
 const measurements=new Map<string,{primitive:MeasurementPrimitive;options:MeasurementOptions}>();
 const riskRewards=new Map<string,{primitive:RiskRewardPrimitive;options:RiskRewardOptions}>();
 type PlacementTool="TREND"|"RAY"|"PRICE"|"TIME"|"RECT"|"FIBO"|"FIB_FAN"|"FIB_TREND"|"FIB_TIME"|"MEASURE"|"CHANNEL"|"PITCHFORK"|"RISK_REWARD"|"TEXT";
 let placementTool:PlacementTool|null=null,placementAnchors:Array<{time:UTCTimestamp;price:number}>=[],placementText:string|null=null,placementSequence=0;
 const drawingState=(phase:"FIRST_ANCHOR"|"SECOND_ANCHOR"|"CREATED"|"CANCELLED"|"ERROR",id?:string)=>host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state",{detail:{kind:placementTool,phase,...(id?{id}:{})}}));
 const cancelDrawingTool=(notify=true)=>{if(!placementTool)return;placementTool=null;placementAnchors=[];placementText=null;if(notify)drawingState("CANCELLED")};
 const placeDrawingAt=(time:Time|null,x:number,y:number)=>{
  if(!placementTool)return;
  const {width}=chart.paneSize(),paneHeight=chart.panes()[0]?.getHeight()??0;
  if(x<0||x>width||y<0||y>paneHeight||typeof time!=="number"||!Number.isSafeInteger(time)||!barsByTime.has(time)){drawingState("ERROR");return}
  const value=price.coordinateToPrice(y);
  if(placementTool!=="FIB_TIME"&&(value===null||!Number.isFinite(value)||value<=0)){drawingState("ERROR");return}
  const anchor={time:time as UTCTimestamp,price:value??0};
  const tool=placementTool;
  if(tool==="PRICE"||tool==="TIME"||tool==="TEXT"){
   const id=`preview-${tool.toLowerCase()}-${++placementSequence}`;
   try{
    if(tool==="PRICE")addPriceLevel({id,price:anchor.price,color:"#49c6ff"});
    else if(tool==="TIME")addTimeMarker({id,time:anchor.time,color:"#ffb84d"});
    else addTextAnnotation({id,time:anchor.time,price:anchor.price,text:placementText!,color:"#f4d35e"});
    placementTool=null;placementAnchors=[];placementText=null;host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state",{detail:{kind:tool,phase:"CREATED",id}}));
   }catch(_){drawingState("ERROR")}
   return;
  }
  if(placementAnchors.some(item=>item.time===anchor.time)){drawingState("ERROR");return}
  const anchors=[...placementAnchors,anchor],required=tool==="CHANNEL"||tool==="PITCHFORK"||tool==="RISK_REWARD"||tool==="FIB_TREND"?3:2;
  if(anchors.length<required){placementAnchors=anchors;drawingState(anchors.length===1?"FIRST_ANCHOR":"SECOND_ANCHOR");return}
  const id=`preview-${tool.toLowerCase()}-${++placementSequence}`;
  try{
   const [start,end,offset]=anchors,color=tool==="TREND"||tool==="RECT"||tool==="CHANNEL"?"#49c6ff":"#ffb84d";
   if(tool==="FIB_TIME")addFibonacciTimeZone({id,startTime:start.time,endTime:end.time,color});
   else if(tool==="FIB_TREND")addTrendBasedFibonacci({id,startTime:start.time,startPrice:start.price,endTime:end.time,endPrice:end.price,thirdTime:offset.time,thirdPrice:offset.price,color});
   else if(tool==="CHANNEL")addChannel({id,startTime:start.time,startPrice:start.price,endTime:end.time,endPrice:end.price,offsetTime:offset.time,offsetPrice:offset.price,color});
   else if(tool==="PITCHFORK")addPitchfork({id,startTime:start.time,startPrice:start.price,endTime:end.time,endPrice:end.price,thirdTime:offset.time,thirdPrice:offset.price,color});
   else if(tool==="RISK_REWARD")addRiskReward({id,startTime:start.time,entryPrice:start.price,stopTime:end.time,stopPrice:end.price,endTime:offset.time,targetPrice:offset.price});
   else{
    const options={id,startTime:start.time,startPrice:start.price,endTime:end.time,endPrice:end.price,color};
    if(tool==="TREND")addTrendLine(options);
    else if(tool==="RAY")addRay(options);
    else if(tool==="RECT")addRectangle({...options,fill:true});
    else if(tool==="FIBO")addFibonacci(options);
    else if(tool==="FIB_FAN")addFibonacciFan(options);
    else addMeasurement(options);
   }
   placementTool=null;placementAnchors=[];placementText=null;host.dispatchEvent(new CustomEvent("chartstudio-v5-drawing-state",{detail:{kind:tool,phase:"CREATED",id}}));
  }catch(_){drawingState("ERROR")}
 }
 const maxNativeDrawings=1000,maxIndicatorInstances=20;
 const drawingCount=()=>priceLevels.size+timeMarkers.size+textAnnotations.size+trendLines.size+rectangles.size+rays.size+fibonacci.size+fibonacciFans.size+trendBasedFibonaccis.size+fibonacciTimeZones.size+channels.size+pitchforks.size+measurements.size+riskRewards.size;
 type DrawingSnapshot={kind:"PRICE";options:PriceLevelOptions}|{kind:"TIME";options:TimeMarkerOptions}|{kind:"TEXT";options:TextAnnotationOptions}|{kind:"TREND";options:TrendLineOptions}|{kind:"RECT";options:RectangleOptions}|{kind:"RAY";options:RayOptions}|{kind:"FIBO";options:FibonacciOptions}|{kind:"FIB_FAN";options:FibonacciFanOptions}|{kind:"FIB_TREND";options:TrendBasedFibonacciOptions}|{kind:"FIB_TIME";options:FibonacciTimeZoneOptions}|{kind:"CHANNEL";options:ChannelOptions}|{kind:"PITCHFORK";options:PitchforkOptions}|{kind:"MEASURE";options:MeasurementOptions}|{kind:"RISK_REWARD";options:RiskRewardOptions};
 type DrawingHistory={id:string;before:DrawingSnapshot|null;after:DrawingSnapshot|null};
 const undoStack:DrawingHistory[]=[],redoStack:DrawingHistory[]=[];
 const historyLimit=100;
 const utf8ByteLength=(value:string)=>new TextEncoder().encode(value).byteLength;
 type PersistenceStatus="DISABLED"|"PENDING"|"READY"|"UNAVAILABLE"|"CONFLICT";
 let persistenceStatus:PersistenceStatus=drawingScope?"PENDING":"DISABLED";
 let persistenceError:string|null=null,drawingsHydrated=false,hydratingDrawings=false;
 let lastPersistedSnapshot:string|null=null;
 const persistenceLimit=524288;
 let selectedDrawingId:string|null=null,hoveredDrawingId:string|null=null;
 const selectedDrawingIds=new Set<string>();
 type ActiveDrag={pointerId:number;id:string;kind:"PRICE";original:PriceLevelOptions}|{pointerId:number;id:string;kind:"TIME";original:TimeMarkerOptions}|{pointerId:number;id:string;kind:"TEXT";original:TextAnnotationOptions}|{pointerId:number;id:string;kind:"TREND";anchor:"START"|"END";original:TrendLineOptions}|{pointerId:number;id:string;kind:"RECT";anchor:"START"|"END";original:RectangleOptions}|{pointerId:number;id:string;kind:"FIBO";anchor:"START"|"END";original:FibonacciOptions}|{pointerId:number;id:string;kind:"FIB_FAN";anchor:"START"|"END";original:FibonacciFanOptions}|{pointerId:number;id:string;kind:"FIB_TREND";anchor:"START"|"END"|"THIRD";original:TrendBasedFibonacciOptions}|{pointerId:number;id:string;kind:"FIB_TIME";anchor:"START"|"END";original:FibonacciTimeZoneOptions}|{pointerId:number;id:string;kind:"CHANNEL";anchor:"START"|"END"|"OFFSET";original:ChannelOptions}|{pointerId:number;id:string;kind:"PITCHFORK";anchor:"START"|"END"|"THIRD";original:PitchforkOptions}|{pointerId:number;id:string;kind:"MEASURE";anchor:"START"|"END";original:MeasurementOptions}|{pointerId:number;id:string;kind:"RISK_REWARD";anchor:"ENTRY"|"STOP"|"TARGET";original:RiskRewardOptions};
 let activeDrag:ActiveDrag|null=null;
 chart.subscribeCrosshairMove(param=>{
    const time=param.time;
    let dataWindow:DataWindowReadout|null=null;
    if(typeof time==="number")try{dataWindow=readDataWindow(time)}catch{}
    host.dispatchEvent(new CustomEvent("chartstudio-v5-data-window",{detail:dataWindow}));
    const objectId=param.hoveredInfo?.objectId;
  hoveredDrawingId=typeof objectId==="string"&&(priceLevels.has(objectId)||timeMarkers.has(objectId)||textAnnotations.has(objectId)||trendLines.has(objectId)||rectangles.has(objectId)||rays.has(objectId)||fibonacci.has(objectId)||fibonacciFans.has(objectId)||trendBasedFibonaccis.has(objectId)||fibonacciTimeZones.has(objectId)||measurements.has(objectId))?objectId:null;
 });
 const touchAnchorAt=(x:number,y:number,excludeTimeZones=false)=>{
  let bestId:string|null=null,bestDistance=12;
  const ids=[...trendLines.keys(),...rectangles.keys(),...fibonacci.keys(),...fibonacciFans.keys(),...trendBasedFibonaccis.keys(),...fibonacciTimeZones.keys(),...channels.keys(),...pitchforks.keys(),...riskRewards.keys()];
  for(const id of ids){
   if(excludeTimeZones&&fibonacciTimeZones.has(id))continue;
   const snapshot=snapshotDrawing(id);if(!snapshot||snapshot.options.visible===false)continue;
  for(const anchor of (channels.has(id)?["START","END","OFFSET"]:riskRewards.has(id)?["ENTRY","STOP","TARGET"]:pitchforks.has(id)||trendBasedFibonaccis.has(id)?["START","END","THIRD"]:["START","END"]) as ("START"|"END"|"OFFSET"|"THIRD"|"ENTRY"|"STOP"|"TARGET")[]){
    const point=drawingAnchorPosition(id,anchor);if(!point)continue;
    const distance=Math.hypot(x-point.x,y-point.y);
    if(distance<=bestDistance){bestId=id;bestDistance=distance}
   }
  }
  return bestId;
 };
 const drawingAt=(clientX:number,clientY:number)=>{
  const rect=host.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;
  let bestId:string|null=null,bestDistance=Infinity;
  const primitives=[...priceLevels.values(),...timeMarkers.values(),...textAnnotations.values(),...trendLines.values(),...rectangles.values(),...rays.values(),...fibonacci.values(),...fibonacciFans.values(),...trendBasedFibonaccis.values(),...fibonacciTimeZones.values(),...channels.values(),...pitchforks.values(),...measurements.values(),...riskRewards.values()];
  for(const item of primitives){
   const hit=item.primitive.hitTest(x,y);if(hit&&hit.distance<=bestDistance){bestId=hit.externalId;bestDistance=hit.distance}
  }
  return bestId;
 };
 const onPointerDown=(event:PointerEvent)=>{
  if(event.button!==0||!event.isPrimary)return;
  if(placementTool){
   if(event.shiftKey)return;
   const rect=host.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
   placeDrawingAt(chart.timeScale().coordinateToTime(x),x,y);
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  const competingAnchor=hoveredDrawingId&&fibonacciTimeZones.has(hoveredDrawingId)?touchAnchorAt(event.clientX,event.clientY,true):null;
  const drawingId=competingAnchor??hoveredDrawingId??drawingAt(event.clientX,event.clientY)??(event.pointerType==="touch"?touchAnchorAt(event.clientX,event.clientY):null);
  if(!drawingId){if(!event.shiftKey)selectDrawing(null);return}
  hoveredDrawingId=drawingId;
  const level=priceLevels.get(drawingId),marker=timeMarkers.get(drawingId),annotation=textAnnotations.get(drawingId),trend=trendLines.get(drawingId),rectangle=rectangles.get(drawingId),fibo=fibonacci.get(drawingId),fibFan=fibonacciFans.get(drawingId),fibTrend=trendBasedFibonaccis.get(drawingId),fibTime=fibonacciTimeZones.get(drawingId),channel=channels.get(drawingId),pitchfork=pitchforks.get(drawingId),measurement=measurements.get(drawingId),riskReward=riskRewards.get(drawingId);
  if(event.shiftKey)toggleDrawingSelection(drawingId);else selectDrawing(drawingId);
  if(host.tabIndex<0)host.tabIndex=0;
  host.focus({preventScroll:true});
  if(!level&&!marker&&!annotation&&!trend&&!rectangle&&!fibo&&!fibFan&&!fibTrend&&!fibTime&&!channel&&!pitchfork&&!measurement&&!riskReward)return;
  if((level?.options.locked??marker?.options.locked??annotation?.options.locked??trend?.options.locked??rectangle?.options.locked??fibo?.options.locked??fibFan?.options.locked??fibTrend?.options.locked??fibTime?.options.locked??channel?.options.locked??pitchfork?.options.locked??measurement?.options.locked??riskReward?.options.locked)===true){event.preventDefault();event.stopImmediatePropagation();return}
  if(level)activeDrag={pointerId:event.pointerId,id:drawingId,kind:"PRICE",original:{...level.options}};
  else if(marker)activeDrag={pointerId:event.pointerId,id:drawingId,kind:"TIME",original:{...marker.options}};
  else if(annotation)activeDrag={pointerId:event.pointerId,id:drawingId,kind:"TEXT",original:{...annotation.options}};
  else if(trend){
   const points=trend.primitive.coordinates(),rect=host.getBoundingClientRect();
   if(!points)return;
   const x=event.clientX-rect.left,y=event.clientY-rect.top;
   const startDistance=Math.hypot(x-points.x1,y-points.y1),endDistance=Math.hypot(x-points.x2,y-points.y2);
   if(Math.min(startDistance,endDistance)>12)return;
   activeDrag={pointerId:event.pointerId,id:drawingId,kind:"TREND",anchor:startDistance<=endDistance?"START":"END",original:{...trend.options}};
  }
  else if(rectangle){
   const rect=host.getBoundingClientRect(),start=drawingAnchorPosition(drawingId,"START"),end=drawingAnchorPosition(drawingId,"END");
   if(!start||!end)return;
   const x=event.clientX-rect.left,y=event.clientY-rect.top;
   const startDistance=Math.hypot(x-(start.x-rect.left),y-(start.y-rect.top)),endDistance=Math.hypot(x-(end.x-rect.left),y-(end.y-rect.top));
   if(Math.min(startDistance,endDistance)>12)return;
   activeDrag={pointerId:event.pointerId,id:drawingId,kind:"RECT",anchor:startDistance<=endDistance?"START":"END",original:{...rectangle.options}};
  }
  else if(fibo){
   const rect=host.getBoundingClientRect(),start=drawingAnchorPosition(drawingId,"START"),end=drawingAnchorPosition(drawingId,"END");
   if(!start||!end)return;
   const x=event.clientX-rect.left,y=event.clientY-rect.top;
   const startDistance=Math.hypot(x-(start.x-rect.left),y-(start.y-rect.top)),endDistance=Math.hypot(x-(end.x-rect.left),y-(end.y-rect.top));
   if(Math.min(startDistance,endDistance)>12)return;
   const original={...fibo.options};if(original.levels)original.levels=[...original.levels];
   activeDrag={pointerId:event.pointerId,id:drawingId,kind:"FIBO",anchor:startDistance<=endDistance?"START":"END",original};
  }
  else if(fibFan){const start=drawingAnchorPosition(drawingId,"START"),end=drawingAnchorPosition(drawingId,"END");if(!start||!end)return;const ds=Math.hypot(event.clientX-start.x,event.clientY-start.y),de=Math.hypot(event.clientX-end.x,event.clientY-end.y);if(Math.min(ds,de)>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"FIB_FAN",anchor:ds<=de?"START":"END",original:{...fibFan.options,ratios:[...fibonacciFanRatios(fibFan.options)]}}}
  else if(fibTrend){const points=( ["START","END","THIRD"] as const).map(anchor=>drawingAnchorPosition(drawingId,anchor));if(points.some(point=>!point))return;const distances=points.map(point=>Math.hypot(event.clientX-point!.x,event.clientY-point!.y)),nearest=distances.indexOf(Math.min(...distances));if(distances[nearest]>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"FIB_TREND",anchor:( ["START","END","THIRD"] as const)[nearest],original:{...fibTrend.options,ratios:[...trendFibRatios(fibTrend.options)]}}}
  else if(fibTime){const start=drawingAnchorPosition(drawingId,"START"),end=drawingAnchorPosition(drawingId,"END");if(!start||!end)return;const ds=Math.hypot(event.clientX-start.x,event.clientY-start.y),de=Math.hypot(event.clientX-end.x,event.clientY-end.y);if(Math.min(ds,de)>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"FIB_TIME",anchor:ds<=de?"START":"END",original:{...fibTime.options}}}
  else if(channel){
   const points=( ["START","END","OFFSET"] as const).map(anchor=>drawingAnchorPosition(drawingId,anchor));if(points.some(point=>!point))return;
   const distances=points.map(point=>Math.hypot(event.clientX-point!.x,event.clientY-point!.y)),nearest=distances.indexOf(Math.min(...distances));
   if(distances[nearest]>12)return;
   activeDrag={pointerId:event.pointerId,id:drawingId,kind:"CHANNEL",anchor:(["START","END","OFFSET"] as const)[nearest],original:{...channel.options}};
  }
  else if(pitchfork){const points=( ["START","END","THIRD"] as const).map(anchor=>drawingAnchorPosition(drawingId,anchor));if(points.some(point=>!point))return;const distances=points.map(point=>Math.hypot(event.clientX-point!.x,event.clientY-point!.y)),nearest=distances.indexOf(Math.min(...distances));if(distances[nearest]>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"PITCHFORK",anchor:( ["START","END","THIRD"] as const)[nearest],original:{...pitchfork.options}}}
  else if(measurement){const a=drawingAnchorPosition(drawingId,"START"),b=drawingAnchorPosition(drawingId,"END");if(!a||!b)return;const da=Math.hypot(event.clientX-a.x,event.clientY-a.y),db=Math.hypot(event.clientX-b.x,event.clientY-b.y);if(Math.min(da,db)>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"MEASURE",anchor:da<=db?"START":"END",original:{...measurement.options}}}
  else if(riskReward){const points=( ["ENTRY","STOP","TARGET"] as const).map(anchor=>drawingAnchorPosition(drawingId,anchor));if(points.some(point=>!point))return;const distances=points.map(point=>Math.hypot(event.clientX-point!.x,event.clientY-point!.y)),nearest=distances.indexOf(Math.min(...distances));if(distances[nearest]>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"RISK_REWARD",anchor:( ["ENTRY","STOP","TARGET"] as const)[nearest],original:{...riskReward.options}}}
  else return;
  host.setPointerCapture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
 };
 const onPointerMove=(event:PointerEvent)=>{
  if(!activeDrag||activeDrag.pointerId!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  const rect=host.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(activeDrag.kind==="PRICE"){
   const value=price.coordinateToPrice(y);
   if(value!==null&&Number.isFinite(value)&&value>0){const item=priceLevels.get(activeDrag.id);if(item)updatePriceLevel(activeDrag.id,{price:value,color:item.options.color})}
  }else if(activeDrag.kind==="TIME"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index];
   if(candle){const item=timeMarkers.get(activeDrag.id);if(item)updateTimeMarker(activeDrag.id,{time:candle.time,color:item.options.color})}
  }else if(activeDrag.kind==="TEXT"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0){const item=textAnnotations.get(activeDrag.id);if(item)updateTextAnnotation(activeDrag.id,{time:candle.time,price:value})}
  }else if(activeDrag.kind==="FIB_TIME"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical)),candle=bars[index],item=fibonacciTimeZones.get(activeDrag.id);
   if(candle&&item){const patch=activeDrag.anchor==="START"?{startTime:candle.time}:{endTime:candle.time};try{updateFibonacciTimeZone(activeDrag.id,patch)}catch(_){}}
  }else if(activeDrag.kind==="FIB_TREND"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical)),candle=bars[index],value=price.coordinateToPrice(y),item=trendBasedFibonaccis.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:activeDrag.anchor==="END"?{endTime:candle.time,endPrice:value}:{thirdTime:candle.time,thirdPrice:value};try{updateTrendBasedFibonacci(activeDrag.id,patch)}catch(_){}}
  }else if(activeDrag.kind==="CHANNEL"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y),item=channels.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){
    const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:activeDrag.anchor==="END"?{endTime:candle.time,endPrice:value}:{offsetTime:candle.time,offsetPrice:value};
    const options={...item.options,...patch};
    try{validateChannel(options);updateChannel(activeDrag.id,patch)}catch(_){}
   }
  }else if(activeDrag.kind==="PITCHFORK"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical)),candle=bars[index],value=price.coordinateToPrice(y),item=pitchforks.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:activeDrag.anchor==="END"?{endTime:candle.time,endPrice:value}:{thirdTime:candle.time,thirdPrice:value};try{updatePitchfork(activeDrag.id,patch)}catch(_){}}
  }else if(activeDrag.kind==="RISK_REWARD"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical)),candle=bars[index],value=price.coordinateToPrice(y),item=riskRewards.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){const patch=activeDrag.anchor==="ENTRY"?{startTime:candle.time,entryPrice:value}:activeDrag.anchor==="STOP"?{stopTime:candle.time,stopPrice:value}:{endTime:candle.time,targetPrice:value};try{updateRiskReward(activeDrag.id,patch)}catch(_){}}
  }else if(activeDrag.kind==="TREND"||activeDrag.kind==="RECT"||activeDrag.kind==="FIBO"||activeDrag.kind==="FIB_FAN"||activeDrag.kind==="MEASURE"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y),item=activeDrag.kind==="TREND"?trendLines.get(activeDrag.id):activeDrag.kind==="RECT"?rectangles.get(activeDrag.id):activeDrag.kind==="FIBO"?fibonacci.get(activeDrag.id):activeDrag.kind==="FIB_FAN"?fibonacciFans.get(activeDrag.id):measurements.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){
    const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:{endTime:candle.time,endPrice:value};
    const otherTime=activeDrag.anchor==="START"?item.options.endTime:item.options.startTime,otherPrice=activeDrag.anchor==="START"?item.options.endPrice:item.options.startPrice;
    if(candle.time!==otherTime&&(activeDrag.kind==="TREND"||value!==otherPrice)){
     if(activeDrag.kind==="TREND")updateTrendLine(activeDrag.id,patch);else if(activeDrag.kind==="RECT")updateRectangle(activeDrag.id,patch);else if(activeDrag.kind==="FIBO")updateFibonacci(activeDrag.id,patch);else if(activeDrag.kind==="FIB_FAN")updateFibonacciFan(activeDrag.id,patch);else updateMeasurement(activeDrag.id,patch);
    }
   }
  }
 };
 const finishDrag=(cancel:boolean)=>{
  const drag=activeDrag;if(!drag)return;
  if(cancel){
   if(drag.kind==="PRICE"&&priceLevels.has(drag.id))updatePriceLevel(drag.id,{price:drag.original.price,color:drag.original.color});
   if(drag.kind==="TIME"&&timeMarkers.has(drag.id))updateTimeMarker(drag.id,{time:drag.original.time,color:drag.original.color});
   if(drag.kind==="TEXT"&&textAnnotations.has(drag.id))updateTextAnnotation(drag.id,drag.original);
   if(drag.kind==="TREND"&&trendLines.has(drag.id))updateTrendLine(drag.id,drag.original);
   if(drag.kind==="RECT"&&rectangles.has(drag.id))updateRectangle(drag.id,drag.original);
   if(drag.kind==="FIBO"&&fibonacci.has(drag.id))updateFibonacci(drag.id,drag.original);
   if(drag.kind==="FIB_FAN"&&fibonacciFans.has(drag.id))updateFibonacciFan(drag.id,drag.original);
   if(drag.kind==="FIB_TREND"&&trendBasedFibonaccis.has(drag.id))updateTrendBasedFibonacci(drag.id,drag.original);
   if(drag.kind==="FIB_TIME"&&fibonacciTimeZones.has(drag.id))updateFibonacciTimeZone(drag.id,drag.original);
   if(drag.kind==="CHANNEL"&&channels.has(drag.id))updateChannel(drag.id,drag.original);
   if(drag.kind==="PITCHFORK"&&pitchforks.has(drag.id))updatePitchfork(drag.id,drag.original);
   if(drag.kind==="MEASURE"&&measurements.has(drag.id))updateMeasurement(drag.id,drag.original);
   if(drag.kind==="RISK_REWARD"&&riskRewards.has(drag.id))updateRiskReward(drag.id,drag.original);
  }else{
   let before:DrawingSnapshot;
   if(drag.kind==="PRICE")before={kind:"PRICE",options:{...drag.original}};
   else if(drag.kind==="TIME")before={kind:"TIME",options:{...drag.original}};
   else if(drag.kind==="TEXT")before={kind:"TEXT",options:{...drag.original}};
   else if(drag.kind==="TREND")before={kind:"TREND",options:{...drag.original}};
   else if(drag.kind==="RECT")before={kind:"RECT",options:{...drag.original}};
   else if(drag.kind==="FIBO"){const original={...drag.original};if(original.levels)original.levels=[...original.levels];else delete original.levels;before={kind:"FIBO",options:original}}
   else if(drag.kind==="FIB_FAN")before={kind:"FIB_FAN",options:{...drag.original,ratios:[...fibonacciFanRatios(drag.original)]}}
   else if(drag.kind==="FIB_TREND")before={kind:"FIB_TREND",options:{...drag.original,ratios:[...trendFibRatios(drag.original)]}}
   else if(drag.kind==="FIB_TIME")before={kind:"FIB_TIME",options:{...drag.original}}
   else if(drag.kind==="CHANNEL")before={kind:"CHANNEL",options:{...drag.original}}
   else if(drag.kind==="PITCHFORK")before={kind:"PITCHFORK",options:{...drag.original}}
   else if(drag.kind==="RISK_REWARD")before={kind:"RISK_REWARD",options:{...drag.original}}
   else before={kind:"MEASURE",options:{...drag.original}}
   recordDrawingChange(drag.id,before,snapshotDrawing(drag.id));
  }
  activeDrag=null;
  if(host.hasPointerCapture(drag.pointerId))host.releasePointerCapture(drag.pointerId);
 };
 const onPointerUp=(event:PointerEvent)=>{
  if(!activeDrag||activeDrag.pointerId!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();finishDrag(false);
 };
 const onPointerCancel=(event:PointerEvent)=>{
  if(!activeDrag||activeDrag.pointerId!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();finishDrag(true);
 };
 const onLostPointerCapture=(event:PointerEvent)=>{
  if(!activeDrag||activeDrag.pointerId!==event.pointerId)return;
  finishDrag(true);
 };
 function nudgeSelectedDrawing(dx:number,dy:number):boolean{
  const ids=[...selectedDrawingIds];if(!ids.length||(!dx&&!dy)||!bars.length)return false;
  const before=ids.map(id=>({id,snapshot:snapshotDrawing(id)}));
  if(before.some(item=>!item.snapshot||item.snapshot.options.locked))return false;
  const timeKeys:Record<string,string[]>={TIME:["time"],TEXT:["time"],TREND:["startTime","endTime"],RECT:["startTime","endTime"],RAY:["startTime","endTime"],FIBO:["startTime","endTime"],FIB_FAN:["startTime","endTime"],FIB_TIME:["startTime","endTime"],MEASURE:["startTime","endTime"],CHANNEL:["startTime","endTime","offsetTime"],PITCHFORK:["startTime","endTime","thirdTime"],RISK_REWARD:["startTime","stopTime","endTime"]};
  const priceKeys:Record<string,string[]>={PRICE:["price"],TEXT:["price"],TREND:["startPrice","endPrice"],RECT:["startPrice","endPrice"],RAY:["startPrice","endPrice"],FIBO:["startPrice","endPrice"],FIB_FAN:["startPrice","endPrice"],MEASURE:["startPrice","endPrice"],CHANNEL:["startPrice","endPrice","offsetPrice"],PITCHFORK:["startPrice","endPrice","thirdPrice"],RISK_REWARD:["entryPrice","stopPrice","targetPrice"]};
  const moveTime=(value:number):number|null=>{const index=bars.findIndex(bar=>bar.time===value),next=index+dx;return index>=0&&next>=0&&next<bars.length?bars[next].time:null};
  const movePrice=(value:number):number|null=>{if(!dy)return value;const coordinate=price.priceToCoordinate(value);if(coordinate===null)return null;const next=price.coordinateToPrice(coordinate+dy);return next!==null&&Number.isFinite(next)&&next>0?next:null};
  const candidates:Array<{id:string;before:DrawingSnapshot;after:DrawingSnapshot}>=[];
  for(const item of before){
   const current=item.snapshot!;if((current.kind==="PRICE"&&!dy)||(current.kind==="TIME"&&!dx))continue;
   const options={...current.options} as Record<string,unknown>;
   if(dx&&current.kind!=="PRICE")for(const key of timeKeys[current.kind]??[]){const moved=moveTime(options[key] as number);if(moved===null)return false;options[key]=moved}
   if(dy&&current.kind!=="TIME")for(const key of priceKeys[current.kind]??[]){const moved=movePrice(options[key] as number);if(moved===null)return false;options[key]=moved}
   const after={kind:current.kind,options} as DrawingSnapshot;
   if(JSON.stringify(after)!==JSON.stringify(current))candidates.push({id:item.id,before:current,after});
  }
  if(!candidates.length||candidates.length>historyLimit||(!drawingScope&&persistenceStatus!=="DISABLED")||(drawingScope&&persistenceStatus!=="READY"))return false;
  const originalUndo=undoStack.slice(),originalRedo=redoStack.slice(),originalSelection=ids.slice();
  let applied=0;
  try{for(const change of candidates){if(!restoreDrawing(change.id,change.after))throw Error("Nudge apply failed");applied++}}
  catch(_){for(let index=Math.min(applied,candidates.length-1);index>=0;index--)restoreDrawing(candidates[index].id,candidates[index].before);selectDrawings(originalSelection);return false}
  selectDrawings(originalSelection);
  const keepExisting=Math.max(0,historyLimit-candidates.length);if(undoStack.length>keepExisting)undoStack.splice(0,undoStack.length-keepExisting);
  for(const change of candidates)undoStack.push({id:change.id,before:change.before,after:change.after});redoStack.length=0;
  if(!persistDrawings(candidates.length)){
   for(let index=candidates.length-1;index>=0;index--)restoreDrawing(candidates[index].id,candidates[index].before);
   undoStack.splice(0,undoStack.length,...originalUndo);redoStack.splice(0,redoStack.length,...originalRedo);selectDrawings(originalSelection);return false;
  }
  selectDrawings(originalSelection);return true;
 }
 const onKeyDown=(event:KeyboardEvent)=>{
  if(event.target instanceof HTMLElement&&event.target.closest("input,textarea,select,button,[contenteditable=true]"))return;
  if(event.key==="Escape"&&activeDrag){event.preventDefault();event.stopImmediatePropagation();finishDrag(true);return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){
   event.preventDefault();event.stopImmediatePropagation();if(event.shiftKey)redo();else undo();return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="y"){
   event.preventDefault();event.stopImmediatePropagation();redo();return;
  }
  const moveKeys:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  const move=moveKeys[event.key],step=event.shiftKey?10:1;
  if(move&&nudgeSelectedDrawing(move[0]*step,move[1]*step)){event.preventDefault();event.stopImmediatePropagation();return}
  if((event.key==="Delete"||event.key==="Backspace")&&selectedDrawingIds.size){event.preventDefault();event.stopImmediatePropagation();deleteSelectedDrawings();return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="d"&&selectedDrawingIds.size){event.preventDefault();event.stopImmediatePropagation();duplicateSelectedDrawings()}
  if(!event.ctrlKey&&!event.metaKey&&selectedDrawingIds.size&&event.key.toLowerCase()==="h"){
   event.preventDefault();event.stopImmediatePropagation();const items=[...selectedDrawingIds].map(id=>snapshotDrawing(id));
   setSelectedDrawingsVisible(items.some(item=>item?.options.visible!==false)?false:true);return;
  }
  if(!event.ctrlKey&&!event.metaKey&&selectedDrawingIds.size&&event.key.toLowerCase()==="l"){
   event.preventDefault();event.stopImmediatePropagation();const items=[...selectedDrawingIds].map(id=>snapshotDrawing(id));
   setSelectedDrawingsLocked(items.some(item=>item?.options.locked!==true)?true:false);return;
  }
 };
 host.addEventListener("pointerdown",onPointerDown,true);
 host.addEventListener("pointermove",onPointerMove,true);
 host.addEventListener("pointerup",onPointerUp,true);
 host.addEventListener("pointercancel",onPointerCancel,true);
 host.addEventListener("lostpointercapture",onLostPointerCapture,true);
 host.addEventListener("keydown",onKeyDown,true);
 const createPaneLine=(opts:AverageOptions,paneIndex=chart.panes().length)=>chart.addSeries(LineSeries,{
  color:opts.color,lineWidth:opts.lineWidth??2,visible:opts.visible??true,
  title:opts.title??opts.id,priceLineVisible:false,lastValueVisible:true,
 },paneIndex);
 const newHistogram=(paneIndex=chart.panes().length)=>chart.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:true},paneIndex);
 const newVolume=()=>chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},
  priceLineVisible:false,lastValueVisible:false},chart.panes().length);
 type VolumeApi=ReturnType<typeof newVolume>;
 let volume:VolumeApi|null=null;
 let volumeZones:{options:VolumeZonesOptions;asOf:VolumeZonesAsOf;result:VolumeZoneResult;primitive:VolumeZonePrimitive}|null=null;
 const autoFibRatios=[0,.236,.382,.5,.618,.786,1] as const,autoFibColors=["#eab308","#f97316","#22d3ee","#f8fafc","#a78bfa","#22c55e","#fb7185"];
 let autoFibonacci:{options:AutoFibonacciOptions;asOf:VolumeZonesAsOf;result:AutoFibonacciValues;series:ReturnType<typeof createPaneLine>[]}|null=null;
 let bars:Candle[]=[],barsByTime=new Map<number,Candle>(),activeAccount=accountId,destroyed=false;
 const indicatorInstanceCount=()=>averages.size+paneLines.size+oscillators.size+donchianOverlays.size+bollingerOverlays.size+sessionVwapOverlays.size+keltnerOverlays.size+atrBandsOverlays.size+linearRegressionOverlays.size+supertrendOverlays.size+parabolicSarOverlays.size+ichimokuOverlays.size+pivotOverlays.size+(autoFibonacci?1:0);
 function guard(){if(destroyed)throw Error("Chart was destroyed")}
 function persistenceKey(account=activeAccount){
  if(!drawingScope)return null;
  return `2eas.chartstudio.v5.drawings:v5:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
 }
 function previousPersistenceKey(account=activeAccount){
  if(!drawingScope)return null;
  return `2eas.chartstudio.v5.drawings:v4:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
 }
 function legacyPersistenceKey(account=activeAccount){
  if(!drawingScope)return null;
  return `2eas.chartstudio.v5.drawings:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
 }
 function localStorageApi():Storage|null{
  try{return host.ownerDocument.defaultView?.localStorage??null}catch(_){return null}
 }
 function drawingSnapshots():DrawingSnapshot[]{
  return [
   ...[...priceLevels.values()].map(({options})=>({kind:"PRICE" as const,options:{...options}})),
   ...[...timeMarkers.values()].map(({options})=>({kind:"TIME" as const,options:{...options}})),
   ...[...textAnnotations.values()].map(({options})=>({kind:"TEXT" as const,options:{...options}})),
   ...[...trendLines.values()].map(({options})=>({kind:"TREND" as const,options:{...options}})),
   ...[...rectangles.values()].map(({options})=>({kind:"RECT" as const,options:{...options}})),
   ...[...rays.values()].map(({options})=>({kind:"RAY" as const,options:{...options}})),
   ...[...fibonacci.values()].map(({options})=>({kind:"FIBO" as const,options:{...options}})),
   ...[...fibonacciFans.values()].map(({options})=>({kind:"FIB_FAN" as const,options:{...options,ratios:[...fibonacciFanRatios(options)]}})),
   ...[...trendBasedFibonaccis.values()].map(({options})=>({kind:"FIB_TREND" as const,options:{...options,ratios:[...trendFibRatios(options)]}})),
   ...[...fibonacciTimeZones.values()].map(({options})=>({kind:"FIB_TIME" as const,options:{...options}})),
   ...[...channels.values()].map(({options})=>({kind:"CHANNEL" as const,options:{...options}})),
   ...[...pitchforks.values()].map(({options})=>({kind:"PITCHFORK" as const,options:{...options}})),
   ...[...measurements.values()].map(({options})=>({kind:"MEASURE" as const,options:{...options}})),
   ...[...riskRewards.values()].map(({options})=>({kind:"RISK_REWARD" as const,options:{...options}})),
  ];
 }
 function exportLayout():string{
  guard();if(!drawingScope)throw Error("Layout export requires symbol/timeframe scope");
  const serialized=JSON.stringify({schemaVersion:2,symbol:drawingScope.symbol,timeframe:drawingScope.timeframe,
   drawings:drawingSnapshots(),view:viewSnapshots()});
  if(utf8ByteLength(serialized)>persistenceLimit)throw Error("Layout export exceeds size limit");
  return serialized;
 }
 function viewSnapshots(){
  const visibleRange=chart.timeScale().getVisibleLogicalRange();
  const persistentOscillators=[...oscillators.entries()].filter(([id])=>!transientOscillators.has(id));
  const persistentPaneLines=[...paneLines.entries()].map(([id,series])=>({id,series,paneIndex:chart.panes().findIndex(pane=>pane.getSeries().includes(series))}));
  const volumePaneIndex=volume?chart.panes().findIndex(pane=>pane.getSeries().includes(volume!)):-1;
  const retainedPaneIndices=new Set<number>([0,...persistentOscillators.map(([,group])=>group.paneIndex),
   ...persistentPaneLines.map(item=>item.paneIndex),...(volumePaneIndex>=1?[volumePaneIndex]:[])]);
  const orderedPaneIndices=[...retainedPaneIndices].filter(index=>Number.isInteger(index)&&index>=0&&index<chart.panes().length).sort((a,b)=>a-b);
  const portablePaneIndex=new Map(orderedPaneIndices.map((index,position)=>[index,position]));
  const paneHeight=(index:number)=>{const pane=chart.panes()[index],actual=pane?Math.round(pane.getHeight()):0,override=paneHeightOverrides.get(index),derived=Math.round(host.clientHeight/(chart.panes().length||1));return actual>=80&&actual<=600?actual:override&&override>=80&&override<=600?override:Number.isFinite(derived)?Math.min(600,Math.max(80,derived)):150};
  return {movingAverages:[...managedMovingAverages.entries()].filter(([id])=>!transientMovingAverages.has(id)).map(([,value])=>({...value.options})),
   sessionVwaps:[...sessionVwapOverlays.values()].map(({options})=>({...options})),
   supertrends:[...supertrendOverlays.values()].map(group=>({...group.options})),
   parabolicSars:[...parabolicSarOverlays.values()].map(group=>({...group.options})),
   oscillators:persistentOscillators.map(([,group])=>({options:{...group.options,settings:{...group.options.settings}},paneIndex:portablePaneIndex.get(group.paneIndex)??0})),
   paneLines:persistentPaneLines.map(({id,series,paneIndex})=>{const readout=readoutIndicators.get(id);return {options:{id,color:series.options().color as string,lineWidth:series.options().lineWidth,title:series.options().title,visible:series.options().visible},data:readout?[...readout.values].map(([time,value])=>({time,value})):[],paneIndex:portablePaneIndex.get(paneIndex)??0}}),
   paneHeights:orderedPaneIndices.map(paneHeight),volumeVisible:!!volume,
   volumePaneIndex:volume&&volumePaneIndex>=0?(portablePaneIndex.get(volumePaneIndex)??null):null,
   displayTimeZone,visibleRange:visibleRange?{from:visibleRange.from,to:visibleRange.to}:null};
 }
 function persistDrawings(protectedUndoEntries=0):boolean{
  if(!drawingScope||!drawingsHydrated||hydratingDrawings)return true;
  if(persistenceStatus==="CONFLICT"||persistenceStatus==="UNAVAILABLE")return false;
  const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return false}
  try{
   if(storage.getItem(key)!==lastPersistedSnapshot){persistenceStatus="CONFLICT";persistenceError="EXTERNAL_CHANGE";return false}
   const drawings=drawingSnapshots();
   const envelope=()=>JSON.stringify({schemaVersion:5,account:activeAccount,symbol:drawingScope.symbol,
   timeframe:drawingScope.timeframe,drawings,undoStack,redoStack,...viewSnapshots()});
   let serialized=envelope();
   while(utf8ByteLength(serialized)>persistenceLimit&&undoStack.length>protectedUndoEntries){undoStack.shift();serialized=envelope()}
   while(utf8ByteLength(serialized)>persistenceLimit&&redoStack.length){redoStack.shift();serialized=envelope()}
   if(utf8ByteLength(serialized)>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return false}
   storage.setItem(key,serialized);lastPersistedSnapshot=serialized;persistenceStatus="READY";persistenceError=null;return true;
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_WRITE_FAILED";return false}
 }
 function verifyPersistence():boolean{
  guard();
  if(!drawingScope||!drawingsHydrated||persistenceStatus!=="READY")return false;
  const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return false}
  try{
   if(storage.getItem(key)!==lastPersistedSnapshot){persistenceStatus="CONFLICT";persistenceError="EXTERNAL_CHANGE";return false}
   return true;
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_READ_FAILED";return false}
 }
 function hydrateDrawings(){
  if(!drawingScope){drawingsHydrated=true;persistenceStatus="DISABLED";return}
  if(drawingsHydrated)return;
  drawingsHydrated=true;const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return}
  let raw:string|null,legacy=false,currentSnapshot=false;
  try{raw=storage.getItem(key);currentSnapshot=raw!==null;if(raw===null){raw=storage.getItem(previousPersistenceKey()!);legacy=raw!==null}if(raw===null){raw=storage.getItem(legacyPersistenceKey()!);legacy=raw!==null}}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_READ_FAILED";return}
  lastPersistedSnapshot=currentSnapshot?raw:null;
  if(raw===null){persistenceStatus="READY";persistenceError=null;if(drawingCount())persistDrawings();return}
  if(utf8ByteLength(raw)>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return}
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  if(!parsed||typeof parsed!=="object") {persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  const root=parsed as Record<string,unknown>;
  const schemaKeys=Object.keys(root).sort().join(",");
  if(!root||Array.isArray(parsed)||!new Set(["account,drawings,schemaVersion,symbol,timeframe","account,drawings,redoStack,schemaVersion,symbol,timeframe,undoStack","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,redoStack,schemaVersion,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,redoStack,schemaVersion,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,parabolicSars,redoStack,schemaVersion,sessionVwaps,supertrends,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible"]).has(schemaKeys)||
   (root.schemaVersion!==1&&root.schemaVersion!==2&&root.schemaVersion!==3&&root.schemaVersion!==4&&root.schemaVersion!==5)||(("supertrends" in root||"parabolicSars" in root)&&root.schemaVersion<3)||("sessionVwaps" in root&&root.schemaVersion<4)||root.account!==activeAccount||root.symbol!==drawingScope.symbol||root.timeframe!==drawingScope.timeframe||!Array.isArray(root.drawings)||root.drawings.length>maxNativeDrawings){
   persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_MISMATCHED_SNAPSHOT";return;
  }
  const isV2=root.schemaVersion>=2,isV3=root.schemaVersion>=3,isV4=root.schemaVersion>=4,isV5=root.schemaVersion===5;
  const restoredUndo:DrawingHistory[]=[],restoredRedo:DrawingHistory[]=[];
  let restoredAverages:MovingAverageOptions[]=[],restoredOscillators:Array<{options:OscillatorOptions;paneIndex:number}>=[],restoredPaneLines:Array<{options:AverageOptions;data:AveragePoint[];paneIndex:number}>=[],restoredSupertrends:SupertrendOptions[]=[],restoredParabolicSars:ParabolicSarOptions[]=[],restoredSessionVwaps:SessionVwapOptions[]=[],restoredPaneHeights:number[]=[],restoredVolume=false,restoredVolumePane:number|null=null,restoredTimeZone="UTC",restoredRange:LogicalRange|null=null;
  if(isV3){
   try{
    if(!Array.isArray(root.movingAverages)||root.movingAverages.length>16||!Array.isArray(root.oscillators)||root.oscillators.length>8||!Array.isArray(root.paneLines)||root.paneLines.length>8||
       (root.supertrends!==undefined&&(!Array.isArray(root.supertrends)||root.supertrends.length>maxIndicatorInstances))||
       (root.parabolicSars!==undefined&&(!Array.isArray(root.parabolicSars)||root.parabolicSars.length>maxIndicatorInstances))||
       !Array.isArray(root.paneHeights)||root.paneHeights.length<1||root.paneHeights.length>10||typeof root.volumeVisible!=="boolean"||
       (root.volumePaneIndex!==null&&(!Number.isInteger(root.volumePaneIndex)||Number(root.volumePaneIndex)<1||Number(root.volumePaneIndex)>=root.paneHeights.length))||
       (root.volumeVisible!==(root.volumePaneIndex!==null))||typeof root.displayTimeZone!=="string")throw Error();
    const savedPaneHeights=root.paneHeights as unknown[];
    restoredAverages=root.movingAverages.map(raw=>{
     if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const options=raw as Record<string,unknown>;
     const keys=Object.keys(options).sort().join(","),allowed=new Set(["color,displayShift,id,period,source,type","color,displayShift,id,lineWidth,period,source,type","color,displayShift,id,period,source,type,visible","color,displayShift,id,lineWidth,period,source,type,visible","color,displayShift,id,period,source,title,type","color,displayShift,id,lineWidth,period,source,title,type","color,displayShift,id,period,source,title,type,visible","color,displayShift,id,lineWidth,period,source,title,type,visible","color,id,period,source,type","color,id,lineWidth,period,source,type","color,id,period,source,type,visible","color,id,lineWidth,period,source,type,visible","color,id,period,type","color,id,lineWidth,period,type","color,id,period,type,visible","color,id,lineWidth,period,type,visible"]);
     if(!allowed.has(keys)||typeof options.id!=="string"||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||typeof options.color!=="string"||!colorPattern.test(options.color)||
        (options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth as number))||(options.visible!==undefined&&typeof options.visible!=="boolean")||
        (options.title!==undefined&&(typeof options.title!=="string"||options.title.length>80||/[\u0000-\u001f\u007f]/.test(options.title))))throw Error();
     const value={...options,source:options.source??"close",displayShift:options.displayShift??0} as unknown as MovingAverageOptions;
     movingAverageData(bars,value);return value;
    });
    restoredOscillators=root.oscillators.map(raw=>{
     if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const entry=raw as Record<string,unknown>;
     if(Object.keys(entry).sort().join(",")!=="options,paneIndex"||!entry.options||typeof entry.options!=="object"||Array.isArray(entry.options)||!Number.isInteger(entry.paneIndex))throw Error();
     const options=entry.options as Record<string,unknown>,keys=Object.keys(options).sort().join(","),allowed=new Set(["color,id,kind,settings","color,id,kind,lineWidth,settings","color,id,kind,settings,title","color,id,kind,lineWidth,settings,title","color,id,kind,settings,visible","color,id,kind,lineWidth,settings,visible","color,id,kind,settings,title,visible","color,id,kind,lineWidth,settings,title,visible"]);
     if(!allowed.has(keys)||typeof options.id!=="string"||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||typeof options.color!=="string"||!colorPattern.test(options.color)||
        !(["rsi","atr","macd","adx","stochastic","stochrsi","cci","momentum","roc","obv","mfi"] as unknown[]).includes(options.kind)||(options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth as number))||
        (options.visible!==undefined&&typeof options.visible!=="boolean")||(options.title!==undefined&&(typeof options.title!=="string"||options.title.length>80||/[\u0000-\u001f\u007f]/.test(options.title)))||
        !Number.isInteger(entry.paneIndex)||Number(entry.paneIndex)<1||Number(entry.paneIndex)>=savedPaneHeights.length)throw Error();
     const oscillatorOptions=options as unknown as OscillatorOptions;calculateOscillator(bars,oscillatorOptions.kind,oscillatorOptions.settings);
     return {options:{...oscillatorOptions,settings:{...oscillatorOptions.settings}},paneIndex:Number(entry.paneIndex)};
    });
    restoredPaneLines=root.paneLines.map(raw=>{
     if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const entry=raw as Record<string,unknown>;
     if(Object.keys(entry).sort().join(",")!=="data,options,paneIndex"||!entry.options||typeof entry.options!=="object"||Array.isArray(entry.options)||!Array.isArray(entry.data)||entry.data.length>150000||!Number.isInteger(entry.paneIndex))throw Error();
     const options=entry.options as Record<string,unknown>,keys=Object.keys(options).sort().join(","),allowed=new Set(["color,id","color,id,lineWidth","color,id,title","color,id,visible","color,id,lineWidth,title","color,id,lineWidth,visible","color,id,title,visible","color,id,lineWidth,title,visible"]);
     if(!allowed.has(keys)||typeof options.id!=="string"||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||typeof options.color!=="string"||!colorPattern.test(options.color)||(options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth as number))||(options.visible!==undefined&&typeof options.visible!=="boolean")||(options.title!==undefined&&(typeof options.title!=="string"||options.title.length>80||/[\u0000-\u001f\u007f]/.test(options.title)))||!Number.isInteger(entry.paneIndex)||Number(entry.paneIndex)<1||Number(entry.paneIndex)>=savedPaneHeights.length)throw Error();
     return {options:options as unknown as AverageOptions,data:validSeriesData(entry.data as AveragePoint[]),paneIndex:Number(entry.paneIndex)};
    });
    restoredSupertrends=((root.supertrends??[]) as unknown[]).map(raw=>{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const options=raw as Record<string,unknown>;
     const keys=Object.keys(options).sort().join(","),allowed=new Set(["color,id,multiplier,period","color,id,lineWidth,multiplier,period","color,id,multiplier,period,title","color,id,lineWidth,multiplier,period,title","color,id,multiplier,period,visible","color,id,lineWidth,multiplier,period,visible","color,id,multiplier,period,title,visible","color,id,lineWidth,multiplier,period,title,visible"]);
     if(!allowed.has(keys)||!validSupertrendConfiguration(options as unknown as SupertrendOptions))throw Error();return {...options} as unknown as SupertrendOptions;});
    restoredParabolicSars=((root.parabolicSars??[]) as unknown[]).map(raw=>{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const options=raw as Record<string,unknown>;
     const keys=Object.keys(options).sort().join(","),allowed=new Set(["color,id,maxStep,step","color,id,lineWidth,maxStep,step","color,id,maxStep,step,title","color,id,lineWidth,maxStep,step,title","color,id,maxStep,step,visible","color,id,lineWidth,maxStep,step,visible","color,id,maxStep,step,title,visible","color,id,lineWidth,maxStep,step,title,visible"]);
     if(!allowed.has(keys)||!validParabolicSar(options as unknown as ParabolicSarOptions))throw Error();return {...options} as unknown as ParabolicSarOptions;});
    if(isV4&&(!Array.isArray(root.sessionVwaps)||root.sessionVwaps.length>maxIndicatorInstances))throw Error();
    restoredSessionVwaps=((root.sessionVwaps??[]) as unknown[]).map(raw=>{if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const options=raw as Record<string,unknown>;
     const normalized={...options,timeZone:options.timeZone??"UTC",sessionStart:options.sessionStart??"00:00",visible:options.visible??true} as ResolvedSessionVwapOptions;
     if(!validSessionVwapOptions(normalized))throw Error();calculateSessionVwap(bars,normalized);return {...normalized};});
    const restoredIds=[...restoredAverages.map(item=>item.id),...restoredOscillators.map(item=>item.options.id),...restoredPaneLines.map(item=>item.options.id),...restoredSupertrends.map(item=>item.id),...restoredParabolicSars.map(item=>item.id),...restoredSessionVwaps.map(item=>item.id)];
    if(restoredIds.length>maxIndicatorInstances||new Set(restoredIds).size!==restoredIds.length)throw Error();
    restoredPaneHeights=savedPaneHeights.map(value=>{if(!Number.isInteger(value)||Number(value)<80||Number(value)>600)throw Error();return Number(value)});
    if(root.volumePaneIndex!==null)restoredVolumePane=Number(root.volumePaneIndex);restoredVolume=root.volumeVisible;
    const zone=root.displayTimeZone;const canonical=new Intl.DateTimeFormat("en-US",{timeZone:zone}).resolvedOptions().timeZone;if(canonical!==zone)throw Error();restoredTimeZone=canonical;
    if(root.visibleRange!==null){if(!root.visibleRange||typeof root.visibleRange!=="object"||Array.isArray(root.visibleRange)||Object.keys(root.visibleRange).sort().join(",")!=="from,to")throw Error();const range=root.visibleRange as Record<string,unknown>;
     if(typeof range.from!=="number"||!Number.isFinite(range.from)||Math.abs(range.from)>1_000_000||typeof range.to!=="number"||!Number.isFinite(range.to)||Math.abs(range.to)>1_000_000||range.from>=range.to)throw Error();restoredRange={from:range.from,to:range.to} as unknown as LogicalRange}
   }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_VIEW_STATE";return}
  }
  const parseSnapshot=(raw:unknown,expectedId:string):DrawingSnapshot|null=>{
   if(raw===null)return null;
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();
   const row=raw as Record<string,unknown>;
   if(Object.keys(row).sort().join(",")!=="kind,options"||!row.options||typeof row.options!=="object"||Array.isArray(row.options))throw Error();
   const options=row.options as Record<string,unknown>,kind=row.kind;
   const keys=Object.keys(options).sort().join(",");
  const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="PITCHFORK"?"color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="RISK_REWARD"?"endTime,entryPrice,id,locked,startTime,stopPrice,stopTime,targetPrice,visible":kind==="FIB_TIME"?"color,endTime,id,locked,startTime,visible":kind==="FIB_FAN"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible":kind==="FIB_TREND"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):false;
   if(!expected||((kind!=="FIBO")&&keys!==expected)||options.id!==expectedId||averages.has(expectedId)||paneLines.has(expectedId))throw Error();
   if(kind==="PRICE"){const value=options as unknown as PriceLevelOptions;validatePriceLevel(value);return {kind,options:{...value}}}
   if(kind==="TIME"){const value=options as unknown as TimeMarkerOptions;validateTimeMarker(value,false);return {kind,options:{...value}}}
   if(kind==="TEXT"){const value=options as unknown as TextAnnotationOptions;validateTextAnnotation(value,false);return {kind,options:{...value}}}
   if(kind==="TREND"){const value=options as unknown as TrendLineOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   if(kind==="RECT"){const value=options as unknown as RectangleOptions;validateRectangle(value,false);return {kind,options:{...value}}}
   if(kind==="RAY"){const value=options as unknown as RayOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   if(kind==="CHANNEL"){const value=options as unknown as ChannelOptions;validateChannel(value,false);return {kind,options:{...value}}}
   if(kind==="PITCHFORK"){const value=options as unknown as PitchforkOptions;validatePitchfork(value);return {kind,options:{...value}}}
   if(kind==="RISK_REWARD"){const value=options as unknown as RiskRewardOptions;validateRiskReward(value,false);return {kind,options:{...value}}}
   if(kind==="MEASURE"){const value=options as unknown as MeasurementOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   if(kind==="FIB_TIME"){const value=options as unknown as FibonacciTimeZoneOptions;validateFibonacciTimeZone(value,false);return {kind,options:{...value}}}
   if(kind==="FIB_FAN"){const value=normalizeFibonacciFanOptions(options as unknown as FibonacciFanOptions,false);return {kind,options:{...value}}}
   if(kind==="FIB_TREND"){const value=normalizeTrendBasedFibonacciOptions(options as unknown as TrendBasedFibonacciOptions,false);return {kind,options:{...value}}}
   const value=normalizeFibonacciOptions(options as unknown as FibonacciOptions,false);return {kind:"FIBO",options:{...value}}
  };
  const parseHistory=(raw:unknown,out:DrawingHistory[])=>{
   if(!Array.isArray(raw)||raw.length>historyLimit)throw Error("history array invalid");
   for(const item of raw){
    if(!item||typeof item!=="object"||Array.isArray(item))throw Error("history item invalid");
    const entry=item as Record<string,unknown>;
    if(Object.keys(entry).sort().join(",")!=="after,before,id"||typeof entry.id!=="string"||!/^[-_a-zA-Z0-9]{1,32}$/.test(entry.id))throw Error();
    const before=parseSnapshot(entry.before,entry.id),after=parseSnapshot(entry.after,entry.id);
    if((before===null&&after===null)||(before&&after&&before.kind!==after.kind))throw Error();
    out.push({id:entry.id,before,after});
   }
  };
  if(isV2){
   try{parseHistory(root.undoStack,restoredUndo);parseHistory(root.redoStack,restoredRedo);if(restoredUndo.length+restoredRedo.length>historyLimit)throw Error(`history total ${restoredUndo.length}+${restoredRedo.length}`)}
   catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_UNAVAILABLE_DRAWING";return}
  }
  if(drawingCount()){persistenceStatus="CONFLICT";persistenceError="DRAWINGS_ALREADY_PRESENT";return}
  const seen=new Set<string>(),snapshots:DrawingSnapshot[]=[];
  try{
   for(const entry of root.drawings){
    if(!entry||typeof entry!=="object")throw Error();
    const row=entry as {kind?:unknown;options?:unknown};
    if(!row.options||typeof row.options!=="object")throw Error();
    const options=row.options as Record<string,unknown>;
    if(isV2){
     if(Array.isArray(entry)||Object.keys(entry).sort().join(",")!=="kind,options"||Array.isArray(row.options))throw Error();
     const keys=Object.keys(options).sort().join(","),kind=row.kind;
    const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="PITCHFORK"?"color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="RISK_REWARD"?"endTime,entryPrice,id,locked,startTime,stopPrice,stopTime,targetPrice,visible":kind==="FIB_TIME"?"color,endTime,id,locked,startTime,visible":kind==="FIB_FAN"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible":kind==="FIB_TREND"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):false;
     if(!expected||((kind!=="FIBO")&&keys!==expected))throw Error();
    }
    if(typeof options.id!=="string"||seen.has(options.id)||averages.has(options.id)||paneLines.has(options.id))throw Error();
    seen.add(options.id);
    if(row.kind==="PRICE"){
     const normalized={id:options.id,price:options.price,color:options.color,visible:options.visible,locked:options.locked} as PriceLevelOptions;
     validatePriceLevel(normalized);snapshots.push({kind:"PRICE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TIME"){
     const normalized={id:options.id,time:options.time,color:options.color,visible:options.visible,locked:options.locked} as TimeMarkerOptions;
     validateTimeMarker(normalized,false);snapshots.push({kind:"TIME",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TEXT"){
     const normalized={id:options.id,time:options.time,price:options.price,text:options.text,color:options.color,visible:options.visible,locked:options.locked} as TextAnnotationOptions;
     validateTextAnnotation(normalized,false);snapshots.push({kind:"TEXT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TREND"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,visible:options.visible,locked:options.locked} as TrendLineOptions;
     validateTrendLine(normalized,false);snapshots.push({kind:"TREND",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="RECT"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,fill:options.fill,visible:options.visible,locked:options.locked} as RectangleOptions;
     validateRectangle(normalized,false);snapshots.push({kind:"RECT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="RAY"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,visible:options.visible,locked:options.locked} as RayOptions;
     validateTrendLine(normalized,false);snapshots.push({kind:"RAY",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="CHANNEL"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,offsetTime:options.offsetTime,offsetPrice:options.offsetPrice,color:options.color,visible:options.visible,locked:options.locked} as ChannelOptions;
     validateChannel(normalized,false);snapshots.push({kind:"CHANNEL",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="PITCHFORK"){const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,thirdTime:options.thirdTime,thirdPrice:options.thirdPrice,color:options.color,visible:options.visible,locked:options.locked} as PitchforkOptions;validatePitchfork(normalized);snapshots.push({kind:"PITCHFORK",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="RISK_REWARD"){
     const normalized={id:options.id,startTime:options.startTime,entryPrice:options.entryPrice,stopTime:options.stopTime,stopPrice:options.stopPrice,endTime:options.endTime,targetPrice:options.targetPrice,visible:options.visible,locked:options.locked} as RiskRewardOptions;
     validateRiskReward(normalized,false);snapshots.push({kind:"RISK_REWARD",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="MEASURE"){
     const normalized=options as unknown as MeasurementOptions;validateTrendLine(normalized);snapshots.push({kind:"MEASURE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="FIB_FAN"){
     const normalized=normalizeFibonacciFanOptions(options as unknown as FibonacciFanOptions,false);snapshots.push({kind:"FIB_FAN",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="FIB_TREND"){
     const normalized=normalizeTrendBasedFibonacciOptions(options as unknown as TrendBasedFibonacciOptions,false);snapshots.push({kind:"FIB_TREND",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="FIB_TIME"){
     const normalized=options as unknown as FibonacciTimeZoneOptions;validateFibonacciTimeZone(normalized,false);snapshots.push({kind:"FIB_TIME",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="FIBO"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,levels:options.levels,visible:options.visible,locked:options.locked} as FibonacciOptions;
     const validated=normalizeFibonacciOptions(normalized,false);
     if(options.levels===undefined)delete validated.levels;
     snapshots.push({kind:"FIBO",options:{...validated,visible:validated.visible??true,locked:validated.locked??false}});
    }else throw Error();
   }
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_UNAVAILABLE_DRAWING";return}
  if(isV3){
    const drawingIds=snapshots.map(snapshot=>snapshot.options.id),indicatorIds=[...restoredAverages.map(item=>item.id),...restoredOscillators.map(item=>item.options.id),...restoredSupertrends.map(item=>item.id),...restoredParabolicSars.map(item=>item.id),...restoredSessionVwaps.map(item=>item.id)];
   const paneIds=new Set([...restoredOscillators.map(item=>item.paneIndex),...restoredPaneLines.map(item=>item.paneIndex),...(restoredVolumePane===null?[]:[restoredVolumePane])]);
   if(new Set([...drawingIds,...indicatorIds]).size!==drawingIds.length+indicatorIds.length||
      paneIds.size!==restoredPaneHeights.length-1||Array.from({length:restoredPaneHeights.length-1},(_,i)=>i+1).some(index=>!paneIds.has(index))||
      (restoredAverages.length+restoredOscillators.length+restoredPaneLines.length+restoredSupertrends.length+restoredParabolicSars.length+restoredSessionVwaps.length>0&&
       (averages.size>0||managedMovingAverages.size>0||oscillators.size>0||paneLines.size>0||donchianOverlays.size>0||keltnerOverlays.size+atrBandsOverlays.size>0||linearRegressionOverlays.size>0||supertrendOverlays.size>0||parabolicSarOverlays.size>0||sessionVwapOverlays.size>0))){
    persistenceStatus="CONFLICT";persistenceError="VIEW_ALREADY_PRESENT";return;
   }
  }
  hydratingDrawings=true;
  try{
   for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options,false);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options,false);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options,false);else if(snapshot.kind==="RECT")addRectangle(snapshot.options,false);else if(snapshot.kind==="RAY")addRay(snapshot.options,false);else if(snapshot.kind==="CHANNEL")addChannel(snapshot.options,false);else if(snapshot.kind==="PITCHFORK")addPitchfork(snapshot.options);else if(snapshot.kind==="RISK_REWARD")addRiskReward(snapshot.options);else if(snapshot.kind==="MEASURE")addMeasurement(snapshot.options);else if(snapshot.kind==="FIB_TIME")addFibonacciTimeZone(snapshot.options,false);else if(snapshot.kind==="FIB_FAN")addFibonacciFan(snapshot.options,false);else if(snapshot.kind==="FIB_TREND")addTrendBasedFibonacci(snapshot.options,false);else addFibonacci(snapshot.options,false)}
   if(isV3){
    for(const options of restoredAverages)addMovingAverage(options);
    for(const item of restoredOscillators)addOscillator(item.options);
    for(const options of restoredSupertrends)addSupertrend(options);
    for(const options of restoredParabolicSars)addParabolicSar(options);
    for(const options of restoredSessionVwaps)addSessionVwap(options);
    for(const item of restoredPaneLines){addPaneLine(item.options,item.data);const series=paneLines.get(item.options.id)!;series.moveToPane(item.paneIndex)}
    if(restoredVolume)showVolume(true);
    for(const item of restoredOscillators)if(oscillators.get(item.options.id)?.paneIndex!==item.paneIndex)moveOscillator(item.options.id,item.paneIndex);
    if(restoredVolume&&volume&&restoredVolumePane!==null){const current=chart.panes().findIndex(pane=>pane.getSeries().includes(volume!));if(current!==restoredVolumePane)volume.moveToPane(restoredVolumePane)}
    if(chart.panes().length!==restoredPaneHeights.length)throw Error();
    for(let index=1;index<restoredPaneHeights.length;index++){chart.panes()[index].setHeight(restoredPaneHeights[index]);paneHeightOverrides.set(index,restoredPaneHeights[index])}
    setDisplayTimeZone(restoredTimeZone);if(restoredRange)setVisibleLogicalRange(restoredRange);
   }
   undoStack.splice(0,undoStack.length,...restoredUndo);redoStack.splice(0,redoStack.length,...restoredRedo);persistenceStatus="READY";persistenceError=null;
  }catch(_){
   for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
   for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();
   for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
   for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
   for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
   for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
   for(const item of fibonacci.values())price.detachPrimitive(item.primitive);fibonacci.clear();
   for(const item of fibonacciFans.values())price.detachPrimitive(item.primitive);fibonacciFans.clear();for(const item of trendBasedFibonaccis.values())price.detachPrimitive(item.primitive);trendBasedFibonaccis.clear();
   for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();for(const item of pitchforks.values())price.detachPrimitive(item.primitive);pitchforks.clear();
   for(const item of measurements.values())price.detachPrimitive(item.primitive);measurements.clear();
   for(const item of riskRewards.values())price.detachPrimitive(item.primitive);riskRewards.clear();
   for(const item of averages.values())chart.removeSeries(item);averages.clear();managedMovingAverages.clear();transientMovingAverages.clear();
   for(const group of oscillators.values())for(const series of group.series.values())chart.removeSeries(series);oscillators.clear();transientOscillators.clear();readoutIndicators.clear();
   for(const group of supertrendOverlays.values()){chart.removeSeries(group.up);chart.removeSeries(group.down)}supertrendOverlays.clear();
   for(const group of parabolicSarOverlays.values()){chart.removeSeries(group.up);chart.removeSeries(group.down)}parabolicSarOverlays.clear();
   for(const group of sessionVwapOverlays.values())chart.removeSeries(group.series);sessionVwapOverlays.clear();
   for(const series of paneLines.values())chart.removeSeries(series);paneLines.clear();
   if(volume){chart.removeSeries(volume);volume=null}
   undoStack.length=0;redoStack.length=0;persistenceStatus="UNAVAILABLE";persistenceError="RESTORE_FAILED";
  }finally{hydratingDrawings=false}
  if(!isV5||legacy)persistDrawings();
 }
 function selectDrawing(id:string|null){
  selectDrawings(id===null?[]:[id]);
 }
 function markDrawingSelected(id:string,selected:boolean){
  trendBasedFibonaccis.get(id)?.primitive.setSelected(selected);
  priceLevels.get(id)?.primitive.setSelected(selected);timeMarkers.get(id)?.primitive.setSelected(selected);textAnnotations.get(id)?.primitive.setSelected(selected);trendLines.get(id)?.primitive.setSelected(selected);rectangles.get(id)?.primitive.setSelected(selected);rays.get(id)?.primitive.setSelected(selected);fibonacci.get(id)?.primitive.setSelected(selected);fibonacciFans.get(id)?.primitive.setSelected(selected);fibonacciTimeZones.get(id)?.primitive.setSelected(selected);channels.get(id)?.primitive.setSelected(selected);pitchforks.get(id)?.primitive.setSelected(selected);measurements.get(id)?.primitive.setSelected(selected);riskRewards.get(id)?.primitive.setSelected(selected);
 }
 function selectDrawings(ids:readonly string[]):string[]{
  guard();if(!Array.isArray(ids)||ids.length>maxNativeDrawings||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=="string"||!snapshotDrawing(id)))throw Error("Unknown or invalid drawing selection");
  for(const id of selectedDrawingIds)markDrawingSelected(id,false);
  selectedDrawingIds.clear();for(const id of ids){selectedDrawingIds.add(id);markDrawingSelected(id,true)}
  selectedDrawingId=ids[0]??null;return [...selectedDrawingIds];
 }
 function toggleDrawingSelection(id:string):string[]{
  guard();if(typeof id!=="string"||!snapshotDrawing(id))throw Error("Unknown drawing selection");
  const next=new Set(selectedDrawingIds);if(next.has(id))next.delete(id);else next.add(id);
  return selectDrawings([...next]);
 }
 function snapshotDrawing(id:string):DrawingSnapshot|null{
  const priceLevel=priceLevels.get(id);if(priceLevel)return {kind:"PRICE",options:{...priceLevel.options}};
  const timeMarker=timeMarkers.get(id);if(timeMarker)return {kind:"TIME",options:{...timeMarker.options}};
  const textAnnotation=textAnnotations.get(id);if(textAnnotation)return {kind:"TEXT",options:{...textAnnotation.options}};
  const trendLine=trendLines.get(id);if(trendLine)return {kind:"TREND",options:{...trendLine.options}};
  const rectangle=rectangles.get(id);if(rectangle)return {kind:"RECT",options:{...rectangle.options}};
  const ray=rays.get(id);if(ray)return {kind:"RAY",options:{...ray.options}};
  const fibo=fibonacci.get(id);if(fibo){const options={...fibo.options};if(options.levels)options.levels=[...options.levels];else delete options.levels;return {kind:"FIBO",options}}
  const fibFan=fibonacciFans.get(id);if(fibFan)return {kind:"FIB_FAN",options:{...fibFan.options,ratios:[...fibonacciFanRatios(fibFan.options)]}};
  const fibTrend=trendBasedFibonaccis.get(id);if(fibTrend)return {kind:"FIB_TREND",options:{...fibTrend.options,ratios:[...trendFibRatios(fibTrend.options)]}};
  const fibTime=fibonacciTimeZones.get(id);if(fibTime)return {kind:"FIB_TIME",options:{...fibTime.options}};
  const channel=channels.get(id);if(channel)return {kind:"CHANNEL",options:{...channel.options}}
  const pitchfork=pitchforks.get(id);if(pitchfork)return {kind:"PITCHFORK",options:{...pitchfork.options}}
  const measurement=measurements.get(id);if(measurement)return {kind:"MEASURE",options:{...measurement.options}}
  const riskReward=riskRewards.get(id);if(riskReward)return {kind:"RISK_REWARD",options:{...riskReward.options}}
  return null;
 }
 function recordDrawingChange(id:string,before:DrawingSnapshot|null,after:DrawingSnapshot|null){
  if(JSON.stringify(before)===JSON.stringify(after))return;
  undoStack.push({id,before,after});if(undoStack.length>historyLimit)undoStack.shift();redoStack.length=0;
  persistDrawings();
 }
 function restoreDrawing(id:string,snapshot:DrawingSnapshot|null):boolean{
  if(snapshot&&(averages.has(id)||paneLines.has(id)))return false;
  const wasSelected=selectedDrawingId===id;
  if(wasSelected)selectDrawing(null);
  const oldPrice=priceLevels.get(id);if(oldPrice){price.detachPrimitive(oldPrice.primitive);priceLevels.delete(id)}
  const oldTime=timeMarkers.get(id);if(oldTime){price.detachPrimitive(oldTime.primitive);timeMarkers.delete(id)}
  const oldText=textAnnotations.get(id);if(oldText){price.detachPrimitive(oldText.primitive);textAnnotations.delete(id)}
  const oldTrend=trendLines.get(id);if(oldTrend){price.detachPrimitive(oldTrend.primitive);trendLines.delete(id)}
  const oldRect=rectangles.get(id);if(oldRect){price.detachPrimitive(oldRect.primitive);rectangles.delete(id)}
  const oldRay=rays.get(id);if(oldRay){price.detachPrimitive(oldRay.primitive);rays.delete(id)}
  const oldFibo=fibonacci.get(id);if(oldFibo){price.detachPrimitive(oldFibo.primitive);fibonacci.delete(id)}
  const oldFibFan=fibonacciFans.get(id);if(oldFibFan){price.detachPrimitive(oldFibFan.primitive);fibonacciFans.delete(id)}
  const oldFibTrend=trendBasedFibonaccis.get(id);if(oldFibTrend){price.detachPrimitive(oldFibTrend.primitive);trendBasedFibonaccis.delete(id)}
  const oldFibTime=fibonacciTimeZones.get(id);if(oldFibTime){price.detachPrimitive(oldFibTime.primitive);fibonacciTimeZones.delete(id)}
  const oldChannel=channels.get(id);if(oldChannel){price.detachPrimitive(oldChannel.primitive);channels.delete(id)}
  const oldPitchfork=pitchforks.get(id);if(oldPitchfork){price.detachPrimitive(oldPitchfork.primitive);pitchforks.delete(id)}
  const oldMeasurement=measurements.get(id);if(oldMeasurement){price.detachPrimitive(oldMeasurement.primitive);measurements.delete(id)}
  const oldRiskReward=riskRewards.get(id);if(oldRiskReward){price.detachPrimitive(oldRiskReward.primitive);riskRewards.delete(id)}
  if(snapshot?.kind==="PRICE"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validatePriceLevel(options);
   const primitive=new PriceLevelPrimitive(id,options.price,options.color,options.visible??true);price.attachPrimitive(primitive);
   priceLevels.set(id,{primitive,options});
  }else if(snapshot?.kind==="TIME"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTimeMarker(options,false);
   const primitive=new TimeMarkerPrimitive(id,options.time,options.color,options.visible??true);price.attachPrimitive(primitive);
   timeMarkers.set(id,{primitive,options});
  }else if(snapshot?.kind==="TEXT"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTextAnnotation(options,false);
   const primitive=new TextAnnotationPrimitive(id,options);price.attachPrimitive(primitive);
   textAnnotations.set(id,{primitive,options});
  }else if(snapshot?.kind==="TREND"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTrendLine(options,false);
   const primitive=new TrendLinePrimitive(id,options);price.attachPrimitive(primitive);
   trendLines.set(id,{primitive,options});
  }else if(snapshot?.kind==="RECT"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateRectangle(options,false);
   const primitive=new RectanglePrimitive(id,options);price.attachPrimitive(primitive);
   rectangles.set(id,{primitive,options});
  }else if(snapshot?.kind==="RAY"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTrendLine(options,false);
   const primitive=new RayPrimitive(id,options);price.attachPrimitive(primitive);
   rays.set(id,{primitive,options});
  }else if(snapshot?.kind==="FIBO"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTrendLine(options,false);
   const primitive=new FibonacciPrimitive(id,options);price.attachPrimitive(primitive);
   fibonacci.set(id,{primitive,options});
  }else if(snapshot?.kind==="FIB_FAN"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options=normalizeFibonacciFanOptions({...snapshot.options,ratios:[...fibonacciFanRatios(snapshot.options)]},false),primitive=new FibonacciFanPrimitive(id,options);price.attachPrimitive(primitive);fibonacciFans.set(id,{primitive,options});
  }else if(snapshot?.kind==="FIB_TREND"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options=normalizeTrendBasedFibonacciOptions({...snapshot.options,ratios:[...trendFibRatios(snapshot.options)]},false),primitive=new TrendBasedFibonacciPrimitive(id,options);price.attachPrimitive(primitive);trendBasedFibonaccis.set(id,{primitive,options});
  }else if(snapshot?.kind==="FIB_TIME"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateFibonacciTimeZone(options,false);const primitive=new FibonacciTimeZonePrimitive(options);price.attachPrimitive(primitive);fibonacciTimeZones.set(id,{primitive,options});
  }else if(snapshot?.kind==="CHANNEL"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateChannel(options,false);
   const primitive=new ChannelPrimitive(id,options);price.attachPrimitive(primitive);channels.set(id,{primitive,options});
  }else if(snapshot?.kind==="PITCHFORK"){
   if(drawingCount()>=maxNativeDrawings)return false;const options={...snapshot.options};validatePitchfork(options);const primitive=new PitchforkPrimitive(id,options);price.attachPrimitive(primitive);pitchforks.set(id,{primitive,options});
  }else if(snapshot?.kind==="RISK_REWARD"){
   if(drawingCount()>=maxNativeDrawings)return false;const options={...snapshot.options};validateRiskReward(options,false);const primitive=new RiskRewardPrimitive(id,options);price.attachPrimitive(primitive);riskRewards.set(id,{primitive,options});
  }else if(snapshot?.kind==="MEASURE"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateTrendLine(options,false);
   const primitive=new MeasurementPrimitive(id,options,measurementLabel(options));price.attachPrimitive(primitive);measurements.set(id,{primitive,options});
  }
  if(wasSelected&&snapshot)selectDrawing(id);
  return true;
 }
 function undo(){
  guard();if(activeDrag){finishDrag(true);return true}
  const change=undoStack[undoStack.length-1];if(!change||!restoreDrawing(change.id,change.before))return false;
  undoStack.pop();redoStack.push(change);persistDrawings();return true;
 }
 function redo(){
  guard();if(activeDrag){finishDrag(true);return true}
  const change=redoStack[redoStack.length-1];if(!change||!restoreDrawing(change.id,change.after))return false;
  redoStack.pop();undoStack.push(change);persistDrawings();return true;
 }
 function deleteDrawingById(id:string):boolean{
  if(priceLevels.has(id))return removePriceLevel(id);
  if(timeMarkers.has(id))return removeTimeMarker(id);
  if(textAnnotations.has(id))return removeTextAnnotation(id);
  if(trendLines.has(id))return removeTrendLine(id);
  if(rectangles.has(id))return removeRectangle(id);
  if(rays.has(id))return removeRay(id);
  if(channels.has(id))return removeChannel(id);
  if(pitchforks.has(id))return removePitchfork(id);
  if(measurements.has(id))return removeMeasurement(id);
  if(riskRewards.has(id))return removeRiskReward(id);
  if(fibonacci.has(id))return removeFibonacci(id);
  if(fibonacciFans.has(id))return removeFibonacciFan(id);
  if(trendBasedFibonaccis.has(id))return removeTrendBasedFibonacci(id);
  if(fibonacciTimeZones.has(id))return removeFibonacciTimeZone(id);
  return false;
 }
 function deleteSelectedDrawings():string[]{
  guard();const ids=[...selectedDrawingIds];
  if(ids.some(id=>!snapshotDrawing(id)))throw Error("Drawing selection changed");
  const deleted:string[]=[];
  for(const id of ids)if(deleteDrawingById(id))deleted.push(id);
  return deleted;
 }
 function deleteSelectedDrawing():boolean{
  guard();return selectedDrawingId?deleteDrawingById(selectedDrawingId):false;
 }
 function duplicateSelectedDrawing(){
  guard();if(!selectedDrawingId)return null;
  const source=snapshotDrawing(selectedDrawingId);if(!source)return null;
  const base=selectedDrawingId.slice(0,20);let suffix=1,id="";
  do{id=`${base}-copy${suffix++}`}while(priceLevels.has(id)||timeMarkers.has(id)||textAnnotations.has(id)||trendLines.has(id)||rectangles.has(id)||rays.has(id)||fibonacci.has(id)||fibonacciFans.has(id)||trendBasedFibonaccis.has(id)||fibonacciTimeZones.has(id)||channels.has(id)||pitchforks.has(id)||riskRewards.has(id)||averages.has(id)||paneLines.has(id));
  if(source.kind==="PRICE")addPriceLevel({id,price:source.options.price,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TIME")addTimeMarker({id,time:source.options.time,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TEXT")addTextAnnotation({...source.options,id});
  else if(source.kind==="TREND")addTrendLine({...source.options,id});
  else if(source.kind==="RECT")addRectangle({...source.options,id});
  else if(source.kind==="RAY")addRay({...source.options,id});
  else if(source.kind==="FIB_FAN")addFibonacciFan({...source.options,id,ratios:[...fibonacciFanRatios(source.options)]});
  else if(source.kind==="FIB_TREND")addTrendBasedFibonacci({...source.options,id,ratios:[...trendFibRatios(source.options)]});
  else if(source.kind==="FIB_TIME")addFibonacciTimeZone({...source.options,id});
  else if(source.kind==="CHANNEL")addChannel({...source.options,id});
  else if(source.kind==="PITCHFORK")addPitchfork({...source.options,id});
  else if(source.kind==="MEASURE")addMeasurement({...source.options,id});
  else if(source.kind==="RISK_REWARD")addRiskReward({...source.options,id});
  else addFibonacci({...source.options,id});
  selectDrawing(id);return id;
 }
 function duplicateSelectedDrawings():string[]{
  guard();const sourceIds=[...selectedDrawingIds];
  if(sourceIds.some(id=>!snapshotDrawing(id)))throw Error("Drawing selection changed");
  if(drawingCount()+sourceIds.length>maxNativeDrawings)throw Error("Native drawing limit");
  const duplicates:string[]=[];
  for(const sourceId of sourceIds){
   selectDrawing(sourceId);const duplicateId=duplicateSelectedDrawing();
   if(!duplicateId)throw Error("Drawing could not be duplicated");
   duplicates.push(duplicateId);
  }
  selectDrawings(duplicates);return duplicates;
 }
 function setCandles(data:readonly Candle[]){
  guard();const next=normalizeCandles(data);finishDrag(true);undoStack.length=0;redoStack.length=0;bars=next;barsByTime=new Map(bars.map(c=>[c.time,c]));
  brokerDealMarkers=brokerDealMarkers.map(row=>({...row,plotted:barsByTime.has(row.chartTimeSeconds)}));brokerDealPrimitive.set(brokerDealMarkers);
  for(const series of averages.values())series.setData([]);
  for(const series of paneLines.values())series.setData([]);
  for(const group of oscillators.values())for(const series of group.series.values())series.setData([] as never);
  for(const group of supertrendOverlays.values()){group.up.setData([]);group.down.setData([])}
  for(const group of parabolicSarOverlays.values()){group.up.setData([]);group.down.setData([])}
  readoutIndicators.clear();price.setData(bars);refreshManagedMovingAverages();refreshDonchianOverlays();refreshBollingerOverlays();refreshSessionVwapOverlays();refreshKeltnerOverlays();refreshAtrBandsOverlays();refreshLinearRegressionOverlays();
  refreshSupertrendOverlays();refreshParabolicSar();refreshIchimokuOverlays();refreshPivotOverlays();refreshOscillators();refreshVolumeZones();refreshAutoFibonacci();
  if(volume)volume.setData(volumeRows());
  hydrateDrawings();
  if(drawingsHydrated&&persistenceStatus==="READY")persistDrawings();
 }
 function volumeRows(){
  return bars.map(c=>({time:c.time,value:Math.max(0,(c.real_volume??0)>0?c.real_volume!:c.tick_volume??0),
   color:c.close>=c.open?"#4bc3d7":"#dc6987"}));
 }
 function refreshVolumeZones(){if(!volumeZones)return;volumeZones.result=calculateVolumeZones(bars,{timeframeSeconds:volumeZones.options.timeframeSeconds,asOfUtc:volumeZones.asOf.timeUtc,lookback:volumeZones.options.lookback??20,multiplier:volumeZones.options.multiplier??2});volumeZones.primitive.set(volumeZones.result,volumeZones.options.visible??true)}
 function setVolumeZones(options:VolumeZonesOptions,asOf:VolumeZonesAsOf){
  guard();if(!options||typeof options!=="object"||Array.isArray(options)||Object.keys(options).some(key=>!["timeframeSeconds","lookback","multiplier","visible"].includes(key))||
   !Number.isSafeInteger(options.timeframeSeconds)||options.timeframeSeconds<=0||options.timeframeSeconds>86400||
   (options.lookback!==undefined&&(!Number.isInteger(options.lookback)||options.lookback<5||options.lookback>100))||
   (options.multiplier!==undefined&&(!Number.isFinite(options.multiplier)||options.multiplier<1||options.multiplier>10))||
   (options.visible!==undefined&&typeof options.visible!=="boolean"))throw Error("Invalid volume-zone configuration");
  if(!asOf||typeof asOf!=="object"||Array.isArray(asOf)||Object.keys(asOf).some(key=>!["source","account","symbol","timeframe","timeUtc"].includes(key))||asOf.source!=="MT5_VERIFIED"||asOf.account!==activeAccount||!drawingScope||asOf.symbol!==drawingScope.symbol||asOf.timeframe!==drawingScope.timeframe||!Number.isSafeInteger(asOf.timeUtc)||asOf.timeUtc<=0)throw Error("Volume-zone as-of does not match verified chart scope");
  const scopedSeconds=drawingScope?({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400} as Record<string,number>)[drawingScope.timeframe]:undefined;
  if(drawingScope&&(scopedSeconds===undefined||options.timeframeSeconds!==scopedSeconds))throw Error("Volume-zone timeframe does not match chart scope");
  const normalized={...options},verifiedAsOf={...asOf},result=calculateVolumeZones(bars,{timeframeSeconds:normalized.timeframeSeconds,asOfUtc:verifiedAsOf.timeUtc,lookback:normalized.lookback??20,multiplier:normalized.multiplier??2});
  if(volumeZones){volumeZones.options=normalized;volumeZones.asOf=verifiedAsOf;volumeZones.result=result;volumeZones.primitive.set(result,normalized.visible??true)}
  else{const primitive=new VolumeZonePrimitive(result,normalized.visible??true);price.attachPrimitive(primitive);volumeZones={options:normalized,asOf:verifiedAsOf,result,primitive}}
  return readVolumeZones();
 }
 function readVolumeZones(){guard();return volumeZones?{options:{...volumeZones.options},asOf:{...volumeZones.asOf},result:JSON.parse(JSON.stringify(volumeZones.result))}:null}
 function clearVolumeZones(){guard();if(!volumeZones)return false;price.detachPrimitive(volumeZones.primitive);volumeZones=null;return true}
 function refreshAutoFibonacci(){if(!autoFibonacci)return;autoFibonacci.result=calculateAutoFibonacci(bars,drawingScope?.timeframe??"",autoFibonacci.asOf.timeUtc);autoFibRatios.forEach((ratio,index)=>autoFibonacci!.series[index].setData(autoFibonacci!.result.lines[String(ratio) as keyof AutoFibonacciValues["lines"]].points))}
 function setAutoFibonacci(options:AutoFibonacciOptions,asOf:VolumeZonesAsOf){
  guard();if(!options||typeof options!=="object"||Array.isArray(options)||Object.keys(options).some(key=>!["timeframeSeconds","visible"].includes(key))||!Number.isSafeInteger(options.timeframeSeconds)||options.timeframeSeconds<=0||options.timeframeSeconds>604800||(options.visible!==undefined&&typeof options.visible!=="boolean"))throw Error("Invalid auto-Fibonacci configuration");
  if(!asOf||typeof asOf!=="object"||Array.isArray(asOf)||Object.keys(asOf).some(key=>!["source","account","symbol","timeframe","timeUtc"].includes(key))||asOf.source!=="MT5_VERIFIED"||asOf.account!==activeAccount||!drawingScope||asOf.symbol!==drawingScope.symbol||asOf.timeframe!==drawingScope.timeframe||!Number.isSafeInteger(asOf.timeUtc)||asOf.timeUtc<=0)throw Error("Auto-Fibonacci as-of does not match verified chart scope");
  const scopedSeconds=({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800} as Record<string,number>)[drawingScope.timeframe];if(scopedSeconds===undefined||options.timeframeSeconds!==scopedSeconds)throw Error("Auto-Fibonacci timeframe does not match chart scope");
  if(!autoFibonacci&&indicatorInstanceCount()>=maxIndicatorInstances)throw Error("Indicator instance limit");
  const normalized={...options},verifiedAsOf={...asOf},result=calculateAutoFibonacci(bars,drawingScope.timeframe,verifiedAsOf.timeUtc),visible=normalized.visible??true;
  if(autoFibonacci){autoFibonacci.options=normalized;autoFibonacci.asOf=verifiedAsOf;autoFibonacci.result=result;autoFibRatios.forEach((ratio,index)=>{autoFibonacci!.series[index].applyOptions({visible,title:`Auto Fib ${(ratio*100).toFixed(1)}%`});autoFibonacci!.series[index].setData(result.lines[String(ratio) as keyof AutoFibonacciValues["lines"]].points)})}
  else{const series=autoFibRatios.map((ratio,index)=>{const line=createPaneLine({id:`auto-fib-${index}`,color:autoFibColors[index],lineWidth:1,visible,title:`Auto Fib ${(ratio*100).toFixed(1)}%`},0);line.setData(result.lines[String(ratio) as keyof AutoFibonacciValues["lines"]].points);return line});autoFibonacci={options:normalized,asOf:verifiedAsOf,result,series}}
  return readAutoFibonacci();
 }
 function readAutoFibonacci(){guard();return autoFibonacci?{options:{...autoFibonacci.options},asOf:{...autoFibonacci.asOf},result:JSON.parse(JSON.stringify(autoFibonacci.result)),series:autoFibonacci.series.map(series=>({title:series.options().title,visible:series.options().visible,points:series.data().map(point=>({...point}))}))}:null}
 function clearAutoFibonacci(){guard();if(!autoFibonacci)return false;for(const series of autoFibonacci.series)chart.removeSeries(series);autoFibonacci=null;return true}
 function applyAverageData(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))throw Error("Invalid line options");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!averages.has(opts.id))throw Error("Indicator instance limit");
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const values=validSeriesData(data);
  let series=averages.get(opts.id);
  if(!series){series=newLine(opts);averages.set(opts.id,series)}
  else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(values);
  readoutIndicators.set(opts.id,{id:opts.id,title:opts.title??opts.id,kind:"OVERLAY",values:new Map(values.map(v=>[v.time,v.value]))});
 }
 function addAverage(opts:AverageOptions,data:readonly AveragePoint[]){managedMovingAverages.delete(opts?.id);transientMovingAverages.delete(opts?.id);applyAverageData(opts,data)}
 function addManagedMovingAverage(options:MovingAverageOptions,persistent:boolean){
  guard();const calculation=movingAverageData(bars,options),normalized={...options,source:options.source??"close",displayShift:options.displayShift??0};
  applyAverageData({id:options.id,color:options.color,lineWidth:options.lineWidth,visible:options.visible,title:options.title??`${options.type} ${options.period}`},calculation.points);
  managedMovingAverages.set(options.id,{options:normalized,base:new Map(calculation.base.map(point=>[point.time,point.value]))});
  if(persistent){transientMovingAverages.delete(options.id);persistDrawings()}
  else transientMovingAverages.add(options.id);
 }
 function addMovingAverage(options:MovingAverageOptions){addManagedMovingAverage(options,true)}
 function addTransientMovingAverage(options:MovingAverageOptions){addManagedMovingAverage(options,false)}
 function refreshDonchianOverlays(){
  for(const [id,group] of donchianOverlays){
   const values=donchianData(bars,group.options.period),keys:["upper","middle","lower"]=["upper","middle","lower"];
   for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
   readoutIndicators.set(id,{id,title:group.options.title??`Donchian ${group.options.period}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
  }
 }
 function validBollingerOptions(options:ResolvedBollingerOptions){
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&
   Object.keys(options).every(key=>["id","period","stdDev","color","lineWidth","visible","title"].includes(key))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&Number.isInteger(options.period)&&options.period>=2&&options.period<=300&&
   Number.isFinite(options.stdDev)&&options.stdDev>=.1&&options.stdDev<=10&&Math.abs(options.stdDev*10-Math.round(options.stdDev*10))<=1e-8&&
   (options.lineWidth===undefined||(Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4))&&
   (options.visible===undefined||typeof options.visible==="boolean")&&(options.title===undefined||(typeof options.title==="string"&&options.title.length<=80&&!/[\u0000-\u001f\u007f]/.test(options.title)));
 }
 function refreshBollingerOverlays(){
  for(const [id,group] of bollingerOverlays){
   const values=calculateBollingerBands(bars,group.options.period,group.options.stdDev),keys:["upper","middle","lower"]=["upper","middle","lower"];
   for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
   group.values=values;readoutIndicators.set(id,{id,title:group.options.title??`Bollinger ${group.options.period}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
  }
 }
 function sessionVwapTitle(options:ResolvedSessionVwapOptions,source:SessionVwapResult["volumeSource"]){
  const label=source==="REAL_VOLUME"?"Real volume":source==="TICK_VOLUME_PROXY"?"Tick-volume proxy":source==="MIXED"?"Real/tick-volume mix":"No usable volume";
  return `${options.title??"Session VWAP"} ${options.sessionStart} ${options.timeZone} · ${label}`;
 }
 function validSessionVwapOptions(options:ResolvedSessionVwapOptions){
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&
   Object.keys(options).every(key=>["id","color","lineWidth","visible","title","timeZone","sessionStart"].includes(key))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&
   (options.lineWidth===undefined||(Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4))&&
   (options.visible===undefined||typeof options.visible==="boolean")&&
   (options.title===undefined||(typeof options.title==="string"&&options.title.length<=80&&!/[\u0000-\u001f\u007f]/.test(options.title)))&&
   typeof options.timeZone==="string"&&options.timeZone.length>0&&options.timeZone.length<=64&&
   typeof options.sessionStart==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(options.sessionStart);
 }
 function refreshSessionVwapOverlays(){
  for(const [id,group] of sessionVwapOverlays){
   const result=calculateSessionVwap(bars,group.options);group.result=result;
   group.series.setData(result.points);group.series.applyOptions({title:sessionVwapTitle(group.options,result.volumeSource)});
   readoutIndicators.set(id,{id,title:sessionVwapTitle(group.options,result.volumeSource),kind:"OVERLAY",values:new Map(result.points.map(point=>[point.time,point.value]))});
  }
 }
 function addSessionVwap(options:SessionVwapOptions){
  guard();const normalized={...options,timeZone:options.timeZone??"UTC",sessionStart:options.sessionStart??"00:00",visible:options.visible??true} as ResolvedSessionVwapOptions;
  if(!validSessionVwapOptions(normalized))throw Error("Invalid session VWAP configuration");
  if(oscillators.has(normalized.id)||averages.has(normalized.id)||donchianOverlays.has(normalized.id)||bollingerOverlays.has(normalized.id)||
   keltnerOverlays.has(normalized.id)||atrBandsOverlays.has(normalized.id)||linearRegressionOverlays.has(normalized.id)||supertrendOverlays.has(normalized.id)||
   parabolicSarOverlays.has(normalized.id)||ichimokuOverlays.has(normalized.id)||pivotOverlays.has(normalized.id)||paneLines.has(normalized.id)||
   priceLevels.has(normalized.id)||timeMarkers.has(normalized.id)||textAnnotations.has(normalized.id)||trendLines.has(normalized.id)||
   rectangles.has(normalized.id)||rays.has(normalized.id)||fibonacci.has(normalized.id)||fibonacciFans.has(normalized.id)||trendBasedFibonaccis.has(normalized.id)||fibonacciTimeZones.has(normalized.id)||channels.has(normalized.id)||pitchforks.has(normalized.id)||measurements.has(normalized.id))throw Error("Duplicate chart object identity");
  const existing=sessionVwapOverlays.get(normalized.id);
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!existing)throw Error("Indicator instance limit");
  if(!existing&&(averages.has(normalized.id)||oscillators.has(normalized.id)||donchianOverlays.has(normalized.id)||bollingerOverlays.has(normalized.id)||keltnerOverlays.has(normalized.id)||atrBandsOverlays.has(normalized.id)||linearRegressionOverlays.has(normalized.id)||supertrendOverlays.has(normalized.id)||parabolicSarOverlays.has(normalized.id)||ichimokuOverlays.has(normalized.id)||pivotOverlays.has(normalized.id)||paneLines.has(normalized.id)||priceLevels.has(normalized.id)||timeMarkers.has(normalized.id)||textAnnotations.has(normalized.id)||trendLines.has(normalized.id)||rectangles.has(normalized.id)||rays.has(normalized.id)||fibonacci.has(normalized.id)||fibonacciFans.has(normalized.id)||trendBasedFibonaccis.has(normalized.id)||fibonacciTimeZones.has(normalized.id)||channels.has(normalized.id)||pitchforks.has(normalized.id)||measurements.has(normalized.id)))throw Error("Duplicate chart object identity");
  const result=calculateSessionVwap(bars,normalized),series=existing?.series??newLine({id:normalized.id,color:normalized.color,lineWidth:normalized.lineWidth,visible:normalized.visible,title:sessionVwapTitle(normalized,result.volumeSource)});
  series.applyOptions({color:normalized.color,lineWidth:normalized.lineWidth??2,visible:normalized.visible,title:sessionVwapTitle(normalized,result.volumeSource)});
  series.setData(result.points);sessionVwapOverlays.set(normalized.id,{options:normalized,series,result});
  readoutIndicators.set(normalized.id,{id:normalized.id,title:sessionVwapTitle(normalized,result.volumeSource),kind:"OVERLAY",values:new Map(result.points.map(point=>[point.time,point.value]))});
  persistDrawings();
  return {options:{...normalized},...result};
 }
 function updateSessionVwap(id:string,patch:Partial<Omit<SessionVwapOptions,"id">>){
  guard();const existing=sessionVwapOverlays.get(id);if(!existing)return false;
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["color","lineWidth","visible","title","timeZone","sessionStart"].includes(key)))throw Error("Invalid session VWAP update");
  const normalized={...existing.options,...patch,id} as ResolvedSessionVwapOptions;if(!validSessionVwapOptions(normalized))throw Error("Invalid session VWAP configuration");
  const result=calculateSessionVwap(bars,normalized),title=sessionVwapTitle(normalized,result.volumeSource);
  existing.series.applyOptions({color:normalized.color,lineWidth:normalized.lineWidth??2,visible:normalized.visible??true,title});
  existing.series.setData(result.points);existing.options=normalized;existing.result=result;
  readoutIndicators.set(id,{id,title,kind:"OVERLAY",values:new Map(result.points.map(point=>[point.time,point.value]))});persistDrawings();return {options:{...normalized},...result};
 }
 function removeSessionVwap(id:string){guard();const group=sessionVwapOverlays.get(id);if(!group)return false;chart.removeSeries(group.series);sessionVwapOverlays.delete(id);readoutIndicators.delete(id);persistDrawings();return true}
 function sessionVwapOptions(id:string){guard();const group=sessionVwapOverlays.get(id);return group?{...group.options}:null}
 function addBollinger(options:BollingerOptions){
  guard();const normalized={...options,period:options.period??20,stdDev:options.stdDev??2,visible:options.visible??true};
  if(!validBollingerOptions(normalized))throw Error("Invalid Bollinger configuration");
  if(oscillators.has(normalized.id)||averages.has(normalized.id)||donchianOverlays.has(normalized.id)||(keltnerOverlays.has(normalized.id)||atrBandsOverlays.has(normalized.id))||linearRegressionOverlays.has(normalized.id)||supertrendOverlays.has(normalized.id)||parabolicSarOverlays.has(normalized.id)||(ichimokuOverlays.has(normalized.id)||pivotOverlays.has(normalized.id))||paneLines.has(normalized.id)||priceLevels.has(normalized.id)||timeMarkers.has(normalized.id)||textAnnotations.has(normalized.id)||trendLines.has(normalized.id)||rectangles.has(normalized.id)||rays.has(normalized.id)||fibonacci.has(normalized.id)||fibonacciFans.has(normalized.id)||trendBasedFibonaccis.has(normalized.id)||fibonacciTimeZones.has(normalized.id)||channels.has(normalized.id)||pitchforks.has(normalized.id)||measurements.has(normalized.id)||riskRewards.has(normalized.id)||sessionVwapOverlays.has(normalized.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!bollingerOverlays.has(normalized.id))throw Error("Indicator instance limit");
  const existing=bollingerOverlays.get(normalized.id);
  const series:[LineApi,LineApi,LineApi]=existing?.series??[
   newLine({id:normalized.id+"-upper",color:normalized.color,lineWidth:normalized.lineWidth??2,visible:normalized.visible,title:`${normalized.title??"Bollinger"} Upper`}),
   newLine({id:normalized.id+"-middle",color:"#9f8be0",lineWidth:1,visible:normalized.visible,title:`${normalized.title??"Bollinger"} Middle`}),
   newLine({id:normalized.id+"-lower",color:normalized.color,lineWidth:normalized.lineWidth??2,visible:normalized.visible,title:`${normalized.title??"Bollinger"} Lower`})
  ];
  const colors=[normalized.color,"#9f8be0",normalized.color];
  for(let i=0;i<3;i++)series[i].applyOptions({color:colors[i],lineWidth:i===1?1:normalized.lineWidth??2,visible:normalized.visible,title:`${normalized.title??"Bollinger"} ${["Upper","Middle","Lower"][i]}`});
  bollingerOverlays.set(normalized.id,{options:normalized,series,values:existing?.values??{upper:[],middle:[],lower:[]}});refreshBollingerOverlays();
 }
 function updateBollinger(id:string,patch:Partial<Omit<BollingerOptions,"id">>){
  guard();const existing=bollingerOverlays.get(id);if(!existing)return false;
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["period","stdDev","color","lineWidth","visible","title"].includes(key)))throw Error("Invalid Bollinger update");
  const next={...existing.options,...patch};if(!validBollingerOptions(next))throw Error("Invalid Bollinger configuration");addBollinger(next);return true;
 }
 function bollingerOptions(id:string){guard();const group=bollingerOverlays.get(id);return group?{...group.options}:undefined}
 function removeBollinger(id:string){
  guard();const group=bollingerOverlays.get(id);if(!group)return false;
  for(const series of group.series)chart.removeSeries(series);bollingerOverlays.delete(id);readoutIndicators.delete(id);return true;
 }
 function addDonchian(options:DonchianOptions){
  guard();if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||
   !Number.isInteger(options.period)||options.period<2||options.period>200||
   (options.lineWidth!==undefined&&(!Number.isInteger(options.lineWidth)||options.lineWidth<1||options.lineWidth>4))||
   (options.visible!==undefined&&typeof options.visible!=="boolean"))throw Error("Invalid Donchian configuration");
  if(oscillators.has(options.id)||averages.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!donchianOverlays.has(options.id))throw Error("Indicator instance limit");
  const current=donchianOverlays.get(options.id),normalized={...options,visible:options.visible??true};
  const series:[LineApi,LineApi,LineApi]=current?.series??[
   newLine({id:options.id+"-upper",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Donchian"} Upper`}),
   newLine({id:options.id+"-middle",color:"#b7c8d0",lineWidth:1,visible:normalized.visible,title:`${options.title??"Donchian"} Middle`}),
   newLine({id:options.id+"-lower",color:"#f3c56a",lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Donchian"} Lower`})
  ];
  const colors=[options.color,"#b7c8d0","#f3c56a"];
  for(let i=0;i<3;i++)series[i].applyOptions({color:colors[i],lineWidth:i===1?1:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Donchian"} ${["Upper","Middle","Lower"][i]}`});
  donchianOverlays.set(options.id,{options:normalized,series});refreshDonchianOverlays();
 }
 function removeDonchian(id:string){
  guard();const group=donchianOverlays.get(id);if(!group)return false;
  for(const series of group.series)chart.removeSeries(series);donchianOverlays.delete(id);readoutIndicators.delete(id);return true;
 }
 function refreshKeltnerOverlays(){
  for(const [id,group] of keltnerOverlays){
   const values=keltnerData(bars,group.options),keys:["upper","middle","lower"]=["upper","middle","lower"];
   for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
   readoutIndicators.set(id,{id,title:group.options.title??`Keltner ${group.options.period}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
  }
 }
 function addKeltner(options:KeltnerOptions){
  guard();if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||
   !Number.isInteger(options.period)||options.period<2||options.period>200||!Number.isInteger(options.atrPeriod)||options.atrPeriod<2||options.atrPeriod>200||
   !Number.isFinite(options.multiplier)||options.multiplier<.1||options.multiplier>10||Math.abs(options.multiplier*10-Math.round(options.multiplier*10))>1e-8||
   (options.lineWidth!==undefined&&(!Number.isInteger(options.lineWidth)||options.lineWidth<1||options.lineWidth>4))||
   (options.visible!==undefined&&typeof options.visible!=="boolean"))throw Error("Invalid Keltner configuration");
   if(oscillators.has(options.id)||averages.has(options.id)||donchianOverlays.has(options.id)||atrBandsOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
   if(indicatorInstanceCount()>=maxIndicatorInstances&&!(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id)))throw Error("Indicator instance limit");
  const existing=keltnerOverlays.get(options.id),normalized={...options,visible:options.visible??true};
  const series:[LineApi,LineApi,LineApi]=existing?.series??[
   newLine({id:options.id+"-upper",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Keltner"} Upper`}),
   newLine({id:options.id+"-middle",color:"#b7c8d0",lineWidth:1,visible:normalized.visible,title:`${options.title??"Keltner"} Middle`}),
   newLine({id:options.id+"-lower",color:"#f3c56a",lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Keltner"} Lower`})
  ];
  const colors=[options.color,"#b7c8d0","#f3c56a"];
  for(let i=0;i<3;i++)series[i].applyOptions({color:colors[i],lineWidth:i===1?1:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Keltner"} ${["Upper","Middle","Lower"][i]}`});
  keltnerOverlays.set(options.id,{options:normalized,series});refreshKeltnerOverlays();
 }
 function removeKeltner(id:string){
  guard();const group=keltnerOverlays.get(id);if(!group)return false;
  for(const series of group.series)chart.removeSeries(series);keltnerOverlays.delete(id);readoutIndicators.delete(id);return true;
 }
 function refreshAtrBandsOverlays(){
  for(const [id,group] of atrBandsOverlays){
   const values=calculateAtrBands(bars,group.options.period,group.options.atrPeriod,group.options.multiplier),keys:["upper","middle","lower"]=["upper","middle","lower"];
   for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
   group.values=values;readoutIndicators.set(id,{id:id+"-middle",title:group.options.title??`ATR Bands ${group.options.period} / ${group.options.atrPeriod} × ${group.options.multiplier}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
  }
 }
 function validAtrBandsOptions(options:AtrBandsOptions){
  const period=options?.period??20,atrPeriod=options?.atrPeriod??14,multiplier=options?.multiplier??2;
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&Object.keys(options).every(key=>["id","period","atrPeriod","multiplier","color","lineWidth","visible","title"].includes(key))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&Number.isInteger(period)&&period>=2&&period<=200&&
   Number.isInteger(atrPeriod)&&atrPeriod>=2&&atrPeriod<=200&&Number.isFinite(multiplier)&&multiplier>=.1&&multiplier<=10&&Math.abs(multiplier*10-Math.round(multiplier*10))<=1e-8&&
   (options.lineWidth===undefined||Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4)&&
   (options.visible===undefined||typeof options.visible==="boolean")&&(options.title===undefined||typeof options.title==="string"&&options.title.length<=100&&!/[\u0000-\u001f\u007f]/.test(options.title));
 }
 function addAtrBands(options:AtrBandsOptions){
  guard();if(!validAtrBandsOptions(options))throw Error("Invalid ATR Bands configuration");
  const id=options.id;
  if(oscillators.has(id)||averages.has(id)||donchianOverlays.has(id)||bollingerOverlays.has(id)||keltnerOverlays.has(id)||linearRegressionOverlays.has(id)||supertrendOverlays.has(id)||parabolicSarOverlays.has(id)||paneLines.has(id)||priceLevels.has(id)||timeMarkers.has(id)||textAnnotations.has(id)||trendLines.has(id)||rectangles.has(id)||rays.has(id)||fibonacci.has(id)||fibonacciFans.has(id)||channels.has(id)||pitchforks.has(id)||measurements.has(id)||riskRewards.has(id)||sessionVwapOverlays.has(id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!atrBandsOverlays.has(id))throw Error("Indicator instance limit");
  const existing=atrBandsOverlays.get(id),normalized:ResolvedAtrBandsOptions={...options,period:options.period??20,atrPeriod:options.atrPeriod??14,multiplier:options.multiplier??2,visible:options.visible??true},title=options.title??"ATR Bands";
  const series:[LineApi,LineApi,LineApi]=existing?.series??[
   newLine({id:id+"-upper",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" Upper"}),
   newLine({id:id+"-middle",color:"#b7c8d0",lineWidth:1,visible:normalized.visible,title:title+" Middle"}),
   newLine({id:id+"-lower",color:"#f3c56a",lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" Lower"})
  ];
  for(let i=0;i<3;i++)series[i].applyOptions({color:[options.color,"#b7c8d0","#f3c56a"][i],lineWidth:i===1?1:options.lineWidth??2,visible:normalized.visible,title:`${title} ${["Upper","Middle","Lower"][i]}`});
  atrBandsOverlays.set(id,{options:normalized,series,values:existing?.values??{upper:[],middle:[],lower:[]}});refreshAtrBandsOverlays();
 }
 function updateAtrBands(id:string,patch:Partial<Omit<AtrBandsOptions,"id">>){
  guard();const existing=atrBandsOverlays.get(id);if(!existing)return false;
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["period","atrPeriod","multiplier","color","lineWidth","visible","title"].includes(key)))throw Error("Invalid ATR Bands update");
  const options={...existing.options,...patch};if(!validAtrBandsOptions(options))throw Error("Invalid ATR Bands configuration");addAtrBands(options);return true;
 }
 function atrBandsOptions(id:string){guard();const group=atrBandsOverlays.get(id);return group?{...group.options}:undefined}
 function removeAtrBands(id:string){
  guard();const group=atrBandsOverlays.get(id);if(!group)return false;
  for(const series of group.series)chart.removeSeries(series);atrBandsOverlays.delete(id);readoutIndicators.delete(id);return true;
 }
  function refreshLinearRegressionOverlays(){
   for(const [id,group] of linearRegressionOverlays){
    const values=calculateLinearRegressionChannel(bars,group.options.period,group.options.multiplier),keys:["upper","middle","lower"]=["upper","middle","lower"];
    for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
    group.values=values;
    readoutIndicators.set(id,{id,title:group.options.title??`Linear Regression ${group.options.period}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
   }
  }
  function validLinearRegressionOptions(options:LinearRegressionOptions){
   return !!options&&/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&
    Object.keys(options).every(key=>["id","period","multiplier","color","lineWidth","visible","title"].includes(key))&&
    Number.isInteger(options.period)&&options.period>=2&&options.period<=200&&Number.isFinite(options.multiplier)&&options.multiplier>=.1&&options.multiplier<=10&&Math.abs(options.multiplier*10-Math.round(options.multiplier*10))<=1e-8&&
    (options.lineWidth===undefined||(Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4))&&
    (options.visible===undefined||typeof options.visible==="boolean")&&(options.title===undefined||(typeof options.title==="string"&&options.title.length<=80));
  }
  function addLinearRegression(options:LinearRegressionOptions){
   guard();if(!validLinearRegressionOptions(options))throw Error("Invalid Linear Regression configuration");
   if(oscillators.has(options.id)||averages.has(options.id)||donchianOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
   if(indicatorInstanceCount()>=maxIndicatorInstances&&!linearRegressionOverlays.has(options.id))throw Error("Indicator instance limit");
   const existing=linearRegressionOverlays.get(options.id),normalized={...options,visible:options.visible??true};
   const series:[LineApi,LineApi,LineApi]=existing?.series??[
    newLine({id:options.id+"-upper",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Linear Regression"} Upper`}),
    newLine({id:options.id+"-middle",color:"#b7c8d0",lineWidth:1,visible:normalized.visible,title:`${options.title??"Linear Regression"} Middle`}),
    newLine({id:options.id+"-lower",color:"#f3c56a",lineWidth:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Linear Regression"} Lower`})
   ];
   const colors=[options.color,"#b7c8d0","#f3c56a"];
   for(let i=0;i<3;i++)series[i].applyOptions({color:colors[i],lineWidth:i===1?1:options.lineWidth??2,visible:normalized.visible,title:`${options.title??"Linear Regression"} ${["Upper","Middle","Lower"][i]}`});
   linearRegressionOverlays.set(options.id,{options:normalized,series,values:existing?.values??{upper:[],middle:[],lower:[]}});refreshLinearRegressionOverlays();
  }
  function updateLinearRegression(id:string,patch:Partial<Omit<LinearRegressionOptions,"id">>){
   guard();const existing=linearRegressionOverlays.get(id);if(!existing)return false;
   if(!patch||typeof patch!=="object"||Object.keys(patch).some(key=>!["period","multiplier","color","lineWidth","visible","title"].includes(key)))throw Error("Invalid Linear Regression update");
   const options={...existing.options,...patch};if(!validLinearRegressionOptions(options))throw Error("Invalid Linear Regression configuration");
   addLinearRegression(options);return true;
  }
  function linearRegressionOptions(id:string){guard();const group=linearRegressionOverlays.get(id);return group?{...group.options}:undefined}
  function removeLinearRegression(id:string){
   guard();const group=linearRegressionOverlays.get(id);if(!group)return false;
   for(const series of group.series)chart.removeSeries(series);linearRegressionOverlays.delete(id);readoutIndicators.delete(id);return true;
  }
 function refreshIchimokuOverlays(){
  const components:[keyof IchimokuValues,string][]=[["tenkan","Tenkan"],["kijun","Kijun"],["senkouA","Senkou A (Quelle)"],["senkouB","Senkou B (Quelle)"],["chikou","Chikou (Quelle)"]];
  for(const [id,group] of ichimokuOverlays){
   const values=calculateIchimoku(bars,{tenkanPeriod:group.options.tenkanPeriod,kijunPeriod:group.options.kijunPeriod,senkouBPeriod:group.options.senkouBPeriod,displacement:group.options.displacement,timeframe:drawingScope?.timeframe});
   const keys=components.map(([key])=>key);for(let i=0;i<keys.length;i++)group.series[i].setData(values[keys[i]].map(point=>({time:point.time,value:point.value})));
   group.values=values;group.cloud.set(values,group.options.visible??true);
   for(const [key,label] of components)readoutIndicators.set(id+":"+key,{id:id+":"+key,title:(group.options.title??"Ichimoku")+" "+label,kind:"OVERLAY",values:new Map(values[key].map(point=>[point.sourceTime,point.value]))});
  }
 }
 function refreshPivotOverlays(){
  for(const [id,group] of pivotOverlays){
   const values=calculatePivotPoints(group.sourceBars,bars,group.options.basis);group.values=values;
   for(const [key,series] of group.series)series.setData(values.lines[key].map(point=>({time:point.time,value:point.value})));
   for(const key of Object.keys(values.lines) as Array<keyof typeof values.lines>)readoutIndicators.set(id+":"+key,{id:id+":"+key,title:(group.options.title??"Pivot Points")+" "+key.toUpperCase(),kind:"OVERLAY",values:new Map(values.lines[key].map(point=>[point.time,point.value]))});
  }
 }
 function validPivotOptions(options:PivotOptions,sourceBars:readonly Candle[]){
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&
   Object.keys(options).every(key=>["id","color","lineWidth","visible","title","account","symbol","basis","source","sourceWindow"].includes(key))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&
   (options.lineWidth===undefined||Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4)&&
   (options.visible===undefined||typeof options.visible==="boolean")&&(options.title===undefined||typeof options.title==="string"&&options.title.length<=80&&!/[\u0000-\u001f\u007f]/.test(options.title))&&
   options.account===activeAccount&&options.symbol===drawingScope?.symbol&&(options.basis==="D1"||options.basis==="W1")&&options.source==="MT5_VERIFIED"&&
   options.sourceWindow&&Number.isSafeInteger(options.sourceWindow.from)&&Number.isSafeInteger(options.sourceWindow.to)&&sourceBars.length>=2&&
   sourceBars[0].time===options.sourceWindow.from&&sourceBars[sourceBars.length-1]?.time===options.sourceWindow.to&&calculatePivotPoints(sourceBars,bars,options.basis).available;
 }
 function addPivotPoints(options:PivotOptions,sourceBars:readonly Candle[]){
  guard();if(!validPivotOptions(options,sourceBars))throw Error("Invalid or mismatched verified Pivot Points scope");
  if(averages.has(options.id)||donchianOverlays.has(options.id)||bollingerOverlays.has(options.id)||keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||ichimokuOverlays.has(options.id)||oscillators.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!pivotOverlays.has(options.id))throw Error("Indicator instance limit");
  const existing=pivotOverlays.get(options.id),normalized={...options,visible:options.visible??true},keys:Array<keyof PivotValues["lines"]>=["p","r1","r2","r3","s1","s2","s3"],colors=[options.color,"#52cbea","#41d89a","#b58aff","#f47789","#ffae57","#e6e6e6"];
  const series=existing?.series??new Map<keyof PivotValues["lines"],LineApi>();
  for(let i=0;i<keys.length;i++){const key=keys[i];let line=series.get(key);if(!line){line=newLine({id:options.id+"-"+key,color:colors[i],lineWidth:key==="p"?2:1,visible:normalized.visible,title:(options.title??"Pivot Points")+" "+key.toUpperCase()});series.set(key,line)}line.applyOptions({color:colors[i],visible:normalized.visible,title:(options.title??"Pivot Points")+" "+key.toUpperCase()})}
  pivotOverlays.set(options.id,{options:normalized,series,sourceBars:sourceBars.map(bar=>({...bar})),values:existing?.values??calculatePivotPoints(sourceBars,bars,options.basis)});refreshPivotOverlays();
 }
 function updatePivotPoints(id:string,sourceBars:readonly Candle[]){
  guard();const existing=pivotOverlays.get(id);if(!existing)return false;
  const options={...existing.options,sourceWindow:{from:sourceBars[0]?.time,to:sourceBars[sourceBars.length-1]?.time}} as PivotOptions;
  if(!validPivotOptions(options,sourceBars))throw Error("Invalid or mismatched verified Pivot Points update");addPivotPoints(options,sourceBars);return true;
 }
 function pivotOptions(id:string){guard();const group=pivotOverlays.get(id);return group?{...group.options,sourceWindow:{...group.options.sourceWindow}}:undefined}
 function removePivotPoints(id:string){
  guard();const group=pivotOverlays.get(id);if(!group)return false;
  for(const series of group.series.values())chart.removeSeries(series);pivotOverlays.delete(id);for(const key of ["p","r1","r2","r3","s1","s2","s3"])readoutIndicators.delete(id+":"+key);return true;
 }
 function validIchimokuOptions(options:IchimokuOptions){
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&
   Object.keys(options).every(key=>["id","color","lineWidth","visible","title","tenkanPeriod","kijunPeriod","senkouBPeriod","displacement"].includes(key))&&
   Number.isInteger(options.tenkanPeriod??9)&&(options.tenkanPeriod??9)>=2&&(options.tenkanPeriod??9)<=200&&Number.isInteger(options.kijunPeriod??26)&&(options.kijunPeriod??26)>=2&&(options.kijunPeriod??26)<=200&&
   Number.isInteger(options.senkouBPeriod??52)&&(options.senkouBPeriod??52)>=2&&(options.senkouBPeriod??52)<=200&&Number.isInteger(options.displacement??26)&&(options.displacement??26)>=0&&(options.displacement??26)<=200&&
   (options.lineWidth===undefined||Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4)&&(options.visible===undefined||typeof options.visible==="boolean")&&
   (options.title===undefined||typeof options.title==="string"&&options.title.length<=80&&!/[\u0000-\u001f\u007f]/.test(options.title));
 }
 function addIchimoku(options:IchimokuOptions){
  guard();if(!validIchimokuOptions(options))throw Error("Invalid Ichimoku configuration");const id=options.id;
  if(averages.has(id)||donchianOverlays.has(id)||bollingerOverlays.has(id)||keltnerOverlays.has(id)||atrBandsOverlays.has(id)||linearRegressionOverlays.has(id)||supertrendOverlays.has(id)||parabolicSarOverlays.has(id)||oscillators.has(id)||paneLines.has(id)||priceLevels.has(id)||timeMarkers.has(id)||textAnnotations.has(id)||trendLines.has(id)||rectangles.has(id)||rays.has(id)||fibonacci.has(id)||fibonacciFans.has(id)||channels.has(id)||pitchforks.has(id)||measurements.has(id)||riskRewards.has(id)||sessionVwapOverlays.has(id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!ichimokuOverlays.has(id)&&!pivotOverlays.has(id))throw Error("Indicator instance limit");
  const existing=ichimokuOverlays.get(id),normalized:ResolvedIchimokuOptions={...options,tenkanPeriod:options.tenkanPeriod??9,kijunPeriod:options.kijunPeriod??26,senkouBPeriod:options.senkouBPeriod??52,displacement:options.displacement??26,visible:options.visible??true};
  const series:[LineApi,LineApi,LineApi,LineApi,LineApi]=existing?.series??[
   newLine({id:id+"-tenkan",color:"#55d7ee",lineWidth:1,visible:normalized.visible,title:"Ichimoku Tenkan"}),newLine({id:id+"-kijun",color:"#f3c56a",lineWidth:1,visible:normalized.visible,title:"Ichimoku Kijun"}),
   newLine({id:id+"-senkou-a",color:"#41d89a",lineWidth:1,visible:normalized.visible,title:"Ichimoku Senkou A"}),newLine({id:id+"-senkou-b",color:"#f47789",lineWidth:1,visible:normalized.visible,title:"Ichimoku Senkou B"}),newLine({id:id+"-chikou",color:"#b58aff",lineWidth:1,visible:normalized.visible,title:"Ichimoku Chikou"})];
  const titles=["Tenkan","Kijun","Senkou A","Senkou B","Chikou"],colors=[options.color,"#f3c56a","#41d89a","#f47789","#b58aff"];
  for(let i=0;i<series.length;i++)series[i].applyOptions({visible:normalized.visible,lineWidth:options.lineWidth??1,color:colors[i],title:(options.title??"Ichimoku")+" "+titles[i]});
  const cloud=existing?.cloud??new IchimokuCloudPrimitive(normalized.visible);if(!existing)price.attachPrimitive(cloud);
  ichimokuOverlays.set(id,{options:normalized,series,cloud,values:existing?.values??{tenkan:[],kijun:[],senkouA:[],senkouB:[],chikou:[]}});refreshIchimokuOverlays();
 }
 function updateIchimoku(id:string,patch:Partial<Omit<IchimokuOptions,"id">>){
  guard();const existing=ichimokuOverlays.get(id);if(!existing)return false;
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["color","lineWidth","visible","title","tenkanPeriod","kijunPeriod","senkouBPeriod","displacement"].includes(key)))throw Error("Invalid Ichimoku update");
  const options={...existing.options,...patch};if(!validIchimokuOptions(options))throw Error("Invalid Ichimoku configuration");addIchimoku(options);return true;
 }
 function ichimokuOptions(id:string){guard();const group=ichimokuOverlays.get(id);return group?{...group.options}:undefined}
 function removeIchimoku(id:string){guard();const group=ichimokuOverlays.get(id);if(!group)return false;for(const series of group.series)chart.removeSeries(series);price.detachPrimitive(group.cloud);ichimokuOverlays.delete(id);for(const key of ["tenkan","kijun","senkouA","senkouB","chikou"])readoutIndicators.delete(id+":"+key);return true}
 function refreshSupertrendOverlays(){
  for(const [id,group] of supertrendOverlays){
   const result=supertrendData(bars,group.options),up=new Map(result.up.map(point=>[point.time,point.value])),down=new Map(result.down.map(point=>[point.time,point.value]));
   group.up.setData(bars.map(bar=>{const value=up.get(bar.time);return value===undefined?{time:bar.time}:{time:bar.time,value}}));
   group.down.setData(bars.map(bar=>{const value=down.get(bar.time);return value===undefined?{time:bar.time}:{time:bar.time,value}}));
   group.state=result.state;group.beforeLast=result.beforeLast;group.lastTime=bars.length?bars[bars.length-1].time:null;
   readoutIndicators.set(id,{id,title:group.options.title??`Supertrend ${group.options.period} × ${group.options.multiplier}`,kind:"OVERLAY",values:new Map(result.values.map(point=>[point.time,point.value])),directions:new Map(result.values.map(point=>[point.time,point.trend]))});
  }
 }
 function updateSupertrendLast(group:SupertrendGroup,bar:Candle,index:number,replacing:boolean){
  const prior=replacing?group.beforeLast:group.state,result=supertrendStep(bars,index,group.options,prior),readout=readoutIndicators.get(group.options.id);
  if(replacing)group.state=result.state;else{group.beforeLast=group.state;group.state=result.state}
  group.lastTime=bar.time;
  const point=result.value;
  group.up.update(point?.trend==="UP"?{time:bar.time,value:point.value}:{time:bar.time});
  group.down.update(point?.trend==="DOWN"?{time:bar.time,value:point.value}:{time:bar.time});
  if(readout){readout.values.delete(bar.time);readout.directions?.delete(bar.time);if(point){readout.values.set(bar.time,point.value);readout.directions?.set(bar.time,point.trend)}}
 }
 function validSupertrendConfiguration(options:SupertrendOptions){
  const allowed=new Set(["id","period","multiplier","color","lineWidth","visible","title"]);
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&Object.keys(options).every(key=>allowed.has(key))&&
   (options.title===undefined||typeof options.title==="string"&&options.title.length<=100&&!/[\u0000-\u001f\u007f]/.test(options.title))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&
   Number.isInteger(options.period)&&options.period>=2&&options.period<=200&&Number.isFinite(options.multiplier)&&options.multiplier>=.1&&options.multiplier<=10&&Math.abs(options.multiplier*10-Math.round(options.multiplier*10))<=1e-8&&
   (options.lineWidth===undefined||Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4)&&
   (options.visible===undefined||typeof options.visible==="boolean");
 }
 function addSupertrend(options:SupertrendOptions){
  guard();if(!validSupertrendConfiguration(options))throw Error("Invalid Supertrend configuration");
  if(oscillators.has(options.id)||averages.has(options.id)||donchianOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances)throw Error("Indicator instance limit");
  const normalized={...options,visible:options.visible??true},title=options.title??`Supertrend ${options.period} × ${options.multiplier}`;
  const up=newLine({id:options.id+"-up",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" · Aufwärtstrend"});
  const down=newLine({id:options.id+"-down",color:"#f47789",lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" · Abwärtstrend"});
  const group={options:normalized,up,down,state:initialSupertrendState(),beforeLast:initialSupertrendState(),lastTime:null};supertrendOverlays.set(options.id,group);refreshSupertrendOverlays();persistDrawings();
 }
 function updateSupertrend(id:string,patch:Partial<Omit<SupertrendOptions,"id">>){
  guard();const group=supertrendOverlays.get(id);if(!group)throw Error("Unknown Supertrend instance");
  const patchKeys=new Set(["period","multiplier","color","lineWidth","visible","title"]);
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!patchKeys.has(key)))throw Error("Invalid Supertrend configuration");
  const next={...group.options,...patch};if(!validSupertrendConfiguration(next))throw Error("Invalid Supertrend configuration");
  const visible=next.visible??true,title=next.title??`Supertrend ${next.period} × ${next.multiplier}`;
  group.up.applyOptions({color:next.color,lineWidth:next.lineWidth??2,visible,title:title+" · Aufwärtstrend"});
  group.down.applyOptions({color:"#f47789",lineWidth:next.lineWidth??2,visible,title:title+" · Abwärtstrend"});
  group.options=next;refreshSupertrendOverlays();persistDrawings();return {...next};
 }
 function removeSupertrend(id:string){
  guard();const group=supertrendOverlays.get(id);if(!group)return false;
  chart.removeSeries(group.up);chart.removeSeries(group.down);supertrendOverlays.delete(id);readoutIndicators.delete(id);persistDrawings();return true;
 }
 function supertrendOptions(id:string){guard();const options=supertrendOverlays.get(id)?.options;return options?{...options}:null}
 function refreshParabolicSar(){
  for(const [id,group] of parabolicSarOverlays){
   const result=parabolicSarData(bars,group.options),up=new Map(result.up.map(point=>[point.time,point.value])),down=new Map(result.down.map(point=>[point.time,point.value]));
   group.up.setData(bars.map(bar=>{const value=up.get(bar.time);return value===undefined?{time:bar.time}:{time:bar.time,value}}));
   group.down.setData(bars.map(bar=>{const value=down.get(bar.time);return value===undefined?{time:bar.time}:{time:bar.time,value}}));
   group.state=result.state;group.beforeLast=result.beforeLast;group.lastTime=bars.length?bars[bars.length-1].time:null;
   readoutIndicators.set(id,{id,title:group.options.title??"Parabolic SAR",kind:"OVERLAY",values:new Map(result.values.map(point=>[point.time,point.value])),directions:new Map(result.values.map(point=>[point.time,point.trend]))});
  }
 }
 function updateParabolicSarLast(group:ParabolicSarGroup,bar:Candle,index:number,replacing:boolean){
  const prior=replacing?group.beforeLast:group.state,result=parabolicSarStep(bars,index,group.options,prior),readout=readoutIndicators.get(group.options.id);
  if(replacing)group.state=result.state;else{group.beforeLast=group.state;group.state=result.state}
  group.lastTime=bar.time;group.up.update(result.value?.trend==="UP"?{time:bar.time,value:result.value.value}:{time:bar.time});
  group.down.update(result.value?.trend==="DOWN"?{time:bar.time,value:result.value.value}:{time:bar.time});
  if(readout){readout.values.delete(bar.time);readout.directions?.delete(bar.time);if(result.value){readout.values.set(bar.time,result.value.value);readout.directions?.set(bar.time,result.value.trend)}}
 }
 function validParabolicSar(options:ParabolicSarOptions){
  const afValid=(value:number,min:number,max:number)=>Number.isFinite(value)&&value>=min&&value<=max&&Math.abs(value*100-Math.round(value*100))<=1e-8;
  const allowed=new Set(["id","step","maxStep","color","lineWidth","visible","title"]);
  return !!options&&typeof options==="object"&&!Array.isArray(options)&&Object.keys(options).every(key=>allowed.has(key))&&
   (options.title===undefined||typeof options.title==="string"&&options.title.length<=100&&!/[\u0000-\u001f\u007f]/.test(options.title))&&
   /^[-_a-zA-Z0-9]{1,32}$/.test(options.id)&&colorPattern.test(options.color)&&afValid(options.step,.01,.1)&&afValid(options.maxStep,.01,.5)&&options.maxStep>=options.step&&
   (options.lineWidth===undefined||Number.isInteger(options.lineWidth)&&options.lineWidth>=1&&options.lineWidth<=4)&&
   (options.visible===undefined||typeof options.visible==="boolean");
 }
 function addParabolicSar(options:ParabolicSarOptions){
  guard();if(!validParabolicSar(options))throw Error("Invalid Parabolic SAR configuration");
  if(averages.has(options.id)||managedMovingAverages.has(options.id)||oscillators.has(options.id)||paneLines.has(options.id)||donchianOverlays.has(options.id)||bollingerOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||linearRegressionOverlays.has(options.id)||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances)throw Error("Indicator instance limit");
  const normalized={...options,visible:options.visible??true},title=options.title??"Parabolic SAR";
  const up=newLine({id:options.id+"-up",color:options.color,lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" · Aufwärtstrend"});
  const down=newLine({id:options.id+"-down",color:"#f47789",lineWidth:options.lineWidth??2,visible:normalized.visible,title:title+" · Abwärtstrend"});
  parabolicSarOverlays.set(options.id,{options:normalized,up,down,state:initialParabolicSarState(),beforeLast:initialParabolicSarState(),lastTime:null});
  refreshParabolicSar();persistDrawings();
 }
 function updateParabolicSar(id:string,patch:Partial<Pick<ParabolicSarOptions,"step"|"maxStep"|"color"|"lineWidth"|"visible"|"title">>){
  guard();const group=parabolicSarOverlays.get(id);if(!group)throw Error("Unknown Parabolic SAR instance");
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["step","maxStep","color","lineWidth","visible","title"].includes(key)))throw Error("Invalid Parabolic SAR configuration");
  const next={...group.options,...patch};if(!validParabolicSar(next))throw Error("Invalid Parabolic SAR configuration");
  const visible=next.visible??true,title=next.title??"Parabolic SAR";
  group.up.applyOptions({color:next.color,lineWidth:next.lineWidth??2,visible,title:title+" · Aufwärtstrend"});
  group.down.applyOptions({color:"#f47789",lineWidth:next.lineWidth??2,visible,title:title+" · Abwärtstrend"});
  group.options=next;refreshParabolicSar();persistDrawings();return {...next};
 }
 function removeParabolicSar(id:string){
  guard();const group=parabolicSarOverlays.get(id);if(!group)return false;
  chart.removeSeries(group.up);chart.removeSeries(group.down);parabolicSarOverlays.delete(id);readoutIndicators.delete(id);persistDrawings();return true;
 }
 function parabolicSarOptions(id:string){guard();const options=parabolicSarOverlays.get(id)?.options;return options?{...options}:null}
 function refreshManagedMovingAverages(){
  for(const [id,state] of managedMovingAverages){
   const {options}=state,calculation=movingAverageData(bars,options);
   state.base=new Map(calculation.base.map(point=>[point.time,point.value]));
   applyAverageData({id:options.id,color:options.color,lineWidth:options.lineWidth,visible:options.visible,title:options.title??`${options.type} ${options.period}`},calculation.points);
  }
 }
 function updateManagedMovingAverage(id:string,state:{options:MovingAverageOptions;base:Map<number,number>}){
  const {options}=state,index=bars.length-1,bar=bars[index],{period,type,source="close",displayShift=0}=options;
  let value:number|null=null;
  const sourceValue=(item:Candle)=>source==="hl2"?(item.high+item.low)/2:source==="hlc3"?(item.high+item.low+item.close)/3:
   source==="ohlc4"?(item.open+item.high+item.low+item.close)/4:item[source];
  if(index>=period-1){
   const current=sourceValue(bar),prior=index>0?state.base.get(bars[index-1].time):undefined;
   if(type==="EMA"||type==="RMA"||type==="SMMA"){
    if(prior!==undefined)value=type==="EMA"?prior+(2/(period+1))*(current-prior):prior+(current-prior)/period;
    else{const recalculated=movingAverageData(bars,options).base;value=recalculated.length?recalculated[recalculated.length-1].value:null}
   }else{
    const start=index-period+1,window=bars.slice(start,index+1);let sum=0,weighted=0;
    for(let i=0;i<window.length;i++){const sample=sourceValue(window[i]);sum+=sample;if(type==="WMA")weighted+=(i+1)*sample}
    value=type==="SMA"?sum/period:weighted/(period*(period+1)/2);
   }
  }
  if(value===null)state.base.delete(bar.time);else state.base.set(bar.time,value);
  const series=averages.get(id),readout=readoutIndicators.get(id);if(!series||!readout)return;
  const targetIndex=index+displayShift;
  if(value!==null&&targetIndex>=0&&targetIndex<bars.length){
   const target=bars[targetIndex];series.update({time:target.time,value});readout.values.set(target.time,value);
  }
  if(displayShift>0){
   const revealedIndex=index-displayShift;
   if(revealedIndex>=0){const revealed=state.base.get(bars[revealedIndex].time);
    if(revealed!==undefined){series.update({time:bar.time,value:revealed});readout.values.set(bar.time,revealed)}
   }
  }
 }
 function validatePriceLevel(opts:PriceLevelOptions){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isFinite(opts.price)||opts.price<=0||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid price level");
 }
 function addPriceLevel(opts:PriceLevelOptions){
  guard();validatePriceLevel(opts);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=priceLevels.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options.price,options.color,options.visible);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new PriceLevelPrimitive(opts.id,options.price,options.color,options.visible);price.attachPrimitive(primitive);
  priceLevels.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updatePriceLevel(id:string,patch:Partial<Pick<PriceLevelOptions,"price"|"color"|"visible"|"locked">>){
  guard();const item=priceLevels.get(id);if(!item)throw Error("Unknown price level");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validatePriceLevel(options);item.primitive.set(options.price,options.color,options.visible);
  item.options=options;
  if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removePriceLevel(id:string){
  guard();const item=priceLevels.get(id);if(!item)return false;
  if(activeDrag?.id===id)finishDrag(true);
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);priceLevels.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function validateTimeMarker(opts:TimeMarkerOptions,requireLoadedTime=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.time)||opts.time<=0||!Number.isFinite(new Date(opts.time*1000).getTime())||
   (requireLoadedTime&&!barsByTime.has(opts.time))||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid or unloaded UTC time marker");
 }
 function addTimeMarker(opts:TimeMarkerOptions,requireLoadedTime=true){
  guard();validateTimeMarker(opts,requireLoadedTime);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=timeMarkers.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options.time,options.color,options.visible);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new TimeMarkerPrimitive(opts.id,options.time,options.color,options.visible);price.attachPrimitive(primitive);
  timeMarkers.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateTimeMarker(id:string,patch:Partial<Pick<TimeMarkerOptions,"time"|"color"|"visible"|"locked">>){
  guard();const item=timeMarkers.get(id);if(!item)throw Error("Unknown time marker");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTimeMarker(options,patch.time!==undefined);item.primitive.set(options.time,options.color,options.visible);
  item.options=options;
  if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeTimeMarker(id:string){
  guard();const item=timeMarkers.get(id);if(!item)return false;
  if(activeDrag?.id===id)finishDrag(true);
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);timeMarkers.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function validateTextAnnotation(opts:TextAnnotationOptions,requireLoadedTime=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.time)||opts.time<=0||!Number.isFinite(new Date(opts.time*1000).getTime())||
   (requireLoadedTime&&!barsByTime.has(opts.time))||!Number.isFinite(opts.price)||opts.price<=0||
   typeof opts.text!=="string"||! /^[\x20-\x7E]{1,40}$/.test(opts.text)||
   (opts.visible!==undefined&&typeof opts.visible!=="boolean")||(opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid or unavailable text annotation");
 }
 function addTextAnnotation(opts:TextAnnotationOptions,requireLoadedTime=true){
  guard();validateTextAnnotation(opts,requireLoadedTime);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=textAnnotations.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new TextAnnotationPrimitive(opts.id,options);price.attachPrimitive(primitive);
  textAnnotations.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateTextAnnotation(id:string,patch:Partial<Pick<TextAnnotationOptions,"time"|"price"|"text"|"color"|"visible"|"locked">>){
  guard();const item=textAnnotations.get(id);if(!item)throw Error("Unknown text annotation");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTextAnnotation(options,patch.time!==undefined);item.primitive.set(options);item.options=options;
  if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeTextAnnotation(id:string){
  guard();const item=textAnnotations.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);textAnnotations.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function validateTrendLine(opts:TrendLineOptions,requireLoadedAnchors=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.startTime)||!Number.isSafeInteger(opts.endTime)||opts.startTime<=0||opts.endTime<=0||opts.endTime===opts.startTime||
   !Number.isFinite(new Date(opts.startTime*1000).getTime())||!Number.isFinite(new Date(opts.endTime*1000).getTime())||
   (requireLoadedAnchors&&(!barsByTime.has(opts.startTime)||!barsByTime.has(opts.endTime)))||!Number.isFinite(opts.startPrice)||opts.startPrice<=0||
   !Number.isFinite(opts.endPrice)||opts.endPrice<=0||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))throw Error("Invalid or unavailable trend line");
 }
 function addTrendLine(opts:TrendLineOptions,requireLoadedAnchors=true){
  guard();validateTrendLine(opts,requireLoadedAnchors);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=trendLines.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new TrendLinePrimitive(opts.id,options);price.attachPrimitive(primitive);
  trendLines.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateTrendLine(id:string,patch:Partial<Pick<TrendLineOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){
  guard();const item=trendLines.get(id);if(!item)throw Error("Unknown trend line");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeTrendLine(id:string){
  guard();const item=trendLines.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);trendLines.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function validateRectangle(opts:RectangleOptions,requireLoadedAnchors=true){
  validateTrendLine(opts,requireLoadedAnchors);
  if(!opts||typeof opts.fill!=="boolean"||opts.startPrice===opts.endPrice)throw Error("Invalid rectangle fill/geometry");
 }
 function addRectangle(opts:RectangleOptions,requireLoadedAnchors=true){
  guard();validateRectangle(opts,requireLoadedAnchors);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=rectangles.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new RectanglePrimitive(opts.id,options);price.attachPrimitive(primitive);
  rectangles.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateRectangle(id:string,patch:Partial<Pick<RectangleOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"fill"|"visible"|"locked">>){
  guard();const item=rectangles.get(id);if(!item)throw Error("Unknown rectangle");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateRectangle(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeRectangle(id:string){
  guard();const item=rectangles.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);rectangles.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function addRay(opts:RayOptions,requireLoadedAnchors=true){
  guard();validateTrendLine(opts,requireLoadedAnchors);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=rays.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new RayPrimitive(opts.id,options);price.attachPrimitive(primitive);
  rays.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateRay(id:string,patch:Partial<Pick<RayOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){
  guard();const item=rays.get(id);if(!item)throw Error("Unknown ray");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeRay(id:string){
  guard();const item=rays.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);rays.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function normalizeFibonacciOptions(opts:FibonacciOptions,requireLoadedAnchors=true):FibonacciOptions{
  validateTrendLine(opts,requireLoadedAnchors);
  if(opts.levels===undefined){const base={...opts};delete base.levels;return base}
  if(!Array.isArray(opts.levels)||opts.levels.length<1||opts.levels.length>16||
   opts.levels.some((level,index)=>!Number.isFinite(level)||level < -1000||level > 1000||
    (index>0&&level<=opts.levels![index-1])))throw Error("Invalid Fibonacci levels");
  return {...opts,levels:[...opts.levels]};
 }
 function fibonacciLevels(id:string){
  guard();const item=fibonacci.get(id);if(!item)return null;
  return fibonacciRatios(item.options).map(({level,ratio})=>({level,ratio,price:item.options.startPrice+(item.options.endPrice-item.options.startPrice)*ratio}));
 }
 function addFibonacci(opts:FibonacciOptions,requireLoadedAnchors=true){
  guard();const normalized=normalizeFibonacciOptions(opts,requireLoadedAnchors);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=fibonacci.get(opts.id),options={...normalized,visible:normalized.visible??existing?.options.visible??true,locked:normalized.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new FibonacciPrimitive(opts.id,options);price.attachPrimitive(primitive);
  fibonacci.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateFibonacci(id:string,patch:Partial<Pick<FibonacciOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"levels"|"visible"|"locked">>){
  guard();const item=fibonacci.get(id);if(!item)throw Error("Unknown Fibonacci drawing");const before=snapshotDrawing(id);
  const options=normalizeFibonacciOptions({...item.options,...patch},patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeFibonacci(id:string){
  guard();const item=fibonacci.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);fibonacci.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function normalizeFibonacciFanOptions(options:FibonacciFanOptions,requireLoadedAnchors=true):FibonacciFanOptions{
  validateTrendLine(options,requireLoadedAnchors);
  const ratios=options.ratios??[...FIBONACCI_FAN_RATIOS];
  if(!Array.isArray(ratios)||ratios.length<1||ratios.length>16||ratios.some((ratio,index)=>!Number.isFinite(ratio)||ratio<=0||ratio>=1||(index>0&&ratio<=ratios[index-1])))throw Error("Invalid Fibonacci Fan ratios");
  return {...options,ratios:[...ratios]};
 }
 function fibonacciFanRays(id:string){guard();const item=fibonacciFans.get(id);return item?.primitive.coordinates()?.rays.map(ray=>({...ray}))??null}
 function addFibonacciFan(options:FibonacciFanOptions,requireLoadedAnchors=true){
  guard();const normalized=normalizeFibonacciFanOptions(options,requireLoadedAnchors);
  if(supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||oscillators.has(options.id)||donchianOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  const existing=fibonacciFans.get(options.id),next={...normalized,visible:normalized.visible??existing?.options.visible??true,locked:normalized.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(options.id);existing.primitive.set(next);existing.options=next;recordDrawingChange(options.id,before,snapshotDrawing(options.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new FibonacciFanPrimitive(options.id,next);price.attachPrimitive(primitive);fibonacciFans.set(options.id,{primitive,options:next});recordDrawingChange(options.id,null,snapshotDrawing(options.id));
 }
 function updateFibonacciFan(id:string,patch:Partial<Pick<FibonacciFanOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"ratios"|"visible"|"locked">>){
  guard();const item=fibonacciFans.get(id);if(!item)throw Error("Unknown Fibonacci Fan");const before=snapshotDrawing(id),options=normalizeFibonacciFanOptions({...item.options,...patch},patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeFibonacciFan(id:string){guard();const item=fibonacciFans.get(id);if(!item)return false;const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);fibonacciFans.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function normalizeTrendBasedFibonacciOptions(options:TrendBasedFibonacciOptions,requireLoadedAnchors=true):TrendBasedFibonacciOptions{
  const times=[options?.startTime,options?.endTime,options?.thirdTime],prices=[options?.startPrice,options?.endPrice,options?.thirdPrice],ratios=options?.ratios??[...TREND_FIB_RATIOS];
  if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||times.some(time=>!Number.isSafeInteger(time)||time<=0||!Number.isFinite(new Date(time*1000).getTime()))||new Set(times).size!==3||
    (requireLoadedAnchors&&times.some(time=>!barsByTime.has(time)))||prices.some(price=>!Number.isFinite(price)||price<=0)||
    !Array.isArray(ratios)||ratios.length<1||ratios.length>16||ratios.some((ratio,index)=>!Number.isFinite(ratio)||ratio<0||ratio>10||(index>0&&ratio<=ratios[index-1]))||
    (options.visible!==undefined&&typeof options.visible!=="boolean")||(options.locked!==undefined&&typeof options.locked!=="boolean"))throw Error("Invalid or unavailable Trend-Based Fibonacci");
  return {...options,ratios:[...ratios]};
 }
 function trendBasedFibonacciLevels(id:string){guard();const item=trendBasedFibonaccis.get(id);return item?.primitive.coordinates()?.levels.map(level=>({...level}))??null}
 function addTrendBasedFibonacci(options:TrendBasedFibonacciOptions,requireLoadedAnchors=true){
  guard();const normalized=normalizeTrendBasedFibonacciOptions(options,requireLoadedAnchors);
  if(supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||oscillators.has(options.id)||donchianOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  const next={...normalized,visible:normalized.visible??true,locked:normalized.locked??false};if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new TrendBasedFibonacciPrimitive(options.id,next);price.attachPrimitive(primitive);trendBasedFibonaccis.set(options.id,{primitive,options:next});recordDrawingChange(options.id,null,snapshotDrawing(options.id));
 }
 function updateTrendBasedFibonacci(id:string,patch:Partial<Omit<TrendBasedFibonacciOptions,"id">>){
  guard();const item=trendBasedFibonaccis.get(id);if(!item)throw Error("Unknown Trend-Based Fibonacci");
  if(!patch||typeof patch!=="object"||Array.isArray(patch)||Object.keys(patch).some(key=>!["startTime","startPrice","endTime","endPrice","thirdTime","thirdPrice","color","ratios","visible","locked"].includes(key)))throw Error("Invalid Trend-Based Fibonacci update");
  const before=snapshotDrawing(id),options=normalizeTrendBasedFibonacciOptions({...item.options,...patch},["startTime","endTime","thirdTime"].some(key=>key in patch));item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeTrendBasedFibonacci(id:string){guard();const item=trendBasedFibonaccis.get(id);if(!item)return false;const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);trendBasedFibonaccis.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function validateFibonacciTimeZone(options:FibonacciTimeZoneOptions,requireLoadedAnchors=true){
  const validTime=(value:number)=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value*1000).getTime());
  if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||!validTime(options.startTime)||!validTime(options.endTime)||options.startTime===options.endTime||
   (requireLoadedAnchors&&(!barsByTime.has(options.startTime)||!barsByTime.has(options.endTime)))||
   (options.visible!==undefined&&typeof options.visible!=="boolean")||(options.locked!==undefined&&typeof options.locked!=="boolean"))throw Error("Invalid or unavailable Fibonacci Time Zones");
 }
 function fibonacciTimeZoneGuides(id:string){guard();const item=fibonacciTimeZones.get(id);return item?.primitive.coordinates()?.map(guide=>({...guide}))??null}
 function addFibonacciTimeZone(options:FibonacciTimeZoneOptions,requireLoadedAnchors=true){
  guard();validateFibonacciTimeZone(options,requireLoadedAnchors);
  if(averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||fibonacciTimeZones.has(options.id)||oscillators.has(options.id)||donchianOverlays.has(options.id)||bollingerOverlays.has(options.id)||keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  const existing=fibonacciTimeZones.get(options.id),normalized={...options,visible:options.visible??existing?.options.visible??true,locked:options.locked??existing?.options.locked??false};
  if(existing){existing.primitive.setOptions(normalized);existing.options=normalized;return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new FibonacciTimeZonePrimitive(normalized);price.attachPrimitive(primitive);fibonacciTimeZones.set(options.id,{primitive,options:normalized});recordDrawingChange(options.id,null,snapshotDrawing(options.id));
 }
 function updateFibonacciTimeZone(id:string,patch:Partial<Pick<FibonacciTimeZoneOptions,"startTime"|"endTime"|"color"|"visible"|"locked">>){
  guard();const item=fibonacciTimeZones.get(id);if(!item)throw Error("Unknown Fibonacci Time Zones drawing");const before=snapshotDrawing(id),options={...item.options,...patch};validateFibonacciTimeZone(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.setOptions(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeFibonacciTimeZone(id:string){guard();const item=fibonacciTimeZones.get(id);if(!item)return false;const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);fibonacciTimeZones.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function validateChannel(opts:ChannelOptions,requireLoadedAnchors=true){
  const timeValid=(value:number)=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value*1000).getTime());
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !timeValid(opts.startTime)||!timeValid(opts.endTime)||!timeValid(opts.offsetTime)||
   (opts.startTime===opts.endTime&&opts.startPrice===opts.endPrice)||
   (requireLoadedAnchors&&(!barsByTime.has(opts.startTime)||!barsByTime.has(opts.endTime)||!barsByTime.has(opts.offsetTime)))||
   !Number.isFinite(opts.startPrice)||opts.startPrice<=0||!Number.isFinite(opts.endPrice)||opts.endPrice<=0||
   !Number.isFinite(opts.offsetPrice)||opts.offsetPrice<=0||
   (opts.visible!==undefined&&typeof opts.visible!=="boolean")||(opts.locked!==undefined&&typeof opts.locked!=="boolean"))throw Error("Invalid or unavailable channel");
  if(requireLoadedAnchors){
   const ax=chart.timeScale().timeToCoordinate(opts.startTime),bx=chart.timeScale().timeToCoordinate(opts.endTime),cx=chart.timeScale().timeToCoordinate(opts.offsetTime);
   const ay=price.priceToCoordinate(opts.startPrice),by=price.priceToCoordinate(opts.endPrice),cy=price.priceToCoordinate(opts.offsetPrice);
   if(ax!==null&&bx!==null&&cx!==null&&ay!==null&&by!==null&&cy!==null){
    const slope=Math.abs(bx-ax)<1e-7?0:(by-ay)/(bx-ax),shift=cy-(ay+slope*(cx-ax));
    if(Math.abs(shift)<0.5)throw Error("Channel offset must be nonzero");
   }
  }
 }
 function measurementLabel(options:MeasurementOptions){const read=measurementReadoutValue(options);return `${read.priceDelta>=0?"+":""}${read.priceDelta.toFixed(2)} (${read.percentChange>=0?"+":""}${read.percentChange.toFixed(2)}%) · ${read.bars} bars`}
 function measurementReadoutValue(options:MeasurementOptions){const start=barsByTime.get(options.startTime),end=barsByTime.get(options.endTime);if(!start||!end)throw Error("Invalid or unavailable measurement");return {priceDelta:options.endPrice-options.startPrice,percentChange:(options.endPrice-options.startPrice)/options.startPrice*100,bars:Math.abs(bars.indexOf(end)-bars.indexOf(start))}}
 function addMeasurement(opts:MeasurementOptions){guard();validateTrendLine(opts,true);if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");const existing=measurements.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");const primitive=new MeasurementPrimitive(opts.id,options,measurementLabel(options));price.attachPrimitive(primitive);measurements.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id))}
 function updateMeasurement(id:string,patch:Partial<Pick<MeasurementOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){guard();const item=measurements.get(id);if(!item)throw Error("Unknown measurement");const before=snapshotDrawing(id),options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);const label=measurementLabel(options);item.primitive.set(options);item.primitive.setReadout(label);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id))}
 function removeMeasurement(id:string){guard();const item=measurements.get(id);if(!item)return false;const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);measurements.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function measurementReadout(id:string){guard();const item=measurements.get(id);return item?measurementReadoutValue(item.options):null}
 function addChannel(opts:ChannelOptions,requireLoadedAnchors=true){
  guard();validateChannel(opts,requireLoadedAnchors);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=channels.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");
  const primitive=new ChannelPrimitive(opts.id,options);price.attachPrimitive(primitive);channels.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateChannel(id:string,patch:Partial<Pick<ChannelOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"offsetTime"|"offsetPrice"|"color"|"visible"|"locked">>){
  guard();const item=channels.get(id);if(!item)throw Error("Unknown channel");const before=snapshotDrawing(id),options={...item.options,...patch};
  validateChannel(options,patch.startTime!==undefined||patch.endTime!==undefined||patch.offsetTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeChannel(id:string){
  guard();const item=channels.get(id);if(!item)return false;if(activeDrag?.id===id)finishDrag(true);
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);channels.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true;
 }
 function validatePitchfork(opts:PitchforkOptions,requireLoadedAnchors=true){
  const validTime=(value:number)=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value*1000).getTime());
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||!validTime(opts.startTime)||!validTime(opts.endTime)||!validTime(opts.thirdTime)||opts.startTime>=opts.endTime||opts.startTime>=opts.thirdTime||opts.endTime===opts.thirdTime||
   (requireLoadedAnchors&&(!barsByTime.has(opts.startTime)||!barsByTime.has(opts.endTime)||!barsByTime.has(opts.thirdTime)))||
   !Number.isFinite(opts.startPrice)||opts.startPrice<=0||!Number.isFinite(opts.endPrice)||opts.endPrice<=0||!Number.isFinite(opts.thirdPrice)||opts.thirdPrice<=0||
   (opts.visible!==undefined&&typeof opts.visible!=="boolean")||(opts.locked!==undefined&&typeof opts.locked!=="boolean"))throw Error("Invalid or unavailable Pitchfork");
  if(requireLoadedAnchors){const xs=[opts.startTime,opts.endTime,opts.thirdTime].map(time=>chart.timeScale().timeToCoordinate(time)),ys=[opts.startPrice,opts.endPrice,opts.thirdPrice].map(value=>price.priceToCoordinate(value));if(xs.some(value=>value===null)||ys.some(value=>value===null))throw Error("Pitchfork anchors are outside the loaded chart")}
 }
 function addPitchfork(opts:PitchforkOptions){
  guard();validatePitchfork(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||bollingerOverlays.has(opts.id)||keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=pitchforks.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");const primitive=new PitchforkPrimitive(opts.id,options);price.attachPrimitive(primitive);pitchforks.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updatePitchfork(id:string,patch:Partial<Pick<PitchforkOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"thirdTime"|"thirdPrice"|"color"|"visible"|"locked">>){guard();const item=pitchforks.get(id);if(!item)throw Error("Unknown Pitchfork");const before=snapshotDrawing(id),options={...item.options,...patch},anchorChanged=patch.startTime!==undefined||patch.startPrice!==undefined||patch.endTime!==undefined||patch.endPrice!==undefined||patch.thirdTime!==undefined||patch.thirdPrice!==undefined;validatePitchfork(options,anchorChanged);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id))}
 function removePitchfork(id:string){guard();const item=pitchforks.get(id);if(!item)return false;if(activeDrag?.id===id)finishDrag(true);const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);pitchforks.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function validateRiskReward(options:RiskRewardOptions,requireLoadedAnchors=true){
  const validTime=(value:number)=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value*1000).getTime());
  if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!validTime(options.startTime)||!validTime(options.stopTime)||!validTime(options.endTime)||options.startTime===options.endTime||
   (requireLoadedAnchors&&(!barsByTime.has(options.startTime)||!barsByTime.has(options.stopTime)||!barsByTime.has(options.endTime)))||
   !Number.isFinite(options.entryPrice)||options.entryPrice<=0||!Number.isFinite(options.stopPrice)||options.stopPrice<=0||!Number.isFinite(options.targetPrice)||options.targetPrice<=0||
   (options.stopPrice-options.entryPrice)*(options.targetPrice-options.entryPrice)>=0||
   (options.visible!==undefined&&typeof options.visible!=="boolean")||(options.locked!==undefined&&typeof options.locked!=="boolean"))throw Error("Invalid or unavailable risk/reward drawing");
 }
 function riskRewardRatio(options:RiskRewardOptions){return Math.abs(options.targetPrice-options.entryPrice)/Math.abs(options.entryPrice-options.stopPrice)}
 function addRiskReward(options:RiskRewardOptions){
  guard();validateRiskReward(options,true);
  if(supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||oscillators.has(options.id)||donchianOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id))throw Error("Duplicate chart object identity");
  const existing=riskRewards.get(options.id),normalized={...options,visible:options.visible??existing?.options.visible??true,locked:options.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(options.id);existing.primitive.set(normalized);existing.options=normalized;recordDrawingChange(options.id,before,snapshotDrawing(options.id));return}
  if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");const primitive=new RiskRewardPrimitive(options.id,normalized);price.attachPrimitive(primitive);riskRewards.set(options.id,{primitive,options:normalized});recordDrawingChange(options.id,null,snapshotDrawing(options.id));
 }
 function updateRiskReward(id:string,patch:Partial<Pick<RiskRewardOptions,"startTime"|"entryPrice"|"stopTime"|"stopPrice"|"endTime"|"targetPrice"|"visible"|"locked">>){
  guard();const item=riskRewards.get(id);if(!item)throw Error("Unknown risk/reward drawing");const before=snapshotDrawing(id),options={...item.options,...patch};validateRiskReward(options,patch.startTime!==undefined||patch.stopTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeRiskReward(id:string){guard();const item=riskRewards.get(id);if(!item)return false;if(activeDrag?.id===id)finishDrag(true);const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);riskRewards.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function drawingPosition(id:string){
  guard();const rect=host.getBoundingClientRect();const priceLevel=priceLevels.get(id);
  if(priceLevel){if(!priceLevel.options.visible)return null;const y=priceLevel.primitive.coordinate();return y===null?null:{x:rect.left+Math.min(40,rect.width/2),y:rect.top+y}}
  const timeMarker=timeMarkers.get(id);if(timeMarker){if(!timeMarker.options.visible)return null;const x=timeMarker.primitive.coordinate();return x===null?null:{x:rect.left+x,y:rect.top+Math.min(40,rect.height/2)}}
  const annotation=textAnnotations.get(id);if(annotation){if(!annotation.options.visible)return null;const point=annotation.primitive.coordinate();return point===null?null:{x:rect.left+point.x+12,y:rect.top+point.y-8}}
  const trend=trendLines.get(id);if(trend){if(!trend.options.visible)return null;const p=trend.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  const zone=rectangles.get(id);if(zone){if(!zone.options.visible)return null;const p=zone.primitive.coordinates();return p===null?null:{x:rect.left+(p.left+p.right)/2,y:rect.top+(p.top+p.bottom)/2}}
  const ray=rays.get(id);if(ray){if(!ray.options.visible)return null;const p=ray.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  const fibo=fibonacci.get(id);if(fibo){if(!fibo.options.visible)return null;const p=fibo.primitive.coordinates();if(!p)return null;const level=p.levels.find(item=>item.ratio===0.5);return level?{x:rect.left+(p.x1+p.x2)/2,y:rect.top+level.y}:null}
  const fibFan=fibonacciFans.get(id);if(fibFan){if(!fibFan.options.visible)return null;const rays=fibFan.primitive.coordinates()?.rays;if(!rays?.length)return null;const ray=rays[Math.floor(rays.length/2)];return {x:rect.left+(ray.x1+ray.x2)/2,y:rect.top+(ray.y1+ray.y2)/2}}
  const fibTrend=trendBasedFibonaccis.get(id);if(fibTrend){if(!fibTrend.options.visible)return null;const levels=fibTrend.primitive.coordinates()?.levels;if(!levels?.length)return null;const level=levels[Math.floor(levels.length/2)];return {x:rect.left+(level.x1+level.x2)/2,y:rect.top+level.y}}
  const fibTime=fibonacciTimeZones.get(id);if(fibTime){if(!fibTime.options.visible)return null;const guide=fibTime.primitive.coordinates()?.[0];return guide?{x:rect.left+guide.x,y:rect.top+20}:null}
  const channel=channels.get(id);if(channel){if(!channel.options.visible)return null;const p=channel.primitive.coordinates();return p?{x:rect.left+(p.m1.x+p.m2.x)/2,y:rect.top+(p.m1.y+p.m2.y)/2}:null}
  const pitchfork=pitchforks.get(id);if(pitchfork){if(!pitchfork.options.visible)return null;const p=pitchfork.primitive.coordinates();return p?{x:rect.left+p.m.x,y:rect.top+p.m.y}:null}
  const measurement=measurements.get(id);if(measurement){if(!measurement.options.visible)return null;const p=measurement.primitive.coordinates();return p?{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}:null}
  const riskReward=riskRewards.get(id);if(riskReward){if(!riskReward.options.visible)return null;const p=riskReward.primitive.coordinates();return p?{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.entryY+p.targetY)/2}:null}
  return null;
 }
 function drawingGeometry(id:string){guard();const pitchfork=pitchforks.get(id);return pitchfork?.primitive.coordinates()??trendBasedFibonaccis.get(id)?.primitive.coordinates()??null}
 function drawingAnchorPosition(id:string,anchor:"START"|"END"|"OFFSET"|"THIRD"|"ENTRY"|"STOP"|"TARGET"){
  guard();const trend=trendLines.get(id),zone=rectangles.get(id),ray=rays.get(id),fibo=fibonacci.get(id),fibFan=fibonacciFans.get(id),fibTrend=trendBasedFibonaccis.get(id),measurement=measurements.get(id);
  const fibTime=fibonacciTimeZones.get(id)?.options;
  if(fibTime){if(fibTime.visible===false)return null;const x=chart.timeScale().timeToCoordinate(anchor==="START"?fibTime.startTime:fibTime.endTime),rect=host.getBoundingClientRect();return x===null?null:{x:rect.left+x,y:rect.top+20}}
  const channel=channels.get(id)?.options;
  const pitchfork=pitchforks.get(id)?.options;
  const risk=riskRewards.get(id)?.options;
  const fibTrendOptions=fibTrend?.options;
  if(fibTrendOptions){if(fibTrendOptions.visible===false)return null;const time=anchor==="START"?fibTrendOptions.startTime:anchor==="END"?fibTrendOptions.endTime:fibTrendOptions.thirdTime,priceValue=anchor==="START"?fibTrendOptions.startPrice:anchor==="END"?fibTrendOptions.endPrice:fibTrendOptions.thirdPrice,x=chart.timeScale().timeToCoordinate(time),y=price.priceToCoordinate(priceValue),rect=host.getBoundingClientRect();return x===null||y===null?null:{x:rect.left+x,y:rect.top+y}}
  if(risk){const time=anchor==="ENTRY"?risk.startTime:anchor==="STOP"?risk.stopTime:risk.endTime,priceValue=anchor==="ENTRY"?risk.entryPrice:anchor==="STOP"?risk.stopPrice:risk.targetPrice,x=chart.timeScale().timeToCoordinate(time),y=price.priceToCoordinate(priceValue),rect=host.getBoundingClientRect();return x===null||y===null?null:{x:rect.left+x,y:rect.top+y}}
  if(pitchfork){const time=anchor==="START"?pitchfork.startTime:anchor==="END"?pitchfork.endTime:pitchfork.thirdTime,priceValue=anchor==="START"?pitchfork.startPrice:anchor==="END"?pitchfork.endPrice:pitchfork.thirdPrice,x=chart.timeScale().timeToCoordinate(time),y=price.priceToCoordinate(priceValue),rect=host.getBoundingClientRect();return x===null||y===null?null:{x:rect.left+x,y:rect.top+y}}
  const options=trend?.options??zone?.options??ray?.options??fibo?.options??fibFan?.options??channel??measurement?.options;
  if(!options||options.visible===false)return null;
  const time=anchor==="OFFSET"&&channel?channel.offsetTime:anchor==="START"?options.startTime:options.endTime,priceValue=anchor==="OFFSET"&&channel?channel.offsetPrice:anchor==="START"?options.startPrice:options.endPrice;
  const x=chart.timeScale().timeToCoordinate(time),y=price.priceToCoordinate(priceValue),rect=host.getBoundingClientRect();
  return x===null||y===null?null:{x:rect.left+x,y:rect.top+y};
 }
 function readDrawing(id:string){
  guard();const level=priceLevels.get(id);if(level)return {...level.options};
  const marker=timeMarkers.get(id);if(marker)return {...marker.options};
  const annotation=textAnnotations.get(id);if(annotation)return {...annotation.options};
  const trend=trendLines.get(id);if(trend)return {...trend.options};
  const zone=rectangles.get(id);if(zone)return {...zone.options};
  const ray=rays.get(id);if(ray)return {...ray.options};
  const fibo=fibonacci.get(id);if(fibo){const options={...fibo.options};if(options.levels)options.levels=[...options.levels];else delete options.levels;return options}
  const fibFan=fibonacciFans.get(id);if(fibFan)return {...fibFan.options,ratios:[...fibonacciFanRatios(fibFan.options)]};
  const fibTrend=trendBasedFibonaccis.get(id);if(fibTrend)return {...fibTrend.options,ratios:[...trendFibRatios(fibTrend.options)]};
  const fibTime=fibonacciTimeZones.get(id);if(fibTime)return {...fibTime.options};
  const channel=channels.get(id);if(channel)return {...channel.options};
  const pitchfork=pitchforks.get(id);if(pitchfork)return {...pitchfork.options};
  const measurement=measurements.get(id);if(measurement)return {...measurement.options};
  const riskReward=riskRewards.get(id);if(riskReward)return {...riskReward.options,riskRewardRatio:riskRewardRatio(riskReward.options)};
  return null;
 }
 function exportDrawings():string{
  guard();if(!drawingScope)throw Error("Drawing export requires symbol/timeframe scope");
  const drawings:DrawingSnapshot[]=[
   ...[...priceLevels.values()].map(({options})=>({kind:"PRICE" as const,options:{...options}})),
    ...[...timeMarkers.values()].map(({options})=>({kind:"TIME" as const,options:{...options}})),
    ...[...textAnnotations.values()].map(({options})=>({kind:"TEXT" as const,options:{...options}})),
    ...[...trendLines.values()].map(({options})=>({kind:"TREND" as const,options:{...options}})),
    ...[...rectangles.values()].map(({options})=>({kind:"RECT" as const,options:{...options}})),
    ...[...rays.values()].map(({options})=>({kind:"RAY" as const,options:{...options}})),
   ...[...fibonacci.values()].map(({options})=>({kind:"FIBO" as const,options:{...options}})),
   ...[...fibonacciFans.values()].map(({options})=>({kind:"FIB_FAN" as const,options:{...options,ratios:[...fibonacciFanRatios(options)]}})),
   ...[...trendBasedFibonaccis.values()].map(({options})=>({kind:"FIB_TREND" as const,options:{...options,ratios:[...trendFibRatios(options)]}})),
   ...[...fibonacciTimeZones.values()].map(({options})=>({kind:"FIB_TIME" as const,options:{...options}})),
    ...[...channels.values()].map(({options})=>({kind:"CHANNEL" as const,options:{...options}})),
   ...[...pitchforks.values()].map(({options})=>({kind:"PITCHFORK" as const,options:{...options}})),
   ...[...measurements.values()].map(({options})=>({kind:"MEASURE" as const,options:{...options}})),
   ...[...riskRewards.values()].map(({options})=>({kind:"RISK_REWARD" as const,options:{...options}}))];
  const serialized=JSON.stringify({schemaVersion:1,symbol:drawingScope.symbol,timeframe:drawingScope.timeframe,drawings});
  if(utf8ByteLength(serialized)>persistenceLimit)throw Error("Drawing export exceeds size limit");
  return serialized;
 }
 function importDrawings(serialized:string):{imported:number}{
  guard();if(!drawingScope)throw Error("Drawing import requires symbol/timeframe scope");
  if(typeof serialized!=="string"||utf8ByteLength(serialized)>persistenceLimit)throw Error("Invalid drawing import size");
  let parsed:unknown;try{parsed=JSON.parse(serialized)}catch(_){throw Error("Invalid drawing import JSON")}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Invalid drawing import envelope");
  const root=parsed as Record<string,unknown>;
  if(Object.keys(root).sort().join(",")!=="drawings,schemaVersion,symbol,timeframe"||root.schemaVersion!==1||
   root.symbol!==drawingScope.symbol||root.timeframe!==drawingScope.timeframe||!Array.isArray(root.drawings)||root.drawings.length>maxNativeDrawings)
   throw Error("Unsupported or mismatched drawing import");
  if(!drawingsHydrated||persistenceStatus!=="READY")throw Error("Drawing import requires ready storage");
  const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";throw Error("Drawing storage unavailable")}
  try{if(storage.getItem(key)!==lastPersistedSnapshot){persistenceStatus="CONFLICT";persistenceError="EXTERNAL_CHANGE";throw Error("Drawing storage conflict")}}
  catch(error){if(persistenceStatus!=="CONFLICT"){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_READ_FAILED"}throw error}
  if(drawingCount())throw Error("Drawing import conflicts with existing drawings");
  const snapshots:DrawingSnapshot[]=[],seen=new Set<string>();
  for(const entry of root.drawings){
   if(!entry||typeof entry!=="object"||Array.isArray(entry))throw Error("Invalid drawing import entry");
   const row=entry as Record<string,unknown>;
   if(Object.keys(row).sort().join(",")!=="kind,options"||!row.options||typeof row.options!=="object"||Array.isArray(row.options))
    throw Error("Invalid drawing import entry");
   const options=row.options as Record<string,unknown>,kind=row.kind;
   const keys=Object.keys(options).sort().join(",");
    const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="PITCHFORK"?"color,endPrice,endTime,id,locked,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="FIB_TIME"?"color,endTime,id,locked,startTime,visible":kind==="FIB_FAN"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,visible":kind==="FIB_TREND"?"color,endPrice,endTime,id,locked,ratios,startPrice,startTime,thirdPrice,thirdTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":"";
   if(!expected||((kind!=="FIBO")&&keys!==expected)||typeof options.id!=="string"||seen.has(options.id)||
    averages.has(options.id)||supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id))throw Error("Invalid or conflicting drawing identity/options");
   seen.add(options.id);
   if(kind==="PRICE"){
    const normalized=options as unknown as PriceLevelOptions;validatePriceLevel(normalized);
    snapshots.push({kind:"PRICE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="TIME"){
    const normalized=options as unknown as TimeMarkerOptions;validateTimeMarker(normalized);
    snapshots.push({kind:"TIME",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="TEXT"){
    const normalized=options as unknown as TextAnnotationOptions;validateTextAnnotation(normalized);
    snapshots.push({kind:"TEXT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="TREND"){
    const normalized=options as unknown as TrendLineOptions;validateTrendLine(normalized);
    snapshots.push({kind:"TREND",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="RECT"){
    const normalized=options as unknown as RectangleOptions;validateRectangle(normalized);
    snapshots.push({kind:"RECT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="RAY"){
    const normalized=options as unknown as RayOptions;validateTrendLine(normalized);
    snapshots.push({kind:"RAY",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="CHANNEL"){
    const normalized=options as unknown as ChannelOptions;validateChannel(normalized);
    snapshots.push({kind:"CHANNEL",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="PITCHFORK"){
    const normalized=options as unknown as PitchforkOptions;validatePitchfork(normalized);
    snapshots.push({kind:"PITCHFORK",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="MEASURE"){
    const normalized=options as unknown as MeasurementOptions;validateTrendLine(normalized);snapshots.push({kind:"MEASURE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="FIB_FAN"){
    const normalized=normalizeFibonacciFanOptions(options as unknown as FibonacciFanOptions);snapshots.push({kind:"FIB_FAN",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="FIB_TREND"){
    const normalized=normalizeTrendBasedFibonacciOptions(options as unknown as TrendBasedFibonacciOptions,false);snapshots.push({kind:"FIB_TREND",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else if(kind==="FIB_TIME"){
    const normalized=options as unknown as FibonacciTimeZoneOptions;validateFibonacciTimeZone(normalized);snapshots.push({kind:"FIB_TIME",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else{
    const normalized=normalizeFibonacciOptions(options as unknown as FibonacciOptions);
    if(options.levels===undefined)delete normalized.levels;
    snapshots.push({kind:"FIBO",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }
  }
  if(snapshots.length>maxNativeDrawings)throw Error("Native drawing limit");
  hydratingDrawings=true;
  try{for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options);else if(snapshot.kind==="RECT")addRectangle(snapshot.options);else if(snapshot.kind==="RAY")addRay(snapshot.options);else if(snapshot.kind==="CHANNEL")addChannel(snapshot.options);else if(snapshot.kind==="PITCHFORK")addPitchfork(snapshot.options);else if(snapshot.kind==="RISK_REWARD")addRiskReward(snapshot.options);else if(snapshot.kind==="MEASURE")addMeasurement(snapshot.options);else if(snapshot.kind==="FIB_TIME")addFibonacciTimeZone(snapshot.options);else if(snapshot.kind==="FIB_FAN")addFibonacciFan(snapshot.options);else if(snapshot.kind==="FIB_TREND")addTrendBasedFibonacci(snapshot.options,false);else addFibonacci(snapshot.options)}}
  catch(error){
   for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
   for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();
   for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
   for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
   for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
   for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
   for(const item of fibonacci.values())price.detachPrimitive(item.primitive);fibonacci.clear();
   for(const item of fibonacciFans.values())price.detachPrimitive(item.primitive);fibonacciFans.clear();for(const item of trendBasedFibonaccis.values())price.detachPrimitive(item.primitive);trendBasedFibonaccis.clear();
   for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();for(const item of pitchforks.values())price.detachPrimitive(item.primitive);pitchforks.clear();
   for(const item of measurements.values())price.detachPrimitive(item.primitive);measurements.clear();
   for(const item of riskRewards.values())price.detachPrimitive(item.primitive);riskRewards.clear();
   undoStack.length=0;redoStack.length=0;throw error;
  }finally{hydratingDrawings=false}
  undoStack.length=0;redoStack.length=0;persistDrawings();
  return {imported:snapshots.length};
 }
 function setDrawingVisible(id:string,visible:boolean){
  guard();if(typeof visible!=="boolean")throw Error("Invalid drawing visibility");
  const priceLevel=priceLevels.get(id);if(priceLevel){updatePriceLevel(id,{visible});return true}
  const timeMarker=timeMarkers.get(id);if(timeMarker){updateTimeMarker(id,{visible});return true}
  const annotation=textAnnotations.get(id);if(annotation){updateTextAnnotation(id,{visible});return true}
  const trend=trendLines.get(id);if(trend){updateTrendLine(id,{visible});return true}
  const zone=rectangles.get(id);if(zone){updateRectangle(id,{visible});return true}
  const ray=rays.get(id);if(ray){updateRay(id,{visible});return true}
  const fibo=fibonacci.get(id);if(fibo){updateFibonacci(id,{visible});return true}
  const fibFan=fibonacciFans.get(id);if(fibFan){updateFibonacciFan(id,{visible});return true}
  const fibTrend=trendBasedFibonaccis.get(id);if(fibTrend){updateTrendBasedFibonacci(id,{visible});return true}
  const fibTime=fibonacciTimeZones.get(id);if(fibTime){updateFibonacciTimeZone(id,{visible});return true}
  const channel=channels.get(id);if(channel){updateChannel(id,{visible});return true}
  const pitchfork=pitchforks.get(id);if(pitchfork){updatePitchfork(id,{visible});return true}
  if(measurements.has(id)){updateMeasurement(id,{visible});return true}
  if(riskRewards.has(id)){updateRiskReward(id,{visible});return true}
  return false;
 }
 function setDrawingLocked(id:string,locked:boolean){
  guard();if(typeof locked!=="boolean")throw Error("Invalid drawing lock state");
  const priceLevel=priceLevels.get(id);if(priceLevel){updatePriceLevel(id,{locked});return true}
  const timeMarker=timeMarkers.get(id);if(timeMarker){updateTimeMarker(id,{locked});return true}
  const annotation=textAnnotations.get(id);if(annotation){updateTextAnnotation(id,{locked});return true}
  const trend=trendLines.get(id);if(trend){updateTrendLine(id,{locked});return true}
  const zone=rectangles.get(id);if(zone){updateRectangle(id,{locked});return true}
  const ray=rays.get(id);if(ray){updateRay(id,{locked});return true}
  const fibo=fibonacci.get(id);if(fibo){updateFibonacci(id,{locked});return true}
  const fibFan=fibonacciFans.get(id);if(fibFan){updateFibonacciFan(id,{locked});return true}
  const fibTrend=trendBasedFibonaccis.get(id);if(fibTrend){updateTrendBasedFibonacci(id,{locked});return true}
  const fibTime=fibonacciTimeZones.get(id);if(fibTime){updateFibonacciTimeZone(id,{locked});return true}
  const channel=channels.get(id);if(channel){updateChannel(id,{locked});return true}
  const pitchfork=pitchforks.get(id);if(pitchfork){updatePitchfork(id,{locked});return true}
  if(measurements.has(id)){updateMeasurement(id,{locked});return true}
  if(riskRewards.has(id)){updateRiskReward(id,{locked});return true}
  return false;
 }
 function setSelectedDrawingsVisible(visible:boolean):string[]{
  guard();if(typeof visible!=="boolean")throw Error("Invalid drawing visibility");
  const ids=[...selectedDrawingIds];if(ids.some(id=>!snapshotDrawing(id)))throw Error("Drawing selection changed");
  for(const id of ids)setDrawingVisible(id,visible);return ids;
 }
 function setSelectedDrawingsLocked(locked:boolean):string[]{
  guard();if(typeof locked!=="boolean")throw Error("Invalid drawing lock state");
  const ids=[...selectedDrawingIds];if(ids.some(id=>!snapshotDrawing(id)))throw Error("Drawing selection changed");
  for(const id of ids)setDrawingLocked(id,locked);return ids;
 }
 function addPaneLine(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))
   throw Error("Invalid pane line");
  const values=validSeriesData(data);
  if(supertrendOverlays.has(opts.id)||parabolicSarOverlays.has(opts.id)||(ichimokuOverlays.has(opts.id)||pivotOverlays.has(opts.id))||oscillators.has(opts.id)||donchianOverlays.has(opts.id)||linearRegressionOverlays.has(opts.id)||(keltnerOverlays.has(opts.id)||atrBandsOverlays.has(opts.id))||averages.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||fibonacciFans.has(opts.id)||trendBasedFibonaccis.has(opts.id)||fibonacciTimeZones.has(opts.id)||channels.has(opts.id)||pitchforks.has(opts.id)||measurements.has(opts.id)||riskRewards.has(opts.id)||bollingerOverlays.has(opts.id)||sessionVwapOverlays.has(opts.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances&&!paneLines.has(opts.id))throw Error("Indicator instance limit");
  if(paneLines.size+oscillators.size>=8&&!paneLines.has(opts.id))throw Error("Native pane limit");
  let series=paneLines.get(opts.id);
  if(!series){
   series=createPaneLine(opts);paneLines.set(opts.id,series);
   chart.panes()[chart.panes().length-1]?.setHeight(150);
  }else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(values);
  readoutIndicators.set(opts.id,{id:opts.id,title:opts.title??opts.id,kind:"PANE",values:new Map(values.map(v=>[v.time,v.value]))});
  persistDrawings();
 }
 function movePaneLine(id:string,paneIndex:number){
  guard();
  if(!Number.isInteger(paneIndex)||paneIndex<1||paneIndex>=chart.panes().length)
   throw Error("Invalid native pane index");
  const series=paneLines.get(id);if(!series)throw Error("Unknown native pane line");
  series.moveToPane(paneIndex);persistDrawings();
 }
 const oscillatorComponents=(kind:OscillatorKind):string[]=>kind==="rsi"?["rsi"]:kind==="atr"?["atr"]:kind==="macd"?["macd","signal","histogram"]:kind==="stochastic"?["stochK","stochD"]:kind==="stochrsi"?["stochRsiK","stochRsiD"]:kind==="cci"?["cci"]:kind==="momentum"?["momentum"]:kind==="roc"?["roc"]:kind==="obv"?["obv"]:kind==="mfi"?["mfi"]:["adx","plusDi","minusDi"];
 const oscillatorTitles=(kind:OscillatorKind):Record<string,string>=>kind==="macd"?{macd:"MACD",signal:"Signal",histogram:"Histogram"}:kind==="adx"?{adx:"ADX",plusDi:"+DI",minusDi:"−DI"}:kind==="stochastic"?{stochK:"%K",stochD:"%D"}:kind==="stochrsi"?{stochRsiK:"StochRSI %K",stochRsiD:"StochRSI %D"}:kind==="cci"?{cci:"CCI"}:kind==="momentum"?{momentum:"Momentum"}:kind==="roc"?{roc:"ROC (%)"}:kind==="obv"?{obv:"OBV"}:kind==="mfi"?{mfi:"MFI"}:kind==="rsi"?{rsi:"RSI"}:{atr:"ATR"};
 function replaceOscillatorData(group:OscillatorGroup,incremental=false){
  const rows=incremental
   ?group.calculator.updateLast(bars[bars.length-1])
   :(group.calculator=createIncrementalOscillator(bars,group.options.kind,group.options.settings),group.calculator.snapshot());
  const currentTime=bars[bars.length-1]?.time,components=oscillatorComponents(group.options.kind),titles=oscillatorTitles(group.options.kind);
  const nextValues=new Map<string,Map<number,number>>();
  for(const key of components){const points=rows[key]??[];let series=group.series.get(key);
   if(!series){if(key==="histogram")series=newHistogram(group.paneIndex);else series=createPaneLine({id:group.options.id+":"+key,color:key==="signal"||key==="stochD"||key==="stochRsiD"?"#f3c56a":key==="plusDi"?"#55deaa":key==="minusDi"?"#f17e97":group.options.color,lineWidth:group.options.lineWidth,title:titles[key]},group.paneIndex);series.priceScale().applyOptions({autoScale:true,borderVisible:true,scaleMargins:{top:.08,bottom:.08}});group.series.set(key,series);}
   if(key==="histogram"){
    const histogram=series as ReturnType<typeof newHistogram>;histogram.applyOptions({visible:group.options.visible??true,title:titles[key],priceLineVisible:false,lastValueVisible:true});
    const chartPoints=incremental?points.filter(p=>p.time===currentTime):points;
    const rowsWithColor=chartPoints.map(p=>({time:p.time,value:p.value,color:(p as AveragePoint&{color?:string}).color??(p.value>=0?"rgba(66,213,178,.75)":"rgba(249,107,126,.75)")}));
    if(incremental){const last=rowsWithColor[rowsWithColor.length-1];if(last)histogram.update(last)}else histogram.setData(rowsWithColor);
   }else{
    const line=series as ReturnType<typeof newLine>,color=key==="signal"||key==="stochD"||key==="stochRsiD"?"#f3c56a":key==="plusDi"?"#55deaa":key==="minusDi"?"#f17e97":group.options.color;
    line.applyOptions({color,lineWidth:group.options.lineWidth??2,visible:group.options.visible??true,title:titles[key],priceLineVisible:false,lastValueVisible:true});
    const chartPoints=incremental?points.filter(p=>p.time===currentTime):points;
    if(incremental){const last=chartPoints[chartPoints.length-1];if(last)line.update(last)}else line.setData(points);
   }
   const values=incremental?(group.values.get(key)??new Map<number,number>()):new Map(points.map(p=>[p.time,p.value]));
   if(incremental&&currentTime!==undefined){values.delete(currentTime);const last=points.find(p=>p.time===currentTime);if(last)values.set(last.time,last.value)}
   nextValues.set(key,values);
   readoutIndicators.set(group.options.id+":"+key,{id:group.options.id+":"+key,title:(group.options.title??group.options.id)+" "+titles[key],kind:"PANE",values});
  }
  group.values=nextValues;
 }
 function refreshOscillators(incremental=false){for(const group of oscillators.values())replaceOscillatorData(group,incremental)}
 function addOscillator(options:OscillatorOptions,persistent=true){
  guard();if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||!(["rsi","atr","macd","adx","stochastic","stochrsi","cci","momentum","roc","obv","mfi"] as string[]).includes(options.kind)||
   (options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth)))throw Error("Invalid oscillator options");
  if(supertrendOverlays.has(options.id)||parabolicSarOverlays.has(options.id)||(ichimokuOverlays.has(options.id)||pivotOverlays.has(options.id))||oscillators.has(options.id)||donchianOverlays.has(options.id)||linearRegressionOverlays.has(options.id)||(keltnerOverlays.has(options.id)||atrBandsOverlays.has(options.id))||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||fibonacciFans.has(options.id)||trendBasedFibonaccis.has(options.id)||fibonacciTimeZones.has(options.id)||channels.has(options.id)||pitchforks.has(options.id)||measurements.has(options.id)||riskRewards.has(options.id)||bollingerOverlays.has(options.id)||sessionVwapOverlays.has(options.id))throw Error("Duplicate chart object identity");
  if(indicatorInstanceCount()>=maxIndicatorInstances)throw Error("Indicator instance limit");
  if(paneLines.size+oscillators.size>=8)throw Error("Native pane limit");
  const normalized={...options,settings:{...options.settings}} as OscillatorOptions;
  const calculator=createIncrementalOscillator([],normalized.kind,normalized.settings);
  const group:OscillatorGroup={options:normalized,paneIndex:chart.panes().length,series:new Map(),values:new Map(),calculator};oscillators.set(options.id,group);
  try{const paneIndex=chart.panes().length-1;chart.panes()[paneIndex]?.setHeight(150);paneHeightOverrides.set(paneIndex,150);replaceOscillatorData(group);
   if(persistent){transientOscillators.delete(options.id);persistDrawings()}else transientOscillators.add(options.id);
  }catch(error){oscillators.delete(options.id);transientOscillators.delete(options.id);for(const series of group.series.values())chart.removeSeries(series);for(const key of oscillatorComponents(normalized.kind))readoutIndicators.delete(normalized.id+":"+key);throw error}
 }
 function addTransientOscillator(options:OscillatorOptions){return addOscillator(options,false)}
 function updateOscillator(id:string,patch:Partial<Pick<OscillatorOptions,"settings"|"color"|"lineWidth"|"visible"|"title">>,persistent=true){
  guard();const group=oscillators.get(id);if(!group)throw Error("Unknown oscillator");const next={...group.options,...patch,settings:patch.settings?{...patch.settings}:group.options.settings};
  if(!colorPattern.test(next.color)||(next.lineWidth!==undefined&&![1,2,3,4].includes(next.lineWidth)))throw Error("Invalid oscillator style");
  calculateOscillator(bars,next.kind,next.settings);group.options=next;replaceOscillatorData(group);
  if(persistent){transientOscillators.delete(id);persistDrawings()}else transientOscillators.add(id);
 }
 function updateTransientOscillator(id:string,patch:Partial<Pick<OscillatorOptions,"settings"|"color"|"lineWidth"|"visible"|"title">>){return updateOscillator(id,patch,false)}
 function oscillatorOptions(id:string){guard();const group=oscillators.get(id);return group?{...group.options,settings:{...group.options.settings}}:null}
 function moveOscillator(id:string,paneIndex:number){guard();const group=oscillators.get(id);if(!group||!Number.isInteger(paneIndex)||paneIndex<1||paneIndex>=chart.panes().length)throw Error("Invalid oscillator pane");for(const series of group.series.values())series.moveToPane(paneIndex);group.paneIndex=paneIndex;persistDrawings()}
 function oscillatorPaneLayout(){guard();return chart.panes().map((pane,index)=>({index,titles:pane.getSeries().map(series=>series.options().title)}))}
 function removeOscillator(id:string,persistent=true){guard();const group=oscillators.get(id);if(!group)return false;for(const series of group.series.values())chart.removeSeries(series);for(const key of oscillatorComponents(group.options.kind))readoutIndicators.delete(id+":"+key);oscillators.delete(id);transientOscillators.delete(id);if(persistent)persistDrawings();return true}
 function removeTransientOscillator(id:string){return removeOscillator(id,false)}
 function resizePane(index:number,height:number){
  guard();
  if(!Number.isInteger(index)||index<1||index>=chart.panes().length||
   !Number.isInteger(height)||height<80||height>600)throw Error("Invalid pane height");
  chart.panes()[index].setHeight(height);paneHeightOverrides.set(index,height);
  persistDrawings();
 }
 function paneHeights(){guard();return chart.panes().map(pane=>pane.getHeight())}
 function removePaneLine(id:string){
  guard();const series=paneLines.get(id);if(!series)return false;
  chart.removeSeries(series);paneLines.delete(id);readoutIndicators.delete(id);persistDrawings();return true;
 }
 function moveAverage(id:string,pane:number){
  guard();if(!averages.has(id)||!Number.isInteger(pane)||pane<0||pane>8)throw Error("Invalid pane request");
  averages.get(id)!.moveToPane(pane);
 }
 function showVolume(show:boolean){
  guard();
  if(show&&!volume){
   volume=newVolume();
   volume.setData(volumeRows());
   const paneIndex=chart.panes().length-1,pane=chart.panes()[paneIndex];
   if(pane)pane.setHeight(140);paneHeightOverrides.set(paneIndex,140);
  }else if(!show&&volume){chart.removeSeries(volume);volume=null}
  persistDrawings();
 }
 function visibleLogicalRange():LogicalRange|null{
  guard();const range=chart.timeScale().getVisibleLogicalRange();
  return range?{from:range.from,to:range.to}:null;
 }
 function setVisibleLogicalRange(range:LogicalRange){
  guard();
  if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.from>=range.to)
   throw Error("Invalid visible logical range");
  chart.timeScale().setVisibleLogicalRange({from:range.from,to:range.to});
  persistDrawings();
 }
 function setDisplayTimeZone(timeZone:string){
  guard();if(typeof timeZone!=="string"||timeZone.length<1||timeZone.length>100)throw Error("Invalid IANA display timezone");
  let canonical:string,nextFormatters:ReturnType<typeof makeTimeFormatters>;
  try{canonical=new Intl.DateTimeFormat("en-US",{timeZone}).resolvedOptions().timeZone;nextFormatters=makeTimeFormatters(canonical)}
  catch{throw Error("Invalid IANA display timezone")}
  if(!canonical)throw Error("Invalid IANA display timezone");
  displayTimeZone=canonical;timeFormatters=nextFormatters!;
  chart.applyOptions({localization:{timeFormatter:formatCrosshairTime},timeScale:{tickMarkFormatter:formatTimeLabel}});
  persistDrawings();
  return displayTimeZone;
 }
 function formatDisplayTime(time:Time,tickType:TickMarkType=TickMarkType.Time){guard();return formatTimeLabel(time,tickType)}
 function updateLast(c:Candle){
  guard();if(!validBar(c))throw Error("Invalid candle");
  const prev=bars[bars.length-1];
  const replacing=!!prev&&c.time===prev.time;
  if(prev&&c.time<prev.time)throw Error("Cannot update historical bar out of order");
  if((!prev||c.time>prev.time)&&bars.length>=MAX_OSCILLATOR_BARS)throw Error("Chart history limit reached");
  if(prev&&c.time===prev.time)bars[bars.length-1]={...c};
  else bars.push({...c});
  barsByTime.set(c.time,{...c});
  brokerDealMarkers=brokerDealMarkers.map(row=>({...row,plotted:barsByTime.has(row.chartTimeSeconds)}));brokerDealPrimitive.set(brokerDealMarkers);
  for(const indicator of readoutIndicators.values()){indicator.values.delete(c.time);indicator.directions?.delete(c.time)}
  price.update(c);if(volume)volume.update(volumeRows()[bars.length-1]);
  for(const [id,state] of managedMovingAverages)updateManagedMovingAverage(id,state);
  refreshDonchianOverlays();refreshBollingerOverlays();refreshSessionVwapOverlays();refreshKeltnerOverlays();refreshAtrBandsOverlays();refreshLinearRegressionOverlays();refreshIchimokuOverlays();refreshPivotOverlays();
  refreshVolumeZones();refreshAutoFibonacci();for(const group of supertrendOverlays.values())updateSupertrendLast(group,c,bars.length-1,replacing&&group.lastTime===c.time);
  for(const group of parabolicSarOverlays.values())updateParabolicSarLast(group,c,bars.length-1,replacing&&group.lastTime===c.time);
  refreshOscillators(true);
 }
 function removeAverage(id:string){
  guard();const s=averages.get(id);if(!s)return false;
  chart.removeSeries(s);averages.delete(id);managedMovingAverages.delete(id);transientMovingAverages.delete(id);readoutIndicators.delete(id);return true;
 }
 function averageOptions(id:string){guard();return averages.get(id)?.options()??null}
 function movingAverageOptions(id:string){guard();const value=managedMovingAverages.get(id)?.options;return value?{...value}:null}
 function readDataWindow(time:number):DataWindowReadout{
  guard();
  if(!Number.isSafeInteger(time)||time<=0||!Number.isFinite(new Date(time*1000).getTime()))throw Error("Invalid UTC candle time");
  const candle=barsByTime.get(time);
  if(!candle)return {state:"UNAVAILABLE",account:activeAccount,source:"CHART_FEED",time, timeUtc:new Date(time*1000).toISOString(),reason:"BAR_NOT_LOADED"};
  const real=typeof candle.real_volume==="number"&&candle.real_volume>0;
  const hasTick=typeof candle.tick_volume==="number"&&Number.isFinite(candle.tick_volume)&&candle.tick_volume>=0;
  return {state:"AVAILABLE",account:activeAccount,source:"CHART_FEED",time,timeUtc:new Date(time*1000).toISOString(),
   ohlc:{open:candle.open,high:candle.high,low:candle.low,close:candle.close},
   volume:real?{value:candle.real_volume!,source:"REAL_VOLUME"}:hasTick?{value:candle.tick_volume!,source:"TICK_VOLUME_PROXY"}:{value:null,source:"UNAVAILABLE"},
   ...(volumeZones?{volumeZones:{status:volumeZones.result.status,zones:volumeZones.result.zones.filter(zone=>zone.time===time).map(({algorithmVersion,source,label,volume,medianVolume,threshold,multiplier,start,end,high,low})=>({algorithmVersion,source,label,volume,medianVolume,threshold,multiplier,start,end,high,low}))}}:{}),
   ...(autoFibonacci?.result.available&&time>=autoFibonacci.result.confirmedAt!&&time<=autoFibonacci.asOf.timeUtc?{autoFibonacci:{algorithmVersion:autoFibonacci.result.algorithmVersion,source:autoFibonacci.result.source,timeframe:autoFibonacci.result.timeframe,direction:autoFibonacci.result.direction,start:autoFibonacci.result.start,end:autoFibonacci.result.end,confirmedAt:autoFibonacci.result.confirmedAt,levels:autoFibRatios.map(ratio=>({ratio,value:autoFibonacci!.result.lines[String(ratio) as keyof AutoFibonacciValues["lines"]].value!}))}}:{}),
   indicators:Array.from(readoutIndicators.values(),indicator=>{
    const value=indicator.values.get(time),available=value!==undefined;
    const direction=indicator.directions?.get(time);
    return {id:indicator.id,title:indicator.title,kind:indicator.kind,value:available?value:null,...(direction?{direction}:{}),state:available?"AVAILABLE":"WARMUP_OR_MISSING"};
   })};
 }
 function changeAccount(next:string){
  guard();if(!/^[a-zA-Z0-9_-]{1,50}$/.test(next))throw Error("Invalid account");
  clearPositionOverlays();brokerDealMarkers=[];brokerDealPrimitive.set([]);if(volumeZones){price.detachPrimitive(volumeZones.primitive);volumeZones=null}clearAutoFibonacci();
  finishDrag(true);selectDrawing(null);hoveredDrawingId=null;
  undoStack.length=0;redoStack.length=0;
  drawingsHydrated=false;lastPersistedSnapshot=null;persistenceError=null;persistenceStatus=drawingScope?"PENDING":"DISABLED";
  activeAccount=next;bars=[];barsByTime.clear();price.setData([]);
  for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
  for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();selectedDrawingId=null;
  for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
  for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
  for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
  for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
  for(const item of fibonacci.values())price.detachPrimitive(item.primitive);fibonacci.clear();
   for(const item of fibonacciFans.values())price.detachPrimitive(item.primitive);fibonacciFans.clear();for(const item of trendBasedFibonaccis.values())price.detachPrimitive(item.primitive);trendBasedFibonaccis.clear();
  for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();for(const item of pitchforks.values())price.detachPrimitive(item.primitive);pitchforks.clear();
  for(const item of measurements.values())price.detachPrimitive(item.primitive);measurements.clear();
  for(const item of riskRewards.values())price.detachPrimitive(item.primitive);riskRewards.clear();
  for(const item of averages.values())chart.removeSeries(item);
  averages.clear();managedMovingAverages.clear();transientMovingAverages.clear();
  for(const group of donchianOverlays.values())for(const series of group.series)chart.removeSeries(series);
  donchianOverlays.clear();
  for(const group of bollingerOverlays.values())for(const series of group.series)chart.removeSeries(series);
  bollingerOverlays.clear();
  for(const group of sessionVwapOverlays.values())chart.removeSeries(group.series);
  sessionVwapOverlays.clear();
  for(const group of keltnerOverlays.values())for(const series of group.series)chart.removeSeries(series);
  keltnerOverlays.clear();
  for(const group of atrBandsOverlays.values())for(const series of group.series)chart.removeSeries(series);
  atrBandsOverlays.clear();
  for(const group of ichimokuOverlays.values()){for(const series of group.series)chart.removeSeries(series);price.detachPrimitive(group.cloud)}
  ichimokuOverlays.clear();
  for(const group of pivotOverlays.values())for(const series of group.series.values())chart.removeSeries(series);pivotOverlays.clear();
   for(const group of linearRegressionOverlays.values())for(const series of group.series)chart.removeSeries(series);
   linearRegressionOverlays.clear();
  for(const group of supertrendOverlays.values()){chart.removeSeries(group.up);chart.removeSeries(group.down)}
  supertrendOverlays.clear();
  for(const group of parabolicSarOverlays.values()){chart.removeSeries(group.up);chart.removeSeries(group.down)}
  parabolicSarOverlays.clear();
  for(const group of oscillators.values())for(const series of group.series.values())chart.removeSeries(series);
  oscillators.clear();
  for(const line of paneLines.values())chart.removeSeries(line);
  paneLines.clear();readoutIndicators.clear();if(volume)volume.setData([]);
 }
 function setDrawingTool(tool:PlacementTool|null,text?:string){guard();if(tool!==null&&!["TREND","RAY","PRICE","TIME","RECT","FIBO","FIB_FAN","FIB_TREND","FIB_TIME","MEASURE","CHANNEL","PITCHFORK","RISK_REWARD","TEXT"].includes(tool))throw Error("Invalid drawing tool");if(tool==="TEXT"&&(typeof text!=="string"||!/^[\x20-\x7E]{1,40}$/.test(text)))throw Error("Text placement requires 1-40 printable ASCII characters");cancelDrawingTool(false);placementTool=tool;placementAnchors=[];placementText=tool==="TEXT"?text!:null;if(tool)drawingState("SECOND_ANCHOR");return true}
 function drawingToolState(){return {tool:placementTool,hasFirstAnchor:placementAnchors.length>0,anchorCount:placementAnchors.length}}
 function inspect(){guard();return {version:VERSION,account:activeAccount,priceAxisWidth:chart.priceScale("right").width(),positionOverlayCount:positionOverlayLines.size,positionOverlays:readPositionOverlays().lines,marketLevelCount:marketLevelLines.size,marketLevels:readMarketLevels(),brokerDealMarkerCount:brokerDealMarkers.filter(row=>row.plotted).length,nativeDrawingCount:drawingCount(),drawingTool:placementTool,
  displayTimeZone,volumeZoneStatus:volumeZones?.result.status??"DISABLED",volumeZoneCount:volumeZones?.result.zones.length??0,
  candleCount:bars.length,lastTime:bars[bars.length-1]?.time??null,
  sessionVwapCount:sessionVwapOverlays.size,sessionVwapSeries:[...sessionVwapOverlays.entries()].map(([id,group])=>({id,options:{...group.options},points:group.result.points.map(point=>({...point})),volumeSource:group.result.volumeSource,visible:group.series.options().visible})),
    averageCount:averages.size,nativePaneLines:paneLines.size,oscillatorCount:oscillators.size,supertrendCount:supertrendOverlays.size,parabolicSarCount:parabolicSarOverlays.size,ichimokuCount:ichimokuOverlays.size,pivotCount:pivotOverlays.size,pivotSeries:[...pivotOverlays.entries()].map(([id,group])=>({id,options:{...group.options,sourceWindow:{...group.options.sourceWindow}},lines:Object.fromEntries((["p","r1","r2","r3","s1","s2","s3"] as const).map(key=>[key,group.values.lines[key].map(point=>({...point}))])),visible:Array.from(group.series.values(),series=>series.options().visible)})),ichimokuSeries:[...ichimokuOverlays.entries()].map(([id,group])=>({id,options:{...group.options},lines:Object.fromEntries((["tenkan","kijun","senkouA","senkouB","chikou"] as const).map(key=>[key,group.values[key].map(point=>({...point}))])),visible:group.series.map(series=>series.options().visible)})),bollingerCount:bollingerOverlays.size,bollingerSeries:[...bollingerOverlays.entries()].map(([id,group])=>({id,options:{...group.options},lines:{upper:group.values.upper.map(point=>({...point})),middle:group.values.middle.map(point=>({...point})),lower:group.values.lower.map(point=>({...point}))},visible:group.series.map(series=>series.options().visible)})),atrBandsCount:atrBandsOverlays.size,atrBandsSeries:[...atrBandsOverlays.entries()].map(([id,group])=>({id,options:{...group.options},lines:{upper:group.values.upper.map(point=>({...point})),middle:group.values.middle.map(point=>({...point})),lower:group.values.lower.map(point=>({...point}))},visible:group.series.map(series=>series.options().visible)})),linearRegressionCount:linearRegressionOverlays.size,linearRegressionLineCount:[...linearRegressionOverlays.values()].reduce((count,group)=>count+group.series.length,0),linearRegressionSeries:[...linearRegressionOverlays.entries()].map(([id,group])=>({id,options:{...group.options},lines:{upper:group.values.upper.map(point=>({...point})),middle:group.values.middle.map(point=>({...point})),lower:group.values.lower.map(point=>({...point}))},visible:group.series.map(series=>series.options().visible)})),oscillatorPaneCount:new Set(Array.from(oscillators.values(),group=>{const series=group.series.values().next().value;return series?chart.panes().findIndex(pane=>pane.getSeries().includes(series)):-1}).filter(index=>index>=0)).size,nativePrimitives:drawingCount(),selectedDrawingId,selectedDrawingIds:[...selectedDrawingIds],hoveredDrawingId,
  paneCount:chart.panes().length,volumeVisible:!!volume,persistenceStatus,persistenceError}}
 function destroy(){if(destroyed)return;cancelDrawingTool(false);finishDrag(true);clearPositionOverlays();if(volumeZones){price.detachPrimitive(volumeZones.primitive);volumeZones=null}destroyed=true;host.removeEventListener("pointerdown",onPointerDown,true);host.removeEventListener("pointermove",onPointerMove,true);host.removeEventListener("pointerup",onPointerUp,true);host.removeEventListener("pointercancel",onPointerCancel,true);host.removeEventListener("lostpointercapture",onLostPointerCapture,true);host.removeEventListener("keydown",onKeyDown,true);chart.remove();averages.clear();managedMovingAverages.clear();transientMovingAverages.clear();donchianOverlays.clear();bollingerOverlays.clear();sessionVwapOverlays.clear();keltnerOverlays.clear();atrBandsOverlays.clear();ichimokuOverlays.clear();pivotOverlays.clear();linearRegressionOverlays.clear();supertrendOverlays.clear();parabolicSarOverlays.clear();paneLines.clear();oscillators.clear();transientOscillators.clear();priceLevels.clear();timeMarkers.clear();textAnnotations.clear();trendLines.clear();rectangles.clear();rays.clear();fibonacci.clear();fibonacciFans.clear();trendBasedFibonaccis.clear();channels.clear();measurements.clear();riskRewards.clear();readoutIndicators.clear();volume=null;bars=[];barsByTime.clear()}
  return Object.freeze({setCandles,addAverage,addMovingAverage,addTransientMovingAverage,addDonchian,removeDonchian,addBollinger,updateBollinger,removeBollinger,bollingerOptions,addSessionVwap,updateSessionVwap,removeSessionVwap,sessionVwapOptions,addKeltner,removeKeltner,addAtrBands,updateAtrBands,removeAtrBands,atrBandsOptions,addLinearRegression,updateLinearRegression,removeLinearRegression,linearRegressionOptions,addIchimoku,updateIchimoku,removeIchimoku,ichimokuOptions,addPivotPoints,updatePivotPoints,pivotOptions,removePivotPoints,addSupertrend,updateSupertrend,removeSupertrend,supertrendOptions,addParabolicSar,updateParabolicSar,removeParabolicSar,parabolicSarOptions,movingAverageOptions,moveAverage,removeAverage,selectDrawings,toggleDrawingSelection,setSelectedDrawingsVisible,setSelectedDrawingsLocked,deleteSelectedDrawings,addPriceLevel,updatePriceLevel,removePriceLevel,
  addTimeMarker:(options:TimeMarkerOptions)=>addTimeMarker(options),updateTimeMarker,removeTimeMarker,addTextAnnotation:(options:TextAnnotationOptions)=>addTextAnnotation(options),updateTextAnnotation,removeTextAnnotation,addTrendLine:(options:TrendLineOptions)=>addTrendLine(options),updateTrendLine,removeTrendLine,addRectangle:(options:RectangleOptions)=>addRectangle(options),updateRectangle,removeRectangle,addRay:(options:RayOptions)=>addRay(options),updateRay,removeRay,addFibonacci:(options:FibonacciOptions)=>addFibonacci(options),updateFibonacci,removeFibonacci,fibonacciLevels,addFibonacciFan,updateFibonacciFan,removeFibonacciFan,fibonacciFanRays,addTrendBasedFibonacci,updateTrendBasedFibonacci,removeTrendBasedFibonacci,trendBasedFibonacciLevels,addFibonacciTimeZones:(options:FibonacciTimeZoneOptions)=>addFibonacciTimeZone(options),updateFibonacciTimeZones:updateFibonacciTimeZone,removeFibonacciTimeZones:removeFibonacciTimeZone,fibonacciTimeZoneGuides,addChannel:(options:ChannelOptions)=>addChannel(options),updateChannel,removeChannel,addPitchfork:(options:PitchforkOptions)=>addPitchfork(options),updatePitchfork,removePitchfork,drawingPosition,drawingGeometry,drawingAnchorPosition,readDrawing,exportDrawings,exportLayout,importDrawings,setDrawingVisible,setDrawingLocked,undo,redo,deleteSelectedDrawing,duplicateSelectedDrawing,duplicateSelectedDrawings,
  addMeasurement,updateMeasurement,removeMeasurement,measurementReadout,addPaneLine,movePaneLine,removePaneLine,addOscillator,updateOscillator,removeOscillator,addTransientOscillator,updateTransientOscillator,removeTransientOscillator,moveOscillator,oscillatorOptions,oscillatorPaneLayout,resizePane,paneHeights,showVolume,visibleLogicalRange,setVisibleLogicalRange,setDisplayTimeZone,displayTimeZone:()=>displayTimeZone,formatTimeLabel:formatDisplayTime,formatCrosshairTime,readDataWindow,
  updateLast,changeAccount,averageOptions,setVolumeZones,readVolumeZones,clearVolumeZones,setAutoFibonacci,readAutoFibonacci,clearAutoFibonacci,setMarketLevels,readMarketLevels,clearMarketLevels,setPositionOverlays,readPositionOverlays,clearPositionOverlays,setBrokerDealMarkers,readBrokerDealMarkers,setDrawingTool,drawingToolState,verifyPersistence,inspect,destroy});
}
