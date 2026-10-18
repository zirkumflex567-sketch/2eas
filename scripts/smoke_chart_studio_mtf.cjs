"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process"),assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8873","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:8873/static/chart-studio-fixture.html")).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250));if(i===59)throw Error("fixture server timed out")}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),requests=[],errors=[];page.setDefaultTimeout(5000);page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>requests.push({method:r.method(),url:r.url()}));
  let deferM5=false,releaseM5=null,forgedTf=null,failedTf=null,futureH4Spike=false,neutralH4=false;const m5Starts=[];
  const waitForM5=()=>new Promise(resolve=>m5Starts.push(resolve));
  await page.route("**/api/candles?*",async route=>{
   const request=route.request(),url=new URL(request.url()),tf=url.searchParams.get("tf");assert.equal(request.method(),"GET");
   if(deferM5&&tf==="M5"){await new Promise(resolve=>{releaseM5=resolve;m5Starts.shift()?.()});}
   if(failedTf===tf)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"fixture unavailable"})});
   const step={D1:86400,H4:14400,H1:3600,M15:900,M5:300}[tf],asOf=Date.parse("2025-01-06T01:00:00Z")/1000;
   const candles=tf==="H1"?makeSessionH1(asOf):Array.from({length:280},(_,i)=>{const time=asOf-(281-i)*step,close=tf==="H4"&&neutralH4?1800:1800+i*1.3;return {time,open:close-1,high:close+3,low:close-2,close,tick_volume:100}});
   candles.push({time:asOf+(tf==="H4"&&futureH4Spike?step:0),open:1000000,high:1000010,low:999990,close:1000005,tick_volume:999});
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accountId:forgedTf===tf?"wrong-account":url.searchParams.get("account"),symbol:url.searchParams.get("symbol"),timeframe:tf,source:"MT5_VERIFIED",canExecute:false,candles})});
  });
  await page.goto("http://127.0.0.1:8873/static/chart-studio-fixture.html");await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();const panel=page.locator("details.cs-mtf-panel");await panel.locator(":scope > summary").click();await panel.locator("[data-mtf-asof]").fill("2025-01-06T01:00");
  const ruleEditor=panel.locator("[data-mtf-rule-editor]");assert.equal(await ruleEditor.count(),1,"nested rule editor is available");
  await ruleEditor.locator(":scope > summary").click();
  assert.match(await ruleEditor.textContent(),/manueller EMA-Kontext.*keine EA-Regel/i);
  for(const tf of ["D1","H4","H1","M15","M5"]){const select=ruleEditor.locator(`[data-mtf-rule="${tf}"]`);assert.equal(await select.count(),1);assert.deepEqual(await select.locator("option").allTextContents(),["Keine Anforderung (ANY)","UP","DOWN","NEUTRAL"]);}
  const saveButton=ruleEditor.locator("[data-mtf-save]");await saveButton.click();
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 1"));
  const profileKey=await page.evaluate(()=>localStorage.key(0));assert.match(profileKey,/titan.*XAUUSD/i);const revision1=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),profileKey);assert.equal(revision1.revision,1);
  await ruleEditor.locator('[data-mtf-rule="H1"]').selectOption("UP");await saveButton.click();await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 2"));
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,profileKey),2);
  const preserved=await page.evaluate(key=>localStorage.getItem(key),profileKey);
  await page.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error("fixture quota failure")}});
  await ruleEditor.locator('[data-mtf-rule="M5"]').selectOption("DOWN");await saveButton.click();assert.match(await panel.locator("[data-mtf-rule-status]").textContent(),/Speichern fehlgeschlagen/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),profileKey),preserved,"storage write failure preserves prior profile");
  await page.evaluate(()=>{Storage.prototype.setItem=window.__storageSet});await ruleEditor.locator('[data-mtf-rule="M5"]').selectOption("ANY");
  await saveButton.click();await page.waitForTimeout(100);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,profileKey),2,"no-op save does not increment revision");
  await panel.locator("[data-mtf-refresh]").click();await page.waitForTimeout(1200);if(!(await panel.locator("[data-mtf-status]").textContent()).includes("as-of"))throw Error("refresh diagnostic: "+JSON.stringify({status:await panel.locator("[data-mtf-status]").textContent(),errors,requests:requests.slice(-5)}));
  assert.match(await panel.locator("[data-mtf-status]").textContent(),/5\/5/);
  assert.equal(await panel.locator("[data-mtf-rows] tr").count(),5);assert.equal(await panel.locator("[data-mtf-rows] tr td").nth(0).textContent().then(t=>t.includes("READY")),true);
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).locator("th").textContent(),"H4");
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).locator("td").last().textContent(),"280","open/as-of H4 bar must be excluded from source rows");
  const h4BeforeFuture=await panel.locator("[data-mtf-rows] tr").nth(1).innerText();futureH4Spike=true;
  const futureResponses=Array.from({length:5},()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/api/candles")));
  await panel.locator("[data-mtf-refresh]").click();await Promise.all(futureResponses);await page.waitForTimeout(100);
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).innerText(),h4BeforeFuture,"future H4 bar cannot change closed-bar features or rule output");futureH4Spike=false;
  assert.match(await panel.locator("[data-mtf-rows] tr").nth(2).locator("td").first().textContent(),/SESSION_HEURISTIC.*Broker-Sitzung ungeprüft.*Sessionlücke heuristisch toleriert/,"heuristically accepted daily and weekend closures must remain visible as unverified session coverage");
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: (SATISFIED|PARTIAL|INCOMPLETE|CONTRADICTORY)/);
  assert.equal(await panel.locator("[data-mtf-rule-result] tbody tr").count(),5,"aggregate includes per-frame expected/actual/status/reason/source time");
  await ruleEditor.locator('[data-mtf-rule="M15"]').selectOption("DOWN");await saveButton.click();
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 3"));
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: (SATISFIED|PARTIAL|INCOMPLETE|CONTRADICTORY)/,"saved criteria re-evaluate the same-scope feature result");
  const saveRevision=async revision=>{await saveButton.click();await page.waitForFunction(rev=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes(`Revision ${rev}`),revision)};
  const setRule=async(tf,value)=>ruleEditor.locator(`[data-mtf-rule="${tf}"]`).selectOption(value);
  const refreshToAggregate=async aggregate=>{const waits=Array.from({length:5},()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/api/candles")));await panel.locator("[data-mtf-refresh]").click();await Promise.all(waits);await page.waitForFunction(value=>document.querySelector("[data-mtf-rule-result]")?.textContent.includes(`Aggregate: ${value}`),aggregate)};
  for(const tf of ["D1","H4","H1","M15","M5"])await setRule(tf,"ANY");await saveRevision(4);
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: UNCONFIGURED/);
  await setRule("H1","UP");await saveRevision(5);assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: SATISFIED/);
  await setRule("D1","DOWN");await saveRevision(6);assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: CONTRADICTORY/);
  await setRule("D1","ANY");await setRule("H4","UP");await saveRevision(7);neutralH4=true;await refreshToAggregate("PARTIAL");neutralH4=false;
  await setRule("M5","UP");await saveRevision(8);failedTf="M5";await refreshToAggregate("INCOMPLETE");failedTf=null;
  await page.evaluate(()=>window.ChartStudioBeta.timeframe("H1"));await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  await page.evaluate(()=>window.ChartStudioBeta.timeframe("M15"));await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  await page.evaluate(()=>window.ChartStudioBeta.account("goldm15"));await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("UNCONFIGURED"));
  await page.evaluate(()=>window.ChartStudioBeta.account("titan"));await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  for(const req of requests.filter(x=>new URL(x.url).pathname.endsWith("/api/candles"))){const u=new URL(req.url);assert.equal(req.method,"GET");assert.equal(u.searchParams.get("account"),"titan");assert.equal(u.searchParams.get("symbol"),"XAUUSD");assert.equal(u.searchParams.get("count"),"1000");assert.equal(u.searchParams.get("before"),String(Math.floor(Date.parse("2025-01-06T01:00:00Z")/1000)),"all refresh paths use exclusive floor(as-of) cursor");}
  assert.equal(requests.some(x=>x.method!=="GET"),false,"MTF read must emit no write requests");
  assert.equal(requests.some(x=>/\/api\/.*(?:profile|rule)/i.test(new URL(x.url).pathname)),false,"rule profiles never use network endpoints");
  const beforeRefreshAt=requests.filter(x=>new URL(x.url).pathname.endsWith("/api/candles")).length;
  assert.equal(await page.evaluate(()=>window.ChartStudioBeta.refreshMtfAt({account:"titan",symbol:"XAUUSD",timeframe:"M15",asOfUtc:"2025-02-30T01:00:00Z"})),false,"invalid normalized ISO date must be rejected");
  assert.equal(requests.filter(x=>new URL(x.url).pathname.endsWith("/api/candles")).length,beforeRefreshAt,"invalid as-of does not issue candle requests");
  assert.equal(await page.evaluate(()=>window.ChartStudioBeta.refreshMtfAt({account:"titan",symbol:"XAUUSD",timeframe:"M15",asOfUtc:"2025-01-06T01:00:00Z"})),true);
  const refreshAtRequests=requests.filter(x=>new URL(x.url).pathname.endsWith("/api/candles")).slice(beforeRefreshAt);assert.equal(refreshAtRequests.length,5);
  for(const req of refreshAtRequests)assert.equal(new URL(req.url).searchParams.get("before"),String(Math.floor(Date.parse("2025-01-06T01:00:00Z")/1000)));
  await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("UNCONFIGURED"));
  const malformedKey="chart-studio-mtf-rules:v1:titan:EURUSD";await page.evaluate(key=>localStorage.setItem(key,"{broken"),malformedKey);
  await page.evaluate(()=>window.ChartStudioBeta.symbol("XAUUSD"));await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Ungültiges gespeichertes JSON"));
  await saveButton.click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),malformedKey),"{broken","malformed JSON is never overwritten");
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({schemaVersion:1})),malformedKey);
  await page.evaluate(()=>window.ChartStudioBeta.symbol("XAUUSD"));await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Ungültiges gespeichertes Profil"));
  const malformedProfile=await page.evaluate(key=>localStorage.getItem(key),malformedKey);await saveButton.click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),malformedKey),malformedProfile,"invalid profile is never overwritten");
  await page.evaluate(()=>{window.__storageGet=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw Error("fixture storage read failure")}});
  await page.evaluate(()=>window.ChartStudioBeta.symbol("GBPUSD"));await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Speicher nicht lesbar"));
  await page.evaluate(()=>{Storage.prototype.getItem=window.__storageGet;window.ChartStudioBeta.symbol("XAUUSD")});await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  forgedTf="H4";failedTf="M15";await panel.locator("[data-mtf-refresh]").click();
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Unvollständige Quellenantwort"));
  assert.match(await panel.locator("tbody tr").nth(1).locator("td").first().textContent(),/UNAVAILABLE/,"forged account identity must be rejected");
  assert.match(await panel.locator("tbody tr").nth(3).locator("td").first().textContent(),/UNAVAILABLE/,"failed MT5 read must remain unavailable");
  forgedTf=null;failedTf=null;
  deferM5=true;let started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("symbol-race M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("[data-mtf-rows] tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-symbol result must not render after symbol change");
  deferM5=true;started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.account("goldm15"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("[data-mtf-rows] tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-scope result must not render after account/symbol/timeframe change");
  started=waitForM5();await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("second M5 request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.timeframe("H1"));
  await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));
  releaseM5?.();await page.waitForTimeout(250);
  assert.equal(await panel.locator("[data-mtf-rows] tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old-timeframe result must not render after timeframe change");
  assert.equal(errors.length,0,errors.join("; "));
  console.log("PASS MTF Chromium five verified timeframe reads, explicit UTC as-of, no writes, and stale-response cancellation");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(error=>{console.error(error);process.exitCode=1});
function makeSessionH1(asOf){
 const rows=[];let time=asOf-420*3600;
 while(time+3600<=asOf){
  const date=new Date(time*1000),day=date.getUTCDay(),hour=date.getUTCHours();
  const weekendClosed=day===5&&hour>=21||day===6||day===0&&hour<22;
  const dailyClosed=day>=1&&day<=4&&hour===21;
  if(!weekendClosed&&!dailyClosed){const close=1800+rows.length*.3;rows.push({time,open:close-.2,high:close+.4,low:close-.3,close,tick_volume:100});}
  time+=3600;
 }
 return rows.slice(-280);
}
