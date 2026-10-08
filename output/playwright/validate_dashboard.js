async (page) => {
  const checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/api/status?account=titan');
  await page.reload();
  await page.waitForFunction(() => currentData && currentData.account.id === activeAccount);
  await page.getByRole('button', {name:'GoldM15 Reconstruction', exact:false}).click();
  await page.waitForFunction(() => currentData && currentData.account.id==='goldm15');
  assert(await page.locator('#matrix-tbody tr').count()===6, 'Gold: six entry conditions');
  assert(await page.locator('#exit-goals > div').count()===3, 'Gold: three momentum exit goals');
  assert((await page.locator('#account-connection').textContent()).includes('53090070'), 'Gold account confirmed');
  await page.locator('#dd-reset-button').click();
  assert((await page.locator('#reset-description').textContent()).includes('ausschließlich'), 'Gold reset explicitly display-only');
  await page.getByRole('button', {name:'Abbrechen', exact:true}).click();
  await page.getByRole('button', {name:'Weekly', exact:true}).click();
  assert((await page.locator('#vp-summary-badge').textContent()).includes('POC'), 'Weekly profile renders');
  await page.getByRole('button', {name:'☀️ Hell', exact:false}).click();
  assert(await page.locator('body').evaluate(el=>el.classList.contains('theme-light')), 'Light theme preserved');
  await page.getByRole('button', {name:'XAU Titan Pro', exact:false}).click();
  await page.waitForFunction(() => currentData && currentData.account.id==='titan');
  assert(await page.locator('#matrix-tbody tr').count()===5, 'Titan: five original entry conditions');
  assert(await page.locator('#gold-details').isHidden(), 'Gold details hidden for Titan');
  assert(await page.locator('body').evaluate(el=>el.classList.contains('theme-light')), 'Theme persists across accounts');

  // Artificially delayed GET only; verify old data cannot reappear after a switch.
  await page.evaluate(() => {
    window.testOriginalFetch=window.fetch;
    window.testDelayed=0;
    window.fetch=async (...args)=> {
      const response=await window.testOriginalFetch(...args);
      if(String(args[0]).includes('/api/status?account=titan')) {
        window.testDelayed++;
        await new Promise(resolve=>setTimeout(resolve,700));
      }
      return response;
    };
  });
  await page.evaluate(() => { void updateStatus(); });
  await page.getByRole('button', {name:'GoldM15 Reconstruction', exact:false}).click();
  await page.waitForFunction(() => currentData && currentData.account.id==='goldm15');
  await page.waitForTimeout(1000);
  assert(await page.evaluate(()=>window.testDelayed>0), 'Delayed Titan response exercised');
  assert(await page.evaluate(() => currentData.account.id==='goldm15'), 'Late Titan response discarded');
  await page.evaluate(()=>window.fetch=window.testOriginalFetch);

  // Browser POSTs are intercepted; no order or real reset reaches MT5/backend.
  await page.evaluate(()=> {
    window.testPosts=[];
    window.testOriginalAlert=window.alert;
    window.testOriginalConfirm=window.confirm;
    window.alert=()=>{};
    window.confirm=()=>true;
    window.fetch=async (url,options={})=> {
      if(options.method==='POST') {
        window.testPosts.push({url:String(url),body:JSON.parse(options.body)});
        return new Response(JSON.stringify({success:true,message:'Browser mock only',comment:'Browser mock only'}),{headers:{'Content-Type':'application/json'}});
      }
      return window.testOriginalFetch(url,options);
    };
  });
  const ticket=await page.evaluate(()=>currentData.positions[0]?.ticket);
  if(ticket) {
    await page.evaluate(ticket=>quickTP(ticket,50),ticket);
    await page.evaluate(ticket=>closePos(ticket),ticket);
    assert(await page.evaluate(ticket=>window.testPosts.some(p=>p.url.includes('/modify_position?account=goldm15') && p.body.ticket===ticket),ticket), 'SL/TP action scoped to Gold (mock only)');
    assert(await page.evaluate(ticket=>window.testPosts.some(p=>p.url.includes('/close_position?account=goldm15') && p.body.ticket===ticket),ticket), 'Close action scoped to Gold (mock only)');
  }
  await page.locator('#dd-reset-button').click();
  await page.evaluate(()=>executeDrawdownReset());
  const posts=await page.evaluate(()=>window.testPosts);
  assert(posts.some(p=>p.url.includes('/reset_drawdown?account=goldm15')), 'Drawdown display action scoped to Gold (mock only)');
  await page.evaluate(()=>window.fetch=window.testOriginalFetch);
  await page.evaluate(()=>{window.alert=window.testOriginalAlert;window.confirm=window.testOriginalConfirm;});

  // Failed account GET clears stale data and disables controls, never uses other account.
  await page.evaluate(()=>window.fetch=(url,options)=>String(url).includes('/api/status?account=goldm15') ? Promise.resolve(new Response(JSON.stringify({detail:'Test: selected terminal offline'}),{status:503,headers:{'Content-Type':'application/json'}})) : window.testOriginalFetch(url,options));
  await page.evaluate(()=>updateStatus());
  await page.waitForFunction(()=>currentData===null);
  assert(await page.locator('#dd-reset-button').isDisabled(), 'Offline account blocks actions');
  assert(await page.locator('#matrix-tbody tr').count()===0, 'Offline account clears previous goals');
  await page.evaluate(()=>window.fetch=window.testOriginalFetch);
  await page.evaluate(()=>updateStatus());
  await page.waitForFunction(()=>currentData && currentData.account.id==='goldm15');
  await page.evaluate(()=>loadCandles());
  await page.waitForFunction(()=>!isInitialLoad);
  await page.getByRole('button',{name:'🌙 Dunkel',exact:false}).click();
  await page.screenshot({path:'output/playwright/goldm15-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/goldm15-mobile.png',fullPage:true});
  assert(await page.locator('[data-account="goldm15"]').isVisible(), 'Account switch usable on mobile');
  await page.setViewportSize({width:1694,height:825});
  assert(errors.length===0, 'No browser JavaScript errors');
  const result={checks,posts,errors};
  await page.evaluate(result=>window.dashboardValidation=result,result);
  return result;
}
