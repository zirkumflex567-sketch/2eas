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
<div id="chart-v5-preview-host"></div><p>Read only. Powered by <a href="https://www.tradingview.com/">TradingView Lightweight Charts™</a></p></section></body></html>`;

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
  const first=await page.evaluate(candles=>{
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
   window.ChartStudioV5Preview.setScope(scope);
   const token=window.ChartStudioV5Preview.beginRead();
   return window.ChartStudioV5Preview.update({accountId:scope.account,symbol:scope.symbol,timeframe:scope.timeframe,source:"MT5_VERIFIED",canExecute:false,candles},token);
  },candles);
  assert.deepEqual(first,{applied:true,candleCount:150});
  const v4Before=await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width}));
  await page.locator("#chart-v5-preview-btn").click();
  await page.waitForFunction(()=>document.querySelector("#chart-v5-preview-status")?.textContent.includes("150 verifizierte Kerzen"));
  await page.waitForFunction(()=>[...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas=>canvas.width>300&&canvas.height>200));
  const v4After=await page.locator("#tv-chart").evaluate(el=>({visible:!!el.getClientRects().length,canvas:el.querySelector("canvas#v4-sentinel")?.width}));
  assert.deepEqual(v4After,v4Before,"v5 owns a separate host and leaves v4 mounted");
  assert.match(await page.locator("#chart-v5-preview-title").textContent(),/XAUUSD M15/);

  const scopeSwitch=await page.evaluate(candles=>{
   const stale=window.ChartStudioV5Preview.beginRead();
   window.ChartStudioV5Preview.setScope({account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"});
   const staleResult=window.ChartStudioV5Preview.update({accountId:"titan",symbol:"XAUUSD",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,candles},stale);
   const current=window.ChartStudioV5Preview.beginRead();
   const updated=window.ChartStudioV5Preview.update({accountId:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,candles},current);
   return {staleResult,updated,state:window.ChartStudioV5Preview.inspect()};
  },candles);
  assert.deepEqual(scopeSwitch.staleResult,{applied:false,reason:"STALE_SCOPE"});
  assert.deepEqual(scopeSwitch.updated,{applied:true,candleCount:150});
  assert.equal(scopeSwitch.state.scope.account,"xau5m_m5");
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
