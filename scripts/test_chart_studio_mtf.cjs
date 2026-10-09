"use strict";
const {strict:assert}=require("node:assert"),fs=require("node:fs"),vm=require("node:vm");
const context={window:{}};vm.runInNewContext(fs.readFileSync("static/chart-studio-mtf.js","utf8"),context);
const M=context.window.ChartStudioMTF;
const asOf=1800000000;
function bars(tf,count=280,dir=1){
 const step=M.SECONDS[tf];
 const first=asOf-400*step;
 return Array.from({length:count},(_,i)=>{const price=1800+dir*i*1.3;
  return {time:first+i*step,open:price,high:price+3,low:price-2,close:price+1,tick_volume:45};
 });
}
for(const tf of ["D1","H4","H1","M15","M5"]){
 const data=bars(tf);
 const f=M.frame(data,tf,asOf);
 assert.equal(f.status,"READY",tf);assert.equal(f.bias,"UP",tf);
 assert.equal(f.closedBars,280,tf);
 assert.ok(f.lastClosedBarTime+M.SECONDS[tf]<=asOf);
 const fall=M.frame(bars(tf,280,-1),tf,asOf);
 assert.equal(fall.status,"READY");assert.equal(fall.bias,"DOWN");
 const few=M.frame(data.slice(0,180),tf,asOf);
 assert.equal(few.status,"INSUFFICIENT");assert.equal(few.bias,"UNKNOWN");
}
const stack={D1:bars("D1"),H4:bars("H4"),H1:bars("H1")};
const all=M.calculate(stack,asOf);
assert.equal(all.agreement,"UP");assert.equal(all.ready,3);assert.equal(all.coverage,3);
const mixed=M.calculate({...stack,H1:bars("H1",280,-1)},asOf);
assert.equal(mixed.agreement,"MIXED_OR_UNKNOWN");
// Prove a future-inserted giant price cannot alter the as-of EMA or last candle.
const basic=M.frame(stack.H1,"H1",asOf);
const future={time:asOf,open:1000000,high:1000010,low:999990,close:1000005};
const protectedFrame=M.frame([...stack.H1,future],"H1",asOf);
assert.equal(protectedFrame.lastClosedBarTime,basic.lastClosedBarTime);
assert.equal(protectedFrame.ema200,basic.ema200);
assert.equal(protectedFrame.closedBars,basic.closedBars);
for(const bad of [[...stack.H1,stack.H1[0]], [{time:1,open:1,high:2,low:3,close:4}]]){
 assert.throws(()=>M.frame(bad,"H1",asOf));
}
assert.throws(()=>M.frame(stack.H1,"H2",asOf));
assert.throws(()=>M.frame(stack.H1,"H1",NaN));
console.log("PASS MTF closed-bar EMA21/50/200, trends, warmup, disagreement and future-data rejection");
