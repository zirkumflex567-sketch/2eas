"use strict";
const {chromium}=require("playwright");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8865","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:8865/static/chart-studio-fixture.html")).ok)break}catch{}await new Promise(r=>setTimeout(r,250));if(i===59)throw Error("fixture server timeout")}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});const page=await browser.newPage({viewport:{width:1280,height:900}}),reads=[],writes=[];page.on("request",r=>{if(r.method()!=="GET")writes.push(r.method()+" "+r.url())});
  await page.route("**/api/chart/v1/symbols?*",async route=>{const u=new URL(route.request().url()),scope={account:u.searchParams.get("account"),symbol:u.searchParams.get("q")};reads.push({method:route.request().method(),kind:"symbols",...scope});await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({account:scope.account,source:"MT5_VERIFIED",canExecute:false,symbols:[{account:scope.account,symbol:scope.symbol,source:"MT5_VERIFIED",canExecute:false}]})})});
  await page.route("**/api/candles?*",async route=>{const u=new URL(route.request().url()),scope={account:u.searchParams.get("account"),symbol:u.searchParams.get("symbol"),timeframe:u.searchParams.get("tf")};reads.push({method:route.request().method(),kind:"candles",...scope});const candles=Array.from({length:20},(_,i)=>({time:1700000000+i*900,open:4100+i,high:4102+i,low:4099+i,close:4101+i}));await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,candles})})});
  await page.goto("http://127.0.0.1:8865/static/chart-studio-fixture.html");await page.waitForFunction(()=>window.__chartSmokeReady);
  await page.evaluate(()=>{const host=document.createElement("div");host.id="multi-smoke";document.body.append(host);window.__multi=ChartStudioMultiChart.mount({container:host,account:"titan",symbol:"XAUUSD.p",timeframe:"M15"})});
  const workspace=page.locator("#multi-smoke");assert.equal(await workspace.locator(".cs-multi-pane").count(),2);await workspace.locator("[data-link-time]").check();await workspace.locator("[data-link-crosshair]").check();
  await workspace.locator(".cs-multi-pane").nth(0).locator("[data-load]").click();await page.waitForFunction(()=>window.__multi.getState().panes[0].candles===20);await workspace.locator(".cs-multi-pane").nth(1).locator("[data-load]").click();await page.waitForFunction(()=>window.__multi.getState().panes[1].candles===20);
  await workspace.locator("[data-layout]").selectOption("4");assert.equal(await workspace.locator(".cs-multi-pane").count(),4);assert.equal(await page.evaluate(()=>window.__multi.getState().panes[0].candles),20,"loaded pane data survives a 2/4 layout change");await workspace.locator("[data-save]").click();
  assert.equal(reads.filter(r=>r.kind==="candles").length,2);assert.equal(reads.filter(r=>r.kind==="symbols"&&r.symbol==="XAUUSD.p").length,2);assert.ok(reads.every(r=>r.method==="GET"));assert.deepEqual(writes,[]);assert.ok(reads.every(r=>r.account!=="blueberry"));
  const beforeBlueberry=reads.length;await page.evaluate(()=>{window.__multi.destroy();const host=document.createElement("div");host.id="blueberry-smoke";document.body.append(host);window.__blocked=ChartStudioMultiChart.mount({container:host,account:"blueberry",symbol:"XAUUSD.p",timeframe:"M15"})});assert.equal(await page.evaluate(()=>window.__blocked),null);assert.equal(reads.length,beforeBlueberry);
  console.log("PASS Chromium multi-chart 2/4 pane layouts, optional UTC/crosshair links, exact demo GET scope, no writes and Blueberry isolation");
 }finally{await browser?.close();server.kill()}
})().catch(error=>{console.error(error);process.exit(1)});
