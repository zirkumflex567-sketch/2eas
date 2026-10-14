"""Additional non-chart reliability tests using only isolated mocks and read-only browsers."""
import json
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch,Mock
import numpy as np
import app
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parent
D={}
# Reuse isolated fixture builder, never attach a real terminal.
spec=importlib.util.spec_from_file_location('audit_existing_tests',Path('tests/test_multi_account.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
test=m.MultiAccountTests();test.setUp()
try:
    fake=test.fake()
    dtype=[('time','i8'),('open','f8'),('high','f8'),('low','f8'),('close','f8'),('tick_volume','i8')]
    rates=np.zeros(1000,dtype=dtype)
    rates['time']=1791475200+np.arange(1000)*900
    rates['open']=4000+np.arange(1000)*.1;rates['close']=rates['open']+.05
    rates['high']=rates['close']+4;rates['low']=rates['open']-4;rates['tick_volume']=10
    tick_time=int(rates['time'][-1])+100
    fake.symbol_info=lambda _:SimpleNamespace(spread=5,trade_contract_size=100)
    fake.symbol_info_tick=lambda _:SimpleNamespace(time=tick_time,bid=4100.,ask=4100.05)
    fake.account_info=lambda:SimpleNamespace(login=fake.current['login'],server=fake.current['server'],balance=9700.,equity=9700.)
    fake.copy_rates_from_pos=lambda *args:rates[-args[-1]:]
    fake.positions_get=lambda **kw:[];fake.history_deals_get=lambda *args:None
    fake.ORDER_TYPE_BUY=app.mt5.ORDER_TYPE_BUY
    fake.DEAL_TYPE_BUY=app.mt5.DEAL_TYPE_BUY;fake.DEAL_TYPE_SELL=app.mt5.DEAL_TYPE_SELL
    cfg={'manual_reset_active':True,'reset_balance':10000.,'reset_timestamp':tick_time-86400,'reset_date':'old day'}
    with patch.object(app,'mt5',fake),patch.object(app,'load_dd_config',return_value=cfg),patch.object(app,'get_cached_trade_journal',return_value=[]):
        with test.gateway.session(fake,'titan'):
            result=app.get_live_market_data()
            D['old_day_reset']={'config':cfg,'drawdown':result['daily_drawdown'],'injected_mock':True}
    with patch.object(app,'mt5',fake),patch.object(app,'load_dd_config',return_value={}),patch.object(app,'get_cached_trade_journal',return_value=[]):
        with test.gateway.session(fake,'titan'):
            a=app.get_live_market_data()
            rates['close'][-1]=rates['close'][-1]-100
            b=app.get_live_market_data()
            D['titan_open_bar_change']={'before_readiness':a['buy_readiness'],'after_readiness':b['buy_readiness'],'closed_bars_unchanged':True,'injected_mock':True}
            D['missing_deal_history']={'injected_history':None,'drawdown':a['daily_drawdown'],'injected_mock':True}
    # Full endpoint false success: persistence mocked to fail both opens, MT5 completely fake.
    fake.symbol_info_tick=lambda _:SimpleNamespace(time=tick_time)
    with patch.object(app,'mt5',fake),patch.object(app,'ensure_mt5_init',return_value=True),patch('builtins.open',side_effect=PermissionError('AUDIT MOCK')),patch.object(app.os.path,'exists',return_value=True),patch.object(app,'writes_titan_reset',return_value=True):
        r=app.api_reset_drawdown.__wrapped__(app.ResetDrawdownRequest(action='reset',baseline=10000.),account='titan')
        D['persistence_failure_api_success']={'response':r,'disk_writes':False,'injected_mock':True}
    # Negative price sends zero (stop removed), no live order.
    fake.positions_get=lambda **kw:[SimpleNamespace(type=0,symbol='XAUUSD',volume=.01,price_open=4000.,sl=3990.,tp=4050.)]
    fake.symbol_info=lambda _:SimpleNamespace(trade_contract_size=100.,digits=2)
    fake.order_send=Mock(return_value=SimpleNamespace(retcode=10009,comment='AUDIT MOCK'))
    for k in ('TRADE_ACTION_SLTP','TRADE_RETCODE_DONE'):setattr(fake,k,getattr(app.mt5,k))
    with patch.object(app,'mt5',fake),patch.object(app,'ensure_mt5_init',return_value=True),patch.object(app,'verify_identity',return_value=True):
        r=app.api_modify_position.__wrapped__(app.ModifyPositionRequest(ticket=999,sl_price=-1),account='titan')
        D['negative_stop_price']={'response':r,'mock_send_payload':fake.order_send.call_args.args[0],'actual_order_sent':False}
finally:
    test.doCleanups()

with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    c=b.new_context(viewport={'width':1440,'height':900})
    def safe(route):
        if route.request.method not in ('GET','HEAD'):route.abort()
        else:route.continue_()
    c.route('**/*',safe)
    page=c.new_page();page.goto('http://127.0.0.1:8057',wait_until='networkidle')
    page.wait_for_function('currentData!==null')
    D['diagnostic_classes']=page.locator('#diagnose-card').get_attribute('class')
    D['diagnostic_loses_stone_class']='stone-asset-panel' not in D['diagnostic_classes']
    page.evaluate('''() => {window.__orig=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/journal_summary')?Promise.resolve(new Response(JSON.stringify({detail:'AUDIT INJECTED: all journal sources unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})):window.__orig(url,options);void setJournalFilter('all');}''')
    page.wait_for_function('journalLoadedMode===\'all\' && journalErrors.length===2')
    D['all_journal_failed']={'warning':page.locator('#journal-sync-status').inner_text(),'count':page.locator('#journal-count-badge').inner_text(),'total':page.locator('#journal-total-pnl').inner_text()}
    page.locator('.stone-asset-panel--journal').screenshot(path=str(OUT/'screenshots/injected-all-journals-failed.png'))
    c.close()
    # Initial account-list failure then recover network; see whether app retries.
    c=b.new_context(viewport={'width':1440,'height':900})
    calls=[]
    def accounts_offline(route):
        calls.append(route.request.url)
        route.fulfill(status=503,content_type='application/json',body='{"detail":"AUDIT INJECTED initial accounts outage"}')
    c.route('**/*',safe)
    c.route('**/api/accounts',accounts_offline)
    page=c.new_page();page.goto('http://127.0.0.1:8057',wait_until='networkidle')
    c.unroute('**/api/accounts',accounts_offline)
    page.wait_for_timeout(7000)
    D['account_bootstrap_no_retry']={'initial_failures':len(calls),'account_count':page.evaluate('Object.keys(accounts).length'),'has_data':page.evaluate('currentData!==null'),'label':page.locator('#account-connection').inner_text(),'network_recovered_wait_ms':7000}
    page.screenshot(path=str(OUT/'screenshots/injected-accounts-start-failure.png'),full_page=True)
    c.close();b.close()
(OUT/'reliability-results.json').write_text(json.dumps(D,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(D,indent=2,ensure_ascii=False))
