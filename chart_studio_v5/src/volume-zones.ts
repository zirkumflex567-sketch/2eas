import type {Candle} from "./adapter";
import type {UTCTimestamp} from "lightweight-charts";
import {MAX_OSCILLATOR_BARS} from "./oscillators";

export type VolumeZoneSource="REAL_VOLUME"|"TICK_VOLUME_PROXY";
export type VolumeZone={time:UTCTimestamp;start:UTCTimestamp;end:UTCTimestamp;high:number;low:number;volume:number;medianVolume:number;multiplier:number;threshold:number;source:VolumeZoneSource;algorithmVersion:"volume-range-median-v1";label:"Realvolumen-OHLC-Range"|"Tickvolumenproxy-OHLC-Range";closedAt:UTCTimestamp;observedEnd:UTCTimestamp;lastClosedBarTime:UTCTimestamp;previousClosedBarTime:UTCTimestamp|null};
export type VolumeZoneResult={status:"INVALID_CONFIGURATION"|"WARMUP"|"AVAILABLE"|"NO_TRIGGERS"|"NO_COMPARABLE_BASELINE"|"NO_VOLUME_DATA";algorithmVersion:"volume-range-median-v1";lookbackBars:number;multiplier:number;source:"OHLC_VOLUME_ONLY";zones:VolumeZone[]};
type Options={timeframeSeconds:number;asOfUtc:number;lookback?:number;multiplier?:number};
const VERSION="volume-range-median-v1" as const,MAX_ZONES=3000;

export function calculateVolumeZones(input:readonly Candle[],options:Options):VolumeZoneResult{
 const lookback=options?.lookback??20,multiplier=options?.multiplier??2,empty:VolumeZoneResult={status:"INVALID_CONFIGURATION",algorithmVersion:VERSION,lookbackBars:Number.isInteger(lookback)?lookback:20,multiplier:Number.isFinite(multiplier)?multiplier:2,source:"OHLC_VOLUME_ONLY",zones:[]};
 const tf=Number(options?.timeframeSeconds),asOf=Number(options?.asOfUtc);
 if(!Array.isArray(input)||input.length>MAX_OSCILLATOR_BARS||!Number.isSafeInteger(tf)||tf<=0||tf>86400||!Number.isFinite(asOf)||asOf<=0||!Number.isSafeInteger(lookback)||lookback<5||lookback>100||!Number.isFinite(multiplier)||multiplier<1||multiplier>10)return empty;
 const closed=input.filter(bar=>bar&&Number.isSafeInteger(bar.time)&&bar.time>0&&bar.time+tf<=asOf&&Number.isFinite(bar.open)&&bar.open>0&&Number.isFinite(bar.high)&&Number.isFinite(bar.low)&&Number.isFinite(bar.close)&&bar.low>0&&bar.high>=Math.max(bar.open,bar.close,bar.low)&&bar.low<=Math.min(bar.open,bar.close,bar.high)&&
  (bar.tick_volume===undefined||Number.isFinite(bar.tick_volume)&&bar.tick_volume>=0)&&(bar.real_volume===undefined||Number.isFinite(bar.real_volume)&&bar.real_volume>=0))
  .map(bar=>({...bar})).sort((a,b)=>a.time-b.time).filter((bar,index,all)=>index===0||bar.time!==all[index-1].time);
 if(closed.length<=lookback)return {...empty,status:"WARMUP",zones:[]};
 const volume=(bar:Candle,source:VolumeZoneSource)=>{const value=source==="REAL_VOLUME"?bar.real_volume:bar.tick_volume;return typeof value==="number"&&Number.isFinite(value)&&value>0?value:null};
 let evaluated=0,hasVolume=false;const zones:VolumeZone[]=[];
 for(let i=lookback;i<closed.length;i++){
  const bar=closed[i],source:VolumeZoneSource|null=(bar.real_volume??0)>0?"REAL_VOLUME":(bar.tick_volume??0)>0?"TICK_VOLUME_PROXY":null;
  if(!source)continue;hasVolume=true;
  const previous=closed.slice(i-lookback,i).map(item=>volume(item,source));if(previous.some(value=>value===null))continue;
  const sorted=previous as number[];sorted.sort((a,b)=>a-b);const mid=sorted.length>>1,median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  if(!(median>0)||!Number.isFinite(median))continue;evaluated++;
  const current=volume(bar,source),threshold=median*multiplier;if(current===null||!Number.isFinite(threshold)||current<threshold)continue;
  const last=closed[closed.length-1],observedEnd=(last.time+tf) as UTCTimestamp,end=Math.min(bar.time+tf*20,observedEnd) as UTCTimestamp;if(end<=bar.time)continue;
  zones.push({time:bar.time,start:bar.time,end,high:bar.high,low:bar.low,volume:current,medianVolume:median,multiplier,threshold,source,algorithmVersion:VERSION,label:source==="REAL_VOLUME"?"Realvolumen-OHLC-Range":"Tickvolumenproxy-OHLC-Range",closedAt:(bar.time+tf) as UTCTimestamp,observedEnd,lastClosedBarTime:last.time,previousClosedBarTime:closed[closed.length-2]?.time??null});
 }
 const status=zones.length?"AVAILABLE":evaluated?"NO_TRIGGERS":hasVolume?"NO_COMPARABLE_BASELINE":"NO_VOLUME_DATA";
 return {...empty,status,zones:zones.slice(-MAX_ZONES)};
}
