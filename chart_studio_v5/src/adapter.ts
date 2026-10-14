/**
 * Opt-in native LWC v5 read-only adapter for the existing 2EAs Chart Studio.
 * No execution routes, broker writes, credentials or global MT5 state.
 * Rendering remains isolated until the v4 -> v5 migration acceptance gate.
 */
import {createChart, CandlestickSeries, LineSeries, HistogramSeries, type ISeriesPrimitive, type UTCTimestamp} from "lightweight-charts";
import type {CanvasRenderingTarget2D} from "fancy-canvas";
export const VERSION = "5.2.1";
export type Candle = {time:UTCTimestamp;open:number;high:number;low:number;close:number;tick_volume?:number;real_volume?:number};
export type AveragePoint = {time:UTCTimestamp;value:number};
export type AverageOptions = {id:string;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
export type PriceLevelOptions = {id:string;price:number;color:string};
export type TimeMarkerOptions = {id:string;time:UTCTimestamp;color:string};
export type DataWindowReadout = {
 state:"AVAILABLE"|"UNAVAILABLE";account:string;source:"CHART_FEED";time:number;timeUtc:string;
 reason?:"BAR_NOT_LOADED";ohlc?:{open:number;high:number;low:number;close:number};
 volume?:{value:number|null;source:"REAL_VOLUME"|"TICK_VOLUME_PROXY"|"UNAVAILABLE"};
 indicators?:Array<{id:string;title:string;kind:"OVERLAY"|"PANE";value:number|null;state:"AVAILABLE"|"WARMUP_OR_MISSING"}>;
};
class PriceLevelPrimitive implements ISeriesPrimitive {
 private y:number|null=null;
 private selected=false;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private price:number,private color:string){}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.series=null;this.requestUpdate=null;this.y=null}
 updateAllViews(){this.y=this.series?.priceToCoordinate(this.price)??null}
 coordinate(){this.updateAllViews();return this.y}
 hitTest(_x:number,y:number){
  const distance=this.y===null?null:Math.abs(this.y-y);
  if(distance===null||distance>6)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance};
 }
 paneViews(){return [{zOrder:()=>"top" as const,renderer:()=>this.y===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const y=this.y;if(y===null)return;
  target.useMediaCoordinateSpace(({context,mediaSize})=>{
   context.save();context.strokeStyle=this.color;context.lineWidth=this.selected?2:1;context.setLineDash([5,4]);
   context.beginPath();context.moveTo(0,y);context.lineTo(mediaSize.width,y);context.stroke();context.restore();
  });
 }} }]}
 set(price:number,color:string){this.price=price;this.color=color;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
}
class TimeMarkerPrimitive implements ISeriesPrimitive {
 private x:number|null=null;
 private selected=false;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private time:UTCTimestamp,private color:string){}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.requestUpdate=null;this.x=null}
 updateAllViews(){this.x=this.chart?.timeScale().timeToCoordinate(this.time)??null}
 coordinate(){this.updateAllViews();return this.x}
 hitTest(x:number,_y:number){
  const distance=this.x===null?null:Math.abs(this.x-x);
  if(distance===null||distance>6)return null;
  return {externalId:this.id,zOrder:"top" as const,cursorStyle:"pointer",hitTestPriority:1,distance};
 }
 paneViews(){return [{zOrder:()=>"top" as const,renderer:()=>this.x===null?null:{draw:(target:CanvasRenderingTarget2D)=>{
  const x=this.x;if(x===null)return;
  target.useMediaCoordinateSpace(({context,mediaSize})=>{
   context.save();context.strokeStyle=this.color;context.lineWidth=this.selected?2:1;context.setLineDash([3,4]);
   context.beginPath();context.moveTo(x,0);context.lineTo(x,mediaSize.height);context.stroke();context.restore();
  });
 }} }]}
 set(time:UTCTimestamp,color:string){this.time=time;this.color=color;this.updateAllViews();this.requestUpdate?.()}
 setSelected(selected:boolean){this.selected=selected;this.requestUpdate?.()}
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
 type ReadoutIndicator={id:string;title:string;kind:"OVERLAY"|"PANE";values:Map<number,number>};
 const readoutIndicators=new Map<string,ReadoutIndicator>();
 // Independent native chart panes, not separate chart instances or duplicated time axes.
 const paneLines=new Map<string,LineApi>();
 const priceLevels=new Map<string,{primitive:PriceLevelPrimitive;options:PriceLevelOptions}>();
 const timeMarkers=new Map<string,{primitive:TimeMarkerPrimitive;options:TimeMarkerOptions}>();
 let selectedDrawingId:string|null=null,hoveredDrawingId:string|null=null;
 type ActiveDrag={pointerId:number;id:string;kind:"PRICE";original:PriceLevelOptions}|{pointerId:number;id:string;kind:"TIME";original:TimeMarkerOptions};
 let activeDrag:ActiveDrag|null=null;
 chart.subscribeCrosshairMove(param=>{
  const objectId=param.hoveredInfo?.objectId;
  hoveredDrawingId=typeof objectId==="string"&&(priceLevels.has(objectId)||timeMarkers.has(objectId))?objectId:null;
 });
 chart.subscribeClick(param=>{
  selectDrawing(hoveredDrawingId);
 });
 const onPointerDown=(event:PointerEvent)=>{
  if(event.button!==0||!event.isPrimary||!hoveredDrawingId)return;
  const level=priceLevels.get(hoveredDrawingId),marker=timeMarkers.get(hoveredDrawingId);
  if(level)activeDrag={pointerId:event.pointerId,id:hoveredDrawingId,kind:"PRICE",original:{...level.options}};
  else if(marker)activeDrag={pointerId:event.pointerId,id:hoveredDrawingId,kind:"TIME",original:{...marker.options}};
  else return;
  selectDrawing(hoveredDrawingId);
  if(host.tabIndex<0)host.tabIndex=0;
  host.focus({preventScroll:true});
  host.setPointerCapture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
 };
 const onPointerMove=(event:PointerEvent)=>{
  if(!activeDrag||activeDrag.pointerId!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  const rect=host.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  if(activeDrag.kind==="PRICE"){
   const value=price.coordinateToPrice(y);
   if(value!==null&&Number.isFinite(value)&&value>0){const item=priceLevels.get(activeDrag.id);if(item)updatePriceLevel(activeDrag.id,{price:value,color:item.options.color})}
  }else{
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index];
   if(candle){const item=timeMarkers.get(activeDrag.id);if(item)updateTimeMarker(activeDrag.id,{time:candle.time,color:item.options.color})}
  }
 };
 const finishDrag=(cancel:boolean)=>{
  const drag=activeDrag;if(!drag)return;
  if(cancel){
   if(drag.kind==="PRICE"&&priceLevels.has(drag.id))updatePriceLevel(drag.id,{price:drag.original.price,color:drag.original.color});
   if(drag.kind==="TIME"&&timeMarkers.has(drag.id))updateTimeMarker(drag.id,{time:drag.original.time,color:drag.original.color});
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
 const onKeyDown=(event:KeyboardEvent)=>{
  if(event.key!=="Escape"||!activeDrag)return;
  event.preventDefault();event.stopImmediatePropagation();finishDrag(true);
 };
 host.addEventListener("pointerdown",onPointerDown,true);
 host.addEventListener("pointermove",onPointerMove,true);
 host.addEventListener("pointerup",onPointerUp,true);
 host.addEventListener("pointercancel",onPointerCancel,true);
 host.addEventListener("lostpointercapture",onLostPointerCapture,true);
 host.addEventListener("keydown",onKeyDown,true);
 const createPaneLine=(opts:AverageOptions)=>chart.addSeries(LineSeries,{
  color:opts.color,lineWidth:opts.lineWidth??2,visible:opts.visible??true,
  title:opts.title??opts.id,priceLineVisible:false,lastValueVisible:true,
 },chart.panes().length);
 const newVolume=()=>chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},
  priceLineVisible:false,lastValueVisible:false},chart.panes().length);
 type VolumeApi=ReturnType<typeof newVolume>;
 let volume:VolumeApi|null=null;
 let bars:Candle[]=[],barsByTime=new Map<number,Candle>(),activeAccount=accountId,destroyed=false;
 function guard(){if(destroyed)throw Error("Chart was destroyed")}
 function selectDrawing(id:string|null){
  if(selectedDrawingId===id)return;
  if(selectedDrawingId){priceLevels.get(selectedDrawingId)?.primitive.setSelected(false);timeMarkers.get(selectedDrawingId)?.primitive.setSelected(false)}
  selectedDrawingId=id;
  if(id){priceLevels.get(id)?.primitive.setSelected(true);timeMarkers.get(id)?.primitive.setSelected(true)}
 }
 function setCandles(data:readonly Candle[]){
  guard();const next=normalizeCandles(data);finishDrag(true);bars=next;barsByTime=new Map(bars.map(c=>[c.time,c]));
  for(const series of averages.values())series.setData([]);
  for(const series of paneLines.values())series.setData([]);
  readoutIndicators.clear();price.setData(bars);
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
  if(paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id))throw Error("Duplicate chart object identity");
  const values=validSeriesData(data);
  let series=averages.get(opts.id);
  if(!series){series=newLine(opts);averages.set(opts.id,series)}
  else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(values);
  readoutIndicators.set(opts.id,{id:opts.id,title:opts.title??opts.id,kind:"OVERLAY",values:new Map(values.map(v=>[v.time,v.value]))});
 }
 function validatePriceLevel(opts:PriceLevelOptions){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isFinite(opts.price)||opts.price<=0)
   throw Error("Invalid price level");
 }
 function addPriceLevel(opts:PriceLevelOptions){
  guard();validatePriceLevel(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||timeMarkers.has(opts.id))throw Error("Duplicate chart object identity");
  if(priceLevels.size+timeMarkers.size>=100)throw Error("Native drawing limit");
  const existing=priceLevels.get(opts.id);
  if(existing){existing.primitive.set(opts.price,opts.color);existing.options={...opts};return}
  const primitive=new PriceLevelPrimitive(opts.id,opts.price,opts.color);price.attachPrimitive(primitive);
  priceLevels.set(opts.id,{primitive,options:{...opts}});
 }
 function updatePriceLevel(id:string,patch:Pick<PriceLevelOptions,"price"|"color">){
  guard();const item=priceLevels.get(id);if(!item)throw Error("Unknown price level");
  validatePriceLevel({...item.options,...patch});item.primitive.set(patch.price,patch.color);
  item.options={...item.options,...patch};
 }
 function removePriceLevel(id:string){
  guard();const item=priceLevels.get(id);if(!item)return false;
  if(activeDrag?.id===id)finishDrag(true);
  price.detachPrimitive(item.primitive);priceLevels.delete(id);if(selectedDrawingId===id)selectDrawing(null);return true;
 }
 function validateTimeMarker(opts:TimeMarkerOptions){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.time)||opts.time<=0||!Number.isFinite(new Date(opts.time*1000).getTime())||
   !barsByTime.has(opts.time))
   throw Error("Invalid or unloaded UTC time marker");
 }
 function addTimeMarker(opts:TimeMarkerOptions){
  guard();validateTimeMarker(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id))throw Error("Duplicate chart object identity");
  if(priceLevels.size+timeMarkers.size>=100)throw Error("Native drawing limit");
  const existing=timeMarkers.get(opts.id);
  if(existing){existing.primitive.set(opts.time,opts.color);existing.options={...opts};return}
  const primitive=new TimeMarkerPrimitive(opts.id,opts.time,opts.color);price.attachPrimitive(primitive);
  timeMarkers.set(opts.id,{primitive,options:{...opts}});
 }
 function updateTimeMarker(id:string,patch:Pick<TimeMarkerOptions,"time"|"color">){
  guard();const item=timeMarkers.get(id);if(!item)throw Error("Unknown time marker");
  validateTimeMarker({...item.options,...patch});item.primitive.set(patch.time,patch.color);
  item.options={...item.options,...patch};
 }
 function removeTimeMarker(id:string){
  guard();const item=timeMarkers.get(id);if(!item)return false;
  if(activeDrag?.id===id)finishDrag(true);
  price.detachPrimitive(item.primitive);timeMarkers.delete(id);if(selectedDrawingId===id)selectDrawing(null);return true;
 }
 function drawingPosition(id:string){
  guard();const rect=host.getBoundingClientRect();const priceLevel=priceLevels.get(id);
  if(priceLevel){const y=priceLevel.primitive.coordinate();return y===null?null:{x:rect.left+Math.min(40,rect.width/2),y:rect.top+y}}
  const timeMarker=timeMarkers.get(id);if(timeMarker){const x=timeMarker.primitive.coordinate();return x===null?null:{x:rect.left+x,y:rect.top+Math.min(40,rect.height/2)}}
  return null;
 }
 function readDrawing(id:string){
  guard();const level=priceLevels.get(id);if(level)return {...level.options};
  const marker=timeMarkers.get(id);if(marker)return {...marker.options};
  return null;
 }
 function addPaneLine(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))
   throw Error("Invalid pane line");
  const values=validSeriesData(data);
  if(averages.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id))throw Error("Duplicate chart object identity");
  if(paneLines.size>=8&&!paneLines.has(opts.id))throw Error("Native pane limit");
  let series=paneLines.get(opts.id);
  if(!series){
   series=createPaneLine(opts);paneLines.set(opts.id,series);
   chart.panes()[chart.panes().length-1]?.setHeight(150);
  }else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(values);
  readoutIndicators.set(opts.id,{id:opts.id,title:opts.title??opts.id,kind:"PANE",values:new Map(values.map(v=>[v.time,v.value]))});
 }
 function movePaneLine(id:string,paneIndex:number){
  guard();
  if(!Number.isInteger(paneIndex)||paneIndex<1||paneIndex>=chart.panes().length)
   throw Error("Invalid native pane index");
  const series=paneLines.get(id);if(!series)throw Error("Unknown native pane line");
  series.moveToPane(paneIndex);
 }
 function resizePane(index:number,height:number){
  guard();
  if(!Number.isInteger(index)||index<1||index>=chart.panes().length||
   !Number.isInteger(height)||height<80||height>600)throw Error("Invalid pane height");
  chart.panes()[index].setHeight(height);
 }
 function removePaneLine(id:string){
  guard();const series=paneLines.get(id);if(!series)return false;
  chart.removeSeries(series);paneLines.delete(id);readoutIndicators.delete(id);return true;
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
  barsByTime.set(c.time,{...c});
  for(const indicator of readoutIndicators.values())indicator.values.delete(c.time);
  price.update(c);if(volume)volume.update(volumeRows()[bars.length-1]);
 }
 function removeAverage(id:string){
  guard();const s=averages.get(id);if(!s)return false;
  chart.removeSeries(s);averages.delete(id);readoutIndicators.delete(id);return true;
 }
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
   indicators:Array.from(readoutIndicators.values(),indicator=>{
    const value=indicator.values.get(time),available=value!==undefined;
    return {id:indicator.id,title:indicator.title,kind:indicator.kind,value:available?value:null,state:available?"AVAILABLE":"WARMUP_OR_MISSING"};
   })};
 }
 function changeAccount(next:string){
  guard();if(!/^[a-zA-Z0-9_-]{1,50}$/.test(next))throw Error("Invalid account");
  finishDrag(true);selectDrawing(null);hoveredDrawingId=null;
  activeAccount=next;bars=[];barsByTime.clear();price.setData([]);
  for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
  for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();selectedDrawingId=null;
  for(const item of averages.values())chart.removeSeries(item);
  averages.clear();
  for(const line of paneLines.values())chart.removeSeries(line);
  paneLines.clear();readoutIndicators.clear();if(volume)volume.setData([]);
 }
 function inspect(){guard();return {version:VERSION,account:activeAccount,
  candleCount:bars.length,lastTime:bars[bars.length-1]?.time??null,
  averageCount:averages.size,nativePaneLines:paneLines.size,nativePrimitives:priceLevels.size+timeMarkers.size,selectedDrawingId,hoveredDrawingId,
  paneCount:chart.panes().length,volumeVisible:!!volume}}
 function destroy(){if(destroyed)return;finishDrag(true);destroyed=true;host.removeEventListener("pointerdown",onPointerDown,true);host.removeEventListener("pointermove",onPointerMove,true);host.removeEventListener("pointerup",onPointerUp,true);host.removeEventListener("pointercancel",onPointerCancel,true);host.removeEventListener("lostpointercapture",onLostPointerCapture,true);host.removeEventListener("keydown",onKeyDown,true);chart.remove();averages.clear();paneLines.clear();priceLevels.clear();timeMarkers.clear();readoutIndicators.clear();volume=null;bars=[];barsByTime.clear()}
 return Object.freeze({setCandles,addAverage,moveAverage,removeAverage,addPriceLevel,updatePriceLevel,removePriceLevel,
  addTimeMarker,updateTimeMarker,removeTimeMarker,drawingPosition,readDrawing,
  addPaneLine,movePaneLine,removePaneLine,resizePane,showVolume,readDataWindow,
  updateLast,changeAccount,inspect,destroy});
}
