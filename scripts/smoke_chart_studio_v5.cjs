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
  const panZoom=await page.evaluate(async()=>{
   const host=document.createElement("div");host.style.cssText="width:1000px;height:420px";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"panzoom"),bars=Array.from({length:1200},(_,i)=>{
    const close=1000+Math.sin(i/11)*12+i*.02;return {time:1702000000+i*900,open:close-1,high:close+5,low:close-4,close,tick_volume:500+i};
   });
   engine.setCandles(bars);
   const start=bars[430],end=bars[500];
   engine.addTrendLine({id:"long-history-trend",startTime:start.time,startPrice:start.close,endTime:end.time,endPrice:end.close,color:"#9be564"});
   engine.addTimeMarker({id:"trend-start-time",time:start.time,color:"#ffffff"});
   engine.addTimeMarker({id:"trend-end-time",time:end.time,color:"#ffffff"});
   engine.addPriceLevel({id:"trend-start-price",price:start.close,color:"#ffffff"});
   engine.addPriceLevel({id:"trend-end-price",price:end.close,color:"#ffffff"});
   const original=engine.readDrawing("long-history-trend"),measurements=[];
   for(const range of [{from:300,to:700},{from:400,to:530},{from:420,to:520}]){
    engine.setVisibleLogicalRange(range);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const trend=engine.drawingPosition("long-history-trend"),startX=engine.drawingPosition("trend-start-time").x,
     endX=engine.drawingPosition("trend-end-time").x,startY=engine.drawingPosition("trend-start-price").y,
     endY=engine.drawingPosition("trend-end-price").y;
    measurements.push({range:engine.visibleLogicalRange(),anchor:engine.readDrawing("long-history-trend"),
     midpointError:Math.max(Math.abs(trend.x-(startX+endX)/2),Math.abs(trend.y-(startY+endY)/2))});
   }
   let collapsedRejected=false,badRangeRejected=false;
   try{engine.setVisibleLogicalRange({from:500,to:500})}catch(_){collapsedRejected=true}
   try{engine.setVisibleLogicalRange({from:Infinity,to:600})}catch(_){badRangeRejected=true}
   const afterInvalid=engine.visibleLogicalRange();engine.destroy();host.remove();
   return {original,measurements,collapsedRejected,badRangeRejected,afterInvalid};
  });
  assert.equal(result.first.version,"5.2.1");
  assert.deepEqual(panZoom.measurements.map(item=>[item.range.from,item.range.to]),[[300,700],[400,530],[420,520]],"The chart traverses the requested 1,200-bar pan/zoom windows");
  assert.equal(panZoom.measurements.length,3);
  for(const measurement of panZoom.measurements){
   assert.deepEqual(measurement.anchor,panZoom.original,"Trend anchors remain exact during pan and zoom");
   assert.ok(measurement.midpointError<=1,"Trend geometry stays aligned with exact time/price anchors across 1,200 bars");
  }
  assert.equal(panZoom.collapsedRejected,true);
  assert.equal(panZoom.badRangeRejected,true);
  assert.deepEqual(panZoom.afterInvalid,panZoom.measurements.at(-1).range,"Invalid viewport ranges leave the last valid view unchanged");
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
  await page.keyboard.press("ArrowUp");
  const afterLockedNudge=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
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
  const keyboardStart=shownPrice.price;
  await page.keyboard.press("ArrowUp");
  const keyboardMoved=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const keyboardUndo=await page.evaluate(()=>window.__v5Screenshot.undo());
  const keyboardRestored=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  const keyboardRedo=await page.evaluate(()=>window.__v5Screenshot.redo());
  const keyboardRepeated=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.keyboard.press("Shift+ArrowUp");
  const keyboardShifted=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.evaluate(()=>window.__v5Screenshot.undo());
  const keyboardShiftRestored=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
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
  await page.keyboard.press("ArrowRight");
  const keyboardTime=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-time"));
  const keyboardTimeUndo=await page.evaluate(()=>window.__v5Screenshot.undo());
  const restoredKeyboardTime=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-time"));
  const keyboardTimeRedo=await page.evaluate(()=>window.__v5Screenshot.redo());
  const repeatedKeyboardTime=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-time"));
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
  assert.equal(afterLockedNudge.price,lockedPrice.price,"locked drawings reject keyboard nudges");
  assert.ok(keyboardMoved.price>keyboardStart,"ArrowUp nudges the selected price drawing upward");
  assert.equal(keyboardUndo,true);
  assert.equal(keyboardRestored.price,keyboardStart);
  assert.equal(keyboardRedo,true);
  assert.equal(keyboardRepeated.price,keyboardMoved.price);
  assert.ok(keyboardShifted.price>keyboardMoved.price,"Shift+ArrowUp applies the larger ten-pixel nudge");
  assert.equal(keyboardShiftRestored.price,keyboardMoved.price);
  assert.equal(timeUndo,true);
  assert.equal(undoneTime.time,1700100000+45*900);
  assert.equal(timeRedo,true);
  assert.equal(redoneTime.time,movedTime.drawing.time);
  assert.notEqual(movedTime.drawing.time,1700100000+45*900);
  assert.equal((movedTime.drawing.time-1700100000)%900,0);
  assert.notEqual(movedTime.position.x,timePoint.x);
  assert.equal(selectedPrice,"visual-level");
  assert.equal(selectedTime,"visual-time");
  assert.equal(keyboardTime.time,redoneTime.time+900);
  assert.equal(keyboardTimeUndo,true);
  assert.equal(restoredKeyboardTime.time,redoneTime.time);
  assert.equal(keyboardTimeRedo,true);
  assert.equal(repeatedKeyboardTime.time,keyboardTime.time);
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
  const trendHandleStart=await page.evaluate(()=>{
   const e=window.__v5Screenshot,original=e.readDrawing("visual-trend");
   e.addTimeMarker({id:"trend-handle-start-time",time:original.startTime,color:"#ffffff"});
   e.addPriceLevel({id:"trend-handle-start-price",price:original.startPrice,color:"#ffffff"});
   return {original,x:e.drawingPosition("trend-handle-start-time").x,y:e.drawingPosition("trend-handle-start-price").y};
  });
  await page.mouse.move(trendHandleStart.x,trendHandleStart.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-trend");
  await page.mouse.down();await page.mouse.move(trendHandleStart.x+30,trendHandleStart.y-20,{steps:3});await page.mouse.up();
  let draggedTrend=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend"));
  assert.notDeepEqual([draggedTrend.startTime,draggedTrend.startPrice],[trendHandleStart.original.startTime,trendHandleStart.original.startPrice]);
  assert.deepEqual([draggedTrend.endTime,draggedTrend.endPrice],[trendHandleStart.original.endTime,trendHandleStart.original.endPrice],"Dragging one trend handle preserves the other anchor");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend")),trendHandleStart.original,"A trend handle gesture is one undo step");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend")),draggedTrend,"A trend handle gesture is one redo step");
  const trendHandleEnd=await page.evaluate(()=>{
   const e=window.__v5Screenshot,original=e.readDrawing("visual-trend");
   e.updateTimeMarker("trend-handle-start-time",{time:original.endTime});e.updatePriceLevel("trend-handle-start-price",{price:original.endPrice});
   return {original,x:e.drawingPosition("trend-handle-start-time").x,y:e.drawingPosition("trend-handle-start-price").y};
  });
  await page.mouse.move(trendHandleEnd.x,trendHandleEnd.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-trend");
  await page.mouse.down();await page.mouse.move(trendHandleEnd.x-30,trendHandleEnd.y+20,{steps:3});await page.mouse.up();
  const draggedTrendEnd=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend"));
  assert.notDeepEqual([draggedTrendEnd.endTime,draggedTrendEnd.endPrice],[trendHandleEnd.original.endTime,trendHandleEnd.original.endPrice]);
  assert.deepEqual([draggedTrendEnd.startTime,draggedTrendEnd.startPrice],[trendHandleEnd.original.startTime,trendHandleEnd.original.startPrice],"Dragging the end trend handle preserves the start anchor");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend")),draggedTrend);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  draggedTrend=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend"));
  const escapeTrendPoint=await page.evaluate(()=>{
   const e=window.__v5Screenshot,trend=e.readDrawing("visual-trend");
   e.updateTimeMarker("trend-handle-start-time",{time:trend.startTime});e.updatePriceLevel("trend-handle-start-price",{price:trend.startPrice});
   return {x:e.drawingPosition("trend-handle-start-time").x,y:e.drawingPosition("trend-handle-start-price").y};
  });
  await page.mouse.move(escapeTrendPoint.x,escapeTrendPoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(escapeTrendPoint.x+25,escapeTrendPoint.y+18,{steps:3});
  assert.notDeepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend")),draggedTrend,"Trend handle moves before Escape rollback");
  await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend")),draggedTrend,"Escape restores both trend anchors");
  await page.evaluate(()=>window.__v5Screenshot.updateTrendLine("visual-trend",{locked:true}));
  await page.mouse.move(escapeTrendPoint.x,escapeTrendPoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(escapeTrendPoint.x+25,escapeTrendPoint.y-18,{steps:3});await page.mouse.up();
  const lockedTrend=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-trend"));
  assert.deepEqual([lockedTrend.startTime,lockedTrend.startPrice,lockedTrend.endTime,lockedTrend.endPrice],[draggedTrend.startTime,draggedTrend.startPrice,draggedTrend.endTime,draggedTrend.endPrice],"Locked trend handles reject pointer drag");
  await page.evaluate(()=>{
   const e=window.__v5Screenshot;e.updateTrendLine("visual-trend",{locked:false});
   e.removeTimeMarker("trend-handle-start-time");e.removePriceLevel("trend-handle-start-price");
  });
  const rectangleHandleStart=await page.evaluate(()=>{
   const e=window.__v5Screenshot,original=e.readDrawing("visual-zone");
   const point=e.drawingAnchorPosition("visual-zone","START");return {original,...point};
  });
  await page.mouse.move(rectangleHandleStart.x,rectangleHandleStart.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-zone");
  await page.mouse.down();await page.mouse.move(rectangleHandleStart.x+30,rectangleHandleStart.y-20,{steps:3});await page.mouse.up();
  const draggedRectangle=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone"));
  assert.notDeepEqual([draggedRectangle.startTime,draggedRectangle.startPrice],[rectangleHandleStart.original.startTime,rectangleHandleStart.original.startPrice]);
  assert.deepEqual([draggedRectangle.endTime,draggedRectangle.endPrice],[rectangleHandleStart.original.endTime,rectangleHandleStart.original.endPrice],"Dragging one rectangle corner preserves the opposite corner");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone")),rectangleHandleStart.original,"A rectangle grip gesture is one undo step");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  const rectangleHandleEnd=await page.evaluate(()=>{
   const e=window.__v5Screenshot,original=e.readDrawing("visual-zone");
   const point=e.drawingAnchorPosition("visual-zone","END");return {original,...point};
  });
  await page.mouse.move(rectangleHandleEnd.x,rectangleHandleEnd.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-zone");
  await page.mouse.down();await page.mouse.move(rectangleHandleEnd.x-30,rectangleHandleEnd.y+20,{steps:3});await page.mouse.up();
  const draggedRectangleEnd=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone"));
  assert.notDeepEqual([draggedRectangleEnd.endTime,draggedRectangleEnd.endPrice],[rectangleHandleEnd.original.endTime,rectangleHandleEnd.original.endPrice]);
  assert.deepEqual([draggedRectangleEnd.startTime,draggedRectangleEnd.startPrice],[rectangleHandleEnd.original.startTime,rectangleHandleEnd.original.startPrice],"Dragging the other rectangle corner preserves the start corner");
  const rectangleEscapePoint=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("visual-zone","START"));
  await page.mouse.move(rectangleEscapePoint.x,rectangleEscapePoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(rectangleEscapePoint.x+25,rectangleEscapePoint.y+18,{steps:3});
  assert.notDeepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone")),draggedRectangleEnd,"Rectangle handle moves before Escape rollback");
  await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone")),draggedRectangleEnd,"Escape restores both rectangle corners");
  await page.evaluate(()=>window.__v5Screenshot.updateRectangle("visual-zone",{locked:true}));
  await page.mouse.move(rectangleEscapePoint.x,rectangleEscapePoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(rectangleEscapePoint.x+25,rectangleEscapePoint.y-18,{steps:3});await page.mouse.up();
  const lockedRectangle=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone"));
  assert.deepEqual([lockedRectangle.startTime,lockedRectangle.startPrice,lockedRectangle.endTime,lockedRectangle.endPrice],[draggedRectangleEnd.startTime,draggedRectangleEnd.startPrice,draggedRectangleEnd.endTime,draggedRectangleEnd.endPrice],"Locked rectangle handles reject pointer drag");
  await page.evaluate(()=>window.__v5Screenshot.updateRectangle("visual-zone",{locked:false}));
  const trendPoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-trend"));
  assert.ok(Number.isFinite(trendPoint.x)&&Number.isFinite(trendPoint.y));
  const rectanglePoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-zone"));
  assert.ok(Number.isFinite(rectanglePoint.x)&&Number.isFinite(rectanglePoint.y));
  await page.mouse.move(rectanglePoint.x,rectanglePoint.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-zone");
  await page.mouse.click(rectanglePoint.x,rectanglePoint.y);
  const beforeKeyboardRectangle=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone"));
  await page.keyboard.press("ArrowRight");
  const keyboardRectangle=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone"));
  assert.equal(keyboardRectangle.startTime,beforeKeyboardRectangle.startTime+900);
  assert.equal(keyboardRectangle.endTime,beforeKeyboardRectangle.endTime+900);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-zone")),beforeKeyboardRectangle);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  await page.evaluate(()=>window.__v5Screenshot.addTimeMarker({id:"keyboard-boundary",time:1700100000,color:"#ffd166"}));
  const boundaryPosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("keyboard-boundary"));
  await page.mouse.move(boundaryPosition.x,boundaryPosition.y);await page.waitForTimeout(80);
  await page.mouse.click(boundaryPosition.x,boundaryPosition.y);
  const boundaryBefore=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-boundary"));
  await page.keyboard.press("Shift+ArrowLeft");
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-boundary")),boundaryBefore);
  await page.evaluate(()=>window.__v5Screenshot.removeTimeMarker("keyboard-boundary"));
  await page.evaluate(()=>window.__v5Screenshot.addFibonacci({id:"visual-fibo",startTime:1700100000+20*900,startPrice:4000+20*.4+Math.sin(2)*16,endTime:1700100000+35*900,endPrice:4000+35*.4+Math.sin(3.5)*16,color:"#a78bfa"}));
  let duplicateFiboRay="";try{await page.evaluate(()=>window.__v5Screenshot.addRay({id:"visual-fibo",startTime:1700100000+20*900,startPrice:4001,endTime:1700100000+35*900,endPrice:4002,color:"#fb7185"}))}catch(error){duplicateFiboRay=error.message}
  assert.ok(duplicateFiboRay);
  const fibo=await page.evaluate(()=>({options:window.__v5Screenshot.readDrawing("visual-fibo"),levels:window.__v5Screenshot.fibonacciLevels("visual-fibo")}));
  assert.deepEqual(fibo.levels.map(level=>level.ratio),[0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2.618]);
  assert.equal(fibo.levels[0].price,fibo.options.startPrice);
  const fiboHandleOriginal=await page.evaluate(()=>{
   const e=window.__v5Screenshot;e.addFibonacci({id:"fibo-handle-contract",startTime:1700100000+70*900,startPrice:4000+70*.4+Math.sin(7)*16,endTime:1700100000+84*900,endPrice:4000+84*.4+Math.sin(8.4)*16,color:"#ffffff",levels:[0,50,100,150]});
   return e.readDrawing("fibo-handle-contract");
  });
  const fiboHandleStart=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("fibo-handle-contract","START"));
  await page.mouse.move(fiboHandleStart.x,fiboHandleStart.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"fibo-handle-contract");
  await page.mouse.down();await page.mouse.move(fiboHandleStart.x+30,fiboHandleStart.y-20,{steps:3});await page.mouse.up();
  const draggedFibo=await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract"));
  assert.notDeepEqual([draggedFibo.startTime,draggedFibo.startPrice],[fiboHandleOriginal.startTime,fiboHandleOriginal.startPrice]);
  assert.deepEqual([draggedFibo.endTime,draggedFibo.endPrice],[fiboHandleOriginal.endTime,fiboHandleOriginal.endPrice],"Dragging one Fibonacci anchor preserves the opposite anchor");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract")),fiboHandleOriginal,"A Fibonacci grip gesture is one undo step");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract")),draggedFibo);
  const fiboHandleEnd=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("fibo-handle-contract","END"));
  await page.mouse.move(fiboHandleEnd.x,fiboHandleEnd.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"fibo-handle-contract");
  await page.mouse.down();await page.mouse.move(fiboHandleEnd.x-30,fiboHandleEnd.y+20,{steps:3});await page.mouse.up();
  const draggedFiboEnd=await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract"));
  assert.notDeepEqual([draggedFiboEnd.endTime,draggedFiboEnd.endPrice],[draggedFibo.endTime,draggedFibo.endPrice]);
  assert.deepEqual([draggedFiboEnd.startTime,draggedFiboEnd.startPrice],[draggedFibo.startTime,draggedFibo.startPrice]);
  const fiboEscapePoint=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("fibo-handle-contract","START"));
  await page.mouse.move(fiboEscapePoint.x,fiboEscapePoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(fiboEscapePoint.x+25,fiboEscapePoint.y+18,{steps:3});
  assert.notDeepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract")),draggedFiboEnd);
  await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract")),draggedFiboEnd,"Escape restores Fibonacci anchors and custom levels");
  await page.evaluate(()=>window.__v5Screenshot.updateFibonacci("fibo-handle-contract",{locked:true}));
  await page.mouse.move(fiboEscapePoint.x,fiboEscapePoint.y);await page.waitForTimeout(80);await page.mouse.down();
  await page.mouse.move(fiboEscapePoint.x+25,fiboEscapePoint.y-18,{steps:3});await page.mouse.up();
  const lockedFibo=await page.evaluate(()=>window.__v5Screenshot.readDrawing("fibo-handle-contract"));
  assert.deepEqual([lockedFibo.startTime,lockedFibo.startPrice,lockedFibo.endTime,lockedFibo.endPrice,lockedFibo.levels],[draggedFiboEnd.startTime,draggedFiboEnd.startPrice,draggedFiboEnd.endTime,draggedFiboEnd.endPrice,draggedFiboEnd.levels]);
  await page.evaluate(()=>window.__v5Screenshot.removeFibonacci("fibo-handle-contract"));
  assert.equal(fibo.levels[6].price,fibo.options.endPrice);
  assert.ok(fibo.levels.every(level=>Math.abs(level.price-(fibo.options.startPrice+(fibo.options.endPrice-fibo.options.startPrice)*level.ratio))<1e-9));
  const customLevels=[-100,0,23.6,50,61.8,100,161.8,261.8];
  await page.evaluate(levels=>window.__v5Screenshot.addFibonacci({id:"visual-fibo-custom",startTime:1700100000+20*900,startPrice:4100,endTime:1700100000+35*900,endPrice:4000,color:"#a78bfa",levels}),customLevels);
  const customFibo=await page.evaluate(()=>({options:window.__v5Screenshot.readDrawing("visual-fibo-custom"),levels:window.__v5Screenshot.fibonacciLevels("visual-fibo-custom")}));
  assert.deepEqual(customFibo.options.levels,customLevels);
  assert.deepEqual(customFibo.levels.map(level=>level.level),customLevels);
  assert.deepEqual(customFibo.levels.map(level=>level.ratio),customLevels.map(level=>level/100));
  assert.equal(customFibo.levels[0].price,4200,"Negative levels project beyond the first anchor");
  assert.equal(customFibo.levels.at(-1).price,4100-100*2.618,"Extension levels project beyond the second anchor");
  const escapedFiboOptions=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"));
  escapedFiboOptions.levels[0]=999;
  assert.deepEqual((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"))).levels,customLevels,"Reading a drawing cannot mutate its stored Fibonacci levels");
  const invalidFiboLevels=await page.evaluate(()=>{
   const base={id:"invalid-fibo",startTime:1700100000+20*900,startPrice:4100,endTime:1700100000+35*900,endPrice:4000,color:"#a78bfa"};
   const invalid=[[],[20,10],[0,0],[0,1000.01],Array.from({length:17},(_,i)=>i)];
   return invalid.map((levels,index)=>{try{window.__v5Screenshot.addFibonacci({...base,id:"invalid-fibo-"+index,levels});return ""}catch(error){return error.message}});
  });
  assert.ok(invalidFiboLevels.every(Boolean),"Invalid custom Fibonacci values fail closed");
  const editedCustomLevels=[-50,0,100,261.8];
  await page.evaluate(levels=>window.__v5Screenshot.updateFibonacci("visual-fibo-custom",{levels}),editedCustomLevels);
  assert.deepEqual((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"))).levels,editedCustomLevels);
  const rejectedFiboUpdate=await page.evaluate(()=>{try{window.__v5Screenshot.updateFibonacci("visual-fibo-custom",{levels:[10,5]});return ""}catch(error){return error.message}});
  assert.ok(rejectedFiboUpdate);
  assert.deepEqual((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"))).levels,editedCustomLevels,"Invalid updates leave the previous drawing intact");
  await page.evaluate(()=>window.__v5Screenshot.undo());
  assert.deepEqual((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"))).levels,customLevels);
  await page.evaluate(()=>window.__v5Screenshot.redo());
  assert.deepEqual((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo-custom"))).levels,editedCustomLevels);
  await page.evaluate(()=>{const options=window.__v5Screenshot.readDrawing("visual-fibo");window.__v5Screenshot.addFibonacci({...options,endPrice:options.endPrice+1})});
  assert.equal((await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-fibo"))).endPrice,fibo.options.endPrice+1);
  await page.evaluate(()=>window.__v5Screenshot.addFibonacci({id:"visual-fibo-rising",startTime:1700100000+35*900,startPrice:4000+35*.4+Math.sin(3.5)*16,endTime:1700100000+20*900,endPrice:4000+20*.4+Math.sin(2)*16,color:"#a78bfa"}));
  const risingFibo=await page.evaluate(()=>window.__v5Screenshot.fibonacciLevels("visual-fibo-rising"));
  assert.equal(risingFibo[0].price,4000+35*.4+Math.sin(3.5)*16);
  assert.equal(risingFibo[6].price,4000+20*.4+Math.sin(2)*16);
  await page.evaluate(()=>window.__v5Screenshot.removeFibonacci("visual-fibo-rising"));
  const duplicateSourcePoint=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-time"));
  await page.mouse.move(duplicateSourcePoint.x,duplicateSourcePoint.y);await page.waitForTimeout(80);
  await page.mouse.click(duplicateSourcePoint.x,duplicateSourcePoint.y);
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
  await page.evaluate(()=>{
   window.__v5Screenshot.addPriceLevel({id:"visual-level-second",price:4012.5,color:"#f0abfc"});
   window.__v5Screenshot.addTimeMarker({id:"visual-time-second",time:1700100000+12*900,color:"#f0abfc"});
  });
  await page.mouse.move(10,10);
  await page.waitForTimeout(150);
  const persistedBeforeReload=await page.evaluate(()=>({price:window.__v5Screenshot.readDrawing("visual-level"),priceSecond:window.__v5Screenshot.readDrawing("visual-level-second"),time:window.__v5Screenshot.readDrawing("visual-time"),timeSecond:window.__v5Screenshot.readDrawing("visual-time-second"),text:window.__v5Screenshot.readDrawing("visual-note"),trend:window.__v5Screenshot.readDrawing("visual-trend"),rectangle:window.__v5Screenshot.readDrawing("visual-zone"),ray:window.__v5Screenshot.readDrawing("visual-ray"),fibo:window.__v5Screenshot.readDrawing("visual-fibo"),customFibo:window.__v5Screenshot.readDrawing("visual-fibo-custom")}));
  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartV5Ready===true);
  const persistenceProbe=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3}});
   const scope={symbol:"XAUUSD",timeframe:"M15"};
   let e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",scope);e.setCandles(rows);
   const restored={status:e.inspect().persistenceStatus,count:e.inspect().nativePrimitives,price:e.readDrawing("visual-level"),priceSecond:e.readDrawing("visual-level-second"),time:e.readDrawing("visual-time"),timeSecond:e.readDrawing("visual-time-second"),text:e.readDrawing("visual-note"),trend:e.readDrawing("visual-trend"),rectangle:e.readDrawing("visual-zone"),ray:e.readDrawing("visual-ray"),fibo:e.readDrawing("visual-fibo"),customFibo:e.readDrawing("visual-fibo-custom")};
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
  assert.equal(persistenceProbe.restored.count,10);
  assert.deepEqual(persistenceProbe.restored.price,persistedBeforeReload.price);
  assert.deepEqual(persistenceProbe.restored.priceSecond,persistedBeforeReload.priceSecond);
  assert.deepEqual(persistenceProbe.restored.time,persistedBeforeReload.time);
  assert.deepEqual(persistenceProbe.restored.timeSecond,persistedBeforeReload.timeSecond);
  assert.deepEqual(persistenceProbe.restored.text,persistedBeforeReload.text);
  assert.deepEqual(persistenceProbe.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(persistenceProbe.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(persistenceProbe.restored.ray,persistedBeforeReload.ray);
  assert.deepEqual(persistenceProbe.restored.fibo,persistedBeforeReload.fibo);
  assert.deepEqual(persistenceProbe.restored.customFibo,persistedBeforeReload.customFibo);
  assert.equal(persistenceProbe.otherAccount,0);
  assert.equal(persistenceProbe.returned,10);
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
   const imported=target.importDrawings(source),restored={count:target.inspect().nativePrimitives,price:target.readDrawing("visual-level"),priceSecond:target.readDrawing("visual-level-second"),time:target.readDrawing("visual-time"),timeSecond:target.readDrawing("visual-time-second"),text:target.readDrawing("visual-note"),trend:target.readDrawing("visual-trend"),rectangle:target.readDrawing("visual-zone"),ray:target.readDrawing("visual-ray"),fibo:target.readDrawing("visual-fibo"),customFibo:target.readDrawing("visual-fibo-custom")};
   let fiboPaneCollision="";try{target.addPaneLine({id:"visual-fibo",color:"#ffffff"},rows.map(c=>({time:c.time,value:c.close})))}catch(error){fiboPaneCollision=error.message}
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
   target.updateFibonacci("visual-fibo",{endPrice:restored.fibo.endPrice+2});const editedFibo=target.readDrawing("visual-fibo");
   target.removeFibonacci("visual-fibo");const removedFibo=target.readDrawing("visual-fibo");target.undo();const restoredFiboByUndo=target.readDrawing("visual-fibo");
   const fiboApi={editedFibo,removedFibo,restoredFiboByUndo};
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
   const afterMalformedRectangle=malformedTarget.inspect().nativePrimitives;
   const invalidFiboEnvelope={...sourceEnvelope,drawings:[{kind:"FIBO",options:{...sourceEnvelope.drawings.find(item=>item.kind==="FIBO").options,extra:true}}]};
   let malformedFibo="";try{malformedTarget.importDrawings(JSON.stringify(invalidFiboEnvelope))}catch(error){malformedFibo=error.message}
   const afterMalformedFibo=malformedTarget.inspect().nativePrimitives;
   const invalidCustomFiboEnvelope={...sourceEnvelope,drawings:[{kind:"FIBO",options:{...sourceEnvelope.drawings.find(item=>item.kind==="FIBO"&&item.options.id==="visual-fibo-custom").options,levels:[20,10]}}]};
   let malformedCustomFibo="";try{malformedTarget.importDrawings(JSON.stringify(invalidCustomFiboEnvelope))}catch(error){malformedCustomFibo=error.message}
   const afterMalformedCustomFibo=malformedTarget.inspect().nativePrimitives;malformedTarget.destroy();
   const capTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"captest",scope);capTarget.setCandles(rows);
   for(let i=0;i<99;i++)capTarget.addTrendLine({id:`trend${i}`,startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[40].time,endPrice:rows[40].close,color:"#ffffff"});
   capTarget.addFibonacci({id:"last-drawing",startTime:rows[30].time,startPrice:rows[30].close+1,endTime:rows[40].time,endPrice:rows[40].close-1,color:"#ffffff"});
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
   return {source,imported,restored,annotationApi,trendApi,rectangleApi,rayApi,fiboApi,fiboPaneCollision,malformed,afterMalformed,malformedTrend,afterMalformedTrend,malformedRectangle,afterMalformedRectangle,malformedFibo,afterMalformedFibo,malformedCustomFibo,afterMalformedCustomFibo,capError,capCount,conflictError,conflictCount,storageConflict,scopeError,wrongScopeCount};
  });
  const transferEnvelope=JSON.parse(drawingTransfer.source);
  assert.equal(transferEnvelope.schemaVersion,1);
  assert.equal(transferEnvelope.account,undefined);
  assert.deepEqual(drawingTransfer.imported,{imported:10});
  assert.equal(drawingTransfer.restored.count,10);
  assert.deepEqual(drawingTransfer.restored.price,persistedBeforeReload.price);
  assert.deepEqual(drawingTransfer.restored.priceSecond,persistedBeforeReload.priceSecond);
  assert.deepEqual(drawingTransfer.restored.time,persistedBeforeReload.time);
  assert.deepEqual(drawingTransfer.restored.timeSecond,persistedBeforeReload.timeSecond);
  assert.deepEqual(drawingTransfer.restored.text,persistedBeforeReload.text);
  assert.deepEqual(drawingTransfer.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(drawingTransfer.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(drawingTransfer.restored.ray,persistedBeforeReload.ray);
  assert.deepEqual(drawingTransfer.restored.fibo,persistedBeforeReload.fibo);
  assert.deepEqual(drawingTransfer.restored.customFibo,persistedBeforeReload.customFibo);
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
  assert.equal(drawingTransfer.fiboApi.editedFibo.endPrice,persistedBeforeReload.fibo.endPrice+2);
  assert.equal(drawingTransfer.fiboApi.removedFibo,null);
  assert.deepEqual(drawingTransfer.fiboApi.restoredFiboByUndo,drawingTransfer.fiboApi.editedFibo);
  assert.ok(drawingTransfer.fiboPaneCollision);
  assert.ok(drawingTransfer.malformed);
  assert.equal(drawingTransfer.afterMalformed,0);
  assert.ok(drawingTransfer.malformedTrend);
  assert.equal(drawingTransfer.afterMalformedTrend,0);
  assert.ok(drawingTransfer.malformedRectangle);
  assert.equal(drawingTransfer.afterMalformedRectangle,0);
  assert.ok(drawingTransfer.malformedFibo);
  assert.equal(drawingTransfer.afterMalformedFibo,0);
  assert.ok(drawingTransfer.malformedCustomFibo);
  assert.equal(drawingTransfer.afterMalformedCustomFibo,0);
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
  await page.evaluate(()=>{
   const context=CanvasRenderingContext2D.prototype,draw=context.arc;
   window.__trendHandleArcs=0;
   context.arc=function(x,y,radius,...rest){if(radius===6&&this.strokeStyle==="#9be564"&&this.fillStyle==="#f8fafc")window.__trendHandleArcs++;return draw.call(this,x,y,radius,...rest)};
  });
  const selectedTrendAnchor=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("visual-trend","START"));
  await page.mouse.move(selectedTrendAnchor.x,selectedTrendAnchor.y);await page.waitForTimeout(80);await page.mouse.click(selectedTrendAnchor.x,selectedTrendAnchor.y);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingId),"visual-trend");
  assert.ok(await page.evaluate(()=>window.__trendHandleArcs>=2),"Selected trend line renders two visible endpoint handles");
  await page.screenshot({path:path.join(folder,"chart-studio-v5-selected-handles.png"),fullPage:true});
  const touchContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,hasTouch:true,isMobile:true});
  try{
   const touchPage=await touchContext.newPage();await touchPage.goto("http://127.0.0.1:8872/chart_studio_v5/fixture.html",{waitUntil:"networkidle"});
   await touchPage.evaluate(()=>{
    const e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"touch");
    const bars=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700200000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i}});
    e.setCandles(bars);e.addTrendLine({id:"touch-trend",startTime:bars[70].time,startPrice:bars[70].close,endTime:bars[82].time,endPrice:bars[82].close+4,color:"#9be564"});window.__touchChart=e;
   });
   await touchPage.waitForTimeout(120);
   const touchStart=await touchPage.evaluate(()=>({anchor:window.__touchChart.readDrawing("touch-trend"),point:window.__touchChart.drawingAnchorPosition("touch-trend","START")}));
   const touchCdp=await touchContext.newCDPSession(touchPage);
   await touchCdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:touchStart.point.x,y:touchStart.point.y,id:1}]});
   await touchCdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:touchStart.point.x+24,y:touchStart.point.y-18,id:1}]});
   await touchCdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await touchPage.waitForTimeout(100);
   const touchMoved=await touchPage.evaluate(()=>window.__touchChart.readDrawing("touch-trend"));
   assert.notDeepEqual([touchMoved.startTime,touchMoved.startPrice],[touchStart.anchor.startTime,touchStart.anchor.startPrice],"Touch drag moves a v5 anchor at 390 CSS px and 150% DPR");
   assert.deepEqual([touchMoved.endTime,touchMoved.endPrice],[touchStart.anchor.endTime,touchStart.anchor.endPrice]);
   await touchPage.screenshot({path:path.join(folder,"chart-studio-v5-touch-390-dpr150.png"),fullPage:true});
  }finally{await touchContext.close()}
  await page.screenshot({path:path.join(folder,"chart-studio-v5-poc.png"),fullPage:true});
  console.log("PASS native v5 chart, configurable oscillator panes, move/resize, averages, volume, account isolation, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});
