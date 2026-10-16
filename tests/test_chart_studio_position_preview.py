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
@pytest.mark.parametrize('age,expected',[(-1001,503),(-1000,200),(-501,200),(-500,200),(5000,200),(5001,503)])
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

@pytest.mark.parametrize('age,expected',[(-1001,503),(-1000,200),(-501,200),(-500,200),(5000,200),(5001,503)])
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

def test_preview_registry_consume_is_scope_bound_and_one_time():
    from fastapi import HTTPException
    from chart_studio.position_preview import PreviewRegistry
    registry = PreviewRegistry(monotonic=lambda: 10.)
    token = registry.put('scope-a', {'preview': 'safe'})['previewId']
    with pytest.raises(HTTPException):
        registry.consume(token, 'scope-b')
    assert registry.consume(token, 'scope-a')['preview'] == 'safe'
    with pytest.raises(HTTPException) as expired:
        registry.consume(token, 'scope-a')
    assert expired.value.status_code == 410


def test_preview_registry_consume_race_has_exactly_one_winner():
    import concurrent.futures
    from fastapi import HTTPException
    from chart_studio.position_preview import PreviewRegistry
    registry = PreviewRegistry(monotonic=lambda: 10.)
    token = registry.put('scope-a', {'preview': 'safe'})['previewId']
    def consume(_):
        try:
            registry.consume(token, 'scope-a')
            return 'consumed'
        except HTTPException:
            return 'rejected'
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(consume, range(8)))
    assert results.count('consumed') == 1
    assert results.count('rejected') == 7

def test_commit_service_sends_once_then_requires_exact_broker_readback(api, tmp_path, monkeypatch):
    from types import SimpleNamespace
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    client, fake, preview_request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **preview_request,
        'candidate': {'slPrice': '3999.00'},
    }).json()
    fake.TRADE_ACTION_SLTP = 6
    fake.TRADE_RETCODE_DONE = 10009
    fake.order_check = lambda request: SimpleNamespace(retcode=0)
    sent = []
    def send(request):
        sent.append(dict(request))
        current = fake.positions[0]
        current.sl = request['sl']
        current.tp = request['tp']
        current.time_update += 1
        current.time_update_msc += 1000
        return SimpleNamespace(retcode=fake.TRADE_RETCODE_DONE)
    fake.order_send = send
    class Guard:
        def evaluate(self, **kwargs):
            return {'state': 'ALLOW', 'source': 'TEST_GUARD', 'hardLock': False}
    store = PositionCommitStore(tmp_path / 'private' / 'commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, client.app.state.position_preview_registry,
                                    store, Guard(), now=lambda: NOW)
    identity, peer = ('local', 'testclient', 'trade'), 'testclient'
    result = service.commit(SimpleNamespace(
        account='titan', symbol='XAUUSD', positionTicket=str(fake.positions[0].ticket),
        expectedRevision=preview['positionRevision'], previewId=preview['previewId'],
        userConfirmed=True, idempotencyKey='11111111-1111-4111-8111-111111111111'), identity, peer)
    assert result['status'] == 'SAVED'
    assert result['slPrice'] == '3999'
    assert result['tpPrice'] is None
    assert result['verified'] is True
    assert len(sent) == 1
    assert sent[0]['position'] == fake.positions[0].ticket
    assert sent[0]['sl'] == 3999.
    assert sent[0]['tp'] == 0.
    assert store.reserve('local:testclient', '11111111-1111-4111-8111-111111111111', {
        'account': 'titan', 'symbol': 'XAUUSD', 'ticket': str(fake.positions[0].ticket),
        'revision': preview['positionRevision'], 'previewId': preview['previewId'],
    }).state == 'SAVED'


def _prepare_commit_service(client, fake, tmp_path, guard=None, *, order_check_retcode=0,
                            apply_readback=True, broker_response="done"):
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    from chart_studio.position_commit_api import install_position_commit_routes
    fake.TRADE_ACTION_SLTP = 6
    fake.TRADE_RETCODE_DONE = 10009
    fake.order_check = lambda request: type('Check', (), {'retcode': order_check_retcode})()
    sent = []
    def send(request):
        sent.append(dict(request))
        if broker_response == 'none':
            return None
        if apply_readback:
            current = fake.positions[0]
            current.sl, current.tp = request['sl'], request['tp']
            current.time_update += 1
            current.time_update_msc += 1000
        code = 10016 if broker_response == 'reject' else fake.TRADE_RETCODE_DONE
        return type('Result', (), {'retcode': code})()
    fake.order_send = send
    guard = guard or type('AllowGuard', (), {'evaluate': lambda self, **kw: {
        'state': 'ALLOW', 'source': 'TEST_GUARD', 'hardLock': False}})()
    store = PositionCommitStore(tmp_path / 'private' / 'route-commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, client.app.state.position_preview_registry,
                                    store, guard, now=lambda: NOW)
    install_position_commit_routes(client.app, fake, enabled=True, guard_provider=guard,
                                   audit_store=store, commit_service=service)
    return store, sent


@pytest.mark.parametrize(('identity', 'peer', 'confirmed'), [
    (('local', 'testclient', 'read'), 'testclient', True),
    (('local', 'testclient', 'trade'), '', True),
    (('local', 'testclient', 'trade'), 'testclient', False),
])
def test_commit_requires_trade_identity_peer_and_explicit_confirmation(api, tmp_path, identity, peer, confirmed):
    from types import SimpleNamespace
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    store = PositionCommitStore(tmp_path / 'private' / 'identity-commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, client.app.state.position_preview_registry, store, None, now=lambda: NOW)
    payload = SimpleNamespace(account='titan', symbol='XAUUSD',
        positionTicket=preview['positionTicket'], expectedRevision=preview['positionRevision'],
        previewId=preview['previewId'], userConfirmed=confirmed,
        idempotencyKey='abababab-abab-4bab-8bab-abababababab')
    fake.calls.clear()
    with pytest.raises(HTTPException) as rejected:
        service.commit(payload, identity, peer)
    assert rejected.value.status_code == 403
    assert rejected.value.detail['code'] == 'IDENTITY_REQUIRED'
    assert fake.calls == []
    assert fake.writes == 0


@pytest.mark.parametrize(('account', 'symbol'), [
    ('titan_m5', 'XAUUSD'),
    ('titan', 'EURUSD.a'),
    ('blueberry', 'XAUUSD.pi'),
])
def test_commit_rejects_account_symbol_mismatch_before_gateway(api, tmp_path, account, symbol):
    from types import SimpleNamespace
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    client, fake, _ = api
    store = PositionCommitStore(tmp_path / 'private' / 'scope-commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, None, store, None, now=lambda: NOW)
    payload = SimpleNamespace(account=account, symbol=symbol, positionTicket='1',
        expectedRevision='a' * 64, previewId='p' * 40, userConfirmed=True,
        idempotencyKey='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd')
    fake.calls.clear()
    with pytest.raises(HTTPException) as rejected:
        service.commit(payload, ('local', 'testclient', 'trade'), 'testclient')
    assert rejected.value.status_code == 403
    assert rejected.value.detail['code'] == 'DEMO_ACCOUNT_REQUIRED'
    assert fake.calls == []
    assert fake.writes == 0


def test_enabled_commit_route_runs_only_injected_demo_service_and_idempotently_replays(api, tmp_path):
    client, fake, preview_request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **preview_request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    store, sent = _prepare_commit_service(client, fake, tmp_path)
    session = client.get('/api/control_session')
    assert session.status_code == 200
    payload = {'schemaVersion': 1, 'account': 'titan', 'symbol': 'XAUUSD',
               'positionTicket': preview['positionTicket'], 'expectedRevision': preview['positionRevision'],
               'previewId': preview['previewId'], 'userConfirmed': True,
               'idempotencyKey': '22222222-2222-4222-8222-222222222222'}
    headers = {'X-Dashboard-CSRF': session.json()['csrf_token']}
    first = client.post('/api/chart/v1/position/commit-stop', json=payload, headers=headers)
    second = client.post('/api/chart/v1/position/commit-stop', json=payload, headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()['status'] == second.json()['status'] == 'SAVED'
    assert first.json()['slPrice'] == '3999'
    assert first.json()['tpPrice'] is None
    assert len(sent) == 1
    assert store.reserve('local:testclient', payload['idempotencyKey'], {
        'account': 'titan', 'symbol': 'XAUUSD', 'ticket': preview['positionTicket'],
        'revision': preview['positionRevision'], 'previewId': preview['previewId'],
    }).state == 'SAVED'


@pytest.mark.parametrize('guard_result', [
    {'state': 'ALLOW', 'source': 'TEST_GUARD', 'hardLock': True},
    {'state': 'UNKNOWN', 'source': 'TEST_GUARD', 'hardLock': False},
])
def test_commit_service_fails_closed_on_hard_lock_and_never_reads_blueberry(api, tmp_path, guard_result):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    client, fake, preview_request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **preview_request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    decisions = []
    class LockedGuard:
        def evaluate(self, **kwargs):
            decisions.append(kwargs)
            return guard_result
    store = PositionCommitStore(tmp_path / 'private' / 'guard-commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, client.app.state.position_preview_registry,
                                    store, LockedGuard(), now=lambda: NOW)
    payload = SimpleNamespace(account='titan', symbol='XAUUSD',
        positionTicket=preview['positionTicket'], expectedRevision=preview['positionRevision'],
        previewId=preview['previewId'], userConfirmed=True,
        idempotencyKey='33333333-3333-4333-8333-333333333333')
    with pytest.raises(HTTPException) as blocked:
        service.commit(payload, ('local', 'testclient', 'trade'), 'testclient')
    assert blocked.value.status_code == 403
    assert decisions[0]['action'] == 'RISK_REDUCING_PROTECTION'
    assert decisions[0]['riskIncreasing'] is False
    assert fake.writes == 0
    blueberry = SimpleNamespace(account='blueberry', symbol='XAUUSD.pi',
        positionTicket='1', expectedRevision='a'*64, previewId='p'*40,
        userConfirmed=True, idempotencyKey='44444444-4444-4444-8444-444444444444')
    with pytest.raises(HTTPException) as forbidden:
        service.commit(blueberry, ('local', 'testclient', 'trade'), 'testclient')
    assert forbidden.value.status_code == 403
    assert forbidden.value.detail['code'] == 'DEMO_ACCOUNT_REQUIRED'
    assert fake.writes == 0


def _post_enabled_commit(client, preview, *, key='55555555-5555-4555-8555-555555555555'):
    session = client.get('/api/control_session')
    assert session.status_code == 200
    payload = {'schemaVersion': 1, 'account': preview['account'], 'symbol': preview['symbol'],
               'positionTicket': preview['positionTicket'], 'expectedRevision': preview['positionRevision'],
               'previewId': preview['previewId'], 'userConfirmed': True, 'idempotencyKey': key}
    response = client.post('/api/chart/v1/position/commit-stop', json=payload,
                           headers={'X-Dashboard-CSRF': session.json()['csrf_token']})
    return response, payload


def test_commit_order_check_rejection_never_sends(api, tmp_path):
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    store, sent = _prepare_commit_service(client, fake, tmp_path, order_check_retcode=10016)
    response, payload = _post_enabled_commit(client, preview)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'ORDER_CHECK_REJECTED'
    assert store.reserve('local:testclient', payload['idempotencyKey'], {
        'account': 'titan', 'symbol': 'XAUUSD', 'ticket': preview['positionTicket'],
        'revision': preview['positionRevision'], 'previewId': preview['previewId'],
    }).result['brokerRetcode'] == 10016
    assert sent == []


@pytest.mark.parametrize('broker_response,apply_readback,expected', [
    ('none', True, 'UNKNOWN'),
    ('done', False, 'UNKNOWN'),
    ('reject', True, 'BROKER_REJECTED'),
])
def test_ambiguous_or_rejected_broker_outcomes_are_never_retried(api, tmp_path, broker_response, apply_readback, expected):
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    _, sent = _prepare_commit_service(client, fake, tmp_path, apply_readback=apply_readback,
                                      broker_response=broker_response)
    response, payload = _post_enabled_commit(client, preview)
    again = client.post('/api/chart/v1/position/commit-stop', json=payload,
                        headers={'X-Dashboard-CSRF': client.get('/api/control_session').json()['csrf_token']})
    assert response.status_code == again.status_code == 200
    assert response.json()['status'] == again.json()['status'] == expected
    assert len(sent) == 1


def test_tp_only_commit_preserves_live_stop_and_clear_stop_is_explicit(api, tmp_path):
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'tpPrice': '4002.00'},
    }).json()
    _, sent = _prepare_commit_service(client, fake, tmp_path)
    response, _ = _post_enabled_commit(client, preview, key='66666666-6666-4666-8666-666666666666')
    assert response.status_code == 200 and response.json()['status'] == 'SAVED'
    assert sent[0]['sl'] == 3990.
    assert sent[0]['tp'] == 4002.

    # A separate proposal explicitly clears SL; omission would preserve it.
    clear_preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'expectedRevision': response.json()['positionRevision'],
        'candidate': {'slPrice': None}, 'clientRequestId': '77777777-7777-4777-8777-777777777777',
    }).json()
    _, clear_sent = _prepare_commit_service(client, fake, tmp_path / 'clear')
    cleared, _ = _post_enabled_commit(client, clear_preview, key='88888888-8888-4888-8888-888888888888')
    assert cleared.status_code == 200 and cleared.json()['status'] == 'SAVED'
    assert clear_sent[0]['sl'] == 0.
    assert clear_sent[0]['tp'] == 4002.

def test_commit_rejects_trailing_revision_race_without_sending(api, tmp_path):
    from types import SimpleNamespace
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    # Simulate the EA trailing the stop after the preview was created.
    fake.positions[0].sl = 3991.0
    fake.positions[0].time_update += 1
    fake.positions[0].time_update_msc += 1000
    _, sent = _prepare_commit_service(client, fake, tmp_path)
    result, _ = _post_enabled_commit(client, preview, key='99999999-9999-4999-8999-999999999999')
    assert result.status_code == 409
    assert result.json()['detail']['code'] == 'POSITION_CHANGED'
    assert sent == []


def test_guard_receives_risk_increase_classification_for_loosened_stop(api, tmp_path):
    from fastapi import HTTPException
    from types import SimpleNamespace
    from chart_studio.position_commit import PositionCommitService
    from chart_studio.position_commit_store import PositionCommitStore
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3988.00'},
    }).json()
    observed = []
    class RiskGuard:
        def evaluate(self, **kwargs):
            observed.append(kwargs)
            return {'state': 'BLOCK', 'source': 'TEST_POLICY', 'hardLock': False}
    store = PositionCommitStore(tmp_path / 'private' / 'risk-commit.sqlite3', checkout_root=tmp_path / 'checkout')
    service = PositionCommitService(fake, client.app.state.position_preview_registry,
                                    store, RiskGuard(), now=lambda: NOW)
    payload = SimpleNamespace(account='titan', symbol='XAUUSD',
        positionTicket=preview['positionTicket'], expectedRevision=preview['positionRevision'],
        previewId=preview['previewId'], userConfirmed=True,
        idempotencyKey='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    with pytest.raises(HTTPException) as blocked:
        service.commit(payload, ('local', 'testclient', 'trade'), 'testclient')
    assert blocked.value.status_code == 403
    assert observed[0]['action'] == 'RISK_INCREASING_PROTECTION'
    assert observed[0]['riskIncreasing'] is True
    assert fake.writes == 0


@pytest.mark.parametrize(('side', 'old_tp', 'new_tp', 'expected'), [
    ('BUY', '4020.00', '4030.00', True),
    ('BUY', '4020.00', '4010.00', False),
    ('SELL', '3980.00', '3970.00', True),
    ('SELL', '3980.00', '3990.00', False),
    ('BUY', '4020.00', None, True),
    ('BUY', None, '4030.00', False),
])
def test_guard_classifies_take_profit_risk_direction(side, old_tp, new_tp, expected):
    from chart_studio.position_commit import PositionCommitService
    observed = []
    guard = type('Guard', (), {'evaluate': lambda self, **kw: observed.append(kw) or {
        'state': 'ALLOW', 'source': 'TEST', 'hardLock': False,
    }})()
    service = PositionCommitService(None, None, None, guard)
    position = {'side': side, 'sl': '3990.00', 'tp': old_tp}
    service._guard(object(), position, {'tpPrice': new_tp})
    assert observed[0]['riskIncreasing'] is expected
    assert observed[0]['action'] == ('RISK_INCREASING_PROTECTION' if expected else 'RISK_REDUCING_PROTECTION')


@pytest.mark.parametrize(('side', 'old_sl', 'new_sl', 'expected'), [
    ('BUY', '3990.00', '3988.00', True),
    ('BUY', '3990.00', '3992.00', False),
    ('SELL', '4010.00', '4012.00', True),
    ('SELL', '4010.00', '4008.00', False),
    ('BUY', None, '3990.00', False),
    ('SELL', '4010.00', None, True),
])
def test_guard_classifies_stop_loss_risk_direction(side, old_sl, new_sl, expected):
    from chart_studio.position_commit import PositionCommitService
    observed = []
    guard = type('Guard', (), {'evaluate': lambda self, **kw: observed.append(kw) or {
        'state': 'ALLOW', 'source': 'TEST', 'hardLock': False,
    }})()
    service = PositionCommitService(None, None, None, guard)
    position = {'side': side, 'sl': old_sl, 'tp': '4020.00'}
    service._guard(object(), position, {'slPrice': new_sl})
    assert observed[0]['riskIncreasing'] is expected
    assert observed[0]['action'] == ('RISK_INCREASING_PROTECTION' if expected else 'RISK_REDUCING_PROTECTION')


@pytest.mark.parametrize('decision', [
    None,
    {},
    {'state': 'ALLOW', 'source': 'NONE', 'hardLock': False},
    {'state': 'ALLOW', 'source': '', 'hardLock': False},
    {'state': 'ALLOW', 'source': 'TEST', 'hardLock': None},
    {'state': 'UNKNOWN', 'source': 'TEST', 'hardLock': False},
])
def test_guard_unknown_or_incomplete_result_fails_closed(decision):
    from chart_studio.position_commit import PositionCommitService
    from fastapi import HTTPException
    guard = type('Guard', (), {'evaluate': lambda self, **kw: decision})()
    service = PositionCommitService(None, None, None, guard)
    with pytest.raises(HTTPException) as blocked:
        service._guard(object(), {'side': 'BUY', 'sl': '3990', 'tp': '4020'}, {'slPrice': '3992'})
    assert blocked.value.status_code == 403
    assert blocked.value.detail['code'] == 'GUARD_BLOCKED'


@pytest.mark.parametrize(('mutation', 'expected_status', 'expected_code'), [
    ('stale_quote', 503, 'QUOTE_NOT_FRESH'),
    ('symbol_rules', 409, 'SYMBOL_CHANGED'),
])
def test_commit_rechecks_quote_and_symbol_rules_after_order_check(api, tmp_path, mutation, expected_status, expected_code):
    from types import SimpleNamespace
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    _, sent = _prepare_commit_service(client, fake, tmp_path)
    def order_check(_):
        if mutation == 'stale_quote':
            fake.tick.time_msc = int((NOW + 10800 - 10) * 1000)
            fake.tick.time = fake.tick.time_msc // 1000
        else:
            fake.symbols[0].trade_tick_size *= 2
        return SimpleNamespace(retcode=0)
    fake.order_check = order_check
    response, _ = _post_enabled_commit(client, preview)
    assert response.status_code == expected_status
    assert response.json()['detail']['code'] == expected_code
    assert sent == []
    assert fake.writes == 0


def test_commit_rejects_fresh_quote_that_moves_stop_into_broker_boundary(api, tmp_path):
    from types import SimpleNamespace
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3999.00'},
    }).json()
    assert preview['valid'] is True
    _, sent = _prepare_commit_service(client, fake, tmp_path)
    def order_check(_):
        # Keep the quote fresh, but move the BUY stop inside both stop and freeze levels.
        fake.tick.bid = 3999.03
        fake.tick.ask = 3999.08
        return SimpleNamespace(retcode=0)
    fake.order_check = order_check
    response, _ = _post_enabled_commit(client, preview)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'GEOMETRY_INVALID'
    assert sent == []
    assert fake.writes == 0


def test_commit_rejects_noop_preview_without_order_send(api, tmp_path):
    client, fake, request = api
    preview = client.post('/api/chart/v1/position/preview-stop', json={
        **request, 'candidate': {'slPrice': '3990.00'},
    }).json()
    _, sent = _prepare_commit_service(client, fake, tmp_path)
    response, _ = _post_enabled_commit(client, preview)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'NO_CHANGE'
    assert sent == []
