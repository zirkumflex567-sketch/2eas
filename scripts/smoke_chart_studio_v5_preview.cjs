"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const {chromium}=require("playwright");

const root=path.resolve(__dirname,"..");
const html=enabled=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.CHART_STUDIO_V5_PREVIEW_ENABLED=${enabled};window.__v4Updates=0;window.__v5AverageAccount="titan";window.__v5AverageConfigs=[{id:"trend-ema",type:"EMA",period:21,source:"close",color:"#68dfff",lineWidth:2,visible:true,label:"Trend EMA",displayShift:0}];window.ChartStudioAverages={getConfigs:()=>window.__v5AverageConfigs.map(item=>({...item})),getAccount:()=>window.__v5AverageAccount};window.__v5IndicatorScope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};window.__v5IndicatorSettings={rsi:{enabled:false,period:14},macd:{enabled:false,fast:12,slow:26,signal:9},atr:{enabled:false,period:14},adx:{enabled:false,period:14},stochastic:{enabled:true,period:14,smoothK:3,smoothD:3}};window.__v5OscillatorInstances=[{id:"macd-one",kind:"macd",fast:8,slow:21,signal:5,visible:true,color:"#44ffaa",lineWidth:3,label:"Fast MACD"}];const cloneLocal=value=>JSON.parse(JSON.stringify(value));window.ChartStudioIndicators={getScope:()=>({...window.__v5IndicatorScope}),settings:()=>cloneLocal(window.__v5IndicatorSettings)};window.ChartStudioOscillators={getAccount:()=>window.__v5IndicatorScope.account,settings:()=>cloneLocal(window.__v5OscillatorInstances)};</script>
<script src="static/chart-level-visibility.js"></script><script src="static/chart-studio-v5-feed.js"></script><script src="static/chart-studio-v5-indicator-feed.js"></script><script src="static/chart-studio-v5-oscillator-feed.js"></script><script src="static/chart-studio-v5-preview.js"></script>
<style>body{margin:0;background:#07111a;color:#e6f4f8;font:14px sans-serif}#tv-chart{height:300px;width:500px}#chart-v5-preview-host{height:700px;width:700px}</style></head><body>
<div id="tv-chart"><canvas id="v4-sentinel" width="500" height="300"></canvas></div>
<button type="button" id="chart-v5-preview-btn" aria-controls="chart-v5-preview-panel" aria-expanded="false" hidden>V5 Vorschau</button>
<section id="chart-v5-preview-panel" hidden><strong id="chart-v5-preview-title">Native v5</strong><div id="chart-v5-preview-status" role="status"></div>
<button type="button" id="chart-v5-auto-fib-btn" aria-pressed="false" disabled>Auto-Fibonacci einblenden</button><output id="chart-v5-auto-fib-status" aria-live="polite"></output><button type="button" id="chart-v5-layout-export-btn" disabled>Layout exportieren</button><button type="button" id="chart-v5-layout-import-btn" disabled>Layout zusammenführen</button><button type="button" id="chart-v5-layout-replace-btn" disabled>Layout ersetzen</button><input id="chart-v5-layout-import-file" type="file" accept="application/json,.json" hidden>
<div id="chart-v5-drawing-tools" role="group" aria-label="Native v5 Zeichnungen"><button type="button" id="chart-v5-trend-btn" aria-pressed="false" disabled>Trendlinie</button><button type="button" id="chart-v5-ray-btn" aria-pressed="false" disabled>Strahl</button><button type="button" id="chart-v5-price-btn" aria-pressed="false" disabled>Preislinie</button><button type="button" id="chart-v5-time-btn" aria-pressed="false" disabled>Zeitlinie</button><button type="button" id="chart-v5-rect-btn" aria-pressed="false" disabled>Rechteck</button><button type="button" id="chart-v5-fibo-btn" aria-pressed="false" disabled>Fibonacci</button><button type="button" id="chart-v5-measure-btn" aria-pressed="false" disabled>Messung</button><button type="button" id="chart-v5-channel-btn" aria-pressed="false" disabled>Kanal</button><button type="button" id="chart-v5-pitchfork-btn" aria-pressed="false" disabled>Pitchfork</button><button type="button" id="chart-v5-risk-reward-btn" aria-pressed="false" disabled>Risiko/Ertrag</button><input id="chart-v5-text-input" aria-label="Textbeschriftung" maxlength="40" value="Fixture note"><button type="button" id="chart-v5-text-btn" aria-pressed="false" disabled>Text</button><output id="chart-v5-drawing-status" role="status" aria-live="polite">Zeichenwerkzeug aus.</output></div>
<div id="chart-v5-preview-host"></div><output id="chart-v5-data-window" aria-label="Kerzendaten am Fadenkreuz">Fadenkreuz auf eine Kerze bewegen.</output><output id="chart-v5-live-quote" aria-label="Aktuelle MT5-Quote beim Abruf">Aktuelle MT5-Quote: noch nicht abgerufen.</output><button type="button" id="chart-v5-data-window-pin" aria-pressed="false">Kerze fixieren</button><p>Read only. Powered by <a href="https://www.tradingview.com/">TradingView Lightweight Charts™</a></p></section><script>document.addEventListener("DOMContentLoaded",()=>{const host=document.querySelector("#chart-v5-preview-host");host.addEventListener("chartstudio-v5-drawing-state",e=>window.__v5LastDrawing=e.detail);host.addEventListener("chartstudio-v5-data-window",e=>window.__v5DataWindow=e.detail)});</script></body></html>`;

const quoteRequests=[];
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/"||pathname==="/stt/"){
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(html(new URL(req.url,"http://localhost").searchParams.get("enabled")==="1"));return;
 }
 const normalized=pathname.replace(/^\/stt(?=\/)/,"");
 if(normalized==="/api/chart/v1/quotes"){
  const query=new URL(req.url,"http://localhost").searchParams;quoteRequests.push({account:query.get("account"),symbol:query.get("symbol"),method:req.method});
  res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({account:query.get("account"),symbol:query.get("symbol"),source:"MT5_VERIFIED",canExecute:false,bid:4100.25,ask:4100.5,digits:2,quoteTimeUtc:Date.parse("2026-10-18T12:00:00Z")/1000,ageSeconds:3600,freshness:"STALE"}));return;
 }
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
   return window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,snapshotAsOfUtc:asOfUtc,candles,
    sr_levels:{daily_high:4110,daily_low:4100,daily_poc:4105,daily_vah:4108,daily_val:4102,weekly_high:4120,weekly_low:4090,weekly_poc:4106,weekly_vah:4112,weekly_val:4101}},token);
  },{candles,asOfUtc});
  assert.deepEqual(first,{applied:true,candleCount:150});
  assert.match(await page.locator("#chart-v5-data-window").textContent(),/Fadenkreuz auf eine Kerze bewegen/);
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
  await page.waitForFunction(()=>document.querySelector("#chart-v5-live-quote")?.textContent.includes("STALE"));
  await page.waitForFunction(()=>window.ChartStudioV5Preview?.inspect().customMovingAverageCount===1);
  await page.waitForFunction(()=>window.ChartStudioV5Preview?.inspect().customOscillatorCount===2);
  const marketLevels=await page.evaluate(()=>window.ChartStudioV5Preview.readMarketLevels?.());
  const priceAxisWidth=await page.evaluate(()=>window.ChartStudioV5Preview.inspect().priceAxisWidth);
  assert.ok(priceAxisWidth>=112,"native v5 reserves enough axis width for concise price and level labels");
  assert.equal(marketLevels?.source,"MT5_VERIFIED","native v5 receives scoped read-only market levels from the broker candle response");
  assert.equal(marketLevels?.count,10,"native v5 renders all ten daily/weekly high, low and volume-profile levels");
  assert.equal(marketLevels?.levels.daily_poc.price,4105);
  assert.equal(marketLevels?.levels.daily_poc.label,"D-POC","concise native axis labels retain readable level identity without long clipped titles");
  assert.equal(marketLevels?.levels.weekly_poc.price,4106);
  const levelPreferences=await page.evaluate(()=>{
   const visibility=window.DashboardChartLevelVisibility,preview=window.ChartStudioV5Preview;
   visibility.set("titan","daily_poc",false);preview.syncMarketLevels();
   const hidden=preview.readMarketLevels().levels.daily_poc.visible;
   visibility.set("titan","weekly_high",true);preview.syncMarketLevels();
   return {hidden,explicitWeekly:preview.readMarketLevels().levels.weekly_high.visible};
  });
  assert.deepEqual(levelPreferences,{hidden:false,explicitWeekly:true},"native levels follow account toggles and preserve explicit distant-weekly override");
  const syncedOscillators=await page.evaluate(()=>({stochastic:window.ChartStudioV5Preview.readOscillator("catalog-stochastic"),macd:window.ChartStudioV5Preview.readOscillator("instance-macd-one")}));
  assert.deepEqual(syncedOscillators.stochastic,{id:"preview-osc-c-stochastic",kind:"stochastic",settings:{period:14,smoothK:3,smoothD:3},color:"#55d7ee",lineWidth:2,visible:true,title:"Stochastic %K/%D"});
  assert.deepEqual(syncedOscillators.macd,{id:"preview-osc-i-pzbd09",kind:"macd",settings:{fast:8,slow:21,signal:5},color:"#44ffaa",lineWidth:3,visible:true,title:"Fast MACD"});
  const initialMovingAverage=await page.evaluate(()=>window.ChartStudioV5Preview.readMovingAverage("trend-ema"));
  assert.equal(initialMovingAverage.period,21);
  assert.equal(initialMovingAverage.source,"close");
  assert.equal(initialMovingAverage.displayShift,0);
  assert.equal(initialMovingAverage.title,"Trend EMA");
  const initialPreviewLayout=await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()));
  assert.equal(initialPreviewLayout.view.movingAverages.length,0,"temporary production-editor averages do not enter v5 portable layout storage");
  assert.ok(initialPreviewLayout.view.paneHeights.every(Number.isFinite),"portable pane heights exclude empty transient preview panes");
  const changedMovingAverage=await page.evaluate(()=>{
    window.__v5AverageConfigs=[{...window.__v5AverageConfigs[0],period:34,source:"hlc3",displayShift:1}];
    window.dispatchEvent(new CustomEvent("chart-studio-averages-change",{detail:{account:"titan",symbol:"XAUUSD"}}));
    return window.ChartStudioV5Preview.readMovingAverage("trend-ema");
  });
  assert.equal(changedMovingAverage.period,34,"v5 preview follows the editor's current local configuration");
  assert.equal(changedMovingAverage.source,"hlc3");
  assert.equal(changedMovingAverage.displayShift,1);
  assert.equal((await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()).view.movingAverages.length)),0,"edited source configurations stay temporary in preview exports");
  assert.equal((await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()).view.oscillators.length)),0,"temporary production-editor oscillator panes do not enter v5 portable layout storage");
  const changedOscillator=await page.evaluate(()=>{
    window.__v5IndicatorSettings.stochastic={...window.__v5IndicatorSettings.stochastic,period:21,smoothK:4};
    window.dispatchEvent(new CustomEvent("chart-studio-indicators-change",{detail:{...window.__v5IndicatorScope}}));
    return window.ChartStudioV5Preview.readOscillator("catalog-stochastic");
  });
  assert.deepEqual(changedOscillator.settings,{period:21,smoothK:4,smoothD:3},"v5 preview follows local oscillator-editor changes");
  assert.equal((await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()).view.oscillators.length)),0,"edited source oscillator settings stay temporary in preview exports");
  const oscillatorScopeChange=await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent("chart-studio-oscillators-change",{detail:{account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"}}));
    const cleared=window.ChartStudioV5Preview.inspect().customOscillatorCount;
    window.dispatchEvent(new CustomEvent("chart-studio-indicators-change",{detail:{...window.__v5IndicatorScope}}));
    return {cleared,restored:window.ChartStudioV5Preview.inspect().customOscillatorCount};
  });
  assert.deepEqual(oscillatorScopeChange,{cleared:0,restored:2},"a mismatched editor scope clears prior oscillator panes and a matching scope resyncs them");
  assert.match(await page.locator("#chart-v5-live-quote").textContent(),/STALE .*Bid 4100\.25 \/ Ask 4100\.5 \/ Spread 0\.25 .*2026-10-18T12:00:00\.000Z UTC · Alter 3600 s .*keine historische Kerze/);
  assert.deepEqual(quoteRequests[0],{account:"titan",symbol:"XAUUSD",method:"GET"},"v5 quote is fetched for exact account/symbol as a read-only snapshot");
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("150 verifizierte Kerzen"));
  await page.waitForFunction(()=>[...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas=>canvas.width>300&&canvas.height>80),null,{timeout:5000}).catch(async()=>{
   const state=await page.evaluate(()=>({canvases:[...document.querySelectorAll("#chart-v5-preview-host canvas")].map(canvas=>({width:canvas.width,height:canvas.height})),inspection:window.ChartStudioV5Preview.inspect(),status:document.querySelector("#chart-v5-preview-status")?.textContent}));
   throw new Error(`native v5 canvas did not render: ${JSON.stringify(state)}; browser errors: ${errors.join(" | ")}`);
  });
  assert.match(await page.locator("#chart-v5-data-window").textContent(),/Fadenkreuz auf eine Kerze bewegen/);
  const liveDealReadback=await page.evaluate(()=>window.ChartStudioV5Preview.readBrokerDealMarkers());
  assert.equal(liveDealReadback.plotted,2,"native v5 renderer retains both in-window historical fills");
  assert.equal(liveDealReadback.unplotted,1,"native v5 renderer keeps an out-of-window fill unplotted");
  const positions=await page.evaluate(()=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"},token=window.ChartStudioV5Preview.beginPositionRead();
   return window.ChartStudioV5Preview.setPositions({scope,source:"MT5_VERIFIED",canExecute:false,currency:"USD",marginMode:2,positions:[
    {ticket:"71001",side:"BUY",priceOpen:4161,sl:4158,tp:4168,volume:.2,profit:4.5,swap:-.25,currency:"USD",usdConversion:{state:"AVAILABLE",source:"ACCOUNT_CURRENCY",amountsUsd:{profit:4.5,swap:-.25}}},
    {ticket:"71002",side:"SELL",priceOpen:4165,sl:4169,tp:null,volume:.1,profit:-2,swap:0,currency:"USD",usdConversion:{state:"AVAILABLE",source:"ACCOUNT_CURRENCY",amountsUsd:{profit:-2,swap:0}}},
   ]},token);
  });
  assert.deepEqual(positions,{applied:true,count:5},"verified position entry/SL/TP overlays render in v5");
  const positionReadback=await page.evaluate(()=>window.ChartStudioV5Preview.readPositions());
  assert.equal(positionReadback.count,5);assert.equal(positionReadback.positionCount,2);assert.equal(positionReadback.zoneCount,3);
  assert.equal(positionReadback.currency,"USD");assert.equal(positionReadback.marginMode,"HEDGING");
  assert.match(positionReadback.positions[0].label,/P\/L 4\.50 USD · Swap -0\.25 USD · USD P\/L 4\.50 · Swap -0\.25/);
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
  let expectedPlacementCount=2,riskRewardPlacedId=null,pitchforkPlacedId=null;
  const textInput=page.locator("#chart-v5-text-input");
  await textInput.fill("");assert.equal(await page.locator("#chart-v5-text-btn").isEnabled(),false,"text placement rejects an empty annotation");
  await textInput.fill("🚀");assert.equal(await page.locator("#chart-v5-text-btn").isEnabled(),false,"text placement rejects unsupported Unicode before creating a drawing");
  await textInput.fill("Fixture note");assert.equal(await page.locator("#chart-v5-text-btn").isEnabled(),true,"valid text enables annotation placement");
  for(const [buttonId,kind,clicks] of [["price","PRICE",1],["time","TIME",1],["rect","RECT",2],["fibo","FIBO",2],["measure","MEASURE",2],["text","TEXT",1],["channel","CHANNEL",3],["pitchfork","PITCHFORK",3],["risk-reward","RISK_REWARD",3]]){
   const button=page.locator(`#chart-v5-${buttonId}-btn`);
   assert.equal(await button.isEnabled(),true,`${kind} placement is enabled with verified bars`);
   await button.click();
   if(kind==="CHANNEL"){
    await page.mouse.click(chartBox.x+260,chartBox.y+130);
    await page.mouse.click(chartBox.x+260,chartBox.y+130);
    const repeatedAnchorStatus=await page.locator("#chart-v5-drawing-status").textContent();assert.match(repeatedAnchorStatus,/ungültig/i,`channel rejects a repeated candle anchor: ${repeatedAnchorStatus}`);
    assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),8,"an invalid repeated channel anchor creates no object");
    await page.mouse.click(chartBox.x+360,chartBox.y+230);
    assert.match(await page.locator("#chart-v5-drawing-status").textContent(),/dritten kanalanker/i);
    await page.mouse.click(chartBox.x+460,chartBox.y+140);
   }else if(kind==="RISK_REWARD"){
    await page.mouse.click(chartBox.x+260,chartBox.y+185); // entry
    await page.mouse.click(chartBox.x+350,chartBox.y+250); // stop below entry
    await page.mouse.click(chartBox.x+500,chartBox.y+55); // target above entry
   }else for(let index=0;index<clicks;index++)await page.mouse.click(chartBox.x+250+index*90,chartBox.y+140+index*70);
   await page.waitForFunction(expected=>window.__v5LastDrawing?.kind===expected,kind,{timeout:5000}).catch(async()=>{
    const state=await page.evaluate(()=>({event:window.__v5LastDrawing,status:document.querySelector("#chart-v5-drawing-status")?.textContent,tool:window.ChartStudioV5Preview.inspect().drawingTool,placement:window.ChartStudioV5Preview.inspect().placement}));
    throw new Error(`${kind} placement did not complete: ${JSON.stringify(state)}`);
   });
   const placed=await page.evaluate(()=>({kind:window.__v5LastDrawing?.kind,drawing:window.ChartStudioV5Preview.readDrawing(window.__v5LastDrawing?.id),count:window.ChartStudioV5Preview.inspect().nativeDrawingCount}));
   assert.equal(placed.kind,kind);assert.ok(placed.drawing?.id);assert.equal(placed.count,++expectedPlacementCount);
   if(clicks===2)assert.notEqual(placed.drawing.startTime,placed.drawing.endTime);
   if(kind==="PRICE")assert.ok(Number.isFinite(placed.drawing.price));
   if(kind==="TIME")assert.ok(Number.isSafeInteger(placed.drawing.time));
   if(kind==="RECT")assert.equal(placed.drawing.fill,true);
   if(kind==="TEXT")assert.equal(placed.drawing.text,"Fixture note");
   if(kind==="MEASURE")assert.ok(Number.isFinite(placed.drawing.startPrice)&&Number.isFinite(placed.drawing.endPrice));
   if(kind==="CHANNEL"){assert.notEqual(placed.drawing.offsetPrice,placed.drawing.startPrice);assert.ok(Number.isSafeInteger(placed.drawing.offsetTime));}
   if(kind==="PITCHFORK"){
    assert.ok(placed.drawing.startTime<placed.drawing.endTime&&placed.drawing.startTime<placed.drawing.thirdTime,"pivot one precedes the two arm pivots");
    assert.notEqual(placed.drawing.endTime,placed.drawing.thirdTime,"the arm pivots have distinct candle times");pitchforkPlacedId=placed.drawing.id;
    const geometry=await page.evaluate(id=>window.ChartStudioV5Preview.drawingGeometry(id),pitchforkPlacedId);
    assert.ok(geometry&&geometry.segments.length===3,"pitchfork exposes three clipped rays");
    assert.ok(Math.abs(geometry.m.x-(geometry.b.x+geometry.c.x)/2)<1e-7&&Math.abs(geometry.m.y-(geometry.b.y+geometry.c.y)/2)<1e-7,"median pivot is the exact screen-space midpoint of arm pivots");
    for(const [from,to] of geometry.segments){assert.ok(Math.abs((to.x-from.x)*geometry.direction.y-(to.y-from.y)*geometry.direction.x)<1e-5,"all three rays are parallel to the median direction")}
    await page.mouse.move(chartBox.x+420,chartBox.y+240);await page.mouse.wheel(0,-240);await page.waitForTimeout(250);
    const zoomedGeometry=await page.evaluate(id=>window.ChartStudioV5Preview.drawingGeometry(id),pitchforkPlacedId);
    assert.ok(zoomedGeometry&&Math.abs(zoomedGeometry.m.x-(zoomedGeometry.b.x+zoomedGeometry.c.x)/2)<1e-7&&Math.abs(zoomedGeometry.m.y-(zoomedGeometry.b.y+zoomedGeometry.c.y)/2)<1e-7,"zoom recomputes the exact pitchfork midpoint from anchors");
    const originalHeight=await page.locator("#chart-v5-preview-host").evaluate(el=>el.style.height);await page.locator("#chart-v5-preview-host").evaluate(el=>el.style.height="520px");await page.waitForTimeout(100);
    const resizedGeometry=await page.evaluate(id=>window.ChartStudioV5Preview.drawingGeometry(id),pitchforkPlacedId);
    assert.ok(resizedGeometry&&Math.abs(resizedGeometry.m.x-(resizedGeometry.b.x+resizedGeometry.c.x)/2)<1e-7&&Math.abs(resizedGeometry.m.y-(resizedGeometry.b.y+resizedGeometry.c.y)/2)<1e-7,"resize recomputes pitchfork geometry from persisted anchors");
    await page.locator("#chart-v5-preview-host").evaluate((el,height)=>el.style.height=height,originalHeight);await page.waitForTimeout(100);
   }
   if(kind==="RISK_REWARD"){
    assert.ok(placed.drawing.entryPrice>placed.drawing.stopPrice&&placed.drawing.targetPrice>placed.drawing.entryPrice,"long setup preserves entry/stop/target ordering");
    assert.ok(Math.abs(placed.drawing.riskRewardRatio-2)<0.3,`risk/reward ratio is derived from the three price anchors: ${placed.drawing.riskRewardRatio}`);
    riskRewardPlacedId=placed.drawing.id;
   }
  }
  const pitchforkOriginal=await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId);
  const thirdHandle=await page.evaluate(id=>window.ChartStudioV5Preview.drawingAnchorPosition(id,"THIRD"),pitchforkPlacedId);
  await page.mouse.move(thirdHandle.x,thirdHandle.y);await page.mouse.down();await page.mouse.move(thirdHandle.x,thirdHandle.y+16,{steps:3});await page.mouse.up();
  const pitchforkEdited=await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId);
  assert.notEqual(pitchforkEdited.thirdPrice,pitchforkOriginal.thirdPrice,"third handle edits its saved price anchor");
  await page.keyboard.press("Control+Z");assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId)).thirdPrice,pitchforkOriginal.thirdPrice,"pitchfork handle drag is one undo step");
  await page.keyboard.press("Control+Y");assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId)).thirdPrice,pitchforkEdited.thirdPrice,"pitchfork drag can be redone");
  const lockedAnchor=await page.evaluate(id=>window.ChartStudioV5Preview.drawingAnchorPosition(id,"THIRD"),pitchforkPlacedId);
  await page.mouse.click(lockedAnchor.x,lockedAnchor.y);await page.keyboard.press("l");
  const beforeLockedDrag=await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId);
  await page.mouse.move(lockedAnchor.x,lockedAnchor.y);await page.mouse.down();await page.mouse.move(lockedAnchor.x,lockedAnchor.y+25,{steps:3});await page.mouse.up();
  assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId)).thirdPrice,beforeLockedDrag.thirdPrice,"locked pitchfork ignores anchor drags");
  await page.keyboard.press("l");await page.keyboard.press("h");assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId)).visible,false,"H hides a selected pitchfork");
  await page.keyboard.press("h");assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),pitchforkPlacedId)).visible,true,"H restores pitchfork visibility");
  await page.keyboard.press("Control+D");
  const duplicateFork=await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()).drawings.filter(row=>row.kind==="PITCHFORK"));
  assert.equal(duplicateFork.length,2,"Ctrl+D duplicates all three pitchfork anchors");
  await page.keyboard.press("Delete");assert.equal((await page.evaluate(()=>JSON.parse(window.ChartStudioV5Preview.exportLayout()).drawings.filter(row=>row.kind==="PITCHFORK").length)),1,"Delete removes the selected duplicate pitchfork");
  const originalRiskReward=await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),riskRewardPlacedId);
  const targetHandle=await page.evaluate(id=>window.ChartStudioV5Preview.drawingAnchorPosition(id,"TARGET"),riskRewardPlacedId);
  assert.ok(targetHandle,"selected risk/reward drawing exposes an editable target handle");
  await page.mouse.move(targetHandle.x,targetHandle.y);await page.mouse.down();await page.mouse.move(targetHandle.x,targetHandle.y+14,{steps:3});await page.mouse.up();
  const editedRiskReward=await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),riskRewardPlacedId);
  assert.notEqual(editedRiskReward.targetPrice,originalRiskReward.targetPrice,"target handle updates the saved target price");
  assert.ok(editedRiskReward.entryPrice>editedRiskReward.stopPrice&&editedRiskReward.targetPrice>editedRiskReward.entryPrice,"target drag preserves a valid long setup");
  await page.keyboard.press("Control+Z");
  assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),riskRewardPlacedId)).targetPrice,originalRiskReward.targetPrice,"undo restores the previous target anchor");
  await page.keyboard.press("Control+Y");
  assert.equal((await page.evaluate(id=>window.ChartStudioV5Preview.readDrawing(id),riskRewardPlacedId)).targetPrice,editedRiskReward.targetPrice,"redo reapplies the edited target anchor");
  assert.equal(await page.locator("#chart-v5-layout-export-btn").isEnabled(),true,"verified chart enables portable layout export");
  const downloadPromise=page.waitForEvent("download");
  await page.locator("#chart-v5-layout-export-btn").click();
  const layoutDownload=await downloadPromise,layoutPath=await layoutDownload.path();
  assert.equal(layoutDownload.suggestedFilename(),"chart-studio-layout-XAUUSD-M15.json");
  const portableLayout=JSON.parse(require("node:fs").readFileSync(layoutPath,"utf8"));
  assert.deepEqual(Object.keys(portableLayout).sort(),["drawings","schemaVersion","symbol","timeframe","view"]);
  assert.equal(portableLayout.schemaVersion,2);assert.equal(portableLayout.drawings.length,11);
  assert.ok(portableLayout.drawings.some(row=>row.kind==="PITCHFORK"),"portable schema carries the three-anchor pitchfork");
  const portableRiskReward=portableLayout.drawings.find(row=>row.kind==="RISK_REWARD");
  assert.ok(portableRiskReward,"portable schema carries the editable risk/reward drawing");
  assert.equal(Object.hasOwn(portableRiskReward.options,"riskRewardRatio"),false,"derived ratio is recomputed from prices, not trusted from imports");
  assert.equal(portableLayout.symbol,"XAUUSD");assert.equal(portableLayout.timeframe,"M15");
  assert.equal(Object.hasOwn(portableLayout,"account"),false,"downloaded layout omits account identity");
  assert.equal(JSON.stringify(portableLayout).includes('"positionOverlays"'),false,"download excludes broker position overlays");
  portableLayout.view.movingAverages=[{id:"portable-ema",type:"EMA",period:20,color:"#22aadd"}];
  portableLayout.view.sessionVwaps=[{id:"portable-vwap",color:"#55d7ee",timeZone:"Europe/Berlin",sessionStart:"09:30",title:"Portable VWAP"}];
  portableLayout.view.oscillators=[{options:{id:"portable-rsi",kind:"rsi",settings:{period:14},color:"#a995ff",title:"Portable RSI"},paneIndex:1}];
  portableLayout.view.paneLines=[{options:{id:"portable-signal",color:"#f7c774",lineWidth:2,title:"Portable signal"},data:candles.slice(0,40).map((bar,index)=>({time:bar.time,value:50+Math.sin(index/5)*10})),paneIndex:1}];
  portableLayout.view.paneHeights=[400,150,140];
  portableLayout.view.volumeVisible=true;portableLayout.view.volumePaneIndex=2;
  assert.equal(await page.locator("#chart-v5-layout-import-btn").isEnabled(),true,"verified chart enables portable layout import");
  assert.equal(await page.locator("#chart-v5-layout-replace-btn").isEnabled(),true,"verified chart enables confirmed layout replacement");
  const importProbe=await page.evaluate(async serialized=>{
    const preview=window.ChartStudioV5Preview;
    const before=preview.exportLayout();
    const key="2eas.chartstudio.v5.drawings:v5:titan:XAUUSD:M15",storageBefore=localStorage.getItem(key);
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
    let invalidPitchfork="";const malformedPitchfork=JSON.parse(serialized),fork=malformedPitchfork.drawings.find(row=>row.kind==="PITCHFORK");fork.options.thirdTime=fork.options.startTime;try{preview.importLayout(JSON.stringify(malformedPitchfork),"merge")}catch(error){invalidPitchfork=error.message}
    let oversized="";try{preview.importLayout(" ".repeat(512*1024+1),"merge")}catch(error){oversized=error.message}
    const originalFeed=window.ChartStudioV5Feed;let corrupted=false,rollback="";
    window.ChartStudioV5Feed={...originalFeed,create:(...args)=>{const bridge=originalFeed.create(...args);return {...bridge,update:(snapshot,token)=>{if(!corrupted){corrupted=true;localStorage.setItem(key,"{")}return bridge.update(snapshot,token)}}}};
    try{preview.importLayout(serialized,"replace")}catch(error){rollback=error.message}finally{window.ChartStudioV5Feed=originalFeed}
    const afterRollback=preview.exportLayout(),rollbackState=preview.inspect();
    const afterRejected=preview.exportLayout();
    return {merged,mergedAgain,afterMerge,before,afterRejected,mismatch,timeframeMismatch,account,invalid,invalidPitchfork,oversized,storageBefore,storageAfterValid,storageAfter:localStorage.getItem(key),rollback,afterRollback,rollbackState,cancelled};
  },JSON.stringify(portableLayout));
  assert.equal(importProbe.merged.importedDrawings,11,"merge imports the complete native drawing set");
  assert.equal(importProbe.mergedAgain.importedDrawings,11,"a second merge imports the layout again");
  assert.equal(importProbe.afterMerge.drawings.length,33,"merge retains current drawings and adds imported drawings");
  assert.equal(new Set(importProbe.afterMerge.drawings.map(row=>row.options.id)).size,33,"merge remaps colliding drawing IDs");
  assert.equal(importProbe.afterMerge.view.movingAverages.length,2,"merge combines managed averages");
  assert.equal(importProbe.afterMerge.view.sessionVwaps.length,2,"merge combines session VWAP settings");
  assert.equal(new Set(importProbe.afterMerge.view.sessionVwaps.map(item=>item.id)).size,2,"merge remaps colliding session VWAP IDs");
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
  assert.ok(importProbe.invalidPitchfork.length>0,"malformed pitchfork anchors are rejected before mutation");
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
  await page.locator("#chart-v5-pitchfork-btn").click();await page.mouse.click(chartBox.x+280,chartBox.y+160);await page.keyboard.press("Escape");
  assert.equal(await page.locator("#chart-v5-pitchfork-btn").getAttribute("aria-pressed"),"false","Escape cancels an incomplete Pitchfork placement");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),33,"cancel does not persist an incomplete drawing");
  await page.locator("#chart-v5-layout-replace-btn").click();
  await page.locator("#chart-v5-layout-import-file").setInputFiles({name:"portable-layout.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(portableLayout))});
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("Layout ersetzt"));
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),11,"confirmed replace restores the imported layout after renderer remount");
  const storedImport=await page.evaluate(()=>{const key="2eas.chartstudio.v5.drawings:v5:titan:XAUUSD:M15";return JSON.parse(localStorage.getItem(key))});
  assert.equal(storedImport.account,"titan","portable import binds the saved snapshot to the active account");
  assert.equal(storedImport.schemaVersion,5,"portable import reuses the validated local persistence schema");
  assert.equal(storedImport.sessionVwaps.length,1,"confirmed replacement restores the imported VWAP settings");
  assert.ok(storedImport.drawings.some(row=>row.kind==="RISK_REWARD"),"confirmed replacement persists the risk/reward drawing in the active scope");
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
   window.__v5AverageAccount="xau5m_m5";window.__v5AverageConfigs=[];window.__v5IndicatorScope={account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"};window.__v5IndicatorSettings={stochastic:{enabled:false,period:14,smoothK:3,smoothD:3}};window.__v5OscillatorInstances=[];
   window.dispatchEvent(new CustomEvent("chart-studio-averages-change",{detail:{account:"xau5m_m5",symbol:"XAUUSD"}}));
   return {staleResult,stalePositionResult,updated,state:window.ChartStudioV5Preview.inspect()};
  },{candles,asOfUtc});
  assert.deepEqual(scopeSwitch.staleResult,{applied:false,reason:"STALE_SCOPE"});
  assert.deepEqual(scopeSwitch.stalePositionResult,{applied:false,reason:"STALE_SCOPE"},"late position reads cannot cross account changes");
  assert.deepEqual(scopeSwitch.updated,{applied:true,candleCount:150});
  assert.equal(scopeSwitch.state.marketLevelCount,0,"account/symbol scope changes clear prior market-level lines");
  assert.equal(scopeSwitch.state.scope.account,"xau5m_m5");
  assert.equal(scopeSwitch.state.positionOverlayCount,0,"account changes clear prior account position lines");
  assert.equal(scopeSwitch.state.customMovingAverageCount,0,"a configuration still owned by another account is never drawn into the new chart");
  assert.equal(scopeSwitch.state.customOscillatorCount,0,"a prior account's editor oscillators are cleared on scope switch");
  assert.equal(scopeSwitch.state.brokerDealMarkerCount,0,"account changes clear prior account deal markers");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.readAutoFibonacci()),null,"a scope switch clears Auto-Fibonacci along with the prior account's candles");
  const hostBox=await page.locator("#chart-v5-preview-host").boundingBox();
  await page.mouse.move(hostBox.x+hostBox.width*0.45,hostBox.y+hostBox.height*0.45);
  await page.waitForFunction(()=>window.__v5DataWindow?.state==="AVAILABLE",null,{timeout:3000});
  const dataWindow=await page.evaluate(()=>window.__v5DataWindow);
  assert.equal(dataWindow.account,"xau5m_m5");assert.equal(dataWindow.source,"CHART_FEED");
  assert.equal(dataWindow.ohlc.open,candles.find(row=>row.time===dataWindow.time).open);
  assert.equal(dataWindow.volume.source,"TICK_VOLUME_PROXY");
  assert.match(await page.locator("#chart-v5-data-window").textContent(),/CHART_FEED .* O .* H .* L .* C .* TICK_VOLUME_PROXY/);
  await page.locator("#chart-v5-data-window-pin").click();
  assert.equal(await page.locator("#chart-v5-data-window-pin").getAttribute("aria-pressed"),"true");
  await page.mouse.move(10,10);
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().dataWindowPinned),true);
  assert.match(await page.locator("#chart-v5-data-window").textContent(),/FIXIERT/);
  assert.match(await page.locator("#chart-v5-data-window").textContent(),new RegExp(dataWindow.timeUtc.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#chart-v5-data-window-pin").getAttribute("aria-pressed"),"false");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().dataWindowPinned),false);
  await page.locator("#chart-v5-data-window-pin").click();
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().dataWindowPinned),true);
  const pinAfterAccountChange=await page.evaluate(()=>{
   const preview=window.ChartStudioV5Preview;
   preview.setScope({account:"titan",symbol:"XAUUSD",timeframe:"M15"});
   const cleared=preview.inspect().dataWindowPinned;
   preview.setScope({account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"});
   return cleared;
  });
  assert.equal(pinAfterAccountChange,false,"account/symbol scope changes clear the pinned candle readout");
  const missingAsOf=await page.evaluate(candles=>{const scope={account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"},token=window.ChartStudioV5Preview.beginRead();return window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,candles},token)},candles);
  assert.deepEqual(missingAsOf,{applied:false,reason:"INVALID_AS_OF"},"missing snapshot time fails closed");
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-title")?.textContent.includes("XAUUSD.p M15 · xau5m_m5"));
  await page.locator("#chart-v5-preview-btn").click();
  assert.equal(await page.locator("#chart-v5-preview-panel").evaluate(el=>el.hidden),true);
  assert.deepEqual(await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width})),v4Before);
  await page.evaluate(()=>localStorage.clear());
  await page.locator("#chart-v5-preview-btn").click();
  const legacySchemaV4=await page.evaluate(({candles})=>{
   const key="2eas.chartstudio.v5.drawings:v4:titan:XAUUSD:M15";
   const legacy={schemaVersion:4,account:"titan",symbol:"XAUUSD",timeframe:"M15",drawings:[{kind:"TREND",options:{id:"legacy-v4-trend",startTime:candles[10].time,startPrice:candles[10].close,endTime:candles[20].time,endPrice:candles[20].close,color:"#49c6ff",visible:true,locked:false}}],undoStack:[],redoStack:[],movingAverages:[],oscillators:[],paneLines:[],supertrends:[],parabolicSars:[],sessionVwaps:[],paneHeights:[600],volumeVisible:false,volumePaneIndex:null,displayTimeZone:"UTC",visibleRange:null};
   localStorage.setItem(key,JSON.stringify(legacy));const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};window.ChartStudioV5Preview.setScope(scope);const token=window.ChartStudioV5Preview.beginRead();
   const result=window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,snapshotAsOfUtc:candles.at(-1).time+900,candles},token);
   return {key,snapshot:JSON.stringify(legacy),result};
  },{candles});
  assert.deepEqual(legacySchemaV4.result,{applied:true,candleCount:150});
  await page.waitForFunction(()=>window.ChartStudioV5Preview?.inspect().nativeDrawingCount===1);
  const migratedSchema=await page.evaluate(({oldKey})=>({old:localStorage.getItem(oldKey),current:localStorage.getItem("2eas.chartstudio.v5.drawings:v5:titan:XAUUSD:M15"),legacy:window.ChartStudioV5Preview.readDrawing("legacy-v4-trend")}),{oldKey:legacySchemaV4.key});
  assert.equal(migratedSchema.old,legacySchemaV4.snapshot,"schema-v4 recovery copy remains intact after upgrade");
  assert.ok(migratedSchema.current,"schema-v4 storage migrates to a current snapshot");
  assert.equal(JSON.parse(migratedSchema.current).schemaVersion,5,"schema-v4 storage migrates to the current schema");
  assert.ok(JSON.parse(migratedSchema.current).drawings.some(row=>row.options.id==="legacy-v4-trend"),"schema migration preserves existing drawings");
  assert.deepEqual(errors,[]);
  assert.ok(requests.some(row=>row.url.endsWith("/stt/static/chart-studio-v5.js")&&row.method==="GET"),"pinned local v5 bundle loads on click");
  assert.ok(requests.every(row=>new URL(row.url).origin===base&&row.method==="GET"),"the preview makes only same-origin GETs");
  console.log(JSON.stringify({scopeSwitch:scopeSwitch.state.scope,candles:150,v4Preserved:true,loadedAssets:requests.filter(row=>row.url.includes("chart-studio-v5")),mutations:0,errors},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
