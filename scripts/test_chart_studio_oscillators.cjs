"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("static/chart-studio-oscillators.js","utf8");
const window={};vm.runInNewContext(source,{window},{filename:"chart-studio-oscillators.js"});
const api=window.ChartStudioOscillators;
const rsi={id:"osc1",kind:"rsi",period:14,color:"#e8bb72",lineWidth:2,visible:true,label:"Swing"};
const macd={id:"osc2",kind:"macd",fast:12,slow:26,signal:9,color:"#54cee9",lineWidth:3,visible:true,label:""};
const atr={id:"osc3",kind:"atr",period:21,color:"#a995ff",lineWidth:2,visible:false,label:"Range"};
const adx={id:"osc4",kind:"adx",period:14,color:"#63dfb6",lineWidth:1,visible:true,label:"ADX Trend"};
assert.equal(api.normalizeList([rsi,macd,atr,adx]).length,4);
assert.equal(api.normalizeList([]).length,0);
assert.equal(api.normalizeList([rsi,rsi]),null);
assert.equal(api.normalizeList(Array.from({length:9},(_,i)=>({...rsi,id:"osc"+i}))),null);
for(const entry of [
 {...rsi,period:1},{...rsi,period:201},{...rsi,period:10.2},
 {...rsi,visible:1},{...rsi,color:"red"},{...rsi,lineWidth:5},
 {...rsi,label:"x".repeat(41)},{...rsi,onload:"alert(1)"},
 {...rsi,id:"../../bad"},{...rsi,kind:"volume"},
 {...macd,fast:40,slow:26},{...macd,signal:0},{...macd,slow:301},
 {...macd,period:14}
])assert.equal(api.normalize(entry),null,JSON.stringify(entry));
assert.equal(api.normalize({...macd,color:"#ABCDEF"}).color,"#abcdef");
assert.equal(source.includes("order_send("),false);
assert.equal(source.includes("/api/modify_position"),false);
console.log("PASS Chart Studio RSI/MACD/ATR/ADX instance whitelist, caps, MACD order and no broker writes");
