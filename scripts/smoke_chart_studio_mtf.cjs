"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process"),assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8873","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:8873/static/chart-studio-fixture.html")).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250));if(i===59)throw Error("fixture server timed out")}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),requests=[],errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>requests.push({method:r.method(),url:r.url()}));
  let deferM5=false,releaseM5=null,forgedTf=null,failedTf=null;const m5Starts=[];
  const waitForM5=()=>new Promise(resolve=>m5Starts.push(resolve));
  await page.route("**/api/candles?*",async route=>{
   const request=route.request(),url=new URL(request.url()),tf=url.searchParams.get("tf");assert.equal(request.method(),"GET");
   if(deferM5&&tf==="M5"){await new Promise(resolve=>{releaseM5=resolve;m5Starts.shift()?.()});}
   if(failedTf===tf)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"fixture unavailable"})});
   const step={D1:86400,H4:14400,H1:3600,M15:900,M5:300}[tf],asOf=Date.parse("2025-01-06T01:00:00Z")/1000;
   const fridayClose=Date.parse("2025-01-03T21:00:00Z")/1000;
   const candles=tf==="H1"?Array.from({length:279},(_,i)=>{const time=fridayClose-(278-i)*3600,close=1800+i*.3;return {time,open:close-.2,high:close+.4,low:close-.3,close,tick_volume:100}}):Array.from({length:280},(_,i)=>{const time=asOf-(281-i)*step,close=1800+i*1.3;return {time,open:close-1,high:close+3,low:close-2,close,tick_volume:100}});
   if(tf==="H1"){const time=fridayClose+51*3600,close=1800+279*.3;candles.push({time,open:close-.2,high:close+.4,low:close-.3,close,tick_volume:100});}
   candles.push({time:asOf,open:1000000,high:1000010,low:999990,close:1000005,tick_volume:999});
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accountId:forgedTf===tf?"wrong-account":url.searchParams.get("account"),symbol:url.searchParams.get("symbol"),timeframe:tf,source:"MT5_VERIFIED",canExecute:false,candles})});
  });
  await page.goto("http://127.0.0.1:8873/static/chart-studio-fixture.html");await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();const panel=page.locator("details.cs-mtf-panel");await panel.locator("summary").click();await panel.locator("[data-mtf-asof]").fill("2025-01-06T01:00");
  await panel.locator("[data-mtf-refresh]").click();await page.waitForFunction(()=>document.querySelectorAll(".cs-mtf-panel tbody tr").length===5&&document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("5/5"));
  assert.equal(await panel.locator("tbody tr").count(),5);assert.equal(await panel.locator("tbody tr td").nth(0).textContent().then(t=>t.includes("READY")),true);
  assert.equal(await panel.locator("tbody tr").nth(1).locator("th").textContent(),"H4");
  assert.equal(await panel.locator("tbody tr").nth(1).locator("td").last().textContent(),"280","open/as-of H4 bar must be excluded from source rows");
  assert.match(await panel.locator("tbody tr").nth(2).locator("td").first().textContent(),/SESSION_HEURISTIC.*Broker-Sitzung ungeprüft.*Wochenendlücke heuristisch toleriert/,"heuristically accepted weekend closure must remain visible as unverified session coverage");
  for(const req of requests.filter(x=>new URL(x.url).pathname.endsWith("/api/candles"))){const u=new URL(req.url);assert.equal(req.method,"GET");assert.equal(u.searchParams.get("account"),"titan");assert.equal(u.searchParams.get("symbol"),"XAUUSD");assert.equal(u.searchParams.get("count"),"1000");}
  assert.equal(requests.some(x=>x.method!=="GET"),false,"MTF read must emit no write requests");
  forgedTf="H4";failedTf="M15";await panel.locator("[data-mtf-refresh]").click();
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Unvollständige Quellenantwort"));
  assert.match(await panel.locator("tbody tr").nth(1).locator("td").first().textContent(),/UNAVAILABLE/,"forged account identity must be rejected");
  assert.match(await panel.locator("tbody tr").nth(3).locator("td").first().textContent(),/UNAVAILABLE/,"failed MT5 read must remain unavailable");
  forgedTf=null;failedTf=null;
  deferM5=true;let started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("symbol-race M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("tbody tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-symbol result must not render after symbol change");
  deferM5=true;started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.account("goldm15"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("tbody tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-scope result must not render after account/symbol/timeframe change");
  started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("second M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.timeframe("H1"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("tbody tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-timeframe result must not render after timeframe change");
  assert.equal(errors.length,0,errors.join("; "));
  console.log("PASS MTF Chromium five verified timeframe reads, explicit UTC as-of, no writes, and stale-response cancellation");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(error=>{console.error(error);process.exitCode=1});
