"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process"),assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8873","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch("http://127.0.0.1:8873/static/chart-studio-fixture.html")).ok)break}catch(_){}await new Promise(r=>setTimeout(r,250));if(i===59)throw Error("fixture server timed out")}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),requests=[],errors=[];page.setDefaultTimeout(5000);page.on("pageerror",e=>errors.push(e.message));page.on("request",r=>requests.push({method:r.method(),url:r.url()}));
  let deferM5=false,releaseM5=null,forgedTf=null,failedTf=null,futureH4Spike=false,neutralH4=false,regimeOverrides={},deferRegimeTf=null,releaseRegime=null;const m5Starts=[],regimeStarts=[],regimeSources={};
  const waitForM5=()=>new Promise(resolve=>m5Starts.push(resolve));
  await page.route("**/api/candles?*",async route=>{
   const request=route.request(),url=new URL(request.url()),tf=url.searchParams.get("tf");assert.equal(request.method(),"GET");
   if(deferM5&&tf==="M5"){await new Promise(resolve=>{releaseM5=resolve;m5Starts.shift()?.()});}
   if(failedTf===tf)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"fixture unavailable"})});
   const step={D1:86400,H4:14400,H1:3600,M15:900,M5:300}[tf],asOf=Date.parse("2025-01-06T01:00:00Z")/1000;
   const candles=tf==="H1"?makeSessionH1(asOf):Array.from({length:280},(_,i)=>{const time=asOf-(281-i)*step,close=tf==="H4"&&neutralH4?1800:1800+i*1.3;return {time,open:close-1,high:close+3,low:close-2,close,tick_volume:100}});
   candles.push({time:asOf+(tf==="H4"&&futureH4Spike?step:0),open:1000000,high:1000010,low:999990,close:1000005,tick_volume:999});
   regimeSources[tf]=Math.max(...candles.filter(c=>c.time+step<=asOf).map(c=>c.time));
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({accountId:forgedTf===tf?"wrong-account":url.searchParams.get("account"),symbol:url.searchParams.get("symbol"),timeframe:tf,source:"MT5_VERIFIED",canExecute:false,candles})});
  });
  await page.route("**/api/chart/v1/regimes?*",async route=>{
   const request=route.request(),url=new URL(request.url()),tf=url.searchParams.get("timeframe"),override=regimeOverrides[tf]||{};assert.equal(request.method(),"GET");
   if(deferRegimeTf===tf&&url.searchParams.has("at")){await new Promise(resolve=>{releaseRegime=resolve;regimeStarts.shift()?.()});}
   if(override.failed)return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"fixture regime unavailable"})});
   const at=url.searchParams.get("at")||"2025-01-06T01:00:00Z",asOfMs=Date.parse(at),sourceEpoch=regimeSources[tf],sourceMs=(Number.isFinite(sourceEpoch)?sourceEpoch:asOfMs/1000-({D1:86400,H4:14400,H1:3600,M15:900,M5:300}[tf]||900))*1000;if(!Number.isFinite(asOfMs)||!Number.isFinite(sourceMs))throw Error("invalid regime fixture time: "+JSON.stringify({tf,at,source:sourceEpoch}));
   const iso=ms=>new Date(ms).toISOString().replace(".000Z","+00:00");
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({account:override.account||url.searchParams.get("account"),source:override.source||"MT5_VERIFIED",canExecute:override.canExecute??false,asOfUtc:override.asOf?"2025-01-06T02:00:00Z":iso(asOfMs),sourceTimeUtc:override.sourceTime?"2025-01-06T00:00:00Z":iso(sourceMs),barDurationSeconds:{D1:86400,H4:14400,H1:3600,M15:900,M5:300}[tf],frame:{symbol:override.symbol||url.searchParams.get("symbol"),timeframe:override.timeframe||tf},revision:override.revision||"market-regime-v1",regimeTags:{volatility:override.volatility||"NORMAL"},qualityFlags:override.volatility==="UNKNOWN"?["INSUFFICIENT_HISTORY"]:[]})});
  });
  await page.goto("http://127.0.0.1:8873/static/chart-studio-fixture.html");await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();const panel=page.locator("details.cs-mtf-panel");await panel.locator(":scope > summary").click();await panel.locator("[data-mtf-asof]").fill("2025-01-06T01:00");
  const ruleEditor=panel.locator("[data-mtf-rule-editor]");assert.equal(await ruleEditor.count(),1,"nested rule editor is available");
  await ruleEditor.locator(":scope > summary").click();
  assert.match(await ruleEditor.textContent(),/manueller EMA-Kontext.*keine EA-Regel/i);
  for(const tf of ["D1","H4","H1","M15","M5"]){const select=ruleEditor.locator(`[data-mtf-rule="${tf}"]`);assert.equal(await select.count(),1);assert.deepEqual(await select.locator("option").allTextContents(),["Keine Anforderung (ANY)","UP","DOWN","NEUTRAL"]);const slope=ruleEditor.locator(`[data-mtf-slope-rule="${tf}"]`);assert.equal(await slope.count(),1);assert.deepEqual(await slope.locator("option").allTextContents(),["Keine Anforderung (ANY)","RISING","FALLING","FLAT"]);}
  const slopeThreshold=ruleEditor.locator("[data-mtf-slope-threshold]");assert.equal(await slopeThreshold.inputValue(),"0","zero neutral tolerance means exactly flat by default");
  const saveButton=ruleEditor.locator("[data-mtf-save]");await saveButton.click();
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 1"));
  const profileKey=await page.evaluate(()=>localStorage.key(0));assert.match(profileKey,/titan.*XAUUSD/i);const revision1=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),profileKey);assert.equal(revision1.revision,1);assert.equal(revision1.schemaVersion,2);assert.equal(revision1.slopeFlatThresholdPercent,0);
  await ruleEditor.locator('[data-mtf-rule="H1"]').selectOption("UP");await saveButton.click();await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 2"));
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,profileKey),2);
  await ruleEditor.locator('[data-mtf-slope-rule="M5"]').selectOption("RISING");await slopeThreshold.fill("0.01");await saveButton.click();await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 3"));
  const slopeStored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),profileKey);assert.equal(slopeStored.slopePredicates.M5,"RISING");assert.equal(slopeStored.slopeFlatThresholdPercent,0.01);
  const preserved=await page.evaluate(key=>localStorage.getItem(key),profileKey);await slopeThreshold.fill("");await saveButton.click();assert.match(await panel.locator("[data-mtf-rule-status]").textContent(),/Toleranz.*ungültig/i);assert.equal(await page.evaluate(key=>localStorage.getItem(key),profileKey),preserved,"empty numeric threshold cannot silently become zero");await slopeThreshold.fill("5.001");await saveButton.click();assert.match(await panel.locator("[data-mtf-rule-status]").textContent(),/Speichern fehlgeschlagen/);assert.equal(await page.evaluate(key=>localStorage.getItem(key),profileKey),preserved,"out-of-range flat threshold is rejected atomically");await slopeThreshold.fill("0.01");
  await page.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error("fixture quota failure")}});
  await ruleEditor.locator('[data-mtf-rule="M5"]').selectOption("DOWN");await saveButton.click();assert.match(await panel.locator("[data-mtf-rule-status]").textContent(),/Speichern fehlgeschlagen/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),profileKey),preserved,"storage write failure preserves prior profile");
  await page.evaluate(()=>{Storage.prototype.setItem=window.__storageSet});await ruleEditor.locator('[data-mtf-rule="M5"]').selectOption("ANY");
  await saveButton.click();await page.waitForTimeout(100);assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,profileKey),3,"no-op save does not increment revision");
  await panel.locator("[data-mtf-refresh]").click();await page.waitForTimeout(1200);if(!(await panel.locator("[data-mtf-status]").textContent()).includes("as-of"))throw Error("refresh diagnostic: "+JSON.stringify({status:await panel.locator("[data-mtf-status]").textContent(),errors,requests:requests.slice(-5)}));
  assert.match(await panel.locator("[data-mtf-status]").textContent(),/5\/5/);
  assert.equal(await panel.locator("[data-mtf-rows] tr").count(),5);assert.equal(await panel.locator("[data-mtf-rows] tr td").nth(0).textContent().then(t=>t.includes("READY")),true);
  assert.match(await panel.locator("[data-mtf-rows] tr").first().innerText(),/Δ \+\d+\.\d+%/,"ready frame shows signed EMA20 change from the prior closed bar");
  assert.match(await panel.locator(".cs-mtf-table-wrap thead").innerText(),/EMA20 Δ vs\. vorherige geschlossene Kerze \(%\)/,"slope unit and one-bar closed-candle reference are explicit");
  assert.match(await panel.locator(".cs-mtf-table-wrap thead").innerText(),/Volatilität · market-regime-v1/,"volatility model revision is explicit");
  assert.match(await panel.locator("[data-mtf-rows] tr").first().locator("[data-volatility]").textContent(),/NORMAL · market-regime-v1/,"validated closed-bar volatility is rendered");
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).locator("th").textContent(),"H4");
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).locator("td").last().textContent(),"280","open/as-of H4 bar must be excluded from source rows");
  const h4BeforeFuture=await panel.locator("[data-mtf-rows] tr").nth(1).innerText();futureH4Spike=true;
  const futureResponses=Array.from({length:5},()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/api/candles")));
  await panel.locator("[data-mtf-refresh]").click();await Promise.all(futureResponses);await page.waitForTimeout(100);
  assert.equal(await panel.locator("[data-mtf-rows] tr").nth(1).innerText(),h4BeforeFuture,"future H4 bar cannot change closed-bar features or rule output");futureH4Spike=false;
  assert.match(await panel.locator("[data-mtf-rows] tr").nth(2).locator("td").first().textContent(),/SESSION_HEURISTIC.*Broker-Sitzung ungeprüft.*Sessionlücke heuristisch toleriert/,"heuristically accepted daily and weekend closures must remain visible as unverified session coverage");
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: (SATISFIED|PARTIAL|INCOMPLETE|CONTRADICTORY)/);
  assert.equal(await panel.locator("[data-mtf-rule-result] tbody tr").count(),5,"aggregate includes per-frame bias and slope criteria with source time");
  assert.match(await panel.locator("[data-mtf-rule-result] thead").innerText(),/Steigung erwartet.*EMA20 Δ/i);
  assert.equal(await panel.locator("[data-mtf-rule-result] tbody tr").nth(4).locator("td").nth(6).textContent(),"MATCH","configured M5 slope expectation is evaluated against the closed-bar feature");
  await ruleEditor.locator('[data-mtf-rule="M15"]').selectOption("DOWN");await saveButton.click();
  await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 4"));
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: (SATISFIED|PARTIAL|INCOMPLETE|CONTRADICTORY)/,"saved criteria re-evaluate the same-scope feature result");
  const saveRevision=async revision=>{await saveButton.click();await page.waitForFunction(rev=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes(`Revision ${rev}`),revision)};
  const setRule=async(tf,value)=>ruleEditor.locator(`[data-mtf-rule="${tf}"]`).selectOption(value);
  const setSlopeRule=async(tf,value)=>ruleEditor.locator(`[data-mtf-slope-rule="${tf}"]`).selectOption(value);
  const refreshToAggregate=async aggregate=>{const waits=Array.from({length:5},()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/api/candles")));await panel.locator("[data-mtf-refresh]").click();await Promise.all(waits);await page.waitForFunction(value=>document.querySelector("[data-mtf-rule-result]")?.textContent.includes(`Aggregate: ${value}`),aggregate)};
  for(const tf of ["D1","H4","H1","M15","M5"]){await setRule(tf,"ANY");await setSlopeRule(tf,"ANY");}await saveRevision(5);
  assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: UNCONFIGURED/);
  await setRule("H1","UP");await saveRevision(6);assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: SATISFIED/);
  await setRule("D1","DOWN");await saveRevision(7);assert.match(await panel.locator("[data-mtf-rule-result]").textContent(),/Aggregate: CONTRADICTORY/);
  await setRule("D1","ANY");await setRule("H4","UP");await saveRevision(8);neutralH4=true;await refreshToAggregate("PARTIAL");neutralH4=false;
  await setRule("M5","UP");await saveRevision(9);failedTf="M5";await refreshToAggregate("INCOMPLETE");failedTf=null;
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
  const verifyRegimeFailure=async override=>{
   regimeOverrides.M15=override;
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/api/chart/v1/regimes")&&new URL(r.url()).searchParams.get("timeframe")==="M15"&&new URL(r.url()).searchParams.has("at"));
   await panel.locator("[data-mtf-refresh]").click();await pending;
   if(override.volatility==="UNKNOWN")await page.waitForFunction(()=>document.querySelector("tbody tr:nth-child(4) [data-volatility]")?.textContent.includes("INSUFFICIENT_HISTORY"));
   else await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]")?.textContent.includes("Unvollständige Quellenantwort"));
   assert.match(await panel.locator("tbody tr").nth(3).locator("[data-volatility]").textContent(),/^UNKNOWN ·/);
  };
  for(const mismatch of [{account:"wrong"},{symbol:"EURUSD"},{timeframe:"H1"},{asOf:true},{source:"UNVERIFIED"},{canExecute:true},{revision:"market-regime-v2"},{sourceTime:true},{failed:true}])await verifyRegimeFailure(mismatch);
  await verifyRegimeFailure({volatility:"UNKNOWN"});regimeOverrides={};
  await page.evaluate(()=>{window.__mtfNativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__mtfNativeTimeout(fn,ms===12000?500:ms,...args)});
  deferRegimeTf="M15";const timeoutRegimePending=new Promise(resolve=>regimeStarts.push(resolve));await panel.locator("[data-mtf-refresh]").click();await Promise.race([timeoutRegimePending,new Promise((_,reject)=>setTimeout(()=>reject(Error("M15 regime timeout fixture did not start")),5000))]);
  await page.waitForFunction(()=>document.querySelector("tbody tr:nth-child(4) [data-volatility]")?.textContent.includes("timeout"),null,{timeout:5000});releaseRegime?.();deferRegimeTf=null;await page.evaluate(()=>{window.setTimeout=window.__mtfNativeTimeout});
  {const restored=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/api/chart/v1/regimes")&&new URL(r.url()).searchParams.get("timeframe")==="M15"&&new URL(r.url()).searchParams.has("at"));await panel.locator("[data-mtf-refresh]").click();await restored;await page.waitForFunction(()=>document.querySelector("[data-volatility]")?.textContent.includes("NORMAL · market-regime-v1"));}
  const legacyKey="chart-studio-mtf-rules:v1:titan:EURUSD",legacyProfile={schemaVersion:1,ruleVersion:"1.0.0",revision:1,profileId:"legacy-profile",accountId:"titan",symbol:"EURUSD",predicates:{D1:"ANY",H4:"ANY",H1:"UP",M15:"ANY",M5:"ANY"},updatedAtUtc:"2025-01-08T12:00:00.000Z"};
  await page.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:legacyKey,value:legacyProfile});
  await page.evaluate(()=>window.ChartStudioBeta.symbol("EURUSD"));await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Schema v1"));
  assert.equal(await ruleEditor.locator('[data-mtf-slope-rule="H1"]').inputValue(),"ANY","v1 profiles default newly-added slope rules to ANY");
  await saveButton.click();await page.waitForFunction(()=>document.querySelector("[data-mtf-rule-status]")?.textContent.includes("Revision 2"));
  const malformedKey=legacyKey.replace(":v1:",":v2:"),upgraded=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),malformedKey);assert.equal(upgraded.schemaVersion,2);assert.equal(upgraded.profileId,"legacy-profile");assert.equal(upgraded.predicates.H1,"UP");assert.equal(await page.evaluate(key=>localStorage.getItem(key),legacyKey),JSON.stringify(legacyProfile),"legacy v1 profile remains as a recovery copy after schema upgrade");
  await page.evaluate(()=>window.ChartStudioBeta.symbol("XAUUSD"));await page.waitForFunction(()=>document.querySelector('[data-mtf-rule="H1"]')?.value==="UP");
  await page.evaluate(key=>localStorage.setItem(key,"{broken"),malformedKey);
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
  deferM5=false;
  deferRegimeTf="M15";started=new Promise(resolve=>regimeStarts.push(resolve));await panel.locator("[data-mtf-refresh]").click();await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error("M15 regime request did not start")),5000))]);
  await page.evaluate(()=>window.ChartStudioBeta.symbol("XAUUSD"));await page.waitForFunction(()=>document.querySelector(".cs-mtf-panel [data-mtf-status]").textContent.includes("Kontext geändert"));releaseRegime?.();deferRegimeTf=null;await page.waitForTimeout(250);
  assert.equal(await panel.locator("[data-mtf-rows] tr td").first().textContent().then(t=>t.includes("nicht geladen")),true,"old regime result must not render after symbol change");
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
