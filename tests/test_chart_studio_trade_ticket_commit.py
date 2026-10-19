from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from chart_studio.trade_ticket import TradeTicketCommitService, TradeTicketPreviewRegistry, TradeTicketPreviewService
from chart_studio.trade_ticket_store import TradeTicketCommitStore
from test_chart_studio_trade_ticket import PreviewMT5, _preview_environment
import chart_studio.broker_reads as broker_reads


def _services(monkeypatch, tmp_path):
    mt5 = PreviewMT5()
    spec, guard = _preview_environment(monkeypatch, mt5)
    mt5.TRADE_RETCODE_PLACED = 10008
    mt5.order_check = lambda request: SimpleNamespace(retcode=0)
    def order_send(request):
        mt5.sent.append(request)
        return SimpleNamespace(retcode=10008, order=12345)
    mt5.order_send = order_send
    mt5.orders_get = lambda **kwargs: [SimpleNamespace(
        ticket=12345, symbol='XAUUSD', type=mt5.ORDER_TYPE_BUY_LIMIT,
        volume_current=0.01, price_open=99.4, sl=98.0, tp=100.4,
    )] if kwargs.get('ticket') == 12345 else []
    quote_model = broker_reads.quote_model
    monkeypatch.setattr(broker_reads, 'quote_model', lambda *args, **kwargs: {
        **quote_model(*args, **kwargs), 'quoteTimeUtcMs': 100000,
    })
    registry = TradeTicketPreviewRegistry()
    guard = guard
    preview = TradeTicketPreviewService(mt5, registry, guard, now=lambda: 100.0)
    store = TradeTicketCommitStore(tmp_path / 'private' / 'tickets.sqlite3',
                                   checkout_root=tmp_path / 'checkout')
    commit = TradeTicketCommitService(mt5, registry, store, guard, now=lambda: 100.0)
    return mt5, preview, commit


def _make_preview(preview):
    request = SimpleNamespace(account='titan', symbol='XAUUSD', orderType='BUY_LIMIT',
                              volumeLots=0.01, entryPrice=99.4, slPrice=98.0, tpPrice=100.4)
    return preview.preview(request, ('proxy', 'operator', 'trade'), '203.0.113.5')


def _commit_payload(preview_id, *, key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', text='titan XAUUSD BUY_LIMIT 0.01'):
    return SimpleNamespace(account='titan', symbol='XAUUSD', previewId=preview_id,
                           userConfirmed=True, confirmationText=text, idempotencyKey=key)


def test_ticket_commit_checks_and_sends_once_then_verifies_exact_pending_order(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    proposal = _make_preview(preview)
    result = commit.commit(_commit_payload(proposal['previewId']),
                           ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert result == {'status': 'PLACED', 'brokerRetcode': 10008,
                      'orderTicket': '12345', 'verified': True}
    assert len(mt5.sent) == 1
    assert mt5.sent[0]['action'] == mt5.TRADE_ACTION_PENDING


def test_ticket_commit_replay_returns_saved_result_without_second_send(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    proposal = _make_preview(preview)
    payload = _commit_payload(proposal['previewId'])
    first = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    second = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert first == second
    assert len(mt5.sent) == 1


def test_ticket_commit_rejects_unknown_guard_before_broker_send(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    preview.guard = None
    commit.guard = None
    proposal = _make_preview(preview)
    assert proposal['canCommit'] is False
    assert 'previewId' not in proposal
    with pytest.raises(HTTPException) as blocked:
        commit._guard({'id': 'titan'}, {'symbol': 'XAUUSD'})
    assert blocked.value.status_code == 503
    assert mt5.sent == []


def test_ticket_commit_wrong_typed_confirmation_never_sends(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    proposal = _make_preview(preview)
    with pytest.raises(HTTPException):
        commit.commit(_commit_payload(proposal['previewId'], text='titan XAUUSD BUY 0.01'),
                      ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert mt5.sent == []


def test_ticket_commit_order_check_rejection_is_terminal_and_never_sends(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    mt5.order_check = lambda _request: SimpleNamespace(retcode=10016)
    proposal = _make_preview(preview)
    with pytest.raises(HTTPException) as rejected:
        commit.commit(_commit_payload(proposal['previewId']),
                      ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert rejected.value.status_code == 422
    assert mt5.sent == []


def test_ticket_commit_rejects_request_changed_after_order_check(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    checked_requests = []

    def order_check(request):
        checked_requests.append(dict(request))
        # Simulate broker metadata changing after preflight. The rebuilt request
        # would use this different filling policy if it were sent unchecked.
        mt5.ORDER_FILLING_RETURN = 7
        return SimpleNamespace(retcode=0)

    mt5.order_check = order_check
    proposal = _make_preview(preview)
    with pytest.raises(HTTPException) as changed:
        commit.commit(_commit_payload(proposal['previewId']),
                      ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert changed.value.status_code == 409
    assert changed.value.detail['code'] == 'ORDER_REQUEST_CHANGED'
    assert len(checked_requests) == 1
    assert mt5.sent == []


def test_ticket_commit_ambiguous_send_is_unknown_and_never_retried(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    def timeout(_request):
        mt5.sent.append(_request)
        raise TimeoutError('ambiguous broker response')
    mt5.order_send = timeout
    proposal = _make_preview(preview)
    payload = _commit_payload(proposal['previewId'])
    result = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    replay = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert result['status'] == replay['status'] == 'UNKNOWN'
    assert len(mt5.sent) == 1


def test_ticket_commit_mismatched_readback_is_unknown_without_retry(monkeypatch, tmp_path):
    mt5, preview, commit = _services(monkeypatch, tmp_path)
    mt5.orders_get = lambda **_kwargs: [SimpleNamespace(
        ticket=12345, symbol='XAUUSD', type=mt5.ORDER_TYPE_BUY_LIMIT,
        volume_current=0.01, price_open=99.4, sl=98.0, tp=100.5,
    )]
    proposal = _make_preview(preview)
    payload = _commit_payload(proposal['previewId'])
    result = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    replay = commit.commit(payload, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert result['status'] == replay['status'] == 'UNKNOWN'
    assert len(mt5.sent) == 1
