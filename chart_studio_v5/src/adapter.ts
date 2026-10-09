/**
 * Opt-in native LWC v5 read-only adapter for the existing 2EAs Chart Studio.
 * No execution routes, broker writes, credentials or global MT5 state.
 * Rendering remains isolated until the v4 -> v5 migration acceptance gate.
 */
import {createChart, CandlestickSeries, LineSeries, HistogramSeries, type UTCTimestamp} from "lightweight-charts";
export const VERSION = "5.2.1";
export type Candle = {time:UTCTimestamp;open:number;high:number;low:number;close:number;tick_volume?:number;real_volume?:number};
export type AveragePoint = {time:UTCTimestamp;value:number};
export type AverageOptions = {id:string;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
const colorPattern = /^#[0-9a-fA-F]{6}$/;
function validBar(c:Candle):boolean {
 return Number.isSafeInteger(c.time) && c.time>0 &&
  [c.open,c.high,c.low,c.close].every(n=>Number.isFinite(n)&&n>0) &&
  c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close,c.high);
}
function normalizeCandles(data:readonly Candle[]):Candle[] {
 if(!Array.isArray(data)) throw Error("Invalid bars");
 if(data.length>150000)throw Error("History budget exceeded");
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
export function createStudioV5(host:HTMLElement,accountId:string){
 if(!host || !accountId || !/^[a-zA-Z0-9_-]{1,50}$/.test(accountId))throw Error("Invalid chart host/account");
 const chart=createChart(host,{autoSize:true,layout:{background:{color:"#091923"},textColor:"#d0e7ee"},
  grid:{vertLines:{visible:false},horzLines:{color:"#233b48"}},
  timeScale:{timeVisible:true,borderVisible:true,rightOffset:8},
  crosshair:{mode:0}});
 const price=chart.addSeries(CandlestickSeries,{upColor:"#1bca99",downColor:"#f16b8d",
  borderVisible:false,wickUpColor:"#1bca99",wickDownColor:"#f16b8d"});
 const newLine=(opts:AverageOptions)=>chart.addSeries(LineSeries,{
  color:opts.color,lineWidth:opts.lineWidth??2,visible:opts.visible??true,
  title:opts.title??opts.id,priceLineVisible:false,lastValueVisible:true});
 type LineApi=ReturnType<typeof newLine>;
 const averages=new Map<string,LineApi>();
 const newVolume=()=>chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},
  priceLineVisible:false,lastValueVisible:false},chart.panes().length);
 type VolumeApi=ReturnType<typeof newVolume>;
 let volume:VolumeApi|null=null;
 let bars:Candle[]=[],activeAccount=accountId,destroyed=false;
 function guard(){if(destroyed)throw Error("Chart was destroyed")}
 function setCandles(data:readonly Candle[]){
  guard();bars=normalizeCandles(data);price.setData(bars);
  if(volume)volume.setData(volumeRows());
 }
 function volumeRows(){
  return bars.map(c=>({time:c.time,value:Math.max(0,(c.real_volume??0)>0?c.real_volume!:c.tick_volume??0),
   color:c.close>=c.open?"#4bc3d7":"#dc6987"}));
 }
 function addAverage(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))throw Error("Invalid line options");
  if(averages.size>=16&&!averages.has(opts.id))throw Error("Indicator instance limit");
  let series=averages.get(opts.id);
  if(!series){series=newLine(opts);averages.set(opts.id,series)}
  else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(validSeriesData(data));
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
   const pane=chart.panes()[chart.panes().length-1];
   if(pane)pane.setHeight(140);
  }else if(!show&&volume){chart.removeSeries(volume);volume=null}
 }
 function updateLast(c:Candle){
  guard();if(!validBar(c))throw Error("Invalid candle");
  const prev=bars[bars.length-1];
  if(prev&&c.time<prev.time)throw Error("Cannot update historical bar out of order");
  if(prev&&c.time===prev.time)bars[bars.length-1]={...c};
  else bars.push({...c});
  price.update(c);if(volume)volume.update(volumeRows()[bars.length-1]);
 }
 function removeAverage(id:string){
  guard();const s=averages.get(id);if(!s)return false;
  chart.removeSeries(s);averages.delete(id);return true;
 }
 function changeAccount(next:string){
  guard();if(!/^[a-zA-Z0-9_-]{1,50}$/.test(next))throw Error("Invalid account");
  activeAccount=next;bars=[];price.setData([]);
  for(const item of averages.values())chart.removeSeries(item);
  averages.clear();if(volume)volume.setData([]);
 }
 function inspect(){guard();return {version:VERSION,account:activeAccount,
  candleCount:bars.length,lastTime:bars[bars.length-1]?.time??null,
  averageCount:averages.size,paneCount:chart.panes().length,volumeVisible:!!volume}}
 function destroy(){if(destroyed)return;destroyed=true;chart.remove();averages.clear();volume=null;bars=[]}
 return Object.freeze({setCandles,addAverage,moveAverage,removeAverage,showVolume,
  updateLast,changeAccount,inspect,destroy});
}
