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
  const errors=[],requests=[],store=new Map(),secret="chart-types-test-token-123456789abcdefghijklmnopqrstuvwxyz";
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  await page.route("**/api/chart/v1/workspace**",async route=>{
   const r=route.request(),url=new URL(r.url());
   const send=(status,payload)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(payload)});
   if(r.headers().authorization!=="Bearer "+secret)return send(401,{detail:"Unauthorized"});
   const payload=r.method()==="GET"?Object.fromEntries(url.searchParams.entries()):r.postDataJSON();
   const {account,name}=payload,symbol=payload.symbol||"XAUUSD";
   const key=account+":"+symbol+":"+name,row=store.get(key);
   if(url.pathname.endsWith("/workspaces"))return send(200,{account,symbol,
     items:[...store.entries()].filter(([k])=>k.startsWith(account+":"+symbol+":"))
      .map(([k,v])=>({name:k.split(":")[2],revision:v.revision,updatedUtc:1}))});
   if(r.method()==="GET")return row?send(200,{account,symbol,name,...row}):send(404,{detail:"Not found"});
   if(r.method()==="PUT"){
    if((row?.revision||0)!==payload.expectedRevision)return send(409,{detail:"Revision conflict"});
    const next={revision:(row?.revision||0)+1,document:payload.document};
    store.set(key,next);return send(200,{account,symbol,name,...next});
   }
   return send(405,{detail:"Unsupported"});
  });
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
  await sb.locator('input[type="password"]').fill(secret);
  await sb.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await sb.getByRole("textbox",{name:"Neuer Layoutname"}).fill("TypesServer");
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  assert.equal(store.get("titan:XAUUSD:TypesServer").document.chartType,"area");
  await controls.locator('[data-chart-type="candles"]').click();
  await sb.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal(await page.evaluate(()=>ChartStudioChartTypes.current()),"area");
  assert.equal(await page.evaluate(token=>Object.values(localStorage).some(v=>v.includes(token)),secret),false);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>url.includes("/api/chart/v1/workspace")),JSON.stringify(requests));
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-chart-types.png"),fullPage:true});
  console.log("PASS Chromium candle/bar/line/area types, price anchors, appearance, account isolation and local/server profiles");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
