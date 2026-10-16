"use strict";
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const {spawn}=require("node:child_process"),path=require("node:path"),fs=require("node:fs");
(async()=>{
 const server=spawn("python",["-m","http.server","8878","--bind","127.0.0.1"],
 {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server exited");
   try{if((await fetch("http://127.0.0.1:8878/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("HTTP fixture unavailable");
   await new Promise(done=>setTimeout(done,250));
  }
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:960},
    deviceScaleFactor:width<500?2:1,isMobile:width<500,hasTouch:width<500,
    reducedMotion:width===320?"reduce":"no-preference"});
   const page=await context.newPage(),errors=[],writes=[];
   page.on("pageerror",err=>errors.push(err.message));
   page.on("request",req=>{if(req.method()!=="GET")writes.push(req.url())});
   await page.goto("http://127.0.0.1:8878/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
   await page.waitForFunction(()=>window.__chartSmokeReady===true);
   await page.locator(".cs-ma-quick-period").fill("34");
   await page.locator(".cs-ma-quick").getByRole("button",{name:"EMA mit gewählter Periode hinzufügen"}).click();
   assert.equal((await page.evaluate(()=>ChartStudioAverages.getConfigs()))[0].period,34);
   assert.equal(await page.locator("#cs-beta-panel").isVisible(),true);
   await page.locator(".cs-catalog input[type='search']").fill("RSI");
   const matches=await page.locator(".cs-catalog-entry strong").allTextContents();
   assert.deepEqual(matches.sort(),["Relative Strength Index","StochRSI"],
    "the RSI search includes both RSI catalog entries");
   const geometry=await page.evaluate(()=>{
    const panel=document.getElementById("cs-beta-panel").getBoundingClientRect();
    return {viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
      panelLeft:panel.left,panelRight:panel.right,
      mediaReduced:window.matchMedia("(prefers-reduced-motion: reduce)").matches};
   });
   assert.ok(geometry.scrollWidth<=geometry.viewport+4,
    "Viewport "+width+" horizontal overflow: "+JSON.stringify(geometry));
   assert.ok(geometry.panelLeft>=-3&&geometry.panelRight<=geometry.viewport+3,
    "Panel clipped at "+width+": "+JSON.stringify(geometry));
   assert.equal(geometry.mediaReduced,width===320);
   // Exercise chart viewport resize & zoom without changing broker data.
   await page.evaluate(()=>{
    const host=document.getElementById("tv-chart");host.style.height="650px";
    chart.timeScale().setVisibleLogicalRange({from:35,to:90});
   });
   await page.waitForTimeout(100);
   assert.equal(await page.locator(".cs-ma-editor").isVisible(),true);
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   const out=path.join("output","visual-smoke");
   fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:path.join(out,"chart-studio-responsive-"+width+".png"),fullPage:true});
   await context.close();
  }
  console.log("PASS Chart Studio responsive 320/390/768/1440, touch, reduced motion, zoom, no writes");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
