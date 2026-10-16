"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
(async()=>{
 const server=spawn("python",["-m","http.server","8867","--bind","127.0.0.1"],
 {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server quit");
   try{if((await fetch("http://127.0.0.1:8867/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture server timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  await page.goto("http://127.0.0.1:8867/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  const editor=page.locator(".cs-osc-editor");
  assert.equal(await editor.isVisible(),true);
  await editor.locator('[data-add="rsi"]').click();
  await editor.locator('[data-add="rsi"]').click();
  await editor.locator('[data-add="macd"]').click();
  await editor.locator('[data-add="atr"]').click();
  assert.equal(await page.locator(".cs-osc-pane").count(),4);
  const pane0=page.locator('.cs-osc-pane[data-instance="osc1"]');
  const pane1=page.locator('.cs-osc-pane[data-instance="osc2"]');
  assert.equal(await pane0.getAttribute("data-kind"),"rsi");
  assert.equal(await pane1.getAttribute("data-kind"),"rsi");
  await editor.locator('[data-instance="osc1"] [data-field="period"]').fill("21");
  await editor.locator('[data-instance="osc1"] [data-field="period"]').press("Tab");
  await editor.locator('[data-instance="osc2"] [data-field="period"]').fill("9");
  await editor.locator('[data-instance="osc2"] [data-field="period"]').press("Tab");
  await editor.locator('[data-instance="osc3"] [data-field="fast"]').fill("8");
  await editor.locator('[data-instance="osc3"] [data-field="fast"]').press("Tab");
  await editor.locator('[data-instance="osc1"] [data-field="color"]').fill("#44ffaa");
  await editor.locator('[data-instance="osc1"] [data-field="lineWidth"]').selectOption("3");
  const config=await page.evaluate(()=>ChartStudioOscillators.settings());
  assert.equal(config.length,4);
  assert.equal(config[0].period,21);assert.equal(config[1].period,9);
  assert.equal(config[2].kind,"macd");assert.equal(config[2].fast,8);
  assert.equal(config[0].color,"#44ffaa");assert.equal(config[0].lineWidth,3);
  const mainIndicators=await page.locator(".cs-indicator-control").count();
  assert.ok(mainIndicators>=6,"Original indicator controls must survive");
  // Type switching must fully replace the underlying series instead of reusing RSI.
  await editor.locator('[data-instance="osc4"] [data-field="kind"]').selectOption("adx");
  assert.equal(await page.locator('.cs-osc-pane[data-instance="osc4"]').getAttribute("data-kind"),"adx");
  await editor.locator('[data-instance="osc4"] [data-field="period"]').fill("18");
  await editor.locator('[data-instance="osc4"] [data-field="period"]').press("Tab");
  await editor.locator('[data-instance="osc2"] [data-field="visible"]').uncheck();
  assert.equal(await page.locator(".cs-osc-pane").count(),3);
  await editor.locator('[data-instance="osc2"] [data-field="visible"]').check();
  assert.equal(await page.locator(".cs-osc-pane").count(),4);
  await editor.locator('[data-instance="osc4"] [data-action="duplicate"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioOscillators.settings().length),5);
  await editor.locator('[data-instance="osc5"] [data-action="remove"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioOscillators.settings().length),4);
  // Local layout profile persists all independently keyed oscillator params.
  page.once("dialog",dialog=>dialog.accept("OscLayout"));
  await page.locator('[data-cmd="save-profile"]').click();
  await editor.locator('[data-instance="osc1"] [data-field="period"]').fill("50");
  await editor.locator('[data-instance="osc1"] [data-field="period"]').press("Tab");
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings()))[0].period,21);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioOscillators.settings().length),0);
  await editor.locator('[data-add="adx"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings()))[0].kind,"adx");
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioOscillators.settings().length),4);
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings()))[1].period,9);
  await editor.locator('[data-add="cci"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings())).at(-1).period,20,"CCI uses its standard 20-bar default");
  assert.equal(await page.locator('.cs-osc-pane[data-instance="osc5"]').getAttribute("data-kind"),"cci");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioOscillators.settings().length),1,"The other demo account retains only its own oscillator");
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings())).at(-1).period,20,"CCI parameters restore only for their original account");
  // Encrypted server sync is fail-closed until the deployment explicitly enables it.
  const sb=page.locator(".cs-server-sync");
  assert.equal(await sb.locator('input[type="password"]').count(),0,"legacy bearer login is absent");
  assert.equal(await sb.locator('[aria-label="Recovery-Paket"]').count(),1);
  assert.equal(await sb.getByRole("button",{name:"Aktuelles Layout verschlüsselt speichern"}).isDisabled(),true,
    "encrypted server sync remains unavailable unless the server explicitly enables it");
  assert.equal(await page.locator(".cs-osc-pane").count(),5);
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"no plaintext workspace writes are sent while encrypted sync is disabled");
  const directory=path.join("output","visual-smoke");fs.mkdirSync(directory,{recursive:true});
  await page.screenshot({path:path.join(directory,"chart-studio-oscillators.png"),fullPage:true});
  console.log("PASS Chromium oscillator multi-panes, independent RSI/MACD/ATR/ADX, type changes, local profiles and fail-closed sync");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
