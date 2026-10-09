"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
(async()=>{
 const server=spawn("python",["-m","http.server","8869","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server exited");
   try{if((await fetch("http://127.0.0.1:8869/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture startup timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1450,height:960}});
  const errors=[],requests=[],layouts=new Map();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
  const token="fixture-object-layout-token-01234567890123456";
  await page.route("**/api/chart/v1/workspace**",async route=>{
   const req=route.request(),url=new URL(req.url());
   const done=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
   if(req.headers().authorization!=="Bearer "+token)return done(401,{detail:"Unauthorized"});
   const body=req.method()==="GET"?Object.fromEntries(url.searchParams.entries()):req.postDataJSON();
   const account=body.account,symbol=body.symbol||"XAUUSD",name=body.name;
   const key=account+":"+symbol+":"+name,row=layouts.get(key);
   if(url.pathname.endsWith("/workspaces"))
    return done(200,{account,symbol,items:[...layouts.entries()].filter(([k])=>k.startsWith(account+":"+symbol+":"))
     .map(([k,v])=>({name:k.split(":")[2],revision:v.revision,updatedUtc:1}))});
   if(req.method()==="GET")
    return row?done(200,{account,symbol,name,...row}):done(404,{detail:"Missing"});
   if(req.method()==="PUT"){
    if((row?.revision||0)!==body.expectedRevision)return done(409,{detail:"Stale revision"});
    const updated={revision:(row?.revision||0)+1,document:body.document};
    layouts.set(key,updated);return done(200,{account,symbol,name,...updated});
   }
   return done(405,{detail:"Unsupported"});
  });
  await page.goto("http://127.0.0.1:8869/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>window.__chartSmokeReady===true);
  await page.locator("#cs-beta-toggle").click();
  await page.locator('[data-tool="horizontal"]').click();
  const canvas=page.locator("canvas.cs-beta-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>400&&box.height>250);
  await page.mouse.click(box.x+box.width*.5,box.y+box.height*.30);
  await page.mouse.click(box.x+box.width*.5,box.y+box.height*.55);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  const manager=page.locator(".cs-object-manager");
  await manager.locator("summary").click();
  await manager.locator(".cs-object-row").first().waitFor({state:"visible"});
  assert.equal(await manager.locator(".cs-object-row").count(),2);
  assert.ok((await manager.locator(".cs-object-count").textContent()).includes("2"));
  const row=()=>manager.locator('.cs-object-row[data-index="0"]');
  await row().locator('input[data-field="label"]').fill("London Sweep");
  await row().locator('input[data-field="label"]').press("Tab");
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].label,"London Sweep");
  await row().locator('button[data-action="visibility"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].visible,false);
  await row().locator('button[data-action="visibility"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].visible,true);
  await row().locator('button[data-action="lock"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[0].locked,true);
  await row().locator('button[data-action="select"]').click();
  await page.locator('[data-cmd="delete-selected"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2,
   "Locked drawing must not be removed by legacy delete-selected");
  await row().locator('button[data-action="lock"]').click();
  await row().locator('button[data-action="up"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[1].label,"London Sweep");
  await manager.locator('.cs-object-row[data-index="1"] button[data-action="duplicate"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),3);
  const ids=await page.evaluate(()=>ChartStudioBeta.getState().drawings.map(o=>o.id));
  assert.equal(new Set(ids).size,3,"Objects require unique IDs even after copy");
  await manager.locator('.cs-object-row[data-index="2"] button[data-action="remove"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  await page.locator('[data-cmd="undo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),3);
  await page.locator('[data-cmd="undo"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  // Persist label/lock/visibility for both account-specific local layouts.
  page.once("dialog",dialog=>dialog.accept("ObjectProfile"));
  await page.locator('[data-cmd="save-profile"]').click();
  await manager.locator('.cs-object-row[data-index="1"] button[data-action="lock"]').click();
  await page.locator('[data-cmd="load-profile"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[1].locked,false);
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),0);
  assert.equal(await manager.locator(".cs-object-row").count(),0);
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[1].label,"London Sweep");
  // Server save, modify, restore using opt-in token without persistence in URL/storage.
  const serverBox=page.locator(".cs-server-sync");
  await serverBox.locator('input[type="password"]').fill(token);
  await serverBox.getByRole("button",{name:"Verbinden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("für titan"));
  await serverBox.getByRole("textbox",{name:"Neuer Layoutname"}).fill("ObjectsServer");
  await serverBox.getByRole("button",{name:"Server speichern"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("gespeichert"));
  const saved=layouts.get("titan:XAUUSD:ObjectsServer").document.drawings;
  assert.equal(saved.length,2);
  assert.equal(saved[1].label,"London Sweep");
  assert.equal(saved[1].visible,true);
  await manager.locator('.cs-object-row[data-index="1"] button[data-action="visibility"]').click();
  await serverBox.getByRole("button",{name:"Server laden"}).click();
  await page.waitForFunction(()=>document.querySelector(".cs-server-sync p").textContent.includes("geladen"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.getState().drawings))[1].visible,true);
  assert.equal(await page.evaluate(token=>Object.values(localStorage).some(v=>v.includes(token)),token),false);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>url.includes("/api/chart/v1/workspace")));
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-object-manager.png"),fullPage:true});
  console.log("PASS Chromium object manager rename/hide/lock/reorder/duplicate/delete Undo, accounts and server layouts");
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
