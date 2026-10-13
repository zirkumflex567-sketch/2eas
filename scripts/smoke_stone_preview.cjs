/* Read-only Stone preview smoke: does not connect to MT5 or place orders. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'output', 'stone-ui-assets', 'visual-smoke');
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true});
  try {
    const errors = [];
    const requests = [];
    const page = await browser.newPage({viewport:{width:1440,height:900}, deviceScaleFactor:1});
    page.on('request', request=>requests.push(request.url()));
    page.on('pageerror', err=>errors.push(err.message));
    page.on('console', msg=>{if(msg.type()==='error') errors.push(msg.text());});
    await page.goto(pathToFileURL(path.join(root,'static','stone-preview.html')).href,{waitUntil:'load'});
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('body.theme-stone').count(),1,'Stone theme');
    assert.ok(await page.locator('#tv-chart canvas').count()>0,'Demo chart needs canvas');
    assert.ok(await page.locator('button:disabled').count()>0,'Simulated order buttons disabled');

    // A 50px rail painted above a 28px body gutter used to hide panel corners.
    // Verify the complete image borders remain inside both decorative rails.
    async function assertFrameClearance(label) {
      const frameCheck = await page.evaluate(() => {
        const leftRail = document.querySelector('#stone-rails .left')?.getBoundingClientRect();
        const rightRail = document.querySelector('#stone-rails .right')?.getBoundingClientRect();
        const selectors = ['nav.stone-asset-nav','header.stone-asset-header',
          '.stone-asset-panel--chart','.stone-asset-panel--diagnostic'];
        const cards = selectors.map(selector => {
          const el = document.querySelector(selector);
          if (!el) return {selector,missing:true};
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {selector,left:rect.left,right:rect.right,
            borderImage:style.borderImageSource,borderColor:style.borderTopColor};
        });
        return {leftRail:leftRail?.right,rightRail:rightRail?.left,cards};
      });
      assert.ok(Number.isFinite(frameCheck.leftRail) && Number.isFinite(frameCheck.rightRail),
        label+': ornamental rails exist');
      for (const card of frameCheck.cards) {
        assert.ok(!card.missing,label+': '+card.selector+' must exist');
        assert.ok(card.left >= frameCheck.leftRail+2,
          label+': '+card.selector+' left frame hidden by side rail: '+JSON.stringify(frameCheck));
        assert.ok(card.right <= frameCheck.rightRail-2,
          label+': '+card.selector+' right frame hidden by side rail: '+JSON.stringify(frameCheck));
        if (card.selector === '.stone-asset-panel--chart') {
          assert.equal(card.borderImage,'none',label+': chart uses opaque fallback');
          assert.equal(card.borderColor,'rgb(63, 104, 120)',label+': chart edge color');
        } else {
          assert.notEqual(card.borderImage,'none',label+': '+card.selector+' image frame');
        }
      }
      console.log('STONE FRAME CLEARANCE',label,JSON.stringify(frameCheck));
    }
    await assertFrameClearance('desktop 1440');
    const matrixBox = await page.locator('.right-stack .glass-card').nth(1).boundingBox();
    assert.ok(matrixBox && matrixBox.height < 500,'Strategy matrix panel must not stretch into empty space');
    await page.screenshot({path:path.join(out,'1440-stone-demo.png'),fullPage:true,animations:'disabled'});
    const h1=page.locator('#frame-buttons [data-frame="H1"]');
    if(await h1.count()) await h1.first().click();
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(350);
    await assertFrameClearance('mobile 390');
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
    assert.equal(requests.some(url=>/\/(?:12_chart_frame_wide|13_volume_frame_tall)\./.test(url)),false,
      'Quarantined frame assets must not be requested');
    assert.deepEqual(errors,[],'Browser console and page errors');
    console.log('STONE VISUAL SMOKE PASSED: canvas, demo-only controls, responsive viewport, browser errors');
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exit(1);});
