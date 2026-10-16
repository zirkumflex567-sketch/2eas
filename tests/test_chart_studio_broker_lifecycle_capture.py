"""Read-only deal-to-evidence contract; fixtures never contact MT5."""
import importlib
import copy
from contextlib import contextmanager
from pathlib import Path

import pytest


def api():
    return importlib.import_module('chart_studio.broker_lifecycle_capture')


def context(account='titan'):
    from chart_studio.evidence_models import AccountContext
    return AccountContext.from_config(account)


def deal(**updates):
    row = {
        'account': 'titan', 'login': '53087839', 'server': 'ICMarketsEU-Demo',
        'source': 'MT5_VERIFIED', 'canExecute': False, 'symbol': 'XAUUSD',
        'ticket': '8712345', 'orderTicket': '8712344', 'positionIdentifier': '8712300',
        'type': 'BUY', 'status': 'EXECUTED', 'entry': 'IN',
        'fillTime': {'rawBrokerEpochMs': 1792098900000, 'utcEpochMs': 1792088100000,
                     'brokerUtcOffsetSeconds': 10800, 'offsetSource': 'ACCOUNT_CONFIG'},
        'price': '4153.92', 'volume': '0.1', 'commission': '-0.25',
        'fee': '0', 'swap': '0', 'profit': '-1.35',
    }
    row.update(updates)
    return row


def test_account_allowlist_is_demo_only_and_rejects_duplicate_terminal_aliases():
    service = api()
    assert service.parse_demo_allowlist('titan,xau5m_m5,titan_m5,xau5m_500') == (
        'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500')
    with pytest.raises(ValueError):
        service.parse_demo_allowlist('blueberry')
    with pytest.raises(ValueError):
        service.parse_demo_allowlist('unknown')
    with pytest.raises(ValueError):
        service.parse_demo_allowlist('xau5m_m5,xau5m_m15')
    accounts = copy.deepcopy(importlib.import_module('account_gateway').ACCOUNTS)
    accounts['second_login_same_terminal'] = dict(accounts['xau5m_m5'], login=700000001)
    with pytest.raises(ValueError):
        service.parse_demo_allowlist('xau5m_m5,second_login_same_terminal', accounts=accounts)
    accounts['missing_terminal'] = dict(accounts['titan'], terminal='')
    with pytest.raises(ValueError):
        service.parse_demo_allowlist('missing_terminal', accounts=accounts)


def test_deal_mapping_preserves_broker_identity_event_time_and_capture_time():
    service = api()
    envelope = service.deal_envelope(context(), deal(), '2026-10-15T18:16:00Z')
    payload = envelope['payload']
    assert envelope['type'] == 'LIFECYCLE'
    assert envelope['id'] == 'mt5_deal_8712345'
    assert payload['eventType'] == 'ENTRY'
    assert payload['dealEntry'] == 'IN'
    assert payload['asOfUtc'] == '2026-10-15T18:15:00.000000Z'
    assert payload['capturedAtUtc'] == '2026-10-15T18:16:00.000000Z'
    assert payload['positionIdentifier'] == '8712300'
    assert payload['dealSide'] == 'BUY'
    assert (payload['commission'], payload['fee'], payload['swap'], payload['profit']) == ('-0.25', '0', '0', '-1.35')


def test_deal_mapping_normalizes_mt5_binary_float_artifacts_in_money_fields():
    row = deal(swap='1.1400000000000001', profit='5.9399999999999995')
    payload = api().deal_envelope(context(), row, '2026-10-15T18:16:00Z')['payload']
    assert payload['swap'] == '1.14'
    assert payload['profit'] == '5.94'


def test_trade_snapshot_freezes_only_completed_broker_candles_with_stable_identity():
    service = api()
    asof = deal()['fillTime']['utcEpochMs'] // 1000
    def bar(stamp, close):
        return dict(time=stamp,open=4150.0,high=4155.0,low=4149.0,close=close,
                    tick_volume=12,spread=18,real_volume=0)
    rows=[bar(asof-1800,4151.25),bar(asof-900,4152.5),bar(asof,4153.0)]
    first=service.trade_snapshot_envelope(context(),deal(),rows,captured_at_utc='2026-10-15T18:16:00Z',timeframe='M15',digits=2)
    again=service.trade_snapshot_envelope(context(),deal(),rows,captured_at_utc='2026-10-15T18:16:10Z',timeframe='M15',digits=2)
    payload=first['payload']
    assert payload['captureType']=='ENTRY' and payload['snapshotId']==again['payload']['snapshotId']
    assert len(payload['marketData']['bars'])==2
    assert payload['marketData']['bars'][-1]['timeUtc']=='2026-10-15T18:00:00.000000Z'
    exit_row=deal(ticket='8712346',entry='OUT',type='SELL')
    exit_payload=service.trade_snapshot_envelope(context(),exit_row,rows,captured_at_utc='2026-10-15T18:16:00Z',timeframe='M15',digits=2)['payload']
    assert exit_payload['captureType']=='EXIT' and exit_payload['snapshotId']!=payload['snapshotId']
    assert service.trade_snapshot_envelope(context(),deal(entry='INOUT'),rows,captured_at_utc='2026-10-15T18:16:00Z',timeframe='M15',digits=2) is None


def test_trade_snapshot_normalizes_explicit_broker_server_bar_times(monkeypatch):
    service=api(); spec=importlib.import_module('account_gateway').ACCOUNTS['titan']
    monkeypatch.setitem(spec,'rates_time_basis','BROKER_SERVER')
    monkeypatch.setitem(spec,'broker_utc_offset_seconds',10800)
    asof=deal()['fillTime']['utcEpochMs']//1000
    rows=[dict(time=stamp+10800,open=4150.,high=4155.,low=4149.,close=4151.,
               tick_volume=10,spread=18,real_volume=0)
          for stamp in (asof-1800,asof-900,asof)]

    snapshot=service.trade_snapshot_envelope(context(),deal(),rows,
        captured_at_utc='2026-10-15T18:16:00Z',timeframe='M15',digits=2)

    assert [bar['timeUtc'] for bar in snapshot['payload']['marketData']['bars']]==[
        '2026-10-15T17:45:00.000000Z','2026-10-15T18:00:00.000000Z']


def test_demo_poll_persists_entry_snapshot_without_browser_and_retries_idempotently(monkeypatch):
    from contextlib import contextmanager
    service=api(); spec=importlib.import_module('account_gateway').ACCOUNTS['titan']; asof=deal()['fillTime']['utcEpochMs']//1000
    class Store:
        root=Path('private')
        def __init__(self): self.records={}
        def append(self,ctx,envelope):
            key=(envelope['type'],envelope['id'])
            existing=self.records.get(key)
            if existing is not None and key[0]=='SNAPSHOT' and existing!=envelope:
                return {'ok':False,'code':'CONFLICT','lostCount':1}
            duplicate=existing is not None
            self.records[key]=envelope
            return {'ok':True,'code':'IDEMPOTENT' if duplicate else 'APPENDED','lostCount':0}
        def read(self,ctx,*,kind,record_id):
            row=self.records.get((kind,record_id))
            return {'records':[row] if row else [],'availability':'RECORDED' if row else 'NOT_RECORDED',
                    'storeState':'INITIALIZED'}
    class MT5:
        TIMEFRAME_M15=15
        def __init__(self): self.bar_reads=0
        def symbol_info(self,symbol): return type('Info',(),{'name':symbol,'digits':2})()
        def copy_rates_range(self,symbol,timeframe,start,stop):
            self.bar_reads+=1
            return [dict(time=asof-1800,open=4150.,high=4155.,low=4149.,close=4151.,tick_volume=10,spread=18,real_volume=0),
                    dict(time=asof-900,open=4151.,high=4156.,low=4150.,close=4152.,tick_volume=11,spread=18,real_volume=0)]
        def order_send(self,*_args,**_kwargs): raise AssertionError('trade mutation called')
    @contextmanager
    def verified(_mt5,account): yield spec
    monkeypatch.setattr(service.gateway,'traced_session',verified)
    monkeypatch.setattr(service.broker_reads,'trades_read',lambda *_args,**_kwargs:{'trades':[deal()],'nextCursor':None})
    store=Store(); mt5=MT5(); times=iter((1792088160.,1792088170.))
    poller=service.DemoBrokerLifecycleCapture(store,mt5,['titan'],clock=lambda:next(times))
    first=poller.poll_once()['titan']; second=poller.poll_once()['titan']
    snapshots=[env for (kind,_),env in store.records.items() if kind=='SNAPSHOT']
    assert first['snapshotsAppended']==1 and second['snapshotDuplicates']==1, (first,second)
    assert second['snapshotStoreLostCount']==0 and mt5.bar_reads==1
    assert len(snapshots)==1 and snapshots[0]['payload']['marketData']['bars']
    assert snapshots[0]['payload']['lifecycleEventIds']==[dict(type='LIFECYCLE',id='mt5_deal_8712345',dataRevision=1)]


@pytest.mark.parametrize('entry,event', [('OUT', 'EXIT'), ('OUT_BY', 'EXIT'), ('INOUT', 'POSITION_OBSERVED')])
def test_deal_mapping_does_not_infer_reversal_as_simple_entry_or_exit(entry, event):
    payload = api().deal_envelope(context(), deal(entry=entry, type='SELL'), '2026-10-15T18:16:00Z')['payload']
    assert (payload['dealEntry'], payload['eventType']) == (entry, event)


@pytest.mark.parametrize('field,value', [
    ('source', 'CLIENT'), ('canExecute', True), ('account', 'blueberry'),
    ('symbol', 'XAUUSD.p'), ('status', 'OMITTED'), ('ticket', '0'),
])
def test_deal_mapping_rejects_unverified_or_cross_scope_rows(field, value):
    with pytest.raises(ValueError):
        api().deal_envelope(context(), deal(**{field: value}), '2026-10-15T18:16:00Z')


def test_deal_mapping_rejects_broker_clock_offset_mismatch():
    invalid = deal(fillTime={'rawBrokerEpochMs': 1792098900000, 'utcEpochMs': 1792088100000,
                             'brokerUtcOffsetSeconds': 7200, 'offsetSource': 'ACCOUNT_CONFIG'})
    with pytest.raises(ValueError):
        api().deal_envelope(context(), invalid, '2026-10-15T18:16:00Z')


def test_lifecycle_schema_requires_side_and_entry_together_and_capture_time_after_event():
    models = importlib.import_module('chart_studio.evidence_models')
    payload = api().deal_envelope(context(), deal(), '2026-10-15T18:16:00Z')['payload']
    payload.pop('revision')
    valid = dict(payload)
    valid.pop('dealSide')
    with pytest.raises(ValueError):
        models.seal_lifecycle(valid, context=context())
    invalid_time = dict(payload, capturedAtUtc='2026-10-15T18:14:59Z')
    with pytest.raises(ValueError):
        models.seal_lifecycle(invalid_time, context=context())


def test_capture_is_idempotent_and_reports_store_loss():
    service = api()
    class Store:
        def __init__(self): self.seen = set()
        def append(self, ctx, envelope):
            key = (ctx.account_id, envelope['id'])
            if key in self.seen:
                return {'ok': True, 'code': 'IDEMPOTENT', 'lostCount': 0}
            self.seen.add(key)
            return {'ok': True, 'code': 'APPENDED', 'lostCount': 0}
    store = Store()
    rows = [deal(), deal(ticket='8712346', orderTicket='8712345')]
    first = service.capture_deals(store, context(), rows, '2026-10-15T18:16:00Z')
    second = service.capture_deals(store, context(), rows, '2026-10-15T18:16:10Z')
    assert first['appended'] == 2 and first['duplicates'] == 0
    assert second['appended'] == 0 and second['duplicates'] == 2


def test_store_exception_is_reported_as_store_loss_not_bad_broker_record():
    class Store:
        root = Path('private')
        def append(self, _ctx, _envelope):
            raise RuntimeError('private storage detail')

    result = api().capture_deals(Store(), context(), [deal()], '2026-10-15T18:16:00Z')
    assert result['code'] == 'STORE_UNAVAILABLE'
    assert result['rejected'] == 0
    assert result['storeLostCount'] >= 1


def test_poll_reads_verified_demo_history_and_appends_without_trade_mutations(monkeypatch):
    service = api()
    account_spec = importlib.import_module('account_gateway').ACCOUNTS['titan']
    calls = []

    class Store:
        root = Path('private-test-root')
        def __init__(self): self.records = []
        def append(self, ctx, envelope):
            self.records.append((ctx, envelope))
            return {'ok': True, 'code': 'APPENDED', 'lostCount': 0}

    class MT5:
        def order_send(self, *_args, **_kwargs):
            raise AssertionError('broker mutations must never be called')

    @contextmanager
    def verified_session(_mt5, account):
        calls.append(('session', account))
        yield account_spec

    def read_history(_mt5, spec, symbol, start, stop, *, limit, cursor, now):
        calls.append(('history', spec['id'], symbol, start, stop, limit, cursor, now))
        return {'trades': [deal()], 'nextCursor': None}

    monkeypatch.setattr(importlib.import_module('chart_studio.broker_lifecycle_capture').gateway,
                        'traced_session', verified_session)
    monkeypatch.setattr(importlib.import_module('chart_studio.broker_lifecycle_capture').broker_reads,
                        'trades_read', read_history)
    store = Store()
    poller = service.DemoBrokerLifecycleCapture(store, MT5(), ['titan'],
                                                 clock=lambda: 1792088160.0)
    status = poller.poll_once()['titan']

    assert calls[0] == ('session', 'titan')
    assert calls[1][0:3] == ('history', 'titan', 'XAUUSD')
    assert calls[1][5] == service.PAGE_SIZE
    assert status['coverage'] == 'ROLLING_WINDOW' and status['appended'] == 1
    assert status['snapshotCoverage']=='UNKNOWN' and status['snapshotUnavailable']==1
    assert len(store.records) == 1
    assert store.records[0][1]['payload']['dealTicket'] == '8712345'


def test_broker_read_failure_is_visible_unknown_and_does_not_escape_poll(monkeypatch):
    service = api()
    account_spec = importlib.import_module('account_gateway').ACCOUNTS['titan']

    @contextmanager
    def verified_session(_mt5, _account):
        yield account_spec

    monkeypatch.setattr(service.gateway, 'traced_session', verified_session)
    monkeypatch.setattr(service.broker_reads, 'trades_read',
                        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('private broker detail')))
    poller = service.DemoBrokerLifecycleCapture(type('Store', (), {'root': Path('private'), 'append': lambda *_: None})(),
                                                 object(), ['titan'], clock=lambda: 1792088160.0)
    status = poller.poll_once()['titan']
    assert status['code'] == 'BROKER_READ_UNAVAILABLE'
    assert status['coverage'] == 'UNKNOWN'
    assert 'private broker detail' not in str(status)


def test_store_failure_does_not_advance_history_watermark(monkeypatch):
    service = api()
    account_spec = importlib.import_module('account_gateway').ACCOUNTS['titan']
    start_times = []

    @contextmanager
    def verified_session(_mt5, _account):
        yield account_spec

    def read_history(_mt5, _spec, _symbol, start, stop, *, limit, cursor, now):
        start_times.append(start)
        return {'trades': [deal()], 'nextCursor': None}

    class Store:
        root = Path('private')
        def append(self, _ctx, _envelope):
            return {'ok': False, 'code': 'STORE_UNAVAILABLE', 'lostCount': 1}

    monkeypatch.setattr(service.gateway, 'traced_session', verified_session)
    monkeypatch.setattr(service.broker_reads, 'trades_read', read_history)
    poller = service.DemoBrokerLifecycleCapture(Store(), object(), ['titan'],
                                                 clock=lambda: 1792088160.0)
    first = poller.poll_once()['titan']
    second = poller.poll_once()['titan']
    assert first['code'] == second['code'] == 'STORE_UNAVAILABLE'
    assert first['coverage'] == second['coverage'] == 'UNKNOWN'
    assert first['gapObserved'] and second['gapObserved']
    assert len(start_times) == 2 and start_times[0] == start_times[1]


def test_application_lifecycle_capture_requires_explicit_demo_allowlist(monkeypatch):
    from fastapi import FastAPI
    from chart_studio.evidence_api import install_evidence_routes
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', raising=False)

    class Store:
        root = Path('private-test-root')

    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS', 'titan,xau5m_m5')
    app = FastAPI()
    install_evidence_routes(app, store=Store(), mt5=object())
    assert app.state.evidence_deal_capture_service.accounts == ('titan', 'xau5m_m5')
    assert app.state.evidence_deal_capture_task is None


def test_application_rejects_funded_account_for_deal_capture(monkeypatch):
    from fastapi import FastAPI
    from chart_studio.evidence_api import install_evidence_routes
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', raising=False)

    class Store:
        root = Path('private-test-root')

    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS', 'blueberry')
    app = FastAPI()
    install_evidence_routes(app, store=Store(), mt5=object())
    assert app.state.evidence_deal_capture_service is None
    assert app.state.evidence_deal_capture_status == {'service': {'code': 'CONFIG_INVALID'}}


def test_capture_status_is_authenticated_and_limited_to_configured_demos(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from chart_studio.evidence_api import install_evidence_routes
    from dashboard_security import install_control_security
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', raising=False)

    class Store:
        root = Path('private-test-root')
        def gaps(self, _account=None):
            return []

    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS', 'titan,xau5m_m5')
    app = FastAPI()
    install_evidence_routes(app, store=Store(), mt5=object())
    app.state.evidence_deal_capture_status = {
        'titan': {'code': 'OK', 'coverage': 'ROLLING_WINDOW', 'appended': 2,
                  'duplicates': 3, 'rejected': 0, 'storeLostCount': 0,
                  'gapObserved': False, 'windowStartUtc': '2026-10-14T00:00:00.000000Z',
                  'snapshotCoverage':'ROLLING_WINDOW','snapshotsAppended':1,'snapshotDuplicates':0,
                  'snapshotUnavailable':0,'snapshotStoreLostCount':0},
        'xau5m_m5': {'code': 'BROKER_READ_UNAVAILABLE', 'coverage': 'UNKNOWN',
                     'detail': 'must not leak'},
    }
    unauthenticated = TestClient(app).get('/api/chart/v1/lifecycle/capture/status', params={'account': 'titan'})
    assert unauthenticated.status_code == 403
    secure_app = FastAPI()
    install_control_security(secure_app)
    install_evidence_routes(secure_app, store=Store(), mt5=object())
    secure_app.state.evidence_deal_capture_status = app.state.evidence_deal_capture_status
    client = TestClient(secure_app)
    allowed = client.get('/api/chart/v1/lifecycle/capture/status', params={'account': 'titan'})
    assert allowed.status_code == 200
    assert allowed.json()['status']['appended'] == 2
    assert allowed.json()['status']['snapshotsAppended'] == 1
    assert 'detail' not in allowed.json()['status']
    forbidden = client.get('/api/chart/v1/lifecycle/capture/status', params={'account': 'blueberry'})
    assert forbidden.status_code == 400


def test_decision_capture_status_is_authenticated_demo_scoped_and_redacted(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from chart_studio.evidence_api import install_evidence_routes
    from dashboard_security import install_control_security
    monkeypatch.delenv('CHART_STUDIO_EVIDENCE_SPOOL_ROOT', raising=False)

    class Store:
        root = Path('private-test-root')
        has_decision = False
        def gaps(self, account=None):
            return {'knownLossSinceStart':0,'lifetime':'PROCESS_ONLY','unrecordedHistory':True}
        def read(self, context, *, kind, limit):
            return {'records':[{}] if self.has_decision else []}

    app = FastAPI()
    install_evidence_routes(app, store=Store(), mt5=object())
    app.state.evidence_spool_status = {}
    unauthenticated = TestClient(app).get(
        '/api/chart/v1/decisions/capture/status', params={'account':'xau5m_m5'})
    assert unauthenticated.status_code == 403

    secure_app = FastAPI()
    install_control_security(secure_app)
    store = Store()
    install_evidence_routes(secure_app, store=store, mt5=object())
    secure_app.state.evidence_spool_status = {}
    client = TestClient(secure_app)
    unconfigured = client.get('/api/chart/v1/decisions/capture/status', params={'account':'xau5m_m5'})
    assert unconfigured.status_code == 200
    assert unconfigured.json()['status']['code'] == 'NOT_STARTED'
    secure_app.state.evidence_spool_service = object()
    not_started = client.get('/api/chart/v1/decisions/capture/status', params={'account':'xau5m_m5'})
    assert not_started.status_code == 200
    assert not_started.json()['status']['code'] == 'NOT_STARTED'
    secure_app.state.evidence_spool_status = {
        'titan_puprime250': {'code':'IDLE','imported':0,'duplicates':2,
                             'gapCount':1,'gapObserved':True,'storeLostCount':3,
                             'fileName':'private.ready.ndjson','cursorPath':'private.json'}
    }
    store.has_decision = True

    allowed = client.get('/api/chart/v1/decisions/capture/status', params={'account':'xau5m_m5'})
    assert allowed.status_code == 200
    assert allowed.json() == {
        'schemaVersion':1,'account':'xau5m_m5','canExecute':False,
        'status':{'code':'IDLE','imported':0,'duplicates':2,'gapCount':1,
                  'gapObserved':True,'storeLostCount':3,'recordingState':'RECORDED'}
    }
    marketplace = client.get('/api/chart/v1/decisions/capture/status', params={'account':'titan'})
    assert marketplace.status_code == 200
    assert marketplace.json()['status']['code'] == 'NOT_CONFIGURED'
    assert marketplace.json()['status']['recordingState'] == 'NOT_RECORDED'
    funded = client.get('/api/chart/v1/decisions/capture/status', params={'account':'blueberry'})
    assert funded.status_code == 403
    assert funded.json()['detail']['code'] == 'DEMO_ACCOUNT_REQUIRED'
    duplicate = client.get('/api/chart/v1/decisions/capture/status?account=xau5m_m5&account=titan_m5')
    assert duplicate.status_code == 422
