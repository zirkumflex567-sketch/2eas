"""Read contracts run against fake MT5 under the real account gateway lock."""
import ast
import hashlib
import importlib
import json
import ntpath
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import account_gateway as gateway
from chart_studio.broker_reads import broker_symbol

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


def correlated_rates(scale=1):
    return [NS(time=1000+i*3600, close=(100+i*i)*scale) for i in range(64)]


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
        self.rates = {}
        self.footprint_ticks = None
        self.COPY_TICKS_ALL = 7
        self.COPY_TICKS_INFO = 1
        self.TICK_FLAG_BUY = 32
        self.TICK_FLAG_SELL = 64

    def initialize(self, path, **kwargs):
        self.calls.append(('initialize', path))
        self.current = next(a for a in gateway.ACCOUNTS.values() if a['terminal'] == path)
        return True

    def shutdown(self):
        self.current = None

    def account_info(self):
        return NS(login=1 if self.wrong == 'login' else self.current['login'],
                  server='wrong' if self.wrong == 'server' else self.current['server'],
                  currency='EUR', currency_digits=2, margin_mode=2, balance=1000., equity=1050.,
                  margin=50., margin_free=1000.)

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

    def order_calc_profit(self, action, name, volume, price_open, price_close):
        assert gateway._lock._is_owned()
        self.calls.append(('calc_profit', name, action))
        direction = 1 if action == 0 else -1
        return (price_close-price_open)*volume*100*direction

    def copy_rates_from_pos(self, name, timeframe, start_pos, count):
        assert gateway._lock._is_owned()
        self.calls.append(('rates', name, timeframe, start_pos, count))
        return self.rates.get(name)

    def copy_ticks_range(self, name, start, stop, flags):
        assert gateway._lock._is_owned()
        self.calls.append(('ticks', name, start, stop, flags))
        return self.footprint_ticks

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
        monkeypatch.setitem(account, 'rates_time_basis', 'BROKER_SERVER')
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


def footprint_bar(fake):
    # This broker returns bar opens as UTC+03 wall-clock epochs, matching quote
    # timestamps. Normalize them with the explicit account clock policy.
    fake.rates['XAUUSD'] = (NS(time=NOW+10800-900, open=4000., high=4002., low=3998., close=4001.),)


def broker_tick_msc(utc_seconds):
    return (utc_seconds+10800)*1000


def test_footprint_aggregates_only_verified_buy_and_sell_execution_ticks(client, fake):
    footprint_bar(fake)
    fake.footprint_ticks = [
        {'last':4001.0, 'volume_real':.2, 'flags':fake.TICK_FLAG_BUY, 'time_msc':broker_tick_msc(NOW-899)},
        {'last':4001.0, 'volume_real':.3, 'flags':fake.TICK_FLAG_BUY, 'time_msc':broker_tick_msc(NOW-898)},
        {'last':4002.0, 'volume_real':.4, 'flags':fake.TICK_FLAG_SELL, 'time_msc':broker_tick_msc(NOW-897)},
        {'last':4003., 'volume_real':5., 'flags':0, 'time_msc':broker_tick_msc(NOW-895)},
    ]
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'AVAILABLE'
    assert body['source'] == 'MT5_VERIFIED' and body['canExecute'] is False
    assert body['symbol'] == 'XAUUSD' and body['timeframe'] == 'M15'
    assert body['barOpenUtc'] == datetime.fromtimestamp(NOW-900, timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    assert body['executionCount'] == 3 and body['ignoredTickCount'] == 1
    assert body['levels'] == [
        {'price':'4001', 'buyVolume':'0.5', 'sellVolume':'0', 'delta':'0.5', 'trades':2},
        {'price':'4002', 'buyVolume':'0', 'sellVolume':'0.4', 'delta':'-0.4', 'trades':1},
    ]
    call = next(item for item in fake.calls if item[0] == 'ticks')
    assert call[1] == 'XAUUSD' and call[4] == fake.COPY_TICKS_ALL
    assert call[2].timestamp() == NOW-900 and call[3].timestamp() == NOW
    assert fake.writes == 0


def test_footprint_returns_unavailable_for_no_verified_execution_ticks(client, fake):
    footprint_bar(fake)
    fake.footprint_ticks = [
        {'bid':4000., 'ask':4000.1, 'last':0., 'volume_real':0., 'flags':0, 'time_msc':broker_tick_msc(NOW-899)},
    ]
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.status_code == 200
    assert response.json()['status'] == 'UNAVAILABLE'
    assert response.json()['reason'] == 'NO_VERIFIED_EXECUTIONS'
    assert response.json()['levels'] == []


def test_footprint_fails_closed_on_ambiguous_or_malformed_execution_ticks(client, fake):
    footprint_bar(fake)
    fake.footprint_ticks = [
        {'last':4001., 'volume_real':.2, 'flags':fake.TICK_FLAG_BUY, 'time_msc':broker_tick_msc(NOW-899)},
        {'last':4002., 'volume_real':.3, 'flags':fake.TICK_FLAG_BUY|fake.TICK_FLAG_SELL,
         'time_msc':broker_tick_msc(NOW-898)},
    ]
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'UNAVAILABLE' and body['reason'] == 'INVALID_EXECUTION_TICK'
    assert body['levels'] == []
    fake.footprint_ticks = [
        {'last':0., 'volume_real':.3, 'flags':fake.TICK_FLAG_BUY, 'time_msc':broker_tick_msc(NOW-898)},
    ]
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.json()['status'] == 'UNAVAILABLE'
    assert response.json()['reason'] == 'INVALID_EXECUTION_TICK'


def test_footprint_rejects_a_future_bar_before_reading_ticks(client, fake):
    fake.rates['XAUUSD'] = (NS(time=NOW+10800+60, open=4000., high=4002., low=3998., close=4001.),)
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.status_code == 200
    assert response.json()['status'] == 'UNAVAILABLE'
    assert response.json()['reason'] == 'CANDLE_TIME_FUTURE'
    assert not any(call[0] == 'ticks' for call in fake.calls)


def test_footprint_denies_blueberry_before_gateway_or_mt5_access(client, fake):
    response = client.get('/api/chart/v1/footprint', params={
        'account':'blueberry', 'symbol':'XAUUSD', 'timeframe':'M15'})
    assert response.status_code == 403
    assert fake.calls == []


@pytest.mark.parametrize(('account', 'is_demo', 'challenge_protection'), [
    ('funded_shadow', False, False),
    ('protected_shadow', True, True),
])
def test_footprint_denies_accounts_outside_demo_policy_before_gateway_or_mt5_access(
        client, fake, monkeypatch, account, is_demo, challenge_protection):
    spec = dict(gateway.ACCOUNTS['titan'])
    spec.update(id=account, login=999999, is_demo=is_demo,
                challenge_protection=challenge_protection)
    monkeypatch.setitem(gateway.ACCOUNTS, account, spec)

    response = client.get('/api/chart/v1/footprint', params={
        'account':account, 'symbol':'XAUUSD', 'timeframe':'M15'})

    assert response.status_code == 403
    assert fake.calls == []


def test_footprint_denies_unapproved_demo_alias_before_gateway_or_mt5_access(client, fake, monkeypatch):
    spec = dict(gateway.ACCOUNTS['titan'])
    spec.update(id='unapproved_demo', login=999998, is_demo=True, challenge_protection=False)
    monkeypatch.setitem(gateway.ACCOUNTS, 'unapproved_demo', spec)

    response = client.get('/api/chart/v1/footprint', params={
        'account':'unapproved_demo', 'symbol':'XAUUSD', 'timeframe':'M15'})

    assert response.status_code == 403
    assert fake.calls == []


@pytest.mark.parametrize('account', ['titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15'])
def test_footprint_allows_each_explicit_demo_alias(client, fake, account):
    footprint_bar(fake)

    response = client.get('/api/chart/v1/footprint', params={
        'account':account, 'symbol':'XAUUSD', 'timeframe':'M15'})

    assert response.status_code == 200
    assert response.json()['account'] == account
    assert any(call[0] == 'ticks' for call in fake.calls)


def test_footprint_fails_closed_when_history_reader_is_unavailable(client, fake):
    footprint_bar(fake)
    fake.copy_ticks_range = None
    response = read(client, endpoint='footprint', timeframe='M15')
    assert response.status_code == 200
    assert response.json()['status'] == 'UNAVAILABLE'
    assert response.json()['reason'] == 'TICK_SOURCE_UNAVAILABLE'


def test_footprint_rejects_unbounded_or_unsupported_timeframes_before_mt5(client, fake):
    assert read(client, endpoint='footprint', timeframe='D1').status_code == 422
    assert read(client, endpoint='footprint', timeframe='M15', extra='x').status_code == 422
    assert not any(call[0] in ('rates','ticks') for call in fake.calls)


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


def test_symbol_search_keeps_valid_symbols_when_broker_catalog_has_bad_rows(client, fake):
    fake.symbols = (symbol('XAUUSD'), symbol('EURUSD.a'),
                    NS(name='BROKEN$USD', trade_mode=99))
    response = read(client, 'symbols', q='')
    assert response.status_code == 200
    body = response.json()
    assert [row['symbol'] for row in body['symbols']] == ['XAUUSD', 'EURUSD.a']
    assert body['invalidCount'] == 1
    assert body['canExecute'] is False


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


def test_portfolio_is_account_scoped_aggregated_and_never_invents_correlation(client, fake):
    fake.positions = (position(), position(ticket=22, identifier=23, type=1, volume=.2,
        price_open=4000., sl=4010., profit=4., swap=.5), position(ticket=24, identifier=25, type=1, volume=.2,
        symbol='EURUSD.a', price_open=1.1, price_current=1.2, sl=1.2, profit=3., swap=-.5))
    fake.rates = {'XAUUSD':correlated_rates(), 'EURUSD.a':correlated_rates(.01)}
    response = client.get('/api/chart/v1/portfolio', params={'account':'titan'})
    assert response.status_code == 200
    body = response.json()
    assert body['account'] == 'titan' and body['source'] == 'MT5_VERIFIED'
    assert body['canExecute'] is False
    assert body['positionCount'] == 3
    assert body['symbols'] == [
        {'symbol':'EURUSD.a', 'buyLots':'0', 'sellLots':'0.2', 'netLots':'-0.2',
         'floatingPnl':'3', 'swap':'-0.5', 'currency':'EUR'},
        {'symbol':'XAUUSD', 'buyLots':'0.1', 'sellLots':'0.2', 'netLots':'-0.1',
         'floatingPnl':'14', 'swap':'-0.5', 'currency':'EUR'},
    ]
    assert body['correlation']['state'] == 'AVAILABLE'
    assert body['correlation']['timeframe'] == 'H1'
    assert body['correlation']['pairs'] == [{'symbols':['EURUSD.a','XAUUSD'], 'coefficient':'1', 'observations':63}]
    assert ('rates','EURUSD.a',16385,1,257) in fake.calls
    assert ('rates','XAUUSD',16385,1,257) in fake.calls
    assert body['margin'] == {'state':'AVAILABLE', 'used':'50', 'free':'1000', 'equity':'1050',
                              'balance':'1000', 'currency':'EUR', 'scope':'ACCOUNT'}
    assert body['stopRisk'] == {'state':'AVAILABLE', 'lossAtStops':'302', 'currency':'EUR', 'source':'MT5_ORDER_CALC_PROFIT'}
    assert ('positions', 'titan', {}) in fake.calls
    assert fake.writes == 0


def test_portfolio_correlation_fails_closed_when_history_is_unavailable(client, fake):
    fake.positions = (position(), position(symbol='EURUSD.a'))
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert body['correlation'] == {'state':'UNAVAILABLE', 'reason':'HISTORY_UNAVAILABLE',
                                   'scenarioSymbol':'XAUUSD', 'symbols':['EURUSD.a','XAUUSD']}


def test_portfolio_correlation_includes_proposed_scenario_symbol(client, fake):
    fake.positions = (position(symbol='EURUSD.a'),)
    fake.rates = {'XAUUSD':correlated_rates(.01), 'EURUSD.a':correlated_rates()}
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan','scenarioSymbol':'XAUUSD'}).json()
    assert body['correlation']['state'] == 'AVAILABLE'
    assert body['correlation']['scenarioSymbol'] == 'XAUUSD'
    assert body['correlation']['symbols'] == ['EURUSD.a','XAUUSD']
    assert body['correlation']['pairs'] == [{'symbols':['EURUSD.a','XAUUSD'], 'coefficient':'1', 'observations':63}]


def test_portfolio_correlation_symbol_cap_fails_closed_before_history_reads(client, fake):
    names = [f'S{i:02d}' for i in range(12)]
    fake.symbols = (*fake.symbols, *(symbol(name) for name in names))
    fake.positions = tuple(position(ticket=100+i, identifier=200+i, symbol=name) for i,name in enumerate(names))
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert body['correlation']['state'] == 'UNAVAILABLE'
    assert body['correlation']['reason'] == 'SYMBOL_LIMIT_EXCEEDED'
    assert body['correlation']['scenarioSymbol'] == 'XAUUSD'
    assert body['correlation']['symbols'] == []
    assert not any(call[0] == 'rates' for call in fake.calls)


def test_portfolio_correlation_requires_aligned_nonconstant_returns(client, fake):
    fake.positions = (position(), position(symbol='EURUSD.a'))
    fake.rates['XAUUSD'] = [NS(time=1000+i*3600, close=100+i*i) for i in range(64)]
    fake.rates['EURUSD.a'] = [NS(time=1000+i*3600+36000, close=2+i*i) for i in range(64)]
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert body['correlation']['state'] == 'UNAVAILABLE'
    assert body['correlation']['reason'] == 'INSUFFICIENT_ALIGNED_HISTORY'
    fake.rates['EURUSD.a'] = [NS(time=1000+i*3600, close=2+i*i) for i in range(64)]
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert body['correlation']['state'] == 'AVAILABLE'
    fake.rates['EURUSD.a'] = [NS(time=1000+i*3600, close=2.) for i in range(64)]
    body = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert body['correlation']['state'] == 'UNAVAILABLE'
    assert body['correlation']['reason'] == 'INVALID_CORRELATION_SERIES'


def test_portfolio_distinguishes_empty_from_unavailable_and_validates_all_rows(client, fake):
    fake.positions = []
    response = client.get('/api/chart/v1/portfolio', params={'account':'titan'})
    assert response.status_code == 200 and response.json()['positionCount'] == 0
    assert response.json()['symbols'] == []
    assert response.json()['correlation'] == {'state':'UNAVAILABLE', 'reason':'NO_SYMBOL_PAIRS',
        'scenarioSymbol':'XAUUSD', 'symbols':['XAUUSD']}
    fake.positions = None
    assert client.get('/api/chart/v1/portfolio', params={'account':'titan'}).status_code == 503
    fake.positions = (position(), position(symbol='UNVERIFIED'))
    assert client.get('/api/chart/v1/portfolio', params={'account':'titan'}).status_code == 404


def test_portfolio_requires_known_account_before_mt5(client, fake):
    assert client.get('/api/chart/v1/portfolio').status_code == 422
    assert client.get('/api/chart/v1/portfolio', params={'account':'unknown'}).status_code == 400
    assert fake.calls == []


def test_portfolio_stop_risk_fails_closed_for_missing_stops_or_calc(client, fake):
    fake.positions = (position(sl=0.),)
    response = client.get('/api/chart/v1/portfolio', params={'account':'titan'})
    assert response.status_code == 200
    assert response.json()['stopRisk'] == {'state':'UNAVAILABLE', 'reason':'MISSING_STOP'}
    fake.positions = (position(),)
    fake.order_calc_profit = None
    response = client.get('/api/chart/v1/portfolio', params={'account':'titan'})
    assert response.status_code == 200
    assert response.json()['stopRisk'] == {'state':'UNAVAILABLE', 'reason':'BROKER_CALCULATION_UNAVAILABLE'}


def test_portfolio_preserves_negative_free_margin_and_equity(client, fake):
    fake.account_info = lambda: NS(login=fake.current['login'], server=fake.current['server'],
        currency='EUR', currency_digits=2, margin_mode=2, balance=-5., equity=-10.,
        margin=50., margin_free=-60.)
    result = client.get('/api/chart/v1/portfolio', params={'account':'titan'}).json()
    assert result['margin']['free'] == '-60'
    assert result['margin']['equity'] == '-10'
    assert result['margin']['balance'] == '-5'


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
    assert buy['currency'] == 'EUR'
    assert buy['usdConversion'] == {'state':'UNAVAILABLE','reason':'NO_FX_SYMBOL','source':'NONE'}
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
    assert quote['offsetSource'] == 'BROKER_CLOCK_POLICY'
    assert len(body['positionsRevision']) == len(body['ordersRevision']) == 64
    assert len(quote['revision']) == 64


def test_positions_publish_usd_amounts_only_from_verified_conversion(client, fake):
    fake.account_info = lambda: NS(login=fake.current['login'], server=fake.current['server'],
        currency='USD', currency_digits=2, margin_mode=2, balance=1000., equity=1000.,
        margin=0., margin_free=1000.)
    response = read(client)
    assert response.status_code == 200
    body = response.json()
    assert body['currency'] == 'USD'
    assert body['positions'][0]['usdConversion'] == {
        'state':'AVAILABLE','source':'ACCOUNT_CURRENCY','amountsUsd':{'profit':10.0,'swap':-1.0}}
    assert fake.writes == 0


def test_snapshot_revisions_track_semantic_book_and_quote_changes_but_not_observation_age(client, fake):
    before = read(client).json()
    same_tick_later = read(client).json()
    assert before['positionsRevision'] == same_tick_later['positionsRevision']
    assert before['ordersRevision'] == same_tick_later['ordersRevision']
    assert before['quote']['revision'] == same_tick_later['quote']['revision']
    from chart_studio.broker_reads import quote_model
    spec = gateway.ACCOUNTS['titan']
    later_quote = quote_model(fake.tick, spec, symbol='XAUUSD', now=NOW+5)
    assert later_quote['ageSeconds'] != before['quote']['ageSeconds']
    assert later_quote['revision'] == before['quote']['revision']

    fake.tick.bid += .01
    changed_quote = read(client).json()
    assert changed_quote['quote']['revision'] != before['quote']['revision']
    assert changed_quote['positionsRevision'] == before['positionsRevision']

    fake.positions = fake.positions[:1]
    changed_book = read(client).json()
    assert changed_book['positionsRevision'] != before['positionsRevision']


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
    assert len(body['positionsRevision']) == len(body['ordersRevision']) == 64


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
    monkeypatch.delitem(gateway.ACCOUNTS['titan'], 'broker_clock_policy')
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


def test_quote_future_clock_skew_is_bounded_at_1_5_seconds(fake):
    from chart_studio.broker_reads import quote_model
    spec = gateway.ACCOUNTS['titan']

    near_skew = quote_model(fake.tick, spec, symbol='XAUUSD', now=NOW-1.30)
    beyond_skew = quote_model(fake.tick, spec, symbol='XAUUSD', now=NOW-1.40)

    assert near_skew['freshness'] == 'FRESH'
    assert near_skew['stale'] is False
    assert near_skew['ageSeconds'] == 0.
    assert near_skew['canExecute'] is False
    assert beyond_skew['freshness'] == 'FUTURE'
    assert beyond_skew['stale'] is True
    assert beyond_skew['canExecute'] is False


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
                     broker_symbol=broker_symbol,
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


def test_legacy_quote_reads_exact_selected_non_xau_symbol(fake):
    with gateway.session(fake, 'titan'):
        body = legacy_function(fake)('titan', symbol='EURUSD.a')
    assert body['symbol'] == 'EURUSD.a'
    assert ('tick','EURUSD.a') in fake.calls
    assert ('symbol_info','EURUSD.a') in fake.calls


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
