"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const context={window:{}};vm.runInNewContext(fs.readFileSync("static/chart-studio-fib.js","utf8"),context);
const fib=context.window.ChartStudioFib;
const safe=fib.parsePercent("0; 23,6; 38,2; 50; 61,8; 78,6; 100; 161,8");
assert.equal(safe.length,8);
const expected=[0,.236,.382,.5,.618,.786,1,1.618];
safe.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
assert.equal(fib.display(safe),"0; 23,6; 38,2; 50; 61,8; 78,6; 100; 161,8");
for(const bad of ["","0;0","50; 40","-10; 20","0; 250","0; test", "0,"+"1;".repeat(20)]){
 assert.equal(fib.parsePercent(bad),null,bad);
}
for(const bad of [[.5,.5],[1,0],[-.1],[2.1],[0,false],[0,NaN],[],Array(17).fill(0)]){
 assert.equal(fib.normalizeLevels(bad),null,JSON.stringify(bad));
}
assert.equal(fib.normalizeLevels([0,.5,1]).length,3);
console.log("PASS Fibonacci percent parser, 0–200 bounds, ascending/unique, 16-level maximum");
