"use strict";
const {strict:assert}=require("node:assert"),fs=require("node:fs"),vm=require("node:vm");
const context={window:{}};
vm.runInNewContext(fs.readFileSync("static/chart-studio-mtf.js","utf8"),context);
const M=context.window.ChartStudioMTF;
assert.ok(M,"ChartStudioMTF closed-bar engine should be exported");
const asOf=Date.UTC(2025,0,8,12)/1000;
function bars(tf,count=280,direction=1){
 const step=M.SECONDS[tf],first=asOf-(count+1)*step;
 return Array.from({length:count},(_,i)=>{
  const close=1800+direction*i*1.3;
  return {time:first+i*step,open:close-1,high:close+3,low:close-2,close,tick_volume:45};
 });
}
for(const tf of ["D1","H4","H1","M15","M5"]){
 const up=M.frame(bars(tf),tf,asOf);
 assert.equal(up.status,"READY",tf);assert.equal(up.bias,"UP",tf);
 assert.equal(up.closedBars,280,tf);assert.equal(up.sourceTime,up.lastClosedBarTime,tf);
 assert.ok(up.lastClosedBarTime+M.SECONDS[tf]<=asOf,tf+" reports only a candle closed by as-of");
 const down=M.frame(bars(tf,280,-1),tf,asOf);assert.equal(down.bias,"DOWN",tf);
 const short=M.frame(bars(tf,180),tf,asOf);assert.equal(short.status,"INSUFFICIENT",tf);assert.equal(short.bias,"UNKNOWN",tf);
}
const input=Object.fromEntries(["D1","H4","H1","M15","M5"].map(tf=>[tf,bars(tf)]));
const all=M.calculate(input,asOf);
assert.equal(all.coverage,5);assert.equal(all.ready,5);assert.equal(all.agreement,"UP");
const missing=M.calculate({...input,M5:undefined},asOf);
assert.equal(missing.coverage,4);assert.equal(missing.ready,4);assert.equal(missing.frames.M5.status,"UNAVAILABLE");
const mixed=M.calculate({...input,H1:bars("H1",280,-1)},asOf);
assert.equal(mixed.agreement,"MIXED_OR_UNKNOWN");
const gapBars=input.H1.filter((_,i)=>i!==100);
const gap=M.frame(gapBars,"H1",asOf);
assert.equal(gap.status,"UNKNOWN");assert.equal(gap.reason,"DATA_GAP");assert.equal(gap.sourceTime,gap.lastClosedBarTime);
const friday=Date.UTC(2025,0,3,12)/1000,mondayAfterWeek=friday+10*86400;
const oldWeek=[-3,-2,-1].map(hours=>({time:friday+hours*3600,open:1,high:3,low:.5,close:2}));
const holidayGap=M.frame([...oldWeek,{time:mondayAfterWeek,open:2,high:3,low:1,close:2}],"H1",mondayAfterWeek+3600);
assert.equal(holidayGap.status,"UNKNOWN");assert.equal(holidayGap.reason,"DATA_GAP","multiweek Friday-to-Monday gaps must not be treated as weekends");
const normalWeekend=M.frame([{time:friday+9*3600,open:1,high:3,low:.5,close:2},{time:friday+57*3600,open:2,high:3,low:1,close:2}],"H1",friday+58*3600);
assert.equal(normalWeekend.status,"INSUFFICIENT","plausible FX weekend closure should not look like a weekday data gap");
const fridayClose=Date.UTC(2025,0,3,21)/1000;
const weekendReadyBars=Array.from({length:279},(_,i)=>{const close=1800+i*.3;return {time:fridayClose-(278-i)*3600,open:close-.2,high:close+.4,low:close-.3,close};});
const mondayOpen=fridayClose+51*3600, mondayClose=1800+279*.3;
weekendReadyBars.push({time:mondayOpen,open:mondayClose-.2,high:mondayClose+.4,low:mondayClose-.3,close:mondayClose});
const weekendReady=M.frame(weekendReadyBars,"H1",mondayOpen+3600);
assert.equal(weekendReady.status,"READY");
assert.equal(weekendReady.dataQuality,"SESSION_HEURISTIC","accepted weekend gaps must not be reported as fully verified coverage");
assert.equal(weekendReady.reason,"CLOSED_BAR_EMA_ALIGNMENT");
const base=M.frame(input.H4,"H4",asOf),future={time:asOf,open:1000000,high:1000010,low:999990,close:1000005};
const protectedFrame=M.frame([...input.H4,future],"H4",asOf);
assert.equal(protectedFrame.sourceTime,base.sourceTime);assert.equal(protectedFrame.ema200,base.ema200);
const beforeHistory=M.frame(input.M15,"M15",asOf-10*86400);
assert.equal(beforeHistory.status,"UNKNOWN");assert.equal(beforeHistory.reason,"HISTORICAL_DATA_UNAVAILABLE");
assert.throws(()=>M.frame([...input.H1.slice(0,100),input.H1[100],input.H1[100],...input.H1.slice(101)],"H1",asOf),/duplicate/i);
assert.throws(()=>M.frame([input.H1[1],input.H1[0]],"H1",asOf),/order/i);
assert.throws(()=>M.frame([{time:1,open:1,high:2,low:3,close:4}],"H1",asOf),/candle/i);
assert.throws(()=>M.frame(input.H1,"H2",asOf),/timeframe/i);
assert.throws(()=>M.frame(input.H1,"H1",NaN),/as.of/i);
console.log("PASS MTF five-frame closed-bar EMA, unavailable/warmup states, source times, no-lookahead and strict input validation");
