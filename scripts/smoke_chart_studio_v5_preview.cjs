"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const {chromium}=require("playwright");

const root=path.resolve(__dirname,"..");
const html=enabled=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.CHART_STUDIO_V5_PREVIEW_ENABLED=${enabled};window.__v4Updates=0;</script>
<script src="static/chart-studio-v5-feed.js"></script><script src="static/chart-studio-v5-preview.js"></script>
<style>body{margin:0;background:#07111a;color:#e6f4f8;font:14px sans-serif}#tv-chart{height:300px;width:500px}#chart-v5-preview-host{height:420px;width:700px}</style></head><body>
<div id="tv-chart"><canvas id="v4-sentinel" width="500" height="300"></canvas></div>
<button type="button" id="chart-v5-preview-btn" aria-controls="chart-v5-preview-panel" aria-expanded="false" hidden>V5 Vorschau</button>
<section id="chart-v5-preview-panel" hidden><strong id="chart-v5-preview-title">Native v5</strong><div id="chart-v5-preview-status" role="status"></div>
<button type="button" id="chart-v5-auto-fib-btn" aria-pressed="false" disabled>Auto-Fibonacci einblenden</button><output id="chart-v5-auto-fib-status" aria-live="polite"></output><button type="button" id="chart-v5-layout-export-btn" disabled>Layout exportieren</button><button type="button" id="chart-v5-layout-import-btn" disabled>Layout zusammenführen</button><button type="button" id="chart-v5-layout-replace-btn" disabled>Layout ersetzen</button><input id="chart-v5-layout-import-file" type="file" accept="application/json,.json" hidden>
<div id="chart-v5-drawing-tools" role="group" aria-label="Native v5 Zeichnungen"><button type="button" id="chart-v5-trend-btn" aria-pressed="false" disabled>Trendlinie</button><button type="button" id="chart-v5-ray-btn" aria-pressed="false" disabled>Strahl</button><output id="chart-v5-drawing-status" role="status" aria-live="polite">Zeichenwerkzeug aus.</output></div>
<div id="chart-v5-preview-host"></div><p>Read only. Powered by <a href="https://www.tradingview.com/">TradingView Lightweight Charts™</a></p></section><script>document.addEventListener("DOMContentLoaded",()=>document.querySelector("#chart-v5-preview-host").addEventListener("chartstudio-v5-drawing-state",e=>window.__v5LastDrawing=e.detail));</script></body></html>`;

const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/"||pathname==="/stt/"){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html(new URL(req.url,"http://localhost").searchParams.get("enabled")==="1"));return;
 }
 const normalized=pathname.replace(/^\/stt(?=\/)/,"");
 if(!normalized.startsWith("/static/")){res.writeHead(404);res.end();return}
 const target=path.resolve(root,normalized.slice(1));
 if(!target.startsWith(path.join(root,"static")+path.sep)){res.writeHead(403);res.end();return}
 try{const body=fs.readFileSync(target);res.writeHead(200,{"Content-Type":target.endsWith(".js")?"text/javascript; charset=utf-8":"application/octet-stream","Cache-Control":"no-store"});res.end(body)}
 catch(_){res.writeHead(404);res.end()}
});

(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
 try{
  const off=await browser.newPage();
  await off.goto(base+"/?enabled=0");
  assert.equal(await off.locator("#chart-v5-preview-btn").evaluate(el=>el.hidden),true,"feature flag defaults off");
  assert.equal(await off.evaluate(()=>window.ChartStudioV5Preview),undefined);
  await off.close();

  const context=await browser.newContext({viewport:{width:1200,height:900},acceptDownloads:true});
  const page=await context.newPage();
  const requests=[],errors=[];
  page.on("dialog",dialog=>dialog.accept());
  page.on("request",request=>requests.push({url:request.url(),method:request.method()}));
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base+"/stt/?enabled=1");
  await page.locator("#chart-v5-preview-btn").waitFor({state:"visible"});
  assert.equal(await page.locator("#chart-v5-layout-export-btn").isDisabled(),true,"layout export stays disabled before verified chart data exists");
  assert.equal(await page.locator("#chart-v5-layout-import-btn").isDisabled(),true,"layout import stays disabled before verified chart data exists");
  assert.equal(await page.locator("#chart-v5-layout-replace-btn").isDisabled(),true,"layout replacement stays disabled before verified chart data exists");
  const candles=Array.from({length:150},(_,i)=>({time:1792108800+i*900,open:4100+i*.1,high:4102+i*.1,low:4098+i*.1,close:4101+i*.1,tick_volume:20+i,real_volume:0}));
  const swings=[[10,8],[9,7],[12,4],[14,8],[15,9],[20,12],[18,10],[17,11],[16,10]];
  swings.forEach(([high,low],index)=>{const i=141+index,base=4150; candles[i]={...candles[i],open:base+(high+low)/2,high:base+high,low:base+low,close:base+(high+low)/2}});
  const asOfUtc=candles.at(-1).time+900;
  const first=await page.evaluate(({candles,asOfUtc})=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
   window.ChartStudioV5Preview.setScope(scope);
   const token=window.ChartStudioV5Preview.beginRead();
   return window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,snapshotAsOfUtc:asOfUtc,candles},token);
  },{candles,asOfUtc});
  assert.deepEqual(first,{applied:true,candleCount:150});
  const brokerMarkers=await page.evaluate(({candles})=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"},preview=window.ChartStudioV5Preview;
   if(typeof preview.setBrokerDealMarkers!=="function")return {available:false};
   const markers=[
    {ticket:"91001",account:"titan",symbol:"XAUUSD",timeframe:"M15",side:"BUY",entry:"IN",price:4101,fillTimeUtcMs:candles[20].time*1000+250,chartTimeSeconds:candles[20].time,plotted:true,label:"BUY IN · #91001"},
    {ticket:"91002",account:"titan",symbol:"XAUUSD",timeframe:"M15",side:"SELL",entry:"OUT",price:4112,fillTimeUtcMs:candles[30].time*1000+900,chartTimeSeconds:candles[30].time,plotted:true,label:"SELL OUT · #91002"},
    {ticket:"91003",account:"titan",symbol:"XAUUSD",timeframe:"M15",side:"BUY",entry:"IN",price:4105,fillTimeUtcMs:(candles[0].time-900)*1000,chartTimeSeconds:candles[0].time-900,plotted:false,label:"BUY IN · #91003"}
   ];
   const accepted=preview.setBrokerDealMarkers({scope,source:"MT5_VERIFIED",canExecute:false,markers});
   const state=preview.inspect().brokerDealMarkers;
   const badScope=preview.setBrokerDealMarkers({scope:{...scope,account:"xau5m_m5"},source:"MT5_VERIFIED",canExecute:false,markers});
   const badSource=preview.setBrokerDealMarkers({scope,source:"SYNTHETIC",canExecute:false,markers});
   const executable=preview.setBrokerDealMarkers({scope,source:"MT5_VERIFIED",canExecute:true,markers});
   const badPrice=preview.setBrokerDealMarkers({scope,source:"MT5_VERIFIED",canExecute:false,markers:markers.map((row,index)=>index===1?{...row,price:0}:row)});
   const invalidRows=[
    [{...markers[0],account:"xau5m_m5"}],
    [{...markers[0],symbol:"XAUUSD.p"}],
    [{...markers[0],timeframe:"M5"}],
    [markers[0],{...markers[1],ticket:markers[0].ticket}],
    [{...markers[0],fillTimeUtcMs:0}],
    [{...markers[0],entry:"UNKNOWN"}]
   ].map(rows=>preview.setBrokerDealMarkers({scope,source:"MT5_VERIFIED",canExecute:false,markers:rows}));
   return {available:true,accepted,state,badScope,badSource,executable,badPrice,afterReject:preview.inspect().brokerDealMarkers,
    invalidRows,positionCount:preview.readPositions().count};
  },{candles});
  assert.equal(brokerMarkers.available,true,"v5 preview exposes the separate broker-deal marker contract");
  assert.deepEqual(brokerMarkers.accepted,{applied:true,plotted:2,unplotted:1});
  assert.equal(brokerMarkers.state.plotted,2);assert.equal(brokerMarkers.state.unplotted,1);
  assert.deepEqual(brokerMarkers.state.markers.map(row=>row.ticket),["91001","91002","91003"]);
  assert.deepEqual(brokerMarkers.badScope,{applied:false,reason:"SCOPE_MISMATCH"});
  assert.deepEqual(brokerMarkers.badSource,{applied:false,reason:"UNVERIFIED_SOURCE"});
  assert.deepEqual(brokerMarkers.executable,{applied:false,reason:"UNVERIFIED_SOURCE"});
  assert.deepEqual(brokerMarkers.badPrice,{applied:false,reason:"INVALID_MARKERS"});
  assert.deepEqual(brokerMarkers.invalidRows,Array(6).fill({applied:false,reason:"INVALID_MARKERS"}));
  assert.deepEqual(brokerMarkers.afterReject,brokerMarkers.state,"rejected snapshots leave accepted deal markers unchanged");
  assert.equal(brokerMarkers.positionCount,0,"broker fill history does not fabricate open-position lines");
  const v4Before=await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width}));
  await page.locator("#chart-v5-preview-btn").click();
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("150 verifizierte Kerzen"));
  await page.waitForFunction(()=>[...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas=>canvas.width>300&&canvas.height>200));
  const liveDealReadback=await page.evaluate(()=>window.ChartStudioV5Preview.readBrokerDealMarkers());
  assert.equal(liveDealReadback.plotted,2,"native v5 renderer retains both in-window historical fills");
  assert.equal(liveDealReadback.unplotted,1,"native v5 renderer keeps an out-of-window fill unplotted");
  const positions=await page.evaluate(()=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"},token=window.ChartStudioV5Preview.beginPositionRead();
   return window.ChartStudioV5Preview.setPositions({scope,source:"MT5_VERIFIED",canExecute:false,positions:[
    {ticket:"71001",side:"BUY",priceOpen:4161,sl:4158,tp:4168},
    {ticket:"71002",side:"SELL",priceOpen:4165,sl:4169,tp:null},
   ]},token);
  });
  assert.deepEqual(positions,{applied:true,count:5},"verified position entry/SL/TP overlays render in v5");
  assert.equal((await page.evaluate(()=>window.ChartStudioV5Preview.readPositions())).count,5);
  assert.equal((await page.evaluate(()=>window.ChartStudioV5Preview.readBrokerDealMarkers())).plotted,2,"rendering position lines preserves separate historical deal markers");
  const positionVisibility=await page.evaluate(()=>{
   const hidden=window.ChartStudioV5Preview.showPositions(false),hiddenCount=window.ChartStudioV5Preview.readPositions().count;
   const shown=window.ChartStudioV5Preview.showPositions(true),shownCount=window.ChartStudioV5Preview.readPositions().count;
   return {hidden,hiddenCount,shown,shownCount};
  });
  assert.deepEqual(positionVisibility,{hidden:true,hiddenCount:0,shown:true,shownCount:5},"the existing positions toggle controls v5 overlays without losing the verified snapshot");
  const rejectedPositions=await page.evaluate(()=>{
   const token=window.ChartStudioV5Preview.beginPositionRead();
   return window.ChartStudioV5Preview.setPositions({scope:{account:"titan",symbol:"XAUUSD",timeframe:"M15"},source:"MT5_VERIFIED",canExecute:true,positions:[]},token);
  });
  assert.deepEqual(rejectedPositions,{applied:false,reason:"UNVERIFIED_SOURCE"},"executable position responses are never rendered");
  assert.equal((await page.evaluate(()=>window.ChartStudioV5Preview.readPositions())).count,0,"unverified position data clears stale overlays");
  assert.equal(await page.locator("#chart-v5-auto-fib-btn").isEnabled(),true,"verified candle snapshot enables Auto-Fibonacci");
  await page.locator("#chart-v5-auto-fib-btn").click();
  const autoFib=await page.evaluate(()=>window.ChartStudioV5Preview.readAutoFibonacci());
  assert.ok(autoFib,await page.locator("#chart-v5-auto-fib-status").textContent());
  assert.equal(autoFib.result.available,true,"Auto-Fibonacci uses the verified M15 snapshot");
  assert.equal(autoFib.result.source,"MT5_VERIFIED");
  assert.equal(autoFib.asOf.timeUtc,asOfUtc);
  assert.equal(autoFib.series.length,7);
  assert.ok(autoFib.series.every(line=>line.points.length>0));
  assert.equal(await page.locator("#chart-v5-auto-fib-btn").getAttribute("aria-pressed"),"true");
  await page.locator("#chart-v5-auto-fib-btn").click();
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.readAutoFibonacci()),null,"turning off Auto-Fibonacci removes its native lines");
  assert.equal(await page.locator("#chart-v5-trend-btn").isEnabled(),true,"verified data enables native drawing tools");
  await page.locator("#chart-v5-trend-btn").click();
  assert.equal(await page.locator("#chart-v5-trend-btn").getAttribute("aria-pressed"),"true",`drawing tool activation; browser errors: ${errors.join(" | ")}; status: ${await page.locator("#chart-v5-drawing-status").textContent()}`);
  assert.match(await page.locator("#chart-v5-drawing-status").textContent(),/ersten Anker/i);
  const chartBox=await page.locator("#chart-v5-preview-host").boundingBox();
  assert.ok(chartBox&&chartBox.width>300&&chartBox.height>200);
  await page.mouse.click(chartBox.x+680,chartBox.y+100);
  assert.match(await page.locator("#chart-v5-drawing-status").textContent(),/ungültig/i,"price-scale clicks are rejected as drawing anchors");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),0);
  await page.mouse.click(chartBox.x+180,chartBox.y+100);
  assert.match(await page.locator("#chart-v5-drawing-status").textContent(),/zweiten Anker/);
  await page.mouse.click(chartBox.x+340,chartBox.y+220);
  await page.waitForFunction(()=>document.querySelector("#chart-v5-drawing-status")?.textContent.includes("erstellt"),null,{timeout:5000});
  const trend=await page.evaluate(()=>{
   const id=window.__v5LastDrawing?.id;
   return {event:window.__v5LastDrawing,drawing:id?window.ChartStudioV5Preview.readDrawing(id):null,count:window.ChartStudioV5Preview.inspect().nativeDrawingCount};
  });
  assert.equal(trend.event?.kind,"TREND");
  assert.ok(trend.drawing?.id);
  assert.notEqual(trend.drawing.startTime,trend.drawing.endTime,"anchors stay bound to distinct loaded candle times");
  assert.ok(Number.isFinite(trend.drawing.startPrice)&&Number.isFinite(trend.drawing.endPrice));
  assert.equal(trend.count,1,"interactive drawing participates in native drawing storage/count");
  assert.equal(await page.locator("#chart-v5-trend-btn").getAttribute("aria-pressed"),"false","completed tool returns to cursor mode");
  await page.locator("#chart-v5-ray-btn").click();
  await page.mouse.click(chartBox.x+220,chartBox.y+130);
  await page.mouse.click(chartBox.x+400,chartBox.y+250);
  await page.waitForFunction(()=>document.querySelector("#chart-v5-drawing-status")?.textContent.includes("erstellt"));
  const ray=await page.evaluate(()=>({event:window.__v5LastDrawing,drawing:window.ChartStudioV5Preview.readDrawing(window.__v5LastDrawing?.id),count:window.ChartStudioV5Preview.inspect().nativeDrawingCount}));
  assert.equal(ray.event?.kind,"RAY");assert.ok(ray.drawing?.id);assert.notEqual(ray.drawing.startTime,ray.drawing.endTime);assert.equal(ray.count,2,"native ray placement persists exactly once");
  assert.equal(await page.locator("#chart-v5-layout-export-btn").isEnabled(),true,"verified chart enables portable layout export");
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#chart-v5-layout-export-btn").click();
  const layoutDownload=await downloadPromise,layoutPath=await layoutDownload.path();
  assert.equal(layoutDownload.suggestedFilename(),"chart-studio-layout-XAUUSD-M15.json");
  const portableLayout=JSON.parse(require("node:fs").readFileSync(layoutPath,"utf8"));
  assert.deepEqual(Object.keys(portableLayout).sort(),["drawings","schemaVersion","symbol","timeframe","view"]);
  assert.equal(portableLayout.schemaVersion,2);assert.equal(portableLayout.drawings.length,2);
  assert.equal(portableLayout.symbol,"XAUUSD");assert.equal(portableLayout.timeframe,"M15");
  assert.equal(Object.hasOwn(portableLayout,"account"),false,"downloaded layout omits account identity");
  assert.equal(JSON.stringify(portableLayout).includes('"positionOverlays"'),false,"download excludes broker position overlays");
  portableLayout.view.movingAverages=[{id:"portable-ema",type:"EMA",period:20,color:"#22aadd"}];
  portableLayout.view.oscillators=[{options:{id:"portable-rsi",kind:"rsi",settings:{period:14},color:"#a995ff",title:"Portable RSI"},paneIndex:1}];
  portableLayout.view.paneLines=[{options:{id:"portable-signal",color:"#f7c774",lineWidth:2,title:"Portable signal"},data:candles.slice(0,40).map((bar,index)=>({time:bar.time,value:50+Math.sin(index/5)*10})),paneIndex:1}];
  portableLayout.view.paneHeights=[400,150,140];
  portableLayout.view.volumeVisible=true;portableLayout.view.volumePaneIndex=2;
  assert.equal(await page.locator("#chart-v5-layout-import-btn").isEnabled(),true,"verified chart enables portable layout import");
  assert.equal(await page.locator("#chart-v5-layout-replace-btn").isEnabled(),true,"verified chart enables confirmed layout replacement");
  const importProbe=await page.evaluate(async serialized=>{
    const preview=window.ChartStudioV5Preview;
    const before=preview.exportLayout();
    const key="2eas.chartstudio.v5.drawings:v4:titan:XAUUSD:M15",storageBefore=localStorage.getItem(key);
    const merged=preview.importLayout(serialized,"merge");
    const mergedAgain=preview.importLayout(serialized,"merge");
    const afterMerge=JSON.parse(preview.exportLayout());
    const storageAfterValid=localStorage.getItem(key);
    const originalConfirm=window.confirm;window.confirm=()=>false;let cancelled="";
    try{preview.importLayout(serialized,"replace")}catch(error){cancelled=error.message}finally{window.confirm=originalConfirm}
    let mismatch="";try{preview.importLayout(JSON.stringify({...JSON.parse(serialized),symbol:"OTHER"}),"merge")}catch(error){mismatch=error.message}
    let timeframeMismatch="";try{preview.importLayout(JSON.stringify({...JSON.parse(serialized),timeframe:"M5"}),"merge")}catch(error){timeframeMismatch=error.message}
    let account="";try{preview.importLayout(JSON.stringify({...JSON.parse(serialized),account:"blueberry"}),"merge")}catch(error){account=error.message}
    let invalid="";const malformed=JSON.parse(serialized);malformed.view.paneHeights=[-10];try{preview.importLayout(JSON.stringify(malformed),"merge")}catch(error){invalid=error.message}
    let oversized="";try{preview.importLayout(" ".repeat(512*1024+1),"merge")}catch(error){oversized=error.message}
    const originalFeed=window.ChartStudioV5Feed;let corrupted=false,rollback="";
    window.ChartStudioV5Feed={...originalFeed,create:(...args)=>{const bridge=originalFeed.create(...args);return {...bridge,update:(snapshot,token)=>{if(!corrupted){corrupted=true;localStorage.setItem(key,"{")}return bridge.update(snapshot,token)}}}};
    try{preview.importLayout(serialized,"replace")}catch(error){rollback=error.message}finally{window.ChartStudioV5Feed=originalFeed}
    const afterRollback=preview.exportLayout(),rollbackState=preview.inspect();
    const afterRejected=preview.exportLayout();
    return {merged,mergedAgain,afterMerge,before,afterRejected,mismatch,timeframeMismatch,account,invalid,oversized,storageBefore,storageAfterValid,storageAfter:localStorage.getItem(key),rollback,afterRollback,rollbackState,cancelled};
  },JSON.stringify(portableLayout));
  assert.equal(importProbe.merged.importedDrawings,2,"merge imports the complete native drawing set");
  assert.equal(importProbe.mergedAgain.importedDrawings,2,"a second merge imports the layout again");
  assert.equal(importProbe.afterMerge.drawings.length,6,"merge retains current drawings and adds imported drawings");
  assert.equal(new Set(importProbe.afterMerge.drawings.map(row=>row.options.id)).size,6,"merge remaps colliding drawing IDs");
  assert.equal(importProbe.afterMerge.view.movingAverages.length,2,"merge combines managed averages");
  assert.equal(new Set(importProbe.afterMerge.view.movingAverages.map(item=>item.id)).size,2,"merge remaps colliding indicator IDs");
  assert.equal(importProbe.afterMerge.view.oscillators.length,2,"merge imports native oscillator panes");
  assert.equal(importProbe.afterMerge.view.paneLines.length,2,"merge imports custom pane series");
  assert.deepEqual(new Set(importProbe.afterMerge.view.oscillators.map(item=>item.paneIndex)),new Set([1,2]),"repeated merge appends indicators to separate panes before volume");
  assert.equal(importProbe.afterMerge.view.paneHeights.length,4,"merge preserves existing pane geometry and appends source panes");
  assert.equal(importProbe.afterMerge.view.volumeVisible,true,"merge carries the imported volume pane");
  assert.equal(importProbe.afterMerge.view.volumePaneIndex,3,"repeated merge keeps the shared volume pane after imported indicators");
  assert.match(importProbe.mismatch,/scope/i,"mismatched portable layouts are rejected");
  assert.match(importProbe.timeframeMismatch,/scope/i,"timeframe-mismatched portable layouts are rejected");
  assert.ok(importProbe.account.length>0,"layout files containing account identity are rejected");
  assert.ok(importProbe.invalid.length>0,"invalid view configuration is rejected before mutation");
  assert.ok(importProbe.oversized.length>0,"files exceeding 512 KiB are rejected");
  assert.match(importProbe.cancelled,/abgebrochen/i,"unconfirmed replace is rejected by the import API");
  assert.match(importProbe.rollback,/nicht wiederhergestellt/i,"renderer failure is reported after failed apply");
  assert.equal(importProbe.afterRollback,JSON.stringify(importProbe.afterMerge),"failed apply restores the previous rendered layout");
  assert.equal(importProbe.rollbackState.status.includes("V5-Daten abgelehnt"),false,"renderer recovers the verified candle feed after rollback");
  assert.equal(importProbe.afterRejected,JSON.stringify(importProbe.afterMerge),"rejected layouts leave the active renderer unchanged");
  assert.notEqual(importProbe.storageAfterValid,importProbe.storageBefore,"successful merges persist in the active account scope");
  assert.equal(importProbe.storageAfter,importProbe.storageAfterValid,"rejected layouts leave the scoped local snapshot unchanged");
  await page.locator("#chart-v5-ray-btn").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#chart-v5-ray-btn").getAttribute("aria-pressed"),"false","Escape cancels a pending drawing tool");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),6,"cancel does not persist an incomplete drawing");
  await page.locator("#chart-v5-layout-replace-btn").click();
  await page.locator("#chart-v5-layout-import-file").setInputFiles({name:"portable-layout.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(portableLayout))});
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("Layout ersetzt"));
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),2,"confirmed replace restores the imported layout after renderer remount");
  const storedImport=await page.evaluate(()=>{const key="2eas.chartstudio.v5.drawings:v4:titan:XAUUSD:M15";return JSON.parse(localStorage.getItem(key))});
  assert.equal(storedImport.account,"titan","portable import binds the saved snapshot to the active account");
  assert.equal(storedImport.schemaVersion,3,"portable import reuses the validated local persistence schema");
  const v4After=await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width}));
  assert.deepEqual(v4After,v4Before,"v5 owns a separate host and leaves v4 mounted");
  assert.match(await page.locator("#chart-v5-preview-title").textContent(),/XAUUSD M15/);

  const scopeSwitch=await page.evaluate(({candles,asOfUtc})=>{
   const stale=window.ChartStudioV5Preview.beginRead();
   const stalePositions=window.ChartStudioV5Preview.beginPositionRead();
   window.ChartStudioV5Preview.setScope({account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"});
   const staleResult=window.ChartStudioV5Preview.update({accountId:"titan",symbol:"XAUUSD",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,candles},stale);
   const stalePositionResult=window.ChartStudioV5Preview.setPositions({scope:{account:"titan",symbol:"XAUUSD",timeframe:"M15"},source:"MT5_VERIFIED",canExecute:false,positions:[{ticket:"71001",side:"BUY",priceOpen:4161}]},stalePositions);
   const current=window.ChartStudioV5Preview.beginRead();
   const updated=window.ChartStudioV5Preview.update({accountId:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,snapshotAsOfUtc:asOfUtc,candles},current);
   return {staleResult,stalePositionResult,updated,state:window.ChartStudioV5Preview.inspect()};
  },{candles,asOfUtc});
  assert.deepEqual(scopeSwitch.staleResult,{applied:false,reason:"STALE_SCOPE"});
  assert.deepEqual(scopeSwitch.stalePositionResult,{applied:false,reason:"STALE_SCOPE"},"late position reads cannot cross account changes");
  assert.deepEqual(scopeSwitch.updated,{applied:true,candleCount:150});
  assert.equal(scopeSwitch.state.scope.account,"xau5m_m5");
  assert.equal(scopeSwitch.state.positionOverlayCount,0,"account changes clear prior account position lines");
  assert.equal(scopeSwitch.state.brokerDealMarkerCount,0,"account changes clear prior account deal markers");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.readAutoFibonacci()),null,"a scope switch clears Auto-Fibonacci along with the prior account's candles");
  const missingAsOf=await page.evaluate(candles=>{const scope={account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"},token=window.ChartStudioV5Preview.beginRead();return window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,candles},token)},candles);
  assert.deepEqual(missingAsOf,{applied:false,reason:"INVALID_AS_OF"},"missing snapshot time fails closed");
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-title")?.textContent.includes("XAUUSD.p M15 · xau5m_m5"));
  await page.locator("#chart-v5-preview-btn").click();
  assert.equal(await page.locator("#chart-v5-preview-panel").evaluate(el=>el.hidden),true);
  assert.deepEqual(await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width})),v4Before);
  assert.deepEqual(errors,[]);
  assert.ok(requests.some(row=>row.url.endsWith("/stt/static/chart-studio-v5.js")&&row.method==="GET"),"pinned local v5 bundle loads on click");
  assert.ok(requests.every(row=>new URL(row.url).origin===base&&row.method==="GET"),"the preview makes only same-origin GETs");
  console.log(JSON.stringify({scopeSwitch:scopeSwitch.state.scope,candles:150,v4Preserved:true,loadedAssets:requests.filter(row=>row.url.includes("chart-studio-v5")),mutations:0,errors},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
