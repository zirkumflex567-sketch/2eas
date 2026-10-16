"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8868","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try{
  for(let i=0;i<80;i++){
   try{if((await fetch("http://127.0.0.1:8868/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture HTTP timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1390,height:950}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  await page.goto("http://127.0.0.1:8868/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  const controls=page.locator(".cs-chart-type-editor");
  assert.equal(await controls.isVisible(),true);
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"candles");
  assert.equal(await page.evaluate(()=>candleSeries.options().visible!==false),true);
  await controls.locator('[data-chart-type="bars"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"bars");
  assert.equal(await page.evaluate(()=>candleSeries.options().visible),false);
  assert.equal(await controls.locator('[data-chart-type="bars"]').getAttribute("aria-pressed"),"true");
  await controls.locator('[data-chart-type="line"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"line");
  await controls.locator('[data-chart-type="area"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"area");
  // Visual theme color adjustments are propagated to the active alternate series.
  const appearance=page.locator(".cs-appearance");
  await appearance.locator("summary").click();
  await appearance.locator('[data-key="upColor"]').fill("#44ffaa");
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().upColor),"#44ffaa");
  await controls.locator('[data-chart-type="candles"]').click();
  assert.equal(await page.evaluate(()=>candleSeries.options().visible),true);
  assert.equal(await page.evaluate(()=>candleSeries.options().upColor),"#44ffaa");
  await controls.locator('[data-chart-type="area"]').click();
  // Local named layout roundtrip, with drawing anchor coordinate map still usable.
  const anchor=await page.evaluate(()=>({
   x:chart.timeScale().timeToCoordinate(candles[35].time),
   y:candleSeries.priceToCoordinate(candles[35].close)
  }));
  assert.ok(Number.isFinite(anchor.x)&&Number.isFinite(anchor.y));
  page.once("dialog",dialog=>dialog.accept("ChartLayout"));
  await page.locator('[data-cmd="save-profile"]').click();
  await controls.locator('[data-chart-type="line"]').click();
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"area");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"candles");
  await controls.locator('[data-chart-type="bars"]').click();
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"area");
  const sb=page.locator(".cs-server-sync");
  assert.equal(await sb.locator('input[type="password"]').count(),0,"legacy bearer login is absent");
  assert.equal(await sb.locator('[aria-label="Recovery-Paket"]').count(),1);
  assert.equal(await sb.getByRole("button",{name:"Aktuelles Layout verschlüsselt speichern"}).isDisabled(),true,
    "encrypted server sync remains unavailable unless the server explicitly enables it");
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"no plaintext workspace writes are sent while encrypted sync is disabled");
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-chart-types.png"),fullPage:true});
  console.log("PASS Chromium candle/bar/line/area types, price anchors, appearance, account isolation, local profiles and fail-closed sync");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
