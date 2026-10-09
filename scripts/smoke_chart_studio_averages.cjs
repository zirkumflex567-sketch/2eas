"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const server=spawn("python",["-m","http.server","8865","--bind","127.0.0.1"],
   {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("HTTP fixture failed");
   try{if((await fetch("http://127.0.0.1:8865/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("HTTP fixture timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1400,height:960}});
  const errors=[],requests=[],store=new Map();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{if(req.method()!=="GET")requests.push({method:req.method(),url:req.url()})});
  const secret="fixture-server-multi-average-token-123456789";
  await page.route("**/api/chart/v1/workspace**",async route=>{
   const req=route.request(),url=new URL(req.url());
   const send=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
   if(req.headers().authorization!=="Bearer "+secret)return send(401,{detail:"Wrong token"});
   const q=req.method()==="GET"?Object.fromEntries(url.searchParams.entries()):req.postDataJSON();
   const account=q.account,symbol=q.symbol||"XAUUSD",name=q.name;
   const key=account+":"+symbol+":"+name,value=store.get(key);
   if(url.pathname.endsWith("/workspaces"))
    return send(200,{account,symbol,items:[...store.entries()].filter(([k])=>k.startsWith(account+":"+symbol+":"))
     .map(([k,v])=>({name:k.split(":")[2],revision:v.revision,updatedUtc:123}))});
   if(req.method()==="GET")return value?send(200,{account,symbol,name,revision:value.revision,document:value.document}):send(404,{detail:"missing"});
   if(req.method()==="PUT"){
    if((value?.revision||0)!==q.expectedRevision)return send(409,{detail:{message:"stale revision"}});
    const revision=(value?.revision||0)+1;
    store.set(key,{revision,document:q.document});
    return send(200,{account,symbol,name,revision,document:q.document});
   }
   return send(405,{detail:"no"});
  });
  await page.goto("http://127.0.0.1:8865/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  // EMA controls must be directly accessible without opening the beta drawer.
  const quick=page.locator(".cs-ma-quick");
  assert.equal(await quick.isVisible(),true);
  await quick.locator(".cs-ma-quick-period").fill("89");
  await quick.getByRole("button",{name:"EMA mit gewählter Periode hinzufügen"}).click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),true);
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,89);
  await quick.getByRole("button",{name:"EMAs einstellen"}).click();
  assert.equal(await page.locator(".cs-ma-editor").isVisible(),true);
  await page.locator('[data-instance="ma1"] [data-action="remove"]').click();
  await page.locator("#cs-beta-toggle").click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),false);
  // Invalid quick-entry cannot add an EMA.
  await quick.locator(".cs-ma-quick-period").fill("501");
  await quick.getByRole("button",{name:"EMA mit gewählter Periode hinzufügen"}).click();
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),0);
  await quick.locator(".cs-ma-quick-period").fill("34");
  await page.locator("#cs-beta-toggle").click();
  const area=page.locator(".cs-ma-editor");
  assert.equal(await area.isVisible(),true);
  await area.locator(".cs-ma-presets button").first().click();
  await area.locator('[data-instance="ma1"] [data-field="period"]').fill("34");
  await area.locator('[data-instance="ma1"] [data-field="period"]').press("Tab");
  await area.locator('[data-instance="ma1"] [data-field="source"]').selectOption("hlc3");
  await area.locator('[data-instance="ma1"] [data-field="lineWidth"]').selectOption("3");
  await area.locator('[data-instance="ma1"] [data-field="color"]').fill("#44ffaa");
  await area.locator('[data-instance="ma1"] [data-field="label"]').fill("Trend EMA 34");
  await area.locator('[data-instance="ma1"] [data-field="label"]').press("Tab");
  await area.locator(".cs-ma-presets button").nth(2).click();
  let cfg=await page.evaluate(()=>ChartStudioAverages.getConfigs());
  assert.equal(cfg.length,2);
  assert.equal(cfg[0].period,34);assert.equal(cfg[0].source,"hlc3");
  assert.equal(cfg[0].color,"#44ffaa");assert.equal(cfg[0].lineWidth,3);
  assert.equal(cfg[0].label,"Trend EMA 34");
  // Changing only style must not re-transfer the historical series.
  const priorWrites=await page.evaluate(()=>ChartStudioAverages.diagnostics().dataWrites);
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","lineWidth",2));
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","lineWidth",3));
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","color","#66aaff"));
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","color","#44ffaa"));
  assert.equal(await page.evaluate(()=>ChartStudioAverages.diagnostics().dataWrites),priorWrites);
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","period",35));
  assert.equal(await page.evaluate(()=>ChartStudioAverages.diagnostics().dataWrites),priorWrites+1);
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","period",34));
  assert.equal(await page.evaluate(()=>ChartStudioAverages.diagnostics().dataWrites),priorWrites+2);

  await area.locator('[data-instance="ma2"] [data-action="duplicate"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),3);
  await area.locator('[data-instance="ma3"] [data-action="remove"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),2);
  // Local profile round trip, including multiple independent overlays.
  page.once("dialog",dialog=>dialog.accept("MA-Profil"));
  await page.locator('[data-cmd="save-profile"]').click();
  await area.locator('[data-instance="ma1"] [data-field="period"]').fill("56");
  await area.locator('[data-instance="ma1"] [data-field="period"]').press("Tab");
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,56);
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
  // Account isolation, including persisted original.
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),0);
  assert.equal(await page.evaluate(()=>ChartStudioAverages.diagnostics().seriesCount),0);
  await area.locator(".cs-ma-presets button").nth(1).click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,50);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),2);
  // New opt-in SQLite document extension round trip via existing UI.
  const sb=page.locator(".cs-server-sync");
  await sb.locator('input[type="password"]').fill(secret);
  await sb.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await sb.getByRole("textbox",{name:"Neuer Layoutname"}).fill("MultiEMA");
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  const saved=store.get("titan:XAUUSD:MultiEMA").document;
  assert.equal(saved.movingAverages.length,2);
  assert.equal(saved.movingAverages[0].period,34);
  await area.locator('[data-instance="ma1"] [data-field="period"]').fill("77");
  await area.locator('[data-instance="ma1"] [data-field="period"]').press("Tab");
  await sb.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
  assert.equal(await page.evaluate(secret=>Object.values(localStorage).some(v=>v.includes(secret)),secret),false);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(x=>x.url.includes("/api/chart/v1/workspace")));
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-multi-ma.png"),fullPage:true});
  console.log("PASS Chromium multi-MA editing, live overlays, duplicate/remove, local+server profiles, account isolation");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
