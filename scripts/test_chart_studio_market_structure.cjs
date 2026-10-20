"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const window={};
vm.runInNewContext(fs.readFileSync("static/chart-studio-market-structure.js","utf8"),{window,Date,Intl,Number,Math,Set,Map,JSON,Object,Array,String,RegExp});
const api=window.ChartStudioMarketStructure.core;
const brokerReadGate=api.createBrokerReadGate();
const initialScope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
const loadedBars=[{time:1,open:1,high:2,low:1,close:2}];
brokerReadGate.setScope(initialScope);
assert.equal(brokerReadGate.claim(initialScope,[]),false,"Calendar and quote reads wait until the primary chart bars are ready");
assert.equal(brokerReadGate.claim(initialScope,loadedBars),false,"Chart bars must first be explicitly marked ready");
brokerReadGate.markBarsReady(initialScope,loadedBars);
assert.equal(brokerReadGate.claim(initialScope,loadedBars),true,"Ancillary broker reads start once chart bars are ready");
assert.equal(brokerReadGate.claim(initialScope,loadedBars),false,"A ready scope is read at most once");
const nextScope={account:"goldm15",symbol:"XAUUSD",timeframe:"M15"};
brokerReadGate.setScope(nextScope);
assert.equal(brokerReadGate.claim(nextScope,loadedBars),false,"A scope switch must wait for its own chart bars");
brokerReadGate.markBarsReady(nextScope,loadedBars);
assert.equal(brokerReadGate.claim(nextScope,loadedBars),true,"The switched scope starts its own reads after new bars are marked ready");
const stamp=value=>Date.parse(value)/1000;

const calendarBaseline=[
 {id:"1",revision:3,timeServer:"2026-10-16T14:30:00",timeMode:"DATETIME",name:"CPI",currency:"USD",status:"SCHEDULED"},
 {id:"2",revision:1,timeServer:"2026-10-17T00:00:00",timeMode:"DATE",name:"Employment",currency:"USD",status:"SCHEDULED"}
];
const calendarCurrent=[
 {id:"1",revision:4,timeServer:"2026-10-16T14:30:00",timeMode:"DATETIME",name:"CPI",currency:"USD",status:"SCHEDULED"},
 {id:"3",revision:1,timeServer:"2026-10-18T09:00:00",timeMode:"DATETIME",name:"PMI",currency:"USD",status:"SCHEDULED"}
];
const calendarDiff=api.diffCalendarEvents(calendarBaseline,calendarCurrent);
assert.deepEqual(Array.from(calendarDiff.current.map(item=>[item.id,item.change,item.previousRevision])),[
 ["1","REVISION_CHANGED",3],["3","NEWLY_LISTED",null]
],"A higher MT5 revision is exposed as a revision change, not silently replaced");
assert.deepEqual(Array.from(calendarDiff.noLongerListed.map(item=>[item.id,item.status])),[
 ["2","UNKNOWN_NOT_IN_CURRENT_FEED"]
],"An event missing from a complete feed is explicitly unknown, never called cancelled");
const calendarHistory=api.updateCalendarHistory({schema:"mt5-calendar-history-v1",events:calendarBaseline,noLongerListed:[]},calendarCurrent,"2026-10-16T10:00:00Z");
assert.equal(calendarHistory.noLongerListed[0].firstMissingAtUtc,"2026-10-16T10:00:00Z");
const laterHistory=api.updateCalendarHistory(calendarHistory,[calendarCurrent[1]],"2026-10-16T10:01:00Z");
assert.equal(laterHistory.noLongerListed[0].status,"UNKNOWN_NOT_IN_CURRENT_FEED","A missing event remains explicitly unknown across refreshes");

const windows=api.sessionWindows(stamp("2026-03-06T00:00:00Z"),stamp("2026-03-10T00:00:00Z"),[
 {id:"new-york",label:"New York",timeZone:"America/New_York",start:"08:00",end:"10:00"}
]);
const friday=windows.find(item=>item.localDate==="2026-03-06"),monday=windows.find(item=>item.localDate==="2026-03-09");
assert.equal(friday.startUtc,"2026-03-06T13:00:00.000Z","New York session uses standard-time UTC offset before DST");
assert.equal(monday.startUtc,"2026-03-09T12:00:00.000Z","New York session follows the spring DST transition");
assert.equal(api.sessionWindows(stamp("2026-03-09T00:00:00Z"),stamp("2026-03-10T00:00:00Z"),[
 {id:"bad",label:"bad",timeZone:"Local/Guess",start:"08:00",end:"10:00"}
]).length,0,"Invalid IANA timezones fail closed");
assert.equal(api.analyze([], {timeframeSeconds:900,asOfUtc:null}).bars,0,"Without a verified quote time no candles are marked closed");
const mismatch=api.sessionWindows(stamp("2026-03-23T00:00:00Z"),stamp("2026-03-31T00:00:00Z"),[
 {id:"asia",label:"Asia",timeZone:"Asia/Tokyo",start:"09:00",end:"18:00"},
 {id:"frankfurt",label:"Frankfurt",timeZone:"Europe/Berlin",start:"08:00",end:"17:00"},
 {id:"london",label:"London",timeZone:"Europe/London",start:"08:00",end:"17:00"},
 {id:"new-york",label:"New York",timeZone:"America/New_York",start:"08:00",end:"17:00"}
]);
const weekMismatch=mismatch.filter(item=>item.localDate==="2026-03-23");
assert.deepEqual(Array.from(weekMismatch.map(item=>[item.id,item.startUtc])),[
 ["asia","2026-03-23T00:00:00.000Z"],["frankfurt","2026-03-23T07:00:00.000Z"],
 ["london","2026-03-23T08:00:00.000Z"],["new-york","2026-03-23T12:00:00.000Z"]
],"UK/US DST mismatch week preserves each market's local open and normalized UTC time");
assert.equal(mismatch.find(item=>item.id==="london"&&item.localDate==="2026-03-30").startUtc,"2026-03-30T07:00:00.000Z");
assert.equal(mismatch.find(item=>item.id==="new-york"&&item.localDate==="2026-03-30").startUtc,"2026-03-30T12:00:00.000Z");

const start=stamp("2026-03-09T12:00:00Z"),bars=[];
for(let i=0;i<8;i++)bars.push({time:start+i*900,open:100+i,high:102+i,low:99+i,close:101+i});
const complete=api.analyze(bars,{asOfUtc:start+8*900,timeframeSeconds:900,
 sessions:[{id:"custom",label:"Test",timeZone:"America/New_York",start:"08:00",end:"10:00"}],openingRangeMinutes:60});
assert.equal(complete.sessions[0].coverage,"COMPLETE");
assert.equal(complete.sessions[0].high,109);
assert.equal(complete.sessions[0].low,99);
assert.deepEqual(Array.from([complete.sessions[0].openingRange.high,complete.sessions[0].openingRange.low]),[105,99]);
assert.equal(complete.sessions[0].openingRange.coverage,"COMPLETE");

// Volume zones are closed-bar OHLC ranges triggered by a same-source trailing median.
const volumeStart=stamp("2026-01-05T00:00:00Z"),volumeBars=Array.from({length:26},(_,i)=>({time:volumeStart+i*900,open:100,high:102,low:99,close:101,tick_volume:i===20?30:10,real_volume:0}));
const volumeInputSnapshot=JSON.stringify(volumeBars),volumeModel=api.analyze(volumeBars,{asOfUtc:volumeStart+26*900,timeframeSeconds:900,sessions:[],volumeZones:true,volumeLookback:20,volumeMultiplier:2});
assert.equal(volumeModel.volumeZones.status,"AVAILABLE");assert.equal(volumeModel.volumeZones.algorithmVersion,"volume-range-median-v1");
assert.equal(volumeModel.volumeZones.zones.length,1);assert.equal(volumeModel.volumeZones.zones[0].source,"TICK_VOLUME_PROXY");
assert.equal(volumeModel.volumeZones.zones[0].medianVolume,10);assert.equal(volumeModel.volumeZones.zones[0].volume,30);
assert.equal(volumeModel.volumeZones.zones[0].start,volumeBars[20].time);assert.equal(volumeModel.volumeZones.zones[0].end,volumeStart+26*900);
assert.equal(JSON.stringify(volumeBars),volumeInputSnapshot,"Volume-zone analysis must not mutate broker candles");
const extendedVolumeBars=Array.from({length:50},(_,i)=>({time:volumeStart+i*900,open:100,high:102,low:99,close:101,tick_volume:i===20?30:10,real_volume:0}));
const boundedZone=api.analyze(extendedVolumeBars,{asOfUtc:volumeStart+50*900,timeframeSeconds:900,sessions:[],volumeZones:true}).volumeZones.zones[0];
assert.equal(boundedZone.end,volumeStart+40*900,"A volume zone is bounded to twenty chart bars after its trigger");
assert.equal(api.analyze(volumeBars,{asOfUtc:volumeStart+26*900,timeframeSeconds:900,sessions:[],volumeZones:true,volumeMultiplier:11}).volumeZones.status,"INVALID_CONFIGURATION");
const realBars=volumeBars.map((bar,i)=>({...bar,real_volume:i===20?30:10,tick_volume:i===20?300:1}));
const realZones=api.analyze(realBars,{asOfUtc:volumeStart+26*900,timeframeSeconds:900,sessions:[],volumeZones:true}).volumeZones;
assert.equal(realZones.zones[0].source,"REAL_VOLUME");assert.equal(realZones.zones[0].medianVolume,10);
const futureVolume=api.analyze([...volumeBars,{time:volumeStart+26*900,open:110,high:111,low:109,close:110,tick_volume:100,real_volume:0}],{asOfUtc:volumeStart+26*900,timeframeSeconds:900,sessions:[],volumeZones:true});
assert.deepEqual(futureVolume.volumeZones.zones.map(zone=>zone.time),volumeModel.volumeZones.zones.map(zone=>zone.time),"Future/forming OHLC and volume cannot trigger or extend zones");
const shortVolume=api.analyze(volumeBars.slice(0,20),{asOfUtc:volumeStart+20*900,timeframeSeconds:900,sessions:[],volumeZones:true});
assert.equal(shortVolume.volumeZones.status,"WARMUP");assert.equal(shortVolume.volumeZones.zones.length,0);
const zoneDraws=[],zoneLabels=[],zoneContext=new Proxy({fillStyle:"",strokeStyle:"",fillRect(...args){zoneDraws.push({fillStyle:this.fillStyle,rect:args})},fillText(text){zoneLabels.push(String(text))}},{get(target,key){if(key in target)return target[key];return ()=>{}},set(target,key,value){target[key]=value;return true}});
const zone=volumeModel.volumeZones.zones[0];api.draw(zoneContext,{...volumeModel,sessions:[],previous:{},pivots:[],equalLevels:[],sweeps:[]},{timeToX:time=>time===zone.start?20:time===volumeStart+25*900?75:time===volumeStart+24*900?70:null,priceToY:price=>price===102?30:60},{w:200,h:100});
assert.ok(zoneDraws.some(item=>item.fillStyle==="rgba(255,174,87,.11)"&&JSON.stringify(item.rect)==="[20,30,60,30]"),"Tick-volume OHLC zones must be rendered as a bounded shaded chart range");
assert.ok(zoneLabels.some(label=>label.includes("Tickvolumenproxy-OHLC-Range · 2× Median")),"Rendered zones identify their volume source and threshold");
const gapped=api.analyze(bars.filter((_,i)=>i!==2),{asOfUtc:start+8*900,timeframeSeconds:900,
 sessions:[{id:"custom",label:"Test",timeZone:"America/New_York",start:"08:00",end:"10:00"}],openingRangeMinutes:60});
assert.equal(gapped.sessions[0].coverage,"PARTIAL","Missing OHLC intervals are explicit");
assert.equal(gapped.sessions[0].openingRange.coverage,"PARTIAL");
assert.equal(gapped.weekendGaps[0].label,"Datenlücke · Wochenend-/Handelspause möglich, Ursache ungeprüft","Missing bars are described as data gaps, not asserted as weekends");

const origin=stamp("2026-01-05T00:00:00Z"),peaks=[105,106,110,106,105,106,107,110,107,105,106,107,112,108,106],structureBars=peaks.map((high,i)=>({time:origin+i*60,open:104,high,low:100,close:i===12?109:104}));
const structure=api.analyze(structureBars,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],openingRangeMinutes:60,
 swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01});
const highPivots=structure.pivots.filter(item=>item.kind==="HIGH");
assert.ok(highPivots.some(item=>item.time===origin+2*60));
assert.ok(highPivots.every(item=>item.confirmedAtUtc>item.timeUtc),"Pivots record their right-bar confirmation time");
const early=api.analyze(structureBars.slice(0,4),{asOfUtc:origin+4*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,tickSize:0.01});
assert.equal(early.pivots.some(item=>item.time===origin+2*60),false,"A pivot is invisible until its right-side confirmation bars close");
const equal=structure.equalLevels.find(item=>item.kind==="HIGH");
assert.ok(equal,"Confirmed equal highs produce a geometrical hypothesis");
assert.equal(equal.evidenceType,"STRUCTURE_LIQUIDITY_HYPOTHESIS");
assert.ok(structure.sweeps.some(item=>item.direction==="ABOVE"&&item.evidenceType==="STRUCTURE_LIQUIDITY_HYPOTHESIS"),"A wick above a confirmed equal high that closes below is labeled only as a hypothesis");
const stillOpen=api.analyze(structureBars,{asOfUtc:origin+13*60+30,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:60,confirmCandles:structureBars});
assert.equal(stillOpen.sweeps.length,0,"An open/future ConfirmTF candle cannot confirm a sweep");
const lows=structureBars.map((bar,i)=>({time:bar.time,open:120,high:125,low:220-bar.high,close:i===12?121:120}));
const lowStructure=api.analyze(lows,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:60,confirmCandles:lows});
assert.ok(lowStructure.equalLevels.some(item=>item.kind==="LOW"));
assert.ok(lowStructure.sweeps.some(item=>item.direction==="BELOW"&&item.evidenceType==="STRUCTURE_LIQUIDITY_HYPOTHESIS"));
const h1Confirm=api.analyze(structureBars,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:3600,confirmCandles:[{time:origin+12*60,open:109,high:111,low:108,close:109},{time:origin+13*60,open:109,high:110,low:107,close:108} ]});
assert.equal(h1Confirm.sweeps.length,0,"A ConfirmTF candle later than asOf cannot confirm an already detected structure");
for(const invalidConfirmTf of [30,2700,NaN,Infinity]){
 const invalid=api.analyze(structureBars,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:invalidConfirmTf,confirmCandles:structureBars});
 assert.equal(invalid.confirmStatus,"INVALID_TIMEFRAME",`Unsupported ConfirmTF ${invalidConfirmTf} is reported as UNKNOWN`);
 assert.equal(invalid.sweeps.length,0,"An invalid ConfirmTF cannot confirm a sweep");
}
const missingConfirm=api.analyze(structureBars,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:900,confirmCandles:[]});
assert.equal(missingConfirm.confirmStatus,"NO_HISTORY","An empty ConfirmTF feed is explicitly unavailable");
assert.equal(missingConfirm.sweeps.length,0,"Missing ConfirmTF history cannot confirm a sweep");
const openConfirm=api.analyze(structureBars,{asOfUtc:origin+15*60,timeframeSeconds:60,sessions:[],swingStrength:2,atrPeriod:3,equalAtrMultiplier:0.1,tickSize:0.01,confirmTimeframeSeconds:900,confirmCandles:[{time:origin+10*60,open:109,high:111,low:108,close:109}]});
assert.equal(openConfirm.confirmStatus,"NO_HISTORY","An open ConfirmTF candle is not confirmation history");
assert.equal(openConfirm.sweeps.length,0,"An open ConfirmTF candle cannot confirm a sweep");
console.log("PASS Chart Studio market structure: IANA DST, OHLC coverage, opening range, confirmed pivots, equal levels and sweep hypotheses");
