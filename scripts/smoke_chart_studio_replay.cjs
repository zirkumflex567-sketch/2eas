"use strict";
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const {spawn}=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
(async()=>{
 const server=spawn("python",["-m","http.server","8877","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server crashed");
   try{if((await fetch("http://127.0.0.1:8877/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("HTTP startup timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[],writes=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",r=>{if(r.method()!=="GET")writes.push(r.url())});
  await page.goto("http://127.0.0.1:8877/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  await page.locator(".cs-replay summary").click();
  await page.waitForSelector(".cs-replay-plot canvas");
  let state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.sourceBars,120);
  assert.equal(state.active,false);
  await page.locator(".cs-replay-actions button").nth(0).click();
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.active,true);assert.equal(state.snapshotBars,120);
  assert.equal(state.visibleBars,1);
  await page.locator(".cs-replay-actions button").nth(1).click();
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).visibleBars,2);
  await page.evaluate(()=>ChartStudioReplay.seek(33));
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).visibleBars,34);
  // No future-bar leak: live updates while in replay do not extend the frozen snapshot.
  await page.evaluate(()=>{
   const x=Array.from({length:121},(_,i)=>({time:1700000000+i*900,
    open:4100+i,high:4108+i,low:4090+i,close:4104+i}));
   ChartStudioReplay.updateBars(x);
  });
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.snapshotBars,120);assert.equal(state.visibleBars,34);
  const recordedReplay=await page.evaluate(async()=>{
   const stable=v=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")}}`:JSON.stringify(v);
   const bars=Array.from({length:4},(_,i)=>({timeUtc:new Date((1700600000+i*900)*1000).toISOString(),open:"4100.00",high:"4110.00",low:"4090.00",close:"4105.00",tickVolume:10,spread:2,realVolume:0}));
   const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(stable(value)))),b=>b.toString(16).padStart(2,"0")).join("");
   const sha256=await digest(bars),asOfUtc=new Date((1700600000+4000)*1000).toISOString();
   const record={schemaVersion:1,type:"SNAPSHOT",id:"snap_test",accountId:"titan",brokerServer:"ICMarketsEU-Demo",terminalIdentityHash:"a".repeat(64),dataRevision:1,provenance:"RECORDED",payload:{snapshotId:"snap_test",accountId:"titan",positionIdentifier:"1001",dealTicket:"1002",captureType:"EXIT",asOfUtc,chartView:{symbol:"XAUUSD",timeframe:"M15",fromUtc:bars[0].timeUtc,toUtc:bars[3].timeUtc,seriesType:"CANDLE",priceScale:"NORMAL"},marketDataRef:{id:"bars_"+sha256.slice(0,48),sourceType:"MARKET_BAR",accountId:"titan",brokerServer:"ICMarketsEU-Demo",symbol:"XAUUSD",eventTimeUtc:bars[3].timeUtc,recordedAtUtc:asOfUtc,sourceRevision:sha256,confidenceKind:"OBSERVED"},indicatorInstanceRevisions:[],decisionEventIds:[{type:"DECISION",id:"decision_1",dataRevision:1}],lifecycleEventIds:[{type:"LIFECYCLE",id:"life_1",dataRevision:1}],renderStatus:"DATA_ONLY",renderAssetRef:null,createdAtUtc:asOfUtc,marketData:{source:"MT5_COMPLETED_BARS",bars,sha256}}};
   const events=[{schemaVersion:1,type:"DECISION",id:"decision_1",accountId:"titan",dataRevision:1,provenance:"RECORDED",payload:{eventId:"decision_1",accountId:"titan",decisionTimeUtc:new Date((1700600000+1800)*1000).toISOString(),stage:"FILTER",outcome:"PASS",symbol:"XAUUSD",timeframe:"M15",strategyId:"titan"}},{schemaVersion:1,type:"LIFECYCLE",id:"life_1",accountId:"titan",dataRevision:1,provenance:"RECORDED",payload:{id:"life_1",accountId:"titan",asOfUtc:new Date((1700600000+3900)*1000).toISOString(),eventType:"ENTRY",source:"MT5_DEAL",dealEntry:"IN",dealSide:"BUY",symbol:"XAUUSD",positionIdentifier:"1001"}}];
   const supported=typeof ChartStudioReplay.startSnapshot==="function";let result=null,rejected={};
   if(supported){ChartStudioReplay.switchContext("titan","H1","EURUSD");ChartStudioReplay.updateBars(bars.map(b=>({time:Date.parse(b.timeUtc)/1000,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)})));result=await ChartStudioReplay.startSnapshot({record,events});
    const initial=ChartStudioReplay.inspect();ChartStudioReplay.updateBars([{time:1700610000,open:1,high:2,low:1,close:1.5}]);const frozen=ChartStudioReplay.inspect();ChartStudioReplay.step();const afterDecision=ChartStudioReplay.inspect();ChartStudioReplay.seek(2);const beforeSnapshotAsOf=ChartStudioReplay.inspect();ChartStudioReplay.seek(3);const full=ChartStudioReplay.inspect();ChartStudioReplay.seek(1);const rewind=ChartStudioReplay.inspect();
    const badHash=structuredClone(record);badHash.payload.marketData.sha256="f".repeat(64);
    const badSymbol=structuredClone(record);badSymbol.payload.marketDataRef.symbol="EURUSD";
    const futureEvent=structuredClone(events[0]);futureEvent.payload.decisionTimeUtc=new Date((1700600000+3601)*1000).toISOString();
    const badRevision=structuredClone(events);badRevision[0].dataRevision=2;
    for(const [name,badRecord,badEvents] of [["account",{...record,accountId:"other"},events],["source",{...record,provenance:"RECONSTRUCTED"},events],["hash",badHash,events],["symbol",badSymbol,events],["future",record,[futureEvent]],["unreferenced",record,[events[0]]],["revision",record,badRevision]]){try{await ChartStudioReplay.startSnapshot({record:badRecord,events:badEvents})}catch(_){rejected[name]=true}}
    const unchanged=ChartStudioReplay.inspect(),staleRequest=ChartStudioReplay.startSnapshot({record,events});ChartStudioReplay.switchContext("titan","M5","GBPUSD");let staleRejected=false;try{await staleRequest}catch(_){staleRejected=true}const contextAfterStale=ChartStudioReplay.inspect();ChartStudioReplay.switchContext("titan","H1","EURUSD");const restored=ChartStudioReplay.inspect();return {supported,result,initial,frozen,afterDecision,beforeSnapshotAsOf,full,rewind,rejected,unchanged,staleRejected,contextAfterStale,restored};
   }
   return {supported};
  });
  assert.equal(recordedReplay.supported,true,"recorded evidence can start an as-of replay");
  assert.equal(recordedReplay.result.status,"STARTED");assert.equal(recordedReplay.result.bars,4);assert.equal(recordedReplay.result.events,2);
  assert.equal(recordedReplay.initial.visibleBars,1);assert.deepEqual(recordedReplay.initial.visibleEventIds,[]);
  assert.equal(recordedReplay.frozen.snapshotBars,4);assert.equal(recordedReplay.frozen.sourceBars,4,"Live candle updates cannot leak into a frozen evidence replay");
  assert.deepEqual(recordedReplay.afterDecision.visibleEventIds,["decision_1"]);
  assert.deepEqual(recordedReplay.beforeSnapshotAsOf.visibleEventIds,["decision_1"],"An event after the final closed candle remains hidden until the frozen snapshot as-of endpoint");
  assert.deepEqual(recordedReplay.full.visibleEventIds,["decision_1","life_1"]);
  assert.deepEqual(recordedReplay.rewind.visibleEventIds,["decision_1"]);
  assert.deepEqual(recordedReplay.rejected,{account:true,source:true,hash:true,symbol:true,future:true,unreferenced:true,revision:true});
  assert.deepEqual(recordedReplay.unchanged.visibleEventIds,["decision_1"],"invalid historical evidence must not replace the active replay");
  assert.equal(recordedReplay.staleRejected,true,"A chart context change during asynchronous snapshot verification cancels the stale replay");
  assert.equal(recordedReplay.contextAfterStale.symbol,"GBPUSD");assert.equal(recordedReplay.contextAfterStale.timeframe,"M5");assert.equal(recordedReplay.contextAfterStale.active,false);
  assert.equal(recordedReplay.restored.symbol,"EURUSD");assert.equal(recordedReplay.restored.timeframe,"H1","Ending a historical snapshot restores the current live replay context");
  const out=path.join("output","visual-smoke");fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,"chart-studio-replay.png"),fullPage:true});
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  state=await page.evaluate(()=>ChartStudioReplay.inspect());
  assert.equal(state.account,"goldm15");assert.equal(state.active,false);
  assert.equal(state.sourceBars,0);assert.equal(state.visibleBars,0);
  await page.evaluate(()=>ChartStudioBeta.timeframe("H1"));
  assert.equal((await page.evaluate(()=>ChartStudioReplay.inspect())).timeframe,"H1");
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log("PASS read-only replay: as-of prefixes, frozen snapshot, account/timeframe reset, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
