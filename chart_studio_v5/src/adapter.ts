/**
 * Opt-in native LWC v5 read-only adapter for the existing 2EAs Chart Studio.
 * No execution routes, broker writes, credentials or global MT5 state.
 * Rendering remains isolated until the v4 -> v5 migration acceptance gate.
 */
import {createChart, CandlestickSeries, LineSeries, HistogramSeries, TickMarkType, type ISeriesPrimitive, type LogicalRange, type Time, type UTCTimestamp} from "lightweight-charts";
import type {CanvasRenderingTarget2D} from "fancy-canvas";
import {calculateOscillator,createIncrementalOscillator,MAX_OSCILLATOR_BARS,type IncrementalOscillator,type OscillatorKind,type OscillatorSettings} from "./oscillators";
export {createIncrementalOscillator};
export const VERSION = "5.2.1";
export type Candle = {time:UTCTimestamp;open:number;high:number;low:number;close:number;tick_volume?:number;real_volume?:number};
export type AveragePoint = {time:UTCTimestamp;value:number};
export type AverageOptions = {id:string;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
export type MovingAverageOptions = AverageOptions&{type:"EMA"|"SMA"|"WMA"|"RMA"|"SMMA";period:number;source?:"close"|"open"|"high"|"low"|"hl2"|"hlc3"|"ohlc4";displayShift?:number};
export type DonchianOptions = AverageOptions&{period:number};
export type OscillatorOptions = {id:string;kind:OscillatorKind;settings:OscillatorSettings;color:string;lineWidth?:1|2|3|4;visible?:boolean;title?:string};
export type PriceLevelOptions = {id:string;price:number;color:string;visible?:boolean;locked?:boolean};
export type TimeMarkerOptions = {id:string;time:UTCTimestamp;color:string;visible?:boolean;locked?:boolean};
export type TextAnnotationOptions = {id:string;time:UTCTimestamp;price:number;text:string;color:string;visible?:boolean;locked?:boolean};
export type TrendLineOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;color:string;visible?:boolean;locked?:boolean};
export type RectangleOptions = TrendLineOptions&{fill:boolean};
export type ChannelOptions = {id:string;startTime:UTCTimestamp;startPrice:number;endTime:UTCTimestamp;endPrice:number;offsetTime:UTCTimestamp;offsetPrice:number;color:string;visible?:boolean;locked?:boolean};
export type MeasurementOptions = TrendLineOptions;
export type RayOptions = TrendLineOptions;
export type FibonacciOptions = TrendLineOptions&{levels?:number[]};
export type ChartStorageScope = {symbol:string;timeframe:string};
export type DataWindowReadout = {
 state:"AVAILABLE"|"UNAVAILABLE";account:string;source:"CHART_FEED";time:number;timeUtc:string;
 reason?:"BAR_NOT_LOADED";ohlc?:{open:number;high:number;low:number;close:number};
 volume?:{value:number|null;source:"REAL_VOLUME"|"TICK_VOLUME_PROXY"|"UNAVAILABLE"};
 indicators?:Array<{id:string;title:string;kind:"OVERLAY"|"PANE";value:number|null;state:"AVAILABLE"|"WARMUP_OR_MISSING"}>;
};
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
class MeasurementPrimitive extends TrendLinePrimitive {}
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
  localization:{timeFormatter:formatCrosshairTime},
  timeScale:{timeVisible:true,borderVisible:true,rightOffset:8,tickMarkFormatter:formatTimeLabel},
  crosshair:{mode:0}});
 const price=chart.addSeries(CandlestickSeries,{upColor:"#1bca99",downColor:"#f16b8d",
  borderVisible:false,wickUpColor:"#1bca99",wickDownColor:"#f16b8d"});
 const newLine=(opts:AverageOptions)=>chart.addSeries(LineSeries,{
  color:opts.color,lineWidth:opts.lineWidth??2,visible:opts.visible??true,
  title:opts.title??opts.id,priceLineVisible:false,lastValueVisible:true});
 type LineApi=ReturnType<typeof newLine>;
 const averages=new Map<string,LineApi>();
 type DonchianGroup={options:DonchianOptions;series:[LineApi,LineApi,LineApi]};
 const donchianOverlays=new Map<string,DonchianGroup>();
 const managedMovingAverages=new Map<string,{options:MovingAverageOptions;base:Map<number,number>}>();
 type ReadoutIndicator={id:string;title:string;kind:"OVERLAY"|"PANE";values:Map<number,number>};
 const readoutIndicators=new Map<string,ReadoutIndicator>();
 // Independent native chart panes, not separate chart instances or duplicated time axes.
 const paneLines=new Map<string,LineApi>();
 const paneHeightOverrides=new Map<number,number>();
 type OscillatorGroup={options:OscillatorOptions;paneIndex:number;series:Map<string,ReturnType<typeof newLine>|ReturnType<typeof newHistogram>>;values:Map<string,Map<number,number>>;calculator:IncrementalOscillator};
 const oscillators=new Map<string,OscillatorGroup>();
 const priceLevels=new Map<string,{primitive:PriceLevelPrimitive;options:PriceLevelOptions}>();
 const timeMarkers=new Map<string,{primitive:TimeMarkerPrimitive;options:TimeMarkerOptions}>();
 const textAnnotations=new Map<string,{primitive:TextAnnotationPrimitive;options:TextAnnotationOptions}>();
 const trendLines=new Map<string,{primitive:TrendLinePrimitive;options:TrendLineOptions}>();
 const rectangles=new Map<string,{primitive:RectanglePrimitive;options:RectangleOptions}>();
 const rays=new Map<string,{primitive:RayPrimitive;options:RayOptions}>();
 const fibonacci=new Map<string,{primitive:FibonacciPrimitive;options:FibonacciOptions}>();
 const channels=new Map<string,{primitive:ChannelPrimitive;options:ChannelOptions}>();
 const measurements=new Map<string,{primitive:MeasurementPrimitive;options:MeasurementOptions}>();
 const maxNativeDrawings=1000,maxIndicatorInstances=20;
 const drawingCount=()=>priceLevels.size+timeMarkers.size+textAnnotations.size+trendLines.size+rectangles.size+rays.size+fibonacci.size+channels.size+measurements.size;
 type DrawingSnapshot={kind:"PRICE";options:PriceLevelOptions}|{kind:"TIME";options:TimeMarkerOptions}|{kind:"TEXT";options:TextAnnotationOptions}|{kind:"TREND";options:TrendLineOptions}|{kind:"RECT";options:RectangleOptions}|{kind:"RAY";options:RayOptions}|{kind:"FIBO";options:FibonacciOptions}|{kind:"CHANNEL";options:ChannelOptions}|{kind:"MEASURE";options:MeasurementOptions};
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
 type ActiveDrag={pointerId:number;id:string;kind:"PRICE";original:PriceLevelOptions}|{pointerId:number;id:string;kind:"TIME";original:TimeMarkerOptions}|{pointerId:number;id:string;kind:"TEXT";original:TextAnnotationOptions}|{pointerId:number;id:string;kind:"TREND";anchor:"START"|"END";original:TrendLineOptions}|{pointerId:number;id:string;kind:"RECT";anchor:"START"|"END";original:RectangleOptions}|{pointerId:number;id:string;kind:"FIBO";anchor:"START"|"END";original:FibonacciOptions}|{pointerId:number;id:string;kind:"CHANNEL";anchor:"START"|"END"|"OFFSET";original:ChannelOptions}|{pointerId:number;id:string;kind:"MEASURE";anchor:"START"|"END";original:MeasurementOptions};
 let activeDrag:ActiveDrag|null=null;
 chart.subscribeCrosshairMove(param=>{
    const objectId=param.hoveredInfo?.objectId;
  hoveredDrawingId=typeof objectId==="string"&&(priceLevels.has(objectId)||timeMarkers.has(objectId)||textAnnotations.has(objectId)||trendLines.has(objectId)||rectangles.has(objectId)||rays.has(objectId)||fibonacci.has(objectId)||measurements.has(objectId))?objectId:null;
 });
 const touchAnchorAt=(x:number,y:number)=>{
  let bestId:string|null=null,bestDistance=12;
  const ids=[...trendLines.keys(),...rectangles.keys(),...fibonacci.keys(),...channels.keys()];
  for(const id of ids){
   const snapshot=snapshotDrawing(id);if(!snapshot||snapshot.options.visible===false)continue;
   for(const anchor of (channels.has(id)?["START","END","OFFSET"]:["START","END"]) as ("START"|"END"|"OFFSET")[]){
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
  const primitives=[...priceLevels.values(),...timeMarkers.values(),...textAnnotations.values(),...trendLines.values(),...rectangles.values(),...rays.values(),...fibonacci.values(),...channels.values(),...measurements.values()];
  for(const item of primitives){
   const hit=item.primitive.hitTest(x,y);if(hit&&hit.distance<=bestDistance){bestId=hit.externalId;bestDistance=hit.distance}
  }
  return bestId;
 };
 const onPointerDown=(event:PointerEvent)=>{
  if(event.button!==0||!event.isPrimary)return;
  const drawingId=hoveredDrawingId??drawingAt(event.clientX,event.clientY)??(event.pointerType==="touch"?touchAnchorAt(event.clientX,event.clientY):null);
  if(!drawingId){if(!event.shiftKey)selectDrawing(null);return}
  hoveredDrawingId=drawingId;
  const level=priceLevels.get(drawingId),marker=timeMarkers.get(drawingId),annotation=textAnnotations.get(drawingId),trend=trendLines.get(drawingId),rectangle=rectangles.get(drawingId),fibo=fibonacci.get(drawingId),channel=channels.get(drawingId),measurement=measurements.get(drawingId);
  if(event.shiftKey)toggleDrawingSelection(drawingId);else selectDrawing(drawingId);
  if(host.tabIndex<0)host.tabIndex=0;
  host.focus({preventScroll:true});
  if(!level&&!marker&&!annotation&&!trend&&!rectangle&&!fibo&&!channel&&!measurement)return;
  if((level?.options.locked??marker?.options.locked??annotation?.options.locked??trend?.options.locked??rectangle?.options.locked??fibo?.options.locked??channel?.options.locked??measurement?.options.locked)===true){event.preventDefault();event.stopImmediatePropagation();return}
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
  else if(channel){
   const points=( ["START","END","OFFSET"] as const).map(anchor=>drawingAnchorPosition(drawingId,anchor));if(points.some(point=>!point))return;
   const distances=points.map(point=>Math.hypot(event.clientX-point!.x,event.clientY-point!.y)),nearest=distances.indexOf(Math.min(...distances));
   if(distances[nearest]>12)return;
   activeDrag={pointerId:event.pointerId,id:drawingId,kind:"CHANNEL",anchor:(["START","END","OFFSET"] as const)[nearest],original:{...channel.options}};
  }
  else if(measurement){const a=drawingAnchorPosition(drawingId,"START"),b=drawingAnchorPosition(drawingId,"END");if(!a||!b)return;const da=Math.hypot(event.clientX-a.x,event.clientY-a.y),db=Math.hypot(event.clientX-b.x,event.clientY-b.y);if(Math.min(da,db)>12)return;activeDrag={pointerId:event.pointerId,id:drawingId,kind:"MEASURE",anchor:da<=db?"START":"END",original:{...measurement.options}}}
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
  }else if(activeDrag.kind==="CHANNEL"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y),item=channels.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){
    const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:activeDrag.anchor==="END"?{endTime:candle.time,endPrice:value}:{offsetTime:candle.time,offsetPrice:value};
    const options={...item.options,...patch};
    try{validateChannel(options);updateChannel(activeDrag.id,patch)}catch(_){}
   }
  }else if(activeDrag.kind==="TREND"||activeDrag.kind==="RECT"||activeDrag.kind==="FIBO"||activeDrag.kind==="MEASURE"){
   const logical=chart.timeScale().coordinateToLogical(x),index=logical===null?-1:Math.round(Number(logical));
   const candle=bars[index],value=price.coordinateToPrice(y),item=activeDrag.kind==="TREND"?trendLines.get(activeDrag.id):activeDrag.kind==="RECT"?rectangles.get(activeDrag.id):activeDrag.kind==="FIBO"?fibonacci.get(activeDrag.id):measurements.get(activeDrag.id);
   if(candle&&value!==null&&Number.isFinite(value)&&value>0&&item){
    const patch=activeDrag.anchor==="START"?{startTime:candle.time,startPrice:value}:{endTime:candle.time,endPrice:value};
    const otherTime=activeDrag.anchor==="START"?item.options.endTime:item.options.startTime,otherPrice=activeDrag.anchor==="START"?item.options.endPrice:item.options.startPrice;
    if(candle.time!==otherTime&&(activeDrag.kind==="TREND"||value!==otherPrice)){
     if(activeDrag.kind==="TREND")updateTrendLine(activeDrag.id,patch);else if(activeDrag.kind==="RECT")updateRectangle(activeDrag.id,patch);else if(activeDrag.kind==="FIBO")updateFibonacci(activeDrag.id,patch);else updateMeasurement(activeDrag.id,patch);
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
   if(drag.kind==="CHANNEL"&&channels.has(drag.id))updateChannel(drag.id,drag.original);
   if(drag.kind==="MEASURE"&&measurements.has(drag.id))updateMeasurement(drag.id,drag.original);
  }else{
   let before:DrawingSnapshot;
   if(drag.kind==="PRICE")before={kind:"PRICE",options:{...drag.original}};
   else if(drag.kind==="TIME")before={kind:"TIME",options:{...drag.original}};
   else if(drag.kind==="TEXT")before={kind:"TEXT",options:{...drag.original}};
   else if(drag.kind==="TREND")before={kind:"TREND",options:{...drag.original}};
   else if(drag.kind==="RECT")before={kind:"RECT",options:{...drag.original}};
   else if(drag.kind==="FIBO"){const original={...drag.original};if(original.levels)original.levels=[...original.levels];else delete original.levels;before={kind:"FIBO",options:original}}
   else if(drag.kind==="CHANNEL")before={kind:"CHANNEL",options:{...drag.original}}
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
  const id=selectedDrawingId;if(!id||(!dx&&!dy)||!bars.length)return false;
  const current=snapshotDrawing(id);if(!current||current.options.locked)return false;
  const time=(value:number)=>{
   const index=bars.findIndex(bar=>bar.time===value),next=index+dx;
   return index>=0&&next>=0&&next<bars.length?bars[next].time:null;
  };
  const priceValue=(value:number)=>{
   if(!dy)return value;
   const coordinate=price.priceToCoordinate(value);if(coordinate===null)return null;
   const next=price.coordinateToPrice(coordinate+dy);
   return next!==null&&Number.isFinite(next)&&next>0?next:null;
  };
  if(current.kind==="CHANNEL"){
   const startTime=time(current.options.startTime),endTime=time(current.options.endTime),offsetTime=time(current.options.offsetTime);
   const startPrice=priceValue(current.options.startPrice),endPrice=priceValue(current.options.endPrice),offsetPrice=priceValue(current.options.offsetPrice);
   if(startTime===null||endTime===null||offsetTime===null||startPrice===null||endPrice===null||offsetPrice===null)return false;
   try{updateChannel(id,{startTime,startPrice,endTime,endPrice,offsetTime,offsetPrice});return true}catch(_){return false}
  }
  if(current.kind==="PRICE"){
   if(dx)return false;const moved=priceValue(current.options.price);if(moved===null)return false;
   updatePriceLevel(id,{price:moved});return true;
  }
  if(current.kind==="TIME"){
   if(dy)return false;const moved=time(current.options.time);if(moved===null)return false;
   updateTimeMarker(id,{time:moved});return true;
  }
  if(current.kind==="TEXT"){
   const startTime=time(current.options.time),startPrice=priceValue(current.options.price);
   if(startTime===null||startPrice===null)return false;
   updateTextAnnotation(id,{time:startTime,price:startPrice});return true;
  }
  const startTime=time(current.options.startTime),endTime=time(current.options.endTime);
  const startPrice=priceValue(current.options.startPrice),endPrice=priceValue(current.options.endPrice);
  if(startTime===null||endTime===null||startPrice===null||endPrice===null)return false;
  const patch={startTime,startPrice,endTime,endPrice};
  if(current.kind==="TREND")updateTrendLine(id,patch);
  else if(current.kind==="RECT")updateRectangle(id,patch);
  else if(current.kind==="RAY")updateRay(id,patch);
  else if(current.kind==="FIBO")updateFibonacci(id,patch);
  else if(current.kind==="MEASURE")updateMeasurement(id,patch);
  return true;
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
  if((event.key==="Delete"||event.key==="Backspace")&&selectedDrawingId){event.preventDefault();event.stopImmediatePropagation();deleteSelectedDrawing();return}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="d"&&selectedDrawingId){event.preventDefault();event.stopImmediatePropagation();duplicateSelectedDrawing()}
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
 let bars:Candle[]=[],barsByTime=new Map<number,Candle>(),activeAccount=accountId,destroyed=false;
 function guard(){if(destroyed)throw Error("Chart was destroyed")}
 function persistenceKey(account=activeAccount){
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
   ...[...channels.values()].map(({options})=>({kind:"CHANNEL" as const,options:{...options}})),
   ...[...measurements.values()].map(({options})=>({kind:"MEASURE" as const,options:{...options}})),
  ];
 }
 function viewSnapshots(){
  const visibleRange=chart.timeScale().getVisibleLogicalRange();
  return {movingAverages:[...managedMovingAverages.values()].map(({options})=>({...options})),
   oscillators:[...oscillators.values()].map(group=>({options:{...group.options,settings:{...group.options.settings}},paneIndex:group.paneIndex})),
   paneLines:[...paneLines.entries()].map(([id,series])=>{const paneIndex=chart.panes().findIndex(pane=>pane.getSeries().includes(series));const readout=readoutIndicators.get(id);return {options:{id,color:series.options().color as string,lineWidth:series.options().lineWidth,title:series.options().title,visible:series.options().visible},data:readout?[...readout.values].map(([time,value])=>({time,value})):[],paneIndex}}),
   paneHeights:chart.panes().map((pane,index)=>{const actual=Math.round(pane.getHeight());return actual>=80&&actual<=600?actual:(paneHeightOverrides.get(index)??Math.min(600,Math.max(80,Math.round(host.clientHeight/(chart.panes().length||1)))))}),volumeVisible:!!volume,
   volumePaneIndex:volume?chart.panes().findIndex(pane=>pane.getSeries().includes(volume!)):null,
   displayTimeZone,visibleRange:visibleRange?{from:visibleRange.from,to:visibleRange.to}:null};
 }
 function persistDrawings(){
  if(!drawingScope||!drawingsHydrated||hydratingDrawings||persistenceStatus==="CONFLICT"||persistenceStatus==="UNAVAILABLE")return;
  const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return}
  try{
   if(storage.getItem(key)!==lastPersistedSnapshot){persistenceStatus="CONFLICT";persistenceError="EXTERNAL_CHANGE";return}
   const drawings=drawingSnapshots();
   const envelope=()=>JSON.stringify({schemaVersion:3,account:activeAccount,symbol:drawingScope.symbol,
   timeframe:drawingScope.timeframe,drawings,undoStack,redoStack,...viewSnapshots()});
   let serialized=envelope();
   while(utf8ByteLength(serialized)>persistenceLimit&&undoStack.length){undoStack.shift();serialized=envelope()}
   while(utf8ByteLength(serialized)>persistenceLimit&&redoStack.length){redoStack.shift();serialized=envelope()}
   if(utf8ByteLength(serialized)>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return}
   storage.setItem(key,serialized);lastPersistedSnapshot=serialized;persistenceStatus="READY";persistenceError=null;
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_WRITE_FAILED"}
 }
 function hydrateDrawings(){
  if(!drawingScope){drawingsHydrated=true;persistenceStatus="DISABLED";return}
  if(drawingsHydrated)return;
  drawingsHydrated=true;const storage=localStorageApi(),key=persistenceKey();
  if(!storage||!key){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_UNAVAILABLE";return}
  let raw:string|null,legacy=false;
  try{raw=storage.getItem(key);if(raw===null){raw=storage.getItem(legacyPersistenceKey()!);legacy=raw!==null}}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="STORAGE_READ_FAILED";return}
  lastPersistedSnapshot=legacy?null:raw;
  if(raw===null){persistenceStatus="READY";persistenceError=null;if(drawingCount())persistDrawings();return}
  if(utf8ByteLength(raw)>persistenceLimit){persistenceStatus="UNAVAILABLE";persistenceError="SNAPSHOT_TOO_LARGE";return}
  let parsed:unknown;
  try{parsed=JSON.parse(raw)}catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  if(!parsed||typeof parsed!=="object") {persistenceStatus="UNAVAILABLE";persistenceError="INVALID_SNAPSHOT";return}
  const root=parsed as Record<string,unknown>;
  const schemaKeys=Object.keys(root).sort().join(",");
  if(!root||Array.isArray(parsed)||!new Set(["account,drawings,schemaVersion,symbol,timeframe","account,drawings,redoStack,schemaVersion,symbol,timeframe,undoStack","account,displayTimeZone,drawings,movingAverages,oscillators,paneHeights,paneLines,redoStack,schemaVersion,symbol,timeframe,undoStack,visibleRange,volumePaneIndex,volumeVisible"]).has(schemaKeys)||
   (root.schemaVersion!==1&&root.schemaVersion!==2&&root.schemaVersion!==3)||root.account!==activeAccount||root.symbol!==drawingScope.symbol||root.timeframe!==drawingScope.timeframe||!Array.isArray(root.drawings)||root.drawings.length>maxNativeDrawings){
   persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_MISMATCHED_SNAPSHOT";return;
  }
  const isV2=root.schemaVersion===2||root.schemaVersion===3,isV3=root.schemaVersion===3;
  const restoredUndo:DrawingHistory[]=[],restoredRedo:DrawingHistory[]=[];
  let restoredAverages:MovingAverageOptions[]=[],restoredOscillators:Array<{options:OscillatorOptions;paneIndex:number}>=[],restoredPaneLines:Array<{options:AverageOptions;data:AveragePoint[];paneIndex:number}>=[],restoredPaneHeights:number[]=[],restoredVolume=false,restoredVolumePane:number|null=null,restoredTimeZone="UTC",restoredRange:LogicalRange|null=null;
  if(isV3){
   try{
    if(!Array.isArray(root.movingAverages)||root.movingAverages.length>16||!Array.isArray(root.oscillators)||root.oscillators.length>8||!Array.isArray(root.paneLines)||root.paneLines.length>8||
       !Array.isArray(root.paneHeights)||root.paneHeights.length<1||root.paneHeights.length>10||typeof root.volumeVisible!=="boolean"||
       (root.volumePaneIndex!==null&&(!Number.isInteger(root.volumePaneIndex)||Number(root.volumePaneIndex)<1||Number(root.volumePaneIndex)>=root.paneHeights.length))||
       (root.volumeVisible!==(root.volumePaneIndex!==null))||typeof root.displayTimeZone!=="string")throw Error();
    const savedPaneHeights=root.paneHeights as unknown[];
    restoredAverages=root.movingAverages.map(raw=>{
     if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();const options=raw as Record<string,unknown>;
     const keys=Object.keys(options).sort().join(","),allowed=new Set(["color,displayShift,id,period,source,title,type","color,displayShift,id,lineWidth,period,source,title,type","color,displayShift,id,period,source,title,type,visible","color,displayShift,id,lineWidth,period,source,title,type,visible","color,id,period,source,type","color,id,lineWidth,period,source,type","color,id,period,source,type,visible","color,id,lineWidth,period,source,type,visible","color,id,period,type","color,id,lineWidth,period,type","color,id,period,type,visible","color,id,lineWidth,period,type,visible"]);
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
        !(["rsi","atr","macd","adx","stochastic","stochrsi","cci","momentum","roc"] as unknown[]).includes(options.kind)||(options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth as number))||
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
    if(restoredAverages.length+restoredOscillators.length+restoredPaneLines.length>maxIndicatorInstances||new Set([...restoredAverages.map(item=>item.id),...restoredOscillators.map(item=>item.options.id),...restoredPaneLines.map(item=>item.options.id)]).size!==restoredAverages.length+restoredOscillators.length+restoredPaneLines.length)throw Error();
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
   const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):false;
   if(!expected||((kind!=="FIBO")&&keys!==expected)||options.id!==expectedId||averages.has(expectedId)||paneLines.has(expectedId))throw Error();
   if(kind==="PRICE"){const value=options as unknown as PriceLevelOptions;validatePriceLevel(value);return {kind,options:{...value}}}
   if(kind==="TIME"){const value=options as unknown as TimeMarkerOptions;validateTimeMarker(value,false);return {kind,options:{...value}}}
   if(kind==="TEXT"){const value=options as unknown as TextAnnotationOptions;validateTextAnnotation(value,false);return {kind,options:{...value}}}
   if(kind==="TREND"){const value=options as unknown as TrendLineOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   if(kind==="RECT"){const value=options as unknown as RectangleOptions;validateRectangle(value,false);return {kind,options:{...value}}}
   if(kind==="RAY"){const value=options as unknown as RayOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   if(kind==="CHANNEL"){const value=options as unknown as ChannelOptions;validateChannel(value,false);return {kind,options:{...value}}}
   if(kind==="MEASURE"){const value=options as unknown as MeasurementOptions;validateTrendLine(value,false);return {kind,options:{...value}}}
   const value=normalizeFibonacciOptions(options as unknown as FibonacciOptions,false);return {kind:"FIBO",options:{...value}}
  };
  const parseHistory=(raw:unknown,out:DrawingHistory[])=>{
   if(!Array.isArray(raw)||raw.length>historyLimit)throw Error();
   for(const item of raw){
    if(!item||typeof item!=="object"||Array.isArray(item))throw Error();
    const entry=item as Record<string,unknown>;
    if(Object.keys(entry).sort().join(",")!=="after,before,id"||typeof entry.id!=="string"||!/^[-_a-zA-Z0-9]{1,32}$/.test(entry.id))throw Error();
    const before=parseSnapshot(entry.before,entry.id),after=parseSnapshot(entry.after,entry.id);
    if((before===null&&after===null)||(before&&after&&before.kind!==after.kind))throw Error();
    out.push({id:entry.id,before,after});
   }
  };
  if(isV2){
   try{parseHistory(root.undoStack,restoredUndo);parseHistory(root.redoStack,restoredRedo);if(restoredUndo.length+restoredRedo.length>historyLimit)throw Error()}
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
     const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):false;
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
    }else if(row.kind==="MEASURE"){
     const normalized=options as unknown as MeasurementOptions;validateTrendLine(normalized);snapshots.push({kind:"MEASURE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
    }else if(row.kind==="FIBO"){
     const normalized={id:options.id,startTime:options.startTime,startPrice:options.startPrice,endTime:options.endTime,endPrice:options.endPrice,color:options.color,levels:options.levels,visible:options.visible,locked:options.locked} as FibonacciOptions;
     const validated=normalizeFibonacciOptions(normalized,false);
     if(options.levels===undefined)delete validated.levels;
     snapshots.push({kind:"FIBO",options:{...validated,visible:validated.visible??true,locked:validated.locked??false}});
    }else throw Error();
   }
  }catch(_){persistenceStatus="UNAVAILABLE";persistenceError="INVALID_OR_UNAVAILABLE_DRAWING";return}
  if(isV3){
   const drawingIds=snapshots.map(snapshot=>snapshot.options.id),indicatorIds=[...restoredAverages.map(item=>item.id),...restoredOscillators.map(item=>item.options.id)];
   const paneIds=new Set([...restoredOscillators.map(item=>item.paneIndex),...restoredPaneLines.map(item=>item.paneIndex),...(restoredVolumePane===null?[]:[restoredVolumePane])]);
   if(new Set([...drawingIds,...indicatorIds]).size!==drawingIds.length+indicatorIds.length||
      paneIds.size!==restoredPaneHeights.length-1||Array.from({length:restoredPaneHeights.length-1},(_,i)=>i+1).some(index=>!paneIds.has(index))||
      (restoredAverages.length+restoredOscillators.length>0&&(managedMovingAverages.size>0||oscillators.size>0))){
    persistenceStatus="CONFLICT";persistenceError="VIEW_ALREADY_PRESENT";return;
   }
  }
  hydratingDrawings=true;
  try{
   for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options,false);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options,false);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options,false);else if(snapshot.kind==="RECT")addRectangle(snapshot.options,false);else if(snapshot.kind==="RAY")addRay(snapshot.options,false);else if(snapshot.kind==="CHANNEL")addChannel(snapshot.options,false);else addFibonacci(snapshot.options,false)}
   if(isV3){
    for(const options of restoredAverages)addMovingAverage(options);
    for(const item of restoredOscillators)addOscillator(item.options);
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
    for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();
   for(const item of averages.values())chart.removeSeries(item);averages.clear();managedMovingAverages.clear();
   for(const group of oscillators.values())for(const series of group.series.values())chart.removeSeries(series);oscillators.clear();readoutIndicators.clear();
   for(const series of paneLines.values())chart.removeSeries(series);paneLines.clear();
   if(volume){chart.removeSeries(volume);volume=null}
   undoStack.length=0;redoStack.length=0;persistenceStatus="UNAVAILABLE";persistenceError="RESTORE_FAILED";
  }finally{hydratingDrawings=false}
  if(!isV3||legacy)persistDrawings();
 }
 function selectDrawing(id:string|null){
  selectDrawings(id===null?[]:[id]);
 }
 function markDrawingSelected(id:string,selected:boolean){
  priceLevels.get(id)?.primitive.setSelected(selected);timeMarkers.get(id)?.primitive.setSelected(selected);textAnnotations.get(id)?.primitive.setSelected(selected);trendLines.get(id)?.primitive.setSelected(selected);rectangles.get(id)?.primitive.setSelected(selected);rays.get(id)?.primitive.setSelected(selected);fibonacci.get(id)?.primitive.setSelected(selected);channels.get(id)?.primitive.setSelected(selected);measurements.get(id)?.primitive.setSelected(selected);
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
  const channel=channels.get(id);if(channel)return {kind:"CHANNEL",options:{...channel.options}}
  const measurement=measurements.get(id);if(measurement)return {kind:"MEASURE",options:{...measurement.options}}
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
  const oldChannel=channels.get(id);if(oldChannel){price.detachPrimitive(oldChannel.primitive);channels.delete(id)}
  const oldMeasurement=measurements.get(id);if(oldMeasurement){price.detachPrimitive(oldMeasurement.primitive);measurements.delete(id)}
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
  }else if(snapshot?.kind==="CHANNEL"){
   if(drawingCount()>=maxNativeDrawings)return false;
   const options={...snapshot.options};validateChannel(options,false);
   const primitive=new ChannelPrimitive(id,options);price.attachPrimitive(primitive);channels.set(id,{primitive,options});
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
 function deleteSelectedDrawing(){
  guard();if(!selectedDrawingId)return false;
  if(priceLevels.has(selectedDrawingId))return removePriceLevel(selectedDrawingId);
  if(timeMarkers.has(selectedDrawingId))return removeTimeMarker(selectedDrawingId);
  if(textAnnotations.has(selectedDrawingId))return removeTextAnnotation(selectedDrawingId);
  if(trendLines.has(selectedDrawingId))return removeTrendLine(selectedDrawingId);
  if(rectangles.has(selectedDrawingId))return removeRectangle(selectedDrawingId);
  if(rays.has(selectedDrawingId))return removeRay(selectedDrawingId);
  if(channels.has(selectedDrawingId))return removeChannel(selectedDrawingId);
  if(measurements.has(selectedDrawingId))return removeMeasurement(selectedDrawingId);
  return removeFibonacci(selectedDrawingId);
 }
 function duplicateSelectedDrawing(){
  guard();if(!selectedDrawingId)return null;
  const source=snapshotDrawing(selectedDrawingId);if(!source)return null;
  const base=selectedDrawingId.slice(0,20);let suffix=1,id="";
  do{id=`${base}-copy${suffix++}`}while(priceLevels.has(id)||timeMarkers.has(id)||textAnnotations.has(id)||trendLines.has(id)||rectangles.has(id)||rays.has(id)||fibonacci.has(id)||channels.has(id)||averages.has(id)||paneLines.has(id));
  if(source.kind==="PRICE")addPriceLevel({id,price:source.options.price,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TIME")addTimeMarker({id,time:source.options.time,color:source.options.color,visible:source.options.visible,locked:source.options.locked});
  else if(source.kind==="TEXT")addTextAnnotation({...source.options,id});
  else if(source.kind==="TREND")addTrendLine({...source.options,id});
  else if(source.kind==="RECT")addRectangle({...source.options,id});
  else if(source.kind==="RAY")addRay({...source.options,id});
  else if(source.kind==="CHANNEL")addChannel({...source.options,id});
  else addFibonacci({...source.options,id});
  selectDrawing(id);return id;
 }
 function setCandles(data:readonly Candle[]){
  guard();const next=normalizeCandles(data);finishDrag(true);undoStack.length=0;redoStack.length=0;bars=next;barsByTime=new Map(bars.map(c=>[c.time,c]));
  for(const series of averages.values())series.setData([]);
  for(const series of paneLines.values())series.setData([]);
  for(const group of oscillators.values())for(const series of group.series.values())series.setData([] as never);
  readoutIndicators.clear();price.setData(bars);refreshManagedMovingAverages();refreshDonchianOverlays();
  refreshOscillators();
  if(volume)volume.setData(volumeRows());
  hydrateDrawings();
  if(drawingsHydrated&&persistenceStatus==="READY")persistDrawings();
 }
 function volumeRows(){
  return bars.map(c=>({time:c.time,value:Math.max(0,(c.real_volume??0)>0?c.real_volume!:c.tick_volume??0),
   color:c.close>=c.open?"#4bc3d7":"#dc6987"}));
 }
 function applyAverageData(opts:AverageOptions,data:readonly AveragePoint[]){
  guard();
  if(!opts||!/^[-_a-zA-Z0-9]{1,32}$/.test(opts.id)||!colorPattern.test(opts.color))throw Error("Invalid line options");
  if(averages.size+paneLines.size+oscillators.size+donchianOverlays.size>=maxIndicatorInstances&&!averages.has(opts.id))throw Error("Indicator instance limit");
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
  const values=validSeriesData(data);
  let series=averages.get(opts.id);
  if(!series){series=newLine(opts);averages.set(opts.id,series)}
  else series.applyOptions({color:opts.color,lineWidth:opts.lineWidth??2,
   visible:opts.visible??true,title:opts.title??opts.id});
  series.setData(values);
  readoutIndicators.set(opts.id,{id:opts.id,title:opts.title??opts.id,kind:"OVERLAY",values:new Map(values.map(v=>[v.time,v.value]))});
 }
 function addAverage(opts:AverageOptions,data:readonly AveragePoint[]){managedMovingAverages.delete(opts?.id);applyAverageData(opts,data)}
 function addMovingAverage(options:MovingAverageOptions){
  guard();const calculation=movingAverageData(bars,options),normalized={...options,source:options.source??"close",displayShift:options.displayShift??0};
  applyAverageData({id:options.id,color:options.color,lineWidth:options.lineWidth,visible:options.visible,title:options.title??`${options.type} ${options.period}`},calculation.points);
  managedMovingAverages.set(options.id,{options:normalized,base:new Map(calculation.base.map(point=>[point.time,point.value]))});
  persistDrawings();
 }
 function refreshDonchianOverlays(){
  for(const [id,group] of donchianOverlays){
   const values=donchianData(bars,group.options.period),keys:["upper","middle","lower"]=["upper","middle","lower"];
   for(let i=0;i<3;i++)group.series[i].setData(values[keys[i]]);
   readoutIndicators.set(id,{id,title:group.options.title??`Donchian ${group.options.period}`,kind:"OVERLAY",values:new Map(values.middle.map(point=>[point.time,point.value]))});
  }
 }
 function addDonchian(options:DonchianOptions){
  guard();if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||
   !Number.isInteger(options.period)||options.period<2||options.period>200||
   (options.lineWidth!==undefined&&(!Number.isInteger(options.lineWidth)||options.lineWidth<1||options.lineWidth>4))||
   (options.visible!==undefined&&typeof options.visible!=="boolean"))throw Error("Invalid Donchian configuration");
  if(oscillators.has(options.id)||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||channels.has(options.id)||measurements.has(options.id))throw Error("Duplicate chart object identity");
  if(averages.size+paneLines.size+oscillators.size+donchianOverlays.size>=maxIndicatorInstances&&!donchianOverlays.has(options.id))throw Error("Indicator instance limit");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id))throw Error("Duplicate chart object identity");
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
 function addMeasurement(opts:MeasurementOptions){guard();validateTrendLine(opts,true);if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");const existing=measurements.get(opts.id),options={...opts,visible:opts.visible??existing?.options.visible??true,locked:opts.locked??existing?.options.locked??false};if(existing){const before=snapshotDrawing(opts.id);existing.primitive.set(options);existing.options=options;recordDrawingChange(opts.id,before,snapshotDrawing(opts.id));return}if(drawingCount()>=maxNativeDrawings)throw Error("Native drawing limit");const primitive=new MeasurementPrimitive(opts.id,options,measurementLabel(options));price.attachPrimitive(primitive);measurements.set(opts.id,{primitive,options});recordDrawingChange(opts.id,null,snapshotDrawing(opts.id))}
 function updateMeasurement(id:string,patch:Partial<Pick<MeasurementOptions,"startTime"|"startPrice"|"endTime"|"endPrice"|"color"|"visible"|"locked">>){guard();const item=measurements.get(id);if(!item)throw Error("Unknown measurement");const before=snapshotDrawing(id),options={...item.options,...patch};validateTrendLine(options,patch.startTime!==undefined||patch.endTime!==undefined);const label=measurementLabel(options);item.primitive.set(options);item.primitive.setReadout(label);item.options=options;if(activeDrag?.id!==id)recordDrawingChange(id,before,snapshotDrawing(id))}
 function removeMeasurement(id:string){guard();const item=measurements.get(id);if(!item)return false;const before=snapshotDrawing(id);price.detachPrimitive(item.primitive);measurements.delete(id);if(selectedDrawingIds.has(id))selectDrawings([...selectedDrawingIds].filter(selected=>selected!==id));recordDrawingChange(id,before,null);return true}
 function measurementReadout(id:string){guard();const item=measurements.get(id);return item?measurementReadoutValue(item.options):null}
 function addChannel(opts:ChannelOptions,requireLoadedAnchors=true){
  guard();validateChannel(opts,requireLoadedAnchors);
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||paneLines.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id))throw Error("Duplicate chart object identity");
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
 function drawingPosition(id:string){
  guard();const rect=host.getBoundingClientRect();const priceLevel=priceLevels.get(id);
  if(priceLevel){if(!priceLevel.options.visible)return null;const y=priceLevel.primitive.coordinate();return y===null?null:{x:rect.left+Math.min(40,rect.width/2),y:rect.top+y}}
  const timeMarker=timeMarkers.get(id);if(timeMarker){if(!timeMarker.options.visible)return null;const x=timeMarker.primitive.coordinate();return x===null?null:{x:rect.left+x,y:rect.top+Math.min(40,rect.height/2)}}
  const annotation=textAnnotations.get(id);if(annotation){if(!annotation.options.visible)return null;const point=annotation.primitive.coordinate();return point===null?null:{x:rect.left+point.x+12,y:rect.top+point.y-8}}
  const trend=trendLines.get(id);if(trend){if(!trend.options.visible)return null;const p=trend.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  const zone=rectangles.get(id);if(zone){if(!zone.options.visible)return null;const p=zone.primitive.coordinates();return p===null?null:{x:rect.left+(p.left+p.right)/2,y:rect.top+(p.top+p.bottom)/2}}
  const ray=rays.get(id);if(ray){if(!ray.options.visible)return null;const p=ray.primitive.coordinates();return p===null?null:{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}}
  const fibo=fibonacci.get(id);if(fibo){if(!fibo.options.visible)return null;const p=fibo.primitive.coordinates();if(!p)return null;const level=p.levels.find(item=>item.ratio===0.5);return level?{x:rect.left+(p.x1+p.x2)/2,y:rect.top+level.y}:null}
  const channel=channels.get(id);if(channel){if(!channel.options.visible)return null;const p=channel.primitive.coordinates();return p?{x:rect.left+(p.m1.x+p.m2.x)/2,y:rect.top+(p.m1.y+p.m2.y)/2}:null}
  const measurement=measurements.get(id);if(measurement){if(!measurement.options.visible)return null;const p=measurement.primitive.coordinates();return p?{x:rect.left+(p.x1+p.x2)/2,y:rect.top+(p.y1+p.y2)/2}:null}
  return null;
 }
 function drawingAnchorPosition(id:string,anchor:"START"|"END"|"OFFSET"){
  guard();const trend=trendLines.get(id),zone=rectangles.get(id),ray=rays.get(id),fibo=fibonacci.get(id),measurement=measurements.get(id);
  const channel=channels.get(id)?.options;
  const options=trend?.options??zone?.options??ray?.options??fibo?.options??channel??measurement?.options;
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
  const channel=channels.get(id);if(channel)return {...channel.options};
  const measurement=measurements.get(id);if(measurement)return {...measurement.options};
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
    ...[...channels.values()].map(({options})=>({kind:"CHANNEL" as const,options:{...options}})),
    ...[...measurements.values()].map(({options})=>({kind:"MEASURE" as const,options:{...options}}))];
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
   const expected=kind==="PRICE"?"color,id,locked,price,visible":kind==="TIME"?"color,id,locked,time,visible":kind==="TEXT"?"color,id,locked,price,text,time,visible":kind==="TREND"||kind==="RAY"||kind==="MEASURE"?"color,endPrice,endTime,id,locked,startPrice,startTime,visible":kind==="CHANNEL"?"color,endPrice,endTime,id,locked,offsetPrice,offsetTime,startPrice,startTime,visible":kind==="FIBO"?new Set(["color,endPrice,endTime,id,locked,startPrice,startTime,visible","color,endPrice,endTime,id,levels,locked,startPrice,startTime,visible"]).has(keys):kind==="RECT"?"color,endPrice,endTime,fill,id,locked,startPrice,startTime,visible":"";
   if(!expected||((kind!=="FIBO")&&keys!==expected)||typeof options.id!=="string"||seen.has(options.id)||
    averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||channels.has(options.id)||measurements.has(options.id))throw Error("Invalid or conflicting drawing identity/options");
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
   }else if(kind==="MEASURE"){
    const normalized=options as unknown as MeasurementOptions;validateTrendLine(normalized);snapshots.push({kind:"MEASURE",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }else{
    const normalized=normalizeFibonacciOptions(options as unknown as FibonacciOptions);
    if(options.levels===undefined)delete normalized.levels;
    snapshots.push({kind:"FIBO",options:{...normalized,visible:normalized.visible??true,locked:normalized.locked??false}});
   }
  }
  if(snapshots.length>maxNativeDrawings)throw Error("Native drawing limit");
  hydratingDrawings=true;
  try{for(const snapshot of snapshots){if(snapshot.kind==="PRICE")addPriceLevel(snapshot.options);else if(snapshot.kind==="TIME")addTimeMarker(snapshot.options);else if(snapshot.kind==="TEXT")addTextAnnotation(snapshot.options);else if(snapshot.kind==="TREND")addTrendLine(snapshot.options);else if(snapshot.kind==="RECT")addRectangle(snapshot.options);else if(snapshot.kind==="RAY")addRay(snapshot.options);else if(snapshot.kind==="CHANNEL")addChannel(snapshot.options);else if(snapshot.kind==="MEASURE")addMeasurement(snapshot.options);else addFibonacci(snapshot.options)}}
  catch(error){
   for(const item of priceLevels.values())price.detachPrimitive(item.primitive);priceLevels.clear();
   for(const item of timeMarkers.values())price.detachPrimitive(item.primitive);timeMarkers.clear();
   for(const item of textAnnotations.values())price.detachPrimitive(item.primitive);textAnnotations.clear();
   for(const item of trendLines.values())price.detachPrimitive(item.primitive);trendLines.clear();
   for(const item of rectangles.values())price.detachPrimitive(item.primitive);rectangles.clear();
   for(const item of rays.values())price.detachPrimitive(item.primitive);rays.clear();
   for(const item of fibonacci.values())price.detachPrimitive(item.primitive);fibonacci.clear();
   for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();
   for(const item of measurements.values())price.detachPrimitive(item.primitive);measurements.clear();
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
  const channel=channels.get(id);if(channel){updateChannel(id,{visible});return true}
  if(measurements.has(id)){updateMeasurement(id,{visible});return true}
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
  const channel=channels.get(id);if(channel){updateChannel(id,{locked});return true}
  if(measurements.has(id)){updateMeasurement(id,{locked});return true}
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
  if(oscillators.has(opts.id)||donchianOverlays.has(opts.id)||averages.has(opts.id)||priceLevels.has(opts.id)||timeMarkers.has(opts.id)||textAnnotations.has(opts.id)||trendLines.has(opts.id)||rectangles.has(opts.id)||rays.has(opts.id)||fibonacci.has(opts.id)||channels.has(opts.id)||measurements.has(opts.id))throw Error("Duplicate chart object identity");
  if(averages.size+paneLines.size+oscillators.size+donchianOverlays.size>=maxIndicatorInstances&&!paneLines.has(opts.id))throw Error("Indicator instance limit");
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
 const oscillatorComponents=(kind:OscillatorKind):string[]=>kind==="rsi"?["rsi"]:kind==="atr"?["atr"]:kind==="macd"?["macd","signal","histogram"]:kind==="stochastic"?["stochK","stochD"]:kind==="stochrsi"?["stochRsiK","stochRsiD"]:kind==="cci"?["cci"]:kind==="momentum"?["momentum"]:kind==="roc"?["roc"]:["adx","plusDi","minusDi"];
 const oscillatorTitles=(kind:OscillatorKind):Record<string,string>=>kind==="macd"?{macd:"MACD",signal:"Signal",histogram:"Histogram"}:kind==="adx"?{adx:"ADX",plusDi:"+DI",minusDi:"−DI"}:kind==="stochastic"?{stochK:"%K",stochD:"%D"}:kind==="stochrsi"?{stochRsiK:"StochRSI %K",stochRsiD:"StochRSI %D"}:kind==="cci"?{cci:"CCI"}:kind==="momentum"?{momentum:"Momentum"}:kind==="roc"?{roc:"ROC (%)"}:kind==="rsi"?{rsi:"RSI"}:{atr:"ATR"};
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
 function addOscillator(options:OscillatorOptions){
  guard();if(!options||!/^[-_a-zA-Z0-9]{1,32}$/.test(options.id)||!colorPattern.test(options.color)||!(["rsi","atr","macd","adx","stochastic","stochrsi","cci","momentum","roc"] as string[]).includes(options.kind)||
   (options.lineWidth!==undefined&&![1,2,3,4].includes(options.lineWidth)))throw Error("Invalid oscillator options");
  if(oscillators.has(options.id)||donchianOverlays.has(options.id)||averages.has(options.id)||paneLines.has(options.id)||priceLevels.has(options.id)||timeMarkers.has(options.id)||textAnnotations.has(options.id)||trendLines.has(options.id)||rectangles.has(options.id)||rays.has(options.id)||fibonacci.has(options.id)||channels.has(options.id)||measurements.has(options.id))throw Error("Duplicate chart object identity");
  if(averages.size+paneLines.size+oscillators.size+donchianOverlays.size>=maxIndicatorInstances)throw Error("Indicator instance limit");
  if(paneLines.size+oscillators.size>=8)throw Error("Native pane limit");
  const normalized={...options,settings:{...options.settings}} as OscillatorOptions;
  const calculator=createIncrementalOscillator([],normalized.kind,normalized.settings);
  const group:OscillatorGroup={options:normalized,paneIndex:chart.panes().length,series:new Map(),values:new Map(),calculator};oscillators.set(options.id,group);
  try{const paneIndex=chart.panes().length-1;chart.panes()[paneIndex]?.setHeight(150);paneHeightOverrides.set(paneIndex,150);replaceOscillatorData(group);persistDrawings()}catch(error){oscillators.delete(options.id);for(const series of group.series.values())chart.removeSeries(series);for(const key of oscillatorComponents(normalized.kind))readoutIndicators.delete(normalized.id+":"+key);throw error}
 }
 function updateOscillator(id:string,patch:Partial<Pick<OscillatorOptions,"settings"|"color"|"lineWidth"|"visible"|"title">>){
  guard();const group=oscillators.get(id);if(!group)throw Error("Unknown oscillator");const next={...group.options,...patch,settings:patch.settings?{...patch.settings}:group.options.settings};
  if(!colorPattern.test(next.color)||(next.lineWidth!==undefined&&![1,2,3,4].includes(next.lineWidth)))throw Error("Invalid oscillator style");
  calculateOscillator(bars,next.kind,next.settings);group.options=next;replaceOscillatorData(group);persistDrawings();
 }
 function oscillatorOptions(id:string){guard();const group=oscillators.get(id);return group?{...group.options,settings:{...group.options.settings}}:null}
 function moveOscillator(id:string,paneIndex:number){guard();const group=oscillators.get(id);if(!group||!Number.isInteger(paneIndex)||paneIndex<1||paneIndex>=chart.panes().length)throw Error("Invalid oscillator pane");for(const series of group.series.values())series.moveToPane(paneIndex);group.paneIndex=paneIndex;persistDrawings()}
 function oscillatorPaneLayout(){guard();return chart.panes().map((pane,index)=>({index,titles:pane.getSeries().map(series=>series.options().title)}))}
 function removeOscillator(id:string){guard();const group=oscillators.get(id);if(!group)return false;for(const series of group.series.values())chart.removeSeries(series);for(const key of oscillatorComponents(group.options.kind))readoutIndicators.delete(id+":"+key);oscillators.delete(id);persistDrawings();return true}
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
  if(prev&&c.time<prev.time)throw Error("Cannot update historical bar out of order");
  if((!prev||c.time>prev.time)&&bars.length>=MAX_OSCILLATOR_BARS)throw Error("Chart history limit reached");
  if(prev&&c.time===prev.time)bars[bars.length-1]={...c};
  else bars.push({...c});
  barsByTime.set(c.time,{...c});
  for(const indicator of readoutIndicators.values())indicator.values.delete(c.time);
  price.update(c);if(volume)volume.update(volumeRows()[bars.length-1]);
  for(const [id,state] of managedMovingAverages)updateManagedMovingAverage(id,state);
  refreshDonchianOverlays();
  refreshOscillators(true);
 }
 function removeAverage(id:string){
  guard();const s=averages.get(id);if(!s)return false;
  chart.removeSeries(s);averages.delete(id);managedMovingAverages.delete(id);readoutIndicators.delete(id);return true;
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
  for(const item of fibonacci.values())price.detachPrimitive(item.primitive);fibonacci.clear();
  for(const item of channels.values())price.detachPrimitive(item.primitive);channels.clear();
  for(const item of measurements.values())price.detachPrimitive(item.primitive);measurements.clear();
  for(const item of averages.values())chart.removeSeries(item);
  averages.clear();managedMovingAverages.clear();
  for(const group of donchianOverlays.values())for(const series of group.series)chart.removeSeries(series);
  donchianOverlays.clear();
  for(const group of oscillators.values())for(const series of group.series.values())chart.removeSeries(series);
  oscillators.clear();
  for(const line of paneLines.values())chart.removeSeries(line);
  paneLines.clear();readoutIndicators.clear();if(volume)volume.setData([]);
 }
 function inspect(){guard();return {version:VERSION,account:activeAccount,
  displayTimeZone,
  candleCount:bars.length,lastTime:bars[bars.length-1]?.time??null,
    averageCount:averages.size,nativePaneLines:paneLines.size,oscillatorCount:oscillators.size,oscillatorPaneCount:new Set(Array.from(oscillators.values(),group=>{const series=group.series.values().next().value;return series?chart.panes().findIndex(pane=>pane.getSeries().includes(series)):-1}).filter(index=>index>=0)).size,nativePrimitives:drawingCount(),selectedDrawingId,selectedDrawingIds:[...selectedDrawingIds],hoveredDrawingId,
  paneCount:chart.panes().length,volumeVisible:!!volume,persistenceStatus,persistenceError}}
 function destroy(){if(destroyed)return;finishDrag(true);destroyed=true;host.removeEventListener("pointerdown",onPointerDown,true);host.removeEventListener("pointermove",onPointerMove,true);host.removeEventListener("pointerup",onPointerUp,true);host.removeEventListener("pointercancel",onPointerCancel,true);host.removeEventListener("lostpointercapture",onLostPointerCapture,true);host.removeEventListener("keydown",onKeyDown,true);chart.remove();averages.clear();managedMovingAverages.clear();donchianOverlays.clear();paneLines.clear();oscillators.clear();priceLevels.clear();timeMarkers.clear();textAnnotations.clear();trendLines.clear();rectangles.clear();rays.clear();fibonacci.clear();channels.clear();measurements.clear();readoutIndicators.clear();volume=null;bars=[];barsByTime.clear()}
  return Object.freeze({setCandles,addAverage,addMovingAverage,addDonchian,removeDonchian,movingAverageOptions,moveAverage,removeAverage,selectDrawings,toggleDrawingSelection,setSelectedDrawingsVisible,setSelectedDrawingsLocked,addPriceLevel,updatePriceLevel,removePriceLevel,
  addTimeMarker:(options:TimeMarkerOptions)=>addTimeMarker(options),updateTimeMarker,removeTimeMarker,addTextAnnotation:(options:TextAnnotationOptions)=>addTextAnnotation(options),updateTextAnnotation,removeTextAnnotation,addTrendLine:(options:TrendLineOptions)=>addTrendLine(options),updateTrendLine,removeTrendLine,addRectangle:(options:RectangleOptions)=>addRectangle(options),updateRectangle,removeRectangle,addRay:(options:RayOptions)=>addRay(options),updateRay,removeRay,addFibonacci:(options:FibonacciOptions)=>addFibonacci(options),updateFibonacci,removeFibonacci,fibonacciLevels,addChannel:(options:ChannelOptions)=>addChannel(options),updateChannel,removeChannel,drawingPosition,drawingAnchorPosition,readDrawing,exportDrawings,importDrawings,setDrawingVisible,setDrawingLocked,undo,redo,deleteSelectedDrawing,duplicateSelectedDrawing,
  addMeasurement,updateMeasurement,removeMeasurement,measurementReadout,addPaneLine,movePaneLine,removePaneLine,addOscillator,updateOscillator,removeOscillator,moveOscillator,oscillatorOptions,oscillatorPaneLayout,resizePane,paneHeights,showVolume,visibleLogicalRange,setVisibleLogicalRange,setDisplayTimeZone,displayTimeZone:()=>displayTimeZone,formatTimeLabel:formatDisplayTime,formatCrosshairTime,readDataWindow,
  updateLast,changeAccount,averageOptions,inspect,destroy});
}
