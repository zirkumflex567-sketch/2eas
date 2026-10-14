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
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
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
  await quick.locator(".cs-ma-quick-period").fill("1000");
  await quick.getByRole("button",{name:"EMA mit gewählter Periode hinzufügen"}).click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),true);
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,1000);
  await quick.getByRole("button",{name:"EMAs einstellen"}).click();
  assert.equal(await page.locator(".cs-ma-editor").isVisible(),true);
  await page.locator('[data-instance="ma1"] [data-action="remove"]').click();
  await page.locator("#cs-beta-toggle").click();
  assert.equal(await page.locator("#cs-beta-panel").isVisible(),false);
  // Invalid quick-entry cannot add an EMA.
  await quick.locator(".cs-ma-quick-period").fill("1001");
  await quick.getByRole("button",{name:"EMA mit gewählter Periode hinzufügen"}).click();
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),0);
  await quick.locator(".cs-ma-quick-period").fill("34");
  await page.locator("#cs-beta-toggle").click();
  const catalog=page.locator(".cs-catalog");
  assert.equal(await catalog.isVisible(),true);
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("weighted moving");
  assert.equal(await catalog.locator(".cs-catalog-entry").count(),1);
  await catalog.locator('[data-indicator="wma"] button').click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].type,"WMA");
  await areaCleanup();
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("Wilder");
  await catalog.locator('[data-indicator="rma"] button').click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].type,"RMA");
  await areaCleanup();
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("Smoothed");
  await catalog.locator('[data-indicator="smma"] button').click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].type,"SMMA");
  await areaCleanup();
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("RSI");
  await catalog.locator('[data-indicator="rsi"] button').click();
  assert.equal((await page.evaluate(()=>ChartStudioOscillators.settings())).length,1);
  await page.evaluate(()=>ChartStudioOscillators.applySettings([]));
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("");
  assert.deepEqual(await catalog.locator(".cs-catalog-entry").evaluateAll(rows=>rows.map(row=>row.dataset.indicator)),
   ["ema","sma","wma","rma","smma","rsi","macd","atr","adx","volume","vwap"],
   "The searchable catalog lists each P0 indicator family");
  async function areaCleanup(){
    await page.locator('[data-instance="ma1"] [data-action="remove"]').click();
  }
  const area=page.locator(".cs-ma-editor");
  assert.equal(await area.isVisible(),true);
  await area.locator(".cs-ma-presets button").first().click();
  const periodControl=area.locator('[data-instance="ma1"] [data-field="period"]');
  assert.equal(await periodControl.getAttribute("min"),"1");
  assert.equal(await periodControl.getAttribute("max"),"1000");
  await periodControl.fill("1");await periodControl.press("Tab");
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,1);
  await periodControl.fill("34");
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
  const shiftControl=area.locator('[data-instance="ma1"] [data-field="displayShift"]');
  assert.equal(await shiftControl.getAttribute("min"),"-500");
  assert.equal(await shiftControl.getAttribute("max"),"500");
  await shiftControl.fill("2");await shiftControl.press("Tab");
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].displayShift,2);
  const aligned=await page.evaluate(()=>{
   const bars=window.__chartSmokeCandles,source=bars[98],target=bars[100];
   const point=ChartStudioAverages.calculate(bars,"EMA",34,"hlc3").find(x=>x.time===source.time);
   return {display:ChartStudioAverages.readout(target.time),expected:point.value.toFixed(2)};
  });
  assert.ok(aligned.display.includes("Trend EMA 34 "+aligned.expected),"Shifted readout value aligns with its destination candle");
  const edge=await page.evaluate(()=>{
   const bars=window.__chartSmokeCandles;
   ChartStudioAverages.edit("ma1","period",1);
   ChartStudioAverages.edit("ma1","displayShift",-1);
   return ChartStudioAverages.readout(bars.at(-1).time);
  });
  assert.ok(edge.includes("Anzeigeversatz")&&edge.includes("außerhalb geladener Kerzen"),"Shift gap is distinct from indicator warm-up");
  await page.evaluate(()=>{ChartStudioAverages.edit("ma1","period",34);ChartStudioAverages.edit("ma1","displayShift",2)});
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
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].displayShift,2);
  // Account isolation, including persisted original.
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),0);
  assert.equal(await page.evaluate(()=>ChartStudioAverages.diagnostics().seriesCount),0);
  await area.locator(".cs-ma-presets button").nth(2).click();
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,50);
  await page.evaluate(()=>ChartStudioAverages.edit("ma1","visible",false));
  const maPreset=area.getByRole("button",{name:"EMA 9/21/50 Preset"});
  await maPreset.click();
  let presetConfigs=await page.evaluate(()=>ChartStudioAverages.getConfigs());
  assert.deepEqual(Array.from(presetConfigs.map(x=>x.period)).sort((a,b)=>a-b),[9,21,50]);
  assert.equal(presetConfigs.find(x=>x.period===50).visible,true,"Preset re-enables matching hidden instances");
  await maPreset.click();
  presetConfigs=await page.evaluate(()=>ChartStudioAverages.getConfigs());
  assert.equal(presetConfigs.length,3,"Repeated preset is idempotent and adds no duplicates");
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
  assert.equal(await page.evaluate(()=>ChartStudioAverages.getConfigs().length),2);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.deepEqual(Array.from((await page.evaluate(()=>ChartStudioAverages.getConfigs())).map(x=>x.period)).sort((a,b)=>a-b),[9,21,50]);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  const volumeToggle=page.locator('.cs-indicator-control input[type="checkbox"][data-kind="volume"]');
  await volumeToggle.check();
  const upColor=page.locator('.cs-indicator-control input[type="color"][data-kind="volume"][data-parameter="upColor"]');
  const downColor=page.locator('.cs-indicator-control input[type="color"][data-kind="volume"][data-parameter="downColor"]');
  await upColor.evaluate(el=>{el.value="#112233";el.dispatchEvent(new Event("change",{bubbles:true}))});
  await downColor.evaluate(el=>{el.value="#445566";el.dispatchEvent(new Event("change",{bubbles:true}))});
  assert.deepEqual(await page.evaluate(()=>ChartStudioIndicators.settings().volume),
    {enabled:true,upColor:"#112233",downColor:"#445566"});
  const volumeColorsValid=await page.evaluate(()=>{
    const bars=window.__chartSmokeCandles,rows=ChartStudioIndicators.calculate("volume",bars,
      ChartStudioIndicators.settings().volume).volume;
    return rows.every(row=>{
      const bar=bars.find(item=>item.time===row.time);
      return (row.kind==="tick"||row.kind==="real")&&row.color===(bar.close>=bar.open?"#112233":"#445566");
    });
  });
  assert.equal(volumeColorsValid,true,"Volume colors follow candle direction without changing provenance");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.deepEqual(await page.evaluate(()=>ChartStudioIndicators.settings().volume),
    {enabled:false,upColor:"#41cce9",downColor:"#f7758b"});
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.deepEqual(await page.evaluate(()=>ChartStudioIndicators.settings().volume),
    {enabled:true,upColor:"#112233",downColor:"#445566"});
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
  assert.equal(saved.movingAverages[0].displayShift,2);
  assert.deepEqual(saved.indicators.volume,{enabled:true,upColor:"#112233",downColor:"#445566"});
  await page.evaluate(()=>ChartStudioIndicators.updateConfig("volume","upColor","#aabbcc"));
  await area.locator('[data-instance="ma1"] [data-field="period"]').fill("77");
  await area.locator('[data-instance="ma1"] [data-field="period"]').press("Tab");
  await sb.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
  assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].displayShift,2);
  assert.deepEqual(await page.evaluate(()=>ChartStudioIndicators.settings().volume),
    {enabled:true,upColor:"#112233",downColor:"#445566"});
  assert.equal(await page.evaluate(secret=>Object.values(localStorage).some(v=>v.includes(secret)),secret),false);
  const limit=await page.evaluate(()=>{
   const configs=Array.from({length:16},(_,index)=>({id:"limit"+index,type:"EMA",period:100+index,
    source:"close",color:"#68dfff",lineWidth:1,visible:true,label:"",displayShift:0}));
   ChartStudioAverages.applySettings(configs);
   const before=JSON.stringify(ChartStudioAverages.getConfigs());
   const applied=ChartStudioAverages.applyPreset();
   return {applied,count:ChartStudioAverages.getConfigs().length,unchanged:JSON.stringify(ChartStudioAverages.getConfigs())===before};
  });
  assert.deepEqual(limit,{applied:false,count:16,unchanged:true},"Preset must fail atomically at instance limit");
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(x=>x.url.includes("/api/chart/v1/workspace")));
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-multi-ma.png"),fullPage:true});
  console.log("PASS Chromium multi-MA editing, live overlays, duplicate/remove, local+server profiles, account isolation");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
