'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8056';
const ACCOUNT = 'titan';
const OUT = path.resolve('output/aud04_headless_fx_trace_20261020.json');
const PHASES = [
  { name: 'off-idle', mode: 'off' },
  { name: 'mystic-idle', mode: 'mystic' },
  { name: 'ritual-idle', mode: 'ritual' },
  { name: 'mystic-demo-celebration', mode: 'mystic', celebrateAtMs: 120000 },
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(3));
};
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-timer-throttling'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const requests = [], blocked = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/api/**', async route => {
    const req = route.request(); const u = new URL(req.url()); const account = u.searchParams.get('account');
    requests.push({ method: req.method(), account, path: u.pathname });
    if (req.method() !== 'GET' || (account && account !== ACCOUNT)) {
      blocked.push({ method: req.method(), account, path: u.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.goto(`${BASE}/?account=${ACCOUNT}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#stone-fx-toggle').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#stone-fx-toggle').click();
  await page.locator('#stone-fx-panel').waitFor({ state: 'visible' });
  await page.locator('#stone-sound-toggle').click().catch(()=>{});
  const chartState = await page.evaluate(() => ({
    account: document.querySelector('#account-switcher [aria-pressed="true"]')?.dataset.account || null,
    stoneTheme: document.body.classList.contains('theme-stone'),
    chartVisible: !!document.querySelector('#tv-chart') && document.querySelector('#tv-chart').getBoundingClientRect().width > 0,
    fxModes: [...document.querySelectorAll('[data-fx-mode]')].map(x => x.dataset.fxMode),
  }));
  if (chartState.account !== ACCOUNT || !chartState.stoneTheme || !chartState.chartVisible) throw new Error(`Unexpected dashboard state: ${JSON.stringify(chartState)}`);
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const s = window.__aud04 = { frames: [], longTasks: [], paints: [], shifts: [], heap: [], active: true, last: null };
    const frame = now => { if (!s.active) return; if (s.last !== null) s.frames.push(now - s.last); s.last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    try { new PerformanceObserver(list => s.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))) .observe({type:'longtask',buffered:true}); } catch (_) {}
    try { new PerformanceObserver(list => s.paints.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime,duration:e.duration})))) .observe({type:'paint',buffered:true}); } catch (_) {}
    try { new PerformanceObserver(list => s.shifts.push(...list.getEntries().map(e=>({start:e.startTime,value:e.value})))) .observe({type:'layout-shift',buffered:true}); } catch (_) {}
    s.heap.push({ t: performance.now(), used: performance.memory?.usedJSHeapSize ?? null, total: performance.memory?.totalJSHeapSize ?? null });
    s.heapTimer = setInterval(()=>s.heap.push({t:performance.now(),used:performance.memory?.usedJSHeapSize??null,total:performance.memory?.totalJSHeapSize??null}),5000);
  });
  const samples = [];
  for (const phase of PHASES) {
    await page.locator(`[data-fx-mode="${phase.mode}"]`).click();
    const start = Date.now();
    const cpuStart = await cdp.send('Performance.getMetrics');
    if (phase.celebrateAtMs) await page.locator('[data-fx-test="profit"]').evaluate(el => el.click());
    while (Date.now() - start < 300000) {
      const elapsed = Date.now() - start;
      if (phase.celebrateAtMs && elapsed < phase.celebrateAtMs && elapsed + 60000 >= phase.celebrateAtMs) {
        await sleep(phase.celebrateAtMs - elapsed);
        await page.locator('[data-fx-test="profit"]').evaluate(el => el.click());
      } else await sleep(Math.min(60000, 300000 - elapsed));
      const snap = await page.evaluate(() => ({ frames:window.__aud04.frames.length, heap:window.__aud04.heap.at(-1)?.used, longTasks:window.__aud04.longTasks.length }));
      console.log(JSON.stringify({ event:'progress', phase:phase.name, elapsedSeconds:Math.round((Date.now()-start)/1000), ...snap }));
    }
    const cpuEnd = await cdp.send('Performance.getMetrics');
    const metricMap = list => Object.fromEntries(list.metrics.map(m=>[m.name,m.value]));
    const a=metricMap(cpuStart), b=metricMap(cpuEnd);
    const raw = await page.evaluate(() => ({frames:window.__aud04.frames.splice(0), longTasks:window.__aud04.longTasks.splice(0), paints:window.__aud04.paints.splice(0), shifts:window.__aud04.shifts.splice(0), heap:window.__aud04.heap.splice(0)}));
    const intervals = raw.frames;
    const frameStats = {
      count: intervals.length, fps: intervals.length / 300,
      medianMs: percentile(intervals,.5), p95Ms: percentile(intervals,.95), p99Ms: percentile(intervals,.99),
      over16_7ms: intervals.filter(x=>x>16.7).length, over33_3ms: intervals.filter(x=>x>33.3).length,
      maxMs: intervals.length ? Number(Math.max(...intervals).toFixed(3)) : null,
    };
    const metrics = ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','JSHeapUsedSize','Nodes','Documents'];
    const cdpDelta = Object.fromEntries(metrics.filter(k=>a[k]!==undefined&&b[k]!==undefined).map(k=>[k,Number((b[k]-a[k]).toFixed(3))]));
    samples.push({ name:phase.name, fxMode:phase.mode, durationSeconds:300, celebrationTriggered:!!phase.celebrateAtMs, frames:frameStats,
      longTasks:{count:raw.longTasks.length,totalMs:Number(raw.longTasks.reduce((v,x)=>v+x.duration,0).toFixed(3)),maxMs:raw.longTasks.length?Number(Math.max(...raw.longTasks.map(x=>x.duration)).toFixed(3)):0},
      paints:raw.paints, layoutShiftCount:raw.shifts.length, heap:{samples:raw.heap.length,startBytes:raw.heap[0]?.used??null,endBytes:raw.heap.at(-1)?.used??null,minBytes:raw.heap.filter(x=>x.used!==null).length?Math.min(...raw.heap.filter(x=>x.used!==null).map(x=>x.used)):null,maxBytes:raw.heap.filter(x=>x.used!==null).length?Math.max(...raw.heap.filter(x=>x.used!==null).map(x=>x.used)):null}, cdpDelta });
    console.log(JSON.stringify({ event:'phase_complete', name:phase.name, frames:frameStats, longTasks:samples.at(-1).longTasks, cdpDelta }));
  }
  await page.evaluate(()=>{window.__aud04.active=false;clearInterval(window.__aud04.heapTimer)});
  const runtime = await (await fetch(`${BASE}/api/runtime`)).json();
  const report = { generatedAt:new Date().toISOString(), base:BASE, account:ACCOUNT, chartState, browser:await browser.version(), platform:process.platform, os:os.release(), cpu:os.cpus()[0]?.model, runtime:{startupRevision:runtime.startupRevision,diskRevision:runtime.diskRevision,applicationCodeDirty:runtime.applicationCodeDirty}, phases:samples, apiRequests:requests.length, apiMethods:[...new Set(requests.map(x=>x.method))], apiAccounts:[...new Set(requests.map(x=>x.account))], blockedRequests:blocked, pageErrors:errors };
  fs.mkdirSync(path.dirname(OUT),{recursive:true}); fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({event:'complete',out:OUT,phaseCount:samples.length,blockedRequests:blocked.length,pageErrors:errors.length,apiRequests:requests.length}));
  await browser.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
