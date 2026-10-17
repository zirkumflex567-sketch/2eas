"use strict";
const {chromium}=require("playwright");
const {spawn}=require("node:child_process");
const assert=require("node:assert/strict");

(async()=>{
 const server=spawn("python",["-m","http.server","8865","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser=null;
 try{
  let ready=false;
  for(let i=0;i<60;i++){
   try{const response=await fetch("http://127.0.0.1:8865/static/chart-studio-fixture.html");if(response.ok){ready=true;break}}catch(_){}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,"fixture server starts");
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:850}}),posts=[],commits=[];let allowPreview=false,commitPayload=null;
  page.on("request",request=>{if(request.method()==="POST"){posts.push(request.url());if(request.url().includes("trade-ticket/commit"))commits.push(request.url())}});
  await page.route("**/api/**",route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith("/api/control_session"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({control_enabled:true,csrf_token:"fixture-csrf"})});
   if(url.pathname.endsWith("/api/chart/v1/trade-ticket/preview"))return route.fulfill(allowPreview?{status:200,contentType:"application/json",body:JSON.stringify({status:"READY_FOR_CONFIRMATION",account:"titan",symbol:"XAUUSD",canExecute:false,canCommit:true,previewId:"fixture-preview-token-012345678901234567890",guard:{state:"ALLOW",source:"FIXTURE"},quote:{ageSeconds:0.2},brokerRisk:{pnlAtSl:-1.4,pnlAtTp:2,margin:100,currency:"USD"},order:{orderType:"BUY_LIMIT",volumeLots:0.01}})}:{status:503,contentType:"application/json",body:JSON.stringify({detail:{code:"TRADE_TICKET_PREVIEW_DISABLED"}})});
   if(url.pathname.endsWith("/api/chart/v1/trade-ticket/commit")){commitPayload=route.request().postDataJSON();return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({status:"PLACED",verified:true,orderTicket:"12345"})})}
   return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:"fixture read unavailable"})});
  });
  await page.goto("http://127.0.0.1:8865/static/chart-studio-fixture.html");
  await page.waitForFunction(()=>window.__chartSmokeReady===true&&window.ChartStudioTicketDraft);
  await page.locator("#cs-beta-toggle").click();
  await page.locator(".cs-ticket summary").click();
  await page.locator("#cs-ticket-chart-price").click();
  await page.locator("#tv-chart").click({position:{x:500,y:210}});
  const entry=await page.locator('#cs-ticket-form [name="entryPrice"]').inputValue();
  assert.ok(Number.isFinite(Number(entry))&&Number(entry)>0,"chart click transfers an editable price");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().ticketDraft.entryPrice),entry);
  assert.equal(posts.length,0,"chart click is draft-only");
  await page.locator('#cs-ticket-form [name="slPrice"]').fill(String(Number(entry)-10));
  await page.locator('#cs-ticket-form [name="tpPrice"]').fill(String(Number(entry)+20));
  await page.locator("#cs-ticket-form button[type=submit]").click();
  await page.waitForFunction(()=>document.querySelector("#cs-ticket-result").textContent.includes("TRADE_TICKET_PREVIEW_DISABLED"));
  assert.equal(posts.length,1,"only the explicit read-only preview POST was made");
  assert.match(posts[0],/trade-ticket\/preview/);
  assert.equal(commits.length,0,"disabled preview never reaches commit");
  await page.evaluate(()=>ChartStudioBeta.account("titan_m5"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().ticketDraft.entryPrice),"");
  assert.equal(await page.locator("#cs-ticket-confirm").isHidden(),true);
  assert.equal(commits.length,0);
  allowPreview=true;await page.evaluate(()=>ChartStudioBeta.account("titan"));
  await page.locator('#cs-ticket-form [name="entryPrice"]').fill("4110.00");
  await page.locator('#cs-ticket-form [name="slPrice"]').fill("4100.00");
  await page.locator('#cs-ticket-form [name="tpPrice"]').fill("4130.00");
  await page.locator("#cs-ticket-form button[type=submit]").click();
  await page.waitForFunction(()=>document.querySelector("#cs-ticket-confirm").hidden===false);
  const send=page.locator("#cs-ticket-commit");assert.equal(await send.isDisabled(),true,"preview alone cannot send");
  await page.locator("#cs-ticket-confirm-text").fill("titan XAUUSD BUY_LIMIT 0.01");
  assert.equal(await send.isDisabled(),true,"typed text alone cannot send");
  await page.locator("#cs-ticket-confirm-check").check();
  assert.equal(await send.isDisabled(),false,"exact text plus explicit checkbox enables the separate route");
  await send.click();await page.waitForFunction(()=>document.querySelector("#cs-ticket-result").textContent.includes("PENDING ORDER VERIFIZIERT"));
  assert.equal(commits.length,1);assert.equal(posts.length,3,"one preview and one explicit commit after the draft-only test");
  assert.equal(commitPayload?.userConfirmed,true);assert.equal(commitPayload?.confirmationText,"titan XAUUSD BUY_LIMIT 0.01");
  assert.match(commitPayload?.idempotencyKey,/^[0-9a-f-]{36}$/);
  console.log("PASS Chromium ticket draft: chart transfer, disabled preview, explicit confirmation, commit shape, and scope cleanup");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(error=>{console.error(error);process.exitCode=1});
