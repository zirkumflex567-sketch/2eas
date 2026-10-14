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
   engine.addPriceLevel({id:"risk-stop",price:4100,color:"#ff6677"});
   engine.addTimeMarker({id:"entry-time",time:bars[40].time,color:"#c18bff"});
   let duplicateDrawingRejected=false;try{engine.addTimeMarker({id:"risk-stop",time:bars[40].time,color:"#ffffff"})}catch(_){duplicateDrawingRejected=true}
   let drawingIndicatorCollisionRejected=false;try{engine.addAverage({id:"risk-stop",color:"#ffffff"},[])}catch(_){drawingIndicatorCollisionRejected=true}
   const withPrimitive=engine.inspect();
   engine.updatePriceLevel("risk-stop",{price:4110,color:"#ffaa66"});
   engine.updateTimeMarker("entry-time",{time:bars[41].time,color:"#d8aaff"});
   const updatedPrimitive=engine.inspect();
   const removedPrimitive=engine.removePriceLevel("risk-stop");
   const removedTimeMarker=engine.removeTimeMarker("entry-time");
   const withoutPrimitive=engine.inspect();
   let invalidPrimitiveRejected=false;try{engine.addPriceLevel({id:"bad",price:0,color:"red"})}catch(_){invalidPrimitiveRejected=true}
   let unknownTimeRejected=false;try{engine.addTimeMarker({id:"unknown-time",time:bars[40].time+1,color:"#ffffff"})}catch(_){unknownTimeRejected=true}
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
   engine.addTimeMarker({id:"history-marker",time:bars[40].time,color:"#ffffff"});
   engine.setCandles([bars[79]]);
   const replacementReadout=engine.readDataWindow(bars[79].time);
   const staleHistoryMarker=engine.drawingPosition("history-marker");
   engine.addPriceLevel({id:"account-local-level",price:bars[79].close,color:"#62deeb"});
   engine.changeAccount("goldm15");
   const isolated=engine.inspect();
   const removed=engine.removeAverage("ema34");
   engine.destroy();
   let disposed=false;try{engine.setCandles(bars)}catch(_){disposed=true}
   return {first,updated,staleRejected,invalidRejected,isolated,removed,disposed,badPaneRejected,
    withPrimitive,updatedPrimitive,removedPrimitive,removedTimeMarker,withoutPrimitive,invalidPrimitiveRejected,unknownTimeRejected,duplicateDrawingRejected,
    staleHistoryMarker,drawingIndicatorCollisionRejected,
    warmupReadout,alignedReadout,noVolumeReadout,missingBarReadout,formingReadout,
    replacementReadout,badVolumeRejected,invalidReadoutTimeRejected,
    expectedWarmupOpen:bars[10].open,expectedWarmupUtc:new Date(bars[10].time*1000).toISOString()};
  });
  assert.equal(result.first.version,"5.2.1");
  assert.equal(result.first.candleCount,80);
  assert.equal(result.first.averageCount,1);
  assert.equal(result.first.nativePaneLines,1);
  assert.equal(result.first.volumeVisible,true);
  assert.equal(result.first.persistenceStatus,"DISABLED");
  assert.equal(result.withPrimitive.nativePrimitives,2);
  assert.equal(result.updatedPrimitive.nativePrimitives,2);
  assert.equal(result.removedPrimitive,true);
  assert.equal(result.removedTimeMarker,true);
  assert.equal(result.withoutPrimitive.nativePrimitives,0);
  assert.equal(result.invalidPrimitiveRejected,true);
  assert.equal(result.unknownTimeRejected,true);
  assert.equal(result.duplicateDrawingRejected,true);
  assert.equal(result.staleHistoryMarker,null);
  assert.equal(result.drawingIndicatorCollisionRejected,true);
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
   const e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"XAUUSD",timeframe:"M15"});
   const rows=Array.from({length:90},(_,i)=>{
    const p=4000+i*.4+Math.sin(i/10)*16;
    return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3};
   });
   e.setCandles(rows);
   e.addAverage({id:"ema21",color:"#61ddf2"},rows.slice(20).map(c=>({time:c.time,value:c.close-1.2})));
   e.addPaneLine({id:"rsi14",color:"#f7c774"},rows.slice(14).map((c,i)=>({time:c.time,value:45+18*Math.sin(i/8)})));
   e.addPriceLevel({id:"visual-level",price:rows[52].close,color:"#ffb86b"});
   e.addTimeMarker({id:"visual-time",time:rows[45].time,color:"#c18bff"});
   e.addTextAnnotation({id:"visual-note",time:rows[52].time,price:rows[52].close,text:"Plan is ready",color:"#7dd3fc"});
   e.addTrendLine({id:"visual-trend",startTime:rows[42].time,startPrice:rows[42].close,endTime:rows[64].time,endPrice:rows[64].close,color:"#9be564"});
   e.addRectangle({id:"visual-zone",startTime:rows[25].time,startPrice:rows[25].close+10,endTime:rows[35].time,endPrice:rows[35].close-10,color:"#f59e0b",fill:true});
   e.showVolume(true);window.__v5Screenshot=e;
  });
  await page.waitForTimeout(150);
  const initialRectanglePosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-zone"));
  await page.mouse.move(initialRectanglePosition.x,initialRectanglePosition.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-zone");
  const priceXY=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-level"));
  const originalPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.mouse.move(priceXY.x,priceXY.y);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-level");
  await page.mouse.down();
  const hasPointerCapture=await page.evaluate(()=>document.getElementById("chart").hasPointerCapture(1));
  await page.mouse.move(priceXY.x,priceXY.y-24,{steps:3});
  await page.mouse.up();
  const movedPrice=await page.evaluate(()=>({drawing:window.__v5Screenshot.readDrawing("visual-level"),position:window.__v5Screenshot.drawingPosition("visual-level")}));
  const priceUndo=await page.evaluate(()=>window.__v5Screenshot.undo());
  const undonePrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const priceRedo=await page.evaluate(()=>window.__v5Screenshot.redo());
  const redonePrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const selectedPrice=await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingId);
  await page.mouse.move(movedPrice.position.x,movedPrice.position.y);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.mouse.move(movedPrice.position.x,movedPrice.position.y-30,{steps:2});
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const escapedPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.keyboard.press("l");
  const lockedPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const lockedPosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-level"));
  await page.mouse.move(lockedPosition.x,lockedPosition.y);
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.move(lockedPosition.x,lockedPosition.y-24,{steps:2});
  await page.mouse.up();
  const afterLockedDrag=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.keyboard.press("l");
  await page.keyboard.press("h");
  const hiddenPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const hiddenPricePosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-level"));
  await page.keyboard.press("h");
  const shownPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const timePoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-time"));
  await page.mouse.move(timePoint.x,timePoint.y);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-time");
  await page.mouse.down();
  await page.mouse.move(timePoint.x+35,timePoint.y,{steps:3});
  await page.mouse.up();
  const movedTime=await page.evaluate(()=>({drawing:window.__v5Screenshot.readDrawing("visual-time"),position:window.__v5Screenshot.drawingPosition("visual-time")}));
  const timeUndo=await page.evaluate(()=>window.__v5Screenshot.undo());
  const undoneTime=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-time"));
  const timeRedo=await page.evaluate(()=>window.__v5Screenshot.redo());
  const redoneTime=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-time"));
  const selectedTime=await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingId);
  assert.equal(hasPointerCapture,true);
  assert.ok(Number.isFinite(movedPrice.drawing.price));
  assert.notEqual(movedPrice.position.y,priceXY.y);
  assert.equal(priceUndo,true);
  assert.equal(undonePrice.price,originalPrice.price);
  assert.equal(priceRedo,true);
  assert.equal(redonePrice.price,movedPrice.drawing.price);
  assert.equal(escapedPrice.price,movedPrice.drawing.price);
  assert.equal(lockedPrice.locked,true);
  assert.equal(afterLockedDrag.price,lockedPrice.price);
  assert.equal(hiddenPrice.visible,false);
  assert.equal(hiddenPricePosition,null);
  assert.equal(shownPrice.visible,true);
  assert.equal(timeUndo,true);
  assert.equal(undoneTime.time,1700100000+45*900);
  assert.equal(timeRedo,true);
  assert.equal(redoneTime.time,movedTime.drawing.time);
  assert.notEqual(movedTime.drawing.time,1700100000+45*900);
  assert.equal((movedTime.drawing.time-1700100000)%900,0);
  assert.notEqual(movedTime.position.x,timePoint.x);
  assert.equal(selectedPrice,"visual-level");
  assert.equal(selectedTime,"visual-time");
  const notePoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-note"));
  const originalNote=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-note"));
  await page.mouse.move(notePoint.x,notePoint.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-note");
  await page.mouse.down();await page.mouse.move(notePoint.x+28,notePoint.y-18,{steps:3});
  const movedNote=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-note"));
  await page.keyboard.press("Escape");await page.mouse.up();
  assert.notEqual(movedNote.time,originalNote.time);
  assert.notEqual(movedNote.price,originalNote.price);
  const restoredNote=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-note"));
  assert.deepEqual(restoredNote,originalNote);
  const trendPoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-trend"));
  assert.ok(Number.isFinite(trendPoint.x)&&Number.isFinite(trendPoint.y));
  const rectanglePoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-zone"));
  assert.ok(Number.isFinite(rectanglePoint.x)&&Number.isFinite(rectanglePoint.y));
  await page.keyboard.press("Control+d");
  const duplicateId=await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingId);
  assert.ok(duplicateId&&duplicateId!=="visual-time");
  assert.ok(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),duplicateId));
  await page.keyboard.press("Delete");
  assert.equal(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),duplicateId),null);
  await page.keyboard.press("Control+z");
  assert.ok(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),duplicateId));
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),duplicateId),null);
  await page.evaluate(()=>window.__v5Screenshot.addRay({id:"visual-ray",startTime:1700100000+20*900,startPrice:4000+20*.4+Math.sin(2)*16,endTime:1700100000+35*900,endPrice:4000+35*.4+Math.sin(3.5)*16,color:"#fb7185"}));
  const rayPosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-ray"));
  const chartBounds=await page.locator("#chart").boundingBox();
  assert.ok(Number.isFinite(rayPosition.x)&&rayPosition.x>chartBounds.x+chartBounds.width*.5);
  await page.evaluate(()=>window.__v5Screenshot.addRay({id:"visual-ray-reverse",startTime:1700100000+35*900,startPrice:4000+35*.4+Math.sin(3.5)*16,endTime:1700100000+20*900,endPrice:4000+20*.4+Math.sin(2)*16,color:"#fb7185"}));
  const reverseRayPosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-ray-reverse"));
  assert.ok(Number.isFinite(reverseRayPosition.x)&&reverseRayPosition.x<chartBounds.x+chartBounds.width*.5);
  await page.evaluate(()=>window.__v5Screenshot.removeRay("visual-ray-reverse"));
  await page.mouse.move(10,10);
  await page.waitForTimeout(150);
  const persistedBeforeReload=await page.evaluate(()=>({price:window.__v5Screenshot.readDrawing("visual-level"),time:window.__v5Screenshot.readDrawing("visual-time"),text:window.__v5Screenshot.readDrawing("visual-note"),trend:window.__v5Screenshot.readDrawing("visual-trend"),rectangle:window.__v5Screenshot.readDrawing("visual-zone"),ray:window.__v5Screenshot.readDrawing("visual-ray")}));
  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartV5Ready===true);
  const persistenceProbe=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3}});
   const scope={symbol:"XAUUSD",timeframe:"M15"};
   let e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",scope);e.setCandles(rows);
   const restored={status:e.inspect().persistenceStatus,count:e.inspect().nativePrimitives,price:e.readDrawing("visual-level"),time:e.readDrawing("visual-time"),text:e.readDrawing("visual-note"),trend:e.readDrawing("visual-trend"),rectangle:e.readDrawing("visual-zone"),ray:e.readDrawing("visual-ray")};
   e.changeAccount("goldm15");e.setCandles(rows);const otherAccount=e.inspect().nativePrimitives;
   e.changeAccount("titan");e.setCandles(rows);const returned=e.inspect().nativePrimitives;
   e.destroy();
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"XAUUSD",timeframe:"H1"});e.setCandles(rows);
   const otherTimeframe=e.inspect().nativePrimitives;e.destroy();
   const conflictKey="2eas.chartstudio.v5.drawings:titan:EURUSD:M5";
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"EURUSD",timeframe:"M5"});e.setCandles(rows);
   e.addPriceLevel({id:"local-level",price:4000,color:"#ffffff"});
   const externalSnapshot=JSON.stringify({external:true});localStorage.setItem(conflictKey,externalSnapshot);
   e.updatePriceLevel("local-level",{price:4001});
   const conflict={status:e.inspect().persistenceStatus,stored:localStorage.getItem(conflictKey)};e.destroy();
   const corruptKey="2eas.chartstudio.v5.drawings:titan:GBPUSD:M5";localStorage.setItem(corruptKey,"not-json");
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"GBPUSD",timeframe:"M5"});e.setCandles(rows);
   const corrupt={status:e.inspect().persistenceStatus,error:e.inspect().persistenceError,stored:localStorage.getItem(corruptKey)};e.destroy();
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",scope);e.setCandles(rows);
   e.addAverage({id:"ema21",color:"#61ddf2"},rows.slice(20).map(c=>({time:c.time,value:c.close-1.2})));
   e.addPaneLine({id:"rsi14",color:"#f7c774"},rows.slice(14).map((c,i)=>({time:c.time,value:45+18*Math.sin(i/8)})));
   e.showVolume(true);window.__v5Screenshot=e;
   return {restored,otherAccount,returned,otherTimeframe,conflict,externalSnapshot,corrupt};
  });
  assert.equal(persistenceProbe.restored.status,"READY");
  assert.equal(persistenceProbe.restored.count,6);
  assert.deepEqual(persistenceProbe.restored.price,persistedBeforeReload.price);
  assert.deepEqual(persistenceProbe.restored.time,persistedBeforeReload.time);
  assert.deepEqual(persistenceProbe.restored.text,persistedBeforeReload.text);
  assert.deepEqual(persistenceProbe.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(persistenceProbe.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(persistenceProbe.restored.ray,persistedBeforeReload.ray);
  assert.equal(persistenceProbe.otherAccount,0);
  assert.equal(persistenceProbe.returned,6);
  assert.equal(persistenceProbe.otherTimeframe,0);
  assert.equal(persistenceProbe.conflict.status,"CONFLICT");
  assert.equal(persistenceProbe.conflict.stored,persistenceProbe.externalSnapshot);
  assert.equal(persistenceProbe.corrupt.status,"UNAVAILABLE");
  assert.equal(persistenceProbe.corrupt.error,"INVALID_SNAPSHOT");
  assert.equal(persistenceProbe.corrupt.stored,"not-json");
  const drawingTransfer=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3}});
   const scope={symbol:"XAUUSD",timeframe:"M15"};
   const source=window.__v5Screenshot.exportDrawings();
   const target=ChartStudioV5.createStudioV5(document.getElementById("chart"),"importtest",scope);target.setCandles(rows);
   const imported=target.importDrawings(source),restored={count:target.inspect().nativePrimitives,price:target.readDrawing("visual-level"),time:target.readDrawing("visual-time"),text:target.readDrawing("visual-note"),trend:target.readDrawing("visual-trend"),rectangle:target.readDrawing("visual-zone"),ray:target.readDrawing("visual-ray")};
   target.updateTextAnnotation("visual-note",{text:"Edited note"});const edited=target.readDrawing("visual-note");
   target.removeTextAnnotation("visual-note");const removed=target.readDrawing("visual-note");target.undo();
   const restoredByUndo=target.readDrawing("visual-note");let invalidText="";try{target.addTextAnnotation({id:"invalid-note",time:rows[52].time,price:4000,text:"\u00e4",color:"#ffffff"})}catch(error){invalidText=error.message}
   target.setCandles(rows.slice(50));target.updateTrendLine("visual-trend",{locked:true});const unavailableAnchorLock=target.readDrawing("visual-trend").locked;
   target.setCandles(rows);target.updateTrendLine("visual-trend",{locked:false});
   let reverseError="";try{target.updateTrendLine("visual-trend",{startTime:restored.trend.endTime,startPrice:restored.trend.endPrice,endTime:restored.trend.startTime,endPrice:restored.trend.startPrice})}catch(error){reverseError=error.message}
   const reversedTrend=target.readDrawing("visual-trend");let invalidTrend="";try{target.updateTrendLine("visual-trend",{endTime:1800000000})}catch(error){invalidTrend=error.message}
   const afterInvalidTrend=target.readDrawing("visual-trend");target.updateTrendLine("visual-trend",{endPrice:reversedTrend.endPrice+1});
   const editedTrend=target.readDrawing("visual-trend");target.removeTrendLine("visual-trend");const removedTrend=target.readDrawing("visual-trend");target.undo();
   const restoredTrendByUndo=target.readDrawing("visual-trend");
   const trendApi={unavailableAnchorLock,reverseError,reversedTrend,invalidTrend,afterInvalidTrend,editedTrend,removedTrend,restoredTrendByUndo};
   target.updateRectangle("visual-zone",{fill:false});const editedRectangle=target.readDrawing("visual-zone");
   target.removeRectangle("visual-zone");const removedRectangle=target.readDrawing("visual-zone");target.undo();
   const restoredRectangleByUndo=target.readDrawing("visual-zone");let invalidRectangle="";try{target.updateRectangle("visual-zone",{fill:"yes"})}catch(error){invalidRectangle=error.message}
   const afterInvalidRectangle=target.readDrawing("visual-zone");
   const rectangleApi={editedRectangle,removedRectangle,restoredRectangleByUndo,invalidRectangle,afterInvalidRectangle};
   target.updateRay("visual-ray",{endPrice:restored.ray.endPrice+2});const editedRay=target.readDrawing("visual-ray");
   target.removeRay("visual-ray");const removedRay=target.readDrawing("visual-ray");target.undo();const restoredRayByUndo=target.readDrawing("visual-ray");
   const rayApi={editedRay,removedRay,restoredRayByUndo};
   const annotationApi={edited,removed,restoredByUndo,invalidText};
   target.destroy();
   const malformedTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"malformedtest",scope);malformedTarget.setCandles(rows);
   let malformed="";try{malformedTarget.importDrawings('{"schemaVersion":1,"symbol":"XAUUSD","timeframe":"M15","drawings":[{"kind":"PRICE","options":{"id":"ok","price":4001,"color":"#ffffff","visible":true,"locked":false}},{"kind":"PRICE","options":{"id":"bad","price":null,"color":"#ffffff","visible":true,"locked":false}}]}')}catch(error){malformed=error.message}
   const afterMalformed=malformedTarget.inspect().nativePrimitives;
   const sourceEnvelope=JSON.parse(source),invalidTrendEnvelope={...sourceEnvelope,drawings:[{kind:"TREND",options:{...sourceEnvelope.drawings.find(item=>item.kind==="TREND").options,extra:true}}]};
   let malformedTrend="";try{malformedTarget.importDrawings(JSON.stringify(invalidTrendEnvelope))}catch(error){malformedTrend=error.message}
   const afterMalformedTrend=malformedTarget.inspect().nativePrimitives;
   const invalidRectangleEnvelope={...sourceEnvelope,drawings:[{kind:"RECT",options:{...sourceEnvelope.drawings.find(item=>item.kind==="RECT").options,extra:true}}]};
   let malformedRectangle="";try{malformedTarget.importDrawings(JSON.stringify(invalidRectangleEnvelope))}catch(error){malformedRectangle=error.message}
   const afterMalformedRectangle=malformedTarget.inspect().nativePrimitives;malformedTarget.destroy();
   const capTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"captest",scope);capTarget.setCandles(rows);
   for(let i=0;i<99;i++)capTarget.addTrendLine({id:`trend${i}`,startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[40].time,endPrice:rows[40].close,color:"#ffffff"});
   capTarget.addRectangle({id:"last-drawing",startTime:rows[30].time,startPrice:rows[30].close+1,endTime:rows[40].time,endPrice:rows[40].close-1,color:"#ffffff",fill:false});
   let capError="";try{capTarget.addTrendLine({id:"trend-over-cap",startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[40].time,endPrice:rows[40].close,color:"#ffffff"})}catch(error){capError=error.message}
   const capCount=capTarget.inspect().nativePrimitives;capTarget.destroy();
   const conflictTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"conflicttest",scope);conflictTarget.setCandles(rows);conflictTarget.addPriceLevel({id:"existing",price:4000,color:"#ffffff"});
   let conflictError="";try{conflictTarget.importDrawings(source)}catch(error){conflictError=error.message}const conflictCount=conflictTarget.inspect().nativePrimitives;conflictTarget.destroy();
   const storageConflictTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"storageconflict",scope);storageConflictTarget.setCandles(rows);
   const conflictKey="2eas.chartstudio.v5.drawings:storageconflict:XAUUSD:M15",external=JSON.stringify({external:true});localStorage.setItem(conflictKey,external);
   let storageConflictError="";try{storageConflictTarget.importDrawings(source)}catch(error){storageConflictError=error.message}
   const storageConflict={error:storageConflictError,status:storageConflictTarget.inspect().persistenceStatus,count:storageConflictTarget.inspect().nativePrimitives,stored:localStorage.getItem(conflictKey)};storageConflictTarget.destroy();
   const wrongScope=ChartStudioV5.createStudioV5(document.getElementById("chart"),"goldm15",{symbol:"EURUSD",timeframe:"M15"});wrongScope.setCandles(rows);
   let scopeError="";try{wrongScope.importDrawings(source)}catch(error){scopeError=error.message}const wrongScopeCount=wrongScope.inspect().nativePrimitives;wrongScope.destroy();
   return {source,imported,restored,annotationApi,trendApi,rectangleApi,rayApi,malformed,afterMalformed,malformedTrend,afterMalformedTrend,malformedRectangle,afterMalformedRectangle,capError,capCount,conflictError,conflictCount,storageConflict,scopeError,wrongScopeCount};
  });
  const transferEnvelope=JSON.parse(drawingTransfer.source);
  assert.equal(transferEnvelope.schemaVersion,1);
  assert.equal(transferEnvelope.account,undefined);
  assert.deepEqual(drawingTransfer.imported,{imported:6});
  assert.equal(drawingTransfer.restored.count,6);
  assert.deepEqual(drawingTransfer.restored.price,persistedBeforeReload.price);
  assert.deepEqual(drawingTransfer.restored.time,persistedBeforeReload.time);
  assert.deepEqual(drawingTransfer.restored.text,persistedBeforeReload.text);
  assert.deepEqual(drawingTransfer.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(drawingTransfer.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(drawingTransfer.restored.ray,persistedBeforeReload.ray);
  assert.equal(drawingTransfer.annotationApi.edited.text,"Edited note");
  assert.equal(drawingTransfer.annotationApi.removed,null);
  assert.deepEqual(drawingTransfer.annotationApi.restoredByUndo,drawingTransfer.annotationApi.edited);
  assert.ok(drawingTransfer.annotationApi.invalidText);
  assert.equal(drawingTransfer.trendApi.reverseError,"");
  assert.equal(drawingTransfer.trendApi.unavailableAnchorLock,true);
  assert.equal(drawingTransfer.trendApi.reversedTrend.startTime,persistedBeforeReload.trend.endTime);
  assert.ok(drawingTransfer.trendApi.invalidTrend);
  assert.deepEqual(drawingTransfer.trendApi.afterInvalidTrend,drawingTransfer.trendApi.reversedTrend);
  assert.equal(drawingTransfer.trendApi.editedTrend.endPrice,drawingTransfer.trendApi.reversedTrend.endPrice+1);
  assert.equal(drawingTransfer.trendApi.removedTrend,null);
  assert.deepEqual(drawingTransfer.trendApi.restoredTrendByUndo,drawingTransfer.trendApi.editedTrend);
  assert.equal(drawingTransfer.rectangleApi.editedRectangle.fill,false);
  assert.equal(drawingTransfer.rectangleApi.removedRectangle,null);
  assert.deepEqual(drawingTransfer.rectangleApi.restoredRectangleByUndo,drawingTransfer.rectangleApi.editedRectangle);
  assert.ok(drawingTransfer.rectangleApi.invalidRectangle);
  assert.deepEqual(drawingTransfer.rectangleApi.afterInvalidRectangle,drawingTransfer.rectangleApi.editedRectangle);
  assert.equal(drawingTransfer.rayApi.editedRay.endPrice,persistedBeforeReload.ray.endPrice+2);
  assert.equal(drawingTransfer.rayApi.removedRay,null);
  assert.deepEqual(drawingTransfer.rayApi.restoredRayByUndo,drawingTransfer.rayApi.editedRay);
  assert.ok(drawingTransfer.malformed);
  assert.equal(drawingTransfer.afterMalformed,0);
  assert.ok(drawingTransfer.malformedTrend);
  assert.equal(drawingTransfer.afterMalformedTrend,0);
  assert.ok(drawingTransfer.malformedRectangle);
  assert.equal(drawingTransfer.afterMalformedRectangle,0);
  assert.ok(drawingTransfer.capError);
  assert.equal(drawingTransfer.capCount,100);
  assert.ok(drawingTransfer.conflictError);
  assert.equal(drawingTransfer.conflictCount,1);
  assert.ok(drawingTransfer.storageConflict.error);
  assert.equal(drawingTransfer.storageConflict.status,"CONFLICT");
  assert.equal(drawingTransfer.storageConflict.count,0);
  assert.equal(drawingTransfer.storageConflict.stored,JSON.stringify({external:true}));
  assert.ok(drawingTransfer.scopeError);
  assert.equal(drawingTransfer.wrongScopeCount,0);
  await page.waitForTimeout(150);
  assert.ok((await page.locator("#chart canvas").count())>=1);
  const folder=path.join("output","visual-smoke");
  fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,"chart-studio-v5-poc.png"),fullPage:true});
  console.log("PASS native v5 chart, configurable oscillator panes, move/resize, averages, volume, account isolation, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
