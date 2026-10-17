"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const source=fs.readFileSync("static/chart-studio-drawing-geometry.js","utf8");
const window={};vm.runInNewContext(source,{window},{filename:"drawing-geometry.js"});
const g=window.ChartStudioDrawingGeometry;
assert.equal(g.expected("horizontal"),1);
assert.equal(g.expected("vertical"),1);
assert.equal(g.expected("text"),1);
assert.equal(g.expected("channel"),3);
assert.equal(g.expected("ruler"),2);
assert.equal(g.expected("fibfan"),2);
assert.equal(g.expected("fibtime"),2);
assert.equal(g.expected("fibtrend"),3);
assert.equal(g.expected("__proto__"),0);
const a={time:1700000000,price:4100},b={time:1700000900,price:4120},c={time:1700001800,price:4160};
for(const kind of ["trend","rect","fib","fibfan","fibtime","ray","ruler"])
 assert.equal(g.validDrawing({kind,anchors:[a,b]}),true);
assert.equal(g.validDrawing({kind:"fibtrend",anchors:[a,b,c]}),true);
assert.equal(g.validDrawing({kind:"channel",anchors:[a,b,c]}),true);
assert.equal(g.validDrawing({kind:"fibtime",anchors:[a,{...a,price:a.price+1}]}),false);
assert.equal(g.validDrawing({kind:"vertical",anchors:[a]}),true);
assert.equal(g.validDrawing({kind:"vertical",anchors:[a,b]}),false);
assert.equal(g.validDrawing({kind:"text",anchors:[a]}),true);
assert.equal(g.validDrawing({kind:"channel",anchors:[a,b]}),false);
assert.equal(g.validDrawing({kind:"channel",anchors:[a,b,c,{time:2,price:1}]}),false);
assert.equal(g.validDrawing({kind:"ruler",anchors:[{time:1,price:NaN},b]}),false);
assert.equal(g.validDrawing({kind:"ruler",anchors:[{time:-1,price:1},b]}),false);
const ray=g.clipRay({x:100,y:200},{x:200,y:150},600);
assert.equal(ray[1].x,600);assert.equal(ray[1].y,-50);
const back=g.clipRay({x:400,y:100},{x:300,y:200},600);
assert.equal(back[1].x,0);assert.equal(back[1].y,500);
assert.equal(g.clipRay({x:4,y:4},{x:10,y:10},-2),null);
const fan=g.fibonacciFanRays({x:100,y:200},{x:300,y:100},600,[.382,.5,.618]);
assert.deepEqual(JSON.parse(JSON.stringify(fan.map(line=>line.ratio))),[.382,.5,.618]);
for(const [index,y] of [104.5,75,45.5].entries())assert.ok(Math.abs(fan[index].points[1].y-y)<1e-9);
assert.ok(fan.every(line=>line.points[0].x===100&&line.points[0].y===200&&line.points[1].x===600));
assert.equal(g.fibonacciFanRays({x:100,y:200},{x:300,y:100},600,[.5,.5]),null);
assert.equal(g.fibonacciFanRays({x:100,y:200},{x:300,y:100},600,[1.2]),null);
const timeZones=g.fibonacciTimeZones({x:100,y:20},{x:200,y:40},600);
assert.deepEqual(JSON.parse(JSON.stringify(timeZones)),[
 {factor:0,x:100},{factor:1,x:200},{factor:2,x:300},{factor:3,x:400},{factor:5,x:600}
]);
assert.equal(g.fibonacciTimeZones({x:100,y:20},{x:200,y:40},600,[0,2,1]),null);
assert.equal(g.fibonacciTimeZones({x:100,y:20},{x:200,y:40},600,[0,1001]),null);
const fibTrend=g.fibonacciTrendExtensions({x:100,y:200},{x:200,y:100},{x:300,y:150},500,300);
assert.deepEqual(JSON.parse(JSON.stringify(fibTrend)),[
 {ratio:0,points:[{x:300,y:150},{x:500,y:150}]},
 {ratio:.382,points:[{x:300,y:111.8},{x:500,y:111.8}]},
 {ratio:.5,points:[{x:300,y:100},{x:500,y:100}]},
 {ratio:.618,points:[{x:300,y:88.2},{x:500,y:88.2}]},
 {ratio:1,points:[{x:300,y:50},{x:500,y:50}]}
]);
assert.deepEqual(JSON.parse(JSON.stringify(g.fibonacciTrendExtensions({x:100,y:100},{x:200,y:200},{x:300,y:150},500,250,[0,1]))),[
 {ratio:0,points:[{x:300,y:150},{x:500,y:150}]},
 {ratio:1,points:[{x:300,y:250},{x:500,y:250}]}
]);
assert.deepEqual(JSON.parse(JSON.stringify(g.fibonacciTrendExtensions({x:100,y:200},{x:200,y:100},{x:-20,y:150},500,300,[0]))),[
 {ratio:0,points:[{x:0,y:150},{x:500,y:150}]}
]);
assert.equal(g.fibonacciTrendExtensions({x:100,y:200},{x:200,y:100},{x:501,y:150},500,300,[0]),null);
assert.equal(g.fibonacciTrendExtensions({x:100,y:200},{x:200,y:100},{x:300,y:150},500,300,[.5,.5]),null);
const ch=g.parallelChannel({x:10,y:10},{x:30,y:20},{x:20,y:40});
assert.equal(ch.shift,25);
assert.equal(ch.second[0].y,35);assert.equal(ch.second[1].y,45);
assert.equal(ch.mid[0].y,22.5);
const measure=g.measure(a,b,900);
assert.equal(measure.delta,20);
assert.ok(Math.abs(measure.percent-20/4100*100)<1e-10);
assert.equal(measure.bars,1);
const candles=[
 {time:1700000000,open:4100,high:4110,low:4090,close:4105},
 {time:1700000900,open:4105,high:4120,low:4100,close:4118}
];
const toX=t=>100+(t-1700000000)/900*30,toY=p=>400-(p-4000)*2;
const snap=g.nearestSnap({time:1700000000,price:4109},candles,toX,toY,12);
assert.equal(snap.field,"high");assert.equal(snap.price,4110);
assert.equal(g.nearestSnap({time:1700000000,price:4200},candles,toX,toY,12),null);
assert.equal(g.nearestSnap({time:1700000000,price:4109},[],toX,toY,12),null);
assert.equal(source.includes("order_send("),false);
console.log("PASS Chart Studio drawing kinds, clipping, channels, ruler metrics, OHLC snap and no broker writes");
