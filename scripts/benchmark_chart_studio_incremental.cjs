"use strict";
// Reproducible calculator-only microbenchmark. This does not measure browser
// rendering, full-history signature scans, server polling, or target hardware.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {performance}=require("node:perf_hooks"),assert=require("node:assert/strict");
const source=fs.readFileSync(path.join(__dirname,"..","static","chart-studio-indicators.js"),"utf8");
const context={window:{},localStorage:{getItem(){return null},setItem(){}},console};
vm.runInNewContext(source,context,{filename:"chart-studio-indicators.js"});
const api=context.window.ChartStudioIndicators;
const BAR_COUNT=5000,ITERATIONS=100,WARMUP=20;
const baseBars=Array.from({length:BAR_COUNT},(_,i)=>{
 const close=4100+Math.sin(i/13)*9+Math.cos(i/47)*5+i*.003;
 return {time:1700000000+i*900,open:close-.3,high:close+1+(i%5)*.1,low:close-1-(i%7)*.08,
  close,tick_volume:700+i%97,real_volume:0};
});
const cases=[
 ["rsi",{period:200}],
 ["atr",{period:200}],
 ["macd",{fast:50,slow:300,signal:50}]
];
const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
function candle(index,last){
 const close=last.close+Math.sin(index*.31)*.12+Math.cos(index*.07)*.04;
 return {time:last.time,open:last.open,high:Math.max(last.high,close+.2),low:Math.min(last.low,close-.2),close,
  tick_volume:last.tick_volume+1,real_volume:last.real_volume};
}
function run(kind,settings,mode){
 const bars=baseBars.map(row=>({...row}));
 const stream=mode==="incremental"?api.createIncremental(kind,bars,settings):null;
 const samples=[];let checksum=0;
 const cpuStart=process.cpuUsage(),heapStart=process.memoryUsage().heapUsed,rssStart=process.memoryUsage().rss;
 for(let i=0;i<WARMUP+ITERATIONS;i++){
  const next=candle(i,bars.at(-1));bars[bars.length-1]=next;
  const start=performance.now();
  const result=mode==="incremental"?stream.updateLast(next):api.calculate(kind,bars,settings);
  const elapsed=performance.now()-start;
  const rows=mode==="incremental"?Object.values(result).flat():Object.values(result).flat();
  checksum+=rows.at(-1)?.value||0;
  if(i>=WARMUP)samples.push(elapsed);
 }
 const cpu=process.cpuUsage(cpuStart),memory=process.memoryUsage();
 const cpuMs=(cpu.user+cpu.system)/1000;
 return {mode,iterations:ITERATIONS,meanMs:+(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(4),
  p50Ms:+quantile(samples,.5).toFixed(4),p95Ms:+quantile(samples,.95).toFixed(4),p99Ms:+quantile(samples,.99).toFixed(4),
  cpuMs:+cpuMs.toFixed(3),cpuMsPerUpdate:+(cpuMs/ITERATIONS).toFixed(6),heapDeltaBytes:memory.heapUsed-heapStart,
  rssDeltaBytes:memory.rss-rssStart,checksum:+checksum.toFixed(6)};
}
const results=[];
for(const [kind,settings] of cases){
 const full=run(kind,settings,"full"),incremental=run(kind,settings,"incremental");
 const bars=baseBars.map(row=>({...row})),stream=api.createIncremental(kind,bars,settings);
 for(let i=0;i<ITERATIONS;i++){
  const next=candle(WARMUP+i,bars.at(-1));bars[bars.length-1]=next;stream.updateLast(next);
 }
 const fullResult=api.calculate(kind,bars,settings),incrementalResult=stream.snapshot();
 assert.equal(JSON.stringify(incrementalResult),JSON.stringify(fullResult),kind+" final parity");
 results.push({kind,settings,full,incremental,meanSpeedup:+(full.meanMs/Math.max(incremental.meanMs,1e-9)).toFixed(2),parity:"PASS"});
}
console.log(JSON.stringify({benchmark:"chart-studio-incremental-calculator-only",node:process.version,
 barCount:BAR_COUNT,warmupIterations:WARMUP,measuredIterations:ITERATIONS,
 limitations:["No chart rendering or data-signature scan","No server polling","Not a target-hardware or duration-load acceptance"],results},null,2));
