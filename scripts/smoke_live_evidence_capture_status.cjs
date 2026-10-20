"use strict";

const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const {classifyLiveDemoRequest}=require("./live_demo_scope_guard.cjs");

const base=(process.env.CHART_STUDIO_BASE_URL||"http://127.0.0.1:8056").replace(/\/+$/,"");
const accounts=Object.freeze(["titan","xau5m_m5","titan_m5","xau5m_500","goldm15"]);
const statusPaths=new Set(["/api/chart/v1/decisions/capture/status","/api/chart/v1/lifecycle/capture/status"]);

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const baseUrl=new URL(base),basePath=baseUrl.pathname.replace(/\/$/,"");
  const symbols={titan:"XAUUSD",xau5m_m5:"XAUUSD.p",titan_m5:"XAUUSD.p",xau5m_500:"XAUUSD.p",goldm15:"XAUUSD"};
  const apiRequests=[],captureRequests=[],browserErrors=[],blockedApiRequests=[],results=[];
  page.on("pageerror",error=>browserErrors.push(error.message));
  page.on("request",request=>{
   const url=new URL(request.url());if(url.origin!==baseUrl.origin)return;
   if(!url.pathname.includes("/api/"))return;
   assert.equal(request.method(),"GET","recorder status acceptance must remain read-only");
   const account=url.searchParams.get("account");
   if(account!==null)assert.ok(accounts.includes(account),"request escaped the five authorized non-Blueberry demo aliases: "+account);
   const entry={path:url.pathname,account};apiRequests.push(entry);
   if(statusPaths.has(url.pathname))captureRequests.push({...entry,method:request.method()});
  });
  await page.route("**/*",async route=>{
   const url=new URL(route.request().url());
   if(url.origin===baseUrl.origin){
    const scope=classifyLiveDemoRequest({url,method:route.request().method(),basePath,allowedAccounts:accounts});
    if(!scope.allowed){
     blockedApiRequests.push({path:url.pathname,account:url.searchParams.get("account"),reason:scope.reason});
     await route.abort("blockedbyclient");return;
    }
    if(scope.kind==="global_read"&&scope.endpoint==="/api/accounts"){
     await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      default:accounts[0],accounts:accounts.map(id=>({id,name:id,login:"Demo",server:"Demo",symbol:symbols[id],
       timeframe:"M15",is_demo:true,challenge_protection:false,capacity:3}))
     })});return;
    }
    if(scope.kind==="global_read"&&scope.endpoint==="/api/chart/v1/capabilities"){
     await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      accountScopes:accounts,symbols:Object.values(symbols),timeframes:["M1","M5","M15","M30","H1","H4","D1"],
      features:{encryptedDeviceSync:false}
     })});return;
    }
   }
   await route.continue();
  });
  await page.goto(base+"/?account=titan",{waitUntil:"domcontentloaded"});
  await page.locator('#account-switcher [data-account="titan"][aria-pressed="true"]').waitFor();
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
   await page.waitForFunction(()=>document.querySelector("#cs-evidence-capture-status-result")?.textContent.includes("Lifecycle:"),null,{timeout:45000});
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
  assert.deepEqual(blockedApiRequests,[],"no mutation or out-of-scope API request left the browser");
  assert.equal(captureRequests.length,accounts.length*2);
  console.log(JSON.stringify({accounts,results,recorderStatusRequests:captureRequests,totalApiReads:apiRequests.length,mutations:0,blockedApiRequests,blueberryQueried:false,browserErrors},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
