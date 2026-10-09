"use strict";
const assert=require("node:assert/strict"),{chromium}=require("playwright"),{spawn}=require("node:child_process");
const fs=require("node:fs"),path=require("node:path");
(async()=>{
 const server=spawn("python",["-m","http.server","8880","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server exited");
   try{if((await fetch("http://127.0.0.1:8880/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture server timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1320,height:920},acceptDownloads:true});
  const errors=[],writes=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",request=>{if(request.method()!=="GET")writes.push(request.url())});
  await page.goto("http://127.0.0.1:8880/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady);
  await page.locator("#cs-beta-toggle").click();
  await page.locator('[data-tool="horizontal"]').click();
  // The expanded Studio toolbar can put the chart below the viewport. Raw
  // mouse coordinates do not scroll like locator.click() does.
  await page.locator(".cs-beta-canvas").scrollIntoViewIfNeeded();
  const rect=await page.locator(".cs-beta-canvas").boundingBox();
  assert.ok(rect&&rect.width>150);
  await page.mouse.click(rect.x+rect.width*.55,rect.y+rect.height*.44);
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings)).length,1);
  const promised=page.waitForEvent("download");
  await page.locator('[data-cmd="save-png"]').click();
  const item=await promised;
  assert.match(item.suggestedFilename(),/^2eas_titan_M15_\d+\.png$/);
  const file=await item.path(),bytes=fs.readFileSync(file);
  assert.ok(bytes.length>5000);
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  const second=page.waitForEvent("download");
  await page.locator('[data-cmd="save-png"]').click();
  assert.match((await second).suggestedFilename(),/^2eas_goldm15_M15_\d+\.png$/);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log("PASS local PNG export: chart+drawings, non-empty PNG, account filename, zero requests to broker");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
