"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const window={};
vm.runInNewContext(fs.readFileSync("static/chart-studio-market-structure.js","utf8"),{window,Date,Intl,Number,Math,Set,Map,JSON,Object,Array,String,RegExp});
const api=window.ChartStudioMarketStructure.core;
const stamp=value=>Date.parse(value)/1000;

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
console.log("PASS Chart Studio market structure: IANA DST, OHLC coverage, opening range, confirmed pivots, equal levels and sweep hypotheses");
