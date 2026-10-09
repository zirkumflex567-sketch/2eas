"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync("static/chart-studio-data-signature.js","utf8");
const ctx={window:{}};vm.runInNewContext(src,ctx,{filename:"chart-studio-data-signature.js"});
const sig=ctx.window.ChartStudioDataSignature.signature;
const base=1700000000;
const bars=Array.from({length:150},(_,i)=>({
 time:base+i*900,open:4100+i,high:4103+i,low:4098+i,close:4101+i,
 tick_volume:200+i,real_volume:0
}));
const initial=sig(bars);
assert.equal(typeof initial,"string");
assert.equal(sig(JSON.parse(JSON.stringify(bars))),initial,"equal bar values must match");
for(const key of ["time","open","high","low","close","tick_volume","real_volume"]){
 const changed=JSON.parse(JSON.stringify(bars));
 changed[65][key]+=1;
 assert.notEqual(sig(changed),initial,"Middle-bar "+key+" changes must invalidate cache");
}
assert.notEqual(sig(bars.slice(1)),initial);
assert.notEqual(sig([...bars,{...bars.at(-1),time:bars.at(-1).time+900}]),initial);
assert.equal(sig(null),null);
assert.equal(sig([null]),null);
assert.equal(sig([{...bars[0],close:NaN}]),null);
assert.equal(sig([{...bars[0],open:Infinity}]),null);
assert.equal(sig([{...bars[0],tick_volume:undefined}]),
 sig([{...bars[0],tick_volume:0}]),"optional missing volume is zero");
assert.equal(src.includes("order_send("),false);
console.log("PASS stable whole-history OHLCV fingerprint, middle corrections, identical polling and invalid input");
