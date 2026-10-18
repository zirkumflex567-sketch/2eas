"use strict";
const assert=require("node:assert/strict");
const Feed=require("../static/chart-studio-v5-oscillator-feed.js");
const calls=[],rows=new Map();
const engine={
 addTransientOscillator(options){calls.push({method:"add",options:{...options,settings:{...options.settings}}});rows.set(options.id,{...options,settings:{...options.settings}})},
 updateTransientOscillator(id,patch){calls.push({method:"update",id,patch});rows.set(id,{...rows.get(id),...patch})},
 removeTransientOscillator(id){calls.push({method:"remove",id});return rows.delete(id)},
 oscillatorOptions:id=>rows.get(id)||null,
};
const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
const settings={rsi:{enabled:false,period:14},macd:{enabled:false,fast:12,slow:26,signal:9},
 stochastic:{enabled:true,period:14,smoothK:3,smoothD:3},atr:{enabled:false,period:14},
 adx:{enabled:false,period:14},stochrsi:{enabled:false,period:14,stochPeriod:14,smoothK:3,smoothD:3},
 cci:{enabled:false,period:20},momentum:{enabled:false,period:10},roc:{enabled:false,period:10},obv:{enabled:false},mfi:{enabled:false,period:14}};
const instances=[{id:"macd-one",kind:"macd",fast:8,slow:21,signal:5,visible:true,color:"#44ffaa",lineWidth:3,label:"Fast MACD"}];
const snapshot=overrides=>({scope,source:"CHART_STUDIO_LOCAL",canExecute:false,oscillatorAccount:scope.account,settings,instances,...overrides});
const bridge=Feed.create(engine,scope);
assert.deepEqual(bridge.update(snapshot(),bridge.beginRead()),{applied:true,count:2});
assert.equal(rows.get("preview-osc-c-stochastic").settings.period,14);
assert.equal(bridge.read("instance-macd-one").settings.fast,8);
const countAfterFirst=calls.length;
assert.deepEqual(bridge.update(snapshot(),bridge.beginRead()),{applied:true,count:2});
assert.equal(calls.length,countAfterFirst,"unchanged local config does not rebuild native series");
const changed=structuredClone(settings);changed.stochastic.period=21;
assert.deepEqual(bridge.update(snapshot({settings:changed}),bridge.beginRead()),{applied:true,count:2});
assert.equal(bridge.read("catalog-stochastic").settings.period,21);
assert.equal(bridge.inspect().count,2);
assert.deepEqual(bridge.update(snapshot({scope:{...scope,timeframe:"M5"}}),bridge.beginRead()),{applied:false,reason:"SCOPE_MISMATCH"});
assert.equal(bridge.inspect().count,0,"scope mismatch clears prior pane values");
assert.equal(rows.size,0);
bridge.setScope({account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"});
assert.deepEqual(bridge.update({scope:{account:"xau5m_m5",symbol:"XAUUSD.p",timeframe:"M15"},source:"CHART_STUDIO_LOCAL",canExecute:false,
 oscillatorAccount:"xau5m_m5",settings:{...settings,stochastic:{enabled:true,period:14,smoothK:3,smoothD:3,unexpected:true}},instances:[]},bridge.beginRead()),
 {applied:false,reason:"INVALID_CONFIGS"});
assert.equal(bridge.inspect().count,0,"invalid source configuration fails closed");
assert.deepEqual(calls.filter(call=>call.method==="add").map(call=>call.options.id),["preview-osc-c-stochastic","preview-osc-i-pzbd09","preview-osc-c-stochastic"]);
assert.ok(calls.some(call=>call.method==="remove"));
console.log("PASS v5 read-only oscillator feed: catalog and instances sync, scope/config errors clear transient panes");
