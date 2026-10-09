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
  const errors=[],requests=[],store=new Map();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  const token="browser-chart-style-fixture-secret-123456789";
  await page.route("**/api/chart/v1/workspace**",async route=>{
   const r=route.request(),u=new URL(r.url());
   const result=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
   if(r.headers().authorization!=="Bearer "+token)return result(401,{detail:"Unauthorized"});
   const body=r.method()==="GET"?Object.fromEntries(u.searchParams.entries()):r.postDataJSON();
   const account=body.account,symbol=body.symbol||"XAUUSD",name=body.name;
   const key=account+":"+symbol+":"+name,stored=store.get(key);
   if(u.pathname.endsWith("/workspaces"))return result(200,{account,symbol,
    items:[...store.entries()].filter(([k])=>k.startsWith(account+":"+symbol+":"))
     .map(([k,v])=>({name:k.split(":")[2],revision:v.revision,updatedUtc:1}))});
   if(r.method()==="GET")return stored?result(200,{account,symbol,name,...stored}):result(404,{detail:"Missing"});
   if(r.method()==="PUT"){
    if((stored?.revision||0)!==body.expectedRevision)return result(409,{detail:"Version conflict"});
    const next={revision:(stored?.revision||0)+1,document:body.document};
    store.set(key,next);return result(200,{account,symbol,name,...next});
   }
   return result(405,{detail:"Not supported"});
  });
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
  await serverBox.locator('input[type="password"]').fill(token);
  await serverBox.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await serverBox.getByRole("textbox",{name:"Neuer Layoutname"}).fill("DarkStyleServer");
  await serverBox.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  const saved=store.get("titan:XAUUSD:DarkStyleServer").document;
  assert.equal(saved.chartAppearance.grid,false);
  assert.equal(saved.chartAppearance.upColor,"#44ffaa");
  await editor.locator('[data-key="scale"]').selectOption("normal");
  await serverBox.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal(await page.evaluate(()=>ChartStudioAppearance.settings().scale),"logarithmic");
  assert.equal(await page.evaluate(s=>Object.values(localStorage).some(v=>v.includes(s)),token),false);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(x=>x.includes("/api/chart/v1/workspace")));
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-appearance.png"),fullPage:true});
  console.log("PASS Chromium chart appearance colors, crosshair, grid, logarithmic scale, local/server layouts, account isolation");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
