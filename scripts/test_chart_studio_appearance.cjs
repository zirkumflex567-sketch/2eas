"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const source=fs.readFileSync("static/chart-studio-appearance.js","utf8");
const context={window:{},console};
vm.runInNewContext(source,context,{filename:"chart-studio-appearance.js"});
const api=context.window.ChartStudioAppearance;
const base=api.normalize({});
assert.equal(base.theme,"inherit");
assert.equal(base.grid,true);
assert.equal(base.crosshair,true);
assert.equal(base.scale,"normal");
const custom=api.normalize({...base,theme:"dark",scale:"logarithmic",
 upColor:"#44FFAA",downColor:"#AA1122",grid:false,crosshair:false,
 wickVisible:false,borderVisible:false,lastPriceVisible:false});
assert.equal(custom.theme,"dark");
assert.equal(custom.scale,"logarithmic");
assert.equal(custom.upColor,"#44ffaa");
assert.equal(custom.downColor,"#aa1122");
for(const invalid of [
 {...base,scale:"symlog"},{...base,theme:"javascript:alert(1)"},
 {...base,upColor:"blue"},{...base,downColor:"#ff"},
 {...base,grid:"true"},{...base,crosshair:1},{...base,lastPriceVisible:null},
 {...base,scale:"logarithmic",unsafeProperty:"!"},
 []]){
 assert.equal(api.normalize(invalid),null);
}
assert.equal(source.includes("order_send("),false);
assert.equal(source.includes("/api/modify_position"),false);
console.log("PASS Chart Studio appearance whitelist, colors, scale, boolean fields and read-only contract");
