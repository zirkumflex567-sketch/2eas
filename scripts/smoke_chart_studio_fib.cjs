"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
(async()=>{
 const server=spawn("python",["-m","http.server","8879","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture HTTP process crashed");
   try{if((await fetch("http://127.0.0.1:8879/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture connection timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:980}});
  const errors=[],writes=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")writes.push(r.url())});
  await page.goto("http://127.0.0.1:8879/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady);
  await page.locator("#cs-beta-toggle").click();
  const input=page.locator("#cs-fib-levels");
  await input.fill("0; 25; 50; 100; 161,8");
  await page.locator('[data-cmd="fib-default"]').click();
  await page.locator('[data-tool="fib"]').click();
  await page.locator(".cs-beta-canvas").scrollIntoViewIfNeeded();
  const canvas=page.locator(".cs-beta-canvas"),box=await canvas.boundingBox();
  assert.ok(box&&box.width>300);
  await page.mouse.click(box.x+box.width*.45,box.y+box.height*.27);
  await page.mouse.click(box.x+box.width*.67,box.y+box.height*.59);
  let drawings=await page.evaluate(()=>ChartStudioBeta.getState().drawings);
  assert.equal(drawings.length,1);
  assert.equal(drawings[0].kind,"fib");
  assert.ok(Math.abs(drawings[0].levels[4]-1.618)<1e-10);
  await page.locator(".cs-object-manager summary").click();
  await page.locator('.cs-object-manager [data-action="select"][data-index="0"]').click();
  await input.fill("0; 33,3; 66,6; 100");
  await page.locator('[data-cmd="fib-selected"]').click();
  drawings=await page.evaluate(()=>ChartStudioBeta.getState().drawings);
  assert.equal(drawings[0].levels.length,4);
  await page.locator('[data-cmd="undo"]').click();
  drawings=await page.evaluate(()=>ChartStudioBeta.getState().drawings);
  assert.equal(drawings[0].levels.length,5);
  // Invalid levels must not mutate the stored object.
  await input.fill("0; 50; 50");
  await page.locator('[data-cmd="fib-selected"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].levels.length,5);
  const out=path.join("output","visual-smoke");fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,"chart-studio-fibonacci-levels.png"),fullPage:true});
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings)).length,0);
  assert.ok((await input.inputValue()).includes("23,6"));
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].levels.length,5);
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  console.log("PASS editable Fibonacci percent levels, undo, account scope, strict no-write browser");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
