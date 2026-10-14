"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const server=spawn("python",["-m","http.server","8872","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try {
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture HTTP server crashed");
   try{if((await fetch("http://127.0.0.1:8872/chart_studio_v5/fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture server unavailable");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:840}});
  const errors=[],writes=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(request.method()!=="GET")writes.push(request.url())});
  await page.goto("http://127.0.0.1:8872/chart_studio_v5/fixture.html",{waitUntil:"networkidle"});
  assert.equal(await page.evaluate(()=>window.__chartV5Ready),true);
  const result=await page.evaluate(()=>{
   const engine=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan");
   const bars=Array.from({length:80},(_,i)=>{
    const p=4100+Math.sin(i/7)*10+i*.2;
    return {time:1700000000+i*900,open:p,high:p+5,low:p-4,close:p+2,
     ...(i===42?{}:{tick_volume:100+i}),...(i===40?{real_volume:700}: {})};
   });
   engine.setCandles(bars);
   engine.addAverage({id:"ema34",color:"#62deeb",lineWidth:2,title:"EMA 34"},
    bars.slice(33).map(c=>({time:c.time,value:c.close-.7})));
   engine.moveAverage("ema34",1);
   engine.addPaneLine({id:"rsi14",color:"#b3d5ff",title:"RSI 14"},
    bars.slice(14).map((c,i)=>({time:c.time,value:50+10*Math.sin(i/8)})));
   engine.resizePane(2,175);
   engine.movePaneLine("rsi14",1);
   engine.showVolume(true);
   engine.addPriceLevel({id:"risk-stop",price:4100,color:"#ff6677",title:"Demo stop"});
   const withPrimitive=engine.inspect();
   engine.updatePriceLevel("risk-stop",{price:4110,color:"#ffaa66"});
   const updatedPrimitive=engine.inspect();
   const removedPrimitive=engine.removePriceLevel("risk-stop");
   const withoutPrimitive=engine.inspect();
   let invalidPrimitiveRejected=false;try{engine.addPriceLevel({id:"bad",price:0,color:"red"})}catch(_){invalidPrimitiveRejected=true}
   const warmupReadout=engine.readDataWindow(bars[10].time);
   const alignedReadout=engine.readDataWindow(bars[40].time);
   const noVolumeReadout=engine.readDataWindow(bars[42].time);
   const missingBarReadout=engine.readDataWindow(bars[40].time+450);
   let invalidReadoutTimeRejected=false;try{engine.readDataWindow(NaN)}catch(_){invalidReadoutTimeRejected=true}
   const first=engine.inspect();
   engine.updateLast({...bars[79],close:bars[79].close+1});
   const formingReadout=engine.readDataWindow(bars[79].time);
   const updated=engine.inspect();
   let staleRejected=false;try{engine.updateLast(bars[0])}catch(_){staleRejected=true}
   let invalidRejected=false;try{engine.setCandles([{time:1,open:-4,high:10,low:1,close:2}])}
    catch(_){invalidRejected=true}
   let badVolumeRejected=false;try{engine.setCandles([{time:1700000000,open:1,high:2,low:.5,close:1.5,tick_volume:NaN}])}
    catch(_){badVolumeRejected=true}
   let badPaneRejected=false;try{engine.resizePane(0,10)}catch(_){badPaneRejected=true}
   engine.setCandles([bars[79]]);
   const replacementReadout=engine.readDataWindow(bars[79].time);
   engine.addPriceLevel({id:"account-local-level",price:bars[79].close,color:"#62deeb"});
   engine.changeAccount("goldm15");
   const isolated=engine.inspect();
   const removed=engine.removeAverage("ema34");
   engine.destroy();
   let disposed=false;try{engine.setCandles(bars)}catch(_){disposed=true}
   return {first,updated,staleRejected,invalidRejected,isolated,removed,disposed,badPaneRejected,
    withPrimitive,updatedPrimitive,removedPrimitive,withoutPrimitive,invalidPrimitiveRejected,
    warmupReadout,alignedReadout,noVolumeReadout,missingBarReadout,formingReadout,
    replacementReadout,badVolumeRejected,invalidReadoutTimeRejected,
    expectedWarmupOpen:bars[10].open,expectedWarmupUtc:new Date(bars[10].time*1000).toISOString()};
  });
  assert.equal(result.first.version,"5.2.1");
  assert.equal(result.first.candleCount,80);
  assert.equal(result.first.averageCount,1);
  assert.equal(result.first.nativePaneLines,1);
  assert.equal(result.first.volumeVisible,true);
  assert.equal(result.withPrimitive.nativePrimitives,1);
  assert.equal(result.updatedPrimitive.nativePrimitives,1);
  assert.equal(result.removedPrimitive,true);
  assert.equal(result.withoutPrimitive.nativePrimitives,0);
  assert.equal(result.invalidPrimitiveRejected,true);
  assert.ok(result.first.paneCount>=2);
  assert.equal(result.warmupReadout.state,"AVAILABLE");
  assert.equal(result.warmupReadout.source,"CHART_FEED");
  assert.equal(result.warmupReadout.account,"titan");
  assert.equal(result.warmupReadout.ohlc.open,result.expectedWarmupOpen);
  assert.equal(result.warmupReadout.timeUtc,result.expectedWarmupUtc);
  assert.equal(result.warmupReadout.volume.source,"TICK_VOLUME_PROXY");
  assert.equal(result.warmupReadout.indicators.find(x=>x.id==="ema34").state,"WARMUP_OR_MISSING");
  assert.equal(result.alignedReadout.volume.value,700);
  assert.equal(result.alignedReadout.volume.source,"REAL_VOLUME");
  assert.equal(result.alignedReadout.indicators.find(x=>x.id==="ema34").value,
   result.alignedReadout.ohlc.close-.7);
  assert.equal(result.alignedReadout.indicators.find(x=>x.id==="rsi14").state,"AVAILABLE");
  assert.equal(result.noVolumeReadout.volume.source,"UNAVAILABLE");
  assert.equal(result.noVolumeReadout.volume.value,null);
  assert.equal(result.missingBarReadout.state,"UNAVAILABLE");
  assert.equal(result.invalidReadoutTimeRejected,true);
  assert.equal(result.formingReadout.indicators.find(x=>x.id==="ema34").state,"WARMUP_OR_MISSING");
  assert.equal(result.replacementReadout.indicators.length,0);
  assert.equal(result.badVolumeRejected,true);
  assert.equal(result.updated.candleCount,80);
  assert.equal(result.staleRejected,true);
  assert.equal(result.invalidRejected,true);
  assert.equal(result.isolated.account,"goldm15");
  assert.equal(result.isolated.candleCount,0);
  assert.equal(result.isolated.averageCount,0);
  assert.equal(result.isolated.nativePaneLines,0);
  assert.equal(result.isolated.nativePrimitives,0);
  assert.equal(result.badPaneRejected,true);
  assert.equal(result.removed,false);
  assert.equal(result.disposed,true);
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  // Separate render persists for visual/screenshot inspection even after lifecycle verification above.
  await page.evaluate(()=>{
   const e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan");
   const rows=Array.from({length:90},(_,i)=>{
    const p=4000+i*.4+Math.sin(i/10)*16;
    return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3};
   });
   e.setCandles(rows);
   e.addAverage({id:"ema21",color:"#61ddf2"},rows.slice(20).map(c=>({time:c.time,value:c.close-1.2})));
   e.addPaneLine({id:"rsi14",color:"#f7c774"},rows.slice(14).map((c,i)=>({time:c.time,value:45+18*Math.sin(i/8)})));
   e.addPriceLevel({id:"visual-level",price:rows[52].close,color:"#ffb86b",title:"Read-only level"});
   e.showVolume(true);window.__v5Screenshot=e;
  });
  await page.waitForTimeout(150);
  assert.ok((await page.locator("#chart canvas").count())>=1);
  const folder=path.join("output","visual-smoke");
  fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,"chart-studio-v5-poc.png"),fullPage:true});
  console.log("PASS native v5 chart, configurable oscillator panes, move/resize, averages, volume, account isolation, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
