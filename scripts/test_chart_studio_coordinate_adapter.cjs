"use strict";
const assert=require("node:assert/strict");
global.window={};
require("../static/chart-studio-beta.js");
const create=window.ChartStudioBeta?.coordinates?.create;
assert.equal(typeof create,"function","ChartStudioBeta.coordinates.create should be exported");

function fixture(version,coordinateTime){
 let range={from:2,to:9},rangeWrites=[],handlers=new Set(),unsubscribeCalls=0;
 const scale={
  timeToCoordinate(time){return time===1700000000?240:null},
  coordinateToTime(x){return x===240?coordinateTime:null},
  getVisibleLogicalRange(){return {...range}},
  setVisibleLogicalRange(value){range={...value};rangeWrites.push({...value})},
  subscribeVisibleLogicalRangeChange(handler){handlers.add(handler)},
  unsubscribeVisibleLogicalRangeChange(handler){unsubscribeCalls++;handlers.delete(handler)},
 };
 const chart={timeScale:()=>scale,subscribeCrosshairMove(handler){handlers.add(handler)},
  unsubscribeCrosshairMove(handler){unsubscribeCalls++;handlers.delete(handler)}};
 const series={priceToCoordinate(price){return price===123.5?75:null},coordinateToPrice(y){return y===75?123.5:null}};
 return {adapter:create({apiVersion:version,chart,series,scope:{account:"titan",symbol:"XAUUSD",timeframe:"M15"}}),
  rangeWrites,handlers,unsubscribeCalls:()=>unsubscribeCalls,emit:param=>[...handlers].forEach(handler=>handler(param))};
}

for(const version of [4,5]){
 const day={year:2024,month:1,day:2},time=version===4?1700000000:day;
 const f=fixture(version,time),adapter=f.adapter;
 assert.equal(adapter.apiVersion,version);
 assert.equal(adapter.timeToX(1700000000),240);
 assert.equal(adapter.timeToX(1700000100),null);
 assert.equal(adapter.xToTime(240),version===4?1700000000:Date.UTC(2024,0,2)/1000);
 assert.equal(adapter.xToTime(-1),null);
 assert.equal(adapter.priceToY(123.5),75);
 assert.equal(adapter.priceToY(100),null);
 assert.equal(adapter.yToPrice(75),123.5);
 assert.equal(adapter.yToPrice(-1),null);
 const original=adapter.visibleLogicalRange();original.from=99;
 assert.deepEqual(adapter.visibleLogicalRange(),{from:2,to:9},"Range reads are detached copies");
 adapter.setVisibleLogicalRange({from:3,to:8});
 assert.deepEqual(f.rangeWrites,[{from:3,to:8}]);
 assert.throws(()=>adapter.setVisibleLogicalRange({from:8,to:8}),TypeError);
 assert.throws(()=>adapter.setVisibleLogicalRange({from:NaN,to:9}),TypeError);
 assert.equal(f.rangeWrites.length,1,"Invalid ranges never reach the chart");
 assert.throws(()=>adapter.timeToX(NaN),TypeError);
 assert.throws(()=>adapter.priceToY(Infinity),TypeError);
 const seen=[];const unsubscribe=adapter.subscribeCrosshair(value=>seen.push(value));
 const oldHandler=[...f.handlers][0];
 const seriesData=new Map([[{}, {close:3}]]);
 adapter.setScope({account:"goldm15",symbol:"EURUSD",timeframe:"H1"});
 oldHandler({time:1700000000,logical:4,seriesData});
 assert.equal(seen.length,0,"Old-scope queued events are discarded");
 f.emit({time:time,logical:5,seriesData});
 assert.equal(seen.length,1);
 assert.deepEqual(seen[0].scope,{account:"goldm15",symbol:"EURUSD",timeframe:"H1"});
 assert.ok(Object.isFrozen(seen[0].scope));
 assert.equal(seen[0].time,version===4?1700000000:Date.UTC(2024,0,2)/1000);
 assert.equal(seen[0].logical,5);
 assert.equal(seen[0].seriesData,seriesData);
 unsubscribe();unsubscribe();
 assert.equal(f.handlers.size,0);
 assert.ok(f.unsubscribeCalls()>=2,"Scope rebind and unsubscribe detach old handlers");
}

assert.throws(()=>create({apiVersion:3,chart:{},series:{},scope:{account:"a",symbol:"X",timeframe:"M1"}}),TypeError);
assert.throws(()=>create({apiVersion:4,chart:{},series:{},scope:{account:"",symbol:"X",timeframe:"M1"}}),TypeError);
console.log("PASS versioned chart coordinates v4/v5, UTC/BusinessDay, ranges and scoped crosshair lifecycle");
