"use strict";
const assert=require("node:assert/strict");
const Draft=require("../static/chart-studio-ticket-draft.js");

const scope={account:"titan",symbol:"XAUUSD",timeframe:"M15"};
const draft=Draft.create(scope);
draft.set("orderType","BUY_LIMIT");
draft.set("volumeLots","0.01");
draft.set("entryPrice","4000");
draft.set("slPrice","3990");
draft.set("tpPrice","4020");
assert.equal(draft.setChartEntry(4001.25,2),true);
assert.equal(draft.read().entryPrice,"4001.25");
assert.equal(draft.read().slPrice,"3990");
assert.equal(draft.read().tpPrice,"4020");
assert.deepEqual(draft.payload(),{schemaVersion:1,account:"titan",symbol:"XAUUSD",
 orderType:"BUY_LIMIT",volumeLots:0.01,entryPrice:4001.25,slPrice:3990,tpPrice:4020});

draft.setPreview({account:"titan",symbol:"XAUUSD",status:"READY_FOR_CONFIRMATION",
 canExecute:false,canCommit:true,previewId:"token-token-token-token-token-token-token",
 order:{orderType:"BUY_LIMIT",volumeLots:0.01}});
assert.equal(draft.confirmationText(),"titan XAUUSD BUY_LIMIT 0.01");
assert.equal(draft.canCommit(true,"titan XAUUSD BUY_LIMIT 0.01"),true);
assert.equal(draft.canCommit(false,"titan XAUUSD BUY_LIMIT 0.01"),false);
assert.equal(draft.canCommit(true,"titan XAUUSD BUY 0.01"),false);

draft.setScope({account:"titan_m5",symbol:"XAUUSD.p",timeframe:"M15"});
assert.equal(draft.read().entryPrice,"");
assert.equal(draft.read().preview,null);
assert.equal(draft.canCommit(true,"titan XAUUSD BUY_LIMIT 0.01"),false);
assert.throws(()=>draft.set("orderType","MARKET"));
assert.throws(()=>draft.set("entryPrice","Infinity"));
assert.equal(draft.setChartEntry(Infinity,2),false);
console.log("PASS ticket draft: chart price transfer, strict payload, typed confirmation, and scope cleanup");
