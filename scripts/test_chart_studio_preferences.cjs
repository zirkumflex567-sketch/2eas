"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("static/chart-studio-beta.js","utf8");
const context={window:{}};
vm.runInNewContext(source,context,{filename:"chart-studio-beta.js"});
const preferences=context.window.ChartStudioBeta.preferences;
assert.ok(preferences,"Chart Studio exposes validated preference helpers");
const tools=["cursor","edit","horizontal","vertical","text","trend","rect","ray","channel","fib","ruler"];
assert.deepEqual(Array.from(preferences.normalizeFavorites(["trend","fib","trend","unknown"])),["trend","fib"]);
assert.equal(preferences.normalizeFavorites(["plan"]).length,0,"broker planning tools cannot be favorited as drawing shortcuts");
assert.deepEqual(JSON.parse(JSON.stringify(preferences.normalizeShortcuts({trend:"g",rect:"R",channel:"g",plan:"p",cursor:"Delete"}))),
 {trend:"g",rect:"r"},"only unique unmodified letters for drawing tools are accepted");
assert.equal(preferences.resolveShortcut({key:"G",altKey:false,ctrlKey:false,metaKey:false,shiftKey:false},{trend:"g"}),"trend");
for(const event of [
 {key:"g",altKey:true},{key:"g",ctrlKey:true},{key:"g",metaKey:true},{key:"g",shiftKey:true},
 {key:"Delete"},{key:"Backspace"},{key:"Escape"},{key:"1"},{key:" "}
])assert.equal(preferences.resolveShortcut(event,{trend:"g"}),null);
console.log(`PASS favorite/shortcut preference contracts across ${tools.length} drawing tools`);
