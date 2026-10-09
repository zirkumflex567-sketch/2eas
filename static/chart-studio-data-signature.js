/* Chart Studio stable OHLCV content fingerprint.
 * Efficiently identifies identical candle snapshots, including corrections to
 * older bars; avoids false cache hits from comparing only first/last candle.
 * Not cryptographic and never used for broker order authorization.
 */
(()=>{
"use strict";
const FIELDS=Object.freeze(["time","open","high","low","close","tick_volume","real_volume"]);
const buffer=new ArrayBuffer(8),view=new DataView(buffer);
function signature(candles){
 if(!Array.isArray(candles))return null;
 let a=2166136261,b=0x9e3779b9;
 function write(value){
  // Missing optional broker volume fields mean zero (v4 price fixtures).
  const n=Number(value??0);
  if(!Number.isFinite(n))return false;
  view.setFloat64(0,n,false);
  for(let i=0;i<8;i++){
   const octet=view.getUint8(i);
   a=Math.imul(a^octet,16777619)>>>0;
   b=Math.imul(b^octet,2246822519)>>>0;
  }
  return true;
 }
 if(!write(candles.length))return null;
 for(const bar of candles){
  if(!bar||typeof bar!=="object")return null;
  for(const field of FIELDS){
   if(!write(bar[field]))return null;
  }
 }
 return candles.length.toString(16)+":"+a.toString(16)+":"+b.toString(16);
}
window.ChartStudioDataSignature=Object.freeze({signature,FIELDS});
})();
