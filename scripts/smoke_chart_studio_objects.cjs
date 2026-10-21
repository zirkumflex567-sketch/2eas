"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright"),{spawn}=require("node:child_process");
(async()=>{
 const server=spawn("python",["-m","http.server","8869","--bind","127.0.0.1"],
  {cwd:process.cwd(),windowsHide:true,stdio:"pipe"});
 let browser,context;
 try{
  for(let i=0;i<80;i++){
   if(server.exitCode!==null)throw Error("Fixture server exited");
   try{if((await fetch("http://127.0.0.1:8869/static/chart-studio-fixture.html")).ok)break}catch(_){}
   if(i===79)throw Error("Fixture startup timeout");
   await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  context=await browser.newContext({viewport:{width:1450,height:960}});
  const page=await context.newPage();
  await page.addInitScript(()=>{window.CHART_STUDIO_USER_SCOPE="u_"+"a".repeat(64)});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")requests.push(r.url())});
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
  const share=manager.locator('.cs-object-row[data-index="0"] button[data-action="share"]');
  assert.equal(await share.count(),1,"each account-local market drawing must have an explicit share action");
  await share.click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2,
   "shared drawings remain visible in the active account's chart");
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportDocument())).drawings.length,1,
   "account workspace exports must not duplicate symbol-wide drawings");
  await page.locator('[data-cmd="undo"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportDocument())).drawings.length,2,
   "undo restores the original account scope of a shared drawing");
  assert.equal(await manager.locator('.cs-object-row button[data-action="share"]').count(),2);
  await page.locator('[data-cmd="redo"]').click();
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportDocument())).drawings.length,1,
   "redo restores the explicitly shared scope");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1,
   "symbol-wide drawings stay visible after changing accounts");
  assert.equal(await manager.locator('.cs-object-row button[data-action="unshare"]').count(),1,
   "the shared drawing remains identifiable after changing accounts");
  const sharedBefore=await page.evaluate(()=>ChartStudioBeta.getState().drawings[0]);
  const collidingLocal={schemaVersion:1,drawings:[{id:sharedBefore.id,kind:"horizontal",
   anchors:[{time:1700000000,price:4200}]}]};
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),collidingLocal),true);
  const collisionResult=await page.evaluate(()=>({drawings:ChartStudioBeta.getState().drawings,
   local:ChartStudioBeta.exportDocument().drawings}));
  assert.equal(collisionResult.drawings.length,2,"local and shared drawings survive colliding imported IDs");
  assert.deepEqual(collisionResult.drawings.find(d=>d.id===sharedBefore.id),sharedBefore,
   "an imported local ID collision must not replace the shared geometry");
  assert.notEqual(collisionResult.local[0].id,sharedBefore.id,
   "colliding account-local IDs are remapped away from the stable shared ID");
  const fullLocal={schemaVersion:1,drawings:Array.from({length:1000},(_,i)=>({id:"cap_"+String(i).padStart(4,"0"),
   kind:"horizontal",anchors:[{time:1700000000+i,price:4000+i/10}]}))};
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),fullLocal),true);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1001,
   "the 1,000 local drawing capacity must not hide a shared drawing");
  assert.equal(await manager.locator('.cs-object-row button[data-action="unshare"]').count(),1,
   "shared drawings remain reachable in the object manager at local capacity");
  assert.equal(await manager.locator('.cs-object-row[data-index="0"] button[data-action="duplicate"]').isDisabled(),true,
   "account-local duplicates stop at their own 1,000-item limit");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.importDocument({schemaVersion:1,drawings:[]})),true);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1,
   "replacing local drawings preserves the independent shared layer");
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  const unshare=manager.locator('.cs-object-row[data-index="1"] button[data-action="unshare"]');
  assert.equal(await unshare.count(),1,"shared drawings must have an explicit return-to-account action");
  await unshare.click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),2);
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportDocument())).drawings.length,2,
   "unsharing returns the drawing to the active account's local layout");
  await page.evaluate(()=>ChartStudioBeta.account("goldm15"));
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),0,
   "unsharing returns a drawing only to the account that performed the action");
  await page.evaluate(()=>ChartStudioBeta.account("titan"));
  await page.evaluate(()=>{
   const bars=Array.from({length:5000},(_,index)=>{
   const close=4000+Math.sin(index/17)*9+index*.001;
   return {time:1700000000+index*900,open:close-.5,high:close+2,low:close-2,close,
    tick_volume:500+index,real_volume:100+index};
   });
   ChartStudioBeta.updateCandles(bars);window.__capacityBarCount=bars.length;
  });
  for(const id of ["ema20","ema50","ema200"])await page.locator('[data-opt="'+id+'"]').click();
  const indicatorCapacity=await page.evaluate(()=>{
   const averages=Array.from({length:16},(_,index)=>({id:"capacity-ma-"+index,type:"EMA",period:index+2,
    source:"close",color:"#68dfff",lineWidth:1,visible:true,label:"",displayShift:0}));
   const kinds=["rsi","macd","atr","adx"];
   const oscillators=kinds.map((kind,index)=>({id:"capacity-osc-"+index,kind,visible:true,
    color:"#e8bb72",lineWidth:1,label:"",...(kind==="macd"?{fast:12,slow:26,signal:9}:{period:14})}));
   const averagesApplied=ChartStudioAverages.applySettings(averages);
   const oscillatorsApplied=ChartStudioOscillators.applySettings(oscillators);
   return {bars:window.__capacityBarCount,
    averagesApplied,oscillatorsApplied,averages:ChartStudioAverages.getConfigs().length,
    oscillators:ChartStudioOscillators.settings().length,
    tailReadoutCount:ChartStudioAverages.readout(1700000000+4999*900).split(" · ").length};
  });
  assert.deepEqual(indicatorCapacity,{bars:5000,averagesApplied:true,oscillatorsApplied:true,averages:16,oscillators:4,tailReadoutCount:16},
   "The production Beta fixture must hold 5,000 bars and 20 overlay/pane indicator instances");
  assert.equal(await page.locator(".cs-osc-pane").count(),4);
  const originalDocument=await page.evaluate(()=>ChartStudioBeta.exportDocument());
  const capacityDocument=count=>({...originalDocument,drawings:Array.from({length:count},(_,index)=>({
   id:`capacity-${String(index).padStart(4,"0")}`,kind:"horizontal",
   anchors:[{time:1700000000+index,price:4000+index/10}]}))});
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),capacityDocument(999)),true,
   "A valid 999-drawing document must import without truncation");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),999);
  assert.equal(await manager.locator(".cs-object-row").count(),999,
   "Object Manager must list every imported drawing");
  assert.equal(await manager.locator('.cs-object-row[data-index="0"] button[data-action="duplicate"]').isDisabled(),false,
   "Duplication remains available below the shared cap");
  await manager.locator('.cs-object-row[data-index="0"] button[data-action="duplicate"]').click();
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1000,
   "Duplicating the 999th drawing must reach exactly 1,000");
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),capacityDocument(1000)),true,
   "A valid 1,000-drawing document must import intact");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1000);
  assert.equal(await manager.locator(".cs-object-row").count(),1000);
  assert.equal(await manager.locator('.cs-object-row[data-index="0"] button[data-action="duplicate"]').isDisabled(),true,
   "Duplication is disabled at the shared cap");
  const idsAtCapacity=await page.evaluate(()=>ChartStudioBeta.getState().drawings.map(drawing=>drawing.id));
  await page.evaluate(()=>document.querySelector('.cs-object-row[data-index="0"] button[data-action="duplicate"]')
   .dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));
  assert.deepEqual(await page.evaluate(()=>ChartStudioBeta.getState().drawings.map(drawing=>drawing.id)),idsAtCapacity,
   "A direct duplicate event at 1,000 must be rejected without changing drawings");
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),capacityDocument(1001)),false,
   "An over-cap document must be rejected rather than truncated");
  assert.equal(await page.evaluate(()=>ChartStudioBeta.getState().drawings.length),1000,
   "Rejected import must preserve all existing drawings");
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importDocument(doc),originalDocument),true,
   "Restore the original document before the existing object-manager checks");
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
  // Encrypted server sync is fail-closed until the deployment explicitly enables it.
  const serverBox=page.locator(".cs-server-sync");
  assert.equal(await serverBox.locator('input[type="password"]').count(),0,"legacy bearer login is absent");
  assert.equal(await serverBox.locator('[aria-label="Recovery-Paket"]').count(),1);
  assert.equal(await serverBox.getByRole("button",{name:"Aktuelles Layout verschlüsselt speichern"}).isDisabled(),true,
    "encrypted server sync remains unavailable unless the server explicitly enables it");
  const scopedDrawing={schemaVersion:1,kind:"global-market-drawings",symbol:"XAUUSD",
   drawings:[{id:"owner-a-mark",kind:"horizontal",anchors:[{time:1700000000,price:2300}]}]};
  assert.equal(await page.evaluate(doc=>ChartStudioBeta.importGlobalDrawings(doc),scopedDrawing),true);
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings.length,1);
  const legacyMark={id:"legacy-browser-mark",kind:"vertical",anchors:[{time:1700000060,price:2301}]};
  await page.evaluate(mark=>localStorage.setItem("2eas:studio:beta:symbol-global:draw:XAUUSD",JSON.stringify([mark])),legacyMark);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.legacyGlobalDrawingsAvailable()),true);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.importLegacyGlobalDrawings()),true,
   "legacy marks can be copied into the authenticated user's namespace");
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("2eas:studio:beta:symbol-global:draw:XAUUSD"))[0].id),"legacy-browser-mark",
   "explicit migration preserves the legacy source");
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings.some(d=>d.anchors[0].time===1700000060),true);
  assert.equal(await page.evaluate(()=>ChartStudioBeta.importLegacyGlobalDrawings()),true,
   "repeating migration is idempotent");
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings.length,2);
  const otherUser=await context.newPage();
  await otherUser.addInitScript(()=>{window.CHART_STUDIO_USER_SCOPE="u_"+"b".repeat(64)});
  await otherUser.goto("http://127.0.0.1:8869/static/chart-studio-fixture.html",{waitUntil:"networkidle"});
  await otherUser.waitForFunction(()=>window.__chartSmokeReady===true);
  await otherUser.evaluate(()=>ChartStudioBeta.account("xau5m_m5"));
  assert.equal((await otherUser.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings.length,0,
   "global drawings are isolated between authenticated users in one browser profile");
  const scopedDrawingB={...scopedDrawing,drawings:[{...scopedDrawing.drawings[0],id:"owner-b-mark"}]};
  assert.equal(await otherUser.evaluate(doc=>ChartStudioBeta.importGlobalDrawings(doc),scopedDrawingB),true);
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings[0].id,"owner-a-mark");
  await page.evaluate(()=>ChartStudioBeta.timeframe("M5"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings[0].id,"owner-a-mark",
   "symbol-wide drawings remain available after a timeframe change");
  await page.evaluate(()=>ChartStudioBeta.account("xau5m_m5"));
  assert.equal((await page.evaluate(()=>ChartStudioBeta.exportGlobalDrawings())).drawings[0].id,"owner-a-mark",
   "same-user global drawings remain visible across account aliases");
  await otherUser.close();
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"no plaintext workspace writes are sent while encrypted sync is disabled");
  const dir=path.join("output","visual-smoke");fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,"chart-studio-object-manager.png"),fullPage:true});
  console.log("PASS Chromium Beta AT-025 combined capacity: 5,000 bars, 20 indicators, 1,000 drawings; object manager CRUD and fail-closed sync");
 }finally{if(browser)await browser.close();if(context)await context.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
