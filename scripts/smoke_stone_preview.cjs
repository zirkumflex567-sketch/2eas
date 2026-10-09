/* Read-only Stone preview smoke: does not connect to MT5 or place orders. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'output', 'visual-smoke');
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const errors = [];
    const page = await browser.newPage({viewport:{width:1440,height:900}, deviceScaleFactor:1});
    page.on('pageerror', err=>errors.push(err.message));
    page.on('console', msg=>{if(msg.type()==='error') errors.push(msg.text());});
    await page.goto(pathToFileURL(path.join(root,'static','stone-preview.html')).href,{waitUntil:'load'});
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('body.theme-stone').count(),1,'Stone theme');
    assert.ok(await page.locator('#tv-chart canvas').count()>0,'Demo chart needs canvas');
    assert.ok(await page.locator('button:disabled').count()>0,'Simulated order buttons disabled');
    const matrixBox = await page.locator('.right-stack .glass-card').nth(1).boundingBox();
    assert.ok(matrixBox && matrixBox.height < 500,'Strategy matrix panel must not stretch into empty space');
    await page.screenshot({path:path.join(out,'1440-stone-demo.png'),fullPage:true,animations:'disabled'});
    const h1=page.locator('#frame-buttons [data-frame="H1"]');
    if(await h1.count()) await h1.first().click();
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(out,'390-stone-demo.png'),fullPage:true,animations:'disabled'});
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      nodes: [...document.querySelectorAll('body *')].map(el => {
        const rect = el.getBoundingClientRect();
        return {tag:el.tagName,id:el.id,cls:String(el.className||'').slice(0,80),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)};
      }).filter(el => el.right > document.documentElement.clientWidth+4 || el.left < -4).sort((a,b)=>b.right-a.right).slice(0,25)
    }));
    console.log('MOBILE OVERFLOW DIAGNOSTICS',JSON.stringify(overflow));
    assert.equal(overflow.scroll > overflow.width+4,false,'Unexpected page-level horizontal overflow at mobile width');
    assert.deepEqual(errors,[],'Browser console and page errors');
    console.log('STONE VISUAL SMOKE PASSED: canvas, demo-only controls, responsive viewport, browser errors');
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exit(1);});
