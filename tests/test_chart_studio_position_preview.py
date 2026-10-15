import importlib
from decimal import getcontext
import pytest

def test_preview_numeric_policy_is_exact_and_local():
    assert importlib.util.find_spec('chart_studio.position_preview') is not None
    from chart_studio.position_preview import number, mt5_float
    before = getcontext().copy()
    assert str(number('4000.01')) == '4000.01'
    for value in ('0', '-1', '1e2', '0.0000000000001', '1000000000001', True, 1.2):
        with pytest.raises(ValueError): number(value)
    assert mt5_float(number('4000.01'), number('0.01')) == 4000.01
    assert getcontext().prec == before.prec
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException
from dashboard_security import install_control_security
import account_gateway as gateway
from test_chart_studio_broker_reads import MT5Fake, NOW
from chart_studio.broker_reads import position_model

@pytest.fixture
def api(monkeypatch):
    assert importlib.util.find_spec('chart_studio.preview_api') is not None
    from chart_studio.preview_api import install_preview_routes
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: True)
    gateway._attached_mt5 = gateway._attached_account = None
    for account in gateway.ACCOUNTS.values(): monkeypatch.setitem(account, 'broker_utc_offset_seconds', 10800)
    fake = MT5Fake()
    for sym in fake.symbols: sym.order_mode=48
    fake.order_calc_profit = lambda side,symbol,volume,opening,closing: (closing-opening)*volume*(1 if side==0 else -1)
    fake.order_check = lambda *a,**k: pytest.fail('order_check forbidden')
    app = FastAPI()
    install_control_security(app)
    install_preview_routes(app, fake, now=lambda:NOW)
    spec=gateway.ACCOUNTS['titan']
    request=dict(account='titan',symbol='XAUUSD',positionTicket=str(fake.positions[0].ticket),
                 expectedRevision=position_model(fake.positions[0],spec,'XAUUSD','EUR')['revision'],
                 candidate={'slPrice':'3999.00','tpPrice':'4002.00'},
                 clientRequestId='b98d71dc-bd22-4a68-8d45-935a5e4b1cf1')
    yield TestClient(app),fake,request
    gateway._attached_mt5 = gateway._attached_account = None

def test_route_is_read_only_ticket_bound_gross_eur(api):
    client,fake,payload=api
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==200,response.text
    data=response.json()
    assert data['canExecute'] is data['canCommit'] is False
    assert data['guard']=={'state':'UNKNOWN','source':'NONE'}
    assert data['pnlAtSl']['currency']=='EUR'
    assert data['geometry']['state']=='VALID'
    assert data['brokerPreview']=={'slPrice':'3999.00','tpPrice':'4002.00'}

def test_route_preserves_exact_suffixed_gold_symbol_and_never_writes(api):
    client,fake,payload=api
    from test_chart_studio_broker_reads import position, symbol
    from chart_studio.broker_reads import position_model
    fake.positions=(position(symbol='XAUUSD.p'),)
    fake.orders=()
    fake.symbols=(*fake.symbols,symbol('XAUUSD.p'))
    def calc_profit(action,name,volume,opening,closing):
        fake.calls.append(('calc_profit',name,action))
        return (closing-opening)*volume*(1 if action==0 else -1)
    fake.order_calc_profit=calc_profit
    payload['symbol']='XAUUSD.p'
    payload['expectedRevision']=position_model(
        fake.positions[0],gateway.ACCOUNTS['titan'],'XAUUSD.p','EUR')['revision']
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==200,response.text
    data=response.json()
    assert data['symbol']=='XAUUSD.p'
    assert any(call[0]=='calc_profit' and call[1]=='XAUUSD.p' for call in fake.calls)
    assert data['canExecute'] is data['canCommit'] is False
    assert data['guard']=={'state':'UNKNOWN','source':'NONE'}
    assert fake.writes==0

def test_conflict_and_strict_candidate(api):
    client,fake,payload=api
    payload['expectedRevision']='0'*64
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['code']=='POSITION_CHANGED'
    payload['candidate']={'slPrice':3999.0}
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==422

@pytest.mark.parametrize('field,value',[
    ('positionTicket','99'),
    ('symbol','EURUSD.a'),
])
def test_wrong_position_scope_is_rejected_before_money_calculation(api,field,value):
    client,fake,payload=api
    if field=='symbol':
        fake.positions=()
        fake.orders=()
    payload[field]=value
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==404
    assert response.json()['detail']['code']=='POSITION_NOT_FOUND'
    assert not any(call[0]=='calc_profit' for call in fake.calls)
    assert fake.writes==0

def test_registry_exact_expiry_and_independent_copies():
    from chart_studio.position_preview import PreviewRegistry
    clock=[0.]
    registry=PreviewRegistry(monotonic=lambda:clock[0],capacity=1)
    first=registry.put('scope',{'x':[1]})
    first['x'].append(2)
    assert registry.lookup(first['previewId'],'scope')['x']==[1]
    with pytest.raises(HTTPException): registry.lookup(first['previewId'],'other')
    clock[0]=10
    with pytest.raises(HTTPException): registry.lookup(first['previewId'],'scope')
@pytest.mark.parametrize('age,expected',[(-501,503),(-500,200),(5000,200),(5001,503)])
def test_quote_signed_age_inclusive_bounds(api,age,expected):
    client,fake,payload=api
    raw=int((NOW+10800)*1000-age)
    fake.tick.time_msc=raw; fake.tick.time=raw//1000
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==expected

@pytest.mark.parametrize('candidate,reason',[
    ({'slPrice':'3999.001'},'SL_OFF_GRID'),({'slPrice':'4001'},'SL_WRONG_SIDE'),
    ({'slPrice':'3999.95'},'SL_STOPS_LEVEL')])
def test_geometry_invalid_still_never_permission(api,candidate,reason):
    client,fake,payload=api; payload['candidate']=candidate
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert reason in data['geometry']['reasons']
    assert data['canCommit'] is False

def test_unset_omitted_and_profitable_trailing(api):
    client,fake,payload=api
    fake.tick.bid=4005.; fake.tick.ask=4005.05
    payload['candidate']={'slPrice':'4001','tpPrice':None}
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert data['geometry']['state']=='VALID'
    assert data['ratioRiskReward'] is None
    assert data['pnlAtTp'] is None

def test_limiter_refill_release_and_global_concurrency():
    from chart_studio.position_preview import PreviewLimiter
    now=[0.]; limiter=PreviewLimiter(monotonic=lambda:now[0])
    with limiter.acquire('a'):
        with pytest.raises(HTTPException):
            with limiter.acquire('b'): pass
    for _ in range(7):
        with limiter.acquire('a'): pass
    with pytest.raises(HTTPException):
        with limiter.acquire('a'): pass
    now[0]=.25
    with limiter.acquire('a'): pass
    with limiter.acquire('b'): pass

def test_missing_identity_never_enters_gateway(monkeypatch):
    from chart_studio.preview_api import install_preview_routes
    app=FastAPI(); fake=MT5Fake(); install_preview_routes(app,fake)
    payload=dict(account='titan',symbol='XAUUSD',positionTicket='1',expectedRevision='0'*64,
                 candidate={'slPrice':'1'},clientRequestId='b98d71dc-bd22-4a68-8d45-935a5e4b1cf1')
    assert TestClient(app).post('/api/chart/v1/position/preview-stop',json=payload).status_code==403
    assert fake.calls==[]

def test_revision_race_and_final_quote_reread(api):
    client,fake,payload=api
    def calculate(*args):
        fake.positions[0].sl=3988.
        return -1.
    fake.order_calc_profit=calculate
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['code']=='POSITION_CHANGED'

def test_bad_money_and_metadata(api):
    client,fake,payload=api
    fake.order_calc_profit=lambda *a:True
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==503
    fake.symbols[0].trade_tick_size=1e-13
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert data['detail']['code']=='NUMERIC_POLICY_UNSUPPORTED'
@pytest.mark.parametrize('value',['1'*33,'1.0000000000001','1000000000000.000000000001','01','+1','NaN','Infinity',' 1'])
def test_numeric_request_policy_boundaries(value):
    from chart_studio.position_preview import number
    with pytest.raises(ValueError): number(value)

def test_precision_float_underflow_overflow_and_ulp():
    from decimal import Decimal
    from chart_studio.position_preview import mt5_float
    for value,step in [('1e-400','1e-400'),('1e400','1'),('1e12','1e-12')]:
        with pytest.raises(ValueError): mt5_float(Decimal(value),Decimal(step))

def test_frozen_existing_removal_and_support(api):
    client,fake,payload=api
    fake.positions[0].sl=3999.99
    payload['expectedRevision']=position_model(fake.positions[0],gateway.ACCOUNTS['titan'],'XAUUSD','EUR')['revision']
    payload['candidate']={'slPrice':None}
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert 'SL_EXISTING_FROZEN' in data['geometry']['reasons']
    fake.symbols[0].order_mode=32
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert 'SL_UNSUPPORTED' in data['geometry']['reasons']

def test_final_quote_change_rejected_and_limiter_released(api):
    client,fake,payload=api
    def calculation(*args):
        fake.tick.time_msc=(NOW+10800-6)*1000
        fake.tick.time=fake.tick.time_msc//1000
        return -1.
    fake.order_calc_profit=calculation
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==503
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==503

def test_full_book_validation_cannot_hide_pending_or_wrong_symbol(api):
    client,fake,payload=api
    fake.positions[1].symbol='WRONG'
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==503

def test_registry_eviction_and_wallclock_independence():
    from chart_studio.position_preview import PreviewRegistry
    timer=[1.]; registry=PreviewRegistry(monotonic=lambda:timer[0],capacity=1)
    a=registry.put('a',{'expiresUtc':'past'})
    b=registry.put('b',{'expiresUtc':'future'})
    with pytest.raises(HTTPException): registry.lookup(a['previewId'],'a')
    assert registry.lookup(b['previewId'],'b')['expiresUtc']=='future'

def test_missing_actual_ticket_is_404(api):
    client,fake,payload=api; payload['positionTicket']='1234'
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==404
def test_actual_metadata_prices_and_volume_policy(api):
    client,fake,payload=api
    fake.positions[0].price_open=1e12+.1
    payload['expectedRevision']=position_model(fake.positions[0],gateway.ACCOUNTS['titan'],'XAUUSD','EUR')['revision']
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==503
    fake.positions[0].price_open=4000.
    fake.symbols[0].volume_max=1e10
    payload['expectedRevision']=position_model(fake.positions[0],gateway.ACCOUNTS['titan'],'XAUUSD','EUR')['revision']
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==503
@pytest.mark.parametrize('role',['read','layout','trade'])
def test_real_proxy_middleware_scope_binding_and_downgrade(api,monkeypatch,role):
    import json
    from chart_studio.position_preview import scope_hash
    client,fake,payload=api
    secret='x'*40
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET',secret)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS',json.dumps({'alice':role,'bob':role}))
    proxy=TestClient(client.app,client=('127.0.0.1',4321))
    headers={'X-Dashboard-Proxy-Secret':secret,'X-Dashboard-User':'alice'}
    response=proxy.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers)
    assert response.status_code==200,response.text
    data=response.json(); registry=client.app.state.position_preview_registry
    spec=gateway.ACCOUNTS['titan']
    def scope(user='alice',permission=role,account=None):
        return scope_hash(('proxy',user,permission),'127.0.0.1',account or spec,
                          payload['symbol'],payload['positionTicket'],payload['expectedRevision'])
    assert registry.lookup(data['previewId'],scope())['clientRequestId']==payload['clientRequestId']
    for other in (scope('bob'),scope(permission='read' if role=='trade' else 'trade'),scope(account=gateway.ACCOUNTS['goldm15'])):
        with pytest.raises(HTTPException): registry.lookup(data['previewId'],other)

def test_http_inflight_rejection_does_not_touch_broker(api):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    client,fake,payload=api
    entered=threading.Event(); release=threading.Event()
    def calculate(*args):
        entered.set(); assert release.wait(5); return -1.
    fake.order_calc_profit=calculate
    with ThreadPoolExecutor(max_workers=2) as pool:
        first=pool.submit(client.post,'/api/chart/v1/position/preview-stop',json=payload)
        assert entered.wait(5)
        calls=list(fake.calls)
        rejected=client.post('/api/chart/v1/position/preview-stop',json=payload)
        assert rejected.status_code==429
        assert rejected.headers['Retry-After']=='1'
        assert calls==fake.calls
        release.set(); assert first.result().status_code==200

def test_limiter_capacity_never_evicts_active_principal():
    from chart_studio.position_preview import PreviewLimiter
    limiter=PreviewLimiter(monotonic=lambda:0)
    for n in range(256):
        with limiter.acquire(str(n)): pass
    assert len(limiter.users)==256
    with limiter.acquire('new'):
        assert len(limiter.users)==256
        assert limiter.users['new'][2]
        with pytest.raises(HTTPException):
            with limiter.acquire('another'): pass
        assert 'new' in limiter.users

def test_after_calculation_account_identity_change_fails(api):
    client,fake,payload=api
    def calculation(*args):
        fake.wrong='login'; return -1.
    fake.order_calc_profit=calculation
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==409

def test_volume_actual_step_rejected(api):
    client,fake,payload=api
    fake.symbols[0].volume_step=.03
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==503
    assert response.json()['detail']['code']=='NUMERIC_POLICY_UNSUPPORTED'

@pytest.mark.parametrize('age,expected',[(-501,503),(-500,200),(5000,200),(5001,503)])
def test_final_quote_signed_age_boundaries(api,age,expected):
    client,fake,payload=api
    def calculation(*args):
        raw=(NOW+10800)*1000-age
        fake.tick.time_msc=raw; fake.tick.time=raw//1000
        return -1.
    fake.order_calc_profit=calculation
    assert client.post('/api/chart/v1/position/preview-stop',json=payload).status_code==expected
def test_validation_and_gateway_errors_are_readonly_envelopes(api):
    client,fake,payload=api
    payload['schemaVersion']=True
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==422
    assert response.json()['detail']['canCommit'] is False
    del payload['schemaVersion']; fake.wrong='login'
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['canExecute'] is False
def test_metadata_changed_during_calculation_invalidates_preview(api):
    client,fake,payload=api
    def calculation(*args):
        fake.symbols[0].trade_tick_size=.02
        return -1.
    fake.order_calc_profit=calculation
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['code']=='SYMBOL_CHANGED'
def test_preview_does_not_depend_on_or_mutate_global_decimal_precision(api):
    from decimal import getcontext
    client,fake,payload=api
    old=getcontext().prec
    try:
        getcontext().prec=3
        response=client.post('/api/chart/v1/position/preview-stop',json=payload)
        assert response.status_code==200,response.text
        assert getcontext().prec==3
    finally: getcontext().prec=old
def test_canonical_master_spec_preview_contract(api):
    client,fake,payload=api
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert data['positionRevision']==payload['expectedRevision']
    assert data['brokerPreview']=={'slPrice':'3999.00','tpPrice':'4002.00'}
    assert data['valid'] is True
    assert data['pnlAtSl']=={'amount':'-0.1','currency':'EUR','kind':'estimatedGross'}
    assert data['pnlAtTp']=={'amount':'0.2','currency':'EUR','kind':'estimatedGross'}
    assert data['ratioRiskReward']=='2'
    assert data['quoteTimeUtc']=='2026-10-09T12:00:00.123000Z'
    assert data['expiresAtUtc']
    assert not {'actualPositionRevision','finalBrokerPreview','expiresUtc'} & data.keys()

@pytest.mark.parametrize('field,initial,changed',[
    ('trade_contract_size',100.,200.),('trade_calc_mode',0,1),
    ('currency_profit','USD','EUR'),('currency_base','XAU','XAG'),
    ('currency_margin','USD','EUR'),('trade_tick_value',1.,2.),
    ('trade_tick_value_profit',1.,2.),('trade_tick_value_loss',1.,2.)])
def test_monetary_symbol_context_correction_conflicts(api,field,initial,changed):
    client,fake,payload=api
    setattr(fake.symbols[0],field,initial)
    def calculate(*args):
        setattr(fake.symbols[0],field,changed)
        return -1.
    fake.order_calc_profit=calculate
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['code']=='SYMBOL_CHANGED'

def test_monetary_account_currency_correction_conflicts(api):
    client,fake,payload=api
    original=fake.account_info
    currency=['EUR']
    def info():
        result=original(); result.currency=currency[0]; return result
    fake.account_info=info
    def calculate(*args): currency[0]='USD'; return -1.
    fake.order_calc_profit=calculate
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==409
    assert response.json()['detail']['code']=='ACCOUNT_CURRENCY_CHANGED'

def test_registry_expired_error_guard_invariant():
    from chart_studio.position_preview import PreviewRegistry
    with pytest.raises(HTTPException) as caught:
        PreviewRegistry().lookup('missing','scope')
    assert caught.value.detail['guard']=={'state':'UNKNOWN','source':'NONE'}
@pytest.mark.parametrize('mode,reason',[(0,'TRADE_DISABLED'),(1,'TRADE_LONG_ONLY'),(2,'TRADE_SHORT_ONLY'),(3,'TRADE_CLOSE_ONLY'),(4,None)])
def test_trade_modes_are_accurately_reported(api,mode,reason):
    client,fake,payload=api; fake.symbols[0].trade_mode=mode
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert data['geometry']['tradeMode']==mode
    if reason is None: assert data['geometry']['state']=='VALID'
    else:
        assert reason in data['geometry']['reasons']
        assert data['geometry']['state']=='INVALID'
        if mode: assert 'TRADE_DISABLED' not in data['geometry']['reasons']

def test_unknown_trade_mode_is_explicit(api):
    client,fake,payload=api; fake.symbols[0].trade_mode=99
    response=client.post('/api/chart/v1/position/preview-stop',json=payload)
    assert response.status_code==503
    assert response.json()['detail']['code']=='TRADE_MODE_UNKNOWN'

def test_same_verified_bearer_principal_shares_quota_across_peers(api,monkeypatch):
    from chart_studio.preview_api import install_preview_routes
    client,fake,payload=api
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN','x'*40)
    app=FastAPI(); install_control_security(app)
    install_preview_routes(app,fake,now=lambda:NOW,monotonic=lambda:0.)
    one=TestClient(app,client=('203.0.113.1',1)); two=TestClient(app,client=('203.0.113.2',2))
    headers={'Authorization':'Bearer '+'x'*40}
    for _ in range(8): assert one.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers).status_code==200
    assert one.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers).status_code==429
    calls=list(fake.calls)
    assert two.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers).status_code==429
    assert fake.calls==calls

def test_same_proxy_principal_shares_quota_across_roles_other_user_isolated(api,monkeypatch):
    import json
    from chart_studio.preview_api import install_preview_routes
    client,fake,payload=api
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET','x'*40)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS',json.dumps({'alice':'trade','bob':'read'}))
    app=FastAPI(); install_control_security(app)
    install_preview_routes(app,fake,now=lambda:NOW,monotonic=lambda:0.)
    proxy=TestClient(app,client=('127.0.0.1',1))
    def headers(user): return {'X-Dashboard-Proxy-Secret':'x'*40,'X-Dashboard-User':user}
    for _ in range(8): assert proxy.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers('alice')).status_code==200
    monkeypatch.setenv('DASHBOARD_PROXY_USERS',json.dumps({'alice':'read','bob':'read'}))
    assert proxy.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers('alice')).status_code==429
    assert proxy.post('/api/chart/v1/position/preview-stop',json=payload,headers=headers('bob')).status_code==200
@pytest.mark.parametrize('leg,actual,equivalent,changed',[
    ('sl',3999.99,'3999.990','3999.98'),
    ('tp',4000.01,'4000.010','4000.02')])
def test_numeric_equivalent_existing_frozen_leg_is_unchanged(api,leg,actual,equivalent,changed):
    client,fake,payload=api
    setattr(fake.positions[0],leg,actual)
    payload['expectedRevision']=position_model(fake.positions[0],gateway.ACCOUNTS['titan'],'XAUUSD','EUR')['revision']
    payload['candidate']={leg+'Price':equivalent}
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert data['valid'] is True,data
    assert data['geometry']['reasons']==[]
    payload['candidate']={leg+'Price':changed}
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert leg.upper()+'_EXISTING_FROZEN' in data['geometry']['reasons']
    payload['candidate']={leg+'Price':None}
    data=client.post('/api/chart/v1/position/preview-stop',json=payload).json()
    assert leg.upper()+'_EXISTING_FROZEN' in data['geometry']['reasons']
