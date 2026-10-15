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

    class Store:
        root = Path('private-test-root')

    monkeypatch.setenv('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS', 'blueberry')
    app = FastAPI()
    install_evidence_routes(app, store=Store(), mt5=object())
    assert app.state.evidence_deal_capture_service is None
    assert app.state.evidence_deal_capture_status == {'service': {'code': 'CONFIG_INVALID'}}
