"""Read-only live dashboard audit. All non-GET/HEAD requests blocked in browser.
Only audit evidence is written; application, chart and MT5 state untouched.
Run from repository root: C:/Python314/python.exe docs/audits/2026-10-09-dashboard-live/run_audit.py
"""
import json
import time
from pathlib import Path
from urllib.request import urlopen
from concurrent.futures import ThreadPoolExecutor
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / 'screenshots'
SHOTS.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:8057'
RESULT = {'checks': [], 'states': [], 'page_errors': [], 'console_errors': [], 'blocked_writes': [], 'network_failures': [], 'api': [], 'scope': 'Non-chart UI; Chromium; Windows; live GETs, injected failures and intercepted writes clearly distinguished'}


def save():
    (ROOT / 'browser-results.json').write_text(json.dumps(RESULT, indent=2, ensure_ascii=False), encoding='utf-8')


def check(name, actual, expected=True):
    passed = actual == expected
    RESULT['checks'].append({'name': name, 'passed': passed, 'actual': actual, 'expected': expected})
    save()


def get(path):
    start = time.perf_counter()
    try:
        with urlopen(BASE + path, timeout=30) as r:
            body = r.read()
            return {'path': path, 'status': r.status, 'ms': round((time.perf_counter()-start)*1000, 2), 'bytes': len(body), 'body': json.loads(body)}
    except Exception as error:
        return {'path': path, 'error': str(error), 'ms': round((time.perf_counter()-start)*1000, 2)}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    RESULT['browser'] = browser.version
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page = context.new_page()
    page.on('pageerror', lambda error: RESULT['page_errors'].append(str(error)))
    page.on('console', lambda msg: RESULT['console_errors'].append(msg.text) if msg.type == 'error' else None)
    page.on('requestfailed', lambda r: RESULT['network_failures'].append({'url': r.url, 'error': r.failure}))

    def safe_route(route):
        req = route.request
        if req.method not in ('GET', 'HEAD'):
            RESULT['blocked_writes'].append({'url': req.url, 'method': req.method, 'payload': req.post_data})
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'success': True, 'message': 'AUDIT MOCK ONLY: no backend write', 'comment': 'AUDIT MOCK ONLY'}))
        else:
            route.continue_()
    context.route('**/*', safe_route)
    page.on('dialog', lambda dialog: dialog.accept())
    page.add_init_script("window.__auditLongTasks=[]; try {new PerformanceObserver(l=>window.__auditLongTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch(_){}")
    page.goto(BASE, wait_until='networkidle')
    page.wait_for_function("currentData && currentData.account.id === 'titan'", timeout=60000)
    check('Live Titan GET confirmed', page.evaluate('currentData.account.id'), 'titan')
    # Preserve real response fixtures as evidence, not fabricated data.
    for account in ('titan', 'goldm15'):
        sample = get('/api/status?account=' + account)
        (ROOT / ('live-status-' + account + '.json')).write_text(json.dumps(sample, indent=2, ensure_ascii=False), encoding='utf-8')

    for account in ('titan', 'goldm15'):
        page.locator('[data-account="' + account + '"]').click()
        page.wait_for_function('(a)=>currentData && currentData.account.id===a', arg=account, timeout=60000)
        check(account + ' identity confirmed', page.locator('#account-connection').inner_text().find(str(page.evaluate('currentData.account.login'))) >= 0)
        for theme in ('stone', 'dark', 'light'):
            page.locator('.stone-theme-dock [data-mode="' + theme + '"]').click()
            check(account + '/' + theme + ' selected', page.locator('.stone-theme-dock [data-mode="' + theme + '"]').get_attribute('aria-pressed'), 'true')
            for label, width, height in (('desktop',1440,1000), ('tablet',768,1024), ('mobile',390,844)):
                page.set_viewport_size({'width':width,'height':height})
                page.evaluate('window.scrollTo(0,0)')
                page.wait_for_timeout(250)
                name = account + '-' + theme + '-' + label
                page.screenshot(path=str(SHOTS/(name+'.png')), full_page=True)
                measures = page.evaluate('''() => {
                  const visible=e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
                  const isChart=e=>!!e.closest('.stone-asset-panel--chart,.stone-chart-stage,#tv-chart,.chart-studio-panel');
                  const data={viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,fonts:[],smallTargets:[],overflow:[],countdown:[],matrix:[]};
                  for(const e of document.querySelectorAll('body *')) {
                    if(!visible(e)||isChart(e))continue;
                    let r=e.getBoundingClientRect(),s=getComputedStyle(e);
                    if(r.right>innerWidth+1||r.left< -1)data.overflow.push({id:e.id,tag:e.tagName,class:e.className,text:(e.innerText||'').slice(0,100),left:r.left,right:r.right});
                    if(e.matches('button,input,select')&&(r.height<24||r.width<24))data.smallTargets.push({id:e.id,text:(e.innerText||'').slice(0,60),w:r.width,h:r.height});
                    if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))data.fonts.push({id:e.id,text:(e.innerText||'').slice(0,80),size:s.fontSize,color:s.color,background:s.backgroundColor,opacity:s.opacity});
                  }
                  for(const e of [document.querySelector('#bar-countdown')?.previousElementSibling,document.querySelector('#bar-countdown')]) {
                    if(!e)continue; let s=getComputedStyle(e),anc=[]; for(let a=e;a;a=a.parentElement){let st=getComputedStyle(a);anc.push({tag:a.tagName,id:a.id,bg:st.backgroundColor,image:st.backgroundImage,opacity:st.opacity});}
                    data.countdown.push({text:e.textContent,color:s.color,font:s.fontSize,weight:s.fontWeight,ancestors:anc});
                  }
                  let table=document.querySelector('#matrix-tbody')?.closest('table');
                  if(table){let r=table.getBoundingClientRect();data.matrix={left:r.left,right:r.right,width:r.width,parentClient:table.parentElement.clientWidth,parentScroll:table.parentElement.scrollWidth,parentOverflow:getComputedStyle(table.parentElement).overflowX};}
                  return data;
                }''')
                state = {'name':name, 'account':account,'theme':theme,'viewport':[width,height], 'screenshot':'screenshots/'+name+'.png', 'measures':measures}
                if label == 'desktop':
                    page.add_script_tag(path=str(ROOT/'axe.min.js'))
                    state['axe'] = page.evaluate('''async()=> {
                      let result=await axe.run({include:[['nav.glass-card'],['header.glass-card'],['#diagnose-card'],['.stone-asset-panel--volume'],['.stone-asset-panel--matrix'],['.stone-asset-panel--positions'],['.stone-asset-panel--journal'],['#gold-details']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
                      return {violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary,any:n.any}))})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:result.passes.map(v=>v.id)};
                    }''')
                    for selector, part in (('header.glass-card','header'), ('.stone-asset-panel--matrix','matrix'),('.stone-asset-panel--positions','positions'),('.stone-asset-panel--journal','journal')):
                        page.locator(selector).first.screenshot(path=str(SHOTS/(account+'-'+theme+'-'+part+'.png')))
                RESULT['states'].append(state)
                save()

    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('.stone-theme-dock [data-mode="dark"]').click()
    page.locator('[data-account="titan"]').click()
    page.wait_for_function("currentData && currentData.account.id==='titan'")
    check('Titan matrix dynamic count', page.locator('#matrix-tbody tr').count(), page.evaluate('currentData.rule_count'))
    check('Titan gold details hidden', page.locator('#gold-details').is_hidden())
    # Dirty input must survive polling without a single write.
    sl = page.locator('#positions-list input[id^="sl-input-"]').first
    if sl.count():
        input_id = sl.get_attribute('id')
        sl.fill('-37.00')
        page.evaluate('async()=>{await updateStatus();await updateStatus();}')
        check('Dirty SL preserved after live status refresh', page.locator('#'+input_id).input_value(), '-37.00')
        check('Dirty SL focus preserved', page.evaluate('document.activeElement.id'), input_id)
        page.locator('#strategy-title').click()
        page.evaluate('async()=>{await updateStatus();}')
        check('Dirty SL preserved after blur and refresh', page.locator('#'+input_id).input_value(), '-37.00')
        # Controlled structural change to test existing positions edit state.
        RESULT['structure_test'] = page.evaluate('''() => {
          let positions=structuredClone(currentData.positions),input=document.querySelector('#positions-list input[id^="sl-input-"]');
          let id=input.id; input.value='-37.00';input.dataset.dirty='true';input.focus();
          let extra={...positions[0],ticket:999999991};renderPositions([...positions,extra]);
          let result={value:document.getElementById(id).value,focus:document.activeElement.id};
          renderPositions(positions);return result;
        }''')
        check('Existing edit preserved when position list changes (in-memory only)', RESULT['structure_test']['value'], '-37.00')

    # Independent journal selection.
    for filt in ('titan','goldm15','all'):
        page.select_option('#journal-strategy-filter', filt)
        page.wait_for_function('(f)=>journalLoadedMode===f', arg=filt, timeout=60000)
        check('Journal '+filt+' does not switch trading account', page.evaluate('activeAccount'), 'titan')
        if filt != 'all':
            check('Journal '+filt+' entries scoped', page.evaluate('(f)=>Object.entries(journalEntriesByAccount).filter(([k,v])=>k!==f).every(([k,v])=>v.length===0)',filt))
    # Modal: no click on real mutation unless route interceptor is installed (above).
    page.locator('#dd-reset-button').click()
    check('Reset modal opens', page.locator('#dd-reset-modal').is_visible())
    RESULT['modal'] = page.evaluate('''() => {let m=document.querySelector('#dd-reset-modal');return {role:m.getAttribute('role'),ariaModal:m.getAttribute('aria-modal'),focus:document.activeElement.id,inside:m.contains(document.activeElement)};}''')
    page.screenshot(path=str(SHOTS/'titan-dark-reset-modal.png'), full_page=False)
    page.keyboard.press('Escape')
    check('Reset modal closes with Escape', page.locator('#dd-reset-modal').is_hidden())
    page.evaluate('closeDrawdownResetModal()')
    page.evaluate('openDrawdownResetModal()')
    page.locator('#dd-reset-input').fill('-100')
    page.evaluate('executeDrawdownReset()')
    page.wait_for_timeout(300)
    check('Negative reset prevented by UI (intercepted, no write)', len([x for x in RESULT['blocked_writes'] if '/reset_drawdown' in x['url']]), 0)
    page.evaluate('closeDrawdownResetModal()')
    # Safely test action routing: fulfilled in browser, never delivered to backend.
    ticket = page.evaluate('currentData.positions[0]?.ticket')
    if ticket:
        page.evaluate('async(t)=>{await quickTP(t,50);await closePos(t);}', ticket)
        check('Position action routing account=titan (intercepted)', all('account=titan' in w['url'] for w in RESULT['blocked_writes'] if 'position' in w['url']))
    # Delayed old account response using real GET and browser delay only.
    page.evaluate('''() => {window.__originalFetch=window.fetch;window.__delayed=0;window.fetch=async(...args)=>{let r=await window.__originalFetch(...args);if(String(args[0]).includes('/api/status?account=titan')){window.__delayed++;await new Promise(resolve=>setTimeout(resolve,1100));}return r;};void updateStatus();}''')
    page.locator('[data-account="goldm15"]').click()
    page.wait_for_function("currentData && currentData.account.id==='goldm15'", timeout=60000)
    page.wait_for_timeout(1500)
    check('Late account response exercised', page.evaluate('window.__delayed>0'))
    check('Late Titan response cannot overwrite Gold', page.evaluate('currentData.account.id'), 'goldm15')
    page.evaluate('window.fetch=window.__originalFetch')
    check('Gold six rules', page.locator('#matrix-tbody tr').count(), 6)
    check('Gold three exit goals', page.locator('#exit-goals > div').count(), 3)
    # Explicit 503 failure.
    page.evaluate('''() => {window.fetch=(url,options)=>String(url).includes('/api/status?account=goldm15')?Promise.resolve(new Response(JSON.stringify({detail:'AUDIT INJECTED: selected terminal offline'}),{status:503,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options);}''')
    page.evaluate('updateStatus()')
    page.wait_for_function('currentData===null')
    check('503 clears current account data', page.evaluate('currentData===null'))
    check('503 disables reset', page.locator('#dd-reset-button').is_disabled())
    check('503 clears matrix', page.locator('#matrix-tbody tr').count(), 0)
    check('503 clears positions', page.locator('#positions-list input').count(), 0)
    page.screenshot(path=str(SHOTS/'injected-offline-dark.png'),full_page=True)
    page.evaluate('window.fetch=window.__originalFetch;void updateStatus();')
    page.wait_for_function("currentData && currentData.account.id==='goldm15'",timeout=60000)
    check('Live recovery from injected 503', page.evaluate('currentData.account.id'), 'goldm15')
    # Partial failure of journal leaves explicit warning, no false total.
    page.evaluate('''() => {window.fetch=(url,options)=>String(url).includes('/api/journal_summary?account=goldm15')?Promise.resolve(new Response(JSON.stringify({detail:'AUDIT INJECTED: Gold journal offline'}),{status:503,headers:{'Content-Type':'application/json'}})):window.__originalFetch(url,options);}''')
    page.evaluate("setJournalFilter('all')")
    page.wait_for_function('journalLoadedMode===\'all\' && journalErrors.length>0')
    check('Partial journal failure visible', page.locator('#journal-sync-status').is_visible())
    RESULT['partial_journal_text']=page.locator('#journal-sync-status').inner_text()
    page.locator('.stone-asset-panel--journal').screenshot(path=str(SHOTS/'injected-partial-journal.png'))
    page.evaluate('window.fetch=window.__originalFetch;void refreshJournal();')
    page.wait_for_function('journalErrors.length===0')
    # Blackhole GET: expose stale LIVE/no deadline without touching MT5.
    page.evaluate('''() => {window.fetch=(url,options)=>String(url).includes('/api/status?account=goldm15')?new Promise(()=>{}):window.__originalFetch(url,options);void updateStatus();}''')
    page.wait_for_timeout(6500)
    RESULT['hung_request'] = page.evaluate('({busy:statusBusy,stillHasData:!!currentData,label:document.querySelector("#account-connection").textContent,resetDisabled:document.querySelector("#dd-reset-button").disabled})')
    check('Hung status ceases to claim LIVE after 6.5s', 'LIVE' not in RESULT['hung_request']['label'])
    page.locator('nav.glass-card').screenshot(path=str(SHOTS/'injected-hung-status.png'))
    page.reload(wait_until='networkidle')
    page.wait_for_function("currentData && currentData.account.id==='goldm15'",timeout=60000)
    check('Selected account survives reload', page.evaluate('activeAccount'),'goldm15')
    check('Selected theme survives reload',page.locator('.stone-theme-dock [data-mode="dark"]').get_attribute('aria-pressed'),'true')
    page.emulate_media(reduced_motion='reduce')
    RESULT['reduced_motion'] = page.evaluate('''() => Array.from(document.querySelectorAll('.stone-spark,.stone-vapor,.stone-edge-light')).slice(0,20).map(e=>({class:e.className,animation:getComputedStyle(e).animationName,duration:getComputedStyle(e).animationDuration}))''')
    check('Reduced motion disables sampled decoration', all(x['animation']=='none' or x['duration'] in ('0s','1e-05s','0.00001s','0.01ms') for x in RESULT['reduced_motion']))
    page.emulate_media(reduced_motion='no-preference')
    RESULT['resources'] = page.evaluate('''() => performance.getEntriesByType('resource').map(e=>({url:e.name,duration:e.duration,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize,initiatorType:e.initiatorType}))''')
    RESULT['long_tasks_whole_page_chart_not_excluded'] = page.evaluate('window.__auditLongTasks')
    check('No browser pageerror observed (whole page, not chart diagnosis)', len(RESULT['page_errors']),0)
    save()
    # Close browsers so endpoint-only microbenchmarks do not include audit browser polling.
    context.close()
    browser.close()

# Read-only endpoint samples: modest load, no trading writes; charts excluded.
for account in ('titan','goldm15'):
    for route in ('status','journal_summary'):
        rows=[]
        for i in range(10):
            r=get('/api/'+route+'?account='+account)
            r.pop('body',None)
            rows.append(r)
        RESULT['api'].append({'account':account,'route':route,'mode':'serial ten samples','samples':rows})
        save()
with ThreadPoolExecutor(max_workers=4) as pool:
    rows=list(pool.map(get, ['/api/status?account='+a for a in ('titan','goldm15','titan','goldm15')]))
for row in rows: row.pop('body',None)
RESULT['concurrent_status_four_requests']=rows
for path in ('/api/status?account=unknown','/api/journal_summary?account=unknown','/missing-audit-route'):
    r=get(path);r.pop('body',None);RESULT['api_edge_cases']=RESULT.get('api_edge_cases',[])+[r]
save()
print(json.dumps({'states':len(RESULT['states']),'checks':len(RESULT['checks']),'failed':[r for r in RESULT['checks'] if not r['passed']],'page_errors':RESULT['page_errors'],'blocked_writes':len(RESULT['blocked_writes'])},ensure_ascii=False,indent=2))
