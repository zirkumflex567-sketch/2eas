/* Chart Studio read-only multi-timeframe confluence computation.
 * Every calculation uses fully closed candles at a caller-supplied as-of timestamp.
 * No MT5 calls, no orders, no future-bar data, no signal automation.
 */
(()=>{"use strict";
const SECONDS=Object.freeze({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400});
const GROUPS=Object.freeze(["D1","H4","H1","M15","M5"]);
function normalize(raw,tf,asOf){
 const step=SECONDS[tf];
 if(!step||!Number.isSafeInteger(asOf)||asOf<=0)throw Error("Invalid as-of / timeframe");
 if(!Array.isArray(raw)||raw.length>20000)throw Error("Invalid candle buffer");
 const seen=new Set(),rows=[];
 for(const c of raw){
  if(!c||!Number.isSafeInteger(c.time)||c.time<=0||
   !["open","high","low","close"].every(k=>Number.isFinite(c[k])&&c[k]>0)||
   c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high))
    throw Error("Invalid OHLC candle");
  if(seen.has(c.time))throw Error("Duplicate candle timestamp");
  seen.add(c.time);
  // Full candle must have closed at or before shared as-of timestamp.
  if(c.time+step<=asOf)rows.push({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close});
 }
 rows.sort((a,b)=>a.time-b.time);
 return rows.slice(-2000);
}
function ema(series,n){
 const alpha=2/(n+1);let value=null;
 const output=[];
 for(const p of series){
  value=value===null?p.close:value+alpha*(p.close-value);
  output.push(value);
 }
 return output;
}
function frame(input,tf,asOf){
 const candles=normalize(input,tf,asOf),n=candles.length;
 const result={tf,asOf,closedBars:n,lastClosedBarTime:n?candles[n-1].time:null,
  status:"INSUFFICIENT",bias:"UNKNOWN",lastClose:null,ema21:null,ema50:null,ema200:null};
 if(n<201)return result;
 const a=ema(candles,21),b=ema(candles,50),c=ema(candles,200);
 const idx=n-1,price=candles[idx].close,e21=a[idx],e50=b[idx],e200=c[idx];
 let bias="SIDEWAYS";
 if(price>e21&&e21>e50&&e50>e200&&e21>a[idx-1])bias="UP";
 if(price<e21&&e21<e50&&e50<e200&&e21<a[idx-1])bias="DOWN";
 return {...result,status:"READY",bias,lastClose:price,
  ema21:e21,ema50:e50,ema200:e200};
}
function calculate(input,asOf){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Invalid timeframe set");
 const results={};
 for(const tf of GROUPS)if(Object.hasOwn(input,tf))results[tf]=frame(input[tf],tf,asOf);
 const ready=Object.values(results).filter(v=>v.status==="READY");
 const up=ready.filter(v=>v.bias==="UP").length,down=ready.filter(v=>v.bias==="DOWN").length;
 return {asOf,frames:results,ready:ready.length,coverage:Object.keys(results).length,
  agreement:ready.length>=2&&up===ready.length?"UP":
    ready.length>=2&&down===ready.length?"DOWN":"MIXED_OR_UNKNOWN",
  note:"Nur EMA-Struktur auf bereits geschlossenen Brokerkerzen; kein Handelssignal."};
}
window.ChartStudioMTF=Object.freeze({SECONDS,GROUPS,normalize,frame,calculate});
})();