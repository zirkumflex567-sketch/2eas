"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const server=spawn("python",["-m","http.server","8866","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try{
  for(let i=0;i<80;i++){
   try{if((await fetch("http://127.0.0.1:8866/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("fixture timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  await page.goto("http://127.0.0.1:8866/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  const editor=page.locator(".cs-appearance");
  await editor.locator("summary").click();
  await editor.locator('[data-key="theme"]').selectOption("dark");
  await editor.locator('[data-key="scale"]').selectOption("logarithmic");
  await editor.locator('[data-key="grid"]').uncheck();
  await editor.locator('[data-key="crosshair"]').uncheck();
  await editor.locator('[data-key="upColor"]').fill("#44ffaa");
  await editor.locator('[data-key="wickVisible"]').uncheck();
  const settings=await page.evaluate(()=>ChartStudioAppearance.settings());
  assert.equal(settings.theme,"dark");assert.equal(settings.scale,"logarithmic");
  assert.equal(settings.grid,false);assert.equal(settings.crosshair,false);
  assert.equal(settings.upColor,"#44ffaa");assert.equal(settings.wickVisible,false);
  const applied=await page.evaluate(()=>({
   upColor:candleSeries.options().upColor,
   wickVisible:candleSeries.options().wickVisible,
   gridVisible:chart.options().grid.vertLines.visible,
   crosshairVisible:chart.options().crosshair.vertLine.visible,
   scale:chart.priceScale("right").options().mode
  }));
  assert.equal(applied.upColor,"#44ffaa");
  assert.equal(applied.wickVisible,false);
  assert.equal(applied.gridVisible,false);
  assert.equal(applied.crosshairVisible,false);
  assert.equal(applied.scale,1);
  page.once("dialog",dialog=>dialog.accept("DarkStyle"));
  await page.locator('[data-cmd="save-profile"]').click();
  await editor.locator('[data-key="grid"]').check();
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().grid),true);
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().grid),false);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().grid),true);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().grid),false);
  const serverBox=page.locator(".cs-server-sync");
  assert.equal(await serverBox.locator('input[type="password"]').count(),0,"legacy bearer login is absent");
  assert.equal(await serverBox.locator('[aria-label="Recovery-Paket"]').count(),1);
  assert.equal(await serverBox.getByRole("button",{name:"Aktuelles Layout verschlüsselt speichern"}).isDisabled(),true,
    "encrypted server sync remains unavailable unless the server explicitly enables it");
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"no plaintext workspace writes are sent while encrypted sync is disabled");
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-appearance.png"),fullPage:true});
  console.log("PASS Chromium chart appearance colors, crosshair, grid, logarithmic scale, local layouts, account isolation and fail-closed sync");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
