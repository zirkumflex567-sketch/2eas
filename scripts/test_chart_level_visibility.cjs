const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const context={window:{localStorage:storage}};vm.runInNewContext(fs.readFileSync("static/chart-level-visibility.js","utf8"),context);
const levels=context.window.DashboardChartLevelVisibility;
assert.equal(levels.definitions.length,10);
const titan=levels.read("titan");
assert.equal(titan.daily_high,true);assert.equal(titan.weekly_poc,true);assert.equal(titan.daily_vah,true);
assert.equal(levels.set("titan","daily_poc",false),true);
assert.equal(levels.read("titan").daily_poc,false);
assert.equal(levels.read("goldm15").daily_poc,true,"Accounts have separate visibility preferences");
assert.equal(levels.hasChoice("titan","daily_poc"),true);
assert.equal(levels.hasChoice("titan","daily_high"),false);
for(const account of ["xau5m_m5","titan_m5","xau5m_500","goldm15","titan_500_2","xau5m_m15","titan_25k"]){
 assert.equal(levels.set(account,"daily_poc",false),true,`${account} is an authorized demo level-preference scope`);
 assert.equal(levels.read(account).daily_poc,false,`${account} keeps its own level preference`);
}
assert.equal(levels.set("blueberry","daily_poc",false),false,"the protected Blueberry account is never a preference scope");
assert.equal(levels.hasChoice("blueberry","daily_poc"),false,"Blueberry never stores a preference");
assert.equal(levels.read("blueberry").daily_poc,true,"unsupported account defaults do not persist a Blueberry choice");
assert.equal(levels.set("titan","daily_high",1),false);
values.set("2eas:chart-level-visibility:v1:titan",'{"daily_high":"false","evil":true}');
assert.equal(levels.read("titan").daily_high,true,"Invalid preferences fail closed to defaults");
assert.equal(levels.read("titan").evil,undefined);
const unavailable={getItem:()=>null,setItem:()=>{}};
assert.equal(levels.set("goldm15","weekly_high",false,unavailable),true);
assert.equal(levels.read("goldm15",unavailable).weekly_high,false,"Session choice works when persistence silently fails");
assert.equal(levels.hasChoice("goldm15","weekly_high",unavailable),true,"Explicit weekly override survives unavailable persistence");
console.log("PASS individual daily/weekly level visibility preferences, account scope, and validation");
