"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const path=require("node:path");

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage();
  const requests=[];
  page.on("request",request=>requests.push({url:request.url(),method:request.method()}));
  await page.setContent('<!doctype html><html lang="de"><body><div id="chart"></div></body></html>');
  await page.addScriptTag({path:path.resolve("static/chart-studio-v5-feed.js")});
  const result=await page.evaluate(()=>{
   const calls=[];
   const engine=()=>({setCandles:value=>calls.push({engine:"one",method:"setCandles",value})});
   const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
   const bridge=ChartStudioV5Feed.create(engine(),scope);
   const candles=[
    {time:1792108800,open:4100,high:4105,low:4098,close:4103,tick_volume:22,real_volume:0},
    {time:1792109700,open:4103,high:4108,low:4101,close:4106,tick_volume:31,real_volume:0}
   ];
   const envelope={accountId:"titan",symbol:"XAUUSD",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,candles};
   const oldRead=bridge.beginRead();
   const currentRead=bridge.beginRead();
   const staleSameScope=bridge.update(envelope,oldRead);
   const accepted=bridge.update(envelope,currentRead);
   const wrongAccount=bridge.update({...envelope,accountId:"xau5m_m5"},bridge.beginRead());
   const wrongSymbol=bridge.update({...envelope,symbol:"EURUSD"},bridge.beginRead());
   const wrongTimeframe=bridge.update({...envelope,timeframe:"M5"},bridge.beginRead());
   const synthetic=bridge.update({...envelope,source:"SYNTHETIC"},bridge.beginRead());
   const executable=bridge.update({...envelope,canExecute:true},bridge.beginRead());
   const invalidOHLC=bridge.update({...envelope,candles:[{...candles[0],high:1}]},bridge.beginRead());
   const duplicateTime=bridge.update({...envelope,candles:[candles[0],candles[0]]},bridge.beginRead());
   const tooMany=bridge.update({...envelope,candles:Array(5001).fill(candles[0])},bridge.beginRead());
   const generation=bridge.setScope({account:"titan_m5",symbol:"XAUUSD.p",timeframe:"M15"});
   const staleScope=bridge.update(envelope,{generation:generation-1,sequence:999});
   const next={accountId:"titan_m5",symbol:"XAUUSD.p",timeframe:"M15",source:"MT5_VERIFIED",canExecute:false,candles};
   const acceptedNext=bridge.update(next,bridge.beginRead());
   const readFailureToken=bridge.beginRead();
   bridge.clear();
   const responseAfterFailure=bridge.update(next,readFailureToken);
   const state=bridge.inspect();
   return {calls,staleSameScope,accepted,wrongAccount,wrongSymbol,wrongTimeframe,synthetic,executable,
    invalidOHLC,duplicateTime,tooMany,staleScope,acceptedNext,responseAfterFailure,state};
  });
  assert.deepEqual(result.staleSameScope,{applied:false,reason:"STALE_REQUEST"});
  assert.deepEqual(result.accepted,{applied:true,candleCount:2});
  for(const name of ["wrongAccount","wrongSymbol","wrongTimeframe"])
   assert.equal(result[name].reason,"SCOPE_MISMATCH",name);
  assert.equal(result.synthetic.reason,"UNVERIFIED_SOURCE");
  assert.equal(result.executable.reason,"UNVERIFIED_SOURCE");
  assert.equal(result.invalidOHLC.reason,"INVALID_CANDLES");
  assert.equal(result.duplicateTime.reason,"INVALID_CANDLES");
  assert.equal(result.tooMany.reason,"INVALID_CANDLES");
  assert.deepEqual(result.staleScope,{applied:false,reason:"STALE_SCOPE"});
  assert.deepEqual(result.acceptedNext,{applied:true,candleCount:2});
  assert.deepEqual(result.responseAfterFailure,{applied:false,reason:"STALE_REQUEST"});
  assert.deepEqual(result.state.scope,{account:"titan_m5",symbol:"XAUUSD.p",timeframe:"M15"});
  assert.equal(result.state.status,"EMPTY");
  assert.equal(result.state.candleCount,0);
  assert.ok(result.calls.some(call=>call.method==="setCandles"&&call.value.length===0),"scope changes clear old candles");
  assert.ok(result.calls.every(call=>call.method==="setCandles"),"the bridge can only replace renderer candles");
  assert.deepEqual(requests,[],"the bridge performs no fetches, broker writes or other network operations");
  console.log("PASS strict read-only v5 candle bridge scope, provenance, bounds and stale-response contract");
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
