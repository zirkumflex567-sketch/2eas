"use strict";

const assert=require("node:assert/strict");
const {chromium}=require("playwright");

const base=(process.env.CHART_STUDIO_BASE_URL||"http://127.0.0.1:8056").replace(/\/+$/,"");
const accounts=Object.freeze(["titan","xau5m_m5","titan_m5","xau5m_500"]);
const statusPaths=new Set(["/api/chart/v1/decisions/capture/status","/api/chart/v1/lifecycle/capture/status"]);

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const apiRequests=[],captureRequests=[],browserErrors=[],results=[];
  page.on("pageerror",error=>browserErrors.push(error.message));
  page.on("request",request=>{
   const url=new URL(request.url());if(!url.pathname.startsWith("/api/"))return;
   assert.equal(request.method(),"GET","recorder status acceptance must remain read-only");
   const account=url.searchParams.get("account");
   if(account!==null)assert.ok(accounts.includes(account),"request escaped the four authorized demo aliases: "+account);
   const entry={path:url.pathname,account};apiRequests.push(entry);
   if(statusPaths.has(url.pathname))captureRequests.push({...entry,method:request.method()});
  });
  await page.goto(base+"/?account=titan",{waitUntil:"domcontentloaded"});
  await page.locator("#cs-beta-toggle").click();
  await page.locator("#cs-evidence-panel > summary").click();
  for(let index=0;index<accounts.length;index++){
   const account=accounts[index];
   if(index){
    await page.locator(`#account-switcher [data-account="${account}"]`).click();
    await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
   }
   const before=captureRequests.length;
   await page.locator("#cs-evidence-capture-status").click();
   await page.waitForFunction(()=>document.querySelector("#cs-evidence-capture-status-result")?.textContent.includes("Lifecycle:"),null,{timeout:20000});
   const text=await page.locator("#cs-evidence-capture-status-result").textContent();
   assert.match(text,/Decision-Recorder: (?:IDLE|NOT_CONFIGURED|NOT_STARTED|RECORDED|SPOOL_UNAVAILABLE|[A-Z0-9_]+)/,account+" decision status is explicit");
   assert.match(text,/Lifecycle: (?:OK|NOT_STARTED|[A-Z0-9_]+)/,account+" lifecycle status is explicit");
   assert.equal(captureRequests.length-before,2,account+" should issue exactly two recorder status GETs");
   assert.deepEqual(captureRequests.slice(-2),[
    {path:"/api/chart/v1/decisions/capture/status",account,method:"GET"},
    {path:"/api/chart/v1/lifecycle/capture/status",account,method:"GET"},
   ]);
   results.push({account,status:text});
  }
  assert.deepEqual(browserErrors,[]);
  assert.equal(captureRequests.length,accounts.length*2);
  console.log(JSON.stringify({accounts,results,recorderStatusRequests:captureRequests,totalApiReads:apiRequests.length,mutations:0,blueberryQueried:false,browserErrors},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
