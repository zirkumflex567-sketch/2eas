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
   window.__chartPerfCounts=counts;
   return ChartStudioDataSignature.signature(candles);
  });
  assert.ok(typeof instrumentation==="string");
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
  await page.evaluate(()=>ChartStudioBeta.updateCandles(__perfLatest.map(c=>({...c}))));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[1,1,1,1]);
  await page.evaluate(()=>{
   window.__perfCorrected=__perfLatest.map(c=>({...c}));
   __perfCorrected[40].high+=2;__perfCorrected[40].close+=1;
   ChartStudioBeta.updateCandles(__perfCorrected);
  });
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[2,2,2,2],
   "Older historical bar correction must invalidate ALL indicator caches");
  assert.notEqual(await page.evaluate(()=>ChartStudioDataSignature.signature(__perfLatest)),
   await page.evaluate(()=>ChartStudioDataSignature.signature(__perfCorrected)));
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  await page.evaluate(()=>ChartStudioBeta.updateCandles(__perfCorrected));
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__chartPerfCounts)),[3,3,3,3],
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
