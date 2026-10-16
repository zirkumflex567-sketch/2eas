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
const regressionBars=[1,2,4,4].map((close,index)=>({time:1700060500+index*60,open:close,high:close+1,low:close-1,close}));
const regression=math.linearRegressionChannel(regressionBars,3,2);
assert.deepEqual(Array.from(regression.middle,point=>point.time),regressionBars.slice(2).map(bar=>bar.time),"Regression channel begins only after a full lookback");
near(regression.middle[0].value,23/6,1e-9);
near(regression.upper[0].value,23/6+2/Math.sqrt(18),1e-9,"Regression channel uses population residual deviation without future bars");
near(regression.lower[0].value,23/6-2/Math.sqrt(18),1e-9);
const updatedRegressionBars=regressionBars.map(bar=>({...bar}));updatedRegressionBars[3].close=5;
const updatedRegression=math.linearRegressionChannel(updatedRegressionBars,3,2);
assert.deepEqual(Array.from(updatedRegression.middle,point=>point.time),Array.from(regression.middle,point=>point.time));
assert.notEqual(updatedRegression.middle[1].value,regression.middle[1].value,"A forming-bar update recalculates its existing window without adding a bar");
const straightRegression=math.linearRegressionChannel([1,2,3,4].map((close,index)=>({...regressionBars[index],close})),3,2);
assert.ok(straightRegression.upper.every((point,index)=>point.value===straightRegression.middle[index].value));
assert.equal(math.linearRegressionChannel(regressionBars.slice(0,2),3,2).upper.length,0);
assert.equal(math.linearRegressionChannel(regressionBars,1,2).upper.length,0);
assert.equal(math.linearRegressionChannel(regressionBars,201,2).upper.length,0);
assert.equal(math.linearRegressionChannel(regressionBars,3,0).upper.length,0);
assert.equal(math.linearRegressionChannel(regressionBars,3,10.1).upper.length,0);
assert.equal(window.ChartStudioIndicators.calculate("linearRegression",regressionBars,{period:3,multiplier:2}).linearRegression.upper.length,2);
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"linearRegression"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().linearRegression)),{enabled:false,period:20,multiplier:2});
const keltnerBars=[
 {time:1700061000,open:5,high:10,low:0,close:5},
 {time:1700061060,open:6,high:11,low:1,close:6},
 {time:1700061120,open:7,high:12,low:2,close:7}
];
const keltner=math.keltner(keltnerBars,2,2,1);
assert.equal(keltner.middle.length,2);near(keltner.middle[0].value,5+2/3);near(keltner.upper[0].value,5+2/3+10);near(keltner.lower[0].value,5+2/3-10);
near(keltner.middle[1].value,5+2/3+2/3*(7-(5+2/3)));near(keltner.upper[1].value,keltner.middle[1].value+10);
assert.equal(math.keltner(keltnerBars,1,2,1).middle.length,0);
assert.equal(math.keltner(keltnerBars,2,201,1).middle.length,0);
assert.equal(math.keltner(keltnerBars,2,2,10.15).middle.length,0);
assert.equal(window.ChartStudioIndicators.calculate("keltner",keltnerBars,{period:2,atrPeriod:2,multiplier:1}).keltner.lower.length,2);
const atrBandBars=[
 {time:1700062000,open:9,high:11,low:9,close:10},
 {time:1700062060,open:10,high:12,low:10,close:12},
 {time:1700062120,open:12,high:16,low:12,close:13},
 {time:1700062180,open:13,high:17,low:14,close:15}
];
const atrBandInput=JSON.stringify(atrBandBars),atrBands=math.atrBands(atrBandBars,2,2,2);
assert.deepEqual(Array.from(atrBands.middle,point=>point.time),atrBandBars.slice(1).map(bar=>bar.time));
assert.deepEqual(Array.from(atrBands.middle,point=>point.value),[11,12.5,14]);
assert.deepEqual(Array.from(atrBands.upper,point=>point.value),[15,18.5,21]);
assert.deepEqual(Array.from(atrBands.lower,point=>point.value),[7,6.5,7]);
assert.equal(atrBands.upper[1].time,atrBandBars[2].time,"ATR Bands use only their current and previous candles");
assert.notDeepEqual(Array.from(atrBands.middle,point=>point.value),Array.from(math.keltner(atrBandBars,2,2,2).middle,point=>point.value),"SMA-centered ATR Bands are distinct from EMA-centered Keltner channels");
assert.deepEqual(JSON.stringify(atrBandBars),atrBandInput,"Calculations never mutate source candles");
for(const args of [[1,2,2],[201,2,2],[2,1,2],[2,201,2],[2,2,.15],[2,2,10.1]])assert.equal(math.atrBands(atrBandBars,...args).middle.length,0);
assert.equal(window.ChartStudioIndicators.calculate("atrBands",atrBandBars,{period:2,atrPeriod:2,multiplier:2}).atrBands.lower.length,3);
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"atrBands"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().atrBands)),{enabled:false,period:20,atrPeriod:14,multiplier:2});
const ichimokuBars=[10,11,9,12,13,10,15].map((close,index)=>({time:1700063000+index*60,open:close,high:close+1,low:close-1,close}));
const ichimokuInput=JSON.stringify(ichimokuBars),ichimoku=math.ichimoku(ichimokuBars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2});
assert.deepEqual(Array.from(ichimoku.tenkan,point=>point.time),ichimokuBars.slice(1).map(bar=>bar.time));
near(ichimoku.tenkan[0].value,10.5);near(ichimoku.kijun[0].value,10);
assert.equal(ichimoku.senkouA[0].sourceTime,ichimokuBars[2].time);
assert.equal(ichimoku.senkouA[0].time,ichimokuBars[4].time,"Senkou A is projected by observed bar index");
near(ichimoku.senkouA[0].value,10);
assert.equal(ichimoku.senkouB[0].sourceTime,ichimokuBars[3].time);
assert.equal(ichimoku.senkouB[0].time,ichimokuBars[5].time);
near(ichimoku.senkouB[0].value,10.5);
assert.equal(ichimoku.chikou[0].sourceTime,ichimokuBars[2].time);
assert.equal(ichimoku.chikou[0].time,ichimokuBars[0].time,"Chikou plots the current close back by the configured observed bars");
near(ichimoku.chikou[0].value,9);
assert.deepEqual(JSON.stringify(ichimokuBars),ichimokuInput,"Ichimoku never mutates source candles");
assert.equal(math.ichimoku(ichimokuBars.slice(0,3),{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2}).senkouB.length,0,"Senkou B requires its full source lookback");
assert.equal(math.ichimoku(ichimokuBars.slice(0,3),{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2}).chikou.length,1,"Chikou uses only already-observed source closes");
for(const bad of [{tenkanPeriod:1,kijunPeriod:3,senkouBPeriod:4,displacement:2},{tenkanPeriod:2,kijunPeriod:201,senkouBPeriod:4,displacement:2},{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:1,displacement:2},{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:201}])assert.equal(math.ichimoku(ichimokuBars,bad).tenkan.length,0,"Invalid Ichimoku settings fail closed");
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.calculate("ichimoku",ichimokuBars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2}).ichimoku)),JSON.parse(JSON.stringify(ichimoku)));
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"ichimoku"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().ichimoku)),{enabled:false,tenkanPeriod:9,kijunPeriod:26,senkouBPeriod:52,displacement:26});
const gapIchimokuBars=ichimokuBars.map((bar,index)=>({...bar,time:bar.time+(index>2?3600:0)}));
const gapIchimoku=math.ichimoku(gapIchimokuBars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:1});
assert.equal(gapIchimoku.senkouA[0].time,gapIchimokuBars[3].time,"Observed target bars use their actual timestamps across session gaps");
const projectedIchimoku=math.ichimoku(ichimokuBars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2,timeframe:"M15"});
assert.ok(projectedIchimoku.senkouA.some(point=>point.projected&&point.time===ichimokuBars.at(-1).time+900));
assert.ok(projectedIchimoku.senkouA.every(point=>point.sourceTime<=ichimokuBars.at(-1).time));
assert.equal(math.ichimoku(ichimokuBars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:0}).senkouA.at(-1).time,ichimokuBars.at(-1).time);
for(const [bars,expected] of [[[],0],[ichimokuBars.slice(0,1),0],[ichimokuBars.slice(0,2),1]]){
 const result=math.ichimoku(bars,{tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:0});
 assert.equal(result.tenkan.length,expected,"Ichimoku handles empty, one-bar and exact Tenkan warm-up boundaries");
}
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

// Parabolic SAR advances only from prior state, reverses at the projected stop,
// and exposes separate trend values for overlay rendering.
const sarBars=[
 {time:1700600000,open:10,high:11,low:8,close:10},
 {time:1700600060,open:10,high:12,low:9,close:11},
 {time:1700600120,open:11,high:13,low:10,close:12},
 {time:1700600180,open:12,high:14,low:11,close:13},
 {time:1700600240,open:13,high:15,low:7,close:8}
];
const sar=math.parabolicSar(sarBars,.02,.2);
assert.deepEqual(Array.from(sar,point=>point.trend),["UP","UP","UP","DOWN"]);
const fallingSar=math.parabolicSar(sarBars.map(bar=>({...bar,open:20-bar.open,high:20-bar.low,low:20-bar.high,close:20-bar.close})),.02,.2);
assert.deepEqual(Array.from(fallingSar,point=>point.trend),["DOWN","DOWN","DOWN","UP"]);
assert.deepEqual(Array.from(sar,point=>point.time),sarBars.slice(1).map(bar=>bar.time));
near(sar[0].value,8);near(sar[1].value,8);near(sar[2].value,8.2);near(sar[3].value,14);
assert.deepEqual(Array.from(math.parabolicSar(sarBars.slice(0,4),.02,.2),point=>point.value),Array.from(sar.slice(0,3),point=>point.value),"Appending future bars cannot alter past SAR values");
assert.equal(math.parabolicSar(sarBars,.0,.2).length,0);
assert.equal(math.parabolicSar(sarBars,.03,.02).length,0);
assert.equal(window.ChartStudioIndicators.calculate("sar",sarBars,{step:.02,maxStep:.2}).sar.length,4);
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"sar"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().sar)),{enabled:false,step:.02,maxStep:.2});

// OBV uses the broker volume field available on each bar; MFI labels the same
// input class as a volume proxy and leaves zero-volume windows unavailable.
const flowBars=[
 {time:1700700000,open:10,high:10,low:10,close:10,tick_volume:100,real_volume:0},
 {time:1700700060,open:12,high:12,low:12,close:12,tick_volume:200,real_volume:9},
 {time:1700700120,open:11,high:11,low:11,close:11,tick_volume:300,real_volume:0},
 {time:1700700180,open:14,high:14,low:14,close:14,tick_volume:400,real_volume:0}
];
const obv=math.obv(flowBars);
assert.deepEqual(Array.from(obv,point=>point.value),[0,9,-291,109]);
assert.equal(obv[0].time,flowBars[0].time);
const mfi=math.mfi(flowBars,2);
assert.equal(mfi.length,2);
near(mfi[0].value,100*108/(108+3300));
near(mfi[1].value,100*5600/(5600+3300));
const flatMfi=math.mfi(flowBars.map(bar=>({...bar,open:7,high:8,low:6,close:7})),2);
assert.ok(flatMfi.every(point=>point.value===50));
assert.equal(math.mfi(flowBars.slice(0,2),2).length,0);
assert.equal(math.mfi(flowBars,1).length,0);
assert.equal(math.mfi(flowBars,201).length,0);
assert.equal(math.mfi(flowBars.map(bar=>({...bar,tick_volume:0,real_volume:0})),2).length,0);
assert.equal(window.ChartStudioIndicators.calculate("obv",flowBars).obv.length,4);
assert.equal(window.ChartStudioIndicators.calculate("mfi",flowBars,{period:2}).mfi.length,2);
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"obv"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().mfi)),{enabled:false,period:14});

// Incremental RSI/MACD/ATR streams must match a complete calculation after
// same-bar replacement and append, including warm-up transitions.
const initialStreamBars=Array.from({length:60},(_,i)=>{
 const close=100+Math.sin(i/3)*4+i*.07;
 return {time:1700800000+i*900,open:close-.2,high:close+1+(i%4)*.1,low:close-1-(i%3)*.1,close};
});
for(const [kind,options,keys] of [
 ["rsi",{period:14},["rsi"]],
 ["atr",{period:14},["atr"]],
 ["macd",{fast:12,slow:26,signal:9},["macd","signal","histogram"]]
]){
 const streamBars=initialStreamBars.map(bar=>({...bar}));
 const incremental=window.ChartStudioIndicators.createIncremental(kind,streamBars,options);
 assert.equal(typeof incremental.snapshot,"function");
 assert.equal(typeof incremental.updateLast,"function");
 const equalFull=()=>{
  const expected=window.ChartStudioIndicators.calculate(kind,streamBars,options);
  const actual=incremental.snapshot();
  for(const key of keys)assert.deepEqual(JSON.parse(JSON.stringify(actual[key])),JSON.parse(JSON.stringify(expected[key])),kind+" "+key+" parity");
 };
 equalFull();
 const replacement={...streamBars.at(-1),close:streamBars.at(-1).close+1.15,high:streamBars.at(-1).high+1.2};
 streamBars[streamBars.length-1]=replacement;
 incremental.updateLast(replacement);equalFull();
 const replacementAgain={...replacement,close:replacement.close-.7,low:replacement.low-.8};
 streamBars[streamBars.length-1]=replacementAgain;
 incremental.updateLast(replacementAgain);equalFull();
 const appended={time:streamBars.at(-1).time+900,open:101,high:103,low:99,close:102.5};
 streamBars.push(appended);incremental.updateLast(appended);equalFull();
 assert.throws(()=>incremental.updateLast({...streamBars[0],time:streamBars[0].time+1}),/out of order/i);
}

console.log("PASS Chart Studio RSI/Stochastic/ATR/MACD/ADX/VWAP/SAR/OBV/MFI/Donchian/Keltner/linear-regression math, warm-up, alignment and read-only checks");

// Classic floor pivots use only completed source candles, retain their levels
// through observed-session gaps, and carry exact source-window metadata.
const pivotSource=[
 {time:1700000000,open:100,high:110,low:90,close:105},
 {time:1700086400,open:105,high:115,low:95,close:110},
 {time:1700259200,open:110,high:120,low:100,close:115}
];
const pivotInputSnapshot=JSON.stringify(pivotSource);
const pivotTarget=[1700000000,1700086400,1700172800,1700259200,1700345600].map(time=>({time}));
const pivots=math.pivotPoints(pivotSource,pivotTarget,"D1");
assert.equal(pivots.algorithmVersion,"classic-floor-v1");
assert.equal(pivots.source,"MT5_VERIFIED");
assert.equal(pivots.basis,"D1");
assert.equal(pivots.lines.p.length,4,"no level before a later source bar confirms the close");
assert.equal(pivots.lines.p[0].time,1700086400);
near(pivots.lines.p[0].value,101.6666666667,1e-8);
near(pivots.lines.r1[0].value,113.3333333333,1e-8);
near(pivots.lines.s1[0].value,93.3333333333,1e-8);
near(pivots.lines.r2[0].value,121.6666666667,1e-8);
near(pivots.lines.s2[0].value,81.6666666667,1e-8);
near(pivots.lines.r3[0].value,133.3333333333,1e-8);
near(pivots.lines.s3[0].value,73.3333333333,1e-8);
assert.equal(pivots.lines.p[1].validTo,1700259200,"levels carry through a weekend/market gap");
assert.equal(pivots.lines.p[2].sourceTime,1700086400);
assert.equal(pivots.lines.p[2].validTo,null,"latest confirmed level remains active without a future boundary");
assert.equal(JSON.stringify(pivotSource),pivotInputSnapshot,"Pivot calculation does not mutate broker source candles");
for(const malformed of [
 [pivotSource[0],pivotSource[0],pivotSource[1]],
 [pivotSource[1],pivotSource[0]],
 [pivotSource[0],{...pivotSource[1],high:94}],
 [pivotSource[0],{...pivotSource[1],close:Infinity}]
])assert.equal(math.pivotPoints(malformed,pivotTarget,"D1").available,false,"malformed source must fail closed");
assert.equal(math.pivotPoints(pivotSource,pivotTarget,"M15").available,false,"unsupported source basis fails closed");

// Auto-Fibonacci uses only right-confirmed, closed swing pivots and never plots back in time.
const swingPairs=[[10,8],[9,7],[12,4],[14,8],[15,9],[20,12],[18,10],[17,11],[16,10]];
const swingBars=swingPairs.map(([high,low],index)=>({time:1701000000+index*900,open:(high+low)/2,high,low,close:(high+low)/2}));
const swingAsOf=swingBars[7].time+900;
const swingInputSnapshot=JSON.stringify(swingBars);
const autoFib=math.autoFibonacci(swingBars,"M15",swingAsOf);
assert.equal(JSON.stringify(swingBars),swingInputSnapshot,"Auto-Fibonacci does not mutate broker source candles");
assert.equal(autoFib.available,true);
assert.equal(autoFib.algorithmVersion,"confirmed-swing-auto-fib-v1");
assert.equal(autoFib.source,"MT5_VERIFIED");
assert.equal(autoFib.direction,"UP");
assert.equal(autoFib.swingStrength,2);
assert.equal(autoFib.start.type,"LOW");assert.equal(autoFib.start.time,swingBars[2].time);near(autoFib.start.price,4);
assert.equal(autoFib.end.type,"HIGH");assert.equal(autoFib.end.time,swingBars[5].time);near(autoFib.end.price,20);
assert.equal(autoFib.confirmedAt,swingBars[7].time+900);
assert.equal(autoFib.lines["0"].points[0].time,swingBars[8].time,"no level is drawn until after the right-side confirmation bar closes");
const futureFib=math.autoFibonacci([...swingBars,{time:swingAsOf+1800,open:20,high:21,low:19,close:20}],"M15",swingAsOf);
assert.equal(futureFib.lines["0"].points.at(-1).time,swingBars[8].time,"future chart bars are excluded by the as-of boundary");
for(const [ratio,price] of [[0,20],[.236,16.224],[.382,13.888],[.5,12],[.618,10.112],[.786,7.424],[1,4]])near(autoFib.lines[String(ratio)].value,price,1e-8);
const notYetConfirmed=math.autoFibonacci(swingBars,"M15",swingBars[7].time+899);
assert.equal(notYetConfirmed.available,false,"forming right-side bars cannot confirm a swing");
const descendingPairs=swingPairs.map(([high,low])=>[60-low,60-high]);
const descendingBars=descendingPairs.map(([high,low],index)=>({time:1702000000+index*900,open:(high+low)/2,high,low,close:(high+low)/2}));
const descending=math.autoFibonacci(descendingBars,"M15",descendingBars[7].time+900);
assert.equal(descending.available,true);assert.equal(descending.direction,"DOWN");
near(descending.lines["0.5"].value,48);
const tiedPairs=swingPairs.map(([high,low],index)=>index===6?[20,low]:[high,low]);
assert.equal(math.autoFibonacci(tiedPairs.map(([high,low],index)=>({time:1703000000+index*900,open:(high+low)/2,high,low,close:(high+low)/2})),"M15",1703000000+9*900).available,false,"equal neighboring highs are not swing pivots");
assert.equal(math.autoFibonacci(swingBars,"M15",swingAsOf).lines["0.5"].points.at(-1).time,swingBars.at(-1).time);
assert.equal(math.autoFibonacci(swingBars,"M15",swingBars[7].time+900).lines["0.5"].points[0].time,swingBars[8].time);
assert.equal(math.autoFibonacci(swingBars,"M13",swingAsOf).available,false);
assert.equal(math.autoFibonacci([...swingBars].reverse(),"M15",swingAsOf).available,false,"unsorted bars fail closed");
assert.equal(math.autoFibonacci(swingBars.map((bar,index)=>index===1?{...bar,time:swingBars[0].time}:bar),"M15",swingAsOf).available,false,"duplicate timestamps fail closed");
assert.equal(math.autoFibonacci(swingBars.map(bar=>({...bar,high:bar.high*Number.MAX_VALUE,low:bar.low*Number.MAX_VALUE,open:bar.open*Number.MAX_VALUE,close:bar.close*Number.MAX_VALUE})),"M15",swingAsOf).available,false,"overflowing levels fail closed");
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.calculate("autoFib",swingBars,{timeframe:"M15",asOfUtc:swingAsOf}).autoFib)),JSON.parse(JSON.stringify(autoFib)));
assert.ok(Object.hasOwn(window.ChartStudioIndicators.registry,"autoFib"));
assert.deepEqual(JSON.parse(JSON.stringify(window.ChartStudioIndicators.settings().autoFib)),{enabled:false,algorithmVersion:"confirmed-swing-auto-fib-v1",source:"MT5_VERIFIED"});
