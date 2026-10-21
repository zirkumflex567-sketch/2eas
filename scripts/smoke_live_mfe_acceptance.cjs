const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { classifyLiveDemoRequest } = require('./live_demo_scope_guard.cjs');
const allowedAccounts = Object.freeze(['titan','xau5m_m5','titan_m5','xau5m_500','goldm15']);
const accounts = Object.freeze(['titan','xau5m_m5','titan_m5','xau5m_500']);
assert.ok(accounts.every(account => allowedAccounts.includes(account)), 'MFE acceptance is limited to approved non-Blueberry demos');
const demoSymbols = { titan:'XAUUSD', xau5m_m5:'XAUUSD.p', titan_m5:'XAUUSD.p', xau5m_500:'XAUUSD.p', goldm15:'XAUUSD' };
const base = (process.env.CHART_STUDIO_BASE_URL || 'http://127.0.0.1:8056').replace(/\/+$/, '');
const baseUrl = new URL(base);
assert.equal(baseUrl.protocol, 'http:');
assert.ok(['127.0.0.1','localhost','::1'].includes(baseUrl.hostname), 'live MFE acceptance must use a local runtime');
assert.ok([8050,8056].includes(Number(baseUrl.port)), 'live MFE acceptance must use an approved local dashboard port');
const basePath = baseUrl.pathname.replace(/\/$/, '');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage(); const seen=[]; const blocked=[];
  page.on('request', req => {
   const u=new URL(req.url());
   if(u.origin!==baseUrl.origin || !u.pathname.startsWith(`${basePath}/api/`)) return;
   const scope=classifyLiveDemoRequest({url:u,method:req.method(),basePath,allowedAccounts:accounts});
   seen.push({method:req.method(),account:u.searchParams.get('account'),path:u.pathname,scope:scope.kind||scope.reason});
   assert.ok(scope.allowed,`out-of-scope API request blocked: ${req.method()} ${u.pathname} (${scope.reason})`);
   assert.equal(req.method(),'GET','no mutating requests');
  });
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==baseUrl.origin) return route.continue();
   const scope=classifyLiveDemoRequest({url:u,method:route.request().method(),basePath,allowedAccounts:accounts});
   if(!scope.allowed) { blocked.push({path:u.pathname,method:route.request().method(),reason:scope.reason}); return route.abort('blockedbyclient'); }
   if(scope.kind==='global_read'&&scope.endpoint==='/api/accounts') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({default:accounts[0],accounts:accounts.map(id=>({id,name:id,login:'Demo',server:'Demo',symbol:demoSymbols[id],timeframe:'M15',is_demo:true,challenge_protection:false,capacity:3}))})});
   if(scope.kind==='global_read'&&scope.endpoint==='/api/chart/v1/capabilities') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({accountScopes:accounts,symbols:['XAUUSD','XAUUSD.p'],timeframes:['M1','M5','M15','M30','H1','H4','D1'],features:{encryptedDeviceSync:false}})});
   return route.continue();
  });
  await page.goto(`${base}/?account=titan`,{waitUntil:'domcontentloaded'});
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
  assert.ok(seen.length>0); assert.equal(blocked.length,0,'the live MFE flow must not attempt an out-of-scope request');
  assert.ok(seen.every(r=>(r.account===null||accounts.includes(r.account))&&r.method==='GET'));
  console.log(JSON.stringify({observations,apiRequests:seen.length,blockedApiRequests:blocked.length,blueberryQueried:false,brokerWrites:0},null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});

