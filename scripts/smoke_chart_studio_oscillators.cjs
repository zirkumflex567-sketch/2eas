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
  const errors=[],requests=[],store=new Map();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  const secret="oscillator-fixture-secret-long-enough-123456789";
  await page.route("**/api/chart/v1/workspace**",async route=>{
   const r=route.request(),u=new URL(r.url());
   const send=(status,obj)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(obj)});
   if(r.headers().authorization!=="Bearer "+secret)return send(401,{detail:"Bad token"});
   const v=r.method()==="GET"?Object.fromEntries(u.searchParams.entries()):r.postDataJSON();
   const {account,name}=v,symbol=v.symbol||"XAUUSD",key=account+":"+symbol+":"+name,old=store.get(key);
   if(u.pathname.endsWith("/workspaces"))return send(200,{account,symbol,
    items:[...store.entries()].filter(([k])=>k.startsWith(account+":"+symbol+":"))
     .map(([k,record])=>({name:k.split(":")[2],revision:record.revision,updatedUtc:1}))});
   if(r.method()==="GET")return old?send(200,{account,symbol,name,...old}):send(404,{detail:"Not found"});
   if(r.method()==="PUT"){
    if((old?.revision||0)!==v.expectedRevision)return send(409,{detail:{message:"Revision conflict"}});
    const next={revision:(old?.revision||0)+1,document:v.document};
    store.set(key,next);return send(200,{account,symbol,name,...next});
   }
   return send(405,{detail:"Unsupported"});
  });
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
  // Server layout roundtrip after a real parameters update.
  const sb=page.locator(".cs-server-sync");
  await sb.locator('input[type="password"]').fill(secret);
  await sb.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await sb.getByRole("textbox",{name:"Neuer Layoutname"}).fill("OscServer");
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  assert.equal(store.get("titan:XAUUSD:OscServer").document.oscillatorInstances.length,4);
  assert.equal(store.get("titan:XAUUSD:OscServer").document.oscillatorInstances[2].fast,8);
  await editor.locator('[data-instance="osc3"] [data-field="fast"]').fill("16");
  await editor.locator('[data-instance="osc3"] [data-field="fast"]').press("Tab");
  await sb.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings()))[2].fast,8);
  assert.equal(await page.locator(".cs-osc-pane").count(),4);
  assert.equal(await page.evaluate(token=>Object.values(localStorage).some(v=>v.includes(token)),secret),false);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(x=>x.includes("/api/chart/v1/workspace")),JSON.stringify(requests));
  const directory=path.join("output","visual-smoke");fs.mkdirSync(directory,{recursive:true});
  await page.screenshot({path:path.join(directory,"chart-studio-oscillators.png"),fullPage:true});
  console.log("PASS Chromium oscillator multi-panes, independent RSI/MACD/ATR/ADX, type changes, local/server profiles and no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
