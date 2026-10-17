/* Chart Studio v4 beta: pure geometries and candle-price magnetic snapping.
 * Render-only. No broker access, currency conversion, or future-candle inference.
 */
(()=>{
"use strict";
const COUNTS=Object.freeze({horizontal:1,vertical:1,text:1,trend:2,rect:2,fib:2,fibfan:2,fibtime:2,ray:2,ruler:2,channel:3});
function expected(kind){return Object.hasOwn(COUNTS,kind)?COUNTS[kind]:0}
function validPoint(p){
 return !!p&&Number.isInteger(p.time)&&p.time>0&&p.time<=7258118400&&
 typeof p.price==="number"&&Number.isFinite(p.price)&&p.price>0;
}
function validDrawing(o){
 return !!o&&typeof o.kind==="string"&&expected(o.kind)>0&&
 Array.isArray(o.anchors)&&o.anchors.length===expected(o.kind)&&
 o.anchors.every(validPoint)&&!(o.kind==="fibtime"&&o.anchors[0].time===o.anchors[1].time);
}
function clipRay(a,b,limit){
 if(!a||!b||![a.x,a.y,b.x,b.y,limit].every(Number.isFinite)||limit<=0)return null;
 if(Math.abs(b.x-a.x)<1e-7)return [{x:a.x,y:a.y},{x:a.x,y:b.y}];
 const dir=b.x>=a.x?1:-1,target=dir>0?limit:0;
 const slope=(b.y-a.y)/(b.x-a.x);
 return [a,{x:target,y:a.y+slope*(target-a.x)}];
}
function fibonacciFanRays(start,end,limit,ratios=[.382,.5,.618]){
 if(!start||!end||![start.x,start.y,end.x,end.y,limit].every(Number.isFinite)||limit<=0||
  !Array.isArray(ratios)||!ratios.length||ratios.length>16)return null;
 let previous=0;
 const result=[];
 for(const ratio of ratios){
  if(!Number.isFinite(ratio)||ratio<=previous||ratio>=1)return null;
  const target={x:end.x,y:start.y+(end.y-start.y)*ratio};
  const points=clipRay(start,target,limit);if(!points)return null;
  result.push({ratio,points});previous=ratio;
 }
 return result;
}
function fibonacciTimeZones(start,end,limit,factors=[0,1,2,3,5,8,13,21,34,55]){
 if(!start||!end||![start.x,start.y,end.x,end.y,limit].every(Number.isFinite)||limit<=0||
  Math.abs(end.x-start.x)<1e-7||!Array.isArray(factors)||!factors.length||factors.length>32||factors[0]!==0)return null;
 let previous=-1;
 const result=[];
 for(const factor of factors){
  if(!Number.isInteger(factor)||factor<=previous||factor>1000)return null;
  const x=start.x+(end.x-start.x)*factor;
  if(x>=0&&x<=limit)result.push({factor,x});
  previous=factor;
 }
 return result;
}
function parallelChannel(a,b,c){
 if(!a||!b||!c||![a.x,a.y,b.x,b.y,c.x,c.y].every(Number.isFinite))return null;
 // Offset is in price/pixel (vertical) space; anchor C defines the parallel boundary.
 const slope=Math.abs(b.x-a.x)<1e-7?0:(b.y-a.y)/(b.x-a.x);
 const shift=c.y-(a.y+slope*(c.x-a.x));
 return {first:[a,b],second:[{x:a.x,y:a.y+shift},{x:b.x,y:b.y+shift}],
  shift,mid:[{x:a.x,y:a.y+shift/2},{x:b.x,y:b.y+shift/2}]};
}
function measure(first,second,tfSeconds){
 if(!validPoint(first)||!validPoint(second))return null;
 const delta=second.price-first.price;
 const ratio=delta/first.price*100;
 const seconds=second.time-first.time;
 const bars=Number.isFinite(tfSeconds)&&tfSeconds>0?Math.round(seconds/tfSeconds):null;
 return {delta,percent:ratio,seconds,bars};
}
function nearestSnap(anchor,bars,toX,toY,maxPixels=12){
 if(!validPoint(anchor)||!Array.isArray(bars)||!bars.length||
 typeof toX!=="function"||typeof toY!=="function"||!Number.isFinite(maxPixels)||maxPixels<=0)return null;
 const originX=toX(anchor.time),originY=toY(anchor.price);
 if(!Number.isFinite(originX)||!Number.isFinite(originY))return null;
 // O(N), bounded by the existing candle API pagination; no look-ahead:
 // only currently loaded candles and their historically known OHLC.
 let result=null,bestDistance=maxPixels;
 for(const bar of bars){
  if(!bar||!Number.isInteger(bar.time))continue;
  const x=toX(bar.time);
  if(!Number.isFinite(x)||Math.abs(x-originX)>maxPixels)continue;
  for(const field of ["open","high","low","close"]){
   const price=bar[field],y=toY(price);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(y))continue;
   const distance=Math.hypot((x-originX)*0.4,y-originY);
   if(distance<bestDistance){
    bestDistance=distance;result={time:bar.time,price,field};
   }
  }
 }
 return result;
}
window.ChartStudioDrawingGeometry=Object.freeze({
 counts:COUNTS,expected,validPoint,validDrawing,clipRay,fibonacciFanRays,fibonacciTimeZones,parallelChannel,measure,nearestSnap
});
})();
