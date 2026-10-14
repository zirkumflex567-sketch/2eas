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
export type PriceLevelOptions = {id:string;price:number;color:string;visible?:boolean;locked?:boolean};
export type TimeMarkerOptions = {id:string;time:UTCTimestamp;color:string;visible?:boolean;locked?:boolean};
export type TextAnnotationOptions = {id:string;time:UTCTimestamp;price:number;text:string;color:string;visible?:boolean;locked?:boolean};
export type TrendLineOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;color:string;visible?:boolean;locked?:boolean};
export type RectangleOptions = TrendLineOptions&{fill:boolean};
export type RayOptions = TrendLineOptions;
export type ChartStorageScope = {symbol:string;timeframe:string};
export type DataWindowReadout = {
 state:"AVAILABLE"|"UNAVAILABLE";account:string;source:"CHART_FEED";time:number;timeUtc:string;
 reason?:"BAR_NOT_LOADED";ohlc?:{open:number;high:number;low:number;close:number};
 volume?:{value:number|null;source:"REAL_VOLUME"|"TICK_VOLUME_PROXY"|"UNAVAILABLE"};
 indicators?:Array<{id:string;title:string;kind:"OVERLAY"|"PANE";value:number|null;state:"AVAILABLE"|"WARMUP_OR_MISSING"}>;
};
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
 constructor(private id:string,private options:TrendLineOptions){this.visible=options.visible??true}
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
   context.beginPath();context.moveTo(p.x1,p.y1);context.lineTo(p.x2,p.y2);context.stroke();context.restore();
  });
 }} }]}
 set(options:TrendLineOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
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
class RectanglePrimitive implements ISeriesPrimitive {
 private rect:{left:number;top:number;right:number;bottom:number}|null=null;
 private selected=false;
 private visible=true;
 private chart:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["chart"]|null=null;
 private series:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]["series"]|null=null;
 private requestUpdate:(()=>void)|null=null;
 constructor(private id:string,private options:RectangleOptions){this.visible=options.visible??true}
 attached(param:Parameters<NonNullable<ISeriesPrimitive["attached"]>>[0]){
  this.chart=param.chart;this.series=param.series;this.requestUpdate=param.requestUpdate;this.updateAllViews();
 }
 detached(){this.chart=null;this.series=null;this.requestUpdate=null;this.rect=null}
 updateAllViews(){
  const x1=this.chart?.timeScale().timeToCoordinate(this.options.startTime)??null;
  const y1=this.series?.priceToCoordinate(this.options.startPrice)??null;
  const x2=this.chart?.timeScale().timeToCoordinate(this.options.endTime)??null;
  const y2=this.series?.priceToCoordinate(this.options.endPrice)??null;
  this.rect=x1===null||y1===null||x2===null||y2===null?null:{left:Math.min(x1,x2),top:Math.min(y1,y2),right:Math.max(x1,x2),bottom:Math.max(y1,y2)};
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
  });
 }} }]}
 set(options:RectangleOptions){this.options={...options};this.visible=options.visible??true;this.updateAllViews();this.requestUpdate?.()}
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
export function createStudioV5(host:HTMLElement,accountId:string,scope?:ChartStorageScope){
 if(!host || !accountId || !/^[a-zA-Z0-9_-]{1,50}$/.test(accountId))throw Error("Invalid chart host/account");
 if(scope&&(!/^[a-zA-Z0-9._-]{1,32}$/.test(scope.symbol)||!/^[a-zA-Z0-9_-]{1,24}$/.test(scope.timeframe)))throw Error("Invalid chart storage scope");
 const drawingScope=scope?Object.freeze({...scope}):null;
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
 const textAnnotations=new Map<string,{primitive:TextAnnotationPrimitive;options:TextAnnotationOptions}>();
 const trendLines=new Map<string,{primitive:TrendLinePrimitive;options:TrendLineOptions}>();
 const rectangles=new Map<string,{primitive:RectanglePrimitive;options:RectangleOptions}>();
 const rays=new Map<string,{primitive:RayPrimitive;options:RayOptions}>();
 const drawingCount=()=>priceLevels.size+timeMarkers.size+textAnnotations.size+trendLines.size+rectangles.size+rays.size;
 type DrawingSnapshot={kind:"PRICE";options:PriceLevelOptions}|{kind:"TIME";options:TimeMarkerOptions}|{kind:"TEXT";options:TextAnnotationOptions}|{kind:"TREND";options:TrendLineOptions}|{kind:"RECT";options:RectangleOptions}|{kind:"RAY";options:RayOptions};
 type DrawingHistory={id:string;before:DrawingSnapshot|null;after:DrawingSnapshot|null};
 const undoStack:DrawingHistory[]=[],redoStack:DrawingHistory[]=[];
 const historyLimit=100;
 type PersistenceStatus="DISABLED"|"PENDING"|"READY"|"UNAVAILABLE"|"CONFLICT";
 let persistenceStatus:PersistenceStatus=drawingScope?"PENDING":"DISABLED";
 let persistenceError:string|null=null,drawingsHydrated=false,hydratingDrawings=false;
 let lastPersistedSnapshot:string|null=null;
 const persistenceLimit=65536;
 let selectedDrawingId:string|null=null,hoveredDrawingId:string|null=null;
 type ActiveDrag={pointerId:number;id:string;kind:"PRICE";original:PriceLevelOptions}|{pointerId:number;id:string;kind:"TIME";original:TimeMarkerOptions}|{pointerId:number;id:string;kind:"TEXT";original:TextAnnotationOptions};
 let activeDrag:ActiveDrag|null=null;
 chart.subscribeCrosshairMove(param=>{
  const objectId=param.hoveredInfo?.objectId;
  hoveredDrawingId=typeof objectId==="string"&&(priceLevels.has(objectId)||timeMarkers.has(objectId)||textAnnotations.has(objectId)||trendLines.has(objectId)||rectangles.has(objectId)||rays.has(objectId))?objectId:null;
 });
 chart.subscribeClick(param=>{
  selectDrawing(hoveredDrawingId);
 });
 const onPointerDown=(event:PointerEvent)=>{
  if(event.button!==0||!event.isPrimary||!hoveredDrawingId)return;
  const level=priceLevels.get(hoveredDrawingId),marker=timeMarkers.get(hoveredDrawingId),annotation=textAnnotations.get(hoveredDrawingId);
  if(!level&&!marker&&!annotation)return;
  selectDrawing(hoveredDrawingId);
  if(host.tabIndex<0)host.tabIndex=0;
  host.focus({preventScroll:true});
  if((level?.options.locked??marker?.options.locked??annotation?.options.locked)===true){event.preventDefault();event.stopImmediatePropagation();return}
  if(level)activeDrag={pointerId:event.pointerId,id:hoveredDrawingId,kind:"PRICE",original:{...level.options}};
  else if(marker)activeDrag={pointerId:event.pointerId,id:hoveredDrawingId,kind:"TIME",original:{...marker.options}};
  else if(annotation)activeDrag={pointerId:event.pointerId,id:hoveredDrawingId,kind:"TEXT",original:{...annotation.options}};
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
  }else{
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0){const item=textAnnotations.get(activeDrag.id);if(item)updateTextAnnotation(activeDrag.id,{time:candle.time,price:value})}
  }
 };
 const finishDrag=(cancel:boolean)=>{
  const drag=activeDrag;if(!drag)return;
  if(cancel){
   if(drag.kind==="PRICE"&&priceLevels.has(drag.id))updatePriceLevel(drag.id,{price:drag.original.price,color:drag.original.color});
   if(drag.kind==="TIME"&&timeMarkers.has(drag.id))updateTimeMarker(drag.id,{time:drag.original.time,color:drag.original.color});
   if(drag.kind==="TEXT"&&textAnnotations.has(drag.id))updateTextAnnotation(drag.id,drag.original);
  }else{
   const before:DrawingSnapshot=drag.kind==="PRICE"?{kind:"PRICE",options:{...drag.original}}:drag.kind==="TIME"?{kind:"TIME",options:{...drag.original}}:{kind:"TEXT",options:{...drag.original}};
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
 const onKeyDown=(event:KeyboardEvent)=>{
  if(event.key==="Escape"&&activeDrag){event.preventDefault();event.stopImmediatePropagation();finishDrag(true);return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){
   event.preventDefault();event.stopImmediatePropagation();if(event.shiftKey)redo();else undo();return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="y"){
   event.preventDefault();event.stopImmediatePropagation();redo();return;
  }
  if((event.key==="Delete"||event.key==="Backspace")&&selectedDrawingId){event.preventDefault();event.stopImmediatePropagation();deleteSelectedDrawing();return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="d"&&selectedDrawingId){event.preventDefault();event.stopImmediatePropagation();duplicateSelectedDrawing()}
  if(!event.ctrlKey&&!event.metaKey&&selectedDrawingId&&event.key.toLowerCase()==="h"){
   event.preventDefault();event.stopImmediatePropagation();const item=snapshotDrawing(selectedDrawingId);
   if(item)setDrawingVisible(selectedDrawingId,!item.options.visible);return;
  }
  if(!event.ctrlKey&&!event.metaKey&&selectedDrawingId&&event.key.toLowerCase()==="l"){
   event.preventDefault();event.stopImmediatePropagation();const item=snapshotDrawing(selectedDrawingId);
   if(item)setDrawingLocked(selectedDrawingId,!item.options.locked);return;
  }
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
 function persistenceKey(account=activeAccount){
  if(!drawingScope)return null;
  return `2eas.chartstudio.v5.drawings:${encodeURIComponent(account)}:${encodeURIComponent(drawingScope.symbol)}:${encodeURIComponent(drawingScope.timeframe)}`;
 }
 function localStorageApi():Storage|null{
  try{return host.ownerDocument.defaultView?.localStorage??null}catch(_){return null}
 }
 function persistDrawings(){
  if(!drawingScope||!drawingsHydrated||hydratingDrawings||persistenceStatus==="CONFLICT"||persistenceStatus==="UNAVAILABLE")return;
  const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return}
  try{
   if(storage.getItem(key)!==lastPersistedSnapshot){persistenceStatus="CONFLICT";persistenceError="EXTERNAL_CHANGE";return}
   const drawings:DrawingSnapshot[]=[
    ...[...priceLevels.values()].map(({options})=>({kind:"PRICE" as const,options:{...options}})),
    ...[...timeMarkers.values()].map(({options})=>({kind:"TIME" as const,options:{...options}})),
   ...[...textAnnotations.values()].map(({options})=>({kind:"TEXT" as const,options:{...options}})),
   ...[...trendLines.values()].map(({options})=>({kind:"TREND" as const,options:{...options}}))];
  drawings.push(...[...rectangles.values()].map(({options})=>({kind:"RECT" as const,options:{...options}})),
   ...[...rays.values()].map(({options})=>({kind:"RAY" as const,options:{...options}})));
   const serialized=JSON.stringify({schemaVersion:1,account:activeAccount,symbol:drawingScope.symbol,
    timeframe:drawingScope.timeframe,drawings});
   if(serialized.length>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return}
   storage.setItem(key,serialized);lastPersistedSnapshot=serialized;persistenceStatus="READY";persistenceError=null;
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_WRITE_FAILED"}
 }
 function hydrateDrawings(){
  if(!drawingScope){drawingsHydrated=true;persistenceStatus="DISABLED";return}
  if(drawingsHydrated)return;
  drawingsHydrated=true;const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return}
  let raw:string|null;
  try{raw=storage.getItem(key)}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_READ_FAILED";return}
  lastPersistedSnapshot=raw;
  if(raw===null){persistenceStatus="READY";persistenceError=null;if(drawingCount())persistDrawings();return}
  if(raw.length>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return}
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  if(!parsed||typeof parsed!=="object") {persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  const root=parsed as {schemaVersion?:unknown;account?:unknown;symbol?:unknown;timeframe?:unknown;drawings?:unknown};
  if(root.schemaVersion!==1||root.account!==activeAccount||root.symbol!==drawingScope.symbol||root.timeframe!==drawingScope.timeframe||!Array.isArray(root.drawings)||root.drawings.length>100){
   persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_MISMATCHED_SNAPSHOT";return;
  }
  if(drawingCount()){persistenceStatus="CONFLICT";persistenceError="DRAWINGS_ALREADY_PRESENT";return}
  const seen=new Set<string>(),snapshots:DrawingSnapshot[]=[];
  try{
   for(const entry of root.drawings){
    if(!entry||typeof entry!=="object")throw Error();
    const row=entry as {kind?:unknown;options?:unknown};
    if(!row.options||typeof row.options!=="object")throw Error();
    const options=row.options as Record<string,unknown>;
    if(typeof options.id!=="string"||seen.has(options.id)||averages.has(options.id)||paneLines.has(options.id))throw Error();
    seen.add(options.id);
    if(row.kind==="PRICE"){
     const normalized={id:options.id,price:options.price,color:options.color,visible:options.visible,locked:options.locked} as PriceLevelOptions;
     validatePriceLevel(normalized);snapshots.push({kind:"PRICE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TIME"){
     const normalized={id:options.id,time:options.time,color:options.color,visible:options.visible,locked:options.locked} as TimeMarkerOptions;
     validateTimeMarker(normalized);snapshots.push({kind:"TIME",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TEXT"){
     const normalized={id:options.id,time:options.time,price:options.price,text:options.text,color:options.color,visible:options.visible,locked:options.locked} as TextAnnotationOptions;
     validateTextAnnotation(normalized);snapshots.push({kind:"TEXT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="TREND"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,visible:options.visible,locked:options.locked} as TrendLineOptions;
     validateTrendLine(normalized);snapshots.push({kind:"TREND",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="RECT"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,fill:options.fill,visible:options.visible,locked:options.locked} as RectangleOptions;
     validateRectangle(normalized);snapshots.push({kind:"RECT",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="RAY"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,visible:options.visible,locked:options.locked} as RayOptions;
     validateTrendLine(normalized);snapshots.push({kind:"RAY",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else throw Error();
   }
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_UNAVAILABLE_DRAWING";return}
  hydratingDrawings=true;
  try{
   for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options);else if(snapshot.kind==="RECT")addRectangle(snapshot.options);else addRay(snapshot.options)}
   undoStack.length=0;redoStack.length=0;persistenceStatus="READY";persistenceError=null;
  }catch(_){
   for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
   for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();
   for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
   for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
   for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
   for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
   undoStack.length=0;redoStack.length=0;persistenceStatus="UNAVAILABLE";persistenceError="RESTORE_FAILED";
  }finally{hydratingDrawings=false}
 }
 function selectDrawing(id:string|null){
  if(selectedDrawingId===id){if(id){priceLevels.get(id)?.primitive.setSelected(true);timeMarkers.get(id)?.primitive.setSelected(true);textAnnotations.get(id)?.primitive.setSelected(true);trendLines.get(id)?.primitive.setSelected(true);rectangles.get(id)?.primitive.setSelected(true);rays.get(id)?.primitive.setSelected(true)}return}
  if(selectedDrawingId){priceLevels.get(selectedDrawingId)?.primitive.setSelected(false);timeMarkers.get(selectedDrawingId)?.primitive.setSelected(false);textAnnotations.get(selectedDrawingId)?.primitive.setSelected(false);trendLines.get(selectedDrawingId)?.primitive.setSelected(false);rectangles.get(selectedDrawingId)?.primitive.setSelected(false);rays.get(selectedDrawingId)?.primitive.setSelected(false)}
  selectedDrawingId=id;
  if(id){priceLevels.get(id)?.primitive.setSelected(true);timeMarkers.get(id)?.primitive.setSelected(true);textAnnotations.get(id)?.primitive.setSelected(true);trendLines.get(id)?.primitive.setSelected(true);rectangles.get(id)?.primitive.setSelected(true);rays.get(id)?.primitive.setSelected(true)}
 }
 function snapshotDrawing(id:string):DrawingSnapshot|null{
  const priceLevel=priceLevels.get(id);if(priceLevel)return {kind:"PRICE",options:{...priceLevel.options}};
  const timeMarker=timeMarkers.get(id);if(timeMarker)return {kind:"TIME",options:{...timeMarker.options}};
  const textAnnotation=textAnnotations.get(id);if(textAnnotation)return {kind:"TEXT",options:{...textAnnotation.options}};
  const trendLine=trendLines.get(id);if(trendLine)return {kind:"TREND",options:{...trendLine.options}};
  const rectangle=rectangles.get(id);if(rectangle)return {kind:"RECT",options:{...rectangle.options}};
  const ray=rays.get(id);if(ray)return {kind:"RAY",options:{...ray.options}};
  return null;
 }
 function recordDrawingChange(id:string,before:DrawingSnapshot|null,after:DrawingSnapshot|null){
  if(JSON.stringify(before)===JSON.stringify(after))return;
  undoStack.push({id,before,after});if(undoStack.length>historyLimit)undoStack.shift();redoStack.length=0;
  persistDrawings();
 }
 function restoreDrawing(id:string,snapshot:DrawingSnapshot|null):boolean{
  if(snapshot&&(averages.has(id)||paneLines.has(id)))return false;
  if(snapshot?.kind==="TIME"&&!barsByTime.has(snapshot.options.time))return false;
  if(snapshot?.kind==="TEXT"&&!barsByTime.has(snapshot.options.time))return false;
  if(snapshot?.kind==="TREND"&&(!barsByTime.has(snapshot.options.startTime)||!barsByTime.has(snapshot.options.endTime)))return false;
  if(snapshot?.kind==="RECT"&&(!barsByTime.has(snapshot.options.startTime)||!barsByTime.has(snapshot.options.endTime)))return false;
  if(snapshot?.kind==="RAY"&&(!barsByTime.has(snapshot.options.startTime)||!barsByTime.has(snapshot.options.endTime)))return false;
  const wasSelected=selectedDrawingId===id;
  if(wasSelected)selectDrawing(null);
  const oldPrice=priceLevels.get(id);if(oldPrice){price.detachPrimitive(oldPrice.primitive);priceLevels.delete(id)}
  const oldTime=timeMarkers.get(id);if(oldTime){price.detachPrimitive(oldTime.primitive);timeMarkers.delete(id)}
  const oldText=textAnnotations.get(id);if(oldText){price.detachPrimitive(oldText.primitive);textAnnotations.delete(id)}
  const oldTrend=trendLines.get(id);if(oldTrend){price.detachPrimitive(oldTrend.primitive);trendLines.delete(id)}
  const oldRect=rectangles.get(id);if(oldRect){price.detachPrimitive(oldRect.primitive);rectangles.delete(id)}
  const oldRay=rays.get(id);if(oldRay){price.detachPrimitive(oldRay.primitive);rays.delete(id)}
  if(snapshot?.kind==="PRICE"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validatePriceLevel(options);
   const primitive=new PriceLevelPrimitive(id,options.price,options.color,options.visible??true);price.attachPrimitive(primitive);
   priceLevels.set(id,{primitive,options});
  }else if(snapshot?.kind==="TIME"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validateTimeMarker(options);
   const primitive=new TimeMarkerPrimitive(id,options.time,options.color,options.visible??true);price.attachPrimitive(primitive);
   timeMarkers.set(id,{primitive,options});
  }else if(snapshot?.kind==="TEXT"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validateTextAnnotation(options);
   const primitive=new TextAnnotationPrimitive(id,options);price.attachPrimitive(primitive);
   textAnnotations.set(id,{primitive,options});
  }else if(snapshot?.kind==="TREND"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validateTrendLine(options);
   const primitive=new TrendLinePrimitive(id,options);price.attachPrimitive(primitive);
   trendLines.set(id,{primitive,options});
  }else if(snapshot?.kind==="RECT"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validateRectangle(options);
   const primitive=new RectanglePrimitive(id,options);price.attachPrimitive(primitive);
   rectangles.set(id,{primitive,options});
  }else if(snapshot?.kind==="RAY"){
   if(drawingCount()>=100)return false;
   const options={...snapshot.options};validateTrendLine(options);
   const primitive=new RayPrimitive(id,options);price.attachPrimitive(primitive);
   rays.set(id,{primitive,options});
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
 function deleteSelectedDrawing(){
  guard();if(!selectedDrawingId)return false;
  if(priceLevels.has(selectedDrawingId))return removePriceLevel(selectedDrawingId);
  if(timeMarkers.has(selectedDrawingId))return removeTimeMarker(selectedDrawingId);
  if(textAnnotations.has(selectedDrawingId))return removeTextAnnotation(selectedDrawingId);
  if(trendLines.has(selectedDrawingId))return removeTrendLine(selectedDrawingId);
  if(rectangles.has(selectedDrawingId))return removeRectangle(selectedDrawingId);
  return removeRay(selectedDrawingId);
 }
 function duplicateSelectedDrawing(){
  guard();if(!selectedDrawingId)return null;
  const source=snapshotDrawing(selectedDrawingId);if(!source)return null;
  const base=selectedDrawingId.slice(0,20);let suffix=1,id="";
  do{id=`${base}-copy${suffix++}`}while(priceLevels.has(id)||timeMarkers.has(id)||textAnnotations.has(id)||trendLines.has(id)||rectangles.has(id)||rays.has(id)||averages.has(id)||paneLines.has(id));
  if(source.kind==="PRICE")addPriceLevel({id,price:source.options.price,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TIME")addTimeMarker({id,time:source.options.time,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TEXT")addTextAnnotation({...source.options,id});
  else if(source.kind==="TREND")addTrendLine({...source.options,id});
  else if(source.kind==="RECT")addRectangle({...source.options,id});
  else addRay({...source.options,id});
  selectDrawing(id);return id;
 }
 function setCandles(data:readonly Candle[]){
  guard();const next=normalizeCandles(data);finishDrag(true);undoStack.length=0;redoStack.length=0;bars=next;barsByTime=new Map(bars.map(c=>[c.time,c]));
  for(const series of averages.values())series.setData([]);
  for(const series of paneLines.values())series.setData([]);
  readoutIndicators.clear();price.setData(bars);
  if(volume)volume.setData(volumeRows());
  hydrateDrawings();
 }
 function volumeRows(){
  return bars.map(c=>({time:c.time,value:Math.max(0,(c.real_volume??0)>0?c.real_volume!:c.tick_volume??0),
   color:c.close>=c.open?"#4bc3d7":"#dc6987"}));
 }
 function addAverage(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))throw Error("Invalid line options");
  if(averages.size>=16&&!averages.has(opts.id))throw Error("Indicator instance limit");
  if(paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
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
   !Number.isFinite(opts.price)||opts.price<=0||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid price level");
 }
 function addPriceLevel(opts:PriceLevelOptions){
  guard();validatePriceLevel(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=priceLevels.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options.price,options.color,options.visible);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
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
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);priceLevels.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function validateTimeMarker(opts:TimeMarkerOptions,requireLoadedTime=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.time)||opts.time<=0||!Number.isFinite(new Date(opts.time*1000).getTime())||
   (requireLoadedTime&&!barsByTime.has(opts.time))||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid or unloaded UTC time marker");
 }
 function addTimeMarker(opts:TimeMarkerOptions){
  guard();validateTimeMarker(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=timeMarkers.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options.time,options.color,options.visible);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
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
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);timeMarkers.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function validateTextAnnotation(opts:TextAnnotationOptions,requireLoadedTime=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.time)||opts.time<=0||!Number.isFinite(new Date(opts.time*1000).getTime())||
   (requireLoadedTime&&!barsByTime.has(opts.time))||!Number.isFinite(opts.price)||opts.price<=0||
   typeof opts.text!=="string"||! /^[\x20-\x7E]{1,40}$/.test(opts.text)||
   (opts.visible!==undefined&&typeof opts.visible!=="boolean")||(opts.locked!==undefined&&typeof opts.locked!=="boolean"))
   throw Error("Invalid or unavailable text annotation");
 }
 function addTextAnnotation(opts:TextAnnotationOptions){
  guard();validateTextAnnotation(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=textAnnotations.get(opts.id);
  const options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
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
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);textAnnotations.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function validateTrendLine(opts:TrendLineOptions,requireLoadedAnchors=true){
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color)||
   !Number.isSafeInteger(opts.startTime)||!Number.isSafeInteger(opts.endTime)||opts.startTime<=0||opts.endTime<=0||opts.endTime===opts.startTime||
   !Number.isFinite(new Date(opts.startTime*1000).getTime())||!Number.isFinite(new Date(opts.endTime*1000).getTime())||
   (requireLoadedAnchors&&(!barsByTime.has(opts.startTime)||!barsByTime.has(opts.endTime)))||!Number.isFinite(opts.startPrice)||opts.startPrice<=0||
   !Number.isFinite(opts.endPrice)||opts.endPrice<=0||(opts.visible!==undefined&&typeof opts.visible!=="boolean")||
   (opts.locked!==undefined&&typeof opts.locked!=="boolean"))throw Error("Invalid or unavailable trend line");
 }
 function addTrendLine(opts:TrendLineOptions){
  guard();validateTrendLine(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=trendLines.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
  const primitive=new TrendLinePrimitive(opts.id,options);price.attachPrimitive(primitive);
  trendLines.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateTrendLine(id:string,patch:Partial<Pick<TrendLineOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){
  guard();const item=trendLines.get(id);if(!item)throw Error("Unknown trend line");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeTrendLine(id:string){
  guard();const item=trendLines.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);trendLines.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function validateRectangle(opts:RectangleOptions,requireLoadedAnchors=true){
  validateTrendLine(opts,requireLoadedAnchors);
  if(!opts||typeof opts.fill!=="boolean"||opts.startPrice===opts.endPrice)throw Error("Invalid rectangle fill/geometry");
 }
 function addRectangle(opts:RectangleOptions){
  guard();validateRectangle(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=rectangles.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
  const primitive=new RectanglePrimitive(opts.id,options);price.attachPrimitive(primitive);
  rectangles.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateRectangle(id:string,patch:Partial<Pick<RectangleOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"fill"|"visible"|"locked">>){
  guard();const item=rectangles.get(id);if(!item)throw Error("Unknown rectangle");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateRectangle(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeRectangle(id:string){
  guard();const item=rectangles.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);rectangles.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function addRay(opts:RayOptions){
  guard();validateTrendLine(opts);
  if(averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id))throw Error("Duplicate chart object identity");
  const existing=rays.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};
  if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}
  if(drawingCount()>=100)throw Error("Native drawing limit");
  const primitive=new RayPrimitive(opts.id,options);price.attachPrimitive(primitive);
  rays.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id));
 }
 function updateRay(id:string,patch:Partial<Pick<RayOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){
  guard();const item=rays.get(id);if(!item)throw Error("Unknown ray");const before=snapshotDrawing(id);
  const options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);item.primitive.set(options);item.options=options;recordDrawingChange(id,before,snapshotDrawing(id));
 }
 function removeRay(id:string){
  guard();const item=rays.get(id);if(!item)return false;
  const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);rays.delete(id);if(selectedDrawingId===id)selectDrawing(null);recordDrawingChange(id,before,null);return true;
 }
 function drawingPosition(id:string){
  guard();const rect=host.getBoundingClientRect();const priceLevel=priceLevels.get(id);
  if(priceLevel){if(!priceLevel.options.visible)return null;const y=priceLevel.primitive.coordinate();return y===null?null:{x:rect.left+Math.min(40,rect.width/2),y:rect.top+y}}
  const timeMarker=timeMarkers.get(id);if(timeMarker){if(!timeMarker.options.visible)return null;const x=timeMarker.primitive.coordinate();return x===null?null:{x:rect.left+x,y:rect.top+Math.min(40,rect.height/2)}}
  const annotation=textAnnotations.get(id);if(annotation){if(!annotation.options.visible)return null;const point=annotation.primitive.coordinate();return point===null?null:{x:rect.left+point.x+12,y:rect.top+point.y-8}}
  const trend=trendLines.get(id);if(trend){if(!trend.options.visible)return null;const p=trend.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  const zone=rectangles.get(id);if(zone){if(!zone.options.visible)return null;const p=zone.primitive.coordinates();return p===null?null:{x:rect.left+(p.left+p.right)/2,y:rect.top+(p.top+p.bottom)/2}}
  const ray=rays.get(id);if(ray){if(!ray.options.visible)return null;const p=ray.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  return null;
 }
 function readDrawing(id:string){
  guard();const level=priceLevels.get(id);if(level)return {...level.options};
  const marker=timeMarkers.get(id);if(marker)return {...marker.options};
  const annotation=textAnnotations.get(id);if(annotation)return {...annotation.options};
  const trend=trendLines.get(id);if(trend)return {...trend.options};
  const zone=rectangles.get(id);if(zone)return {...zone.options};
  const ray=rays.get(id);if(ray)return {...ray.options};
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
    ...[...rays.values()].map(({options})=>({kind:"RAY" as const,options:{...options}}))];
  const serialized=JSON.stringify({schemaVersion:1,symbol:drawingScope.symbol,timeframe:drawingScope.timeframe,drawings});
  if(serialized.length>persistenceLimit)throw Error("Drawing export exceeds size limit");
  return serialized;
 }
 function importDrawings(serialized:string):{imported:number}{
  guard();if(!drawingScope)throw Error("Drawing import requires symbol/timeframe scope");
  if(typeof serialized!=="string"||serialized.length>persistenceLimit)throw Error("Invalid drawing import size");
  let parsed:unknown;try{parsed=JSON.parse(serialized)}catch(_){throw Error("Invalid drawing import JSON")}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Invalid drawing import envelope");
  const root=parsed as Record<string,unknown>;
  if(Object.keys(root).sort().join(",")!=="drawings,schemaVersion,symbol,timeframe"||root.schemaVersion!==1||
   root.symbol!==drawingScope.symbol||root.timeframe!==drawingScope.timeframe||!Array.isArray(root.drawings)||root.drawings.length>100)
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
   const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":"";
   if(!expected||Object.keys(options).sort().join(",")!==expected||typeof options.id!=="string"||seen.has(options.id)||
    averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id))throw Error("Invalid or conflicting drawing identity/options");
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
   }else{
    const normalized=options as unknown as RayOptions;validateTrendLine(normalized);
    snapshots.push({kind:"RAY",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }
  }
  if(snapshots.length>100)throw Error("Native drawing limit");
  hydratingDrawings=true;
  try{for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options);else if(snapshot.kind==="RECT")addRectangle(snapshot.options);else addRay(snapshot.options)}}
  catch(error){
   for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
   for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();
   for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
   for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
   for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
   for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
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
  return false;
 }
 function addPaneLine(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))
   throw Error("Invalid pane line");
  const values=validSeriesData(data);
  if(averages.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
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
  undoStack.length=0;redoStack.length=0;
  drawingsHydrated=false;lastPersistedSnapshot=null;persistenceError=null;persistenceStatus=drawingScope?"PENDING":"DISABLED";
  activeAccount=next;bars=[];barsByTime.clear();price.setData([]);
  for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
  for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();selectedDrawingId=null;
  for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
  for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
  for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
  for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
  for(const item of averages.values())chart.removeSeries(item);
  averages.clear();
  for(const line of paneLines.values())chart.removeSeries(line);
  paneLines.clear();readoutIndicators.clear();if(volume)volume.setData([]);
 }
 function inspect(){guard();return {version:VERSION,account:activeAccount,
  candleCount:bars.length,lastTime:bars[bars.length-1]?.time??null,
  averageCount:averages.size,nativePaneLines:paneLines.size,nativePrimitives:drawingCount(),selectedDrawingId,hoveredDrawingId,
  paneCount:chart.panes().length,volumeVisible:!!volume,persistenceStatus,persistenceError}}
 function destroy(){if(destroyed)return;finishDrag(true);destroyed=true;host.removeEventListener("pointerdown",onPointerDown,true);host.removeEventListener("pointermove",onPointerMove,true);host.removeEventListener("pointerup",onPointerUp,true);host.removeEventListener("pointercancel",onPointerCancel,true);host.removeEventListener("lostpointercapture",onLostPointerCapture,true);host.removeEventListener("keydown",onKeyDown,true);chart.remove();averages.clear();paneLines.clear();priceLevels.clear();timeMarkers.clear();textAnnotations.clear();trendLines.clear();rectangles.clear();rays.clear();readoutIndicators.clear();volume=null;bars=[];barsByTime.clear()}
 return Object.freeze({setCandles,addAverage,moveAverage,removeAverage,addPriceLevel,updatePriceLevel,removePriceLevel,
  addTimeMarker,updateTimeMarker,removeTimeMarker,addTextAnnotation,updateTextAnnotation,removeTextAnnotation,addTrendLine,updateTrendLine,removeTrendLine,addRectangle,updateRectangle,removeRectangle,addRay,updateRay,removeRay,drawingPosition,readDrawing,exportDrawings,importDrawings,setDrawingVisible,setDrawingLocked,undo,redo,deleteSelectedDrawing,duplicateSelectedDrawing,
  addPaneLine,movePaneLine,removePaneLine,resizePane,showVolume,readDataWindow,
  updateLast,changeAccount,inspect,destroy});
}
