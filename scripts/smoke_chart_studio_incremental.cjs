"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
(async()=>{
 const server=spawn("python",["-m","http.server","8870","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("HTTP fixture exited");
   try{if((await fetch("http://127.0.0.1:8870/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1350,height:880}});
  const errors=[],writes=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")writes.push(r.url())});
  await page.goto("http://127.0.0.1:8870/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  await page.locator('[data-opt="sma20"]').click();
  await page.locator('[data-opt="bb"]').click();
  await page.locator('.cs-indicator-control input[data-kind="rsi"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="rsi"]',{state:"visible"});
  const instrumentation=await page.evaluate(()=>{
   const keys=["ChartStudioIndicators","ChartStudioAverages","ChartStudioOscillators","ChartStudioChartTypes"];
   const counts={};for(const key of keys){
    const old=window[key];counts[key]=0;
    window[key]=Object.freeze({...old,updateBars:bars=>{counts[key]++;return old.updateBars(bars)}});
   }
   const streamUpdates=[],lightweight=window.LightweightCharts;
   window.LightweightCharts={...lightweight,createChart:(...args)=>new Proxy(lightweight.createChart(...args),{get(chart,method){
     const result=Reflect.get(chart,method,chart);
     if(!["addLineSeries","addHistogramSeries"].includes(method)||typeof result!=="function")return typeof result==="function"?result.bind(chart):result;
     return options=>new Proxy(Reflect.apply(result,chart,[options]),{get(series,operation){
      const member=Reflect.get(series,operation,series);
      if(operation==="update"&&typeof member==="function")return point=>{streamUpdates.push({...point});return Reflect.apply(member,series,[point])};
      return typeof member==="function"?member.bind(series):member;
     }});
    }})};
   const indicatorApi=window.ChartStudioIndicators,streamProbe={builds:0,updates:0,kinds:[],deltas:[],parityFailures:[]};
   window.__streamProbe=streamProbe;
   window.ChartStudioIndicators=Object.freeze({...window.ChartStudioIndicators,createIncremental:(kind,bars,settings)=>{
    streamProbe.builds++;streamProbe.kinds.push(kind);
    const stream=indicatorApi.createIncremental(kind,bars,settings);
    const working=bars.map(bar=>({...bar}));
    return Object.freeze({...stream,updateLast:bar=>{
     streamProbe.updates++;
     const previous=working.at(-1);
     if(previous&&previous.time===bar.time)working[working.length-1]={...bar};else working.push({...bar});
     const delta=stream.updateLast(bar),full=indicatorApi.calculate(kind,working,settings);
     for(const key of Object.keys(full)){
      const expected=full[key].filter(point=>point.time===bar.time),actual=delta[key]||[];
      if(JSON.stringify(actual)!==JSON.stringify(expected))streamProbe.parityFailures.push(kind+"."+key);
     }
     streamProbe.deltas.push({kind,delta});
     return delta;
    }});
   }});
   window.ChartStudioOscillators.applySettings([]);
   for(const kind of ["rsi","macd","atr"])window.ChartStudioOscillators.add(kind);
   window.ChartStudioIndicators.applySettings(window.ChartStudioIndicators.settings());
   streamProbe.builds=0;streamProbe.updates=0;streamProbe.kinds.length=0;streamProbe.deltas.length=0;streamProbe.parityFailures.length=0;streamUpdates.length=0;
   window.__streamSeriesUpdates=streamUpdates;
   window.__chartPerfCounts=counts;
   return ChartStudioDataSignature.signature(candles);
  });
  assert.ok(typeof instrumentation==="string");
  await page.waitForFunction(()=>document.querySelectorAll(".cs-osc-pane").length===3);
  await page.evaluate(()=>ChartStudioBeta.updateCandles(candles.map(c=>({...c}))));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[0,0,0,0],
   "Identical 5-second poll must not recalculate indicators");
  await page.evaluate(()=>{
   window.__perfLatest=candles.map(c=>({...c}));
   __perfLatest.at(-1).close+=1.2;
   ChartStudioBeta.updateCandles(__perfLatest);
  });
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[1,1,1,1],
   "Changed live candle must propagate to every chart adapter");
  assert.equal(await page.evaluate(()=>window.__streamProbe.updates),4,
   "Legacy RSI plus RSI, MACD and ATR multi-instance panes update only their forming candle through retained incremental state");
  assert.deepEqual(await page.evaluate(()=>window.__streamProbe.parityFailures),[],
   "Every production-path RSI/MACD/ATR delta matches the full calculator at the same timestamp");
  const expectedSeriesUpdates=await page.evaluate(()=>{
   const deltas=window.__streamProbe.deltas,rsi=deltas.filter(item=>item.kind==="rsi").slice(1);
   return [...rsi,...deltas.filter(item=>item.kind!=="rsi")].flatMap(item=>Object.values(item.delta).flat())
    .map(({time,value,color})=>({time,value,color}));
  });
  const observedSeriesUpdates=await page.evaluate(()=>window.__streamSeriesUpdates.map(({time,value,color})=>({time,value,color})));
  assert.deepEqual(observedSeriesUpdates,expectedSeriesUpdates,
   "The rendered RSI/MACD/ATR pane series receive the exact incremental points returned by their engines");
  await page.evaluate(()=>{
   window.__streamProbe.deltas.length=0;window.__streamProbe.parityFailures.length=0;window.__streamSeriesUpdates.length=0;
   __perfLatest.at(-1).close+=.35;__perfLatest.at(-1).high+=.4;
   ChartStudioBeta.updateCandles(__perfLatest);
  });
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[2,2,2,2],
   "A second forming-bar tick propagates without a full historical redraw");
  assert.equal(await page.evaluate(()=>window.__streamProbe.updates),8,
   "Repeated forming-bar ticks replace all four cached stream states");
  assert.deepEqual(await page.evaluate(()=>window.__streamProbe.parityFailures),[],
   "Repeated forming-bar updates retain full-calculator parity");
  assert.equal(await page.evaluate(()=>window.__streamSeriesUpdates.length),5,
   "Repeated forming-bar updates touch only the five RSI/MACD/ATR series tails");
  await page.evaluate(()=>{
   window.__streamProbe.deltas.length=0;window.__streamProbe.parityFailures.length=0;window.__streamSeriesUpdates.length=0;
   const previous=__perfLatest.at(-1),time=previous.time+900,close=previous.close+.2;
   __perfLatest.push({time,open:previous.close,high:Math.max(previous.close,close)+.5,
    low:Math.min(previous.close,close)-.5,close,tick_volume:15,real_volume:0});
   ChartStudioBeta.updateCandles(__perfLatest);
  });
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[3,3,3,3],
   "A new candle advances the retained streams without recalculating full RSI/MACD/ATR history");
  assert.equal(await page.evaluate(()=>window.__streamProbe.updates),12,
   "Appending one candle advances all four active incremental streams exactly once");
  assert.deepEqual(await page.evaluate(()=>window.__streamProbe.parityFailures),[],
   "Appended-bar stream values retain full-calculator parity");
  assert.equal(await page.evaluate(()=>window.__streamSeriesUpdates.length),5,
   "The appended candle updates only the five visible multi-instance indicator tails");
  await page.evaluate(()=>ChartStudioBeta.updateCandles(__perfLatest.map(c=>({...c}))));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[3,3,3,3]);
  await page.evaluate(()=>{
   window.__perfCorrected=__perfLatest.map(c=>({...c}));
   __perfCorrected[40].high+=2;__perfCorrected[40].close+=1;
   window.__streamProbe.updates=0;window.__streamProbe.deltas.length=0;window.__streamSeriesUpdates.length=0;
   ChartStudioBeta.updateCandles(__perfCorrected);
  });
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[4,4,4,4],
   "Older historical bar correction must invalidate ALL indicator caches");
  assert.ok(await page.evaluate(()=>window.__streamProbe.builds)>=4,
   "Historical correction rebuilds incremental indicator state from corrected history");
  assert.equal(await page.evaluate(()=>window.__streamProbe.updates),0,
   "Historical correction does not apply a tail-only incremental update");
  assert.notEqual(await page.evaluate(()=>ChartStudioDataSignature.signature(__perfLatest)),
   await page.evaluate(()=>ChartStudioDataSignature.signature(__perfCorrected)));
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  await page.evaluate(()=>ChartStudioBeta.updateCandles(__perfCorrected));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[5,5,5,5],
   "Different broker account must not retain prior account's fingerprint");
  await page.evaluate(()=>ChartStudioBeta.timeframe("H1"));
  await page.evaluate(()=>{for(const key in window.__chartPerfCounts)window.__chartPerfCounts[key]=0});
  await page.evaluate(()=>ChartStudioBeta.updateCandles(__perfCorrected));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[1,1,1,1],
   "Different timeframe must reload even with identical copied candles");
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  const folder=path.join("output","visual-smoke");fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,"chart-studio-incremental.png"),fullPage:true});
  console.log("PASS Chromium chart update dedup, changed last candle, historical correction, account/timeframe resets and no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
