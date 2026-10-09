"""Real history-deal read contract, exercised without a terminal or broker writes."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
import account_gateway as gateway
from test_chart_studio_broker_reads import MT5Fake, NOW, RAW, NS

FROM = '2026-10-09T09:00:00Z'
TO = '2026-10-09T13:00:00Z'


def deal(**changes):
    fields = dict(ticket=9007199254740993, order=9007199254740994,
                  position_id=9007199254740995, symbol='XAUUSD', type=0, entry=0,
                  magic=0, time=RAW-60, time_msc=(RAW-60)*1000+123,
                  volume=Decimal('0.1000'), price=Decimal('4000.0500'),
                  commission=-.25, swap=-.5, profit=1.25, fee=-.1, comment='EA claim',
                  reason=0, external_id='')
    fields.update(changes)
    return NS(**fields)


class HistoryFake(MT5Fake):
    def __init__(self):
        super().__init__()
        self.deals = (deal(),)

    def history_deals_get(self, *args, **kwargs):
        assert gateway._lock._is_owned()
        assert len(args) == 2 and not kwargs
        self.calls.append(('history', self.current['id'], args))
        time.sleep(.001)
        return self.deals

    def positions_get(self, **kwargs):
        raise AssertionError('positions are not history fills')

    def orders_get(self, **kwargs):
        raise AssertionError('pending orders are not history fills')


@pytest.fixture
def fake(monkeypatch):
    gateway._attached_mt5 = gateway._attached_account = None
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: True)
    for account in gateway.ACCOUNTS.values():
        monkeypatch.setitem(account, 'broker_utc_offset_seconds', 10800)
    adapter = HistoryFake()
    yield adapter
    assert adapter.writes == 0
    gateway._attached_mt5 = gateway._attached_account = None


@pytest.fixture
def observed():
    return [NOW+.789]


@pytest.fixture
def client(fake, observed):
    from chart_studio.read_api import install_read_routes
    app = FastAPI()
    install_read_routes(app, fake, now=lambda: observed[0])
    return TestClient(app)


def read(client, **params):
    return client.get('/api/chart/v1/trades', params=dict(
        account='titan', symbol='XAUUSD', fromUtc=FROM, toUtc=TO, **{}) | params)


@pytest.mark.parametrize('missing', ['account', 'symbol', 'fromUtc', 'toUtc'])
def test_explicit_scope_and_range_required(client, fake, missing):
    params = dict(account='titan', symbol='XAUUSD', fromUtc=FROM, toUtc=TO)
    del params[missing]
    assert client.get('/api/chart/v1/trades', params=params).status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize('params', [
    {'fromUtc':'2026-10-09T09:00:00'}, {'toUtc':'banana'},
    {'fromUtc':'2026-10-09T09:00:00+03:00'}, {'fromUtc':TO},
    {'fromUtc':'2026-10-10T09:00:00Z'},
    {'fromUtc':'2026-09-01T09:00:00Z'},
    {'limit':0}, {'limit':501}, {'limit':'banana'},
    {'symbol':'*'}, {'ticket':'0'}, {'magic':'-1'}, {'manual':'nope'},
])
def test_bad_queries_rejected_before_attach(client, fake, params):
    assert read(client, **params).status_code == 422
    assert fake.calls == []


def test_actual_fill_decimal_currency_ids_and_millisecond_clock(client, fake):
    result = read(client)
    assert result.status_code == 200, result.text
    body = result.json()
    fill, = body['trades']
    assert fill['ticket'] == '9007199254740993'
    assert fill['orderTicket'] == '9007199254740994'
    assert fill['positionIdentifier'] == '9007199254740995'
    assert fill['volume'] == '0.1' and fill['price'] == '4000.05'
    assert [fill[k] for k in ('commission','swap','profit','fee')] == ['-0.25','-0.5','1.25','-0.1']
    assert fill['currency'] == body['currency'] == 'EUR'
    assert fill['type'] == fill['side'] == 'BUY' and fill['rawType'] == 0
    assert fill['entry'] == 'IN' and fill['rawEntry'] == 0
    assert fill['status'] == 'EXECUTED'
    assert fill['source'] == 'MT5_VERIFIED' and fill['canExecute'] is False
    assert fill['magic'] == '0' and fill['ownership'] == 'MANUAL'
    assert fill['comment'] == 'EA claim'
    assert fill['rawBrokerTime'] == RAW-60
    assert fill['fillTime'] == dict(rawBrokerEpochMs=(RAW-60)*1000+123,
        utcEpochMs=(NOW-60)*1000+123, brokerUtcOffsetSeconds=10800, offsetSource='ACCOUNT_CONFIG')
    assert body['nextCursor'] is None
    assert body['asOfUtc'] == '2026-10-09T12:00:00.789000Z'
    assert result.headers['cache-control'] == 'no-store'
    start, stop = next(c[2] for c in fake.calls if c[0] == 'history')
    assert start == datetime(2026,10,9,12,tzinfo=timezone.utc)
    assert stop == datetime(2026,10,9,15,0,0,789000,tzinfo=timezone.utc)


@pytest.mark.parametrize('entry,label', [(0,'IN'),(1,'OUT'),(2,'INOUT'),(3,'OUT_BY'),(99,'UNKNOWN')])
def test_actual_entry_and_sell_semantics(client, fake, entry, label):
    fake.deals = (deal(type=1, entry=entry, magic=42),)
    fill = read(client).json()['trades'][0]
    assert fill['side'] == 'SELL' and fill['entry'] == label and fill['rawEntry'] == entry
    assert fill['ownership'] == 'UNKNOWN'


@pytest.mark.parametrize('kind,label', [(2,'BALANCE'),(3,'CREDIT'),(4,'CHARGE'),(5,'CORRECTION'),
    (6,'BONUS'),(7,'COMMISSION'),(8,'COMMISSION_DAILY'),(9,'COMMISSION_MONTHLY'),
    (10,'COMMISSION_AGENT_DAILY'),(11,'COMMISSION_AGENT_MONTHLY'),(12,'INTEREST'),
    (13,'BUY_CANCELED'),(14,'SELL_CANCELED'),(15,'OTHER_UNKNOWN'),(16,'OTHER_UNKNOWN'),
    (17,'OTHER_UNKNOWN'),(999,'OTHER_UNKNOWN')])
def test_nontrade_and_canceled_categories_are_omitted_explicitly(client, fake, kind, label):
    fake.deals = (deal(type=kind, symbol='', price=0., volume=0., position_id=0, order=0),)
    body = read(client).json()
    assert body['trades'] == []
    assert body['omittedCategories'] == [{'type':label, 'rawType':kind, 'count':1}]


@pytest.mark.parametrize('params,expected', [({'ticket':'12'},['12']), ({'magic':'42'},['12']),
    ({'manual':True},['9007199254740993']), ({'manual':False},['12']),
    ({'ticket':'9007199254740994'},[]), ({'symbol':'EURUSD.a'},['20'])])
def test_filters_apply_to_real_deal_ticket_after_fetch(client, fake, params, expected):
    fake.deals = (deal(), deal(ticket=12, magic=42), deal(ticket=20, symbol='EURUSD.a'))
    body = read(client, **params).json()
    assert [f['ticket'] for f in body['trades']] == expected
    assert all(len(c[2]) == 2 for c in fake.calls if c[0] == 'history')


def test_none_is_unavailable_and_empty_tuple_is_success(client, fake):
    fake.deals = None
    assert read(client).status_code == 503
    fake.deals = ()
    assert read(client).json()['trades'] == []


@pytest.mark.parametrize('field,value', [('price',float('nan')),('volume',float('inf')),
    ('profit',float('nan')),('commission',float('inf')),('swap',float('nan')),
    ('fee',float('inf')),('ticket',0),('order',-1),('position_id',-1),('magic',-1),
    ('time',0),('time_msc',0),('time_msc',(RAW-59)*1000),('type',-1),('entry',-1),
    ('symbol',None),('comment',None),('price',-1),('volume',0)])
def test_malformed_history_fails_closed_even_when_filtered(client, fake, field, value):
    fake.deals = (deal(**{field:value}),)
    assert read(client, ticket='12').status_code == 503


@pytest.mark.parametrize('field', ['ticket','order','position_id','symbol','type','entry',
    'magic','time','time_msc','volume','price','commission','swap','profit','fee','comment'])
def test_required_fields_never_fabricated(client, fake, field):
    delattr(fake.deals[0], field)
    assert read(client).status_code == 503


def test_missing_clock_policy_refused(client, monkeypatch):
    monkeypatch.delitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds')
    assert read(client).status_code == 503


@pytest.mark.parametrize('wrong,status', [('login',409),('server',409),('path',503),('data',409),('connected',503)])
def test_verified_identity_before_history(client, fake, wrong, status):
    fake.wrong = wrong
    assert read(client, account='goldm15').status_code == status
    assert not any(c[0] == 'history' for c in fake.calls)


def test_unknown_account_unknown_symbol_and_stopped_terminal(client, fake, monkeypatch):
    assert read(client, account='unknown').status_code == 400
    assert fake.calls == []
    assert read(client, symbol='MISSING').status_code == 404
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: False)
    assert read(client).status_code == 503


def test_parallel_accounts_are_locked_during_history_and_serialization(client, fake):
    original = fake.history_deals_get
    def history(*args):
        original(*args)
        account = fake.current
        class ScopedDeal:
            def __getattr__(self, name):
                assert gateway._lock._is_owned()
                assert fake.current is account
                return getattr(deal(ticket=account['login']), name)
        return (ScopedDeal(),)
    fake.history_deals_get = history
    accounts = ['titan','goldm15']*8
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda a: read(client, account=a).json(), accounts))
    assert [r['trades'][0]['ticket'] for r in results] == [str(gateway.ACCOUNTS[a]['login']) for a in accounts]


def paged(fake):
    fake.deals = tuple(deal(ticket=n, time=RAW-30, time_msc=(RAW-30)*1000+(0 if n<3 else 1)) for n in (4,2,3,1))


def test_stable_pagination_ties_and_pinned_asof(client, fake, observed):
    paged(fake)
    first = read(client, limit=2).json()
    assert [r['ticket'] for r in first['trades']] == ['1','2']
    assert first['nextCursor']
    observed[0] += 600
    fake.deals += (deal(ticket=5, time=RAW+10, time_msc=(RAW+10)*1000),)
    second = read(client, limit=2, cursor=first['nextCursor']).json()
    assert [r['ticket'] for r in second['trades']] == ['3','4']
    assert second['nextCursor'] is None and second['asOfUtc'] == first['asOfUtc']
    assert next(c[2][1] for c in reversed(fake.calls) if c[0] == 'history') == datetime(2026,10,9,15,0,0,789000,tzinfo=timezone.utc)


def test_request_upper_boundary_wins_and_range_filters_after_fetch(client, fake):
    fake.deals = (deal(), deal(ticket=12, time=RAW+10, time_msc=(RAW+10)*1000),
                  deal(ticket=13, time=RAW-20000, time_msc=(RAW-20000)*1000))
    body = read(client, toUtc='2026-10-09T11:59:30Z').json()
    assert [r['ticket'] for r in body['trades']] == ['9007199254740993']
    assert body['asOfUtc'] == '2026-10-09T11:59:30.000000Z'


def test_future_requested_range_has_no_future_records(client, fake):
    fake.deals = (deal(time=RAW+3600, time_msc=(RAW+3600)*1000),)
    body = read(client, fromUtc='2026-10-09T12:30:00Z').json()
    assert body['trades'] == []
    assert body['asOfUtc'] == '2026-10-09T12:00:00.789000Z'


@pytest.mark.parametrize('params', [{'account':'goldm15'},{'symbol':'EURUSD.a'}, {'ticket':'12'},
    {'magic':'0'}, {'manual':True}, {'fromUtc':'2026-10-09T09:00:01Z'}, {'toUtc':'2026-10-09T12:59:59Z'}])
def test_cursor_bound_to_scope_range_and_filters(client, fake, params):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    response = read(client, cursor=cursor, **params)
    assert response.status_code == 410
    assert response.json()['detail']['code'] == 'CURSOR_INVALID_OR_EXPIRED'


def test_cursor_canonical_utc_ranges_and_limit_can_change(client, fake):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    response = read(client, cursor=cursor, fromUtc='2026-10-09T09:00:00+00:00', limit=500)
    assert response.status_code == 200
    assert len(response.json()['trades']) == 3


@pytest.mark.parametrize('corruption', ['change','truncate','oversized','restart'])
def test_cursor_tampering_bounded_payload_and_restart(client, fake, monkeypatch, corruption):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    if corruption == 'change':
        cursor = ('A' if cursor[0] != 'A' else 'B')+cursor[1:]
    elif corruption == 'truncate':
        cursor = cursor[:-8]
    elif corruption == 'oversized':
        cursor = 'A'*5000
    else:
        import chart_studio.history_cursor as module
        monkeypatch.setattr(module, '_KEY', b'different-process-key'*2)
    response = read(client, cursor=cursor)
    assert response.status_code == 410
    assert response.json()['detail']['code'] == 'CURSOR_INVALID_OR_EXPIRED'


def test_cursor_verified_login_server_and_clock_binding(client, fake, monkeypatch):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'login', 999)
    assert read(client, cursor=cursor).status_code == 410
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'server', 'other-server')
    assert read(client, cursor=cursor).status_code == 410
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds', 0)
    assert read(client, cursor=cursor).status_code == 410


def test_duplicate_identical_tickets_deduplicate_and_conflicts_fail_closed(client, fake):
    fake.deals = (deal(),deal())
    assert len(read(client).json()['trades']) == 1
    fake.deals = (deal(),deal(price=4001.))
    assert read(client).status_code == 503
    fake.deals = (deal(),deal(time=RAW-61,time_msc=(RAW-61)*1000))
    assert read(client).status_code == 503


def test_raw_history_cap_has_explicit_error_not_truncation(client, fake):
    fake.deals = (deal(),)*50001
    result = read(client, limit=1)
    assert result.status_code == 503
    assert result.json()['detail']['code'] == 'HISTORY_LIMIT'


def test_mutated_or_late_history_expires_cursor_instead_of_silent_duplicate(client, fake):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    fake.deals[3].time_msc += 2
    assert read(client, cursor=cursor).status_code == 410
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    fake.deals += (deal(ticket=5, time=RAW-31, time_msc=(RAW-31)*1000),)
    assert read(client, cursor=cursor).status_code == 410


def test_history_errors_do_not_leak_private_data(client, fake):
    def explode(*args):
        raise RuntimeError('password=secret balance=100000')
    fake.history_deals_get = explode
    result = read(client)
    assert result.status_code == 503
    assert 'secret' not in result.text and '100000' not in result.text


def test_history_post_forbidden(client):
    assert client.post('/api/chart/v1/trades').status_code == 405


@pytest.mark.parametrize('reason,external_id', [(0,''), (4,'broker-reference'), (999,'unknown-reason')])
def test_actual_provenance_fields_preserved_without_inferred_ownership(client, fake, reason, external_id):
    fake.deals = (deal(reason=reason, external_id=external_id, magic=42),)
    fill = read(client).json()['trades'][0]
    assert fill['rawReason'] == reason
    assert fill['externalId'] == external_id
    assert fill['ownership'] == 'UNKNOWN'


@pytest.mark.parametrize('kind', [0, 2])
@pytest.mark.parametrize('field,value', [
    ('reason',float('nan')), ('reason',float('inf')), ('reason',-1),
    ('reason',None), ('reason',True), ('reason',4.0), ('reason','4'),
    ('external_id',None), ('external_id',float('inf')), ('external_id',float('nan')),
    ('external_id',42), ('external_id',False),
])
def test_malformed_provenance_fails_closed_for_filtered_and_omitted_rows(client, fake, kind, field, value):
    fake.deals = (deal(type=kind, **{field:value}),)
    assert read(client, ticket='12').status_code == 503


@pytest.mark.parametrize('field', ['reason', 'external_id'])
def test_missing_provenance_fails_closed_even_when_filtered(client, fake, field):
    delattr(fake.deals[0], field)
    assert read(client, ticket='12').status_code == 503


@pytest.mark.parametrize('field,value', [('reason',4), ('external_id','corrected')])
def test_conflicting_duplicate_provenance_fails_closed(client, fake, field, value):
    fake.deals = (deal(), deal(**{field:value}))
    assert read(client).status_code == 503


@pytest.mark.parametrize('field,value', [('reason',4), ('external_id','corrected')])
def test_corrected_provenance_between_pages_expires_cursor(client, fake, field, value):
    paged(fake)
    cursor = read(client, limit=1).json()['nextCursor']
    setattr(fake.deals[3], field, value)
    result = read(client, cursor=cursor)
    assert result.status_code == 410
    assert result.json()['detail']['code'] == 'CURSOR_INVALID_OR_EXPIRED'
