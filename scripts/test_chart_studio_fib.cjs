"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const context={window:{}};vm.runInNewContext(fs.readFileSync("static/chart-studio-fib.js","utf8"),context);
const fib=context.window.ChartStudioFib;
const safe=fib.parsePercent("0; 23,6; 38,2; 50; 61,8; 78,6; 100; 161,8");
assert.equal(safe.length,8);
const expected=[0,.236,.382,.5,.618,.786,1,1.618];
safe.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
assert.equal(fib.display(safe),"0; 23,6; 38,2; 50; 61,8; 78,6; 100; 161,8");
const extensions=fib.parsePercent("-50; 0; 25; 100; 261,8");
[-.5,0,.25,1,2.618].forEach((value,index)=>assert.ok(Math.abs(extensions[index]-value)<1e-10));
assert.equal(fib.display(extensions),"-50; 0; 25; 100; 261,8");
const endpoints=[-10,0,10],roundTrip=fib.parsePercent(fib.display(endpoints));
assert.ok(roundTrip&&roundTrip.every((value,index)=>Math.abs(value-endpoints[index])<1e-10),"Displayed endpoint levels must round-trip through the editor");
for(const bad of ["","0;0","50; 40","-1100; 20","0; 1100","0; test", "0,"+"1;".repeat(20)]){
 assert.equal(fib.parsePercent(bad),null,bad);
}
for(const bad of [[.5,.5],[1,0],[-11],[10.1],[0,false],[0,NaN],[],Array(17).fill(0)]){
 assert.equal(fib.normalizeLevels(bad),null,JSON.stringify(bad));
}
assert.equal(fib.normalizeLevels([0,.5,1]).length,3);
console.log("PASS Fibonacci percent parser, -1000–1000 bounds, ascending/unique, 16-level maximum");
