const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const accounts = ['titan','xau5m_m5','titan_m5','xau5m_500'];
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage(); const seen=[];
  page.on('request', req => { const u=new URL(req.url()); if(u.pathname.includes('/api/')) { const a=u.searchParams.get('account'); seen.push({method:req.method(),account:a,path:u.pathname}); assert.notEqual(a,'blueberry','protected account request blocked'); assert.equal(req.method(),'GET','no mutating requests'); } });
  await page.goto('http://127.0.0.1:8056/?account=titan',{waitUntil:'domcontentloaded'});
  await page.locator('#cs-beta-toggle').click(); const panel=page.locator('#cs-evidence-panel'); await panel.locator(':scope > summary').click();
  const observations=[];
  for(let i=0;i<accounts.length;i++) {
   const account=accounts[i];
   if(i) { await page.locator(`#account-switcher [data-account="${account}"]`).click(); await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor(); }
   await panel.locator('#cs-evidence-kind').selectOption('SNAPSHOT'); await panel.locator('#cs-evidence-load').click();
   await page.waitForFunction(()=>!document.querySelector('#cs-evidence-status')?.textContent.includes('Aufzeichnungen werden gelesen'));
   const records=await panel.locator('#cs-evidence-list > li pre').evaluateAll(ns=>ns.map(n=>JSON.parse(n.textContent)));
   const groups=new Map(); for(const r of records) { const id=r.payload?.positionIdentifier; if(!id) continue; const g=groups.get(id)||{}; g[r.payload.captureType]=r; groups.set(id,g); }
   const pair=[...groups].find(([,g])=>g.ENTRY&&g.EXIT);
   assert.ok(pair,`${account}: no linked entry/exit snapshots in visible history`);
   const id=pair[0];
   const response=await page.evaluate(async ({account,id})=>{const r=await fetch(`/api/chart/v1/lifecycle/positions/${encodeURIComponent(id)}/mfe-mae?account=${encodeURIComponent(account)}`,{method:'GET',cache:'no-store'});return {status:r.status,data:await r.json()};},{account,id});
   assert.equal(response.status,200,`${account}: MFE read failed`); assert.equal(response.data.account,account); assert.equal(response.data.canExecute,false);
   const estimate=response.data.result; assert.ok(['AVAILABLE','UNAVAILABLE'].includes(estimate.status));
   if(estimate.status==='AVAILABLE') { assert.equal(estimate.quality,'OHLC_ESTIMATE');assert.equal(estimate.coverage,'OBSERVED_BARS_ONLY');assert.equal(estimate.intrabarOrder,'UNKNOWN');assert.ok(estimate.barsUsed>0); }
   const tick=estimate.tickObservation; assert.ok(tick&&['AVAILABLE','UNAVAILABLE'].includes(tick.status));
   if(tick.status==='AVAILABLE'){assert.equal(tick.quality,'TICK_OBSERVED');assert.equal(tick.coverage,'MT5_RETURNED_TICKS_ONLY');assert.equal(tick.exact,false);assert.equal(tick.intrabarOrder,'UNKNOWN');assert.ok(tick.ticksUsed>0);}
   observations.push({account,position:id,status:estimate.status,barsUsed:estimate.barsUsed||0,tickStatus:tick.status,tickQuality:tick.quality||null,tickCount:tick.ticksUsed||0,tickExact:tick.exact??null,tickReason:tick.reason||null});
  }
  assert.ok(seen.length>0); assert.ok(seen.every(r=>r.account!=='blueberry'&&r.method==='GET'));
  console.log(JSON.stringify({observations,apiRequests:seen.length},null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});

