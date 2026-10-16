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
const supertrendBars=Array.from({length:12},(_,i)=>{const close=i<10?100:110+i;return {time:1700050000+i*60,open:close,high:close+(i<10?1:2),low:close-(i<10?1:2),close}});
const supertrend=math.supertrend(supertrendBars,10,3);
assert.equal(supertrend.length,3,"Supertrend begins only once Wilder ATR has a complete lookback");
assert.equal(supertrend[0].time,supertrendBars[9].time);
assert.equal(supertrend[0].trend,"DOWN","Initial direction stays down until price crosses the final upper band");
assert.equal(supertrend[1].trend,"UP","A close above the final upper band flips the overlay up");
assert.ok(supertrend.every(point=>Number.isFinite(point.value)&&/^#[0-9a-f]{6}$/i.test(point.color)));
assert.equal(math.supertrend(supertrendBars,1,3).length,0);
assert.equal(math.supertrend(supertrendBars,10,0).length,0);
assert.equal(math.supertrend(supertrendBars,10,10.1).length,0);
const flatSupertrend=math.supertrend(supertrendBars.map(bar=>({...bar,open:5,high:6,low:4,close:5})),2,3);
assert.ok(flatSupertrend.every(point=>Number.isFinite(point.value)));
const donchianBars=[
 {time:1700060000,open:5,high:10,low:0,close:5},
 {time:1700060060,open:6,high:11,low:1,close:6},
 {time:1700060120,open:7,high:12,low:2,close:7},
 {time:1700060180,open:8,high:13,low:3,close:8}
];
const donchian=math.donchian(donchianBars,3);
assert.deepEqual(Array.from(donchian.upper,point=>point.value),[12,13]);
assert.deepEqual(Array.from(donchian.middle,point=>point.value),[6,7]);
assert.deepEqual(Array.from(donchian.lower,point=>point.value),[0,1]);
assert.equal(donchian.upper[0].time,donchianBars[2].time,"Donchian values start only after the complete lookback");
assert.equal(math.donchian(donchianBars.slice(0,2),3).upper.length,0);
assert.equal(math.donchian(donchianBars,1).upper.length,0);
assert.equal(math.donchian(donchianBars,201).upper.length,0);
assert.equal(math.donchian(donchianBars,2.5).upper.length,0);
assert.equal(window.ChartStudioIndicators.calculate("donchian",donchianBars,{period:3}).donchian.lower.length,2);
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"donchian"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().donchian)),{enabled:false,period:20});
const macd=math.macd(ascending,12,26,9);
assert.equal(macd.macd.length,75);
assert.equal(macd.signal.length,67);
assert.equal(macd.histogram.length,67);
assert.ok(macd.macd[0].value>0);
const vol=math.volumes(ascending);
assert.equal(vol.length,100);assert.equal(vol[0].value,1000);assert.equal(vol[0].kind,"tick");
const customVolume=math.volumes(ascending,{upColor:"#112233",downColor:"#445566"});
assert.equal(customVolume[0].color,"#112233");
const customDown=math.volumes([{...ascending[0],close:99}],{upColor:"#112233",downColor:"#445566"});
assert.equal(customDown[0].color,"#445566");
const safeVolume=math.volumes(ascending,{upColor:"red",downColor:"url(javascript:1)"});
assert.ok(safeVolume.every(row=>/^#[0-9a-f]{6}$/i.test(row.color)));
const real=math.volumes([{...ascending[0],real_volume:450}]);
assert.equal(real[0].value,450);assert.equal(real[0].kind,"real");
assert.equal(math.rsi(ascending.slice(0,12),14).length,0);
assert.equal(math.atr(ascending.slice(0,5),14).length,0);
assert.equal(math.macd(ascending,30,20,9).macd.length,0);
const stochasticBars=[
 {time:1700100000,open:5,high:10,low:0,close:5},
 {time:1700100060,open:8,high:11,low:1,close:9},
 {time:1700100120,open:6,high:12,low:2,close:6},
 {time:1700100180,open:11,high:13,low:3,close:12},
 {time:1700100240,open:8,high:14,low:4,close:8}
];
const stochastic=math.stochastic(stochasticBars,3,2,2);
assert.equal(stochastic.stochK.length,2);
assert.equal(stochastic.stochD.length,1);
near(stochastic.stochK[0].value,((6-0)/(12-0)*100+(12-1)/(13-1)*100)/2);
near(stochastic.stochD[0].value,(stochastic.stochK[0].value+stochastic.stochK[1].value)/2);
assert.equal(stochastic.stochK[0].time,stochasticBars[3].time);
assert.equal(math.stochastic(stochasticBars.slice(0,3),3,2,2).stochD.length,0);
const flatStochastic=math.stochastic(Array.from({length:8},(_,i)=>({time:1700200000+i*60,open:5,high:5,low:5,close:5})),3,2,2);
assert.ok(flatStochastic.stochK.every(point=>point.value===50));
assert.ok(flatStochastic.stochD.every(point=>point.value===50));
assert.equal(math.stochastic(stochasticBars,0,2,2).stochK.length,0);
const cciBars=[1,2,3,4,5].map((value,index)=>({time:1700300000+index*60,open:value,high:value,low:value,close:value}));
const cci=math.cci(cciBars,3);
assert.deepEqual(Array.from(cci,point=>point.time),cciBars.slice(2).map(bar=>bar.time));
near(cci[0].value,100,1e-9);
near(cci[1].value,100,1e-9);
const flatCci=math.cci(cciBars.map(bar=>({...bar,open:7,high:7,low:7,close:7})),3);
assert.ok(flatCci.every(point=>point.value===0));
assert.equal(math.cci(cciBars.slice(0,2),3).length,0);
assert.equal(math.cci(cciBars,1).length,0);
assert.equal(math.cci(cciBars,2.5).length,0);
assert.equal(math.cci(cciBars,201).length,0);
assert.equal(window.ChartStudioIndicators.calculate("cci",cciBars,{period:0}).cci.length,0);
const momentumBars=[0,1,2,3,6].map((close,index)=>({time:1700400000+index*60,open:close,high:close+1,low:close-1,close}));
const momentum=math.momentum(momentumBars,2),roc=math.roc(momentumBars,2);
assert.deepEqual(Array.from(momentum,point=>point.time),momentumBars.slice(2).map(bar=>bar.time));
assert.deepEqual(Array.from(momentum,point=>point.value),[2,2,4]);
assert.deepEqual(Array.from(roc,point=>point.time),momentumBars.slice(3).map(bar=>bar.time));
near(roc[0].value,200);near(roc[1].value,200);
assert.equal(math.momentum(momentumBars.slice(0,2),2).length,0);
assert.equal(math.roc(momentumBars.slice(0,2),2).length,0);
assert.equal(math.momentum(momentumBars,1).length,0);
assert.equal(math.roc(momentumBars,201).length,0);
assert.equal(window.ChartStudioIndicators.calculate("momentum",momentumBars,{period:2}).momentum.length,3);
assert.equal(window.ChartStudioIndicators.calculate("roc",momentumBars,{period:2}).roc.length,2);
const stochRsiBars=[1,2,3,2,4,3,6,5,7,6,9,8].map((close,index)=>({
 time:1700500000+index*60,open:close,high:close+1,low:close-1,close
}));
const stochRsi=math.stochRsi(stochRsiBars,2,3,2,2);
assert.deepEqual(Array.from(stochRsi.stochRsiK,point=>point.time),stochRsiBars.slice(5).map(bar=>bar.time));
assert.deepEqual(Array.from(stochRsi.stochRsiD,point=>point.time),stochRsiBars.slice(6).map(bar=>bar.time));
assert.ok(stochRsi.stochRsiK.every(point=>point.value>=0&&point.value<=100));
assert.ok(stochRsi.stochRsiD.every(point=>point.value>=0&&point.value<=100));
assert.equal(math.stochRsi(stochRsiBars.slice(0,6),2,3,2,2).stochRsiD.length,0);
const flatStochRsi=math.stochRsi(stochRsiBars.map(bar=>({...bar,open:10,high:10,low:10,close:10})),2,3,2,2);
assert.ok(flatStochRsi.stochRsiK.every(point=>point.value===50));
assert.ok(flatStochRsi.stochRsiD.every(point=>point.value===50));
assert.equal(math.stochRsi(stochRsiBars,1,3,2,2).stochRsiK.length,0);
assert.equal(math.stochRsi(stochRsiBars,2,1,2,2).stochRsiK.length,0);
assert.equal(window.ChartStudioIndicators.calculate("stochrsi",stochRsiBars,{period:2,stochPeriod:3,smoothK:2,smoothD:2}).stochRsiK.length,7);
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
const sessionBars=[
 {time:midnight+1,open:10,high:12,low:8,close:10,tick_volume:1,real_volume:0},
 {time:midnight+900,open:20,high:22,low:18,close:20,tick_volume:3,real_volume:0},
 {time:midnight+1800,open:30,high:32,low:28,close:30,tick_volume:1,real_volume:0},
 {time:midnight+86400+1,open:50,high:52,low:48,close:50,tick_volume:2,real_volume:0},
 {time:midnight+86400+900,open:60,high:62,low:58,close:60,tick_volume:1,real_volume:0}
];
const sessionVwap=math.vwap(sessionBars,{timeZone:"UTC",sessionStart:"00:15"});
assert.equal(sessionVwap.length,5);
near(sessionVwap[0].value,10);
near(sessionVwap[1].value,20);
near(sessionVwap[2].value,22.5);
near(sessionVwap[3].value,(20*3+30+50*2)/6);
near(sessionVwap[4].value,60);
const nyDst=[
 {time:Date.parse("2026-03-08T13:30:00Z")/1000,open:10,high:12,low:8,close:10,tick_volume:1,real_volume:0},
 {time:Date.parse("2026-03-08T14:30:00Z")/1000,open:20,high:22,low:18,close:20,tick_volume:1,real_volume:0},
 {time:Date.parse("2026-03-09T13:30:00Z")/1000,open:30,high:32,low:28,close:30,tick_volume:1,real_volume:0}
];
assert.deepEqual(Array.from(math.vwap(nyDst,{timeZone:"America/New_York",sessionStart:"09:30"}),p=>p.value),[10,15,30]);
assert.equal(math.vwap(sessionBars,{timeZone:"No/Such_Zone",sessionStart:"09:30"}).length,0);
assert.equal(math.vwap(sessionBars,{timeZone:"UTC",sessionStart:"24:00"}).length,0);
assert.ok(src.includes("Tick-/Realvolumenproxy"));

console.log("PASS Chart Studio RSI/Stochastic/ATR/MACD/ADX/VWAP and broker volume math, warm-up, time alignment, read-only checks");
