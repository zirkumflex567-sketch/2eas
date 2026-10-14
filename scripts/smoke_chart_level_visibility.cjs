"use strict";
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
const assert=require("node:assert/strict");
(async()=>{
 const server=spawn("python",["-m","http.server","8881","--bind","127.0.0.1"],{cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture HTTP process crashed");
   try{if((await fetch("http://127.0.0.1:8881/")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture connection timeout");
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHART_STUDIO_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const writes=[];page.on("request",request=>{if(request.method()!=="GET")writes.push(request.url())});
  await page.goto("http://127.0.0.1:8881/");
  await page.addScriptTag({url:"http://127.0.0.1:8881/static/chart-level-visibility.js"});
  const result=await page.evaluate(()=>{
   const api=window.DashboardChartLevelVisibility,box=document.createElement("section");
   box.id="chart-level-legend";document.body.append(box);
   const levels=api.definitions.map((definition,index)=>({...definition,price:4100+index,enabled:api.read("titan")[definition.key]}));
   let changeCount=0;
   api.render(box,levels,"titan",{onChange:()=>changeCount++});
   return {count:box.querySelectorAll("input[data-level-key]").length,allChecked:Array.from(box.querySelectorAll("input")).every(input=>input.checked),changeCount};
  });
  assert.equal(result.count,10);assert.equal(result.allChecked,true);
  await page.locator('[data-level-key="daily_poc"]').uncheck();
  assert.equal(await page.locator('[data-level-key="daily_poc"]').isChecked(),false);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("2eas:chart-level-visibility:v1:titan"))),{daily_poc:false});
  const gold=await page.evaluate(()=>{
   const api=DashboardChartLevelVisibility,box=document.querySelector("#chart-level-legend");
   api.render(box,api.definitions.map((definition,index)=>({...definition,price:4200+index,enabled:api.read("goldm15")[definition.key]})),"goldm15");
   return {checked:Array.from(box.querySelectorAll("input")).every(input=>input.checked),count:box.querySelectorAll("input").length};
  });
  assert.equal(gold.checked,true);assert.equal(gold.count,10);
  const unavailable=await page.evaluate(()=>{
   const api=DashboardChartLevelVisibility,box=document.createElement("section"),storage={getItem:()=>null,setItem:()=>{}};
   box.id="unavailable-storage-legend";document.body.append(box);
   const render=()=>api.render(box,api.definitions.map((definition,index)=>({...definition,price:4300+index,enabled:api.read("titan",storage)[definition.key]})),"titan",{storage,onChange:render});
   render();return true;
  });
  assert.equal(unavailable,true);
  const fallbackToggle=page.locator('#unavailable-storage-legend [data-level-key="daily_val"]');
  assert.equal(await fallbackToggle.isChecked(),true,"Fresh account-level preference defaults visible");
  await fallbackToggle.uncheck();
  assert.equal(await fallbackToggle.isChecked(),false);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.levelKey),"daily_val","Rerender restores keyboard focus to the toggled level");
  assert.equal(await page.evaluate(()=>DashboardChartLevelVisibility.read("titan",{getItem:()=>null,setItem:()=>{}}).daily_val),false,"Session choice survives unavailable persistence");
  assert.equal(await page.evaluate(()=>{const api=DashboardChartLevelVisibility,storage={getItem:()=>null,setItem:()=>{}};api.set("goldm15","weekly_high",true,storage);return api.hasChoice("goldm15","weekly_high",storage)}),true,"Explicit weekly-level choice is remembered in-session");
  assert.deepEqual(writes,[]);
  console.log("PASS Chromium daily/weekly price-level toggles, account scope, storage fallback, focus retention, and accessible legend");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(error=>{console.error(error);process.exitCode=1});
