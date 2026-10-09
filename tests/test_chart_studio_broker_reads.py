"""Read contracts run against fake MT5 under the real account gateway lock."""
import ast
import hashlib
import importlib
import json
import ntpath
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import account_gateway as gateway

ROOT = Path(__file__).resolve().parents[1]
NOW = 1791547200
RAW = NOW + 10800


def position(**changes):
    fields = dict(ticket=9007199254740993, identifier=9007199254740994,
                  symbol='XAUUSD', type=0, magic=0, volume=.1, price_open=4000.,
                  sl=3990., tp=0., price_current=4001., profit=10., swap=-1.,
                  time=RAW-60, time_msc=(RAW-60)*1000,
                  time_update=RAW-10, time_update_msc=(RAW-10)*1000,
                  comment='Titan EA is not proof of ownership')
    fields.update(changes)
    return NS(**fields)


def order(**changes):
    fields = dict(ticket=9007199254740995, position_id=0, symbol='XAUUSD',
                  type=2, magic=42, volume_current=.2, volume_initial=.3,
                  price_open=3995., price_stoplimit=0., sl=0., tp=4010.,
                  price_current=4001., time_setup=RAW-30,
                  time_setup_msc=(RAW-30)*1000, time_expiration=0,
                  type_time=0, type_filling=2, state=1, comment='Titan EA')
    fields.update(changes)
    return NS(**fields)


def symbol(name='XAUUSD', **changes):
    fields = dict(name=name, digits=2, point=.01, trade_tick_size=.01,
                  trade_stops_level=10, trade_freeze_level=5, volume_min=.01,
                  volume_max=10., volume_step=.01, currency_base='XAU',
                  currency_profit='USD', currency_margin='USD', trade_mode=4)
    fields.update(changes)
    return NS(**fields)


class MT5Fake:
    def __init__(self):
        self.current = None
        self.calls = []
        self.writes = 0
        self.positions = (position(), position(ticket=12, identifier=13, type=1, magic=42))
        self.orders = (order(),)
        self.tick = NS(time=RAW, time_msc=RAW*1000+123, bid=4000., ask=4000.05)
        self.symbols = (symbol(), symbol('EURUSD.a', digits=5, point=.00001, trade_tick_size=.00001, trade_mode=1))
        self.wrong = None

    def initialize(self, path, **kwargs):
        self.calls.append(('initialize', path))
        self.current = next(a for a in gateway.ACCOUNTS.values() if a['terminal'] == path)
        return True

    def shutdown(self):
        self.current = None

    def account_info(self):
        return NS(login=1 if self.wrong == 'login' else self.current['login'],
                  server='wrong' if self.wrong == 'server' else self.current['server'],
                  currency='EUR', margin_mode=2)

    def terminal_info(self):
        path = ntpath.dirname(self.current['terminal'])
        return NS(path='wrong' if self.wrong == 'path' else path,
                  data_path='wrong' if self.wrong == 'data' else path,
                  connected=self.wrong != 'connected')

    def symbols_get(self):
        self.calls.append(('symbols_get',))
        return self.symbols

    def symbol_info(self, name):
        self.calls.append(('symbol_info', name))
        return next((s for s in self.symbols if s.name == name), None)

    def symbol_info_tick(self, name):
        self.calls.append(('tick', name))
        return self.tick

    def positions_get(self, **kwargs):
        self.calls.append(('positions', self.current['id'], kwargs))
        assert gateway._lock._is_owned()
        time.sleep(.001)
        return self.positions

    def orders_get(self, **kwargs):
        self.calls.append(('orders', self.current['id'], kwargs))
        assert gateway._lock._is_owned()
        return self.orders

    def order_send(self, *args, **kwargs):
        self.writes += 1
        raise AssertionError('broker write forbidden')

    def symbol_select(self, *args, **kwargs):
        raise AssertionError('symbol selection side effect forbidden')


@pytest.fixture
def fake(monkeypatch):
    gateway._attached_mt5 = gateway._attached_account = None
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: True)
    for account in gateway.ACCOUNTS.values():
        monkeypatch.setitem(account, 'broker_utc_offset_seconds', 10800)
    adapter = MT5Fake()
    yield adapter
    assert adapter.writes == 0
    gateway._attached_mt5 = gateway._attached_account = None


@pytest.fixture
def client(fake):
    app = FastAPI()
    if (ROOT/'chart_studio/read_api.py').exists():
        api = importlib.import_module('chart_studio.read_api')
        api.install_read_routes(app, fake, now=lambda: NOW+.123)
    return TestClient(app)


def read(client, endpoint='positions', **params):
    return client.get('/api/chart/v1/'+endpoint, params={'account':'titan', 'symbol':'XAUUSD', **params})


@pytest.mark.parametrize('endpoint', ['symbols', 'symbol-info', 'positions'])
def test_account_required_and_unknown_never_attach(client, fake, endpoint):
    assert client.get('/api/chart/v1/'+endpoint).status_code == 422
    assert client.get('/api/chart/v1/'+endpoint, params={'account':'unknown', 'symbol':'XAUUSD'}).status_code == 400
    assert fake.calls == []


@pytest.mark.parametrize('wrong,status', [('login',409), ('server',409), ('path',503), ('connected',503), ('data',409)])
def test_gateway_identity_failures_preserve_http_status(client, fake, wrong, status):
    fake.wrong = wrong
    response = read(client, account='goldm15')
    assert response.status_code == status
    assert not any(c[0] == 'positions' for c in fake.calls)


def test_stopped_terminal_never_initializes(client, fake, monkeypatch):
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: False)
    assert read(client).status_code == 503
    assert fake.calls == []


def test_parallel_accounts_are_locked_and_never_cross(client, fake):
    original = fake.positions_get
    def positions_get(**kwargs):
        original(**kwargs)
        return (position(ticket=fake.current['login']),)
    fake.positions_get = positions_get
    accounts = ['titan', 'goldm15'] * 6
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda a: read(client, account=a).json(), accounts))
    assert [r['positions'][0]['ticket'] for r in results] == [str(gateway.ACCOUNTS[a]['login']) for a in accounts]


@pytest.mark.parametrize('endpoint,params', [
    ('symbols', {'limit':0}), ('symbols', {'limit':201}), ('symbols', {'limit':'bad'}),
    ('symbols', {'q':'x'*65}), ('symbols', {'q':'*'}),
    ('symbol-info', {'symbol':''}), ('symbol-info', {'symbol':'*'}),
    ('symbol-info', {'symbol':'EURUSD,USDCHF'}), ('positions', {'symbol':'x'*65}),
    ('positions', {'symbol':'XAUUSD '}),
    ('positions', {'ticket':'-1'}), ('positions', {'ticket':'1.2'}),
    ('positions', {'magic':'-1'}), ('positions', {'manual':'banana'})])
def test_query_validation_before_mt5(client, fake, endpoint, params):
    assert read(client, endpoint, **params).status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize('endpoint', ['positions', 'symbol-info'])
def test_symbol_required_and_no_unknown_fallback(client, fake, endpoint):
    assert client.get('/api/chart/v1/'+endpoint, params={'account':'titan'}).status_code == 422
    assert read(client, endpoint, symbol='MISSING').status_code == 404
    assert ('symbol_info', 'XAUUSD') not in fake.calls


def test_search_uses_existing_symbols_real_trade_mode_and_limit(client, fake):
    result = read(client, 'symbols', q='usd', limit=1).json()
    assert len(result['symbols']) == 1
    assert result['symbols'][0]['tradeMode'] == 4
    assert result['source'] == 'MT5_VERIFIED'
    assert result['canExecute'] is False
    assert read(client, 'symbols', q='EUR').json()['symbols'][0]['symbol'] == 'EURUSD.a'


def test_real_symbol_contract(client):
    body = read(client, 'symbol-info').json()
    assert body['digits'] == 2
    assert body['tickSize'] == '0.01'
    assert body['point'] == '0.01'
    assert body['stopsLevel'] == 10 and body['freezeLevel'] == 5
    assert [body[k] for k in ('volumeMin','volumeMax','volumeStep')] == ['0.01','10','0.01']
    assert body['currencyBase'] == 'XAU' and body['currencyProfit'] == 'USD'
    assert body['currencyMargin'] == 'USD' and body['tradeMode'] == 4
    assert body['canExecute'] is False


def test_symbol_search_accepts_sparse_actual_instruments(client, fake):
    fake.symbols = (NS(name='DE 40.cash', trade_mode=0),)
    response = read(client, 'symbols', q='DE 40')
    assert response.status_code == 200
    assert response.json()['symbols'][0]['tradeMode'] == 0


def test_empty_broker_currency_metadata_is_preserved(client, fake):
    fake.symbols[0].currency_base = ''
    fake.symbols[0].currency_margin = ''
    response = read(client, 'symbol-info')
    assert response.status_code == 200
    assert response.json()['currencyBase'] == response.json()['currencyMargin'] == ''


def test_revision_matches_canonical_real_field_schemas(client):
    body = read(client).json()
    common = dict(account='titan', login=str(gateway.ACCOUNTS['titan']['login']),
                  server=gateway.ACCOUNTS['titan']['server'], symbol='XAUUSD')
    canonical_position = dict(common, ticket='9007199254740993', identifier='9007199254740994',
                              type='0', volume='0.1', price_open='4000', sl='3990', tp='0',
                              time_update_msc=str((RAW-10)*1000))
    canonical_order = dict(common, ticket='9007199254740995', position_id='0', type='2',
                           volume_current='0.2', volume_initial='0.3', price_open='3995',
                           price_stoplimit='0', sl='0', tp='4010', time_setup_msc=str((RAW-30)*1000),
                           time_expiration='0', type_time='0', type_filling='2', state='1')
    for kind, canonical in [('positions',canonical_position),('orders',canonical_order)]:
        digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
        assert body[kind][0]['revision'] == digest


def test_positions_orders_decimal_ids_nullable_stops_and_provenance(client, fake):
    response = read(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['currency'] == 'EUR' and body['marginMode'] == 2
    assert body['canExecute'] is False
    buy, sell = body['positions']
    assert buy['ticket'] == '9007199254740993' and buy['identifier'] == '9007199254740994'
    assert buy['side'] == 'BUY' and sell['side'] == 'SELL'
    assert buy['volume'] == '0.1' and buy['priceOpen'] == '4000'
    assert buy['sl'] == '3990' and buy['tp'] is None
    assert buy['magic'] == '0' and buy['ownership'] == 'MANUAL'
    assert sell['ownership'] == 'UNKNOWN'
    assert buy['comment'] == 'Titan EA is not proof of ownership'
    assert buy['source'] == 'MT5_VERIFIED' and buy['canExecute'] is False
    assert buy['createdTime']['utcEpochMs'] == (NOW-60)*1000
    assert buy['updatedTime']['rawBrokerEpochMs'] == (RAW-10)*1000
    pending = body['orders'][0]
    assert pending['type'] == 'BUY_LIMIT' and pending['side'] == 'BUY'
    assert pending['positionId'] == '0' and pending['ownership'] == 'UNKNOWN'
    assert pending['volumeCurrent'] == '0.2' and pending['volumeInitial'] == '0.3'
    assert pending['sl'] is None and pending['expirationTime'] is None
    assert 'identifier' not in pending and 'updatedTime' not in pending
    assert len(buy['revision']) == len(pending['revision']) == 64
    assert ('positions', 'titan', {'symbol':'XAUUSD'}) in fake.calls
    assert ('orders', 'titan', {'symbol':'XAUUSD'}) in fake.calls
    quote = body['quote']
    assert quote['quoteTimeUtc'] == NOW and quote['rawBrokerEpoch'] == RAW
    assert quote['quoteTimeUtcMs'] == NOW*1000+123
    assert quote['brokerUtcOffsetSeconds'] == 10800
    assert quote['offsetSource'] == 'ACCOUNT_CONFIG'


@pytest.mark.parametrize('kind,label', [(2,'BUY_LIMIT'),(3,'SELL_LIMIT'),(4,'BUY_STOP'),(5,'SELL_STOP'),(6,'BUY_STOP_LIMIT'),(7,'SELL_STOP_LIMIT')])
def test_pending_types_distinct(client, fake, kind, label):
    fake.orders = (order(type=kind, price_stoplimit=3994. if kind in (6,7) else 0.),)
    assert read(client).json()['orders'][0]['type'] == label


def test_filters_run_after_validating_symbol_broker_fetch(client, fake):
    body = read(client, ticket='12', magic='42', manual=False).json()
    assert [p['ticket'] for p in body['positions']] == ['12']
    assert body['orders'] == []
    assert read(client, manual=True).json()['positions'][0]['magic'] == '0'
    assert all(c[2] == {'symbol':'XAUUSD'} for c in fake.calls if c[0] in ('positions','orders'))


@pytest.mark.parametrize('missing', ['positions','orders','symbols','tick'])
def test_none_is_unavailable_not_empty(client, fake, missing):
    setattr(fake, missing, None)
    assert read(client, 'symbols' if missing == 'symbols' else 'positions').status_code == 503


def test_empty_broker_book_is_honest(client, fake):
    fake.positions = fake.orders = ()
    body = read(client).json()
    assert body['positions'] == body['orders'] == []


@pytest.mark.parametrize('field,value', [('volume',float('nan')),('price_open',float('inf')),('sl',-1),('type',2),('ticket',0),('magic',-1),('symbol','EURUSD')])
def test_invalid_position_fails_closed_even_when_filtered(client, fake, field, value):
    fake.positions = (position(**{field:value}),)
    assert read(client, ticket='123').status_code == 503


@pytest.mark.parametrize('field', ['identifier','volume','price_open','time_msc','time_update_msc','comment'])
def test_missing_position_field_never_fabricated(client, fake, field):
    delattr(fake.positions[0], field)
    assert read(client).status_code == 503


@pytest.mark.parametrize('field', ['position_id','volume_initial','price_stoplimit','time_setup_msc','time_expiration','type_time','type_filling','state'])
def test_pending_real_fields_required(client, fake, field):
    delattr(fake.orders[0], field)
    assert read(client).status_code == 503


@pytest.mark.parametrize('field,value', [('type',0),('volume_current',float('nan')),('price_stoplimit',-1),('time_expiration',-1),('state',99)])
def test_invalid_pending_order_fails_closed(client, fake, field, value):
    fake.orders = (order(**{field:value}),)
    assert read(client).status_code == 503


@pytest.mark.parametrize('field,value', [('bid',float('nan')),('ask',float('inf')),('bid',4002.),('time',0),('time_msc',float('nan'))])
def test_malformed_quote_fails_closed(client, fake, field, value):
    setattr(fake.tick, field, value)
    assert read(client).status_code == 503


def test_missing_clock_policy_refused(client, fake, monkeypatch):
    monkeypatch.delitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds')
    assert read(client).status_code == 503


def test_stale_quote_retains_broker_models_with_explicit_freshness(client, fake):
    fake.tick.time -= 3600
    fake.tick.time_msc -= 3600000
    body = read(client).json()
    assert len(body['positions']) == 2
    assert body['quote']['freshness'] == 'STALE'
    assert body['quote']['ageSeconds'] == 3600.
    assert body['quote']['canExecute'] is False


@pytest.mark.parametrize('kind,field,value', [
    *[('positions',k,v) for k,v in dict(ticket=15,identifier=16,type=1,volume=.2,price_open=4002.,sl=3991.,tp=4010.,time_update_msc=(RAW-9)*1000).items()],
    *[('orders',k,v) for k,v in dict(ticket=17,position_id=18,type=3,volume_current=.1,volume_initial=.4,price_open=3996.,price_stoplimit=3994.,sl=3990.,tp=4020.,time_setup_msc=(RAW-29)*1000,time_expiration=RAW+60,type_time=1,type_filling=1,state=2).items()]])
def test_semantic_mutation_changes_revision(client, fake, kind, field, value):
    before = read(client).json()[kind][0]['revision']
    setattr(getattr(fake, kind)[0], field, value)
    if field == 'time_update_msc':
        fake.positions[0].time_update = value//1000
    if field == 'time_setup_msc':
        fake.orders[0].time_setup = value//1000
    assert read(client).json()[kind][0]['revision'] != before


def test_quote_price_profit_changes_do_not_change_revisions(client, fake):
    before = read(client).json()
    fake.tick.bid += .01
    for row in (*fake.positions,*fake.orders):
        row.price_current += 1
    fake.positions[0].profit += 1
    after = read(client).json()
    for kind in ('positions','orders'):
        assert [p['revision'] for p in before[kind]] == [p['revision'] for p in after[kind]]
    assert read(client, account='goldm15').json()['positions'][0]['revision'] != before['positions'][0]['revision']


def test_current_price_and_signed_pnl_in_actual_currency(client, fake):
    fake.positions = (position(profit=-10.25, swap=-1.5, sl=-0.0),)
    body = read(client).json()
    row = body['positions'][0]
    assert row['priceCurrent'] == '4001'
    assert row['profit'] == '-10.25' and row['swap'] == '-1.5'
    assert row['currency'] == 'EUR'
    assert body['orders'][0]['priceCurrent'] == '4001'
    from chart_studio.broker_reads import decimal
    assert decimal(-0.0) == '0'


@pytest.mark.parametrize('kind,field', [('positions','price_current'),('positions','profit'),('positions','swap'),('orders','price_current')])
def test_nonfinite_live_values_fail_closed(client, fake, kind, field):
    setattr(getattr(fake, kind)[0], field, float('nan'))
    assert read(client).status_code == 503


@pytest.mark.parametrize('field,value', [('digits',-1),('point',0),('trade_tick_size',float('nan')),('trade_mode',99),('volume_min',11),('currency_profit',None)])
def test_malformed_symbol_info_fails_closed(client, fake, field, value):
    setattr(fake.symbols[0], field, value)
    assert read(client, 'symbol-info').status_code == 503


def test_order_expiration_clock_and_future_quote(client, fake):
    fake.orders[0].time_expiration = RAW+60
    body = read(client).json()
    assert body['orders'][0]['expirationTime']['utcEpochMs'] == (NOW+60)*1000
    fake.tick.time += 60
    fake.tick.time_msc += 60000
    quote = read(client).json()['quote']
    assert quote['freshness'] == 'FUTURE' and quote['stale'] is True
    assert quote['canExecute'] is False


def test_exception_response_is_safe_and_does_not_leak_broker_details(client, fake):
    def explode(**kwargs):
        raise RuntimeError('password=secret balance=100000')
    fake.positions_get = explode
    response = read(client)
    assert response.status_code == 503
    assert 'secret' not in response.text and '100000' not in response.text


def test_missing_quote_clock_refused(client, fake):
    del fake.tick.time
    assert read(client).status_code == 503


@pytest.mark.parametrize('kind,seconds,milliseconds', [
    ('positions','time','time_msc'),
    ('positions','time_update','time_update_msc'),
    ('orders','time_setup','time_setup_msc'),
])
@pytest.mark.parametrize('corruption', ['day_ahead','zero_seconds','zero_milliseconds','missing_seconds'])
def test_paired_broker_clocks_must_agree(client, fake, kind, seconds, milliseconds, corruption):
    row = getattr(fake, kind)[0]
    if corruption == 'day_ahead':
        setattr(row, milliseconds, getattr(row, milliseconds)+86400000)
    elif corruption == 'zero_seconds':
        setattr(row, seconds, 0)
    elif corruption == 'zero_milliseconds':
        setattr(row, milliseconds, 0)
    else:
        delattr(row, seconds)
    assert read(client).status_code == 503


def test_paired_broker_clocks_preserve_real_millisecond_precision(client, fake):
    fake.positions[0].time_msc += 123
    fake.positions[0].time_update_msc += 456
    fake.orders[0].time_setup_msc += 789
    body = read(client).json()
    assert body['positions'][0]['createdTime']['utcEpochMs'] == (NOW-60)*1000+123
    assert body['positions'][0]['updatedTime']['utcEpochMs'] == (NOW-10)*1000+456
    assert body['orders'][0]['createdTime']['utcEpochMs'] == (NOW-30)*1000+789


def legacy_function(fake):
    tree = ast.parse((ROOT/'app.py').read_text(encoding='utf-8'))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'api_chart_quotes')
    node.decorator_list = []
    namespace = dict(mt5=fake, SYMBOL='XAUUSD', HTTPException=HTTPException,
                     selected=gateway.selected, verify_identity=gateway.verify_identity,
                     time=NS(time=lambda: NOW+.123))
    if (ROOT/'chart_studio/broker_reads.py').exists():
        namespace['legacy_quote'] = importlib.import_module('chart_studio.broker_reads').legacy_quote
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<legacy quote>', 'exec'), namespace)
    return namespace['api_chart_quotes']


def test_legacy_quote_normalizes_broker_clock_and_keeps_numeric_ui(fake):
    with gateway.session(fake, 'titan'):
        body = legacy_function(fake)('titan')
    assert body['quoteTimeUtc'] == NOW
    assert body['rawBrokerEpoch'] == RAW
    assert body['brokerUtcOffsetSeconds'] == 10800
    assert body['freshness'] == 'FRESH' and body['ageSeconds'] == 0
    assert all(isinstance(body[k], float) for k in ('bid','ask','tickSize'))


@pytest.mark.parametrize('field,value', [('bid',float('nan')),('ask',float('inf')),('bid',5000.),('time',0)])
def test_legacy_quote_invalid_data_refused(fake, field, value):
    setattr(fake.tick, field, value)
    with gateway.session(fake, 'titan'), pytest.raises(HTTPException) as error:
        legacy_function(fake)('titan')
    assert error.value.status_code == 503


@pytest.mark.parametrize('metadata', [symbol('EURUSD', trade_tick_size=.00001), NS(trade_tick_size=.01)])
def test_legacy_quote_requires_exact_returned_symbol_name(fake, metadata):
    fake.symbol_info = lambda _: metadata
    with gateway.session(fake, 'titan'), pytest.raises(HTTPException) as error:
        legacy_function(fake)('titan')
    assert error.value.status_code == 503


def test_read_routes_registered_once_and_do_not_accept_writes(client):
    assert client.post('/api/chart/v1/positions', json={'account':'titan','symbol':'XAUUSD'}).status_code == 405
    source = (ROOT/'app.py').read_text(encoding='utf-8')
    assert 'install_read_routes(app, mt5)' in source
    assert source.count('@app.get("/api/chart/v1/quotes")') == 1
    assert '"brokerSymbolSearch": True' in source
