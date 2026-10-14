"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("static/chart-studio-chart-types.js","utf8");
const window={};vm.runInNewContext(source,{window},{filename:"chart-studio-chart-types.js"});
const api=window.ChartStudioChartTypes;
assert.deepEqual(Array.from(api.TYPES),["candles","hollow","heikin","bars","line","area"]);
for(const type of ["candles","hollow","heikin","bars","line","area"])assert.equal(api.valid(type),true);
for(const bad of ["",null,{},true,0,"CANDLES","heikinashi","javascript:alert(1)"])
 assert.equal(api.valid(bad),false);
assert.equal(api.current(),"candles");
assert.equal(api.applySettings("line"),false); // no chart mounted
assert.equal(source.includes("order_send("),false);
assert.equal(source.includes("/api/modify_position"),false);
console.log("PASS Chart Studio chart types whitelist and read-only contract");
