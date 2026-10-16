"use strict";
const assert = require("node:assert/strict");
global.window = {};
require("../static/chart-studio-multi-chart.js");
const api = window.ChartStudioMultiChart;
assert.ok(api, "ChartStudioMultiChart should expose its contract");

assert.equal(api.validatePaneCount(2), 2);
assert.equal(api.validatePaneCount(4), 4);
assert.throws(() => api.validatePaneCount(3), TypeError);
assert.equal(api.storageKey("titan"), "chartStudio.multiChart.v1:titan");
assert.throws(() => api.storageKey(""), TypeError);
const localStore={value:new Map(),getItem(key){return this.value.get(key)||null},setItem(key,value){this.value.set(key,value)}};
api.saveState("titan",{paneCount:4,linkTime:true,linkCrosshair:false,panes:[{symbol:"XAUUSD.p",timeframe:"M15"}]},localStore);
assert.deepEqual(api.loadState("titan",localStore),{version:1,paneCount:4,linkTime:true,linkCrosshair:false,panes:[{symbol:"XAUUSD.p",timeframe:"M15"}],namedLayouts:[],favorites:[]});
assert.equal(api.loadState("blueberry",localStore),null,"workspace preferences remain account-isolated");
const namedStore={value:new Map(),getItem(key){return this.value.get(key)||null},setItem(key,value){this.value.set(key,value)}};
const namedLayout=api.saveNamedLayout("titan"," London setup ",{paneCount:2,linkTime:true,linkCrosshair:false,panes:[{symbol:"XAUUSD.p",timeframe:"M15"},{symbol:"EURUSD",timeframe:"H1"}]},namedStore);
assert.equal(namedLayout.name,"London setup");
assert.deepEqual(api.loadState("titan",namedStore).namedLayouts,[namedLayout]);
assert.equal(api.saveNamedLayout("titan","london setup",{paneCount:4,linkTime:false,linkCrosshair:true,panes:[]},namedStore).name,"london setup","names are unique without case sensitivity");
assert.equal(api.loadState("titan",namedStore).namedLayouts.length,1,"saving a matching name replaces it");
assert.equal(api.removeNamedLayout("titan","London setup",namedStore),true);
assert.equal(api.loadState("titan",namedStore).namedLayouts.length,0);
assert.equal(api.removeNamedLayout("titan","missing",namedStore),false);
assert.equal(api.saveNamedLayout("xau5m_m5","London setup",{paneCount:2,panes:[]},namedStore).name,"London setup","saved names are per account");
assert.throws(()=>api.saveNamedLayout("titan"," ",{paneCount:2,panes:[]},namedStore),/layout name/i);
assert.throws(()=>api.saveNamedLayout("titan","bad\nname",{paneCount:2,panes:[]},namedStore),/layout name/i);
assert.deepEqual(api.toggleFavorite([],"XAUUSD.p"),["XAUUSD.p"]);
assert.deepEqual(api.toggleFavorite(["XAUUSD.p"],"XAUUSD.p"),[]);
assert.throws(()=>api.toggleFavorite([],"invalid symbol"),/symbol/i);
assert.throws(()=>api.toggleFavorite(Array.from({length:50},(_,i)=>`XAU${i}`),"XAUUSD"),RangeError);
api.saveState("titan",{paneCount:2,linkTime:false,linkCrosshair:false,panes:[],favorites:["XAUUSD.p","XAUUSD.p","invalid symbol"]},namedStore);
assert.deepEqual(api.loadState("titan",namedStore).favorites,["XAUUSD.p"],"favorites are validated and deduplicated in the account-local store");
const legacyStore={value:new Map([[api.storageKey("legacy"),JSON.stringify({version:1,paneCount:2,linkTime:false,linkCrosshair:false,panes:[{symbol:"XAUUSD.p",timeframe:"M15"}]})]]),getItem(key){return this.value.get(key)||null},setItem(key,value){this.value.set(key,value)}};
assert.deepEqual(api.loadState("legacy",legacyStore).namedLayouts,[],"older v1 settings remain readable without named layouts");
const paneLimitStore={value:new Map(),getItem(key){return this.value.get(key)||null},setItem(key,value){this.value.set(key,value)}};
const twoPaneLayout=api.saveNamedLayout("titan","Two only",{paneCount:2,panes:[{symbol:"A",timeframe:"M1"},{symbol:"B",timeframe:"M5"},{symbol:"hidden",timeframe:"D1"}]},paneLimitStore);
assert.equal(twoPaneLayout.panes.length,2,"named layouts contain only visible panes");
for(let i=0;i<19;i++)api.saveNamedLayout("titan",`Layout ${i}`,{paneCount:2,panes:[]},paneLimitStore);
assert.throws(()=>api.saveNamedLayout("titan","Too many",{paneCount:2,panes:[]},paneLimitStore),RangeError);

const expected = { account: "titan", symbol: "XAUUSD.p", timeframe: "M15" };
const valid = { accountId: expected.account, symbol: expected.symbol, timeframe: expected.timeframe, source: "MT5_VERIFIED", canExecute: false,
  candles: [{ time: 1700000000, open: 1, high: 3, low: 0, close: 2 }] };
assert.equal(api.validateCandleResponse(valid, expected), true);
assert.equal(api.validateSymbolCatalog({account:"titan",source:"MT5_VERIFIED",canExecute:false,symbols:[{account:"titan",symbol:"XAUUSD.p",source:"MT5_VERIFIED",canExecute:false}]},"titan","XAUUSD.p"),true);
assert.equal(api.validateSymbolCatalog({account:"blueberry",source:"MT5_VERIFIED",canExecute:false,symbols:[{account:"blueberry",symbol:"XAUUSD.p",source:"MT5_VERIFIED",canExecute:false}]},"titan","XAUUSD.p"),false);
for (const invalid of [
  { ...valid, accountId: "blueberry" },
  { ...valid, symbol: "XAUUSD" },
  { ...valid, timeframe: "H1" },
  { ...valid, source: "CACHE" },
  { ...valid, canExecute: true },
  { ...valid, candles: [{ ...valid.candles[0], close: NaN }] },
]) assert.equal(api.validateCandleResponse(invalid, expected), false);

assert.deepEqual(api.visibleRangeToUtc({ from: 1700000000, to: 1700000900 }),
  { from: 1700000000, to: 1700000900 });
assert.equal(api.visibleRangeToUtc({ from: 4, to: 3 }), null);
assert.equal(api.visibleRangeToUtc({ from: NaN, to: 3 }), null);

const bars = [
  { time: 100, close: 10 }, { time: 200, close: 20 }, { time: 300, close: 30 },
];
assert.deepEqual(api.crosshairTarget(bars, 250), { time: 200, price: 20 });
assert.equal(api.crosshairTarget(bars, 99), null);
assert.equal(api.crosshairTarget(bars, NaN), null);
console.log("PASS multi-chart pane, account, verified-feed, UTC range and crosshair contracts");
