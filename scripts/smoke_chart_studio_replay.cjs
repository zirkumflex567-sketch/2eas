"use strict";
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const {spawn}=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
(async()=>{
 const server=spawn("python",["-m","http.server","8877","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server crashed");
   try{if((await fetch("http://127.0.0.1:8877/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("HTTP startup timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[],writes=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",r=>{if(r.method()!=="GET")writes.push(r.url())});
  await page.goto("http://127.0.0.1:8877/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  await page.locator(".cs-replay summary").click();
  await page.waitForSelector(".cs-replay-plot canvas");
  let state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.sourceBars,120);
  assert.equal(state.active,false);
  await page.locator(".cs-replay-actions button").nth(0).click();
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.active,true);assert.equal(state.snapshotBars,120);
  assert.equal(state.visibleBars,1);
  await page.locator(".cs-replay-actions button").nth(1).click();
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).visibleBars,2);
  await page.evaluate(()=>ChartStudioReplay.seek(33));
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).visibleBars,34);
  // No future-bar leak: live updates while in replay do not extend the frozen snapshot.
  await page.evaluate(()=>{
   const x=Array.from({length:121},(_,i)=>({time:1700000000+i*900,
    open:4100+i,high:4108+i,low:4090+i,close:4104+i}));
   ChartStudioReplay.updateBars(x);
  });
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.snapshotBars,120);assert.equal(state.visibleBars,34);
  const out=path.join("output","visual-smoke");fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,"chart-studio-replay.png"),fullPage:true});
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.account,"goldm15");assert.equal(state.active,false);
  assert.equal(state.sourceBars,0);assert.equal(state.visibleBars,0);
  await page.evaluate(()=>ChartStudioBeta.timeframe("H1"));
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).timeframe,"H1");
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log("PASS read-only replay: as-of prefixes, frozen snapshot, account/timeframe reset, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
