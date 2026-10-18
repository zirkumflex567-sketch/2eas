"use strict";

const assert=require("node:assert/strict");
const {chromium}=require("playwright");

const base=process.env.CHART_STUDIO_BASE_URL||"http://127.0.0.1:8056";
const aliases=["titan","xau5m_m5","titan_m5","xau5m_500","goldm15"];
const presets=Object.fromEntries(aliases.map(alias=>[alias,alias+".set"]));

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  const apiRequests=[],browserErrors=[];
  page.on("pageerror",error=>browserErrors.push(error.message));
  page.on("request",request=>{
   const url=new URL(request.url());
   if(!url.pathname.startsWith("/api/"))return;
   assert.equal(request.method(),"GET","live calendar setup smoke must stay read-only");
   const account=url.searchParams.get("account");
   if(account!==null)assert.ok(aliases.includes(account),"request escaped the five authorized demo aliases: "+account);
   apiRequests.push({path:url.pathname,account,symbol:url.searchParams.get("symbol")});
  });
  await page.goto(base+"/?account=titan",{waitUntil:"domcontentloaded"});
  await page.locator("#cs-beta-toggle").click();
  await page.locator(".cs-market-structure > summary").click();
  for(let index=0;index<aliases.length;index++){
   const account=aliases[index];
   if(index){
    await page.locator(`#account-switcher [data-account="${account}"]`).click();
    await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
   }
   const panel=page.locator('[data-testid="economic-calendar"]');
   await page.waitForFunction(id=>{
    const panel=document.querySelector('[data-testid="economic-calendar"]');
    return panel?.textContent.includes(id)===true;
   },presets[account],{timeout:20000}).catch(async error=>{
    const debug=await page.evaluate(()=>({url:location.href,calendar:document.querySelector('[data-testid="economic-calendar"]')?.textContent,structure:document.querySelector('[data-testid="market-structure"]')?.textContent?.slice(0,300)}));
    throw new Error(error.message+"; debug="+JSON.stringify(debug)+"; requests="+JSON.stringify(apiRequests));
   });
   const text=await panel.textContent();
   assert.match(text,/Event-\/News-Risk bleibt UNKNOWN/);
   assert.match(text,/separaten XAUUSD-M15-Chart ohne Trading-EA/);
   assert.match(text,/AutoTrading nicht umschalten/);
   assert.match(text,new RegExp(presets[account].replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
   const requests=apiRequests.filter(request=>request.path==="/api/chart/v1/calendar"&&request.account===account);
   assert.ok(requests.length>=1,account+" calendar status was not loaded");
   assert.ok(requests.every(request=>request.symbol&&request.symbol.startsWith("XAUUSD")),account+" calendar reads use the selected gold symbol");
  }
  assert.deepEqual(browserErrors,[]);
  assert.ok(apiRequests.length>0);
  console.log(JSON.stringify({accounts:aliases,calendarRequests:apiRequests.filter(request=>request.path==="/api/chart/v1/calendar"),apiRequests:apiRequests.length,mutations:0,browserErrors},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
