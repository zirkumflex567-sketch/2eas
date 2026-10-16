const {chromium}=require("playwright");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8865","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error("fixture server crashed");try{if((await fetch("http://127.0.0.1:8865/static/chart-studio-fixture.html")).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250));if(i===59)throw Error("fixture server timed out")}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});const page=await browser.newPage({viewport:{width:1280,height:850}});const api=[];
  page.on("request",request=>{const url=new URL(request.url());if(url.pathname.includes("/api/"))api.push({method:request.method(),path:url.pathname,account:url.searchParams.get("account")});});
  page.on("pageerror",error=>{throw error});
  await page.goto("http://127.0.0.1:8865/static/chart-studio-fixture.html",{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.evaluate(()=>{const chart=window.__chart,add=chart.addLineSeries.bind(chart);window.__autoFibSeries=[];chart.addLineSeries=options=>{const target=add(options);return new Proxy(target,{get(series,key){if(key==="setData")return rows=>{if(String(options.title||"").startsWith("Auto-Fibo"))window.__autoFibSeries.push({title:options.title,rows:rows.map(row=>({...row}))});return series.setData(rows)};const value=Reflect.get(series,key,series);return typeof value==="function"?value.bind(series):value}})}});
  await page.locator("#cs-beta-toggle").click();
  const checkbox=page.locator('.cs-indicator-control input[data-kind="autoFib"]');await checkbox.waitFor();await checkbox.check();
  await page.waitForFunction(()=>ChartStudioIndicators.settings().autoFib.enabled===true&&window.__autoFibSeries.some(row=>row.rows.length>0));
  const live=await page.evaluate(()=>{const rows=window.__autoFibSeries.filter(row=>row.rows.length);const first=rows[0].rows[0];return {settings:ChartStudioIndicators.settings().autoFib,series:rows.map(row=>row.title),firstTime:first.time,firstReadout:ChartStudioIndicators.readout(first.time),chartBars:window.__chartSmokeCandles.map(row=>row.time)}});
  assert.equal(live.settings.enabled,true);assert.equal(live.series.length,7);assert.ok(live.firstReadout.includes("confirmed-swing-auto-fib-v1"));assert.ok(live.firstReadout.includes("MT5_VERIFIED"));assert.ok(live.firstReadout.includes("bestätigt ab"));
  const confirmation=await page.evaluate(()=>{const line=window.__autoFibSeries.find(row=>row.rows.length);return Date.parse(ChartStudioIndicators.readout(line.rows[0].time).match(/bestätigt ab ([^·]+)/)[1])/1000});
  assert.ok(live.firstTime>=confirmation,"overlay cannot appear before the right-side pivot confirmation closes");
  await page.evaluate(()=>ChartStudioIndicators.switchAccount("titan_m5","XAUUSD.p"));assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().autoFib.enabled),false,"another account must not inherit this indicator setting");
  await page.evaluate(()=>ChartStudioIndicators.switchAccount("titan","XAUUSD"));assert.equal(await page.evaluate(()=>ChartStudioIndicators.settings().autoFib.enabled),true,"account-scoped setting restores for its owner");
  assert.ok(api.every(request=>request.method==="GET"&&request.account!=="blueberry"));
  console.log(JSON.stringify({series:live.series.length,points:live.chartBars.length,firstLineTime:live.firstTime,confirmedAt:confirmation,readout:live.firstReadout,apiRequests:api.length,mutations:api.filter(request=>request.method!=="GET").length}));
 }finally{if(browser)await browser.close();server.kill()}
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
