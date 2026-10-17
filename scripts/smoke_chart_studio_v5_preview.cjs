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
<button type="button" id="chart-v5-auto-fib-btn" aria-pressed="false" disabled>Auto-Fibonacci einblenden</button><output id="chart-v5-auto-fib-status" aria-live="polite"></output>
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

  const page=await browser.newPage({viewport:{width:1200,height:900}});
  const requests=[],errors=[];
  page.on("request",request=>requests.push({url:request.url(),method:request.method()}));
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base+"/stt/?enabled=1");
  await page.locator("#chart-v5-preview-btn").waitFor({state:"visible"});
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
  const v4Before=await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width}));
  await page.locator("#chart-v5-preview-btn").click();
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("150 verifizierte Kerzen"));
  await page.waitForFunction(()=>[...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas=>canvas.width>300&&canvas.height>200));
  const positions=await page.evaluate(()=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"},token=window.ChartStudioV5Preview.beginPositionRead();
   return window.ChartStudioV5Preview.setPositions({scope,source:"MT5_VERIFIED",canExecute:false,positions:[
    {ticket:"71001",side:"BUY",priceOpen:4161,sl:4158,tp:4168},
    {ticket:"71002",side:"SELL",priceOpen:4165,sl:4169,tp:null},
   ]},token);
  });
  assert.deepEqual(positions,{applied:true,count:5},"verified position entry/SL/TP overlays render in v5");
  assert.equal((await page.evaluate(()=>window.ChartStudioV5Preview.readPositions())).count,5);
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
  await page.locator("#chart-v5-ray-btn").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#chart-v5-ray-btn").getAttribute("aria-pressed"),"false","Escape cancels a pending drawing tool");
  assert.equal(await page.evaluate(()=>window.ChartStudioV5Preview.inspect().nativeDrawingCount),2,"cancel does not persist an incomplete drawing");
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
