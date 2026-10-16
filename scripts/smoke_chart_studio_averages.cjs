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
  const errors=[],requests=[],footprintReads=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{if(req.method()!=="GET")requests.push({method:req.method(),url:req.url()})});
  let footprintBody={source:"MT5_VERIFIED",canExecute:false,status:"UNAVAILABLE",reason:"NO_VERIFIED_EXECUTIONS",levels:[]};
  await page.route("**/api/chart/v1/footprint**",async route=>{
   const req=route.request(),url=new URL(req.url());
   footprintReads.push({method:req.method(),account:url.searchParams.get("account"),symbol:url.searchParams.get("symbol"),timeframe:url.searchParams.get("timeframe")});
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    ...footprintBody,account:url.searchParams.get("account"),symbol:url.searchParams.get("symbol"),timeframe:url.searchParams.get("timeframe")})});
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
   ["ema","sma","wma","rma","smma","rsi","macd","atr","adx","cci","stochastic","stochrsi","supertrend","donchian","keltner","momentum","roc","sar","obv","mfi","volume","vwap","footprint"],
   "The searchable catalog lists each registered indicator family");
  assert.equal(await catalog.getByRole("searchbox",{name:"Indikator suchen"}).inputValue(),"");
  await catalog.getByRole("searchbox",{name:"Indikator suchen"}).fill("Footprint");
  const footprint= catalog.locator('[data-indicator="footprint"]');
  assert.equal(await footprint.count(),1);
  await footprint.getByRole("button",{name:"Footprint-Daten prüfen"}).click();
  await page.getByText(/UNAVAILABLE.*keine verifizierten Ausführungen/i).waitFor();
  assert.deepEqual(footprintReads,[{method:"GET",account:"titan",symbol:"XAUUSD",timeframe:"M15"}],
   "Footprint is an explicit, account/symbol/timeframe-scoped read only");
  footprintBody={source:"MT5_VERIFIED",canExecute:false,status:"AVAILABLE",reason:null,executionCount:2,
   tickCount:2,ignoredTickCount:0,barOpenUtc:"2026-10-16T08:00:00Z",
   levels:[{price:"4010.2",buyVolume:"0.3",sellVolume:"0.1",delta:"0.2",trades:2}]};
  await footprint.getByRole("button",{name:"Footprint-Daten prüfen"}).click();
  await page.getByText(/AVAILABLE.*2 verifizierte Ausführungen/).waitFor();
  assert.equal(await page.locator(".cs-footprint-levels tbody tr").count(),1);
  assert.deepEqual(await page.locator(".cs-footprint-levels tbody tr").first().locator("td").allTextContents(),
   ["4010.2","0.3","0.1","0.2","2"],"Only the verified execution-side levels are rendered");
  footprintBody={source:"MT5_VERIFIED",canExecute:false,status:"AVAILABLE",reason:null,executionCount:1,
   tickCount:1,ignoredTickCount:0,barOpenUtc:"2026-10-16T08:00:00Z",
   levels:[{price:"NaN",buyVolume:"0.3",sellVolume:"0.1",delta:"0.2",trades:1}]};
  await footprint.getByRole("button",{name:"Footprint-Daten prüfen"}).click();
  await page.getByText(/UNAVAILABLE.*nicht verifiziert/i).waitFor();
  assert.equal(await page.locator(".cs-footprint-levels tbody tr").count(),0,
   "Malformed broker-decimal strings are never rendered as footprint levels");
  footprintBody={source:"MT5_VERIFIED",canExecute:false,status:"UNAVAILABLE",reason:"CANDLE_TIME_FUTURE",levels:[]};
  await footprint.getByRole("button",{name:"Footprint-Daten prüfen"}).click();
  await page.getByText(/UNAVAILABLE.*UTC-Zeitstempel in der Zukunft/i).waitFor();
  assert.deepEqual(footprintReads,[
   {method:"GET",account:"titan",symbol:"XAUUSD",timeframe:"M15"},
   {method:"GET",account:"titan",symbol:"XAUUSD",timeframe:"M15"},
   {method:"GET",account:"titan",symbol:"XAUUSD",timeframe:"M15"},
   {method:"GET",account:"titan",symbol:"XAUUSD",timeframe:"M15"}
  ]);
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
  // Server sync is feature-gated and stays unavailable in this smoke environment.
  const sb=page.locator(".cs-server-sync");
  assert.equal(await sb.locator('input[type="password"]').count(),0,"legacy bearer login is absent");
  assert.equal(await sb.locator('[aria-label="Recovery-Paket"]').count(),1);
  assert.equal(await sb.getByRole("button",{name:"Aktuelles Layout verschlüsselt speichern"}).isDisabled(),true,
    "encrypted server sync remains unavailable unless the server explicitly enables it");
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
  assert.deepEqual(requests,[],"no plaintext workspace writes are sent while encrypted sync is disabled");
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-multi-ma.png"),fullPage:true});
  console.log("PASS Chromium multi-MA editing, live overlays, duplicate/remove, local profiles, account isolation and fail-closed sync");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
