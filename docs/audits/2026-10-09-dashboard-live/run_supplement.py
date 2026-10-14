"""Supplemental read-only probes. Backend writes/MT5 calls replaced by mocks."""
import json
import time
import statistics
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock
from playwright.sync_api import sync_playwright
import app

OUT=Path(__file__).resolve().parent
S=OUT/'screenshots'
D={'mock_backend':{},'responsive':[], 'cold_load':{}, 'extras':{}}
# No requests to running backend, no terminal, order_send is a Mock.
fake=SimpleNamespace(symbol_info_tick=lambda _:SimpleNamespace(time=1791523200),account_info=lambda:SimpleNamespace(balance=10009.22))
with patch.object(app,'mt5',fake),patch.object(app,'ensure_mt5_init',return_value=True),patch.object(app,'save_dd_config') as save:
    for action,baseline in [('garbage',12345.),('reset',-100.),('reset',float('inf'))]:
        req=app.ResetDrawdownRequest(action=action,baseline=baseline)
        r=app.api_reset_drawdown.__wrapped__(req,account='goldm15')
        D['mock_backend'][str((action,baseline))]={'response':r,'save_payload':save.call_args.args[0]}
with patch('builtins.open',side_effect=PermissionError('AUDIT MOCK: disk unwritable')),patch.object(app.os.path,'exists',return_value=True),patch.object(app,'writes_titan_reset',return_value=True):
    try:
        app.save_dd_config({'audit_mock':True})
        D['mock_backend']['save_dd_permission_error']={'exception_raised':False,'result':'both file opens failed, function returned normally'}
    except Exception as e:
        D['mock_backend']['save_dd_permission_error']={'exception_raised':True,'error':str(e)}
# Non-dashboard instrument within correctly selected account: does endpoint constrain it?
constant={k:getattr(app.mt5,k) for k in ('ORDER_TYPE_BUY','ORDER_TYPE_SELL','ORDER_FILLING_IOC','ORDER_FILLING_RETURN','TRADE_ACTION_DEAL','TRADE_RETCODE_DONE')}
foreign=SimpleNamespace(symbol='EURUSD',volume=.01,type=constant['ORDER_TYPE_BUY'],price_open=1.1,sl=1.0,tp=0)
send=Mock(return_value=SimpleNamespace(retcode=constant['TRADE_RETCODE_DONE'],comment='AUDIT MOCK'))
fake=SimpleNamespace(**constant,positions_get=lambda **kw:[foreign],symbol_info=lambda _:SimpleNamespace(filling_mode=2),symbol_info_tick=lambda _:SimpleNamespace(bid=1.1,ask=1.2),order_send=send)
with patch.object(app,'mt5',fake),patch.object(app,'ensure_mt5_init',return_value=True),patch.object(app,'verify_identity',return_value=True):
    response=app.api_close_position.__wrapped__(app.ClosePositionRequest(ticket=999),account='titan')
    D['mock_backend']['foreign_symbol_close']={'response':response,'mock_send_payload':send.call_args.args[0],'actual_order_sent':False}

with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    c=b.new_context(viewport={'width':1440,'height':1000})
    def no_writes(route):
        if route.request.method not in ('GET','HEAD'):route.abort()
        else:route.continue_()
    c.route('**/*',no_writes)
    page=c.new_page()
    start=time.perf_counter()
    page.goto('http://127.0.0.1:8057',wait_until='networkidle')
    page.wait_for_function("currentData && currentData.account.id==='titan'")
    D['cold_load']['observed_wait_ms']=round((time.perf_counter()-start)*1000,2)
    D['cold_load']['navigation']=page.evaluate("performance.getEntriesByType('navigation')[0].toJSON()")
    D['cold_load']['resources']=page.evaluate("performance.getEntriesByType('resource').map(e=>({url:e.name,decodedBodySize:e.decodedBodySize,transferSize:e.transferSize,duration:e.duration}))")
    # Capture additional narrow and reflow widths. Half-width represents 200%-zoom
    # layout equivalence only; not a full browser UI zoom test.
    for theme in ('stone','dark','light'):
        page.locator('[data-mode="'+theme+'"]').click()
        for width,label in [(320,'narrow320'),(720,'reflow200-equivalent')]:
            page.set_viewport_size({'width':width,'height':1000})
            page.evaluate('scrollTo(0,0)')
            for sel,part in [('header.glass-card','header'),('.stone-asset-panel--matrix','matrix'),('.stone-asset-panel--positions','positions')]:
                page.locator(sel).screenshot(path=str(S/('titan-'+theme+'-'+label+'-'+part+'.png')))
            data=page.evaluate('''() => {
              let e=document.querySelector('#matrix-tbody').closest('table').parentElement;
              return {width:innerWidth,matrixClient:e.clientWidth,matrixScroll:e.scrollWidth,matrixOverflow:getComputedStyle(e).overflowX,countdownRect:document.querySelector('#bar-countdown').getBoundingClientRect().toJSON(),targets:Array.from(document.querySelectorAll('#positions-list button,#positions-list input')).map(e=>({text:e.innerText,id:e.id,rect:e.getBoundingClientRect().toJSON()}))};
            }''')
            D['responsive'].append({'theme':theme,'label':label,**data})
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-mode="stone"]').click()
    D['extras']['stone_matrix_scroll']=page.evaluate('''() => {let e=document.querySelector('#matrix-tbody').closest('table').parentElement;e.scrollLeft=999;return {max:e.scrollWidth-e.clientWidth,actual:e.scrollLeft};}''')
    page.locator('.stone-asset-panel--matrix').screenshot(path=str(S/'titan-stone-mobile-matrix-scrolled.png'))
    page.locator('[data-mode="dark"]').click()
    D['extras']['dark_matrix_scroll']=page.evaluate('''() => {let e=document.querySelector('#matrix-tbody').closest('table').parentElement;e.scrollLeft=999;return {max:e.scrollWidth-e.clientWidth,actual:e.scrollLeft,overflow:getComputedStyle(e).overflowX};}''')
    page.locator('.stone-asset-panel--matrix').screenshot(path=str(S/'titan-dark-mobile-matrix.png'))
    # Restore scroll only; no chart calls.
    page.evaluate('renderPositions([])')
    page.locator('.stone-asset-panel--positions').screenshot(path=str(S/'injected-empty-positions.png'))
    D['extras']['empty_positions']={'text':page.locator('#positions-list').inner_text(),'input_count':page.locator('#positions-list input').count(),'injected':True}
    page.evaluate('renderPositions(currentData.positions)')
    page.locator('#dd-reset-button').click()
    page.add_script_tag(path=str(OUT/'axe.min.js'))
    D['extras']['modal_axe']=page.evaluate("async()=>{let r=await axe.run({include:[['#dd-reset-modal']]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))}));}")
    page.screenshot(path=str(S/'titan-dark-mobile-reset-modal.png'))
    page.evaluate('closeDrawdownResetModal()')
    c.close();b.close()

# Summarize real screenshot/binary metrics programmatically.
from PIL import Image
D['screenshots']=[{'file':'screenshots/'+f.name,'bytes':f.stat().st_size,'size':list(Image.open(f).size)} for f in sorted(S.glob('*.png'))]
(OUT/'supplement-results.json').write_text(json.dumps(D,ensure_ascii=False,indent=2,allow_nan=True),encoding='utf-8')
print(json.dumps({'mock_backend':D['mock_backend'],'cold_ms':D['cold_load']['observed_wait_ms'],'screenshots':len(D['screenshots']),'extras':D['extras']},ensure_ascii=False,indent=2,allow_nan=True))
