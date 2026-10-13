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
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:1.5});
  const consoleErrors=[];page.on("pageerror",e=>consoleErrors.push(e.message));
  let requests=[],scenarioPayloads=[],brokerReadRequests=[],failBrokerReads=false,cursorExpired=false,deferTitanPositions=false,releaseTitanPositions=null;
  page.on("request",req=>{if(req.method()==="POST")requests.push(req.url())});
  await page.route("**/api/chart/v1/scenarios/preview*",async route=>{
    const req=route.request().postDataJSON();
    scenarioPayloads.push(req);
    assert.equal(req.account,"titan");
    assert.equal(req.symbol,"XAUUSD");
    const budget=req.riskBudget??(req.riskPercent==null?null:10000*req.riskPercent/100);
    const volume=req.volumeLots??Math.floor(budget/Math.abs(req.slPrice-req.entryPrice)*100/100)/100;
    const sign=req.side==="BUY"?1:-1;
    const risk=Number(((req.slPrice-req.entryPrice)*volume*100*sign).toFixed(2));
    const reward=Number(((req.tpPrice-req.entryPrice)*volume*100*sign).toFixed(2));
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({account:"titan",canExecute:false,pnlAtSl:{amount:risk,currency:"USD"},
      pnlAtTp:{amount:reward,currency:"USD"},margin:{amount:95,currency:"USD"},
      riskRewardRatio:Number((reward/-risk).toFixed(3)),tickSize:0.01,
      positionSizing:req.volumeLots==null?{mode:req.riskBudget==null?"EQUITY_PERCENT":"RISK_BUDGET",volumeLots:volume,riskBudget:budget,grossStopRisk:-risk,currency:"USD"}:{mode:"FIXED_LOTS",volumeLots:volume,currency:"USD"}})});
  });
  await page.route("**/api/chart/v1/positions?*",async route=>{
    const url=new URL(route.request().url());brokerReadRequests.push({path:url.pathname,url:url.pathname,params:Object.fromEntries(url.searchParams)});
    if(failBrokerReads)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"broker unavailable"})});
    if(deferTitanPositions&&url.searchParams.get("account")==="titan")await new Promise(resolve=>{releaseTitanPositions=resolve});
    const positionTicket=url.searchParams.get("account")==="goldm15"?"22":"9007199254740993";
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({account:url.searchParams.get("account"),login:url.searchParams.get("account")==="goldm15"?"53090070":"53087839",server:"ICMarketsEU-Demo",source:"MT5_VERIFIED",canExecute:false,symbol:"XAUUSD",currency:"USD",marginMode:2,quote:{freshness:"FRESH"},positions:[{ticket:positionTicket,type:"BUY",volume:"0.1",price_open:"4000",sl:"3990",tp:null,profit:"10",swap:"-1",ownership:"MANUAL",currency:"USD"}],orders:[{ticket:"9007199254740995",type:"BUY_LIMIT",volume_current:"0.2",price_open:"3995",sl:null,tp:"4010",ownership:"UNKNOWN"}]})});
  });
  await page.route("**/api/chart/v1/trades?*",async route=>{
    const url=new URL(route.request().url());brokerReadRequests.push({path:url.pathname,url:url.pathname,params:Object.fromEntries(url.searchParams)});
    if(cursorExpired&&url.searchParams.has("cursor"))return route.fulfill({status:410,contentType:"application/json",body:JSON.stringify({detail:{code:"CURSOR_INVALID",message:"restart"}})});
    if(failBrokerReads)return route.fulfill({status:422,contentType:"application/json",body:JSON.stringify({detail:"invalid UTC range"})});
    const deal={ticket:"9007199254740993",orderTicket:"9007199254740994",positionIdentifier:"9007199254740995",type:"BUY",side:"BUY",entry:"IN",status:"EXECUTED",price:"4000.05",volume:"0.1",profit:"1.25",commission:"-0.25",swap:"-0.5",fee:"-0.1",currency:"USD",ownership:"MANUAL",source:"MT5_VERIFIED",canExecute:false};
    const cursor=url.searchParams.get("cursor")==="cursor-next"?"cursor-third":url.searchParams.has("cursor")?null:"cursor-next";
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({account:url.searchParams.get("account"),symbol:"XAUUSD",currency:"USD",source:"MT5_VERIFIED",canExecute:false,fromUtc:url.searchParams.get("fromUtc"),toUtc:url.searchParams.get("toUtc"),asOfUtc:"2026-10-14T00:00:00Z",limit:100,trades:url.searchParams.has("cursor")?[]:[deal],nextCursor:cursor,omittedCategories:[]})});
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
  await page.locator(".cs-broker-read-panel").waitFor({state:"visible"});
  await page.locator(".cs-broker-read-panel summary").click();
  await page.waitForFunction(()=>document.querySelectorAll("#cs-broker-positions tbody tr").length===1);
  assert.equal(await page.locator("#cs-broker-positions tbody tr").first().locator("td").nth(0).textContent(),"9007199254740993");
  assert.equal(await page.locator("#cs-broker-orders tbody tr").count(),1);
  assert.ok((await page.locator("#cs-broker-positions-status").textContent()).includes("MT5_VERIFIED"));
  assert.ok(brokerReadRequests.some(r=>r.path.endsWith("/positions")&&r.params.account==="titan"&&r.params.symbol==="XAUUSD"));
  await page.evaluate(()=>history.replaceState({},"","/stt/static/chart-studio-fixture.html"));
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  await page.waitForFunction(()=>document.querySelector("#cs-broker-positions tbody tr td")?.textContent==="22");
  assert.ok(brokerReadRequests.filter(r=>r.path.endsWith("/positions")).at(-1).url.startsWith("/stt/api/"));
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  await page.waitForFunction(()=>document.querySelector("#cs-broker-positions tbody tr td")?.textContent==="9007199254740993");
  await page.locator("#cs-broker-history-load").click();
  await page.waitForFunction(()=>document.querySelectorAll("#cs-broker-trades tbody tr").length===1);
  assert.equal(await page.locator("#cs-broker-trades tbody tr").first().locator("td").nth(0).textContent(),"9007199254740993");
  assert.ok(brokerReadRequests.some(r=>r.path.endsWith("/trades")&&r.params.fromUtc?.endsWith("Z")&&r.params.toUtc?.endsWith("Z")));
  assert.equal(brokerReadRequests.filter(r=>r.path.endsWith("/trades"))[0].params.limit,"50");
  const tradeRequestsBeforeInvalidDate=brokerReadRequests.filter(r=>r.path.endsWith("/trades")).length;
  await page.evaluate(()=>{const input=document.querySelector('.cs-broker-read-panel [name="fromUtc"]');input.type="text";input.value="2026-02-31";input.dispatchEvent(new Event("change",{bubbles:true}));});
  await page.evaluate(()=>document.querySelector("#cs-broker-history-load").click());
  assert.match(await page.locator("#cs-broker-history-status").textContent(),/gültige UTC-Kalenderdaten/);
  assert.equal(brokerReadRequests.filter(r=>r.path.endsWith("/trades")).length,tradeRequestsBeforeInvalidDate,"invalid calendar date must not issue a history request");
  await page.evaluate(()=>{const input=document.querySelector('.cs-broker-read-panel [name="fromUtc"]');input.type="date";input.value="2026-10-08";input.dispatchEvent(new Event("change",{bubbles:true}));});
  await page.locator('.cs-broker-read-panel [name="toUtc"]').fill("2026-10-14");
  await page.locator('.cs-broker-read-panel [name="ticket"]').fill("123");
  await page.locator('.cs-broker-read-panel [name="magic"]').fill("42");
  await page.locator('.cs-broker-read-panel [name="ownership"]').selectOption("MANUAL");
  await page.evaluate(()=>document.querySelector("#cs-broker-history-load").click());
  await page.waitForFunction(()=>!document.querySelector("#cs-broker-history-status").textContent.includes("Deal-Historie wird gelesen"),{timeout:5000});
  const filteredHistory=brokerReadRequests.filter(r=>r.path.endsWith("/trades")).at(-1).params;
  assert.equal(filteredHistory.ticket,"123");assert.equal(filteredHistory.magic,"42");assert.equal(filteredHistory.manual,"true");
  await page.evaluate(()=>document.querySelector("#cs-broker-history-next").click());
  await page.waitForFunction(()=>document.querySelectorAll("#cs-broker-trades tbody tr").length===0);
  assert.equal(brokerReadRequests.filter(r=>r.path.endsWith("/trades"))[2].params.cursor,"cursor-next");
  cursorExpired=true;
  await page.evaluate(()=>document.querySelector("#cs-broker-history-next").click());
  await page.waitForFunction(()=>document.querySelector("#cs-broker-history-status").textContent.includes("neu starten"));
  assert.equal(await page.locator("#cs-broker-history-next").isDisabled(),true);
  cursorExpired=false;
  failBrokerReads=true;
  await page.locator("#cs-broker-positions-refresh").click();
  await page.waitForFunction(()=>document.querySelector("#cs-broker-positions-status").textContent.includes("Brokerdaten sind"));
  failBrokerReads=false;
  deferTitanPositions=true;
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  for(let i=0;i<50&&!releaseTitanPositions;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(typeof releaseTitanPositions,"function","Titan response should be held for the account-race check");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  await page.waitForFunction(()=>document.querySelector("#cs-broker-positions tbody tr td")?.textContent==="22");
  const goldPositionQuery=brokerReadRequests.filter(r=>r.path.endsWith("/positions")).at(-1).params;
  assert.equal(goldPositionQuery.ticket,undefined);assert.equal(goldPositionQuery.magic,undefined);assert.equal(goldPositionQuery.manual,undefined);
  releaseTitanPositions();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(await page.locator("#cs-broker-positions tbody tr td").first().textContent(),"22");
  deferTitanPositions=false;releaseTitanPositions=null;
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  await page.waitForFunction(()=>document.querySelector("#cs-broker-positions tbody tr td")?.textContent==="9007199254740993");
  failBrokerReads=true;
  await page.locator("#cs-broker-history-load").click();
  await page.waitForFunction(()=>document.querySelector("#cs-broker-history-status").textContent.includes("HTTP 422"));
  failBrokerReads=false;
  // Keyboard navigation must work in studio, never hijack edit fields.
  await page.keyboard.press("h");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"horizontal");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"cursor");
  await page.locator(".cs-ma-quick-period").focus();
  await page.keyboard.press("f");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"cursor");
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press("Control+z"); // harmless even with empty undo stack
  await page.keyboard.press("c");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"channel");
  await page.keyboard.press("v");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().tool),"cursor");

  await page.locator('.cs-indicator-control input[data-kind="rsi"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="rsi"]',{state:"visible"});
  await page.locator('.cs-indicator-control input[data-kind="macd"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="macd"]',{state:"visible"});
  await page.locator('.cs-indicator-control input[data-kind="volume"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="volume"]',{state:"visible"});
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().rsi.enabled),true);
  await page.locator('.cs-indicator-control input[data-kind="adx"][type="checkbox"]').check();
  await page.waitForSelector('.cs-indicator-pane[data-indicator="adx"]',{state:"visible"});
  await page.locator('.cs-indicator-control input[data-kind="vwap"][type="checkbox"]').check();
  assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().vwap.enabled),true);
  await page.locator('[data-opt="sma20"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.sma20),true);
  await page.locator('[data-opt="positions"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().options.positions),true);
  await page.locator('[data-tool="horizontal"]').click();
  await page.locator("canvas.cs-beta-canvas").scrollIntoViewIfNeeded();
  let cv=await page.locator("canvas.cs-beta-canvas").boundingBox();
  assert.ok(cv && cv.width>200 && cv.height>200);
  await page.mouse.click(cv.x+cv.width*.35,cv.y+cv.height*.45);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1);
  await page.locator('[data-tool="fib"]').click();
  await page.locator("canvas.cs-beta-canvas").scrollIntoViewIfNeeded();
  cv=await page.locator("canvas.cs-beta-canvas").boundingBox();
  await page.mouse.click(cv.x+cv.width*.42,cv.y+cv.height*.30);
  await page.mouse.click(cv.x+cv.width*.60,cv.y+cv.height*.62);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  await page.locator('[data-cmd="undo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1);
  await page.locator('[data-cmd="redo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  async function addDrawing(kind,positions){
    await page.locator('[data-tool="'+kind+'"]').click();
    const canvas=page.locator("canvas.cs-beta-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const box=await canvas.boundingBox();
    assert.ok(box&&box.width>250&&box.height>250);
    for(const [fx,fy] of positions)await page.mouse.click(box.x+box.width*fx,box.y+box.height*fy);
  }
  await addDrawing("ray",[[.25,.34],[.45,.39]]);
  await addDrawing("ruler",[[.34,.40],[.48,.55]]);
  await addDrawing("channel",[[.30,.33],[.51,.44],[.39,.59]]);
  assert.deepEqual(await page.evaluate(()=>ChartStudioBeta.getState().drawings.slice(2).map(o=>o.kind)),
     ["ray","ruler","channel"]);
  const channel=await page.evaluate(()=>ChartStudioBeta.getState().drawings.at(-1));
  assert.equal(channel.anchors.length,3);
  await page.locator('[data-cmd="magnet"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().magnet),true);
  await page.locator('[data-cmd="magnet"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().magnet),false);
  // An actual handle should select/delete one object only; Undo restores.
  await page.locator('[data-tool="edit"]').click();
  await page.locator("canvas.cs-beta-canvas").scrollIntoViewIfNeeded();
  const selectedAnchor=await page.evaluate(()=>ChartStudioBeta.getState().drawings[4].anchors[2]);
  const cursor=await page.evaluate(anchor=>({
    x:chart.timeScale().timeToCoordinate(anchor.time),
    y:candleSeries.priceToCoordinate(anchor.price)
  }),selectedAnchor);
  const editRect=await page.locator("canvas.cs-beta-canvas").boundingBox();
  await page.mouse.click(editRect.x+cursor.x,editRect.y+cursor.y);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().selected),4);
  await page.locator('[data-cmd="delete-selected"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),4);
  await page.locator('[data-cmd="undo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),5);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),0);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),5);
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
  await page.locator('[name="lotMode"]').selectOption("BUDGET");
  await page.locator('[name="riskBudget"]').fill("50");
  await page.locator('#cs-scenario-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#cs-scenario-result").textContent.includes("Budget 50 USD"));
  assert.equal(scenarioPayloads.at(-1).volumeLots,null);
  assert.equal(scenarioPayloads.at(-1).riskBudget,50);
  await page.locator('[name="lotMode"]').selectOption("FIXED");
  await page.locator('[name="volumeLots"]').fill("0.1");
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
