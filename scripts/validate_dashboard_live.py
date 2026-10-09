"""Final live GET-only browser validation; evidence stays local and confidential."""
import json,time,statistics
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/integration-live'
OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:8060'
D={'states':[],'page_errors':[],'blocked':[],'api':[]}
def save(): (OUT/'results.json').write_text(json.dumps(D,ensure_ascii=False,indent=2),encoding='utf-8')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);c=b.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');page=c.new_page()
 page.on('pageerror',lambda e:D['page_errors'].append(str(e)))
 def safe(route):
  if route.request.method not in ('GET','HEAD'):
   D['blocked'].append({'url':route.request.url,'method':route.request.method});route.abort()
  else:route.continue_()
 c.route('**/*',safe)
 page.goto(BASE,wait_until='networkidle');page.wait_for_function('currentData!==null',timeout=30000)
 for account in ['titan','goldm15']:
  page.locator('[data-account="'+account+'"]').click();page.wait_for_function('(a)=>currentData?.account.id===a',arg=account,timeout=30000)
  for theme in ['stone','dark','light']:
   page.locator('[data-mode="'+theme+'"]').click()
   for width,height in [(1440,1000),(768,1024),(390,844),(320,844)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80);page.evaluate('scrollTo(0,0)')
    label=account+'-'+theme+'-'+str(width)
    page.screenshot(path=str(OUT/(label+'.png')),full_page=True)
    page.locator('header.glass-card').screenshot(path=str(OUT/(label+'-header.png')))
    page.locator('.stone-asset-panel--matrix').screenshot(path=str(OUT/(label+'-matrix.png')))
    page.locator('.stone-asset-panel--positions').screenshot(path=str(OUT/(label+'-positions.png')))
    row={'label':label,'geometry':page.evaluate('''()=>{let r=document.querySelector('#bar-countdown').getBoundingClientRect(),m=document.querySelector('#matrix-scroll');return{viewport:innerWidth,countdown:r.toJSON(),matrix:{width:m.clientWidth,scroll:m.scrollWidth,overflow:getComputedStyle(m).overflowX},connection:document.querySelector('#account-connection').textContent,positions:currentData.positions.length,ruleCount:currentData.rule_count,headerFont:getComputedStyle(document.querySelector('#bar-countdown')).fontSize};}''')}
    assert row['geometry']['countdown']['right']<=width+1 and row['geometry']['countdown']['left']>=-1,row
    if width==1440:
     page.add_script_tag(path=str(ROOT/'tests/vendor/axe.min.js'))
     row['axe']=page.evaluate('''async()=>{let r=await axe.run({include:[['nav[aria-label="Konto und Strategie"]'],['header.glass-card'],['#diagnose-card'],['#gold-details'],['.stone-asset-panel--matrix'],['.stone-asset-panel--positions'],['.stone-asset-panel--journal']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return{violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,failure:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};}''')
     page.locator('.stone-asset-panel--journal').screenshot(path=str(OUT/(label+'-journal.png')))
    D['states'].append(row);save()
 D['resources']=page.evaluate("performance.getEntriesByType('resource').map(e=>({url:e.name,bytes:e.decodedBodySize,duration:e.duration}))")
 D['live_magics']=page.evaluate('currentData.positions.map(p=>({ticket:p.ticket,magic:p.magic}))')
 c.close();b.close()
for account in ['titan','goldm15']:
 for include in [False,True]:
  samples=[]
  for i in range(12):
   start=time.perf_counter();r=urlopen(BASE+'/api/status?account='+account+'&include_journal='+str(include).lower(),timeout=30);body=r.read();samples.append({'ms':round((time.perf_counter()-start)*1000,2),'bytes':len(body),'code':r.status})
  D['api'].append({'account':account,'include_journal':include,'samples':samples,'median_ms':statistics.median(x['ms'] for x in samples),'max_ms':max(x['ms'] for x in samples)});save()
D['summary']={'states':len(D['states']),'page_errors':len(D['page_errors']),'non_get_blocked':len(D['blocked']),'axe_rules':[(s['label'],[(v['id'],len(v['nodes'])) for v in s['axe']['violations']]) for s in D['states'] if 'axe'in s]};save();print(json.dumps(D['summary'],indent=2));print(json.dumps(D['api'],indent=2))
