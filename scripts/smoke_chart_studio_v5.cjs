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
  await page.addScriptTag({path:path.resolve("static/chart-studio-market-structure.js")});
  const chartTypeContract=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:640px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const scope={symbol:"XAUUSD",timeframe:"M15"},engine=ChartStudioV5.createStudioV5(host,"chart-type-titan",scope),start=1712500000;
   const bars=[
    {time:start,open:10,high:12,low:8,close:11},
    {time:start+900,open:14,high:14,low:9,close:13},
    {time:start+1800,open:13,high:16,low:12,close:15},
   ],sourceBefore=JSON.stringify(bars);engine.setCandles(bars);
   let missingApi=false;try{engine.setPricePresentation("heikin")}catch(error){missingApi=/setPricePresentation/.test(error.message)}
   const available=typeof engine.readPricePresentation==="function"&&typeof engine.setPricePresentation==="function";
   if(!available){engine.destroy();host.remove();return {available,missingApi,sourceUnchanged:sourceBefore===JSON.stringify(bars)}}
   engine.setPricePresentation("heikin");const heikin=engine.readPricePresentation(),raw=engine.readDataWindow(start);
   engine.updateLast({...bars[2],open:14,high:18,low:13,close:17});const updated=engine.readPricePresentation();
   engine.setPricePresentation("hollow");const hollow=engine.readPricePresentation();
   engine.addTrendLine({id:"presentation-anchor",startTime:bars[0].time,startPrice:11,endTime:bars[2].time,endPrice:17,color:"#ffffff",visible:true,locked:false});
   const anchorBefore=engine.drawingAnchorPosition("presentation-anchor","START"),additionalModes=[];
   for(const type of ["bars","line","area"]){try{engine.setPricePresentation(type);const view=engine.readPricePresentation();additionalModes.push({requested:type,active:engine.inspect().chartType,barCount:view.bars.length,first:view.bars[0],renderedSeries:view.renderedSeries,anchor:engine.drawingAnchorPosition("presentation-anchor","START")})}catch(error){additionalModes.push({requested:type,active:engine.inspect().chartType,error:String(error.message||error)})}}engine.setPricePresentation("hollow");
   let invalidRejected=false;try{engine.setPricePresentation("renko")}catch(_){invalidRejected=true}
   const afterInvalid=engine.readPricePresentation();
   engine.changeAccount("chart-type-goldm15");const otherAccount=engine.inspect().chartType;
   engine.setPricePresentation("heikin");engine.changeAccount("chart-type-titan");const restored=engine.inspect().chartType;
   const timeframeHost=document.createElement("div");timeframeHost.style.cssText="width:320px;height:180px;position:fixed;left:-2000px;top:0";document.body.append(timeframeHost);
   const timeEngine=ChartStudioV5.createStudioV5(timeframeHost,"chart-type-titan",{symbol:"XAUUSD",timeframe:"M5"}),otherTimeframe=timeEngine.inspect().chartType;timeEngine.destroy();
   const result={available,heikin:heikin.bars,raw:raw.ohlc,updated:updated.bars,hollow:hollow.bars,hollowStyle:hollow.styles,anchorBefore,additionalModes,
    invalidRejected,afterInvalidType:afterInvalid.type,otherAccount,restored,otherTimeframe,sourceUnchanged:sourceBefore===JSON.stringify(bars)};
   engine.destroy();timeframeHost.remove();host.remove();return result;
  });
  assert.equal(chartTypeContract.available,true,"Native v5 exposes a scoped chart-presentation API");
  assert.deepEqual(chartTypeContract.heikin.map(({time,open,high,low,close})=>({time,open,high,low,close})),[
   {time:1712500000,open:10.5,high:12,low:8,close:10.25},
   {time:1712500900,open:10.375,high:14,low:9,close:12.5},
   {time:1712501800,open:11.4375,high:16,low:11.4375,close:14},
  ],"Heikin Ashi uses recursive open and averaged OHLC without changing bar times");
  assert.deepEqual(chartTypeContract.raw,{open:10,high:12,low:8,close:11},"Data window retains broker OHLC while Heikin is visible");
  assert.equal(chartTypeContract.updated[2].close,15.5,"Live update recalculates derived bars from raw source bars");
  assert.deepEqual(chartTypeContract.hollow.map(({open,high,low,close})=>({open,high,low,close})),[
   {open:10,high:12,low:8,close:11},{open:14,high:14,low:9,close:13},{open:14,high:18,low:13,close:17},
  ],"Hollow presentation keeps original OHLC and uses style metadata only");
  assert.equal(chartTypeContract.hollowStyle[0].bodyColor,"rgba(0,0,0,0)");
  assert.equal(chartTypeContract.hollowStyle[1].bodyColor,"#f16b8d");
  assert.deepEqual(chartTypeContract.additionalModes.map(({requested,active,barCount})=>({requested,active,barCount})),[
   {requested:"bars",active:"bars",barCount:3},{requested:"line",active:"line",barCount:3},{requested:"area",active:"area",barCount:3},
  ],"Native v5 exposes bar, line, and area chart series using the verified source range");
  assert.deepEqual(chartTypeContract.additionalModes.map(({renderedSeries})=>renderedSeries),[
   {candles:false,bars:true,line:false,area:false},{candles:false,bars:false,line:true,area:false},{candles:false,bars:false,line:false,area:true},
  ],"Each native presentation exposes exactly its intended visible price series");
  assert.ok(chartTypeContract.anchorBefore,"native drawing anchor is measurable before presentation changes");
  assert.deepEqual(chartTypeContract.additionalModes.map(({anchor})=>anchor),Array(3).fill(chartTypeContract.anchorBefore),
   "bar, line, and area presentation changes preserve the UTC/price anchor's screen position");
  assert.deepEqual(chartTypeContract.additionalModes.map(({first})=>({time:first.time,open:first.open,high:first.high,low:first.low,close:first.close})),Array(3).fill({time:1712500000,open:10,high:12,low:8,close:11}),
   "additional presentations preserve the raw MT5 OHLC source for readouts and overlays");
  assert.equal(chartTypeContract.invalidRejected,true);assert.equal(chartTypeContract.afterInvalidType,"hollow");
  assert.equal(chartTypeContract.otherAccount,"candles");assert.equal(chartTypeContract.restored,"hollow");
  assert.equal(chartTypeContract.otherTimeframe,"candles","Chart type preferences are isolated by symbol and timeframe");
  assert.equal(chartTypeContract.sourceUnchanged,true,"Presentation never mutates MT5 source bars");
  const volumeZoneCalculation=await page.evaluate(()=>{
   const start=1712500000,bars=Array.from({length:26},(_,i)=>({time:start+i*900,open:100,high:102,low:99,close:101,tick_volume:i===20?30:10,real_volume:0})),before=JSON.stringify(bars);
   const result=ChartStudioV5.calculateVolumeZones(bars,{timeframeSeconds:900,asOfUtc:start+26*900,lookback:20,multiplier:2});
   const future=ChartStudioV5.calculateVolumeZones([...bars,{time:start+26*900,open:100,high:102,low:99,close:101,tick_volume:500,real_volume:0}],{timeframeSeconds:900,asOfUtc:start+26*900,lookback:20,multiplier:2});
   const reference=ChartStudioMarketStructure.core.analyze(bars,{timeframeSeconds:900,asOfUtc:start+26*900,sessions:[],volumeZones:true,volumeLookback:20,volumeMultiplier:2}).volumeZones;
   const realBars=bars.map((bar,index)=>({...bar,real_volume:index===20?30:10,tick_volume:index===20?300:1})),real=ChartStudioV5.calculateVolumeZones(realBars,{timeframeSeconds:900,asOfUtc:start+26*900});
   const short=ChartStudioV5.calculateVolumeZones(bars.slice(0,20),{timeframeSeconds:900,asOfUtc:start+20*900});
   const invalid=ChartStudioV5.calculateVolumeZones(bars,{timeframeSeconds:900,asOfUtc:start+26*900,lookback:101});
   return {result,unchanged:before===JSON.stringify(bars),future,reference,real,short,invalid};
  });
  assert.equal(volumeZoneCalculation.result.algorithmVersion,"volume-range-median-v1");
  assert.equal(volumeZoneCalculation.result.zones.length,1);
  assert.equal(volumeZoneCalculation.result.zones[0].source,"TICK_VOLUME_PROXY");
  assert.equal(volumeZoneCalculation.result.zones[0].medianVolume,10);
  assert.equal(volumeZoneCalculation.result.zones[0].end,1712523400);
  assert.equal(volumeZoneCalculation.unchanged,true);
  assert.deepEqual(volumeZoneCalculation.future.zones.map(zone=>zone.time),volumeZoneCalculation.result.zones.map(zone=>zone.time));
  assert.equal(volumeZoneCalculation.real.zones[0].source,"REAL_VOLUME");
  assert.equal(volumeZoneCalculation.short.status,"WARMUP");
  assert.equal(volumeZoneCalculation.invalid.status,"INVALID_CONFIGURATION");
  assert.deepEqual(volumeZoneCalculation.result.zones.map(({time,start,end,high,low,source,volume,medianVolume})=>({time,start,end,high,low,source,volume,medianVolume})),volumeZoneCalculation.reference.zones.map(({time,start,end,high,low,source,volume,medianVolume})=>({time,start,end,high,low,source,volume,medianVolume})),"Native v5 volume-zone math matches the Beta reference");
  const zonePage=await browser.newPage({viewport:{width:1280,height:840}}),zoneErrors=[];zonePage.on("pageerror",error=>zoneErrors.push(error.message));
  await zonePage.goto("http://127.0.0.1:8872/chart_studio_v5/fixture.html",{waitUntil:"networkidle"});
  await zonePage.addScriptTag({path:path.resolve("chart_studio_v5/node_modules/lightweight-charts/dist/lightweight-charts.standalone.development.js")});
  const volumeZoneOverlayProbe=await zonePage.evaluate(()=>{
   const host=document.createElement("div");host.id="v5-volume-zone-probe";host.style.cssText="width:640px;height:360px;position:fixed;left:20px;top:20px;z-index:20";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"titan",{symbol:"XAUUSD",timeframe:"M15"}),start=1712500000,asOf={source:"MT5_VERIFIED",account:"titan",symbol:"XAUUSD",timeframe:"M15",timeUtc:start+26*900},bars=Array.from({length:26},(_,i)=>({time:start+i*900,open:100,high:102,low:99,close:101,tick_volume:i===20?30:10,real_volume:0}));
   engine.setCandles(bars);engine.setVisibleLogicalRange({from:0,to:26});
   const initial=engine.setVolumeZones({timeframeSeconds:900,lookback:20,multiplier:2},asOf),readout=engine.readDataWindow(bars[20].time).volumeZones;
   let invalidRejected=false,scopeTimeframeRejected=false,asOfScopeRejected=false;try{engine.setVolumeZones({timeframeSeconds:900,lookback:101},asOf)}catch(_){invalidRejected=true}
   try{engine.setVolumeZones({timeframeSeconds:300},asOf)}catch(_){scopeTimeframeRejected=true}
   try{engine.setVolumeZones({timeframeSeconds:900},{...asOf,account:"other"})}catch(_){asOfScopeRejected=true}
   const afterInvalid=engine.readVolumeZones(),changed=engine.setVolumeZones({timeframeSeconds:900,lookback:20,multiplier:4},asOf),hidden=engine.setVolumeZones({timeframeSeconds:900,lookback:20,multiplier:2,visible:false},asOf);
   const manuallyCleared=engine.clearVolumeZones(),afterClear=engine.readVolumeZones();engine.setVolumeZones({timeframeSeconds:900,lookback:20,multiplier:2,visible:true},asOf);
   const last={...bars.at(-1),time:start+26*900,tick_volume:900};engine.updateLast(last);
   const forming=engine.readVolumeZones(),status=engine.inspect();window.__v5VolumeZoneEngine=engine;
   return {initial,readout,invalidRejected,scopeTimeframeRejected,asOfScopeRejected,afterInvalid,changed,hidden,manuallyCleared,afterClear,forming,status};
  });
  assert.equal(volumeZoneOverlayProbe.initial.result.zones.length,1);
  assert.equal(volumeZoneOverlayProbe.readout.zones[0].source,"TICK_VOLUME_PROXY");
  assert.equal(volumeZoneOverlayProbe.invalidRejected,true);
  assert.equal(volumeZoneOverlayProbe.scopeTimeframeRejected,true);
  assert.equal(volumeZoneOverlayProbe.asOfScopeRejected,true);
  assert.deepEqual(volumeZoneOverlayProbe.afterInvalid,volumeZoneOverlayProbe.initial,"Rejected v5 zone settings preserve the existing overlay");
  assert.equal(volumeZoneOverlayProbe.changed.result.status,"NO_TRIGGERS","Updating the multiplier recalculates the existing zone overlay");
  assert.equal(volumeZoneOverlayProbe.hidden.options.visible,false,"Native v5 volume zones can be hidden without removing their readout");
  assert.equal(volumeZoneOverlayProbe.manuallyCleared,true);assert.equal(volumeZoneOverlayProbe.afterClear,null);
  assert.deepEqual(volumeZoneOverlayProbe.forming.result.zones.map(zone=>zone.time),volumeZoneOverlayProbe.initial.result.zones.map(zone=>zone.time),"A forming v5 volume candle cannot trigger a zone");
  assert.equal(volumeZoneOverlayProbe.status.volumeZoneCount,1);
  await zonePage.locator("#v5-volume-zone-probe").screenshot({path:path.resolve("output/visual-smoke/chart-studio-v5-volume-zones.png")});
  const volumeZoneCleanup=await zonePage.evaluate(()=>{const engine=window.__v5VolumeZoneEngine;engine.changeAccount("other");const cleared={read:engine.readVolumeZones(),count:engine.inspect().volumeZoneCount,status:engine.inspect().volumeZoneStatus};engine.destroy();document.querySelector("#v5-volume-zone-probe")?.remove();return cleared});
  assert.deepEqual(volumeZoneCleanup,{read:null,count:0,status:"DISABLED"},"Account changes clear native v5 volume zones");
  assert.deepEqual(zoneErrors,[]);await zonePage.close();
  const autoFibPage=await browser.newPage({viewport:{width:1280,height:840}}),autoFibErrors=[];autoFibPage.on("pageerror",error=>autoFibErrors.push(error.message));await autoFibPage.goto("http://127.0.0.1:8872/chart_studio_v5/fixture.html",{waitUntil:"networkidle"});
  const autoFibonacciOverlayProbe=await autoFibPage.evaluate(()=>{
   const host=document.createElement("div");host.id="v5-auto-fib-probe";host.style.cssText="width:640px;height:360px;position:fixed;left:20px;top:20px;z-index:20";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"titan",{symbol:"XAUUSD",timeframe:"M15"}),start=1712500000,pairs=[[10,8],[9,7],[12,4],[14,8],[15,9],[20,12],[18,10],[17,11],[16,10]],bars=pairs.map(([high,low],i)=>({time:start+i*900,open:(high+low)/2,high,low,close:(high+low)/2})),asOf={source:"MT5_VERIFIED",account:"titan",symbol:"XAUUSD",timeframe:"M15",timeUtc:start+9*900};
   engine.setCandles(bars);engine.setVisibleLogicalRange({from:0,to:10});const initial=engine.setAutoFibonacci({timeframeSeconds:900},asOf),preConfirmationReadout=engine.readDataWindow(bars[7].time).autoFibonacci??null,readout=engine.readDataWindow(bars[8].time).autoFibonacci;
   let badScopeRejected=false;try{engine.setAutoFibonacci({timeframeSeconds:900},{...asOf,account:"other"})}catch(_){badScopeRejected=true}
   const afterInvalid=engine.readAutoFibonacci(),forming={...bars.at(-1),time:start+10*900,high:100,low:1,close:50};engine.updateLast(forming);const afterForming=engine.readAutoFibonacci();
   const cleared=engine.clearAutoFibonacci(),afterClear=engine.readAutoFibonacci();engine.setAutoFibonacci({timeframeSeconds:900},asOf);window.__v5AutoFibEngine=engine;
   return {initial,preConfirmationReadout,readout,badScopeRejected,afterInvalid,afterForming,cleared,afterClear,status:engine.inspect()};
  });
  assert.equal(autoFibonacciOverlayProbe.initial.result.available,true);
  assert.equal(autoFibonacciOverlayProbe.initial.result.direction,"UP");
  assert.equal(Object.keys(autoFibonacciOverlayProbe.initial.series).length,7);
  assert.equal(autoFibonacciOverlayProbe.initial.series.filter(line=>line.points.length>0).length,7);
  assert.equal(autoFibonacciOverlayProbe.initial.series[0].points[0].time,1712507200,"Rendered lines start at swing confirmation");
  assert.equal(autoFibonacciOverlayProbe.initial.result.confirmedAt,1712507200);
  assert.equal(autoFibonacciOverlayProbe.preConfirmationReadout,null,"Unconfirmed historical bars cannot see future Auto-Fibonacci anchors");
  assert.equal(autoFibonacciOverlayProbe.readout.algorithmVersion,"confirmed-swing-auto-fib-v1");
  assert.equal(autoFibonacciOverlayProbe.badScopeRejected,true);
  assert.equal(autoFibonacciOverlayProbe.initial.series.every(line=>line.visible===true),true,"Each Fibonacci ratio is visible in the native chart");
  assert.deepEqual(autoFibonacciOverlayProbe.afterInvalid,autoFibonacciOverlayProbe.initial,"Invalid auto-Fibonacci scope preserves existing lines");
  assert.equal(autoFibonacciOverlayProbe.afterForming.result.end.time,1712504500,"Forming candle cannot change confirmed Fibonacci swing anchors");
  assert.equal(autoFibonacciOverlayProbe.cleared,true);assert.equal(autoFibonacciOverlayProbe.afterClear,null);
  const autoFibCleanup=await autoFibPage.evaluate(()=>{const e=window.__v5AutoFibEngine;e.changeAccount("other");const result=e.readAutoFibonacci();e.destroy();document.querySelector("#v5-auto-fib-probe")?.remove();return result});
  assert.equal(autoFibCleanup,null,"Account changes clear native v5 auto-Fibonacci lines");
  const autoFibLimit=await autoFibPage.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:400px;height:240px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const e=ChartStudioV5.createStudioV5(host,"auto-fib-limit",{symbol:"XAUUSD",timeframe:"M15"}),start=1712500000,pairs=[[10,8],[9,7],[12,4],[14,8],[15,9],[20,12],[18,10],[17,11],[16,10]],bars=pairs.map(([high,low],i)=>({time:start+i*900,open:(high+low)/2,high,low,close:(high+low)/2})),asOf={source:"MT5_VERIFIED",account:"auto-fib-limit",symbol:"XAUUSD",timeframe:"M15",timeUtc:start+9*900};e.setCandles(bars);
   for(let i=0;i<20;i++)e.addAverage({id:`cap-${i}`,color:"#ffffff"},[]);let atLimitRejected=false;try{e.setAutoFibonacci({timeframeSeconds:900},asOf)}catch(_){atLimitRejected=true}
   e.removeAverage("cap-19");const acceptedAfterRemoval=e.setAutoFibonacci({timeframeSeconds:900},asOf).result.available;let nextRejected=false;try{e.addAverage({id:"cap-extra",color:"#ffffff"},[])}catch(_){nextRejected=true}
   const count=e.inspect().averageCount;e.destroy();host.remove();return {atLimitRejected,acceptedAfterRemoval,nextRejected,count};
  });
  assert.deepEqual(autoFibLimit,{atLimitRejected:true,acceptedAfterRemoval:true,nextRejected:true,count:19},"Auto-Fibonacci counts once against the shared 20-indicator limit");
  assert.deepEqual(autoFibErrors,[]);await autoFibPage.close();
  await page.addScriptTag({path:path.resolve("chart_studio_v5/node_modules/lightweight-charts/dist/lightweight-charts.standalone.development.js")});
  await page.addScriptTag({path:path.resolve("static/chart-studio-beta.js")});
  await page.addScriptTag({path:path.resolve("static/chart-studio-averages.js")});
  await page.addScriptTag({path:path.resolve("static/chart-studio-indicators.js")});
  const coordinateCompatibility=await page.evaluate(async()=>{
   const run=(time,secondTime)=>{
    const host=document.createElement("div");host.style.cssText="width:900px;height:360px";document.body.append(host);
    const lib=window.LightweightCharts,chart=lib.createChart(host,{width:900,height:360,autoSize:false});
    const series=chart.addSeries(lib.CandlestickSeries,{priceLineVisible:false});
    const bars=[{time,open:100,high:105,low:95,close:101},{time:secondTime,open:101,high:108,low:99,close:106}];
    series.setData(bars);chart.timeScale().fitContent();
    const adapter=ChartStudioBeta.coordinates.create({apiVersion:5,chart,series,scope:{account:"titan",symbol:"XAUUSD",timeframe:"M15"}});
    adapter.setVisibleLogicalRange({from:-2,to:3});
    const x=adapter.timeToX(time),y=adapter.priceToY(bars[0].close),range=adapter.visibleLogicalRange();
    const roundtripTime=adapter.xToTime(x),roundtripPrice=adapter.yToPrice(y);
    let crosshair=null,rangeEvent=null;
    const offCrosshair=adapter.subscribeCrosshair(value=>{crosshair=value});
    const offRange=adapter.subscribeVisibleLogicalRange(value=>{rangeEvent=value});
    adapter.setScope({account:"goldm15",symbol:"EURUSD",timeframe:"H1"});
    chart.setCrosshairPosition(bars[1].close,secondTime,series);
    adapter.setVisibleLogicalRange({from:0,to:1});
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
     const result={version:adapter.apiVersion,x,y,roundtripTime,roundtripPrice,
      range,scope:crosshair?.scope||null,crosshairTime:crosshair?.time??null,rangeScope:rangeEvent?.scope||null,
      rangeValue:rangeEvent?.range||null,visibleRange:adapter.visibleLogicalRange()};
     offCrosshair();offRange();adapter.destroy();chart.remove();host.remove();resolve(result);
    })));
   };
   const utc=run(1700000000,1700086400),businessDay=run({year:2024,month:1,day:2},{year:2024,month:1,day:3});
   return {utc:await utc,businessDay:await businessDay};
  });
  assert.equal(coordinateCompatibility.utc.version,5);
  assert.ok(Number.isFinite(coordinateCompatibility.utc.x)&&Number.isFinite(coordinateCompatibility.utc.y));
  assert.equal(coordinateCompatibility.utc.roundtripTime,1700000000);
  assert.ok(Math.abs(coordinateCompatibility.utc.roundtripPrice-101)<1e-8);
  assert.deepEqual(coordinateCompatibility.utc.scope,{account:"goldm15",symbol:"EURUSD",timeframe:"H1"});
  assert.equal(coordinateCompatibility.utc.crosshairTime,1700086400);
  assert.deepEqual(coordinateCompatibility.utc.rangeScope,{account:"goldm15",symbol:"EURUSD",timeframe:"H1"});
  assert.deepEqual(coordinateCompatibility.utc.visibleRange,{from:0,to:1});
  assert.equal(coordinateCompatibility.businessDay.roundtripTime,Date.UTC(2024,0,2)/1000);
  assert.ok(Number.isFinite(coordinateCompatibility.businessDay.x));
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
   const multiSelect=engine.selectDrawings(["risk-stop","entry-time"]),selectedTogether=engine.inspect().selectedDrawingIds;
   const groupHidden=engine.setSelectedDrawingsVisible(false),hiddenReadings=[engine.readDrawing("risk-stop").visible,engine.readDrawing("entry-time").visible];
   const groupLocked=engine.setSelectedDrawingsLocked(true),lockedReadings=[engine.readDrawing("risk-stop").locked,engine.readDrawing("entry-time").locked];
   engine.setSelectedDrawingsVisible(true);engine.setSelectedDrawingsLocked(false);
   engine.addTimeMarker({id:"nudge-time-a",time:bars[40].time,color:"#62deeb"});
   engine.addTimeMarker({id:"nudge-time-b",time:bars[50].time,color:"#b3d5ff"});
   engine.selectDrawings(["nudge-time-a","nudge-time-b"]);
   const nudgeBefore=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")];
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
   const nudgeMoved=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")],nudgeSelection=engine.inspect().selectedDrawingIds;
   const nudgeUndo=[engine.undo(),engine.undo()],nudgeRestored=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")];
   const nudgeRedo=[engine.redo(),engine.redo()],nudgeRepeated=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")];
   engine.addPriceLevel({id:"nudge-price-a",price:4100,color:"#ffaa66"});engine.addPriceLevel({id:"nudge-price-b",price:4102,color:"#ff6677"});
   engine.selectDrawings(["nudge-time-a","nudge-price-a"]);const mixedBefore={time:engine.readDrawing("nudge-time-a"),price:engine.readDrawing("nudge-price-a")};
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
   const mixedAfter={time:engine.readDrawing("nudge-time-a"),price:engine.readDrawing("nudge-price-a")},mixedUndo=engine.undo(),mixedRestored={time:engine.readDrawing("nudge-time-a"),price:engine.readDrawing("nudge-price-a")};engine.redo();
   engine.selectDrawings(["nudge-price-a","nudge-price-b"]);
   const verticalBefore=[engine.readDrawing("nudge-price-a"),engine.readDrawing("nudge-price-b")],verticalPositionsBefore=[engine.drawingPosition("nudge-price-a"),engine.drawingPosition("nudge-price-b")];
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));
   const verticalAfter=[engine.readDrawing("nudge-price-a"),engine.readDrawing("nudge-price-b")],verticalPositionsAfter=[engine.drawingPosition("nudge-price-a"),engine.drawingPosition("nudge-price-b")];
   const verticalUndo=[engine.undo(),engine.undo()],verticalRestored=[engine.readDrawing("nudge-price-a"),engine.readDrawing("nudge-price-b")],verticalRedo=[engine.redo(),engine.redo()];
   engine.addChannel({id:"nudge-channel",startTime:bars[30].time,startPrice:4100,endTime:bars[40].time,endPrice:4110,offsetTime:bars[35].time,offsetPrice:4095,color:"#62deeb"});
   engine.addPitchfork({id:"nudge-pitchfork",startTime:bars[30].time,startPrice:4100,endTime:bars[40].time,endPrice:4110,thirdTime:bars[35].time,thirdPrice:4120,color:"#b3d5ff"});
   const compositeBefore=[engine.readDrawing("nudge-channel"),engine.readDrawing("nudge-pitchfork")];
   engine.selectDrawings(["nudge-channel","nudge-pitchfork"]);
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
   const compositeAfter=[engine.readDrawing("nudge-channel"),engine.readDrawing("nudge-pitchfork")];
   const compositeUndo=[engine.undo(),engine.undo()],compositeRestored=[engine.readDrawing("nudge-channel"),engine.readDrawing("nudge-pitchfork")];
   const compositeRedo=[engine.redo(),engine.redo()],compositeRepeated=[engine.readDrawing("nudge-channel"),engine.readDrawing("nudge-pitchfork")];
   engine.removeChannel("nudge-channel");engine.removePitchfork("nudge-pitchfork");
   engine.setDrawingLocked("nudge-time-b",true);engine.selectDrawings(["nudge-time-a","nudge-time-b"]);
   const lockedNudgeBefore=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")];
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
   const lockedNudgeAfter=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-b")];engine.setDrawingLocked("nudge-time-b",false);
   engine.addTimeMarker({id:"nudge-time-boundary",time:bars[0].time,color:"#f7c774"});engine.selectDrawings(["nudge-time-a","nudge-time-boundary"]);
   const boundaryNudgeBefore=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-boundary")];
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}));
   const boundaryNudgeAfter=[engine.readDrawing("nudge-time-a"),engine.readDrawing("nudge-time-boundary")];
   for(let i=0;i<101;i++)engine.addTimeMarker({id:`nudge-capacity-${i}`,time:bars[20].time,color:"#ffffff"});
   const capacityIds=Array.from({length:101},(_,i)=>`nudge-capacity-${i}`);engine.selectDrawings(capacityIds);
   const capacityBefore=capacityIds.map(id=>engine.readDrawing(id));document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
   const capacityAfter=capacityIds.map(id=>engine.readDrawing(id));
   [...capacityIds,"nudge-time-boundary","nudge-time-a","nudge-time-b"].forEach(id=>engine.removeTimeMarker(id));engine.removePriceLevel("nudge-price-a");engine.removePriceLevel("nudge-price-b");
   engine.selectDrawings(["risk-stop","entry-time"]);
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"h",bubbles:true}));
   const keyboardHidden=[engine.readDrawing("risk-stop").visible,engine.readDrawing("entry-time").visible];
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"l",bubbles:true}));
   const keyboardLocked=[engine.readDrawing("risk-stop").locked,engine.readDrawing("entry-time").locked];
   engine.setSelectedDrawingsVisible(true);engine.setSelectedDrawingsLocked(false);
   const toggledSelection=engine.toggleDrawingSelection("entry-time"),selectedAfterToggle=engine.inspect().selectedDrawingIds;
   let unknownSelectionRejected=false;try{engine.selectDrawings(["risk-stop","missing-drawing"])}catch(_){unknownSelectionRejected=true}
   const selectionAfterRejected=engine.inspect().selectedDrawingIds;
   engine.selectDrawings(["risk-stop","entry-time"]);
   const groupDeleteAvailable=typeof engine.deleteSelectedDrawings==="function";
   const groupDeleteIds=groupDeleteAvailable?engine.deleteSelectedDrawings():[];
   const groupDeleteRemoved=[engine.readDrawing("risk-stop"),engine.readDrawing("entry-time")];
   const groupDeleteSelection=engine.inspect().selectedDrawingIds;
   const groupDeleteUndo=groupDeleteAvailable?[engine.undo(),engine.undo()]:[];
   const groupDeleteRestored=[engine.readDrawing("risk-stop"),engine.readDrawing("entry-time")];
   const groupDeleteRedo=groupDeleteAvailable?[engine.redo(),engine.redo()]:[];
   const groupDeleteRedone=[engine.readDrawing("risk-stop"),engine.readDrawing("entry-time")];
   if(groupDeleteAvailable){
    engine.addPriceLevel({id:"risk-stop",price:4100,color:"#ff6677"});
    engine.addTimeMarker({id:"entry-time",time:bars[40].time,color:"#c18bff"});
   }
   engine.selectDrawings(["risk-stop","entry-time"]);
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true}));
   const keyboardGroupDelete=[engine.readDrawing("risk-stop"),engine.readDrawing("entry-time")];
   const keyboardGroupDeleteSelection=engine.inspect().selectedDrawingIds;
   const keyboardGroupDeleteUndo=keyboardGroupDelete.every(item=>item===null)?[engine.undo(),engine.undo()]:[engine.undo()];
   engine.selectDrawings(["risk-stop","entry-time"]);
   document.getElementById("chart").dispatchEvent(new KeyboardEvent("keydown",{key:"Backspace",bubbles:true}));
   const keyboardGroupBackspace=[engine.readDrawing("risk-stop"),engine.readDrawing("entry-time")];
   const keyboardGroupBackspaceUndo=keyboardGroupBackspace.every(item=>item===null)?[engine.undo(),engine.undo()]:[engine.undo()];
   engine.selectDrawings([]);
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
    multiSelect,selectedTogether,groupHidden,hiddenReadings,groupLocked,lockedReadings,nudgeBefore,nudgeMoved,nudgeSelection,nudgeUndo,nudgeRestored,nudgeRedo,nudgeRepeated,mixedBefore,mixedAfter,mixedUndo,mixedRestored,verticalBefore,verticalAfter,verticalPositionsBefore,verticalPositionsAfter,verticalUndo,verticalRestored,verticalRedo,compositeBefore,compositeAfter,compositeUndo,compositeRestored,compositeRedo,compositeRepeated,lockedNudgeBefore,lockedNudgeAfter,boundaryNudgeBefore,boundaryNudgeAfter,capacityBefore,capacityAfter,keyboardHidden,keyboardLocked,toggledSelection,selectedAfterToggle,unknownSelectionRejected,selectionAfterRejected,
    groupDeleteAvailable,groupDeleteIds,groupDeleteRemoved,groupDeleteSelection,groupDeleteUndo,groupDeleteRestored,groupDeleteRedo,groupDeleteRedone,
    keyboardGroupDelete,keyboardGroupDeleteSelection,keyboardGroupDeleteUndo,keyboardGroupBackspace,keyboardGroupBackspaceUndo,
    staleHistoryMarker,drawingIndicatorCollisionRejected,
    warmupReadout,alignedReadout,noVolumeReadout,missingBarReadout,formingReadout,
    replacementReadout,badVolumeRejected,invalidReadoutTimeRejected,
    expectedWarmupOpen:bars[10].open,expectedWarmupUtc:new Date(bars[10].time*1000).toISOString()};
  });
  const timezoneProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:420px";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"timezone-at024"),times=[
    Date.UTC(2024,2,31,0,30)/1000,Date.UTC(2024,2,31,1,30)/1000,
    Date.UTC(2024,9,27,0,30)/1000,Date.UTC(2024,9,27,1,30)/1000
   ];
   const bars=times.map((time,index)=>({time,open:100+index,high:105+index,low:95+index,close:101+index}));
   engine.setCandles(bars);engine.addTimeMarker({id:"dst-marker",time:times[0],color:"#ffffff"});
   const markerBefore=engine.drawingPosition("dst-marker"),readoutBefore=engine.readDataWindow(times[0]),storedBefore=engine.readDrawing("dst-marker");
   const before=times.map(time=>engine.formatTimeLabel(time,LightweightCharts.TickMarkType.Time));
   const crosshairBefore=engine.formatCrosshairTime(times[0]);
   engine.setDisplayTimeZone("Europe/Berlin");
   const markerAfter=engine.drawingPosition("dst-marker"),readoutAfter=engine.readDataWindow(times[0]),storedAfter=engine.readDrawing("dst-marker");
   const after=times.map(time=>engine.formatTimeLabel(time,LightweightCharts.TickMarkType.Time));
   const crosshairAfter=engine.formatCrosshairTime(times[0]);
   let invalidRejected=false;try{engine.setDisplayTimeZone("Mars/Olympus_Mons")}catch(_){invalidRejected=true}
   const timezoneAfterInvalid=engine.displayTimeZone();
   const afterInvalid=times.map(time=>engine.formatTimeLabel(time,LightweightCharts.TickMarkType.Time));
   engine.destroy();host.remove();
   return {times,before,after,crosshairBefore,crosshairAfter,markerBefore,markerAfter,readoutBefore,readoutAfter,storedBefore,storedAfter,invalidRejected,timezoneAfterInvalid,afterInvalid};
  });
  const viewPersistenceProbe=await page.evaluate(()=>{
   const bars=Array.from({length:60},(_,i)=>{const close=100+i*.15;return {time:1700200000+i*900,open:close-.2,high:close+1,low:close-1,close}});
   const scope={symbol:"XAUUSD",timeframe:"M15"},host=document.createElement("div");host.style.cssText="width:900px;height:520px;position:absolute;left:-1800px;top:0";document.body.append(host);
   let engine=ChartStudioV5.createStudioV5(host,"view-persistence",scope);engine.setCandles(bars);
   engine.addMovingAverage({id:"view-ema",type:"EMA",period:9,source:"hlc3",color:"#55ccaa",lineWidth:3,displayShift:2,title:"EMA nine"});
   engine.addOscillator({id:"view-rsi",kind:"rsi",settings:{period:14},color:"#bb66dd",title:"RSI saved"});
   engine.addOscillator({id:"view-macd",kind:"macd",settings:{fast:12,slow:26,signal:9},color:"#66bbdd",title:"MACD saved"});
   engine.addOscillator({id:"view-cci",kind:"cci",settings:{period:20},color:"#a995ff",title:"CCI saved"});
   engine.addOscillator({id:"view-obv",kind:"obv",settings:{},color:"#55deaa",title:"OBV saved"});
   engine.addOscillator({id:"view-mfi",kind:"mfi",settings:{period:14},color:"#e9bc72",title:"MFI saved"});
   engine.addPaneLine({id:"view-signal",color:"#f7c774",lineWidth:3,title:"Saved signal"},bars.slice(14).map((bar,i)=>({time:bar.time,value:40+Math.sin(i/5)*10})));engine.showVolume(true);engine.resizePane(1,190);engine.setDisplayTimeZone("Europe/Berlin");engine.setVisibleLogicalRange({from:12,to:42});
   const expected={ema:engine.movingAverageOptions("view-ema"),rsi:engine.oscillatorOptions("view-rsi"),macd:engine.oscillatorOptions("view-macd"),cci:engine.oscillatorOptions("view-cci"),obv:engine.oscillatorOptions("view-obv"),mfi:engine.oscillatorOptions("view-mfi"),layout:engine.oscillatorPaneLayout().map(pane=>({...pane,titles:[...pane.titles].sort()})),heights:engine.paneHeights(),volume:engine.inspect().volumeVisible,zone:engine.displayTimeZone(),range:engine.visibleLogicalRange(),paneLines:engine.inspect().nativePaneLines};
   engine.addPriceLevel({id:"portable-layout-price",price:107,color:"#44aadd"});
   const portableLayout=JSON.parse(engine.exportLayout());
   const legacyDrawings=JSON.parse(engine.exportDrawings());
   const validSnapshot=JSON.parse(localStorage.getItem("2eas.chartstudio.v5.drawings:v5:view-persistence:XAUUSD:M15"));
   engine.destroy();engine=ChartStudioV5.createStudioV5(host,"view-persistence",scope);engine.setCandles(bars);
   const restored={ema:engine.movingAverageOptions("view-ema"),rsi:engine.oscillatorOptions("view-rsi"),macd:engine.oscillatorOptions("view-macd"),cci:engine.oscillatorOptions("view-cci"),obv:engine.oscillatorOptions("view-obv"),mfi:engine.oscillatorOptions("view-mfi"),layout:engine.oscillatorPaneLayout().map(pane=>({...pane,titles:[...pane.titles].sort()})),heights:engine.paneHeights(),volume:engine.inspect().volumeVisible,zone:engine.displayTimeZone(),range:engine.visibleLogicalRange(),status:engine.inspect().persistenceStatus,error:engine.inspect().persistenceError,paneLines:engine.inspect().nativePaneLines};
   engine.destroy();host.remove();
   validSnapshot.account="invalidview";validSnapshot.displayTimeZone="Mars/Olympus_Mons";localStorage.setItem("2eas.chartstudio.v5.drawings:v5:invalidview:XAUUSD:M15",JSON.stringify(validSnapshot));
   const invalidHost=document.createElement("div");invalidHost.style.cssText="width:900px;height:520px;position:absolute;left:-1800px;top:0";document.body.append(invalidHost);
   const invalid=ChartStudioV5.createStudioV5(invalidHost,"invalidview",scope);invalid.setCandles(bars);const invalidView={status:invalid.inspect().persistenceStatus,error:invalid.inspect().persistenceError,drawings:invalid.inspect().nativePrimitives,averages:invalid.inspect().averageCount,oscillators:invalid.inspect().oscillatorCount,volume:invalid.inspect().volumeVisible};invalid.destroy();invalidHost.remove();
   const otherHost=document.createElement("div");otherHost.style.cssText="width:900px;height:520px;position:absolute;left:-1800px;top:0";document.body.append(otherHost);
   const other=ChartStudioV5.createStudioV5(otherHost,"view-persistence",{symbol:"XAUUSD",timeframe:"H1"});other.setCandles(bars);const otherScope={count:other.inspect().averageCount+other.inspect().oscillatorCount,volume:other.inspect().volumeVisible,zone:other.displayTimeZone()};other.destroy();otherHost.remove();
   const symbolHost=document.createElement("div");symbolHost.style.cssText="width:900px;height:520px;position:absolute;left:-1800px;top:0";document.body.append(symbolHost);
   const otherSymbol=ChartStudioV5.createStudioV5(symbolHost,"view-persistence",{symbol:"XAUUSD.p",timeframe:"M15"});otherSymbol.setCandles(bars);const otherSymbolScope=otherSymbol.inspect().averageCount+otherSymbol.inspect().oscillatorCount;otherSymbol.destroy();
   const otherAccount=ChartStudioV5.createStudioV5(symbolHost,"view-persistence-other",{symbol:"XAUUSD",timeframe:"M15"});otherAccount.setCandles(bars);const otherAccountScope=otherAccount.inspect().averageCount+otherAccount.inspect().oscillatorCount;otherAccount.destroy();symbolHost.remove();
   return {expected,restored,otherScope,otherSymbolScope,otherAccountScope,invalidView,portableLayout,legacyDrawings};
  });
  assert.deepEqual(viewPersistenceProbe.restored.ema,viewPersistenceProbe.expected.ema);
  assert.deepEqual(viewPersistenceProbe.restored.rsi,viewPersistenceProbe.expected.rsi);
  assert.deepEqual(viewPersistenceProbe.restored.macd,viewPersistenceProbe.expected.macd);
  assert.deepEqual(viewPersistenceProbe.restored.cci,viewPersistenceProbe.expected.cci,"CCI settings restore within account, symbol and timeframe scope");
  assert.deepEqual(viewPersistenceProbe.restored.obv,viewPersistenceProbe.expected.obv,"OBV settings restore within account, symbol and timeframe scope");
  assert.deepEqual(viewPersistenceProbe.restored.mfi,viewPersistenceProbe.expected.mfi,"MFI settings restore within account, symbol and timeframe scope");
  assert.deepEqual(viewPersistenceProbe.restored.layout,viewPersistenceProbe.expected.layout);
  assert.deepEqual(viewPersistenceProbe.restored.heights,viewPersistenceProbe.expected.heights);
  assert.equal(viewPersistenceProbe.restored.volume,true);
  assert.equal(viewPersistenceProbe.restored.zone,"Europe/Berlin");
  assert.deepEqual(viewPersistenceProbe.restored.range,viewPersistenceProbe.expected.range);
  assert.equal(viewPersistenceProbe.restored.paneLines,1,"custom native pane lines restore with the view layout");
  assert.equal(viewPersistenceProbe.restored.status,"READY");
  assert.deepEqual(viewPersistenceProbe.otherScope,{count:0,volume:false,zone:"UTC"});
  assert.equal(viewPersistenceProbe.otherSymbolScope,0,"CCI does not leak into another symbol view");
  assert.equal(viewPersistenceProbe.otherAccountScope,0,"CCI does not leak into another account view");
  assert.equal(viewPersistenceProbe.portableLayout.schemaVersion,2,"portable full-view export has its own versioned envelope");
  assert.deepEqual(Object.keys(viewPersistenceProbe.portableLayout).sort(),["drawings","schemaVersion","symbol","timeframe","view"]);
  assert.equal(viewPersistenceProbe.portableLayout.symbol,"XAUUSD");
  assert.equal(viewPersistenceProbe.portableLayout.timeframe,"M15");
  assert.equal(Object.hasOwn(viewPersistenceProbe.portableLayout,"account"),false,"portable export omits account identity");
  assert.equal(viewPersistenceProbe.portableLayout.drawings.some(item=>item.options.id==="portable-layout-price"),true);
  assert.deepEqual(viewPersistenceProbe.portableLayout.view.movingAverages,[viewPersistenceProbe.expected.ema]);
  assert.deepEqual(viewPersistenceProbe.portableLayout.view.oscillators.map(item=>item.options.id).sort(),["view-cci","view-macd","view-mfi","view-obv","view-rsi"]);
  assert.equal(viewPersistenceProbe.portableLayout.view.volumeVisible,true);
  assert.equal(viewPersistenceProbe.portableLayout.view.displayTimeZone,"Europe/Berlin");
  assert.ok(viewPersistenceProbe.portableLayout.view.paneHeights.length>1);
  assert.ok(viewPersistenceProbe.portableLayout.view.paneLines.some(item=>item.options.id==="view-signal"));
  assert.equal(viewPersistenceProbe.legacyDrawings.schemaVersion,1,"drawings-only JSON export remains backward compatible");
  const layoutLimitProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:640px;height:320px;position:absolute;left:-1800px;top:0";document.body.append(host);
   const bars=Array.from({length:20000},(_,i)=>{const close=100+i/10000;return {time:1700000000+i*900,open:close,high:close+1,low:close-1,close}});
   const engine=ChartStudioV5.createStudioV5(host,"layout-export-limit",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(bars);
   engine.addPaneLine({id:"large-portable-line",color:"#f7c774",lineWidth:1,title:"Large"},bars.map(bar=>({time:bar.time,value:bar.close})));
   let error="";try{engine.exportLayout()}catch(caught){error=caught.message}
   engine.destroy();host.remove();return error;
  });
  assert.equal(layoutLimitProbe,"Layout export exceeds size limit","portable full-view export enforces the shared 512 KiB bound");
  const storageConflictProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:640px;height:320px;position:absolute;left:-1800px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"portable-conflict",{symbol:"XAUUSD",timeframe:"M15"});
   engine.setCandles(Array.from({length:30},(_,i)=>{const close=100+i;return {time:1700000000+i*900,open:close,high:close+1,low:close-1,close}}));
   engine.addPriceLevel({id:"conflict-price",price:110,color:"#22aadd"});
   const key="2eas.chartstudio.v5.drawings:v5:portable-conflict:XAUUSD:M15",saved=localStorage.getItem(key);
   localStorage.setItem(key,saved+" ");const available=engine.verifyPersistence(),state=engine.inspect();
   localStorage.setItem(key,saved);engine.destroy();host.remove();return {available,status:state.persistenceStatus,error:state.persistenceError};
  });
  assert.deepEqual(storageConflictProbe,{available:false,status:"CONFLICT",error:"EXTERNAL_CHANGE"},"layout writes fail closed after another tab changes the scoped snapshot");
  assert.deepEqual(viewPersistenceProbe.invalidView,{status:"UNAVAILABLE",error:"INVALID_VIEW_STATE",drawings:0,averages:0,oscillators:0,volume:false},"invalid v3 state is rejected before any renderer mutation");
  const paneResizeSetup=await page.evaluate(async()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:420px";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at003-pane-resize"),bars=Array.from({length:80},(_,i)=>{
    const close=100+Math.sin(i/5)*4;return {time:1700000000+i*60,open:close,high:close+1,low:close-1,close};
   });
   engine.setCandles(bars);engine.addOscillator({id:"rsi-at003",kind:"rsi",settings:{period:14},color:"#b3d5ff",title:"RSI 14"});
   host.scrollIntoView({block:"center"});
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const handle=[...host.querySelectorAll("*")].find(el=>getComputedStyle(el).cursor==="row-resize"&&el.getBoundingClientRect().height>0);
   if(!handle)throw Error("Native pane resize handle is missing");
   const rect=handle.getBoundingClientRect();window.__at003Engine=engine;window.__at003Host=host;
   return {paneCount:engine.inspect().paneCount,heights:engine.paneHeights(),x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  });
  await page.mouse.move(paneResizeSetup.x,paneResizeSetup.y);
  await page.mouse.down();await page.mouse.move(paneResizeSetup.x,paneResizeSetup.y-45,{steps:6});await page.mouse.up();
  const paneResizeAfter=await page.evaluate(()=>{const heights=window.__at003Engine.paneHeights();window.__at003Engine.destroy();window.__at003Host.remove();window.scrollTo(0,0);return heights});
  const movingAverageProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at002-native-ma"),bars=Array.from({length:30},(_,i)=>({
    time:1700100000+i*60,open:20+i*2,high:30+i*2,low:8+i,close:10+i,tick_volume:10+i
   }));
   engine.setCandles(bars);
   engine.addMovingAverage({id:"ema-close",type:"EMA",period:3,source:"close",color:"#12aacc",lineWidth:1});
   engine.addMovingAverage({id:"ema-high",type:"EMA",period:3,source:"high",color:"#cc33aa",lineWidth:4,displayShift:1});
   engine.addMovingAverage({id:"ema20-close",type:"EMA",period:20,source:"close",color:"#18cdef",lineWidth:1});
   engine.addMovingAverage({id:"ema20-high",type:"EMA",period:20,source:"high",color:"#e531a9",lineWidth:4,displayShift:2});
   const ema20Styles=[engine.averageOptions("ema20-close"),engine.averageOptions("ema20-high")];
   const extraTypes=["SMA","WMA","RMA","SMMA"];
   for(const type of extraTypes)engine.addMovingAverage({id:`ma-${type}`,type,period:3,source:"hlc3",color:"#22cc88"});
   const independent=engine.readDataWindow(bars[3].time).indicators;
   const nativeRows=bars.map(bar=>engine.readDataWindow(bar.time).indicators);
   const reference=Object.fromEntries(extraTypes.map(type=>{const shifted=window.ChartStudioAverages.shiftDisplay(bars,
    window.ChartStudioAverages.calculate(bars,type,3,"hlc3"),0),byTime=new Map(shifted.map(point=>[point.time,point.value]));
    return [type,bars.map(bar=>byTime.get(bar.time)??null)]}));
   const matrixMismatches=[],sources=["close","open","high","low","hl2","hlc3","ohlc4"],types=["EMA","SMA","WMA","RMA","SMMA"],shifts=[-2,-1,0,1,2];let workingBars=bars;
   for(let index=0;index<types.length*sources.length;index++){
    const type=types[Math.floor(index/sources.length)],source=sources[index%sources.length],displayShift=shifts[index%shifts.length];
    engine.addMovingAverage({id:"matrix-ma",type,period:3,source,color:"#7aaacc",displayShift});
    for(const action of ["forming","append"]){
     const last=workingBars[workingBars.length-1];let next;
     if(action==="forming")next={...last,open:last.open+.1,close:last.close+.2,high:Math.max(last.high,last.open+.1,last.close+.2)+.1,low:Math.min(last.low,last.open+.1,last.close+.2)-.1};
     else{const open=last.open+.3,close=last.close+.4;next={time:last.time+60,open,close,high:Math.max(last.high+.5,open,close),low:Math.min(last.low-.5,open,close),tick_volume:(last.tick_volume||0)+1}}
     engine.updateLast(next);workingBars=action==="forming"?[...workingBars.slice(0,-1),next]:[...workingBars,next];
     const expectedPoints=window.ChartStudioAverages.shiftDisplay(workingBars,window.ChartStudioAverages.calculate(workingBars,type,3,source),displayShift),expectedMap=new Map(expectedPoints.map(point=>[point.time,point.value]));
     for(const bar of workingBars){const actual=engine.readDataWindow(bar.time).indicators.find(item=>item.id==="matrix-ma").value,expected=expectedMap.get(bar.time)??null;
      if(actual===null?expected!==null:expected===null||Math.abs(actual-expected)>1e-10)matrixMismatches.push({type,source,displayShift,action,time:bar.time,actual,expected});
     }
    }
    engine.removeAverage("matrix-ma");
   }
   const ema20Reference=Object.fromEntries([["ema20-close","close",0],["ema20-high","high",2]].map(([id,source,shift])=>{
    const shifted=window.ChartStudioAverages.shiftDisplay(bars,window.ChartStudioAverages.calculate(bars,"EMA",20,source),shift),byTime=new Map(shifted.map(point=>[point.time,point.value]));
    return [id,bars.map(bar=>byTime.get(bar.time)??null)];
   }));
   engine.addMovingAverage({id:"ema20-close",type:"EMA",period:10,source:"open",color:"#39d6aa",lineWidth:3,displayShift:-1});
   const editedEma20Style=engine.averageOptions("ema20-close");
   const ema20Edited=engine.readDataWindow(bars[25].time).indicators;
   const ema20EditedPoints=window.ChartStudioAverages.shiftDisplay(bars,window.ChartStudioAverages.calculate(bars,"EMA",10,"open"),-1),ema20EditedMap=new Map(ema20EditedPoints.map(point=>[point.time,point.value]));
   const ema20EditedExpected=ema20EditedMap.get(bars[25].time);
   const replacementBars=bars.map(bar=>({...bar,open:bar.open+100,high:bar.high+100,low:bar.low+100,close:bar.close+100}));
   engine.setCandles(replacementBars);
   const reloaded=engine.readDataWindow(replacementBars[25].time).indicators;
   const replacementMa=window.ChartStudioAverages.shiftDisplay(replacementBars,window.ChartStudioAverages.calculate(replacementBars,"EMA",10,"open"),-1),replacementMaMap=new Map(replacementMa.map(point=>[point.time,point.value]));
   const replacementExpected=replacementMaMap.get(replacementBars[25].time);
   engine.addMovingAverage({id:"ema-close",type:"EMA",period:2,source:"open",color:"#12aacc",lineWidth:2});
   const edited=engine.readDataWindow(bars[3].time).indicators;
   const editedExpected=window.ChartStudioAverages.calculate(replacementBars,"EMA",2,"open").find(point=>point.time===bars[3].time).value;
   const formingBar={...replacementBars.at(-1),close:30,open:30,high:33,low:29};engine.updateLast(formingBar);
   const forming=engine.readDataWindow(formingBar.time).indicators;
   const formingExpected=window.ChartStudioAverages.calculate([...replacementBars.slice(0,-1),formingBar],"EMA",2,"open").at(-1).value;
   let badPeriodRejected=false;try{engine.addMovingAverage({id:"bad-ma",type:"EMA",period:0,source:"close",color:"#ffffff"})}catch(_){badPeriodRejected=true}
   engine.destroy();host.remove();
   return {independent,edited,editedExpected,forming,formingExpected,badPeriodRejected,nativeRows,reference,extraTypes,ema20Reference,ema20Edited,ema20EditedExpected,reloaded,replacementExpected,matrixMismatches,ema20Styles,editedEma20Style};
  });
  const donchianProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at025-native-donchian"),bars=Array.from({length:8},(_,i)=>({time:1700400000+i*60,open:10+i,high:12+i,low:8+i,close:11+i}));
   engine.setCandles(bars);engine.addDonchian({id:"donchian-main",period:3,color:"#55d7ee"});
   const row=engine.readDataWindow(bars.at(-1).time).indicators.find(item=>item.id==="donchian-main");
   const changed={...bars.at(-1),high:30,low:6,close:20};engine.updateLast(changed);
   const updated=engine.readDataWindow(changed.time).indicators.find(item=>item.id==="donchian-main");
   let badPeriodRejected=false;try{engine.addDonchian({id:"donchian-bad",period:201,color:"#ffffff"})}catch(_){badPeriodRejected=true}
   engine.changeAccount("at025-other");const isolated=engine.readDataWindow(changed.time).indicators?.length??0;
   engine.destroy();host.remove();return {row,updated,badPeriodRejected,isolated};
  });
  const keltnerProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at026-native-keltner"),bars=Array.from({length:8},(_,i)=>({time:1700500000+i*60,open:20+i,high:24+i,low:18+i,close:21+i}));
   engine.setCandles(bars);engine.addKeltner({id:"keltner-main",period:3,atrPeriod:2,multiplier:1,color:"#55d7ee"});
   const reference=window.ChartStudioIndicators.calculate("keltner",bars,{period:3,atrPeriod:2,multiplier:1}).keltner;
   const initial=engine.readDataWindow(bars.at(-1).time).indicators.find(item=>item.id==="keltner-main");
   const changed={...bars.at(-1),high:40,low:10,close:25};engine.updateLast(changed);
   const updated=engine.readDataWindow(changed.time).indicators.find(item=>item.id==="keltner-main"),updatedReference=window.ChartStudioIndicators.calculate("keltner",[...bars.slice(0,-1),changed],{period:3,atrPeriod:2,multiplier:1}).keltner.middle.at(-1).value;
   let badMultiplierRejected=false;try{engine.addKeltner({id:"keltner-bad",period:3,atrPeriod:2,multiplier:10.15,color:"#ffffff"})}catch(_){badMultiplierRejected=true}
   engine.changeAccount("at026-other");const isolated=engine.readDataWindow(changed.time).indicators?.length??0;
   engine.destroy();host.remove();return {initial:initial?.value,expected:reference.middle.at(-1).value,updated:updated?.value,updatedReference,badMultiplierRejected,isolated};
  });
  const atrBandsProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at029-native-atr-bands"),bars=[
    {time:1700062000,open:9,high:11,low:9,close:10},{time:1700062060,open:10,high:12,low:10,close:12},
    {time:1700062120,open:12,high:16,low:12,close:13},{time:1700062180,open:14,high:17,low:14,close:15}
   ];
   engine.setCandles(bars);
   const apiAvailable=typeof engine.addAtrBands==="function"&&typeof engine.updateAtrBands==="function"&&typeof engine.removeAtrBands==="function"&&typeof engine.atrBandsOptions==="function";
   if(!apiAvailable){engine.destroy();host.remove();return {apiAvailable}}
   let defaultsAccepted=false,defaultOptions=null;try{engine.addAtrBands({id:"atr-bands-defaults",color:"#55d7ee"});defaultOptions=engine.atrBandsOptions("atr-bands-defaults");defaultsAccepted=defaultOptions.period===20&&defaultOptions.atrPeriod===14&&defaultOptions.multiplier===2;engine.removeAtrBands("atr-bands-defaults")}catch(_){}
   engine.addAtrBands({id:"atr-bands-main",period:2,atrPeriod:2,multiplier:2,color:"#55d7ee"});
   const reference=ChartStudioIndicators.calculate("atrBands",bars,{period:2,atrPeriod:2,multiplier:2}).atrBands,inspected=engine.inspect().atrBandsSeries.find(item=>item.id==="atr-bands-main");
   const initialMatches=["upper","middle","lower"].every(key=>inspected.lines[key].length===reference[key].length&&inspected.lines[key].every((point,index)=>point.time===reference[key][index].time&&Math.abs(point.value-reference[key][index].value)<1e-8));
   const middle=engine.readDataWindow(bars.at(-1).time).indicators.find(item=>item.id==="atr-bands-main-middle");
   const changed={...bars.at(-1),high:19,low:13,close:16};engine.updateLast(changed);
   const updated=engine.readDataWindow(changed.time).indicators.find(item=>item.id==="atr-bands-main-middle"),updatedReference=ChartStudioIndicators.calculate("atrBands",[...bars.slice(0,-1),changed],{period:2,atrPeriod:2,multiplier:2}).atrBands.middle.at(-1).value;
   const updatedSuccessfully=engine.updateAtrBands("atr-bands-main",{period:3,atrPeriod:2,multiplier:1,visible:false}),updatedValues=engine.inspect().atrBandsSeries.find(item=>item.id==="atr-bands-main"),updatedOptions=engine.atrBandsOptions("atr-bands-main");
   let badMultiplierRejected=false,badPatchRejected=false,badPeriodRejected=false,collisionRejected=false,keltnerCollisionRejected=false;try{engine.addAtrBands({id:"atr-bands-bad",period:2,atrPeriod:2,multiplier:10.15,color:"#ffffff"})}catch(_){badMultiplierRejected=true}
   try{engine.updateAtrBands("atr-bands-main",{atrPeriod:201})}catch(_){badPatchRejected=true}
   try{engine.addAtrBands({id:"atr-bands-bad-period",period:1,atrPeriod:2,multiplier:2,color:"#ffffff"})}catch(_){badPeriodRejected=true}
   try{engine.addPriceLevel({id:"atr-bands-main",price:12,color:"#ffffff"})}catch(_){collisionRejected=true}
   try{engine.addKeltner({id:"atr-bands-main",period:2,atrPeriod:2,multiplier:2,color:"#ffffff"})}catch(_){keltnerCollisionRejected=true}
   const rejectedPreserved=engine.atrBandsOptions("atr-bands-main").atrPeriod===2,removed=engine.removeAtrBands("atr-bands-main"),afterRemove=engine.readDataWindow(changed.time).indicators.some(item=>item.id.startsWith("atr-bands-main-"));
   engine.changeAccount("at029-other");const isolated=engine.inspect().atrBandsCount;
   engine.changeAccount("at029-capacity");for(let i=0;i<19;i++)engine.addAverage({id:`atr-band-cap-${i}`,color:"#aabbcc"},bars.map(bar=>({time:bar.time,value:bar.close})));
   engine.addAtrBands({id:"atr-bands-cap-last",period:2,atrPeriod:2,multiplier:2,color:"#ffffff"});let overLimitRejected=false;try{engine.addAverage({id:"atr-band-cap-over",color:"#ffffff"},bars.map(bar=>({time:bar.time,value:bar.close})))}catch(_){overLimitRejected=true}
   const combinedCount=engine.inspect().averageCount+engine.inspect().atrBandsCount;
   engine.destroy();host.remove();return {apiAvailable,defaultsAccepted,defaultOptions,initialMatches,middle:middle?.value,expected:reference.middle.at(-1).value,updated:updated?.value,updatedReference,updatedSuccessfully,updatedOptions,updatedVisibility:updatedValues.visible,badMultiplierRejected,badPatchRejected,badPeriodRejected,rejectedPreserved,collisionRejected,keltnerCollisionRejected,removed,afterRemove,isolated,overLimitRejected,combinedCount};
  });
  const bollingerProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at028-native-bollinger"),bars=Array.from({length:36},(_,i)=>{const close=2000+Math.sin(i/3)*4+i*.3;return {time:1700550000+i*60,open:close-.2,high:close+1,low:close-1,close}});
   engine.setCandles(bars);
   const apiAvailable=typeof engine.addBollinger==="function"&&typeof engine.updateBollinger==="function"&&typeof engine.removeBollinger==="function"&&typeof engine.bollingerOptions==="function";
   if(!apiAvailable){engine.destroy();host.remove();return {apiAvailable}}
   let defaultsAccepted=false,defaultOptions=null;try{engine.addBollinger({id:"bollinger-defaults",color:"#d0a0ff"});defaultOptions=engine.bollingerOptions("bollinger-defaults");defaultsAccepted=defaultOptions.period===20&&defaultOptions.stdDev===2;engine.removeBollinger("bollinger-defaults")}catch(_){}
   const matches=(rows,period=5,stdDev=1.5)=>{
    const reference=ChartStudioBeta.calculations.bollinger(rows,period,stdDev),native=engine.inspect().bollingerSeries.find(item=>item.id==="bollinger-main");
    const arraysMatch=["upper","middle","lower"].every(key=>native.lines[key].length===reference[key].length&&native.lines[key].every((point,index)=>point.time===reference[key][index].time&&Math.abs(point.value-reference[key][index].value)<1e-7));
    const readoutMatches=rows.every(bar=>{const actual=engine.readDataWindow(bar.time).indicators.find(item=>item.id==="bollinger-main"),expected=reference.middle.find(point=>point.time===bar.time);return expected?actual?.state==="AVAILABLE"&&Math.abs(actual.value-expected.value)<1e-7:actual?.state!=="AVAILABLE"});
    return arraysMatch&&readoutMatches;
   };
   engine.addBollinger({id:"bollinger-main",period:5,stdDev:1.5,color:"#b9a1ff"});
   const initialMatches=matches(bars),initialOptions=engine.bollingerOptions("bollinger-main"),initial=engine.inspect().bollingerSeries.find(item=>item.id==="bollinger-main");
   const noProjection=initial.lines.middle.length===bars.length-5+1&&initial.lines.middle[0].time===bars[4].time&&initial.lines.middle.at(-1).time===bars.at(-1).time;
   const replacement=bars.map(bar=>({...bar,open:bar.open+50,high:bar.high+50,low:bar.low+50,close:bar.close+50}));engine.setCandles(replacement);const historyMatches=matches(replacement);
   let changed={...replacement.at(-1),close:replacement.at(-1).close+8,high:replacement.at(-1).high+8};engine.updateLast(changed);let current=[...replacement.slice(0,-1),changed],formingMatches=matches(current);
   changed={...changed,close:changed.close-3,low:changed.low-2};engine.updateLast(changed);current=[...current.slice(0,-1),changed];const repeatedMatches=matches(current);
   const appended={time:current.at(-1).time+60,open:changed.close,high:changed.close+2,low:changed.close-1,close:changed.close+1};engine.updateLast(appended);current=[...current,appended];const appendMatches=matches(current);
   const updated=engine.updateBollinger("bollinger-main",{period:8,stdDev:2,color:"#63d8e8",visible:false,title:"BB custom"}),updatedMatches=matches(current,8,2),updatedOptions=engine.bollingerOptions("bollinger-main"),updatedSeries=engine.inspect().bollingerSeries.find(item=>item.id==="bollinger-main");
   let badPeriodRejected=false,badDeviationRejected=false,badPatchRejected=false,unknownOptionRejected=false,identityCollisionRejected=false;
   try{engine.addBollinger({id:"bollinger-bad-period",period:301,stdDev:2,color:"#ffffff"})}catch(_){badPeriodRejected=true}
   try{engine.addBollinger({id:"bollinger-bad-deviation",period:20,stdDev:10.15,color:"#ffffff"})}catch(_){badDeviationRejected=true}
   try{engine.updateBollinger("bollinger-main",{period:1})}catch(_){badPatchRejected=true}
   try{engine.addBollinger({id:"bollinger-unknown-option",period:20,stdDev:2,color:"#ffffff",forwardProjection:true})}catch(_){unknownOptionRejected=true}
   try{engine.addPriceLevel({id:"bollinger-main",price:2000,color:"#ffffff"})}catch(_){identityCollisionRejected=true}
   const rejectedPatchPreserved=engine.bollingerOptions("bollinger-main").period===8&&engine.bollingerOptions("bollinger-main").stdDev===2;
   const lineCount=updatedSeries.visible.length,logicalCount=engine.inspect().bollingerCount;
   const removed=engine.removeBollinger("bollinger-main"),afterRemove=engine.inspect().bollingerCount;
   engine.addBollinger({id:"bollinger-isolated",period:5,stdDev:2,color:"#ffffff"});engine.changeAccount("at028-other");const isolated=engine.readDataWindow(appended.time).indicators?.length??0;
   engine.changeAccount("at028-capacity");for(let i=0;i<19;i++)engine.addAverage({id:`bollinger-cap-${i}`,color:"#aabbcc"},bars.map(bar=>({time:bar.time,value:bar.close})));
   engine.addBollinger({id:"bollinger-cap-last",period:5,stdDev:2,color:"#ffffff"});let overLimitRejected=false;try{engine.addAverage({id:"bollinger-cap-over",color:"#ffffff"},bars.map(bar=>({time:bar.time,value:bar.close})))}catch(_){overLimitRejected=true}
   const combinedCount=engine.inspect().averageCount+engine.inspect().bollingerCount;
   engine.destroy();host.remove();return {apiAvailable,defaultsAccepted,defaultOptions,initialMatches,initialOptions,noProjection,historyMatches,formingMatches,repeatedMatches,appendMatches,updated,updatedMatches,updatedOptions,updatedSeriesVisible:updatedSeries.visible,logicalCount,lineCount,badPeriodRejected,badDeviationRejected,badPatchRejected,unknownOptionRejected,identityCollisionRejected,rejectedPatchPreserved,removed,afterRemove,isolated,overLimitRejected,combinedCount};
  });
  const linearRegressionProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at027-native-linear-regression"),bars=Array.from({length:24},(_,i)=>{const close=2100+i*.17+Math.sin(i/3)*1.7;return {time:1700600000+i*60,open:close-.3,high:close+1.1,low:close-1.2,close}});
   engine.setCandles(bars);
   const apiAvailable=typeof engine.addLinearRegression==="function"&&typeof engine.updateLinearRegression==="function"&&typeof engine.removeLinearRegression==="function"&&typeof engine.linearRegressionOptions==="function";
   if(!apiAvailable){engine.destroy();host.remove();return {apiAvailable}}
    const matches=(rows,period=5,multiplier=1.5)=>{
     const reference=ChartStudioIndicators.calculate("linearRegression",rows,{period,multiplier}).linearRegression,native=engine.inspect().linearRegressionSeries.find(item=>item.id==="regression-main");
     const arraysMatch=["upper","middle","lower"].every(key=>native.lines[key].length===reference[key].length&&native.lines[key].every((point,index)=>point.time===reference[key][index].time&&Math.abs(point.value-reference[key][index].value)<1e-9));
     const readoutMatches=rows.every(bar=>{const actual=engine.readDataWindow(bar.time).indicators.find(item=>item.id==="regression-main"),expected=reference.middle.find(point=>point.time===bar.time);return expected?actual?.state==="AVAILABLE"&&Math.abs(actual.value-expected.value)<1e-9:actual?.state!=="AVAILABLE"});
     return arraysMatch&&readoutMatches;
    };
    engine.addLinearRegression({id:"regression-main",period:5,multiplier:1.5,color:"#55d7ee"});
    const initialMatches=matches(bars),initialOptions=engine.linearRegressionOptions("regression-main"),initialInspection=engine.inspect(),nativeInitial=initialInspection.linearRegressionSeries.find(item=>item.id==="regression-main"),referenceInitial=ChartStudioIndicators.calculate("linearRegression",bars,{period:5,multiplier:1.5}).linearRegression;
    const nativeArraysMatch=["upper","middle","lower"].every(key=>nativeInitial.lines[key].length===referenceInitial[key].length&&nativeInitial.lines[key].every((point,index)=>point.time===referenceInitial[key][index].time&&Math.abs(point.value-referenceInitial[key][index].value)<1e-9));
    const helper=ChartStudioV5.calculateLinearRegressionChannel,perfect=helper(Array.from({length:5},(_,i)=>({time:1700601000+i*60,open:i+1,high:i+1,low:i+1,close:i+1})),5,2),residual=helper([{time:1,open:1,high:1,low:1,close:1},{time:2,open:2,high:2,low:2,close:2},{time:3,open:4,high:4,low:4,close:4}],3,2);
    const knownResidual=Math.abs(residual.middle[0]?.value-23/6)<1e-9&&Math.abs((residual.upper[0]?.value-residual.middle[0]?.value)-2/Math.sqrt(18))<1e-9;
    const noProjection=nativeInitial.lines.middle.length===bars.length-5+1&&nativeInitial.lines.middle.at(-1).time===bars.at(-1).time&&nativeInitial.lines.middle[0].time===bars[4].time;
    const logicalInstanceCount=initialInspection.linearRegressionCount,renderedLineCount=initialInspection.linearRegressionLineCount;
    const replacementBars=bars.map(bar=>({...bar,open:bar.open+30,high:bar.high+30,low:bar.low+30,close:bar.close+30}));engine.setCandles(replacementBars);const historyMatches=matches(replacementBars);
    const changed={...replacementBars.at(-1),close:replacementBars.at(-1).close+4,high:replacementBars.at(-1).high+4};engine.updateLast(changed);const changedBars=[...replacementBars.slice(0,-1),changed],formingMatches=matches(changedBars);
   const repeated={...changed,close:changed.close-2,low:changed.low-2};engine.updateLast(repeated);const repeatedBars=[...changedBars.slice(0,-1),repeated],repeatedMatches=matches(repeatedBars);
   const appended={...repeated,time:repeated.time+60,open:repeated.close,close:repeated.close+.4,high:repeated.close+1,low:repeated.close-.7};engine.updateLast(appended);const appendedBars=[...repeatedBars,appended],appendMatches=matches(appendedBars);
    const updateAccepted=engine.updateLinearRegression("regression-main",{period:7,multiplier:2.5,color:"#a78bfa"}),updatedOptions=engine.linearRegressionOptions("regression-main"),updatedMatches=matches(appendedBars,7,2.5);
    let badPeriodRejected=false,badMultiplierRejected=false,badPatchRejected=false,badOptionRejected=false,identityCollisionRejected=false;
   try{engine.addLinearRegression({id:"regression-bad-period",period:201,multiplier:2,color:"#ffffff"})}catch(_){badPeriodRejected=true}
   try{engine.updateLinearRegression("regression-main",{multiplier:2.55})}catch(_){badMultiplierRejected=true}
   try{engine.updateLinearRegression("regression-main",{unknown:true})}catch(_){badPatchRejected=true}
    try{engine.addLinearRegression({id:"regression-extra",period:5,multiplier:1,color:"#ffffff",unexpected:true})}catch(_){badOptionRejected=true}
    try{engine.addAverage({id:"regression-main",color:"#ffffff"},[])}catch(_){identityCollisionRejected=true}
   const rejectedPatchPreserved=JSON.stringify(engine.linearRegressionOptions("regression-main"))===JSON.stringify(updatedOptions);
    engine.updateLinearRegression("regression-main",{visible:false});const hidden=engine.linearRegressionOptions("regression-main")?.visible===false&&engine.inspect().linearRegressionSeries[0].visible.every(value=>value===false);engine.updateLinearRegression("regression-main",{visible:true});const shown=engine.inspect().linearRegressionSeries[0].visible.every(value=>value===true);
    const removed=engine.removeLinearRegression("regression-main"),countAfterRemoval=engine.inspect().linearRegressionCount;
     for(let i=0;i<19;i++)engine.addLinearRegression({id:`regression-${i}`,period:5,multiplier:1,color:"#55d7ee"});
     engine.addAverage({id:"regression-shared-slot",color:"#ffffff"},[]);
   let instanceLimitEnforced=false;try{engine.addLinearRegression({id:"regression-over-limit",period:5,multiplier:1,color:"#ffffff"})}catch(_){instanceLimitEnforced=true}
     const finalInspection=engine.inspect(),fullCount=finalInspection.linearRegressionCount,sharedAverageCount=finalInspection.averageCount;engine.changeAccount("at027-other");const accountCleared=engine.inspect().linearRegressionCount===0&&engine.inspect().averageCount===0,isolated=engine.readDataWindow(appended.time).indicators?.length??0;
     engine.destroy();host.remove();return {apiAvailable,initialMatches,initialOptions,logicalInstanceCount,renderedLineCount,nativeArraysMatch,knownResidual,perfectLine:perfect.upper.length===1&&perfect.upper[0].value===perfect.middle[0].value&&perfect.middle[0].value===perfect.lower[0].value,noProjection,historyMatches,formingMatches,repeatedMatches,appendMatches,updateAccepted,updatedOptions,updatedMatches,badPeriodRejected,badMultiplierRejected,badPatchRejected,badOptionRejected,identityCollisionRejected,rejectedPatchPreserved,hidden,shown,instanceLimitEnforced,fullCount,sharedAverageCount,accountCleared,isolated,removed,countAfterRemoval};
  });
  const ichimokuProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at027-native-ichimoku",{symbol:"XAUUSD",timeframe:"M15"}),bars=Array.from({length:24},(_,i)=>{const close=2200+Math.sin(i/3)*4+i*.13;return {time:1700600000+i*900,open:close-.3,high:close+1.1,low:close-1.2,close}});
   engine.setCandles(bars);const apiAvailable=typeof engine.addIchimoku==="function"&&typeof engine.updateIchimoku==="function"&&typeof engine.removeIchimoku==="function"&&typeof engine.ichimokuOptions==="function"&&typeof ChartStudioV5.calculateIchimoku==="function";
   if(!apiAvailable){engine.destroy();host.remove();return {apiAvailable}}
   const settings={tenkanPeriod:2,kijunPeriod:3,senkouBPeriod:4,displacement:2},reference=(rows,config=settings)=>ChartStudioIndicators.calculate("ichimoku",rows,{...config,timeframe:"M15"}).ichimoku;
   const matches=(rows,config=settings)=>{
    const expected=reference(rows,config),native=engine.inspect().ichimokuSeries.find(item=>item.id==="ichimoku-main");if(!native)return false;
    const keys=["tenkan","kijun","senkouA","senkouB","chikou"];
    return keys.every(key=>native.lines[key].length===expected[key].length&&native.lines[key].every((point,index)=>point.time===expected[key][index].time&&point.sourceTime===expected[key][index].sourceTime&&Math.abs(point.value-expected[key][index].value)<1e-9&&!!point.projected===!!expected[key][index].projected))&&
     rows.every(bar=>keys.every(key=>{const expectedPoint=expected[key].find(point=>point.sourceTime===bar.time),actual=engine.readDataWindow(bar.time).indicators.find(item=>item.id==="ichimoku-main:"+key);return expectedPoint?actual?.state==="AVAILABLE"&&Math.abs(actual.value-expectedPoint.value)<1e-9:actual?.state!=="AVAILABLE"}));
   };
   const cadence=ChartStudioV5.calculateIchimoku(bars,{...settings,timeframe:"M15"}),cadenceTable={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800},cadences=Object.entries(cadenceTable).every(([timeframe,seconds])=>{const value=ChartStudioV5.calculateIchimoku(bars,{...settings,timeframe}),last=value.senkouA.filter(point=>point.projected).at(-1);return !!last&&last.time===bars.at(-1).time+settings.displacement*seconds});
   engine.addIchimoku({id:"ichimoku-main",...settings,color:"#55d7ee"});const initialMatches=matches(bars),logicalCount=engine.inspect().ichimokuCount,options=engine.ichimokuOptions("ichimoku-main");
   let collisionRejected=false;try{engine.addAverage({id:"ichimoku-main",color:"#ffffff"},[])}catch(_){collisionRejected=true}
   let invalidRejected=false;try{engine.updateIchimoku("ichimoku-main",{displacement:201})}catch(_){invalidRejected=true}
   const rejectedPatchPreserved=JSON.stringify(engine.ichimokuOptions("ichimoku-main"))===JSON.stringify(options);
   const changed={...bars.at(-1),close:bars.at(-1).close+2,high:bars.at(-1).high+2};engine.updateLast(changed);const formingMatches=matches([...bars.slice(0,-1),changed]);
   const appended={...changed,time:changed.time+900,open:changed.close,high:changed.close+1,low:changed.close-1,close:changed.close+.4};engine.updateLast(appended);const appendMatches=matches([...bars.slice(0,-1),changed,appended]);
   const updated=engine.updateIchimoku("ichimoku-main",{tenkanPeriod:3,displacement:0,color:"#a78bfa"}),updatedMatches=matches([...bars.slice(0,-1),changed,appended],{tenkanPeriod:3,kijunPeriod:3,senkouBPeriod:4,displacement:0});
   const zeroDisplacement=updatedMatches&&engine.ichimokuOptions("ichimoku-main").displacement===0,removed=engine.removeIchimoku("ichimoku-main"),afterRemove=engine.inspect().ichimokuCount,isolated=engine.readDataWindow(appended.time).indicators.some(item=>item.id.startsWith("ichimoku-main:"));
   engine.addIchimoku({id:"ichimoku-limit",...settings,color:"#55d7ee"});for(let i=0;i<19;i++)engine.addAverage({id:"ichimoku-average-"+i,color:"#55d7ee"},[]);
   let overLimitRejected=false;try{engine.addAverage({id:"ichimoku-over-limit",color:"#ffffff"},[])}catch(_){overLimitRejected=true}
   const combinedCount=engine.inspect().ichimokuCount+engine.inspect().averageCount;
   engine.changeAccount("at027-native-ichimoku-other");const accountCleared=engine.inspect().ichimokuCount===0&&engine.inspect().averageCount===0;
   engine.destroy();host.remove();return {apiAvailable,initialMatches,logicalCount,options,cadences,collisionRejected,invalidRejected,rejectedPatchPreserved,formingMatches,appendMatches,updated,updatedMatches,zeroDisplacement,removed,afterRemove,isolated,overLimitRejected,combinedCount,accountCleared};
  });
  const pivotProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const account="at030-native-pivots",symbol="XAUUSD",engine=ChartStudioV5.createStudioV5(host,account,{symbol,timeframe:"M15"});
   const source=[{time:1699827200,open:100,high:110,low:90,close:105},{time:1699913600,open:105,high:115,low:95,close:110},{time:1700000000,open:110,high:120,low:100,close:115},{time:1700086400,open:115,high:125,low:105,close:120}];
   const bars=Array.from({length:24},(_,i)=>({time:1700000000+i*900,open:4100+i,high:4102+i,low:4098+i,close:4101+i}));engine.setCandles(bars);
   const apiAvailable=typeof ChartStudioV5.calculatePivotPoints==="function"&&typeof engine.addPivotPoints==="function"&&typeof engine.updatePivotPoints==="function"&&typeof engine.removePivotPoints==="function"&&typeof engine.pivotOptions==="function";
   if(!apiAvailable){engine.destroy();host.remove();return {apiAvailable}}
   const options={id:"pivots-main",color:"#f4d35e",account,symbol,basis:"D1",source:"MT5_VERIFIED",sourceWindow:{from:source[0].time,to:source.at(-1).time}};
   const match=rows=>{
    const expected=ChartStudioIndicators.math.pivotPoints(source,rows,"D1"),actual=engine.inspect().pivotSeries.find(item=>item.id===options.id);
    const keys=["p","r1","r2","r3","s1","s2","s3"];
    return !!actual&&keys.every(key=>actual.lines[key].length===expected.lines[key].length&&actual.lines[key].every((point,index)=>point.time===expected.lines[key][index].time&&point.sourceTime===expected.lines[key][index].sourceTime&&point.validFrom===expected.lines[key][index].validFrom&&point.validTo===expected.lines[key][index].validTo&&Math.abs(point.value-expected.lines[key][index].value)<1e-9))&&
     rows.every(bar=>keys.every(key=>{const expectedPoint=expected.lines[key].find(point=>point.time===bar.time),readout=engine.readDataWindow(bar.time).indicators.find(item=>item.id===options.id+":"+key);return expectedPoint?readout?.state==="AVAILABLE"&&Math.abs(readout.value-expectedPoint.value)<1e-9:readout?.state!=="AVAILABLE"}));
   };
   engine.addPivotPoints(options,source);const initialMatches=match(bars),count=engine.inspect().pivotCount,metadata=engine.pivotOptions(options.id);
   let accountRejected=false,symbolRejected=false,duplicateRejected=false;
   try{engine.addPivotPoints({...options,account:"other-account",id:"pivot-account-bad"},source)}catch(_){accountRejected=true}
   try{engine.addPivotPoints({...options,symbol:"XAUUSD.p",id:"pivot-symbol-bad"},source)}catch(_){symbolRejected=true}
   try{engine.addAverage({id:options.id,color:"#ffffff"},[])}catch(_){duplicateRejected=true}
   const changed={...bars.at(-1),close:bars.at(-1).close+2,high:bars.at(-1).high+2};engine.updateLast(changed);const formingMatches=match([...bars.slice(0,-1),changed]);
   const appended={...changed,time:changed.time+900,open:changed.close,high:changed.close+1,low:changed.close-1,close:changed.close+.4};engine.updateLast(appended);const appendMatches=match([...bars.slice(0,-1),changed,appended]);
   const changedSource=source.map(bar=>({...bar}));changedSource[2]={...changedSource[2],high:changedSource[2].high+2};const sourceUpdated=engine.updatePivotPoints(options.id,changedSource),sourceMatches=sourceUpdated&&engine.inspect().pivotSeries.find(item=>item.id===options.id).lines.p.at(-1).value===ChartStudioIndicators.math.pivotPoints(changedSource,[appended],"D1").lines.p[0].value;
   let wrongBasisRejected=false;try{engine.addPivotPoints({...options,id:"pivot-basis-bad",basis:"M15"},source)}catch(_){wrongBasisRejected=true}
   const removed=engine.removePivotPoints(options.id),afterRemove=engine.inspect().pivotCount;
   engine.addPivotPoints({...options,id:"pivots-account-cleanup"},source);engine.changeAccount("at030-native-pivots-other");const accountCleared=engine.inspect().pivotCount===0;
   engine.destroy();host.remove();return {apiAvailable,initialMatches,count,metadata,accountRejected,symbolRejected,duplicateRejected,formingMatches,appendMatches,sourceUpdated,sourceMatches,wrongBasisRejected,removed,afterRemove,accountCleared};
  });
  assert.equal(pivotProbe.apiAvailable,true);assert.equal(pivotProbe.initialMatches,true);assert.equal(pivotProbe.count,1);assert.equal(pivotProbe.metadata.source,"MT5_VERIFIED");assert.equal(pivotProbe.metadata.basis,"D1");
  assert.equal(pivotProbe.accountRejected,true);assert.equal(pivotProbe.symbolRejected,true);assert.equal(pivotProbe.duplicateRejected,true);assert.equal(pivotProbe.formingMatches,true);assert.equal(pivotProbe.appendMatches,true);assert.equal(pivotProbe.sourceUpdated,true);assert.equal(pivotProbe.sourceMatches,true);assert.equal(pivotProbe.wrongBasisRejected,true);assert.equal(pivotProbe.removed,true);assert.equal(pivotProbe.afterRemove,0);assert.equal(pivotProbe.accountCleared,true);
  const autoFibonacciProbe=await page.evaluate(()=>{
   const pairs=[[10,8],[9,7],[12,4],[14,8],[15,9],[20,12],[18,10],[17,11],[16,10]],rows=pairs.map(([high,low],index)=>({time:1701000000+index*900,open:(high+low)/2,high,low,close:(high+low)/2})),asOf=rows[7].time+900;
   if(typeof ChartStudioV5.calculateAutoFibonacci!=="function")return {available:false};
   const native=ChartStudioV5.calculateAutoFibonacci(rows,"M15",asOf),beta=ChartStudioIndicators.math.autoFibonacci(rows,"M15",asOf),keys=["0","0.236","0.382","0.5","0.618","0.786","1"];
   const parity=native.available===beta.available&&native.algorithmVersion===beta.algorithmVersion&&native.source===beta.source&&native.direction===beta.direction&&native.confirmedAt===beta.confirmedAt&&JSON.stringify(native.start)===JSON.stringify(beta.start)&&JSON.stringify(native.end)===JSON.stringify(beta.end)&&keys.every(key=>native.lines[key].ratio===beta.lines[key].ratio&&native.lines[key].value===beta.lines[key].value&&JSON.stringify(native.lines[key].points)===JSON.stringify(beta.lines[key].points));
   const downRows=pairs.map(([high,low],index)=>{const nextHigh=60-low,nextLow=60-high;return {time:1702000000+index*900,open:(nextHigh+nextLow)/2,high:nextHigh,low:nextLow,close:(nextHigh+nextLow)/2}}),downAsOf=downRows[7].time+900,down=ChartStudioV5.calculateAutoFibonacci(downRows,"M15",downAsOf),downBeta=ChartStudioIndicators.math.autoFibonacci(downRows,"M15",downAsOf);
   const withFuture=[...rows,{time:asOf+1800,open:20,high:21,low:19,close:20}],future=ChartStudioV5.calculateAutoFibonacci(withFuture,"M15",asOf);
   const noProjection=ChartStudioV5.calculateAutoFibonacci(rows.slice(0,8),"M15",asOf);
   return {available:true,parity,up:native.direction==="UP"&&native.lines["0.5"].value===12&&native.lines["0"].points[0].time===rows[8].time,noLookahead:!ChartStudioV5.calculateAutoFibonacci(rows,"M15",rows[7].time+899).available,malformed:!ChartStudioV5.calculateAutoFibonacci([...rows].reverse(),"M15",asOf).available,downParity:down.direction==="DOWN"&&down.lines["0.5"].value===48&&JSON.stringify(down.lines)===JSON.stringify(downBeta.lines),invalidTimeframe:!ChartStudioV5.calculateAutoFibonacci(rows,"M13",asOf).available,futureExcluded:future.lines["0"].points.at(-1).time===rows[8].time,noProjection:!noProjection.available&&noProjection.reason==="NO_POST_CONFIRMATION_CANDLES"&&noProjection.start!==null&&noProjection.end!==null,settings:native.algorithmVersion};
  });
  assert.equal(autoFibonacciProbe.available,true,"Native v5 must expose the transparent Auto-Fibonacci calculator");
  assert.equal(autoFibonacciProbe.parity,true,"Native v5 Auto-Fibonacci values, anchors and timestamps match the Beta reference");
  assert.equal(autoFibonacciProbe.up,true);assert.equal(autoFibonacciProbe.noLookahead,true);assert.equal(autoFibonacciProbe.malformed,true);assert.equal(autoFibonacciProbe.downParity,true);assert.equal(autoFibonacciProbe.invalidTimeframe,true);assert.equal(autoFibonacciProbe.futureExcluded,true);assert.equal(autoFibonacciProbe.noProjection,true,"a confirmed swing without a post-confirmation candle is unavailable instead of rendering seven empty series");
  const oscillatorProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:420px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"at001-native-oscillator",{symbol:"XAUUSD",timeframe:"M5"});
   const bars=Array.from({length:180},(_,i)=>{const c=2200+Math.sin(i/4)*5+i*.07;return {time:1710000000+i*300,open:c-.4,high:c+1+Math.sin(i)*.1,low:c-1-Math.cos(i)*.1,close:c}});
   engine.setCandles(bars);
   const specs=[
    {id:"rsi-a",kind:"rsi",settings:{period:14},color:"#44aadd"},
    {id:"rsi-b",kind:"rsi",settings:{period:9},color:"#dd4488",lineWidth:3},
    {id:"atr-a",kind:"atr",settings:{period:14},color:"#a68eff"},
    {id:"macd-a",kind:"macd",settings:{fast:12,slow:26,signal:9},color:"#55d7ee"},
    {id:"adx-a",kind:"adx",settings:{period:14},color:"#e9bc72"},
    {id:"stochastic-a",kind:"stochastic",settings:{period:14,smoothK:3,smoothD:3},color:"#50c8ee"},
    {id:"cci-a",kind:"cci",settings:{period:20},color:"#a995ff"}
   ];
   for(const spec of specs)engine.addOscillator(spec);
   let drawingCollisionRejected=false;try{engine.addPriceLevel({id:"rsi-a",price:bars.at(-1).close,color:"#ffffff"})}catch(_){drawingCollisionRejected=true}
   let averageCollisionRejected=false;try{engine.addAverage({id:"rsi-a",color:"#ffffff"},[])}catch(_){averageCollisionRejected=true}
   let paneLineCollisionRejected=false;try{engine.addPaneLine({id:"rsi-a",color:"#ffffff"},[])}catch(_){paneLineCollisionRejected=true}
   const expected=Object.fromEntries(specs.map(spec=>[spec.id,window.ChartStudioIndicators.calculate(spec.kind,bars,spec.settings)]));
   const references={};
   for(const spec of specs){const values=expected[spec.id],components=Object.keys(values);references[spec.id]={};for(const component of components){const item=values[component].find(point=>point.time===bars.at(-1).time);references[spec.id][component]=item?.value??null}}
   const panes=engine.inspect(),before=specs.map(x=>engine.oscillatorOptions(x.id));
   engine.updateOscillator("rsi-a",{settings:{period:21},color:"#33ccaa"});
   const updatedRsi=window.ChartStudioIndicators.calculate("rsi",bars,{period:21}).rsi.find(point=>point.time===bars.at(-1).time);
   references["rsi-a"].rsi=updatedRsi?.value??null;
   const after=specs.map(x=>engine.oscillatorOptions(x.id)),row=engine.readDataWindow(bars.at(-1).time).indicators;
   const paneCount=engine.inspect().paneCount;
   engine.moveOscillator("macd-a",1);
   const movedMacdPane={paneCount:engine.inspect().paneCount,logicalPaneCount:engine.inspect().oscillatorPaneCount,layout:engine.oscillatorPaneLayout()};
   let badOrderRejected=false;try{engine.addOscillator({id:"bad-order",kind:"macd",settings:{fast:26,slow:12,signal:9}})}catch(_){badOrderRejected=true}
   let badPeriodRejected=false;try{engine.addOscillator({id:"bad-period",kind:"rsi",settings:{period:1}})}catch(_){badPeriodRejected=true}
   let badStochasticRejected=false;try{engine.addOscillator({id:"bad-stochastic",kind:"stochastic",settings:{period:14,smoothK:101,smoothD:3},color:"#ffffff"})}catch(_){badStochasticRejected=true}
   let badCciRejected=false;try{engine.addOscillator({id:"bad-cci",kind:"cci",settings:{period:201},color:"#ffffff"})}catch(_){badCciRejected=true}
   let extraCciSettingRejected=false;try{engine.addOscillator({id:"extra-cci",kind:"cci",settings:{period:20,smoothK:3},color:"#ffffff"})}catch(_){extraCciSettingRejected=true}
   const atomicCount=engine.inspect().oscillatorCount;
   engine.removeOscillator("rsi-b");const afterOneRemoval=engine.inspect().oscillatorCount;
   engine.changeAccount("other");const isolated=engine.inspect();engine.destroy();host.remove();
   const limitHost=document.createElement("div");limitHost.style.cssText="width:400px;height:300px;position:fixed;left:-2000px;top:0";document.body.append(limitHost);
   const limitEngine=ChartStudioV5.createStudioV5(limitHost,"oscillator-pane-limit");limitEngine.setCandles(bars);for(let i=0;i<8;i++)limitEngine.addOscillator({id:`pane-limit-${i}`,kind:"rsi",settings:{period:14},color:"#ffffff"});
   let paneLimitRejected=false;try{limitEngine.addOscillator({id:"pane-limit-over",kind:"cci",settings:{period:20},color:"#ffffff"})}catch(_){paneLimitRejected=true}
   const paneLimitCount=limitEngine.inspect().oscillatorCount;limitEngine.destroy();limitHost.remove();
   const updateHost=document.createElement("div");updateHost.style.cssText="width:400px;height:300px;position:fixed;left:-2000px;top:0";document.body.append(updateHost);
   const updateEngine=ChartStudioV5.createStudioV5(updateHost,"oscillator-update");updateEngine.setCandles(bars);for(const spec of specs)updateEngine.addOscillator(spec);
   let adapterRows=[...bars];
   const updateAdapterBar=(bar)=>{updateEngine.updateLast(bar);adapterRows=bar.time===adapterRows.at(-1).time?[...adapterRows.slice(0,-1),bar]:[...adapterRows,bar]};
   const referenceAt=(spec,rows,time)=>{const result=window.ChartStudioIndicators.calculate(spec.kind,rows,spec.settings);return Object.fromEntries(Object.entries(result).map(([key,points])=>[key,points.find(point=>point.time===time)?.value??null]))};
   const closeReadout=(actual,expected)=>{const byId=new Map(actual.map(item=>[item.id,item]));for(const spec of specs){const reference=expected[spec.id],components=Object.keys(reference);for(const component of components){const item=byId.get(spec.id+":"+component);if(reference[component]===null){if(item?.state==="AVAILABLE")return false}else if(!item||item.state!=="AVAILABLE"||Math.abs(item.value-reference[component])>1e-8)return false}}return true};
   const historicalTime=bars[120].time,readoutAt=(time)=>updateEngine.readDataWindow(time).indicators;
   updateAdapterBar({...adapterRows.at(-1),close:adapterRows.at(-1).close+.4,high:adapterRows.at(-1).high+.5});
   updateAdapterBar({...adapterRows.at(-1),close:adapterRows.at(-1).close-.2,low:adapterRows.at(-1).low-.3});
   let updatedReadout=readoutAt(adapterRows.at(-1).time),updatedReferences=specs.map(spec=>({id:spec.id,values:referenceAt(spec,adapterRows,adapterRows.at(-1).time)}));
   const repeatedFormingReadoutMatches=closeReadout(updatedReadout,Object.fromEntries(updatedReferences.map(item=>[item.id,item.values]))),historicalReadoutSurvivesUpdate=closeReadout(readoutAt(historicalTime),Object.fromEntries(specs.map(spec=>[spec.id,referenceAt(spec,adapterRows,historicalTime)])));
   updateAdapterBar({...adapterRows.at(-1),time:adapterRows.at(-1).time+300,open:adapterRows.at(-1).close,close:adapterRows.at(-1).close+.7,high:adapterRows.at(-1).close+1.1,low:adapterRows.at(-1).close-.5});
   updatedReadout=readoutAt(adapterRows.at(-1).time);updatedReferences=specs.map(spec=>({id:spec.id,values:referenceAt(spec,adapterRows,adapterRows.at(-1).time)}));
   const appendedReadoutMatches=closeReadout(updatedReadout,Object.fromEntries(updatedReferences.map(item=>[item.id,item.values])));
   updateEngine.updateOscillator("rsi-a",{settings:{period:21}});const settingsReference=referenceAt({...specs[0],settings:{period:21}},adapterRows,adapterRows.at(-1).time),settingsReadout=readoutAt(adapterRows.at(-1).time).find(item=>item.id==="rsi-a:rsi");
   const settingsRebuildMatches=settingsReference.rsi===null?settingsReadout?.state!=="AVAILABLE":settingsReadout?.state==="AVAILABLE"&&Math.abs(settingsReadout.value-settingsReference.rsi)<1e-8;
   const replacement=adapterRows.map(bar=>({...bar,open:bar.open+50,high:bar.high+50,low:bar.low+50,close:bar.close+50}));updateEngine.setCandles(replacement);const replacementReadout=readoutAt(replacement.at(-1).time),replacementReferences=Object.fromEntries(specs.map(spec=>[spec.id,referenceAt(spec.id==="rsi-a"?{...spec,settings:{period:21}}:spec,replacement,replacement.at(-1).time)]));
   const replacementReadoutMatches=closeReadout(replacementReadout,replacementReferences),replacementHistoricalMatches=closeReadout(readoutAt(historicalTime),Object.fromEntries(specs.map(spec=>[spec.id,referenceAt(spec.id==="rsi-a"?{...spec,settings:{period:21}}:spec,replacement,historicalTime)])));
   updateEngine.destroy();updateHost.remove();
   const flatHost=document.createElement("div");flatHost.style.cssText="width:400px;height:300px;position:fixed;left:-2000px;top:0";document.body.append(flatHost);
   const flatEngine=ChartStudioV5.createStudioV5(flatHost,"oscillator-flat");const flatBars=Array.from({length:40},(_,i)=>({time:1711000000+i*300,open:100,high:100,low:100,close:100}));flatEngine.setCandles(flatBars);
   for(const spec of [{id:"flat-rsi",kind:"rsi",settings:{period:14}},{id:"flat-atr",kind:"atr",settings:{period:14}},{id:"flat-adx",kind:"adx",settings:{period:14}},{id:"flat-stoch",kind:"stochastic",settings:{period:3,smoothK:2,smoothD:2}},{id:"flat-cci",kind:"cci",settings:{period:3}}])flatEngine.addOscillator({...spec,color:"#ffffff"});
   const flatRow=flatEngine.readDataWindow(flatBars.at(-1).time).indicators,flatWarmup=flatEngine.readDataWindow(flatBars[1].time).indicators;flatEngine.destroy();flatHost.remove();
  return {references,panes,before,after,row,paneCount,movedMacdPane,badOrderRejected,badPeriodRejected,badStochasticRejected,badCciRejected,extraCciSettingRejected,atomicCount,afterOneRemoval,isolated,paneLimitRejected,paneLimitCount,updatedReadout,updatedReferences,repeatedFormingReadoutMatches,historicalReadoutSurvivesUpdate,appendedReadoutMatches,settingsRebuildMatches,replacementReadoutMatches,replacementHistoricalMatches,flatRow,flatWarmup,drawingCollisionRejected,averageCollisionRejected,paneLineCollisionRejected};
  });
  const volumeFlowProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:500px;height:320px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"volume-flow-parity",{symbol:"XAUUSD",timeframe:"M15"});
   const bars=Array.from({length:48},(_,i)=>{const close=2000+Math.sin(i/3)*4+i*.13;return {time:1712500000+i*900,open:close-.2,high:close+.8,low:close-.7,close,tick_volume:100+i*7,real_volume:i%3===0?0:10+i}});
   engine.setCandles(bars);engine.addOscillator({id:"obv-probe",kind:"obv",settings:{},color:"#55deaa"});
   engine.addOscillator({id:"mfi-probe",kind:"mfi",settings:{period:14},color:"#e9bc72"});
   const read=rows=>{const time=rows.at(-1).time;return Object.fromEntries(engine.readDataWindow(time).indicators.map(item=>[item.id,{value:item.value,state:item.state}]))};
   const compare=rows=>{const actual=read(rows),obv=ChartStudioIndicators.calculate("obv",rows,{}).obv.at(-1).value,mfi=ChartStudioIndicators.calculate("mfi",rows,{period:14}).mfi.at(-1).value;return {obv:actual["obv-probe:obv"]?.value,mfi:actual["mfi-probe:mfi"]?.value,expectedObv:obv,expectedMfi:mfi}};
   const initial=compare(bars),changed={...bars.at(-1),close:bars.at(-1).close+1.4,high:bars.at(-1).high+1.4,real_volume:0};engine.updateLast(changed);
   const changedBars=[...bars.slice(0,-1),changed],forming=compare(changedBars),changedAgain={...changed,close:changed.close-.6,low:changed.low-.6,tick_volume:777};engine.updateLast(changedAgain);
   const repeatedBars=[...bars.slice(0,-1),changedAgain],repeatedForming=compare(repeatedBars),next={...changedAgain,time:changedAgain.time+900,open:changedAgain.close,close:changedAgain.close+1,high:changedAgain.close+1.4,low:changedAgain.close-.5,real_volume:40};engine.updateLast(next);
   const appended=compare([...repeatedBars,next]);let badPeriodRejected=false;
   try{engine.updateOscillator("mfi-probe",{settings:{period:201}})}catch(_){badPeriodRejected=true}
   const settings=engine.oscillatorOptions("mfi-probe").settings;engine.destroy();host.remove();
   return {initial,forming,repeatedForming,appended,badPeriodRejected,settings};
  });
  for(const state of [volumeFlowProbe.initial,volumeFlowProbe.forming,volumeFlowProbe.repeatedForming,volumeFlowProbe.appended]){
   assert.ok(Math.abs(state.obv-state.expectedObv)<1e-8,"Native OBV matches Beta with real-volume/tick-volume fallback");
   assert.ok(Math.abs(state.mfi-state.expectedMfi)<1e-8,"Native MFI matches Beta with real-volume/tick-volume fallback");
  }
  assert.equal(volumeFlowProbe.badPeriodRejected,true,"Native MFI enforces period bounds");
  assert.equal(volumeFlowProbe.settings.period,14,"Rejected native MFI settings leave the prior configuration intact");
  const momentumRocProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:420px;height:280px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const bars=Array.from({length:40},(_,i)=>{const close=100+Math.sin(i/4)*3+i*.2;return {time:1712000000+i*300,open:close-.2,high:close+.8,low:close-.7,close}});
   let engine=ChartStudioV5.createStudioV5(host,"momentum-roc-scope",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(bars);
   engine.addOscillator({id:"momentum-one",kind:"momentum",settings:{period:10},color:"#55d7ee"});
   engine.addOscillator({id:"roc-one",kind:"roc",settings:{period:10},color:"#f3c56a"});
   const count=engine.inspect().oscillatorCount,last=engine.readDataWindow(bars.at(-1).time).indicators;
   const options={momentum:engine.oscillatorOptions("momentum-one"),roc:engine.oscillatorOptions("roc-one")};
   engine.updateOscillator("momentum-one",{settings:{period:5}});
   const updated=engine.oscillatorOptions("momentum-one");let invalidPeriodRejected=false,extraSettingsRejected=false;
   try{engine.updateOscillator("roc-one",{settings:{period:201}})}catch(_){invalidPeriodRejected=true}
   try{engine.addOscillator({id:"bad-mode",kind:"momentum",settings:{period:10,mode:"roc"},color:"#ffffff"})}catch(_){extraSettingsRejected=true}
   engine.destroy();
   engine=ChartStudioV5.createStudioV5(host,"momentum-roc-scope",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(bars);
   const restored={count:engine.inspect().oscillatorCount,momentum:engine.oscillatorOptions("momentum-one"),roc:engine.oscillatorOptions("roc-one")};
   engine.changeAccount("other");const isolated=engine.inspect().oscillatorCount;engine.destroy();host.remove();
   const zeroBars=[0,1,2,3].map((close,i)=>({time:1713000000+i*60,open:close,high:close+1,low:close-1,close}));
   const stream=ChartStudioV5.createIncrementalOscillator(zeroBars,"roc",{period:2});
   return {count,last,options,updated,invalidPeriodRejected,extraSettingsRejected,restored,isolated,
    momentumReference:bars.at(-1).close-bars.at(-11).close,
    rocReference:(bars.at(-1).close/bars.at(-11).close-1)*100,
    zeroDenominatorRoc:stream.snapshot().roc};
  });
  const incrementalOscillatorProbe=await page.evaluate(()=>{
   const factory=ChartStudioV5.createIncrementalOscillator;
   if(typeof factory!=="function")return {available:false,mismatches:[]};
   const specs=[
    {kind:"rsi",settings:{period:14}},
    {kind:"atr",settings:{period:14}},
    {kind:"macd",settings:{fast:12,slow:26,signal:9}},
    {kind:"adx",settings:{period:14}},
    {kind:"stochastic",settings:{period:14,smoothK:3,smoothD:3}},
    {kind:"stochrsi",settings:{period:14,stochPeriod:14,smoothK:3,smoothD:3}},
    {kind:"cci",settings:{period:20}},
    {kind:"momentum",settings:{period:10}},
    {kind:"roc",settings:{period:10}}
   ];
   const original=Array.from({length:240},(_,i)=>{const close=2000+Math.sin(i/7)*8+i*.04;return {time:1715000000+i*300,open:close-.2,high:close+1+Math.cos(i/5)*.2,low:close-1-Math.sin(i/9)*.2,close}});
   const mismatches=[];
   const compare=(kind,settings,stream,rows)=>{
    const expected=window.ChartStudioIndicators.calculate(kind,rows,settings),actual=stream.snapshot();
    for(const key of Object.keys(expected)){
     const a=actual[key]??[],e=expected[key]??[];
     if(a.length!==e.length){mismatches.push(`${kind}/${key}:length ${a.length}/${e.length}`);continue}
     for(let i=0;i<e.length;i++)if(a[i].time!==e[i].time||Math.abs(a[i].value-e[i].value)>1e-8||a[i].color!==e[i].color){mismatches.push(`${kind}/${key}:point ${i}`);break}
    }
   };
   for(const spec of specs){
    const stream=factory(original,spec.kind,spec.settings);let rows=[...original];
    for(const [step,delta] of [["forming-a",.31],["forming-b",-.22]]){
     const prev=rows.at(-1),next={...prev,close:prev.close+delta,high:prev.high+Math.abs(delta)*.8,low:prev.low-Math.abs(delta)*.5};
     stream.updateLast(next);rows=[...rows.slice(0,-1),next];compare(spec.kind,spec.settings,stream,rows);
    }
    const prev=rows.at(-1),next={...prev,time:prev.time+300,open:prev.close,close:prev.close+.7,high:prev.close+1.1,low:prev.close-.5};
    stream.updateLast(next);rows=[...rows,next];compare(spec.kind,spec.settings,stream,rows);
   }
   const boundedBars=Array.from({length:150000},(_,i)=>({time:1600000000+i*60,open:100,high:101,low:99,close:100}));
   const boundedStream=factory(boundedBars,"rsi",{period:14}),boundedBefore=boundedStream.snapshot().rsi.length;
   let capacityRejected=false;try{boundedStream.updateLast({time:boundedBars.at(-1).time+60,open:100,high:101,low:99,close:100})}catch(error){capacityRejected=/history limit/i.test(error.message)}
   const boundedAfter=boundedStream.snapshot().rsi.length;
   return {available:true,mismatches,capacityRejected,boundedBefore,boundedAfter};
  });
  assert.equal(incrementalOscillatorProbe.available,true,"Native oscillator updates expose the incremental calculation stream");
  assert.deepEqual(incrementalOscillatorProbe.mismatches,[],"Incremental RSI/ATR/MACD/ADX/Stochastic/CCI snapshots match the beta after repeated forming bars and a new bar");
  assert.equal(incrementalOscillatorProbe.capacityRejected,true,"Incremental oscillator history cannot grow past the chart history budget");
  assert.equal(incrementalOscillatorProbe.boundedAfter,incrementalOscillatorProbe.boundedBefore,"A rejected history append leaves the oscillator snapshot unchanged");
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
  const measurementWritesBefore=writes.length;
  const measurementProbe=await page.evaluate(async()=>{
   const host=document.createElement("div");host.style.cssText="width:800px;height:360px";document.body.append(host);
   let engine=ChartStudioV5.createStudioV5(host,"measurement-contract",{symbol:"XAUUSD",timeframe:"M15"});
   const bars=Array.from({length:12},(_,i)=>{const close=2000+i*2;return {time:1705000000+i*900,open:close,high:close+1,low:close-1,close,tick_volume:10+i}});
   engine.setCandles(bars);
   const recordedMeasurementLabels=[],originalFillText=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(typeof text==="string"&&text.includes("bars")&&text.includes("%"))recordedMeasurementLabels.push(text);return originalFillText.call(this,text,...args)};
   const options={id:"measure-contract",startTime:bars[3].time,startPrice:bars[3].close,endTime:bars[8].time,endPrice:bars[8].close+5,color:"#f7c774"};
   engine.addMeasurement(options);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));CanvasRenderingContext2D.prototype.fillText=originalFillText;const renderedLabel=recordedMeasurementLabels.find(text=>text.includes("+15.00")&&text.includes("+0.75%")&&text.includes("5 bars"))||null;const readout=engine.measurementReadout(options.id),position=engine.drawingPosition(options.id),start=engine.drawingAnchorPosition(options.id,"START");
   const beforeInvalid=engine.inspect().nativePrimitives;let invalidRejected=false;try{engine.addMeasurement({...options,id:"measure-invalid",endTime:bars[8].time+1})}catch(_){invalidRejected=true}const invalidCountStable=engine.inspect().nativePrimitives===beforeInvalid;
   const original=engine.readDrawing(options.id),portable=engine.exportDrawings();engine.updateMeasurement(options.id,{endPrice:options.endPrice+1});const updatedReadout=engine.measurementReadout(options.id);engine.updateMeasurement(options.id,{endPrice:options.endPrice});const removeApi=engine.removeMeasurement(options.id),removeRead=engine.readDrawing(options.id),removeUndo=engine.undo(),removeRestored=engine.readDrawing(options.id);engine.redo();engine.addMeasurement(options);const afterInvalid=beforeInvalid===engine.inspect().nativePrimitives;const undo=engine.undo(),undoRemoved=engine.readDrawing(options.id)===null;const redo=engine.redo(),redoRestored=engine.readDrawing(options.id);
   engine.destroy();host.remove();
   const reloadHost=document.createElement("div");reloadHost.style.cssText="width:800px;height:360px";document.body.append(reloadHost);
   engine=ChartStudioV5.createStudioV5(reloadHost,"measurement-contract",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(bars);const privateReload=engine.readDrawing(options.id);engine.destroy();reloadHost.remove();
   const transferHost=document.createElement("div");transferHost.style.cssText="width:800px;height:360px";document.body.append(transferHost);
   engine=ChartStudioV5.createStudioV5(transferHost,"measurement-other",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(bars);const portableImport=engine.importDrawings(portable),portableRestored=engine.readDrawing(options.id);let mismatchRejected=false,mismatch=null;const mismatchHost=document.createElement("div");mismatchHost.style.cssText="width:400px;height:200px";document.body.append(mismatchHost);try{mismatch=ChartStudioV5.createStudioV5(mismatchHost,"measurement-mismatch",{symbol:"EURUSD",timeframe:"H1"});mismatch.setCandles(bars);mismatch.importDrawings(portable)}catch(_){mismatchRejected=true}finally{mismatch?.destroy();mismatchHost.remove()}
   const accountIsolated=portableRestored?.id===options.id&&portableImport.imported===1;engine.destroy();transferHost.remove();
   return {readout,position,start,renderedLabel,beforeInvalid,invalidRejected,invalidCountStable,afterInvalid,original,updatedReadout,removeApi,removeRead,removeUndo,removeRestored,undo,undoRemoved,redo,redoRestored,accountIsolated,privateReload,mismatchRejected};
  });
  assert.equal(measurementProbe.readout.priceDelta,15);
  assert.equal(measurementProbe.readout.percentChange,15/2006*100);
  assert.equal(measurementProbe.readout.bars,5);
  assert.ok(measurementProbe.position&&measurementProbe.start);
  assert.ok(measurementProbe.renderedLabel,"Measurement text is rendered into the native canvas");
  assert.equal(measurementProbe.invalidRejected,true);
  assert.equal(measurementProbe.invalidCountStable,true,"Invalid measurement is rejected atomically with no drawing-count change");
  assert.equal(measurementProbe.afterInvalid,true);
  assert.equal(measurementProbe.undo,true);
  assert.equal(measurementProbe.updatedReadout.priceDelta,16);
  assert.equal(measurementProbe.removeApi,true);
  assert.equal(measurementProbe.removeRead,null);
  assert.equal(measurementProbe.removeUndo,true);
  assert.deepEqual(measurementProbe.removeRestored,measurementProbe.original);
  assert.equal(measurementProbe.undoRemoved,true);
  assert.equal(measurementProbe.redo,true);
  assert.deepEqual(measurementProbe.redoRestored,measurementProbe.original);
  assert.equal(measurementProbe.accountIsolated,true);
  assert.deepEqual(measurementProbe.privateReload,measurementProbe.original,"Private measurement survives scoped reload");
  assert.equal(measurementProbe.mismatchRejected,true,"Portable transfer rejects symbol/timeframe mismatch");
  assert.equal(writes.length,measurementWritesBefore,"Measurement lifecycle does not issue any broker/MT5 writes");
  assert.equal(result.first.version,"5.2.1");
  const expectedPanZoomRanges=[[300,700],[400,530],[420,520]];
  assert.equal(panZoom.measurements.length,expectedPanZoomRanges.length);
  panZoom.measurements.forEach((item,index)=>{
    const [expectedFrom,expectedTo]=expectedPanZoomRanges[index];
    assert.ok(Math.abs(item.range.from-expectedFrom)<1e-9&&Math.abs(item.range.to-expectedTo)<1e-9,
      `The chart traverses requested pan/zoom window ${index+1}: ${JSON.stringify(item.range)}`);
  });
  assert.deepEqual(timezoneProbe.before,["00:30+00","01:30+00","00:30+00","01:30+00"]);
  assert.deepEqual(timezoneProbe.after,["01:30+01","03:30+02","02:30+02","02:30+01"],"DST skips the missing spring hour and distinguishes repeated autumn local time by UTC offset");
  assert.deepEqual(timezoneProbe.afterInvalid,timezoneProbe.after,"An invalid IANA timezone change is atomic");
  assert.equal(timezoneProbe.invalidRejected,true);
  assert.equal(timezoneProbe.timezoneAfterInvalid,"Europe/Berlin");
  assert.notEqual(timezoneProbe.crosshairAfter,timezoneProbe.crosshairBefore,"Crosshair time formatting follows the selected display timezone");
  assert.deepEqual(timezoneProbe.markerAfter,timezoneProbe.markerBefore,"Changing display timezone preserves drawing pixel position");
  assert.deepEqual(timezoneProbe.storedAfter,timezoneProbe.storedBefore,"Changing display timezone preserves the exact UTC anchor");
  assert.equal(timezoneProbe.readoutAfter.timeUtc,timezoneProbe.readoutBefore.timeUtc,"Readout UTC timestamps never shift with display timezone");
  assert.equal(paneResizeSetup.paneCount,2,"RSI is isolated in a native pane below price");
  assert.equal(paneResizeSetup.heights.length,2);
  assert.ok(paneResizeAfter[0]<paneResizeSetup.heights[0]-20,`Dragging the native separator shrinks the price pane (${JSON.stringify({before:paneResizeSetup.heights,after:paneResizeAfter,xy:[paneResizeSetup.x,paneResizeSetup.y]})})`);
  assert.ok(paneResizeAfter[1]>paneResizeSetup.heights[1]+20,"Dragging the native separator expands the RSI pane");
  assert.deepEqual(movingAverageProbe.independent.slice(0,2).map(x=>x.id),["ema-close","ema-high"]);
  assert.equal(donchianProbe.row.value,16,"The native Donchian overlay exposes its middle channel in the data window");
  assert.equal(donchianProbe.updated.value,18,"Forming-bar updates recalculate all Donchian boundaries");
  assert.equal(donchianProbe.badPeriodRejected,true);
  assert.equal(donchianProbe.isolated,0,"Changing account clears Donchian readouts");
  assert.equal(keltnerProbe.initial,keltnerProbe.expected,"The native Keltner channel matches beta EMA/ATR semantics");
  assert.equal(keltnerProbe.updated,keltnerProbe.updatedReference,"Forming-bar updates recalculate Keltner boundaries");
  assert.equal(keltnerProbe.badMultiplierRejected,true);
  assert.equal(keltnerProbe.isolated,0,"Changing account clears Keltner readouts");
  assert.equal(atrBandsProbe.apiAvailable,true,"Native v5 exposes the grouped ATR Bands overlay API");
  assert.equal(atrBandsProbe.defaultsAccepted,true,"Native ATR Bands use the documented 20 / 14 × 2 defaults");
  assert.equal(atrBandsProbe.initialMatches,true,"Native ATR Bands match the shared SMA/Wilder-ATR formula at every timestamp");
  assert.equal(atrBandsProbe.middle,atrBandsProbe.expected);
  assert.equal(atrBandsProbe.updated,atrBandsProbe.updatedReference,"Forming updates replace the ATR Bands value without look-ahead");
  assert.equal(atrBandsProbe.updatedSuccessfully,true);
  assert.equal(atrBandsProbe.updatedOptions.atrPeriod,2);
  assert.equal(atrBandsProbe.updatedOptions.multiplier,1);
  assert.deepEqual(atrBandsProbe.updatedVisibility,[false,false,false]);
  assert.equal(atrBandsProbe.badMultiplierRejected,true);
  assert.equal(atrBandsProbe.badPatchRejected,true);
  assert.equal(atrBandsProbe.badPeriodRejected,true);
  assert.equal(atrBandsProbe.rejectedPreserved,true,"Invalid patches leave the active ATR Bands unchanged");
  assert.equal(atrBandsProbe.collisionRejected,true);
  assert.equal(atrBandsProbe.keltnerCollisionRejected,true,"Keltner cannot reuse an ATR Bands identity");
  assert.equal(atrBandsProbe.removed,true);
  assert.equal(atrBandsProbe.afterRemove,false,"Removing ATR Bands clears its readout values");
  assert.equal(atrBandsProbe.isolated,0,"Account changes clear native ATR Bands instances");
  assert.equal(atrBandsProbe.overLimitRejected,true,"ATR Bands count as one logical item in the shared indicator limit");
  assert.equal(atrBandsProbe.combinedCount,20);
  assert.equal(bollingerProbe.apiAvailable,true,"Native v5 exposes the Bollinger overlay API");
  assert.equal(bollingerProbe.defaultsAccepted,true,"Native Bollinger defaults match the Beta settings");
  assert.equal(bollingerProbe.initialMatches,true,"All native Bollinger bands and readout values match Beta population-deviation semantics");
  assert.equal(bollingerProbe.initialOptions.period,5);
  assert.equal(bollingerProbe.noProjection,true,"Bollinger bands start after a full lookback and do not project forward");
  assert.equal(bollingerProbe.historyMatches,true);
  assert.equal(bollingerProbe.formingMatches,true);
  assert.equal(bollingerProbe.repeatedMatches,true);
  assert.equal(bollingerProbe.appendMatches,true);
  assert.equal(bollingerProbe.updated,true);
  assert.equal(bollingerProbe.updatedMatches,true);
  assert.equal(bollingerProbe.updatedOptions.stdDev,2);
  assert.deepEqual(bollingerProbe.updatedSeriesVisible,[false,false,false]);
  assert.equal(bollingerProbe.logicalCount,1);
  assert.equal(bollingerProbe.lineCount,3);
  assert.equal(bollingerProbe.badPeriodRejected,true);
  assert.equal(bollingerProbe.badDeviationRejected,true);
  assert.equal(bollingerProbe.badPatchRejected,true);
  assert.equal(bollingerProbe.unknownOptionRejected,true);
  assert.equal(bollingerProbe.identityCollisionRejected,true);
  assert.equal(bollingerProbe.rejectedPatchPreserved,true);
  assert.equal(bollingerProbe.removed,true);
  assert.equal(bollingerProbe.afterRemove,0);
  assert.equal(bollingerProbe.isolated,0,"Changing account clears Bollinger readouts");
  assert.equal(bollingerProbe.overLimitRejected,true);
  assert.equal(bollingerProbe.combinedCount,20);
  assert.equal(ichimokuProbe.apiAvailable,true,"Native v5 exposes Ichimoku formulas and grouped overlay APIs");
  assert.equal(ichimokuProbe.initialMatches,true,"All Ichimoku components, source times, projections and data-window values match Beta");
  assert.equal(ichimokuProbe.logicalCount,1,"Five Ichimoku lines count as one shared indicator instance");
  assert.equal(ichimokuProbe.cadences,true,"Tail projections use the explicit fixed cadence for every supported timeframe");
  assert.equal(ichimokuProbe.collisionRejected,true);
  assert.equal(ichimokuProbe.invalidRejected,true);
  assert.equal(ichimokuProbe.rejectedPatchPreserved,true,"Invalid Ichimoku updates leave the active overlay unchanged");
  assert.equal(ichimokuProbe.formingMatches,true);
  assert.equal(ichimokuProbe.appendMatches,true);
  assert.equal(ichimokuProbe.updated,true);
  assert.equal(ichimokuProbe.updatedMatches,true);
  assert.equal(ichimokuProbe.zeroDisplacement,true);
  assert.equal(ichimokuProbe.removed,true);
  assert.equal(ichimokuProbe.afterRemove,0);
  assert.equal(ichimokuProbe.isolated,false,"Removing Ichimoku clears every component readout");
  assert.equal(ichimokuProbe.overLimitRejected,true);
  assert.equal(ichimokuProbe.combinedCount,20);
  assert.equal(ichimokuProbe.accountCleared,true,"Changing account removes the complete Ichimoku group");
  assert.equal(linearRegressionProbe.apiAvailable,true,"Native v5 exposes the regression channel overlay API");
  assert.equal(linearRegressionProbe.initialMatches,true,"Native v5 regression middle values match the Beta OLS reference");
   assert.equal(linearRegressionProbe.nativeArraysMatch,true,"Native upper, middle and lower series match Beta OLS values and timestamps");
   assert.equal(linearRegressionProbe.knownResidual,true,"The channel uses residual population deviation times the multiplier");
   assert.equal(linearRegressionProbe.perfectLine,true,"A perfect linear series has zero channel width");
   assert.equal(linearRegressionProbe.noProjection,true,"The channel starts after full lookback and never projects beyond loaded candles");
   assert.equal(linearRegressionProbe.logicalInstanceCount,1,"Three native lines count as one logical indicator instance");
   assert.equal(linearRegressionProbe.renderedLineCount,3,"The channel renders upper, middle and lower native series");
   assert.equal(linearRegressionProbe.historyMatches,true,"Replacing chart history refreshes all channel series and readouts");
  assert.equal(linearRegressionProbe.formingMatches,true,"Replacing the forming bar updates the regression channel");
  assert.equal(linearRegressionProbe.repeatedMatches,true,"Repeated forming-bar updates replace the same regression values");
  assert.equal(linearRegressionProbe.appendMatches,true,"Appending a candle advances the native regression channel");
  assert.equal(linearRegressionProbe.updatedMatches,true,"Updated period and width match Beta OLS values");
  assert.equal(linearRegressionProbe.badPeriodRejected,true);
  assert.equal(linearRegressionProbe.badMultiplierRejected,true);
  assert.equal(linearRegressionProbe.badPatchRejected,true);
   assert.equal(linearRegressionProbe.badOptionRejected,true);
   assert.equal(linearRegressionProbe.identityCollisionRejected,true);
  assert.equal(linearRegressionProbe.rejectedPatchPreserved,true,"Rejected changes preserve the valid regression configuration");
  assert.equal(linearRegressionProbe.hidden,true,"Native regression series expose visibility updates");
   assert.equal(linearRegressionProbe.shown,true);
   assert.equal(linearRegressionProbe.updateAccepted,true);
  assert.equal(linearRegressionProbe.instanceLimitEnforced,true,"Regression overlays count against the shared indicator limit");
   assert.equal(linearRegressionProbe.fullCount,19);
   assert.equal(linearRegressionProbe.sharedAverageCount,1,"One regression overlay shares the cap with one ordinary average");
  assert.equal(linearRegressionProbe.accountCleared,true,"Changing account removes prior regression series");
  assert.equal(linearRegressionProbe.isolated,0);
  assert.equal(linearRegressionProbe.removed,true);
  assert.equal(linearRegressionProbe.countAfterRemoval,0);
  assert.equal(movingAverageProbe.independent[0].value,12.125,"EMA close instance uses its own source and period");
  assert.equal(movingAverageProbe.independent[1].value,32.5,"EMA high instance uses its own source and display shift");
  assert.equal(movingAverageProbe.edited.find(x=>x.id==="ema-close").value,movingAverageProbe.editedExpected,"Editing one EMA period/source leaves its instance isolated");
  assert.equal(movingAverageProbe.edited.find(x=>x.id==="ema-high").value,132.5,"Editing one EMA leaves the second instance unchanged");
  assert.ok(Math.abs(movingAverageProbe.forming.find(x=>x.id==="ema-close").value-movingAverageProbe.formingExpected)<1e-10,"Forming-bar updates recalculate the managed average");
  for(const id of ["ema20-close","ema20-high"]){
   const actual=movingAverageProbe.nativeRows[25].find(x=>x.id===id).value;
   assert.ok(Math.abs(actual-movingAverageProbe.ema20Reference[id][25])<1e-10,`${id} matches its independent period-20 calculation`);
  }
  assert.notEqual(movingAverageProbe.ema20Reference["ema20-close"][25],movingAverageProbe.ema20Reference["ema20-high"][25]);
  assert.equal(movingAverageProbe.ema20Styles[0].color,"#18cdef");
  assert.equal(movingAverageProbe.ema20Styles[0].lineWidth,1);
  assert.equal(movingAverageProbe.ema20Styles[1].color,"#e531a9");
  assert.equal(movingAverageProbe.ema20Styles[1].lineWidth,4);
  assert.equal(movingAverageProbe.editedEma20Style.color,"#39d6aa");
  assert.equal(movingAverageProbe.editedEma20Style.lineWidth,3);
  assert.equal(movingAverageProbe.ema20Edited.find(x=>x.id==="ema20-high").value,movingAverageProbe.nativeRows[25].find(x=>x.id==="ema20-high").value,
   "Editing one EMA-20 leaves the other EMA-20 unchanged");
  assert.equal(movingAverageProbe.ema20Edited.find(x=>x.id==="ema20-close").value,movingAverageProbe.ema20EditedExpected,
   "Edited EMA-20 recalculates its changed source, period and shift");
  assert.equal(movingAverageProbe.reloaded.find(x=>x.id==="ema20-close").value,movingAverageProbe.replacementExpected,
   "Replacing the candle history recalculates managed averages from the new history");
  assert.deepEqual(movingAverageProbe.matrixMismatches,[],"All MA types, OHLC sources and display-shift directions match production beta calculations");
  assert.equal(oscillatorProbe.panes.oscillatorCount,7,"Each configured oscillator is one logical indicator even when it owns multiple native series");
  assert.equal(momentumRocProbe.count,2,"Momentum and ROC each create one native pane instance");
  assert.equal(momentumRocProbe.options.momentum.settings.period,10);
  assert.equal(momentumRocProbe.options.roc.settings.period,10);
  assert.equal(momentumRocProbe.updated.settings.period,5,"Momentum period edits rebuild the active series");
  assert.equal(momentumRocProbe.invalidPeriodRejected,true);
  assert.equal(momentumRocProbe.extraSettingsRejected,true,"Native settings reject unknown ROC modes");
  assert.equal(momentumRocProbe.restored.count,2,"Both oscillator instances survive a scoped native chart reload");
  assert.equal(momentumRocProbe.restored.momentum.settings.period,5);
  assert.equal(momentumRocProbe.restored.roc.settings.period,10);
  assert.equal(momentumRocProbe.isolated,0,"Account changes clear Momentum and ROC instances");
  const momentumAtLast=momentumRocProbe.last.find(item=>item.id==="momentum-one:momentum");
  const rocAtLast=momentumRocProbe.last.find(item=>item.id==="roc-one:roc");
  assert.equal(momentumAtLast.state,"AVAILABLE");assert.equal(rocAtLast.state,"AVAILABLE");
  assert.ok(Math.abs(momentumAtLast.value-momentumRocProbe.momentumReference)<1e-8);
  assert.ok(Math.abs(rocAtLast.value-momentumRocProbe.rocReference)<1e-8);
  assert.equal(momentumRocProbe.zeroDenominatorRoc.length,1,"ROC skips the undefined zero-denominator sample");
  assert.equal(momentumRocProbe.zeroDenominatorRoc[0].value,200);
  assert.equal(oscillatorProbe.panes.oscillatorPaneCount,7);
  assert.equal(oscillatorProbe.paneCount,8,"MACD and Stochastic components share their native panes");
  assert.equal(oscillatorProbe.movedMacdPane.paneCount,7,"Moving the MACD group into an existing native pane collapses its prior pane");
  assert.equal(oscillatorProbe.movedMacdPane.logicalPaneCount,6,"Diagnostics count distinct oscillator panes after a group move");
  for(const title of ["MACD","Signal","Histogram"])assert.ok(oscillatorProbe.movedMacdPane.layout[1].titles.includes(title),`${title} moves with the MACD group into one pane`);
  assert.equal(oscillatorProbe.badOrderRejected,true);
  assert.equal(oscillatorProbe.badPeriodRejected,true);
  assert.equal(oscillatorProbe.badStochasticRejected,true);
  assert.equal(oscillatorProbe.badCciRejected,true);
  assert.equal(oscillatorProbe.extraCciSettingRejected,true);
  assert.equal(oscillatorProbe.drawingCollisionRejected,true,"Native drawing IDs cannot collide with oscillator instances");
  assert.equal(oscillatorProbe.averageCollisionRejected,true,"Overlay IDs cannot collide with oscillator instances");
  assert.equal(oscillatorProbe.paneLineCollisionRejected,true,"Pane line IDs cannot collide with oscillator instances");
  assert.equal(oscillatorProbe.atomicCount,7,"Rejected oscillator options do not create partial groups");
  assert.equal(oscillatorProbe.afterOneRemoval,6,"Removing one oscillator removes its whole group only");
  assert.equal(oscillatorProbe.paneLimitRejected,true,"A ninth logical oscillator pane is rejected");
  assert.equal(oscillatorProbe.paneLimitCount,8,"Rejected ninth pane leaves all eight existing groups intact");
  assert.equal(oscillatorProbe.repeatedFormingReadoutMatches,true,"The adapter readout follows repeated same-candle oscillator replacements");
  assert.equal(oscillatorProbe.historicalReadoutSurvivesUpdate,true,"Incremental oscillator updates retain correct historical readouts");
  assert.equal(oscillatorProbe.appendedReadoutMatches,true,"The adapter readout advances when a new candle is appended");
  assert.equal(oscillatorProbe.settingsRebuildMatches,true,"Changing oscillator settings rebuilds the readout from current candle history");
  assert.equal(oscillatorProbe.replacementReadoutMatches,true,"Replacing candle history rebuilds every oscillator readout");
  assert.equal(oscillatorProbe.replacementHistoricalMatches,true,"History replacement also recalculates retained historical readouts");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-rsi:rsi").value,50,"Flat RSI uses beta's neutral value");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-atr:atr").value,0,"Zero true range yields zero ATR");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-adx:adx").value,0,"Flat directional movement yields zero ADX");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-stoch:stochK").value,50,"Flat Stochastic range uses a neutral value");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-stoch:stochD").value,50,"Flat Stochastic smoothing remains neutral");
  assert.equal(oscillatorProbe.flatRow.find(row=>row.id==="flat-cci:cci").value,0,"Flat CCI has a neutral zero deviation value");
  assert.equal(oscillatorProbe.flatWarmup.find(row=>row.id==="flat-cci:cci").state,"WARMUP_OR_MISSING","CCI readout stays unavailable until its full period exists");
  assert.equal(oscillatorProbe.flatWarmup.find(row=>row.id==="flat-rsi:rsi").state,"WARMUP_OR_MISSING");
  assert.equal(oscillatorProbe.after[0].settings.period,21);
  assert.equal(oscillatorProbe.after[0].color,"#33ccaa");
  assert.equal(oscillatorProbe.after[1].settings.period,9,"Editing one RSI leaves the second RSI settings independent");
  assert.equal(oscillatorProbe.after[1].color,"#dd4488");
  for(const [id,components] of Object.entries(oscillatorProbe.references))for(const [component,value] of Object.entries(components)){
   const actual=oscillatorProbe.row.find(item=>item.id===id+":"+component)?.value??null;
   if(value===null)assert.equal(actual,null,`${id}/${component} beta warm-up is preserved`);
   else assert.ok(Math.abs(actual-value)<1e-8,`${id}/${component} matches beta at the exact UTC candle`);
  }
  for(const item of oscillatorProbe.updatedReferences)for(const [component,expected] of Object.entries(item.values)){
   const actual=oscillatorProbe.updatedReadout.find(row=>row.id===item.id+":"+component)?.value??null;
   if(expected===null)assert.equal(actual,null);else assert.ok(Math.abs(actual-expected)<1e-8,`${item.id}/${component} forming-bar update matches beta`);
  }
  assert.equal(oscillatorProbe.isolated.oscillatorCount,0,"Account changes clear all scoped oscillator instances");
  assert.equal(movingAverageProbe.badPeriodRejected,true);
  for(const type of movingAverageProbe.extraTypes){
   for(let i=0;i<movingAverageProbe.reference[type].length;i++){
    const actual=movingAverageProbe.nativeRows[i].find(x=>x.id===`ma-${type}`).value;
    const expected=movingAverageProbe.reference[type][i];
    if(expected===null)assert.equal(actual,null,`${type} warm-up remains unavailable at ${i}`);
    else assert.ok(Math.abs(actual-expected)<1e-10,`${type} matches the production beta calculation at ${i}`);
   }
  }
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
  assert.deepEqual(result.multiSelect,["risk-stop","entry-time"]);
  assert.deepEqual(result.selectedTogether,["risk-stop","entry-time"]);
  assert.deepEqual(result.groupHidden,["risk-stop","entry-time"]);
  assert.deepEqual(result.hiddenReadings,[false,false]);
  assert.deepEqual(result.groupLocked,["risk-stop","entry-time"]);
  assert.deepEqual(result.lockedReadings,[true,true]);
  assert.deepEqual(result.keyboardHidden,[false,false]);
  assert.deepEqual(result.keyboardLocked,[true,true]);
  assert.deepEqual(result.nudgeSelection,["nudge-time-a","nudge-time-b"],"A successful group nudge retains the selection");
  assert.deepEqual(result.nudgeMoved.map(item=>item.time),result.nudgeBefore.map(item=>item.time+900),"ArrowRight nudges every selected time anchor by one loaded candle");
  assert.deepEqual(result.nudgeUndo,[true,true]);assert.deepEqual(result.nudgeRestored.map(item=>item.time),result.nudgeBefore.map(item=>item.time));
  assert.deepEqual(result.nudgeRedo,[true,true]);assert.deepEqual(result.nudgeRepeated.map(item=>item.time),result.nudgeMoved.map(item=>item.time));
  assert.equal(result.mixedAfter.time.time,result.mixedBefore.time.time+900,"A mixed selection shifts its time anchor horizontally");assert.equal(result.mixedAfter.price.price,result.mixedBefore.price.price,"A price-only drawing ignores horizontal movement");
  assert.equal(result.mixedUndo,true);assert.deepEqual(result.mixedRestored,result.mixedBefore);
  assert.deepEqual(result.verticalAfter.map(item=>item.price).map((price,index)=>price>result.verticalBefore[index].price),[true,true],"ArrowUp moves every selected price anchor upward");
  result.verticalPositionsAfter.forEach((position,index)=>assert.ok(Math.abs(position.y-(result.verticalPositionsBefore[index].y-1))<0.1,"Vertical group movement applies the same pixel delta"));
  assert.deepEqual(result.verticalUndo,[true,true]);assert.deepEqual(result.verticalRestored.map(item=>item.price),result.verticalBefore.map(item=>item.price));assert.deepEqual(result.verticalRedo,[true,true]);
  const compositeTimeKeys=[["startTime","endTime","offsetTime"],["startTime","endTime","thirdTime"]];
  result.compositeAfter.forEach((drawing,index)=>{for(const key of compositeTimeKeys[index])assert.equal(drawing[key],result.compositeBefore[index][key]+900,`${drawing.id} shifts every time anchor by one candle`)});
  result.compositeAfter.forEach((drawing,index)=>{const priceKeys=index===0?["startPrice","endPrice","offsetPrice"]:["startPrice","endPrice","thirdPrice"];for(const key of priceKeys)assert.equal(drawing[key],result.compositeBefore[index][key],`${drawing.id} leaves every price anchor unchanged`)});
  assert.deepEqual(result.compositeUndo,[true,true]);assert.deepEqual(result.compositeRestored,result.compositeBefore,"Composite multi-anchor drawings undo back to their full original geometry");
  assert.deepEqual(result.compositeRedo,[true,true]);assert.deepEqual(result.compositeRepeated,result.compositeAfter,"Composite multi-anchor drawings redo to their full shifted geometry");
  assert.deepEqual(result.lockedNudgeAfter,result.lockedNudgeBefore,"A locked selected member rejects the whole keyboard nudge");
  assert.deepEqual(result.boundaryNudgeAfter,result.boundaryNudgeBefore,"An out-of-range selected anchor rejects the whole keyboard nudge");
  assert.deepEqual(result.capacityAfter,result.capacityBefore,"A group larger than the 100-entry history bound is rejected without moving drawings");
  assert.deepEqual(result.toggledSelection,["risk-stop"]);
  assert.deepEqual(result.selectedAfterToggle,["risk-stop"]);
  assert.equal(result.unknownSelectionRejected,true);
  assert.deepEqual(result.selectionAfterRejected,["risk-stop"]);
  assert.equal(result.groupDeleteAvailable,true,"The native renderer exposes multi-selection deletion");
  assert.deepEqual(result.groupDeleteIds,["risk-stop","entry-time"]);
  assert.deepEqual(result.groupDeleteRemoved,[null,null]);
  assert.deepEqual(result.groupDeleteSelection,[]);
  assert.deepEqual(result.groupDeleteUndo,[true,true]);
  assert.ok(result.groupDeleteRestored.every(Boolean));
  assert.deepEqual(result.groupDeleteRedo,[true,true]);
  assert.deepEqual(result.groupDeleteRedone,[null,null]);
  assert.deepEqual(result.keyboardGroupDelete,[null,null],"Delete removes every selected native drawing");
  assert.deepEqual(result.keyboardGroupDeleteSelection,[]);
  assert.deepEqual(result.keyboardGroupDeleteUndo,[true,true]);
  assert.deepEqual(result.keyboardGroupBackspace,[null,null],"Backspace removes every selected native drawing");
  assert.deepEqual(result.keyboardGroupBackspaceUndo,[true,true]);
  const groupDuplicate=await page.evaluate(()=>{
   const rows=Array.from({length:80},(_,i)=>{const p=4000+i*.5;return {time:1700200000+i*900,open:p,high:p+2,low:p-2,close:p+1}});
   const host=document.createElement("div");host.id="group-duplicate-host";host.style.cssText="width:800px;height:400px";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"groupduplicate",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(rows);
   engine.addPriceLevel({id:"copy-price",price:4030,color:"#ffaa66"});engine.addTimeMarker({id:"copy-time",time:rows[20].time,color:"#38bdf8"});
   engine.addMeasurement({id:"copy-measure",startTime:rows[20].time,startPrice:4010,endTime:rows[25].time,endPrice:4020,color:"#a78bfa"});
   engine.selectDrawings(["copy-price","copy-time","copy-measure"]);
   const apiAvailable=typeof engine.duplicateSelectedDrawings==="function";
   const apiIds=apiAvailable?engine.duplicateSelectedDrawings():[];
   const apiCopies=apiIds.map(id=>engine.readDrawing(id));
   const apiKinds=JSON.parse(engine.exportDrawings()).drawings.filter(item=>apiIds.includes(item.options.id)).map(item=>item.kind);
   const apiSelection=engine.inspect().selectedDrawingIds;
   const apiUndo=apiAvailable?apiIds.map(()=>engine.undo()):[];
   const apiUndoRemoved=apiIds.map(id=>engine.readDrawing(id));
   const apiRedo=apiAvailable?apiIds.map(()=>engine.redo()):[];
   const apiRedoRestored=apiIds.map(id=>engine.readDrawing(id));
   if(apiAvailable){apiIds.forEach(()=>engine.undo())}engine.selectDrawings(["copy-price","copy-time","copy-measure"]);
   host.dispatchEvent(new KeyboardEvent("keydown",{key:"d",ctrlKey:true,bubbles:true}));
   const keyboardSelection=engine.inspect().selectedDrawingIds,keyboardCopies=keyboardSelection.map(id=>engine.readDrawing(id));
   const keyboardKinds=JSON.parse(engine.exportDrawings()).drawings.filter(item=>keyboardSelection.includes(item.options.id)).map(item=>item.kind);
   const keyboardUndo=keyboardSelection.map(()=>engine.undo()),keyboardUndoRemoved=keyboardSelection.map(id=>engine.readDrawing(id));
   engine.destroy();host.remove();
   return {apiAvailable,apiIds,apiCopies,apiKinds,apiSelection,apiUndo,apiUndoRemoved,apiRedo,apiRedoRestored,keyboardSelection,keyboardCopies,keyboardKinds,keyboardUndo,keyboardUndoRemoved};
  });
  assert.equal(groupDuplicate.apiAvailable,true,"The native renderer exposes multi-selection duplication");
  assert.equal(groupDuplicate.apiIds.length,3);
  assert.deepEqual(groupDuplicate.apiKinds,["PRICE","TIME","MEASURE"]);
  assert.deepEqual(groupDuplicate.apiCopies.map(item=>item.price??item.time??item.startPrice),[4030,1700200000+20*900,4010]);
  assert.deepEqual(groupDuplicate.apiCopies.map(item=>item.color),["#ffaa66","#38bdf8","#a78bfa"]);
  assert.deepEqual(groupDuplicate.apiSelection,groupDuplicate.apiIds);
  assert.deepEqual(groupDuplicate.apiUndo,[true,true,true]);
  assert.deepEqual(groupDuplicate.apiUndoRemoved,[null,null,null]);
  assert.deepEqual(groupDuplicate.apiRedo,[true,true,true]);
  assert.ok(groupDuplicate.apiRedoRestored.every(Boolean));
  assert.equal(groupDuplicate.keyboardSelection.filter(id=>!['copy-price','copy-time','copy-measure'].includes(id)).length,3,"Ctrl+D duplicates all selected native drawings");
  assert.deepEqual(groupDuplicate.keyboardKinds,["PRICE","TIME","MEASURE"]);
  assert.deepEqual(groupDuplicate.keyboardCopies.map(item=>item.price??item.time??item.startPrice),[4030,1700200000+20*900,4010]);
  assert.deepEqual(groupDuplicate.keyboardCopies.map(item=>item.color),["#ffaa66","#38bdf8","#a78bfa"]);
  assert.deepEqual(groupDuplicate.keyboardUndo,[true,true,true]);
  assert.deepEqual(groupDuplicate.keyboardUndoRemoved,[null,null,null]);
  const groupDuplicateLimit=await page.evaluate(()=>{
   const rows=Array.from({length:40},(_,i)=>{const p=4000+i;return {time:1700300000+i*900,open:p,high:p+2,low:p-2,close:p+1}});
   const host=document.createElement("div");host.style.cssText="width:800px;height:400px";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"groupduplicatelimit",{symbol:"XAUUSD",timeframe:"M15"});engine.setCandles(rows);
   for(let i=0;i<997;i++)engine.addPriceLevel({id:`filler-${i}`,price:4001+i,color:"#64748b"});
   engine.addPriceLevel({id:"limit-price",price:4100,color:"#ffaa66"});engine.addTimeMarker({id:"limit-time",time:rows[20].time,color:"#38bdf8"});
   const before=engine.inspect().nativePrimitives;engine.selectDrawings(["limit-price","limit-time"]);
   let rejected=false;try{engine.duplicateSelectedDrawings()}catch(_){rejected=true}
   const after=engine.inspect().nativePrimitives,priceCopy=engine.readDrawing("limit-price-copy1"),timeCopy=engine.readDrawing("limit-time-copy1");
   engine.destroy();host.remove();return {before,after,rejected,priceCopy,timeCopy};
  });
  assert.equal(groupDuplicateLimit.before,999);
  assert.equal(groupDuplicateLimit.rejected,true);
  assert.equal(groupDuplicateLimit.after,999,"A group duplicate at the native capacity limit leaves no partial copies");
  assert.equal(groupDuplicateLimit.priceCopy,null);
  assert.equal(groupDuplicateLimit.timeCopy,null);
  assert.deepEqual(result.isolated.selectedDrawingIds,[]);
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
   e.addEllipse({id:"visual-ellipse",startTime:rows[70].time,startPrice:rows[70].close+15,endTime:rows[82].time,endPrice:rows[82].close+8,color:"#f472b6"});
   e.addChannel({id:"visual-channel",startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[42].time,endPrice:rows[42].close+8,offsetTime:rows[32].time,offsetPrice:rows[32].close+14,color:"#38bdf8"});
   e.showVolume(true);window.__v5Screenshot=e;
   return {drawing:e.readDrawing("visual-channel"),start:e.drawingAnchorPosition("visual-channel","START"),end:e.drawingAnchorPosition("visual-channel","END"),offset:e.drawingAnchorPosition("visual-channel","OFFSET"),position:e.drawingPosition("visual-channel"),transfer:JSON.parse(e.exportDrawings())};
  });
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().nativePrimitives),7);
  const ellipseProbe=await page.evaluate(()=>({drawing:window.__v5Screenshot.readDrawing("visual-ellipse"),start:window.__v5Screenshot.drawingAnchorPosition("visual-ellipse","START"),end:window.__v5Screenshot.drawingAnchorPosition("visual-ellipse","END"),exported:JSON.parse(window.__v5Screenshot.exportDrawings()).drawings.some(item=>item.kind==="ELLIPSE"&&item.options.id==="visual-ellipse")}));
  assert.deepEqual([ellipseProbe.drawing.startTime,ellipseProbe.drawing.endTime],[1700100000+70*900,1700100000+82*900]);
  assert.ok(ellipseProbe.start&&ellipseProbe.end,"Ellipse exposes both UTC/price anchor coordinates");
  assert.equal(ellipseProbe.exported,true,"Ellipse is included in portable drawing transfer");
  const ellipseBeforeDrag=ellipseProbe.drawing;
  await page.mouse.move(ellipseProbe.start.x,ellipseProbe.start.y);await page.mouse.down();await page.mouse.move(ellipseProbe.start.x+70,ellipseProbe.start.y-35,{steps:4});await page.mouse.up();
  const ellipseAfterDrag=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-ellipse"));
  assert.notEqual(ellipseAfterDrag.startTime,ellipseBeforeDrag.startTime,"Dragging the ellipse start handle snaps it to a loaded candle");
  assert.equal(ellipseAfterDrag.endTime,ellipseBeforeDrag.endTime,"Ellipse drag keeps the opposite UTC anchor");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true,"Ellipse handle drag records one undo step");
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-ellipse")),ellipseBeforeDrag);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true,"Ellipse handle drag can be redone");
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-ellipse")),ellipseAfterDrag);
  const ellipseCopyId=await page.evaluate(()=>{window.__v5Screenshot.selectDrawings(["visual-ellipse"]);return window.__v5Screenshot.duplicateSelectedDrawing()});
  assert.deepEqual(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId),{...ellipseAfterDrag,id:ellipseCopyId},"Duplicating an ellipse preserves its options and anchors");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true);assert.equal(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId),null);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);assert.ok(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId));
  await page.evaluate(id=>window.__v5Screenshot.removeEllipse(id),ellipseCopyId);assert.equal(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId),null);
  await page.evaluate(()=>window.__v5Screenshot.undo());assert.ok(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId),"Ellipse deletion is undoable");
  await page.evaluate(()=>window.__v5Screenshot.redo());assert.equal(await page.evaluate(id=>window.__v5Screenshot.readDrawing(id),ellipseCopyId),null);
  await page.evaluate(()=>window.__v5Screenshot.setDrawingVisible("visual-ellipse",false));assert.equal(await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-ellipse")),null);
  await page.evaluate(()=>window.__v5Screenshot.setDrawingVisible("visual-ellipse",true));
  await page.evaluate(()=>window.__v5Screenshot.updateEllipse("visual-ellipse",{locked:true}));
  const lockedEllipse=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-ellipse"));
  assert.equal(lockedEllipse.locked,true);
  await page.evaluate(()=>window.__v5Screenshot.updateEllipse("visual-ellipse",{locked:false}));
  const initialChannel=await page.evaluate(()=>({drawing:window.__v5Screenshot.readDrawing("visual-channel"),start:window.__v5Screenshot.drawingAnchorPosition("visual-channel","START"),end:window.__v5Screenshot.drawingAnchorPosition("visual-channel","END"),offset:window.__v5Screenshot.drawingAnchorPosition("visual-channel","OFFSET"),position:window.__v5Screenshot.drawingPosition("visual-channel"),transfer:JSON.parse(window.__v5Screenshot.exportDrawings())}));
  assert.equal(initialChannel.drawing.offsetTime,1700100000+32*900);
  assert.ok(initialChannel.start&&initialChannel.end&&initialChannel.offset&&initialChannel.position);
  assert.ok(initialChannel.transfer.drawings.some(item=>item.kind==="CHANNEL"&&item.options.id==="visual-channel"));
  await page.waitForTimeout(150);
  const initialRectanglePosition=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-zone"));
  await page.mouse.move(initialRectanglePosition.x,initialRectanglePosition.y);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-zone");
  const timeXY=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-time"));
  await page.mouse.move(timeXY.x,timeXY.y);await page.waitForTimeout(60);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-time");
  await page.mouse.click(timeXY.x,timeXY.y);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingIds),["visual-time"]);
  const priceXY=await page.evaluate(()=>window.__v5Screenshot.drawingPosition("visual-level"));
  const originalPrice=await page.evaluate(()=>window.__v5Screenshot.readDrawing("visual-level"));
  await page.mouse.move(priceXY.x,priceXY.y);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().hoveredDrawingId),"visual-level");
  await page.keyboard.down("Shift");await page.mouse.move(priceXY.x,priceXY.y);await page.mouse.down();await page.mouse.up();await page.keyboard.up("Shift");await page.waitForTimeout(50);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingIds),["visual-time","visual-level"]);
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
  const fibonacciTimeZones=await page.evaluate(()=>{
   const engine=window.__v5Screenshot,base=1700100000,start=base+30*900,end=base+31*900;
   engine.addFibonacciTimeZones({id:"visual-fibtime",startTime:start,endTime:end,color:"#f97316"});
   const forward={drawing:engine.readDrawing("visual-fibtime"),guides:engine.fibonacciTimeZoneGuides("visual-fibtime")};
   engine.addFibonacciTimeZones({id:"visual-fibtime-reverse",startTime:end,endTime:start,color:"#38bdf8"});
   const reverse=engine.fibonacciTimeZoneGuides("visual-fibtime-reverse");
   let identicalAnchorRejected=false;
   try{engine.addFibonacciTimeZones({id:"visual-fibtime-invalid",startTime:start,endTime:start,color:"#ffffff"})}catch{identicalAnchorRejected=true}
   const count=engine.inspect().nativeDrawingCount;engine.removeFibonacciTimeZones("visual-fibtime");engine.removeFibonacciTimeZones("visual-fibtime-reverse");
   return {forward,reverse,identicalAnchorRejected,count};
  });
  assert.equal(fibonacciTimeZones.forward.drawing.startTime,1700100000+30*900);
  assert.deepEqual(fibonacciTimeZones.forward.guides.map(item=>item.factor),[0,1,2,3,5,8,13,21,34,55]);
  assert.deepEqual(fibonacciTimeZones.forward.guides.map(item=>item.time),[0,1,2,3,5,8,13,21,34,55].map(factor=>1700100000+(30+factor)*900));
  assert.deepEqual(fibonacciTimeZones.reverse.map(item=>item.time),[0,1,2,3,5,8,13,21,34,55].map(factor=>1700100000+(31-factor)*900));
  assert.ok(fibonacciTimeZones.forward.guides.every(item=>Number.isFinite(item.x)&&item.x>=0));
  assert.equal(fibonacciTimeZones.identicalAnchorRejected,true,"Time zones require two distinct candle anchors");
  const fibonacciFan=await page.evaluate(()=>{
   const engine=window.__v5Screenshot,base=1700100000,startTime=base+30*900,endTime=base+34*900;
   engine.addFibonacciFan({id:"visual-fibfan",startTime,startPrice:4012,endTime,endPrice:4020,color:"#22d3ee"});
   const forward={drawing:engine.readDrawing("visual-fibfan"),rays:engine.fibonacciFanRays("visual-fibfan")};
   engine.updateFibonacciFan("visual-fibfan",{endPrice:4024});const edited=engine.readDrawing("visual-fibfan");engine.undo();const undone=engine.readDrawing("visual-fibfan");engine.redo();const redone=engine.readDrawing("visual-fibfan");
   engine.setDrawingVisible("visual-fibfan",false);const hidden=engine.readDrawing("visual-fibfan").visible;engine.setDrawingLocked("visual-fibfan",true);const locked=engine.readDrawing("visual-fibfan").locked;engine.setDrawingLocked("visual-fibfan",false);engine.setDrawingVisible("visual-fibfan",true);
   engine.selectDrawings(["visual-fibfan"]);engine.duplicateSelectedDrawings();const duplicateCount=JSON.parse(engine.exportDrawings()).drawings.filter(row=>row.kind==="FIB_FAN").length;engine.deleteSelectedDrawings();const remaining=JSON.parse(engine.exportDrawings()).drawings.filter(row=>row.kind==="FIB_FAN").length;
   let sameAnchorRejected=false,badRatiosRejected=false;
   try{engine.addFibonacciFan({id:"visual-fibfan-same",startTime,endTime:startTime,startPrice:4012,endPrice:4012,color:"#fff"})}catch{sameAnchorRejected=true}
   try{engine.addFibonacciFan({id:"visual-fibfan-ratios",startTime,startPrice:4012,endTime,endPrice:4020,color:"#fff",ratios:[.5,.4]})}catch{badRatiosRejected=true}
   engine.removeFibonacciFan("visual-fibfan");
   return {forward,edited,undone,redone,hidden,locked,duplicateCount,remaining,sameAnchorRejected,badRatiosRejected};
  });
  assert.deepEqual(fibonacciFan.forward.rays.map(ray=>ray.ratio),[.382,.5,.618]);
  assert.ok(fibonacciFan.forward.rays.every(ray=>ray.x1===fibonacciFan.forward.rays[0].x1&&ray.y1===fibonacciFan.forward.rays[0].y1&&Number.isFinite(ray.x2)&&Number.isFinite(ray.y2)));
  assert.notEqual(fibonacciFan.forward.rays[0].y2,fibonacciFan.forward.rays[2].y2,"fan ratios project distinct rays");
  assert.equal(fibonacciFan.sameAnchorRejected,true,"fan anchors must differ");
  assert.equal(fibonacciFan.badRatiosRejected,true,"fan ratios must be strictly increasing inside (0,1)");
  assert.equal(fibonacciFan.edited.endPrice,4024);assert.equal(fibonacciFan.undone.endPrice,4020);assert.equal(fibonacciFan.redone.endPrice,4024);
  assert.equal(fibonacciFan.hidden,false);assert.equal(fibonacciFan.locked,true);assert.equal(fibonacciFan.duplicateCount,2);assert.equal(fibonacciFan.remaining,1);
  const fibTrend=await page.evaluate(()=>{
   const engine=window.__v5Screenshot,base=1700100000,options={id:"visual-fibtrend",startTime:base+30*900,startPrice:4010,endTime:base+32*900,endPrice:4020,thirdTime:base+34*900,thirdPrice:4015,color:"#a78bfa"};
   engine.addTrendBasedFibonacci(options);
   const up={drawing:engine.readDrawing(options.id),levels:engine.trendBasedFibonacciLevels(options.id)};
   engine.updateTrendBasedFibonacci(options.id,{thirdPrice:4014});const edited=engine.readDrawing(options.id);engine.undo();const undone=engine.readDrawing(options.id);engine.redo();const redone=engine.readDrawing(options.id);
   engine.setDrawingVisible(options.id,false);const hidden=engine.readDrawing(options.id).visible;engine.setDrawingLocked(options.id,true);const locked=engine.readDrawing(options.id).locked;engine.setDrawingLocked(options.id,false);engine.setDrawingVisible(options.id,true);
   engine.selectDrawings([options.id]);engine.duplicateSelectedDrawings();const duplicateCount=JSON.parse(engine.exportDrawings()).drawings.filter(row=>row.kind==="FIB_TREND").length;engine.deleteSelectedDrawings();const remaining=JSON.parse(engine.exportDrawings()).drawings.filter(row=>row.kind==="FIB_TREND").length;
   engine.addTrendBasedFibonacci({...options,id:"visual-fibtrend-down",startPrice:4020,endPrice:4010});const down=engine.trendBasedFibonacciLevels("visual-fibtrend-down");
   let sameCandleRejected=false;try{engine.addTrendBasedFibonacci({...options,id:"visual-fibtrend-invalid",thirdTime:options.endTime})}catch{sameCandleRejected=true}
   engine.removeTrendBasedFibonacci(options.id);engine.removeTrendBasedFibonacci("visual-fibtrend-down");return {up,edited,undone,redone,hidden,locked,duplicateCount,remaining,down,sameCandleRejected};
  });
  assert.deepEqual(fibTrend.up.levels.map(level=>level.ratio),[0,.382,.5,.618,1,1.618,2.618]);
  assert.deepEqual(fibTrend.up.levels.map(level=>level.price),[4015,4018.82,4020,4021.18,4025,4031.18,4041.18]);
  assert.deepEqual(fibTrend.down.map(level=>level.price),[4015,4011.18,4010,4008.82,4005,3998.82,3988.82]);
  assert.equal(fibTrend.sameCandleRejected,true,"Trend-based Fibonacci requires three distinct candle anchors");
  assert.equal(fibTrend.edited.thirdPrice,4014);assert.equal(fibTrend.undone.thirdPrice,4015);assert.equal(fibTrend.redone.thirdPrice,4014);
  assert.equal(fibTrend.hidden,false);assert.equal(fibTrend.locked,true);assert.equal(fibTrend.duplicateCount,2);assert.equal(fibTrend.remaining,1);
  const fanDragSetup=await page.evaluate(()=>{const host=document.createElement("div");host.id="isolated-fan-drag";host.style.cssText="position:fixed;left:220px;top:90px;width:640px;height:360px;z-index:1000";document.body.append(host);const engine=ChartStudioV5.createStudioV5(host,"fan-drag-test",{symbol:"XAUUSD",timeframe:"M15"}),base=1700300000,bars=Array.from({length:100},(_,index)=>{const price=4000+index*.2+Math.sin(index/8)*3;return {time:base+index*900,open:price,high:price+4,low:price-4,close:price+1}});engine.setCandles(bars);engine.setVisibleLogicalRange({from:0,to:100});engine.addFibonacciFan({id:"fan-drag",startTime:bars[70].time,startPrice:bars[70].close,endTime:bars[82].time,endPrice:bars[82].close+2,color:"#22d3ee"});window.__fanDragEngine=engine;return {original:engine.readDrawing("fan-drag")}});
  await page.waitForTimeout(150);const fanEndPoint=await page.evaluate(()=>window.__fanDragEngine.drawingAnchorPosition("fan-drag","END"));
  await page.mouse.move(fanEndPoint.x,fanEndPoint.y);await page.mouse.down();await page.mouse.move(fanEndPoint.x+28,fanEndPoint.y-18,{steps:3});await page.mouse.up();
  const fanDragged=await page.evaluate(()=>window.__fanDragEngine.readDrawing("fan-drag"));assert.ok(fanDragged.endTime!==fanDragSetup.original.endTime||fanDragged.endPrice!==fanDragSetup.original.endPrice,"isolated selected Fan endpoint supports pointer dragging");
  await page.evaluate(()=>window.__fanDragEngine.undo());assert.deepEqual(await page.evaluate(()=>{const drawing=window.__fanDragEngine.readDrawing("fan-drag");return [drawing.startTime,drawing.startPrice,drawing.endTime,drawing.endPrice]}),[fanDragSetup.original.startTime,fanDragSetup.original.startPrice,fanDragSetup.original.endTime,fanDragSetup.original.endPrice]);
  await page.evaluate(()=>{window.__fanDragEngine.destroy();document.getElementById("isolated-fan-drag").remove();delete window.__fanDragEngine});
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
  const persistedBeforeReload=await page.evaluate(()=>({price:window.__v5Screenshot.readDrawing("visual-level"),priceSecond:window.__v5Screenshot.readDrawing("visual-level-second"),time:window.__v5Screenshot.readDrawing("visual-time"),timeSecond:window.__v5Screenshot.readDrawing("visual-time-second"),text:window.__v5Screenshot.readDrawing("visual-note"),trend:window.__v5Screenshot.readDrawing("visual-trend"),rectangle:window.__v5Screenshot.readDrawing("visual-zone"),ellipse:window.__v5Screenshot.readDrawing("visual-ellipse"),channel:window.__v5Screenshot.readDrawing("visual-channel"),ray:window.__v5Screenshot.readDrawing("visual-ray"),fibo:window.__v5Screenshot.readDrawing("visual-fibo"),customFibo:window.__v5Screenshot.readDrawing("visual-fibo-custom")}));
  await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2}});
   const key="2eas.chartstudio.v5.drawings:v5:historycontract:XAUUSD:M15";localStorage.removeItem(key);
   const host=document.createElement("div");host.style.cssText="width:800px;height:400px";document.body.append(host);
   const e=ChartStudioV5.createStudioV5(host,"historycontract",{symbol:"XAUUSD",timeframe:"M15"});e.setCandles(rows);
   e.addPriceLevel({id:"history-edit",price:4001,color:"#ffffff"});e.updatePriceLevel("history-edit",{price:4002});e.updatePriceLevel("history-edit",{price:4003});e.destroy();
   const createHost=document.createElement("div");createHost.style.cssText="width:800px;height:400px";document.body.append(createHost);
   const created=ChartStudioV5.createStudioV5(createHost,"historycreated",{symbol:"XAUUSD",timeframe:"M15"});created.setCandles(rows);
   created.addPriceLevel({id:"history-created",price:4011,color:"#ffffff"});created.removePriceLevel("history-created");created.destroy();createHost.remove();
   const windowHost=document.createElement("div");windowHost.style.cssText="width:800px;height:400px";document.body.append(windowHost);
   const windowed=ChartStudioV5.createStudioV5(windowHost,"windowpersist",{symbol:"XAUUSD",timeframe:"M15"});windowed.setCandles(rows);
   windowed.addTimeMarker({id:"outside-window-anchor",time:rows[10].time,color:"#ffffff"});windowed.destroy();windowHost.remove();host.remove();
  });
  await page.reload({waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartV5Ready===true);
  const persistedHistoryProbe=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2}});
   const host=document.createElement("div");host.style.cssText="width:800px;height:400px";document.body.append(host);
   const e=ChartStudioV5.createStudioV5(host,"historycontract",{symbol:"XAUUSD",timeframe:"M15"});e.setCandles(rows);
   const before=e.readDrawing("history-edit"),undo=e.undo(),undone=e.readDrawing("history-edit"),undoAgain=e.undo(),undoneAgain=e.readDrawing("history-edit"),redo=e.redo(),redone=e.readDrawing("history-edit"),redoAgain=e.redo(),redoneAgain=e.readDrawing("history-edit");
   e.setCandles(rows.slice(1));const afterBarsReplacement={undo:e.undo(),drawings:JSON.parse(localStorage.getItem("2eas.chartstudio.v5.drawings:v5:historycontract:XAUUSD:M15"))};e.destroy();host.remove();
   const createHost=document.createElement("div");createHost.style.cssText="width:800px;height:400px";document.body.append(createHost);
   const created=ChartStudioV5.createStudioV5(createHost,"historycreated",{symbol:"XAUUSD",timeframe:"M15"});created.setCandles(rows);
   const deleteUndo=created.undo(),restored=created.readDrawing("history-created"),createUndo=created.undo(),removed=created.readDrawing("history-created"),createRedo=created.redo(),createdAgain=created.readDrawing("history-created"),deleteRedo=created.redo(),deletedAgain=created.readDrawing("history-created");created.destroy();createHost.remove();
   const windowHost=document.createElement("div");windowHost.style.cssText="width:800px;height:400px";document.body.append(windowHost);
   const windowed=ChartStudioV5.createStudioV5(windowHost,"windowpersist",{symbol:"XAUUSD",timeframe:"M15"});windowed.setCandles(rows.slice(20));
   windowed.addChannel({id:"outside-window-channel",startTime:rows[20].time,startPrice:rows[20].close,endTime:rows[30].time,endPrice:rows[30].close+8,offsetTime:rows[25].time,offsetPrice:rows[25].close+15,color:"#38bdf8"});
   windowed.setCandles(rows.slice(50));const outsideWindow={status:windowed.inspect().persistenceStatus,drawing:windowed.readDrawing("outside-window-channel"),hiddenPosition:windowed.drawingPosition("outside-window-channel")};windowed.destroy();windowHost.remove();
   const reloadHost=document.createElement("div");reloadHost.style.cssText="width:800px;height:400px";document.body.append(reloadHost);
   const reload=ChartStudioV5.createStudioV5(reloadHost,"windowpersist",{symbol:"XAUUSD",timeframe:"M15"});reload.setCandles(rows.slice(50));const reloadedOutsideWindow={status:reload.inspect().persistenceStatus,drawing:reload.readDrawing("outside-window-channel"),position:reload.drawingPosition("outside-window-channel")};
   reload.setCandles(rows);const loadedAgain={drawing:reload.readDrawing("outside-window-channel"),position:reload.drawingPosition("outside-window-channel")};reload.destroy();reloadHost.remove();
   return {before,undo,undone,undoAgain,undoneAgain,redo,redone,redoAgain,redoneAgain,afterBarsReplacement,createDelete:{deleteUndo,restored,createUndo,removed,createRedo,createdAgain,deleteRedo,deletedAgain},outsideWindow,reloadedOutsideWindow,loadedAgain};
  });
  assert.equal(persistedHistoryProbe.before.price,4003);
  assert.equal(persistedHistoryProbe.undo,true,"scoped undo history should survive browser reload");
  assert.equal(persistedHistoryProbe.undone.price,4002);
  assert.equal(persistedHistoryProbe.undoAgain,true);
  assert.equal(persistedHistoryProbe.undoneAgain.price,4001);
  assert.equal(persistedHistoryProbe.redo,true);
  assert.equal(persistedHistoryProbe.redone.price,4002);
  assert.equal(persistedHistoryProbe.redoAgain,true);
  assert.equal(persistedHistoryProbe.redoneAgain.price,4003);
  assert.equal(persistedHistoryProbe.afterBarsReplacement.undo,false);
  assert.deepEqual(persistedHistoryProbe.afterBarsReplacement.drawings.undoStack,[]);
  assert.deepEqual(persistedHistoryProbe.afterBarsReplacement.drawings.redoStack,[]);
  assert.equal(persistedHistoryProbe.createDelete.deleteUndo,true);
  assert.equal(persistedHistoryProbe.createDelete.restored.price,4011);
  assert.equal(persistedHistoryProbe.createDelete.createUndo,true);
  assert.equal(persistedHistoryProbe.createDelete.removed,null);
  assert.equal(persistedHistoryProbe.createDelete.createRedo,true);
  assert.equal(persistedHistoryProbe.createDelete.createdAgain.price,4011);
  assert.equal(persistedHistoryProbe.createDelete.deleteRedo,true);
  assert.equal(persistedHistoryProbe.createDelete.deletedAgain,null);
  assert.equal(persistedHistoryProbe.outsideWindow.status,"READY");
  assert.equal(persistedHistoryProbe.outsideWindow.drawing.startTime,1700100000+20*900);
  assert.equal(persistedHistoryProbe.outsideWindow.hiddenPosition,null);
  assert.equal(persistedHistoryProbe.reloadedOutsideWindow.status,"READY");
  assert.deepEqual(persistedHistoryProbe.reloadedOutsideWindow.drawing,persistedHistoryProbe.outsideWindow.drawing);
  assert.equal(persistedHistoryProbe.reloadedOutsideWindow.position,null);
  assert.deepEqual(persistedHistoryProbe.loadedAgain.drawing,persistedHistoryProbe.outsideWindow.drawing);
  assert.ok(persistedHistoryProbe.loadedAgain.position);
  const persistenceProbe=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3}});
   const scope={symbol:"XAUUSD",timeframe:"M15"};
   const groupFailureAccount="groupnudgefailure",groupFailureKey="2eas.chartstudio.v5.drawings:v5:groupnudgefailure:XAUUSD:M15",groupFailureHost=document.createElement("div");groupFailureHost.style.cssText="width:800px;height:400px";document.body.append(groupFailureHost);
   const groupFailure=ChartStudioV5.createStudioV5(groupFailureHost,groupFailureAccount,scope);groupFailure.setCandles(rows);
   groupFailure.addTimeMarker({id:"group-failure-a",time:rows[30].time,color:"#ffffff"});groupFailure.addTimeMarker({id:"group-failure-b",time:rows[40].time,color:"#ffffff"});
   groupFailure.selectDrawings(["group-failure-a","group-failure-b"]);
   const groupFailureBefore={a:groupFailure.readDrawing("group-failure-a"),b:groupFailure.readDrawing("group-failure-b"),selection:groupFailure.inspect().selectedDrawingIds,stored:localStorage.getItem(groupFailureKey)};
   const groupFailureSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===groupFailureKey)throw Error("group nudge storage failure");return groupFailureSetItem.call(this,key,value)};
   try{groupFailureHost.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))}finally{Storage.prototype.setItem=groupFailureSetItem}
   const groupFailureAfter={a:groupFailure.readDrawing("group-failure-a"),b:groupFailure.readDrawing("group-failure-b"),selection:groupFailure.inspect().selectedDrawingIds,status:groupFailure.inspect().persistenceStatus,error:groupFailure.inspect().persistenceError,stored:localStorage.getItem(groupFailureKey)};
   const groupFailureUndo=[groupFailure.undo(),groupFailure.undo()],groupFailureUndone=[groupFailure.readDrawing("group-failure-a"),groupFailure.readDrawing("group-failure-b")];
   const groupFailureRedo=[groupFailure.redo(),groupFailure.redo()],groupFailureRedone=[groupFailure.readDrawing("group-failure-a"),groupFailure.readDrawing("group-failure-b")];
   groupFailure.destroy();groupFailureHost.remove();
   let e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",scope);e.setCandles(rows);
   const restored={status:e.inspect().persistenceStatus,count:e.inspect().nativePrimitives,price:e.readDrawing("visual-level"),priceSecond:e.readDrawing("visual-level-second"),time:e.readDrawing("visual-time"),timeSecond:e.readDrawing("visual-time-second"),text:e.readDrawing("visual-note"),trend:e.readDrawing("visual-trend"),rectangle:e.readDrawing("visual-zone"),ellipse:e.readDrawing("visual-ellipse"),channel:e.readDrawing("visual-channel"),ray:e.readDrawing("visual-ray"),fibo:e.readDrawing("visual-fibo"),customFibo:e.readDrawing("visual-fibo-custom")};
   e.changeAccount("goldm15");e.setCandles(rows);const otherAccount=e.inspect().nativePrimitives;
   e.changeAccount("titan");e.setCandles(rows);const returned=e.inspect().nativePrimitives;
   e.destroy();
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"XAUUSD",timeframe:"H1"});e.setCandles(rows);
   const otherTimeframe=e.inspect().nativePrimitives;e.destroy();
   const conflictKey="2eas.chartstudio.v5.drawings:v5:titan:EURUSD:M5";
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"EURUSD",timeframe:"M5"});e.setCandles(rows);
   e.addPriceLevel({id:"local-level",price:4000,color:"#ffffff"});
   const externalSnapshot=JSON.stringify({external:true});localStorage.setItem(conflictKey,externalSnapshot);
   e.updatePriceLevel("local-level",{price:4001});
   const conflict={status:e.inspect().persistenceStatus,stored:localStorage.getItem(conflictKey)};e.destroy();
   const corruptKey="2eas.chartstudio.v5.drawings:v5:titan:GBPUSD:M5";localStorage.setItem(corruptKey,"not-json");
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",{symbol:"GBPUSD",timeframe:"M5"});e.setCandles(rows);
   const corrupt={status:e.inspect().persistenceStatus,error:e.inspect().persistenceError,stored:localStorage.getItem(corruptKey)};e.destroy();
   const unicodeOversizeKey="2eas.chartstudio.v5.drawings:v5:unicodeoversize:XAUUSD:M15",unicodeOversize=JSON.stringify({schemaVersion:1,account:"unicodeoversize",symbol:"XAUUSD",timeframe:"M15",drawings:[],padding:"é".repeat(270000)});localStorage.setItem(unicodeOversizeKey,unicodeOversize);
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"unicodeoversize",scope);e.setCandles(rows);
   const unicodeOversizeSnapshot={status:e.inspect().persistenceStatus,error:e.inspect().persistenceError,characters:unicodeOversize.length,bytes:new TextEncoder().encode(unicodeOversize).byteLength};e.destroy();
   const unicodeImportHost=document.createElement("div");unicodeImportHost.style.cssText="width:2px;height:2px;position:absolute;left:-2000px;top:0";document.body.append(unicodeImportHost);
   e=ChartStudioV5.createStudioV5(unicodeImportHost,"unicodeimportoversize",scope);e.setCandles(rows);let unicodeImportError="";try{e.importDrawings(unicodeOversize)}catch(error){unicodeImportError=error.message}e.destroy();unicodeImportHost.remove();
   const unicodeOversizeImport={error:unicodeImportError,characters:unicodeOversize.length,bytes:new TextEncoder().encode(unicodeOversize).byteLength};
   const legacyKey="2eas.chartstudio.v5.drawings:migrationtest:XAUUSD:M15",legacy=JSON.stringify({schemaVersion:1,account:"migrationtest",symbol:"XAUUSD",timeframe:"M15",drawings:[{kind:"PRICE",options:{id:"legacy-price",price:4001,color:"#ffffff",visible:true,locked:false}}]});localStorage.setItem(legacyKey,legacy);
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"migrationtest",scope);e.setCandles(rows);
   const migrated={status:e.inspect().persistenceStatus,drawing:e.readDrawing("legacy-price"),stored:JSON.parse(localStorage.getItem(legacyKey)),current:JSON.parse(localStorage.getItem("2eas.chartstudio.v5.drawings:v5:migrationtest:XAUUSD:M15"))};e.destroy();
   const legacyV2Key="2eas.chartstudio.v5.drawings:migrationv2:XAUUSD:M15",legacyV2=JSON.stringify({schemaVersion:2,account:"migrationv2",symbol:"XAUUSD",timeframe:"M15",drawings:[{kind:"PRICE",options:{id:"legacy-v2-price",price:4002,color:"#ffffff",visible:true,locked:false}}],undoStack:[],redoStack:[]});localStorage.setItem(legacyV2Key,legacyV2);
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"migrationv2",scope);e.setCandles(rows);
   const migratedV2={status:e.inspect().persistenceStatus,drawing:e.readDrawing("legacy-v2-price"),stored:JSON.parse(localStorage.getItem(legacyV2Key)),current:JSON.parse(localStorage.getItem("2eas.chartstudio.v5.drawings:v5:migrationv2:XAUUSD:M15"))};e.destroy();
   const badHistoryKey="2eas.chartstudio.v5.drawings:badhistory:XAUUSD:M15",badHistory=JSON.stringify({schemaVersion:2,account:"badhistory",symbol:"XAUUSD",timeframe:"M15",drawings:[{kind:"PRICE",options:{id:"must-not-restore",price:4001,color:"#ffffff",visible:true,locked:false}}],undoStack:[{id:"wrong-id",before:null,after:{kind:"PRICE",options:{id:"other-id",price:4001,color:"#ffffff",visible:true,locked:false}}}],redoStack:[]});localStorage.setItem(badHistoryKey,badHistory);
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"badhistory",scope);e.setCandles(rows);
   const malformedHistory={status:e.inspect().persistenceStatus,count:e.inspect().nativePrimitives,stored:localStorage.getItem(badHistoryKey)};e.destroy();
   const failedMigrationKey="2eas.chartstudio.v5.drawings:migrationfailure:XAUUSD:M15",failedMigration=JSON.stringify({schemaVersion:1,account:"migrationfailure",symbol:"XAUUSD",timeframe:"M15",drawings:[]}),failedMigrationTarget="2eas.chartstudio.v5.drawings:v5:migrationfailure:XAUUSD:M15";localStorage.setItem(failedMigrationKey,failedMigration);
   const originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===failedMigrationTarget)throw Error("quota fixture");return originalSetItem.call(this,key,value)};
   let migrationFailure;try{e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"migrationfailure",scope);e.setCandles(rows);migrationFailure={status:e.inspect().persistenceStatus,error:e.inspect().persistenceError,stored:localStorage.getItem(failedMigrationKey)};e.destroy()}finally{Storage.prototype.setItem=originalSetItem}
   const sizeKey="2eas.chartstudio.v5.drawings:v5:sizetest:XAUUSD:M15",sizeDrawings=Array.from({length:100},(_,i)=>({kind:"TEXT",options:{id:`size-${String(i).padStart(3,"0")}-abcdefghijklmnopqrstuv`,time:rows[10].time,price:4001,text:"a",color:"#ffffff",visible:true,locked:false}}));
   const fiboSnapshot={kind:"FIBO",options:{id:"history-filler",startTime:rows[10].time,startPrice:4001,endTime:rows[20].time,endPrice:4002,color:"#ffffff",visible:true,locked:false,levels:Array.from({length:16},(_,i)=>i*66.666666666)}};
   let sizeHistory=Array.from({length:100},()=>({id:"history-filler",before:fiboSnapshot,after:{...fiboSnapshot,options:{...fiboSnapshot.options,endPrice:4002.25}}}));
   const sizeEnvelope=()=>JSON.stringify({schemaVersion:2,account:"sizetest",symbol:"XAUUSD",timeframe:"M15",drawings:sizeDrawings,undoStack:sizeHistory,redoStack:[]});
   while(sizeEnvelope().length>65000&&sizeHistory.length)sizeHistory.shift();
   const sizeSeed=sizeEnvelope();localStorage.setItem(sizeKey,sizeSeed);
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"sizetest",scope);e.setCandles(rows);e.updateTextAnnotation(sizeDrawings[0].options.id,{text:"Z".repeat(40)});
   const sizeBound={seedBytes:new TextEncoder().encode(sizeSeed).byteLength,storedBytes:new TextEncoder().encode(localStorage.getItem(sizeKey)).byteLength,historyCount:JSON.parse(localStorage.getItem(sizeKey)).undoStack.length,drawingCount:e.inspect().nativePrimitives,drawing:e.readDrawing(sizeDrawings[0].options.id)};e.destroy();
   const capacityHistoryKey="2eas.chartstudio.v5.drawings:v5:capacityhistory:XAUUSD:M15",capacityLevels=Array.from({length:16},(_,i)=>-999.1234567890123+i*133.2345678912345);
   const capacityOptions=(id,color)=>({id,startTime:rows[10].time,startPrice:4001,endTime:rows[20].time,endPrice:4002,color,visible:true,locked:false,levels:capacityLevels});
   const capacityDrawings=Array.from({length:1000},(_,i)=>({kind:"FIBO",options:capacityOptions(`capacity-fibo-${String(i).padStart(18,"0")}`,"#000000")}));
   const capacityHistory=Array.from({length:100},(_,i)=>{const id=`capacity-fibo-${String(i).padStart(18,"0")}`;return {id,before:{kind:"FIBO",options:capacityOptions(id,"#000000")},after:{kind:"FIBO",options:capacityOptions(id,"#ffffff")}}});
   const capacityEnvelope=()=>JSON.stringify({schemaVersion:2,account:"capacityhistory",symbol:"XAUUSD",timeframe:"M15",drawings:capacityDrawings,undoStack:capacityHistory,redoStack:[]});
   while(new TextEncoder().encode(capacityEnvelope()).byteLength>524288-512&&capacityHistory.length)capacityHistory.shift();
   const capacitySeed=capacityEnvelope(),capacitySeedBytes=new TextEncoder().encode(capacitySeed).byteLength,capacitySeedHistory=capacityHistory.length,capacitySeedOldest=capacityHistory[0]?.id;
   localStorage.setItem(capacityHistoryKey,capacitySeed);
   const capacityHost=document.createElement("div");capacityHost.style.cssText="width:2px;height:2px;position:absolute;left:-2000px;top:0";document.body.append(capacityHost);
   e=ChartStudioV5.createStudioV5(capacityHost,"capacityhistory",scope);e.setCandles(rows);const capacityHydrated={status:e.inspect().persistenceStatus,count:e.inspect().nativePrimitives};let fibTimeCapacityRejected=false;try{e.addFibonacciTimeZones({id:"capacity-fibtime",startTime:rows[10].time,endTime:rows[11].time,color:"#ffffff"})}catch{fibTimeCapacityRejected=true}capacityHydrated.fibTimeCapacityRejected=fibTimeCapacityRejected;
   e.updateFibonacci("capacity-fibo-000000000000000000",{color:"#ffffff"});
   const capacityStored=JSON.parse(localStorage.getItem(capacityHistoryKey)),capacityHistoryBound={seedBytes:capacitySeedBytes,storedBytes:new TextEncoder().encode(localStorage.getItem(capacityHistoryKey)).byteLength,seedHistoryCount:capacitySeedHistory,storedHistoryCount:capacityStored.undoStack.length,seedOldest:capacitySeedOldest,storedOldest:capacityStored.undoStack[0]?.id,drawingCount:e.inspect().nativePrimitives,status:e.inspect().persistenceStatus,error:e.inspect().persistenceError};e.destroy();capacityHost.remove();
   e=ChartStudioV5.createStudioV5(document.getElementById("chart"),"titan",scope);e.setCandles(rows);
   e.addAverage({id:"ema21",color:"#61ddf2"},rows.slice(20).map(c=>({time:c.time,value:c.close-1.2})));
   e.addPaneLine({id:"rsi14",color:"#f7c774"},rows.slice(14).map((c,i)=>({time:c.time,value:45+18*Math.sin(i/8)})));
   e.showVolume(true);window.__v5Screenshot=e;
   return {groupFailureBefore,groupFailureAfter,groupFailureUndo,groupFailureUndone,groupFailureRedo,groupFailureRedone,restored,otherAccount,returned,otherTimeframe,conflict,externalSnapshot,corrupt,unicodeOversizeSnapshot,unicodeOversizeImport,migrated,migratedV2,legacy,badHistory,malformedHistory,migrationFailure,failedMigration,sizeBound,capacityHydrated,capacityHistoryBound};
  });
  assert.equal(persistenceProbe.restored.status,"READY");
  assert.deepEqual(persistenceProbe.groupFailureAfter.a,persistenceProbe.groupFailureBefore.a,"A failed persisted group nudge restores the first drawing in memory");
  assert.deepEqual(persistenceProbe.groupFailureAfter.b,persistenceProbe.groupFailureBefore.b,"A failed persisted group nudge restores every drawing in memory");
  assert.deepEqual(persistenceProbe.groupFailureAfter.selection,persistenceProbe.groupFailureBefore.selection);
  assert.equal(persistenceProbe.groupFailureAfter.stored,persistenceProbe.groupFailureBefore.stored,"A failed group nudge leaves the saved snapshot unchanged");
  assert.equal(persistenceProbe.groupFailureAfter.status,"UNAVAILABLE");assert.equal(persistenceProbe.groupFailureAfter.error,"STORAGE_WRITE_FAILED");
  assert.deepEqual(persistenceProbe.groupFailureUndo,[true,true],"The pre-existing scoped history remains undoable after rollback");assert.deepEqual(persistenceProbe.groupFailureUndone,[null,null]);
  assert.deepEqual(persistenceProbe.groupFailureRedo,[true,true],"The pre-existing scoped history remains redoable after rollback");assert.deepEqual(persistenceProbe.groupFailureRedone,[persistenceProbe.groupFailureBefore.a,persistenceProbe.groupFailureBefore.b]);
  assert.equal(persistenceProbe.restored.count,12);
  assert.deepEqual(persistenceProbe.restored.price,persistedBeforeReload.price);
  assert.deepEqual(persistenceProbe.restored.priceSecond,persistedBeforeReload.priceSecond);
  assert.deepEqual(persistenceProbe.restored.time,persistedBeforeReload.time);
  assert.deepEqual(persistenceProbe.restored.timeSecond,persistedBeforeReload.timeSecond);
  assert.deepEqual(persistenceProbe.restored.text,persistedBeforeReload.text);
  assert.deepEqual(persistenceProbe.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(persistenceProbe.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(persistenceProbe.restored.ellipse,persistedBeforeReload.ellipse);
  assert.deepEqual(persistenceProbe.restored.channel,persistedBeforeReload.channel);
  assert.deepEqual(persistenceProbe.restored.ray,persistedBeforeReload.ray);
  assert.deepEqual(persistenceProbe.restored.fibo,persistedBeforeReload.fibo);
  assert.deepEqual(persistenceProbe.restored.customFibo,persistedBeforeReload.customFibo);
  assert.equal(persistenceProbe.otherAccount,0);
  assert.equal(persistenceProbe.returned,12);
  assert.equal(persistenceProbe.otherTimeframe,0);
  assert.equal(persistenceProbe.conflict.status,"CONFLICT");
  assert.equal(persistenceProbe.conflict.stored,persistenceProbe.externalSnapshot);
  assert.equal(persistenceProbe.corrupt.status,"UNAVAILABLE");
  assert.equal(persistenceProbe.corrupt.error,"INVALID_SNAPSHOT");
  assert.equal(persistenceProbe.corrupt.stored,"not-json");
  assert.ok(persistenceProbe.unicodeOversizeSnapshot.characters<524288,"unicode fixture stays below the JavaScript character limit");
  assert.ok(persistenceProbe.unicodeOversizeSnapshot.bytes>524288,"unicode fixture exceeds the UTF-8 byte limit");
  assert.equal(persistenceProbe.unicodeOversizeSnapshot.error,"SNAPSHOT_TOO_LARGE","private persistence enforces bytes rather than JavaScript character count");
  assert.equal(persistenceProbe.unicodeOversizeImport.characters,persistenceProbe.unicodeOversizeSnapshot.characters);
  assert.equal(persistenceProbe.unicodeOversizeImport.bytes,persistenceProbe.unicodeOversizeSnapshot.bytes);
  assert.equal(persistenceProbe.unicodeOversizeImport.error,"Invalid drawing import size","portable import enforces the UTF-8 byte limit before parsing");
  assert.equal(persistenceProbe.migrated.status,"READY");
  assert.equal(persistenceProbe.migrated.drawing.price,4001);
  assert.equal(persistenceProbe.migrated.stored.schemaVersion,1);
  assert.equal(persistenceProbe.migrated.current.schemaVersion,6);
  assert.deepEqual(persistenceProbe.migrated.current.undoStack,[]);
  assert.deepEqual(persistenceProbe.migrated.current.redoStack,[]);
  assert.equal(persistenceProbe.migratedV2.status,"READY");
  assert.equal(persistenceProbe.migratedV2.drawing.price,4002);
  assert.equal(persistenceProbe.migratedV2.stored.schemaVersion,2);
  assert.equal(persistenceProbe.migratedV2.current.schemaVersion,6);
  assert.equal(persistenceProbe.malformedHistory.status,"UNAVAILABLE");
  assert.equal(persistenceProbe.malformedHistory.count,0);
  assert.equal(persistenceProbe.malformedHistory.stored,persistenceProbe.badHistory);
  assert.equal(persistenceProbe.migrationFailure.status,"UNAVAILABLE");
  assert.equal(persistenceProbe.migrationFailure.error,"STORAGE_WRITE_FAILED");
  assert.equal(persistenceProbe.migrationFailure.stored,persistenceProbe.failedMigration);
  assert.ok(persistenceProbe.sizeBound.seedBytes<=65536);
  assert.ok(persistenceProbe.sizeBound.storedBytes<=524288);
  assert.equal(persistenceProbe.sizeBound.drawingCount,100);
  assert.equal(persistenceProbe.sizeBound.drawing.text,"Z".repeat(40));
  assert.ok(persistenceProbe.sizeBound.historyCount<=100,"persisted undo history remains bounded to 100 entries");
  assert.equal(persistenceProbe.capacityHydrated.status,"READY","near-limit 1,000-drawing snapshot hydrates cleanly");
  assert.equal(persistenceProbe.capacityHydrated.count,1000);
  assert.equal(persistenceProbe.capacityHydrated.fibTimeCapacityRejected,true,"Fibonacci Time Zones shares the 1,000-drawing cap");
  assert.ok(persistenceProbe.capacityHistoryBound.seedBytes<=524288-512,"seed leaves room for the new history entry to exceed the persistence budget");
  assert.ok(persistenceProbe.capacityHistoryBound.seedBytes>524288-4096,"seed exercises the persistence boundary rather than an ordinary snapshot");
  assert.ok(persistenceProbe.capacityHistoryBound.seedHistoryCount>0&&persistenceProbe.capacityHistoryBound.seedHistoryCount<100);
  assert.ok(persistenceProbe.capacityHistoryBound.storedBytes<=524288,"persistence trims history to stay inside the storage bound");
  assert.ok(persistenceProbe.capacityHistoryBound.storedHistoryCount<persistenceProbe.capacityHistoryBound.seedHistoryCount+1,"oldest undo entries are trimmed after adding history at the size limit");
  assert.notEqual(persistenceProbe.capacityHistoryBound.storedOldest,persistenceProbe.capacityHistoryBound.seedOldest,"the oldest persisted undo entry is discarded first");
  assert.equal(persistenceProbe.capacityHistoryBound.drawingCount,1000,"history trimming preserves every drawing");
  assert.equal(persistenceProbe.capacityHistoryBound.status,"READY");
  console.log(`AT-025 persistence-boundary evidence ${JSON.stringify(persistenceProbe.capacityHistoryBound)}`);
  const drawingTransfer=await page.evaluate(()=>{
   const rows=Array.from({length:90},(_,i)=>{const p=4000+i*.4+Math.sin(i/10)*16;return {time:1700100000+i*900,open:p,high:p+5,low:p-5,close:p+2,tick_volume:100+i*3}});
   const scope={symbol:"XAUUSD",timeframe:"M15"};
   const source=window.__v5Screenshot.exportDrawings();
   const target=ChartStudioV5.createStudioV5(document.getElementById("chart"),"importtest",scope);target.setCandles(rows);
   const imported=target.importDrawings(source),restored={count:target.inspect().nativePrimitives,price:target.readDrawing("visual-level"),priceSecond:target.readDrawing("visual-level-second"),time:target.readDrawing("visual-time"),timeSecond:target.readDrawing("visual-time-second"),text:target.readDrawing("visual-note"),trend:target.readDrawing("visual-trend"),rectangle:target.readDrawing("visual-zone"),ellipse:target.readDrawing("visual-ellipse"),channel:target.readDrawing("visual-channel"),ray:target.readDrawing("visual-ray"),fibo:target.readDrawing("visual-fibo"),customFibo:target.readDrawing("visual-fibo-custom")};
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
   const channelOriginal=target.readDrawing("visual-channel");
   target.updateChannel("visual-channel",{offsetPrice:channelOriginal.offsetPrice+3});const editedChannel=target.readDrawing("visual-channel");
   target.undo();const channelUndo=target.readDrawing("visual-channel");target.redo();const channelRedo=target.readDrawing("visual-channel");
   target.removeChannel("visual-channel");const removedChannel=target.readDrawing("visual-channel");target.undo();const restoredChannelByUndo=target.readDrawing("visual-channel");
   target.setDrawingVisible("visual-channel",false);const hiddenChannelPosition=target.drawingPosition("visual-channel"),hiddenChannel=target.readDrawing("visual-channel");target.setDrawingVisible("visual-channel",true);
   target.addChannel({id:"vertical-channel",startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[30].time,endPrice:rows[30].close+10,offsetTime:rows[32].time,offsetPrice:rows[32].close+20,color:"#38bdf8"});const verticalChannel=target.readDrawing("vertical-channel");target.removeChannel("vertical-channel");
   let invalidChannel="";try{target.addChannel({id:"invalid-channel",startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[42].time,endPrice:rows[42].close+8,offsetTime:rows[30].time,offsetPrice:rows[30].close,color:"#38bdf8"})}catch(error){invalidChannel=error.message}
   let unloadedChannel="";try{target.addChannel({id:"unloaded-channel",startTime:rows[30].time,startPrice:rows[30].close,endTime:rows[42].time,endPrice:rows[42].close+8,offsetTime:rows[89].time+900,offsetPrice:rows[89].close+14,color:"#38bdf8"})}catch(error){unloadedChannel=error.message}
   const channelApi={editedChannel,channelUndo,channelRedo,removedChannel,restoredChannelByUndo,hiddenChannelPosition,hiddenChannel,invalidChannel,unloadedChannel,verticalChannel};
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
   const missingChannelEnvelope={...sourceEnvelope,drawings:[{kind:"CHANNEL",options:{...sourceEnvelope.drawings.find(item=>item.kind==="CHANNEL").options}}]};delete missingChannelEnvelope.drawings[0].options.offsetTime;
   const missingChannelTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"missingchannel",scope);missingChannelTarget.setCandles(rows);
   let missingChannel="";try{missingChannelTarget.importDrawings(JSON.stringify(missingChannelEnvelope))}catch(error){missingChannel=error.message}const missingChannelCount=missingChannelTarget.inspect().nativePrimitives;missingChannelTarget.destroy();
   const conflictTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"conflicttest",scope);conflictTarget.setCandles(rows);conflictTarget.addPriceLevel({id:"existing",price:4000,color:"#ffffff"});
   let conflictError="";try{conflictTarget.importDrawings(source)}catch(error){conflictError=error.message}const conflictCount=conflictTarget.inspect().nativePrimitives;conflictTarget.destroy();
   const storageConflictTarget=ChartStudioV5.createStudioV5(document.getElementById("chart"),"storageconflict",scope);storageConflictTarget.setCandles(rows);
   const conflictKey="2eas.chartstudio.v5.drawings:v5:storageconflict:XAUUSD:M15",external=JSON.stringify({external:true});localStorage.setItem(conflictKey,external);
   let storageConflictError="";try{storageConflictTarget.importDrawings(source)}catch(error){storageConflictError=error.message}
   const storageConflict={error:storageConflictError,status:storageConflictTarget.inspect().persistenceStatus,count:storageConflictTarget.inspect().nativePrimitives,stored:localStorage.getItem(conflictKey)};storageConflictTarget.destroy();
   const wrongScope=ChartStudioV5.createStudioV5(document.getElementById("chart"),"goldm15",{symbol:"EURUSD",timeframe:"M15"});wrongScope.setCandles(rows);
   let scopeError="";try{wrongScope.importDrawings(source)}catch(error){scopeError=error.message}const wrongScopeCount=wrongScope.inspect().nativePrimitives;wrongScope.destroy();
   const pitchforkHost=document.createElement("div");pitchforkHost.style.cssText="width:400px;height:200px";document.body.append(pitchforkHost);const pitchSource=ChartStudioV5.createStudioV5(pitchforkHost,"pitchfork-portable-source",scope);pitchSource.setCandles(rows);pitchSource.addPitchfork({id:"portable-pitchfork",startTime:rows[20].time,startPrice:rows[20].close,endTime:rows[40].time,endPrice:rows[40].close+8,thirdTime:rows[60].time,thirdPrice:rows[60].close+12,color:"#38bdf8"});const pitchExport=pitchSource.exportDrawings();pitchSource.updatePitchfork("portable-pitchfork",{thirdPrice:rows[60].close+14});const pitchUpdated=pitchSource.readDrawing("portable-pitchfork");pitchSource.setCandles([]);let unavailablePitchPrice="";try{pitchSource.updatePitchfork("portable-pitchfork",{thirdPrice:rows[60].close+15})}catch(error){unavailablePitchPrice=error.message}const pitchAfterUnavailable=pitchSource.readDrawing("portable-pitchfork");pitchSource.destroy();pitchforkHost.remove();
   const pitchTargetHost=document.createElement("div");pitchTargetHost.style.cssText="width:400px;height:200px";document.body.append(pitchTargetHost);const pitchTarget=ChartStudioV5.createStudioV5(pitchTargetHost,"pitchfork-portable-target",scope);pitchTarget.setCandles(rows);const pitchImported=pitchTarget.importDrawings(pitchExport),pitchRestored=pitchTarget.readDrawing("portable-pitchfork");pitchTarget.destroy();pitchTargetHost.remove();
   const badPitchEnvelope=JSON.parse(pitchExport);badPitchEnvelope.drawings[0].options.thirdTime=rows[89].time+900;const badPitchHost=document.createElement("div");badPitchHost.style.cssText="width:400px;height:200px";document.body.append(badPitchHost);const badPitchTarget=ChartStudioV5.createStudioV5(badPitchHost,"pitchfork-portable-invalid",scope);badPitchTarget.setCandles(rows);let badPitchError="";try{badPitchTarget.importDrawings(JSON.stringify(badPitchEnvelope))}catch(error){badPitchError=error.message}const badPitchCount=badPitchTarget.inspect().nativePrimitives;badPitchTarget.destroy();badPitchHost.remove();
   return {source,imported,restored,annotationApi,channelApi,trendApi,rectangleApi,rayApi,fiboApi,fiboPaneCollision,malformed,afterMalformed,malformedTrend,afterMalformedTrend,malformedRectangle,afterMalformedRectangle,malformedFibo,afterMalformedFibo,malformedCustomFibo,afterMalformedCustomFibo,missingChannel,missingChannelCount,conflictError,conflictCount,storageConflict,scopeError,wrongScopeCount,pitchExport,pitchImported,pitchRestored,pitchUpdated,pitchExpectedInitial:rows[60].close+12,pitchExpectedUpdated:rows[60].close+14,unavailablePitchPrice,pitchAfterUnavailable,badPitchError,badPitchCount};
  });
  const transferEnvelope=JSON.parse(drawingTransfer.source);
  assert.equal(transferEnvelope.schemaVersion,1);
  assert.deepEqual(Object.keys(transferEnvelope).sort(),["drawings","schemaVersion","symbol","timeframe"]);
  assert.equal(transferEnvelope.account,undefined);
  assert.deepEqual(drawingTransfer.imported,{imported:12});
  assert.equal(drawingTransfer.restored.count,12);
  assert.deepEqual(drawingTransfer.restored.price,persistedBeforeReload.price);
  assert.deepEqual(drawingTransfer.restored.priceSecond,persistedBeforeReload.priceSecond);
  assert.deepEqual(drawingTransfer.restored.time,persistedBeforeReload.time);
  assert.deepEqual(drawingTransfer.restored.timeSecond,persistedBeforeReload.timeSecond);
  assert.deepEqual(drawingTransfer.restored.text,persistedBeforeReload.text);
  assert.deepEqual(drawingTransfer.restored.trend,persistedBeforeReload.trend);
  assert.deepEqual(drawingTransfer.restored.rectangle,persistedBeforeReload.rectangle);
  assert.deepEqual(drawingTransfer.restored.ellipse,persistedBeforeReload.ellipse);
  assert.deepEqual(drawingTransfer.restored.channel,persistedBeforeReload.channel);
  assert.deepEqual(drawingTransfer.restored.ray,persistedBeforeReload.ray);
  assert.deepEqual(drawingTransfer.restored.fibo,persistedBeforeReload.fibo);
  assert.deepEqual(drawingTransfer.restored.customFibo,persistedBeforeReload.customFibo);
  assert.equal(drawingTransfer.annotationApi.edited.text,"Edited note");
  assert.equal(drawingTransfer.annotationApi.removed,null);
  assert.deepEqual(drawingTransfer.annotationApi.restoredByUndo,drawingTransfer.annotationApi.edited);
  assert.ok(drawingTransfer.annotationApi.invalidText);
  assert.equal(drawingTransfer.channelApi.editedChannel.offsetPrice,persistedBeforeReload.channel.offsetPrice+3);
  assert.deepEqual(drawingTransfer.channelApi.channelUndo,persistedBeforeReload.channel);
  assert.deepEqual(drawingTransfer.channelApi.channelRedo,drawingTransfer.channelApi.editedChannel);
  assert.equal(drawingTransfer.channelApi.removedChannel,null);
  assert.deepEqual(drawingTransfer.channelApi.restoredChannelByUndo,drawingTransfer.channelApi.editedChannel);
  assert.equal(drawingTransfer.channelApi.hiddenChannel.visible,false);
  assert.equal(drawingTransfer.channelApi.hiddenChannelPosition,null);
  assert.ok(drawingTransfer.channelApi.invalidChannel);
  assert.ok(drawingTransfer.channelApi.unloadedChannel);
  assert.equal(drawingTransfer.channelApi.verticalChannel.startTime,drawingTransfer.channelApi.verticalChannel.endTime,"vertical baseline channel is supported");
  assert.ok(drawingTransfer.missingChannel);
  assert.equal(drawingTransfer.missingChannelCount,0,"missing channel anchors reject import atomically");
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
  assert.ok(drawingTransfer.conflictError);
  assert.equal(drawingTransfer.conflictCount,1);
  assert.ok(drawingTransfer.storageConflict.error);
  assert.equal(drawingTransfer.storageConflict.status,"CONFLICT");
  assert.equal(drawingTransfer.storageConflict.count,0);
  assert.equal(drawingTransfer.storageConflict.stored,JSON.stringify({external:true}));
  assert.ok(drawingTransfer.scopeError);
  assert.equal(drawingTransfer.wrongScopeCount,0);
  assert.deepEqual(drawingTransfer.pitchImported,{imported:1});
  assert.equal(drawingTransfer.pitchRestored.id,"portable-pitchfork");
  assert.equal(drawingTransfer.pitchRestored.thirdPrice,drawingTransfer.pitchExpectedInitial);
  assert.equal(drawingTransfer.pitchUpdated.thirdPrice,drawingTransfer.pitchExpectedUpdated);
  assert.match(drawingTransfer.unavailablePitchPrice,/Pitchfork|anchor/i);
  assert.equal(drawingTransfer.pitchAfterUnavailable.thirdPrice,drawingTransfer.pitchExpectedUpdated);
  assert.match(drawingTransfer.badPitchError,/Pitchfork|anchor/i);
  assert.equal(drawingTransfer.badPitchCount,0);
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
  await page.evaluate(()=>{
   const e=window.__v5Screenshot,base=1700100000;
   e.addTextAnnotation({id:"keyboard-text",time:base+12*900,price:4004,text:"Nudge text",color:"#ffffff"});
   e.addTrendLine({id:"keyboard-trend",startTime:base+15*900,startPrice:4003,endTime:base+28*900,endPrice:4010,color:"#ffffff"});
   e.addRay({id:"keyboard-ray",startTime:base+32*900,startPrice:4015,endTime:base+46*900,endPrice:4021,color:"#ffffff"});
   e.addFibonacci({id:"keyboard-fibo",startTime:base+50*900,startPrice:4020,endTime:base+65*900,endPrice:4030,color:"#ffffff"});
   const close=i=>4000+i*.4+Math.sin(i/10)*16+2;
   e.addChannel({id:"keyboard-channel",startTime:base+70*900,startPrice:close(70),endTime:base+82*900,endPrice:close(82)+5,offsetTime:base+74*900,offsetPrice:close(74)+12,color:"#ffffff"});
   e.addMeasurement({id:"keyboard-measure",startTime:base+10*900,startPrice:close(10),endTime:base+24*900,endPrice:close(24)+6,color:"#f7c774"});
  });
  for(const id of ["keyboard-text","keyboard-trend","keyboard-ray","keyboard-fibo","keyboard-channel","keyboard-measure"]){
   const point=await page.evaluate(drawingId=>drawingId==="keyboard-trend"||drawingId==="keyboard-fibo"?window.__v5Screenshot.drawingAnchorPosition(drawingId,"START"):window.__v5Screenshot.drawingPosition(drawingId),id);
   assert.ok(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),`${id} has a keyboard hit target`);
   await page.mouse.move(point.x,point.y);await page.waitForTimeout(80);await page.mouse.click(point.x,point.y);await page.waitForTimeout(30);
   assert.equal(await page.evaluate(()=>window.__v5Screenshot.inspect().selectedDrawingId),id,`${id} is selectable`);
   const before=await page.evaluate(drawingId=>window.__v5Screenshot.readDrawing(drawingId),id);
   await page.keyboard.press("ArrowRight");
   const after=await page.evaluate(drawingId=>window.__v5Screenshot.readDrawing(drawingId),id);
   if(id==="keyboard-text")assert.equal(after.time,before.time+900);
   else {assert.equal(after.startTime,before.startTime+900);assert.equal(after.endTime,before.endTime+900);if(id==="keyboard-channel")assert.equal(after.offsetTime,before.offsetTime+900)}
   assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true,`${id} nudge has one undo entry`);
   assert.deepEqual(await page.evaluate(drawingId=>window.__v5Screenshot.readDrawing(drawingId),id),before);
   assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
   assert.deepEqual(await page.evaluate(drawingId=>window.__v5Screenshot.readDrawing(drawingId),id),after);
  }
  const beforeMeasurementDrag=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure")),measurementStart=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("keyboard-measure","START"));
  await page.mouse.move(measurementStart.x,measurementStart.y);await page.waitForTimeout(80);await page.mouse.down();await page.mouse.move(measurementStart.x+24,measurementStart.y-14,{steps:3});await page.mouse.up();
  const draggedMeasurement=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure"));
  assert.notDeepEqual([draggedMeasurement.startTime,draggedMeasurement.startPrice],[beforeMeasurementDrag.startTime,beforeMeasurementDrag.startPrice],"Measurement start endpoint pointer drag changes its anchor");
  assert.deepEqual([draggedMeasurement.endTime,draggedMeasurement.endPrice],[beforeMeasurementDrag.endTime,beforeMeasurementDrag.endPrice],"Measurement pointer drag preserves the opposite endpoint");
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.undo()),true,"Measurement endpoint gesture is one undo step");
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure")),beforeMeasurementDrag);
  assert.equal(await page.evaluate(()=>window.__v5Screenshot.redo()),true);
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure")),draggedMeasurement);
  const beforeMeasurementEscape=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure")),measurementEscapeAnchor=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("keyboard-measure","END"));
  await page.mouse.move(measurementEscapeAnchor.x,measurementEscapeAnchor.y);await page.waitForTimeout(80);await page.mouse.down();await page.mouse.move(measurementEscapeAnchor.x+20,measurementEscapeAnchor.y-14,{steps:2});await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-measure")),beforeMeasurementEscape,"Escape restores the measurement anchor snapshot");
  const channelAnchors={START:["startTime","startPrice"],END:["endTime","endPrice"],OFFSET:["offsetTime","offsetPrice"]};
  for(const anchor of Object.keys(channelAnchors)){
   const before=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel"));
   const point=await page.evaluate(anchor=>window.__v5Screenshot.drawingAnchorPosition("keyboard-channel",anchor),anchor);
   await page.mouse.move(point.x,point.y);await page.waitForTimeout(80);await page.mouse.down();await page.mouse.move(point.x+15,point.y-12,{steps:3});await page.mouse.up();
   const after=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel"));
   const [timeKey,priceKey]=channelAnchors[anchor];assert.notDeepEqual([after[timeKey],after[priceKey]],[before[timeKey],before[priceKey]],`${anchor} channel handle moves`);
   for(const other of Object.keys(channelAnchors).filter(key=>key!==anchor))for(const field of channelAnchors[other])assert.equal(after[field],before[field],`${anchor} drag preserves ${other} ${field}`);
  }
  const beforeChannelEscape=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel")),escapeAnchor=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("keyboard-channel","OFFSET"));
  await page.mouse.move(escapeAnchor.x,escapeAnchor.y);await page.waitForTimeout(80);await page.mouse.down();await page.mouse.move(escapeAnchor.x+15,escapeAnchor.y-12,{steps:2});await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel")),beforeChannelEscape,"Escape restores the channel anchor snapshot");
  const beforeLockedChannel=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel"));await page.evaluate(()=>window.__v5Screenshot.setDrawingLocked("keyboard-channel",true));
  const lockedAnchor=await page.evaluate(()=>window.__v5Screenshot.drawingAnchorPosition("keyboard-channel","START"));await page.mouse.move(lockedAnchor.x,lockedAnchor.y);await page.waitForTimeout(80);await page.mouse.down();await page.mouse.move(lockedAnchor.x+20,lockedAnchor.y-15,{steps:2});await page.mouse.up();
  const afterLockedChannel=await page.evaluate(()=>window.__v5Screenshot.readDrawing("keyboard-channel"));assert.deepEqual([afterLockedChannel.startTime,afterLockedChannel.startPrice],[beforeLockedChannel.startTime,beforeLockedChannel.startPrice],"Locked channel rejects anchor drags");await page.evaluate(()=>window.__v5Screenshot.setDrawingLocked("keyboard-channel",false));
  const capacityProbe=await page.evaluate(()=>{
   const originalHost=document.getElementById("chart"),originalDisplay=originalHost.style.display;originalHost.style.display="none";
   const host=document.createElement("div");host.style.cssText="width:min(1280px,100vw);height:min(720px,100vh);position:fixed;left:0;top:0;z-index:9999;background:#121416";document.body.append(host);
   const rows=Array.from({length:5000},(_,i)=>{const close=4000+i*.01+Math.sin(i/20)*3+2;return {time:1700000000+i*900,open:close-1,high:close+4,low:close-4,close,tick_volume:100+i}});
   const engine=ChartStudioV5.createStudioV5(host,"capacity-source");let t=performance.now();engine.setCandles(rows);const barsMs=performance.now()-t;
   t=performance.now();for(let i=0;i<14;i++)engine.addMovingAverage({id:`capacity-overlay-${i}`,type:"EMA",period:9+i,source:"close",color:"#61ddf2",lineWidth:1+(i%4)});
   const capacityOscillators=[{kind:"rsi",settings:{period:14}},{kind:"atr",settings:{period:14}},{kind:"macd",settings:{fast:12,slow:26,signal:9}},{kind:"adx",settings:{period:14}},{kind:"stochastic",settings:{period:14,smoothK:3,smoothD:3}},{kind:"cci",settings:{period:20}}];
   for(let i=0;i<capacityOscillators.length;i++)engine.addOscillator({id:`capacity-oscillator-${i}`,...capacityOscillators[i],color:"#f7c774"});
   const indicatorsMs=performance.now()-t,activeIndicatorCount=engine.inspect().averageCount+engine.inspect().nativePaneLines+engine.inspect().oscillatorCount;let combinedIndicatorError="";try{engine.addOscillator({id:"capacity-oscillator-over-limit",kind:"cci",settings:{period:20},color:"#ffffff"})}catch(error){combinedIndicatorError=error.message}const countAfterRejectedIndicator=engine.inspect().averageCount+engine.inspect().nativePaneLines+engine.inspect().oscillatorCount;
   t=performance.now();engine.updateLast({...rows.at(-1),close:rows.at(-1).close+1});const formingUpdateMs=performance.now()-t;
   t=performance.now();let drawingError="",overLimitError="",accepted=0;
   for(let i=0;i<999;i++){
    const start=100+i*4,end=start+50;
    try{engine.addTrendLine({id:`capacity-drawing-${i}`,startTime:rows[start].time,startPrice:rows[start].close+i%7,endTime:rows[end].time,endPrice:rows[end].close+(i%11),color:"#ffffff"});accepted++}
    catch(error){drawingError=error.message;break}
   }
   if(accepted===999)try{engine.addMeasurement({id:"capacity-measurement",startTime:rows[100].time,startPrice:rows[100].close,endTime:rows[150].time,endPrice:rows[150].close+1,color:"#f7c774"});accepted++}catch(error){drawingError=error.message}
   if(accepted===1000)try{engine.addTrendLine({id:"capacity-drawing-over-limit",startTime:rows[100].time,startPrice:rows[100].close,endTime:rows[150].time,endPrice:rows[150].close+1,color:"#ffffff"})}catch(error){overLimitError=error.message}
   const countAfterRejectedDrawing=engine.inspect().nativePrimitives,drawingsMs=performance.now()-t,ids=[0,500,998,"capacity-measurement"].map(i=>i==="capacity-measurement"?i:`capacity-drawing-${i}`),positions=ids.map(id=>engine.drawingPosition(id)),readback=ids.map(id=>engine.readDrawing(id));
   let transferError="",reloadedCount=0,exportedCount=0,exportedBytes=0,otherAccountCount=0,otherTimeframeCount=0,transferBytes=0,transferMs=0,reloadMs=0;
   if(accepted===1000){
    const envelope={schemaVersion:1,symbol:"XAUUSD",timeframe:"M15",drawings:[...Array.from({length:999},(_,i)=>({kind:"TREND",options:engine.readDrawing(`capacity-drawing-${i}`)})),{kind:"MEASURE",options:engine.readDrawing("capacity-measurement")}]};const serialized=JSON.stringify(envelope);transferBytes=serialized.length;
    const transferHost=document.createElement("div");transferHost.style.cssText="width:1280px;height:720px;position:absolute;left:-2000px;top:0";document.body.append(transferHost);
    const target=ChartStudioV5.createStudioV5(transferHost,"capacity-target",{symbol:"XAUUSD",timeframe:"M15"});target.setCandles(rows);t=performance.now();try{target.importDrawings(serialized)}catch(error){transferError=error.message}transferMs=performance.now()-t;const exported=target.exportDrawings();exportedBytes=exported.length;exportedCount=JSON.parse(exported).drawings.length;target.destroy();
    const reloadHost=document.createElement("div");reloadHost.style.cssText="width:1280px;height:720px;position:absolute;left:-2000px;top:0";document.body.append(reloadHost);t=performance.now();const reload=ChartStudioV5.createStudioV5(reloadHost,"capacity-target",{symbol:"XAUUSD",timeframe:"M15"});reload.setCandles(rows);reloadMs=performance.now()-t;reloadedCount=reload.inspect().nativePrimitives;reload.destroy();transferHost.remove();reloadHost.remove();
    const isolationHost=document.createElement("div");isolationHost.style.cssText="width:1280px;height:720px;position:absolute;left:-2000px;top:0";document.body.append(isolationHost);const otherAccount=ChartStudioV5.createStudioV5(isolationHost,"capacity-other",{symbol:"XAUUSD",timeframe:"M15"});otherAccount.setCandles(rows);otherAccount.addTrendLine({id:"unrelated-account",startTime:rows[200].time,startPrice:rows[200].close,endTime:rows[260].time,endPrice:rows[260].close+1,color:"#ffffff"});otherAccountCount=otherAccount.inspect().nativePrimitives;otherAccount.destroy();const otherTimeframe=ChartStudioV5.createStudioV5(isolationHost,"capacity-target",{symbol:"XAUUSD",timeframe:"H1"});otherTimeframe.setCandles(rows);otherTimeframeCount=otherTimeframe.inspect().nativePrimitives;otherTimeframe.destroy();isolationHost.remove();
   }
   window.__capacityEngine=engine;window.__capacityHost=host;window.__capacityOriginalHost=originalHost;window.__capacityOriginalDisplay=originalDisplay;
   return {runtime:{viewport:[innerWidth,innerHeight],devicePixelRatio,userAgent:navigator.userAgent},barsMs,indicatorsMs,formingUpdateMs,activeIndicatorCount,drawingsMs,accepted,drawingError,overLimitError,countAfterRejectedDrawing,combinedIndicatorError,countAfterRejectedIndicator,positions,readback,transferError,transferBytes,transferMs,exportedBytes,exportedCount,reloadMs,reloadedCount,otherAccountCount,otherTimeframeCount};
  });
  const capacitySelectionMs={};
  for(const index of [0,500,998]){
   const id=`capacity-drawing-${index}`,start=100+index*4;await page.evaluate(from=>window.__capacityEngine.setVisibleLogicalRange({from,to:from+130}),start-40);await page.waitForTimeout(60);
   const point=await page.evaluate(drawingId=>window.__capacityEngine.drawingPosition(drawingId),id);assert.ok(point,`${id} is positionable in its view range`);
   const started=Date.now();await page.mouse.move(point.x,point.y);await page.waitForTimeout(30);await page.mouse.click(point.x,point.y);await page.waitForTimeout(30);
   assert.equal(await page.evaluate(()=>window.__capacityEngine.inspect().selectedDrawingId),id,`${id} remains selectable at 1,000 drawings`);capacitySelectionMs[index]=Date.now()-started;
  }
  await page.evaluate(()=>{window.__capacityEngine.destroy();window.__capacityHost.remove();window.__capacityOriginalHost.style.display=window.__capacityOriginalDisplay;delete window.__capacityEngine;delete window.__capacityHost;delete window.__capacityOriginalHost;delete window.__capacityOriginalDisplay});
  console.log(`AT-025 Chromium capacity evidence ${JSON.stringify({runtime:capacityProbe.runtime,barsMs:capacityProbe.barsMs,indicatorsMs:capacityProbe.indicatorsMs,formingUpdateMs:capacityProbe.formingUpdateMs,activeIndicatorCount:capacityProbe.activeIndicatorCount,drawingsMs:capacityProbe.drawingsMs,accepted:capacityProbe.accepted,transferBytes:capacityProbe.transferBytes,transferMs:capacityProbe.transferMs,reloadMs:capacityProbe.reloadMs,reloadedCount:capacityProbe.reloadedCount,otherAccountCount:capacityProbe.otherAccountCount,otherTimeframeCount:capacityProbe.otherTimeframeCount,capacitySelectionMs})}`);
  assert.equal(capacityProbe.activeIndicatorCount,20,"Capacity setup calculates fifteen moving averages plus five native oscillator groups, including Stochastic");
  assert.equal(capacityProbe.accepted,1000,`5k/20/1k target failed at ${capacityProbe.accepted}: ${capacityProbe.drawingError}`);
  assert.ok(capacityProbe.combinedIndicatorError,"20 total overlay/pane instances should be the shared active-indicator limit");
  assert.equal(capacityProbe.countAfterRejectedIndicator,20,"Rejected 21st indicator leaves the 20-instance set unchanged");
  assert.equal(capacityProbe.drawingError,"","all 1,000 drawings must be accepted");
  assert.equal(capacityProbe.overLimitError,"Native drawing limit","drawing 1,001 is rejected");
  assert.equal(capacityProbe.countAfterRejectedDrawing,1000,"Rejected drawing 1,001 leaves the 1,000-object set unchanged");
   assert.ok(capacityProbe.positions.every(Boolean),"drawings near the start, middle, end and measurement remain positionable");
  assert.equal(capacityProbe.readback.length,4);
  assert.equal(capacityProbe.readback[3].id,"capacity-measurement","The capacity slot includes a measurement drawing");
  assert.equal(capacityProbe.transferError,"");
  assert.equal(capacityProbe.transferBytes>65536,true);
  assert.equal(capacityProbe.exportedCount,1000,"schema-v1 export includes all drawings at capacity");
  assert.equal(capacityProbe.exportedBytes,capacityProbe.transferBytes);
  assert.equal(capacityProbe.reloadedCount,1000,"1,000 drawings survive scoped localStorage reload");
  assert.equal(capacityProbe.otherAccountCount,1,"different account scope stays isolated at capacity");
  assert.equal(capacityProbe.otherTimeframeCount,0,"different timeframe scope stays isolated at capacity");
  const touchContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,hasTouch:true,isMobile:true});
  try{
   const touchPage=await touchContext.newPage();await touchPage.goto("http://127.0.0.1:8872/chart_studio_v5/fixture.html",{waitUntil:"networkidle"});await touchPage.waitForFunction(()=>window.__chartV5Ready===true);
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
  const positionOverlayProbe=await page.evaluate(()=>{
   const host=document.createElement("div");host.style.cssText="width:900px;height:360px;position:fixed;left:-2000px;top:0";document.body.append(host);
   const engine=ChartStudioV5.createStudioV5(host,"titan",{symbol:"XAUUSD",timeframe:"M15"}),bars=Array.from({length:5},(_,i)=>({time:1700600000+i*900,open:4100,high:4110,low:4090,close:4105}));engine.setCandles(bars);
   const snapshot={scope:{account:"titan",symbol:"XAUUSD",timeframe:"M15"},source:"MT5_VERIFIED",canExecute:false,currency:"USD",marginMode:2,positions:[{ticket:"1001",side:"BUY",entryPrice:4101,stopLoss:4090,takeProfit:4120,volume:.2,profit:3.5,swap:-.1,currency:"USD",usdConversion:{state:"AVAILABLE",source:"ACCOUNT_CURRENCY",amountsUsd:{profit:3.5,swap:-.1}}},{ticket:"1002",side:"SELL",entryPrice:4108,stopLoss:null,takeProfit:null,volume:.1,profit:-1.25,swap:0,currency:"USD",usdConversion:{state:"AVAILABLE",source:"ACCOUNT_CURRENCY",amountsUsd:{profit:-1.25,swap:0}}}]};
   let supported=typeof engine.setPositionOverlays==="function";let first=null,rejected={};
   if(supported){first=engine.setPositionOverlays(snapshot);const before=engine.inspect().positionOverlayCount;
    for(const [name,bad] of Object.entries({account:{...snapshot,scope:{...snapshot.scope,account:"other"}},symbol:{...snapshot,scope:{...snapshot.scope,symbol:"EURUSD"}},timeframe:{...snapshot,scope:{...snapshot.scope,timeframe:"H1"}}})){try{engine.setPositionOverlays(bad)}catch(_){rejected[name]=true}if(engine.inspect().positionOverlayCount!==0)throw Error("scope mismatch retained stale position lines");engine.setPositionOverlays(snapshot)}
    for(const [name,bad] of Object.entries({source:{...snapshot,source:"UNVERIFIED"},executable:{...snapshot,canExecute:true},duplicate:{...snapshot,positions:[snapshot.positions[0],snapshot.positions[0]]},malformed:{...snapshot,positions:[{...snapshot.positions[0],entryPrice:0}]}})){try{engine.setPositionOverlays(bad)}catch(_){rejected[name]=true}}
    const afterInvalid=engine.inspect().positionOverlayCount,details=engine.readPositionOverlays();engine.setPositionOverlays({...snapshot,marginMode:0,positions:[{ticket:"1003",side:"BUY",entryPrice:4103,stopLoss:null,takeProfit:null,volume:.3,profit:2,swap:0,currency:"USD",usdConversion:{state:"AVAILABLE",source:"ACCOUNT_CURRENCY",amountsUsd:{profit:2,swap:0}}}]});const replaced=engine.readPositionOverlays();
    const drawings=engine.exportDrawings(),accountBefore=engine.inspect().positionOverlayCount;engine.changeAccount("goldm15");const accountAfter=engine.inspect().positionOverlayCount;
    engine.changeAccount("titan");engine.setCandles(bars);engine.setPositionOverlays(snapshot);engine.destroy();host.remove();
    return {supported,first,rejected,before,afterInvalid,details,replaced,drawings,accountBefore,accountAfter};
   }
   engine.destroy();host.remove();return {supported};
  });
  assert.equal(positionOverlayProbe.supported,true,"v5 adapter exposes read-only position overlays");
  assert.equal(positionOverlayProbe.first.count,4);
  assert.deepEqual(positionOverlayProbe.first.lines.map(line=>line.label),["BUY Entry","BUY SL","BUY TP","SELL Entry"]);
  assert.deepEqual(positionOverlayProbe.rejected,{account:true,symbol:true,timeframe:true,source:true,executable:true,duplicate:true,malformed:true});
  assert.equal(positionOverlayProbe.before,4);
  assert.equal(positionOverlayProbe.afterInvalid,4,"Invalid same-scope snapshots leave the current overlays intact");
  assert.equal(positionOverlayProbe.details.positionCount,2);
  assert.equal(positionOverlayProbe.details.zoneCount,2,"one SL and one TP zone are present for the hedged ticket that has both stops");
  assert.equal(positionOverlayProbe.details.currency,"USD");
  assert.equal(positionOverlayProbe.details.marginMode,"HEDGING");
  assert.deepEqual(positionOverlayProbe.details.positions.map(position=>position.ticket),["1001","1002"],"hedged broker tickets remain separate");
  assert.match(positionOverlayProbe.details.positions[0].label,/BUY 0\.20L #1001/);
  assert.match(positionOverlayProbe.details.positions[0].label,/P\/L 3\.50 USD · Swap -0\.10 USD/);
  assert.match(positionOverlayProbe.details.positions[0].label,/USD P\/L 3\.50 · Swap -0\.10/);
  assert.equal(positionOverlayProbe.replaced.positionCount,1);
  assert.equal(positionOverlayProbe.replaced.marginMode,"NETTING");
  assert.match(positionOverlayProbe.replaced.positions[0].label,/NETTING/);
  assert.equal(positionOverlayProbe.drawings,"{\"schemaVersion\":1,\"symbol\":\"XAUUSD\",\"timeframe\":\"M15\",\"drawings\":[]}");
  assert.equal(positionOverlayProbe.accountBefore,1);
  assert.equal(positionOverlayProbe.accountAfter,0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  await page.screenshot({path:path.join(folder,"chart-studio-v5-poc.png"),fullPage:true});
  console.log("PASS native v5 chart, configurable oscillator panes, move/resize, averages, volume, account isolation, no writes");
 }finally{if(browser)await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);if(server.exitCode===null){server.kill();await Promise.race([new Promise(resolve=>server.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,1000))])}}
})().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exitCode=1});
