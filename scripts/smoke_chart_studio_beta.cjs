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
    const sign=req.side==="BUY"?1:-1;
    const risk=Number(((req.slPrice-req.entryPrice)*req.volumeLots*100*sign).toFixed(2));
    const reward=Number(((req.tpPrice-req.entryPrice)*req.volumeLots*100*sign).toFixed(2));
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({account:"titan",canExecute:false,pnlAtSl:{amount:risk,currency:"USD"},
      pnlAtTp:{amount:reward,currency:"USD"},margin:{amount:95,currency:"USD"},
      riskRewardRatio:Number((reward/-risk).toFixed(3)),tickSize:0.01})});
  });
  const serverLayouts=new Map(),storageToken="fixture-chart-workspace-token-123456789-abcdef";
  let credentialLeak=false,serverWrites=0;
  page.on("request",req=>{if(req.url().includes(storageToken))credentialLeak=true});
  await page.route("**/api/chart/v1/workspace**",async route=>{
    const req=route.request(),url=new URL(req.url()),isList=url.pathname.endsWith("/workspaces");
    const respond=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(req.headers()["authorization"]!=="Bearer "+storageToken)return respond(401,{detail:"Unauthorized"});
    const body=req.method()==="GET"?Object.fromEntries(url.searchParams.entries()):req.postDataJSON();
    const {account,name}=body,symbol=body.symbol||"XAUUSD";
    if(!["titan","goldm15"].includes(account))return respond(422,{detail:"Account mismatch"});
    const key=account+":"+symbol+":"+name,row=serverLayouts.get(key);
    if(isList)return respond(200,{account,symbol,items:[...serverLayouts.entries()]
       .filter(([k])=>k.startsWith(account+":"+symbol+":"))
       .map(([k,v])=>({name:k.split(":").slice(2).join(":"),revision:v.revision,updatedUtc:10}))});
    if(req.method()==="GET")return row?respond(200,{account,symbol,name,...row,updatedUtc:10}):respond(404,{detail:"Missing"});
    if(req.method()==="PUT"){
      if((row?.revision||0)!==body.expectedRevision)return respond(409,{detail:{code:"REVISION_CONFLICT",message:"Workspace changed"}});
      const next={revision:(row?.revision||0)+1,document:body.document};
      serverLayouts.set(key,next);serverWrites++;
      return respond(200,{account,symbol,name,...next,updatedUtc:10});
    }
    if(req.method()==="DELETE"){
      if(!row)return respond(404,{detail:"Missing"});
      if(row.revision!==body.expectedRevision)return respond(409,{detail:"Conflict"});
      serverLayouts.delete(key);return respond(200,{deleted:true,name});
    }
    return respond(405,{detail:"Unsupported"});
  });
  await page.goto("http://127.0.0.1:8864/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),true);
  await page.locator('.cs-indicator-control input[data-kind="rsi"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="rsi"]',{state:"visible"});
  await page.locator('.cs-indicator-control input[data-kind="macd"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="macd"]',{state:"visible"});
  await page.locator('.cs-indicator-control input[data-kind="volume"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="volume"]',{state:"visible"});
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),true);
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
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),true);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),false);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),true);
  await page.locator(".cs-scenario summary").click();
  await page.locator('[name="volumeLots"]').fill("0.1");
  await page.locator('[name="entryPrice"]').fill("4100");
  await page.locator('[name="slPrice"]').fill("4090");
  await page.locator('[name="tpPrice"]').fill("4120");
  await page.locator('#cs-scenario-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#cs-scenario-result").textContent.includes("KEINE ORDER"));
  // Drag only a VIRTUAL plan stop: the scenario API remains read-only.
  const beforePlan=await page.evaluate(()=>ChartStudioBeta.getState().scenario.slPrice);
  const planY=await page.evaluate(()=>candleSeries.priceToCoordinate(4100-10));
  await page.locator('[data-cmd="drag-plan"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"plan");
  // Keep the target visible after the open What-if panel increases document height.
  await page.locator("canvas.cs-beta-canvas").scrollIntoViewIfNeeded();
  // Toolbar click may scroll document. Re-measure the chart AFTER the click.
  const pbox=await page.locator("canvas.cs-beta-canvas").boundingBox();
  assert.ok(Number.isFinite(planY)&&pbox&&planY>=0&&planY<pbox.height,
    "Plan stop handle must be inside visible price pane");
  const px=pbox.x+pbox.width*.45,py=pbox.y+planY;
  await page.mouse.move(px,py);
  await page.mouse.down();
  await page.mouse.move(px,py-27,{steps:5});
  await page.mouse.up();
  const draftDebug=await page.evaluate(()=>({
    state:ChartStudioBeta.getState().scenario,
    output:document.querySelector("#cs-scenario-result").textContent,
    pointer:document.elementFromPoint(window.innerWidth*.45,Math.max(0,window.innerHeight*.45))?.tagName
  }));
  console.log("Chart Studio plan drag observed:",JSON.stringify({draftDebug,requests:requests.length}));
  await page.waitForFunction(()=>{
    const state=ChartStudioBeta.getState();
    return state.scenario&&state.scenario.slPrice!==4090&&
      document.querySelector("#cs-scenario-result").textContent.startsWith("PLAN · Stop ")&&
      document.querySelector("#cs-scenario-result").textContent.includes("KEINE ORDER");
  },{timeout:15000});
  const afterPlan=await page.evaluate(()=>ChartStudioBeta.getState().scenario.slPrice);
  assert.notEqual(afterPlan,beforePlan);
  assert.ok(requests.length>=2);
  const money=await page.locator("#cs-scenario-result").textContent();
  assert.ok(money.includes("Stop "+Number(((afterPlan-4100)*0.1*100).toFixed(2))+" USD"),
    "USD risk must reflect the broker-priced new stop rather than old UI value");
  assert.ok(requests.every(url=>url.includes("/api/chart/v1/scenarios/preview")),
    "No broker modify/order-send request may be used during drag");
  // Opt-in server layout store round-trip; scoped by active account and version.
  const sb=page.locator(".cs-server-sync");
  await sb.locator('input[type="password"]').fill(storageToken);
  await sb.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await sb.getByRole("textbox",{name:"Neuer Layoutname"}).fill("ServerSetup");
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  assert.equal(serverLayouts.get("titan:XAUUSD:ServerSetup").revision,1);
  const nDrawings=await page.evaluate(()=>ChartStudioBeta.getState().drawings.length);
  await page.locator('[data-opt="sma20"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),false);
  await sb.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),nDrawings);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),true);
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),true);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für goldm15"));
  assert.equal(await sb.getByRole("combobox",{name:"Server-Layout wählen"}).locator("option").count(),1);
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  assert.equal(serverLayouts.get("goldm15:XAUUSD:ServerSetup").revision,1);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  serverLayouts.get("titan:XAUUSD:ServerSetup").revision=2;
  await sb.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("Versionskonflikt"));
  assert.equal(serverWrites,2,"Stale client may never overwrite another revision");
  assert.equal(credentialLeak,false);
  assert.equal(await page.evaluate(secret=>Object.values(localStorage).some(value=>value.includes(secret)),storageToken),false);
  await sb.getByRole("button",{name:"Trennen"}).click();
  assert.equal(await sb.locator('input[type="password"]').inputValue(),"");
  assert.deepEqual(consoleErrors,[]);
  const output=path.join("output","visual-smoke");
  fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,"chart-studio-beta.png"),fullPage:true});
  console.log("PASS Chromium beta UI: indicators, drawing/Fibo, undo, account isolation, scenario preview, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
