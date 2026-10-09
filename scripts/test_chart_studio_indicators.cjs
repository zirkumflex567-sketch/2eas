"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const src=fs.readFileSync("static/chart-studio-indicators.js","utf8");
const window={};vm.runInNewContext(src,{window,document:{},localStorage:{},console},{filename:"chart-studio-indicators.js"});
const math=window.ChartStudioIndicators.math;
const ascending=Array.from({length:100},(_,i)=>({time:1700000000+i*900,open:100+i,high:103+i,low:98+i,close:101+i,tick_volume:1000+i,real_volume:0}));
function near(actual,want,epsilon=.001){assert.ok(Math.abs(actual-want)<epsilon,actual+" != "+want)}
// Wilder RSI: continuous upward closes should converge to 100, without lookahead.
const bullish=math.rsi(ascending,14);
assert.equal(bullish.length,86);
near(bullish[0].value,100);near(bullish.at(-1).value,100);
const flat=ascending.map(c=>({...c,close:42,open:42,high:44,low:40}));
const neutral=math.rsi(flat,14);
near(neutral[0].value,50);
const falling=ascending.map((c,i)=>({...c,close:300-i}));
near(math.rsi(falling,14)[0].value,0);
const atr=math.atr(ascending,14);
assert.equal(atr.length,87);near(atr[0].value,5);
const macd=math.macd(ascending,12,26,9);
assert.equal(macd.macd.length,75);
assert.equal(macd.signal.length,67);
assert.equal(macd.histogram.length,67);
assert.ok(macd.macd[0].value>0);
const vol=math.volumes(ascending);
assert.equal(vol.length,100);assert.equal(vol[0].value,1000);assert.equal(vol[0].kind,"tick");
const real=math.volumes([{...ascending[0],real_volume:450}]);
assert.equal(real[0].value,450);assert.equal(real[0].kind,"real");
assert.equal(math.rsi(ascending.slice(0,12),14).length,0);
assert.equal(math.atr(ascending.slice(0,5),14).length,0);
assert.equal(math.macd(ascending,30,20,9).macd.length,0);
assert.ok(src.includes("state.bars.map(bar=>byTime.get(bar.time)||{time:bar.time})"));
assert.ok(!src.includes("order_send(")&&!src.includes("/api/modify_position"));

// Wilder ADX: monotonic rising market gives +DI > 0, -DI = 0,
// initial ADX at index 2*period-1; no future bars read.
const adx=math.adx(ascending,14);
assert.equal(adx.plusDi.length,86);
assert.equal(adx.minusDi.length,86);
assert.equal(adx.adx.length,73);
near(adx.adx[0].value,100,1e-6);
assert.ok(adx.plusDi[0].value>0);
near(adx.minusDi[0].value,0);
const flatAdx=math.adx(Array.from({length:70},(_,i)=>({
 time:1700000000+i*900,open:100,high:100,low:100,close:100,
 tick_volume:3,real_volume:0})),14);
near(flatAdx.adx[0].value,0);
assert.equal(math.adx(ascending.slice(0,13),14).adx.length,0);
// VWAP uses typical price weighted by real volume where available,
// otherwise tick volume, resets at UTC day boundary, and ignores empty volume.
const midnight=1700000000-(1700000000%86400);
const weighted=[
 {time:midnight+1,open:10,high:12,low:8,close:10,tick_volume:1,real_volume:0},
 {time:midnight+2,open:20,high:22,low:18,close:20,tick_volume:3,real_volume:0},
 {time:midnight+3,open:30,high:32,low:28,close:30,tick_volume:1,real_volume:5},
 {time:midnight+4,open:40,high:42,low:38,close:40,tick_volume:0,real_volume:0},
 {time:midnight+86400+1,open:50,high:52,low:48,close:50,tick_volume:2,real_volume:0}
];
const vw=math.vwap(weighted);
assert.equal(vw.length,4);
near(vw[0].value,10);
near(vw[1].value,17.5);
near(vw[2].value,(10+20*3+30*5)/9);
near(vw[3].value,50);
assert.ok(src.includes("Tick-/Realvolumenproxy"));

console.log("PASS Chart Studio RSI/ATR/MACD/ADX/VWAP and broker volume math, warm-up, time alignment, read-only checks");
