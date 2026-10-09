"use strict";
const { chromium }=require("playwright");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
(async()=>{
 const server=spawn("python",["-m","http.server","8864","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser=null;
 try{
  for(let i=0;i<60;i++){
   if(server.exitCode!==null)throw Error("fixture server crashed");
   try{const resp=await fetch("http://127.0.0.1:8864/static/chart-studio-fixture.html");
     if(resp.ok)break;}catch(_){}
   await new Promise(r=>setTimeout(r,300));
   if(i===59)throw Error("fixture server timed out");
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:1.5});
  const consoleErrors=[];page.on("pageerror",e=>consoleErrors.push(e.message));
  let requests=[];
  page.on("request",req=>{if(req.method()==="POST")requests.push(req.url())});
  await page.route("**/api/chart/v1/scenarios/preview*",async route=>{
    const req=route.request().postDataJSON();
    assert.equal(req.account,"titan");
    assert.equal(req.symbol,"XAUUSD");
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({account:"titan",canExecute:false,pnlAtSl:{amount:-80,currency:"USD"},
      pnlAtTp:{amount:160,currency:"USD"},margin:{amount:95,currency:"USD"},riskRewardRatio:2})});
  });
  await page.goto("http://127.0.0.1:8864/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),true);
  await page.locator('[data-opt="sma20"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),true);
  await page.locator('[data-opt="positions"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.positions),true);
  await page.locator('[data-tool="horizontal"]').click();
  const cv=await page.locator("canvas.cs-beta-canvas").boundingBox();
  assert.ok(cv && cv.width>200 && cv.height>200);
  await page.mouse.click(cv.x+cv.width*.35,cv.y+cv.height*.45);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1);
  await page.locator('[data-tool="fib"]').click();
  await page.mouse.click(cv.x+cv.width*.42,cv.y+cv.height*.30);
  await page.mouse.click(cv.x+cv.width*.60,cv.y+cv.height*.62);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  await page.locator('[data-cmd="undo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1);
  await page.locator('[data-cmd="redo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),0);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  page.once("dialog", dialog=>dialog.accept("GoldSetup"));
  await page.locator('[data-cmd="save-profile"]').click();
  assert.equal(await page.locator("#cs-beta-profile").inputValue(),"GoldSetup");
  await page.locator('[data-opt="sma20"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),false);
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),true);
  await page.locator(".cs-scenario summary").click();
  await page.locator('[name="volumeLots"]').fill("0.1");
  await page.locator('[name="entryPrice"]').fill("4100");
  await page.locator('[name="slPrice"]').fill("4090");
  await page.locator('[name="tpPrice"]').fill("4120");
  await page.locator('#cs-scenario-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#cs-scenario-result").textContent.includes("KEINE ORDER"));
  assert.equal(requests.length,1);
  assert.ok(requests.every(url=>url.includes("/api/chart/v1/scenarios/preview")));
  assert.deepEqual(consoleErrors,[]);
  const output=path.join("output","visual-smoke");
  fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,"chart-studio-beta.png"),fullPage:true});
  console.log("PASS Chromium beta UI: indicators, drawing/Fibo, undo, account isolation, scenario preview, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
