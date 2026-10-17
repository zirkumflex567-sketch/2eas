import pytest
from fastapi import HTTPException
from contextlib import contextmanager
from types import SimpleNamespace

import account_gateway as gateway
import chart_studio.broker_reads as broker_reads

from chart_studio.trade_ticket import (
    TradeTicketError,
    TradeTicketPreviewRegistry,
    TradeTicketPreviewService,
    build_pending_order_request,
    validate_pending_order_geometry,
)


@pytest.mark.parametrize(('order_type', 'entry', 'reference', 'expected_distance'), [
    ('BUY_LIMIT', '99.4', '100.5', '1.1'),
    ('SELL_LIMIT', '100.6', '99.5', '1.1'),
    ('BUY_STOP', '101.5', '100.5', '1.0'),
    ('SELL_STOP', '98.5', '99.5', '1.0'),
])
def test_pending_order_geometry_measures_from_the_correct_quote_side(order_type, entry, reference, expected_distance):
    result = validate_pending_order_geometry(
        order_type=order_type, entry=entry, bid='99.5', ask='100.5',
        point='0.1', tick_size='0.1', stops_level=10,
    )
    assert result == {
        'state': 'VALID', 'referencePrice': reference,
        'distance': expected_distance, 'minimumDistance': '1.0',
    }


@pytest.mark.parametrize(('order_type', 'entry'), [
    ('BUY_LIMIT', '100.5'),
    ('SELL_LIMIT', '99.5'),
    ('BUY_STOP', '100.5'),
    ('SELL_STOP', '99.5'),
])
def test_pending_order_at_market_is_rejected(order_type, entry):
    with pytest.raises(TradeTicketError, match='PENDING_PRICE_WRONG_SIDE'):
        validate_pending_order_geometry(
            order_type=order_type, entry=entry, bid='99.5', ask='100.5',
            point='0.1', tick_size='0.1', stops_level=10,
        )


def test_pending_order_inside_broker_stops_distance_is_rejected():
    with pytest.raises(TradeTicketError, match='PENDING_STOPS_LEVEL'):
        validate_pending_order_geometry(
            order_type='BUY_STOP', entry='100.9', bid='99.5', ask='100.5',
            point='0.1', tick_size='0.1', stops_level=10,
        )


@pytest.mark.parametrize(('entry', 'tick'), [('100.05', '0.1'), ('NaN', '0.1'), ('101', '0')])
def test_pending_order_rejects_invalid_price_or_tick_grid(entry, tick):
    with pytest.raises(TradeTicketError, match='PENDING_'):
        validate_pending_order_geometry(
            order_type='BUY_STOP', entry=entry, bid='99.5', ask='100.5',
            point='0.1', tick_size=tick, stops_level=10,
        )


def test_unknown_order_type_and_invalid_stop_level_fail_closed():
    with pytest.raises(TradeTicketError, match='ORDER_TYPE_UNSUPPORTED'):
        validate_pending_order_geometry(
            order_type='MARKET', entry='101', bid='99.5', ask='100.5',
            point='0.1', tick_size='0.1', stops_level=10,
        )
    with pytest.raises(TradeTicketError, match='PENDING_STOPS_LEVEL_UNAVAILABLE'):
        validate_pending_order_geometry(
            order_type='BUY_STOP', entry='101', bid='99.5', ask='100.5',
            point='0.1', tick_size='0.1', stops_level=True,
        )


class MT5Constants:
    TRADE_ACTION_PENDING = 5
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TYPE_BUY_STOP = 4
    ORDER_TYPE_SELL_STOP = 5
    ORDER_FILLING_RETURN = 2
    ORDER_TIME_GTC = 0
    SYMBOL_TRADE_MODE_DISABLED = 0
    SYMBOL_TRADE_MODE_LONGONLY = 1
    SYMBOL_TRADE_MODE_SHORTONLY = 2
    SYMBOL_TRADE_MODE_CLOSEONLY = 3
    SYMBOL_TRADE_MODE_FULL = 4


class SymbolInfo:
    trade_tick_size = 0.1
    volume_min = 0.01
    volume_max = 10.0
    volume_step = 0.01
    trade_stops_level = 10
    point = 0.1
    order_mode = 2 | 4 | 16 | 32
    trade_mode = 4


VALID_PROPOSALS = {
    'BUY_LIMIT': {'volume': '0.01', 'entry': '99.4', 'stop': '98.0', 'target': '100.4'},
    'SELL_LIMIT': {'volume': '0.01', 'entry': '100.6', 'stop': '102.6', 'target': '99.6'},
    'BUY_STOP': {'volume': '0.01', 'entry': '101.5', 'stop': '100.5', 'target': '102.5'},
    'SELL_STOP': {'volume': '0.01', 'entry': '98.5', 'stop': '99.5', 'target': '97.5'},
}


@pytest.mark.parametrize(('order_type', 'expected'), [
    ('BUY_LIMIT', 2), ('SELL_LIMIT', 3), ('BUY_STOP', 4), ('SELL_STOP', 5),
])
def test_pending_order_request_uses_broker_type_and_return_policy(order_type, expected):
    request = build_pending_order_request(
        MT5Constants, SymbolInfo(), symbol='XAUUSD.p', order_type=order_type,
        **VALID_PROPOSALS[order_type], bid='99.5', ask='100.5',
    )
    broker_request = request['request']
    assert broker_request['action'] == MT5Constants.TRADE_ACTION_PENDING
    assert broker_request['type'] == expected
    assert broker_request['type_filling'] == MT5Constants.ORDER_FILLING_RETURN
    assert broker_request['type_time'] == MT5Constants.ORDER_TIME_GTC
    assert broker_request['symbol'] == 'XAUUSD.p'
    assert broker_request['volume'] == 0.01
    assert request['geometry']['state'] == 'VALID'


@pytest.mark.parametrize(('mode', 'order_type'), [
    (1 | 16 | 32, 'BUY_LIMIT'),
    (2 | 16 | 32, 'BUY_STOP'),
    (2 | 4, 'BUY_LIMIT'),
])
def test_pending_order_request_rejects_unsupported_symbol_order_mode(mode, order_type):
    info = SymbolInfo()
    info.order_mode = mode
    with pytest.raises(TradeTicketError, match='ORDER_MODE_UNSUPPORTED'):
        build_pending_order_request(
            MT5Constants, info, symbol='XAUUSD.p', order_type=order_type,
            **VALID_PROPOSALS[order_type], bid='99.5', ask='100.5',
        )


@pytest.mark.parametrize(('trade_mode', 'order_type'), [
    (1, 'SELL_LIMIT'), (2, 'BUY_STOP'), (3, 'BUY_LIMIT'), (0, 'SELL_STOP'),
])
def test_pending_order_request_rejects_disabled_direction(trade_mode, order_type):
    info = SymbolInfo()
    info.trade_mode = trade_mode
    with pytest.raises(TradeTicketError, match='TRADE_MODE_BLOCKED'):
        build_pending_order_request(
            MT5Constants, info, symbol='XAUUSD.p', order_type=order_type,
            **VALID_PROPOSALS[order_type], bid='99.5', ask='100.5',
        )


def test_ticket_preview_registry_is_scope_bound_and_consumed_once():
    registry = TradeTicketPreviewRegistry(monotonic=lambda: 10.0)
    scope = {'principal': ('proxy', 'operator', 'trade'), 'account': 'titan'}
    token = registry.issue(scope, {'order': {'symbol': 'XAUUSD.p'}})
    with pytest.raises(HTTPException) as mismatch:
        registry.consume(token, {'principal': ('proxy', 'other', 'trade'), 'account': 'titan'})
    assert getattr(mismatch.value, 'status_code', None) == 410
    assert registry.consume(token, scope) == {'order': {'symbol': 'XAUUSD.p'}}
    with pytest.raises(HTTPException) as replay:
        registry.consume(token, scope)
    assert getattr(replay.value, 'status_code', None) == 410


def test_ticket_preview_registry_expires_and_bounds_capacity():
    now = [1.0]
    registry = TradeTicketPreviewRegistry(monotonic=lambda: now[0], ttl_seconds=2, capacity=1)
    token = registry.issue('scope', {'proposal': 1})
    with pytest.raises(HTTPException) as full:
        registry.issue('other', {'proposal': 2})
    assert getattr(full.value, 'status_code', None) == 429
    now[0] = 4.0
    with pytest.raises(HTTPException) as expired:
        registry.consume(token, 'scope')
    assert getattr(expired.value, 'status_code', None) == 410
    assert registry.issue('other', {'proposal': 2})


class PreviewMT5(MT5Constants):
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1

    def __init__(self):
        self.sent = []
        self.info = SymbolInfo()
        self.info.name = 'XAUUSD'

    def symbol_info(self, _symbol):
        return self.info

    def symbol_info_tick(self, _symbol):
        return object()

    def order_calc_profit(self, action, _symbol, volume, entry, close):
        direction = 1 if action == self.ORDER_TYPE_BUY else -1
        return direction * (close - entry) * volume * 100

    def order_calc_margin(self, _action, _symbol, _volume, _price):
        return 100.0

    def order_send(self, request):
        self.sent.append(request)
        raise AssertionError('preview must never send an order')


def _preview_environment(monkeypatch, mt5, *, quote_state='FRESH', margin_free=5000.0,
                         guard_state='ALLOW', account_id='titan'):
    spec = {
        'id': account_id, 'login': 123456, 'server': 'DemoServer',
        'terminal': 'C:/MT5/terminal64.exe',
    }

    @contextmanager
    def session(_mt5, _account):
        yield spec

    monkeypatch.setattr(gateway, 'traced_session', session)
    monkeypatch.setattr(gateway, 'verify_identity', lambda *_: SimpleNamespace(
        currency='USD', margin_free=margin_free, equity=10000.0,
    ))
    monkeypatch.setattr(broker_reads, 'require_symbol', lambda *_: mt5.info)
    monkeypatch.setattr(broker_reads, 'symbol_model', lambda _row, _spec: {
        'source': 'MT5_VERIFIED', 'account': account_id, 'symbol': 'XAUUSD',
    })
    monkeypatch.setattr(broker_reads, 'quote_model', lambda *_args, **_kwargs: {
        'account': account_id, 'symbol': 'XAUUSD', 'freshness': quote_state,
        'bid': '99.5', 'ask': '100.5', 'quoteTimeUtc': '2026-10-17T03:00:00Z',
        'ageSeconds': 0.2,
    })

    class Guard:
        def evaluate(self, **_kwargs):
            if guard_state is None:
                raise RuntimeError('no authoritative guard')
            return {'state': guard_state, 'hardLock': False, 'source': 'TEST_GUARD'}

    return spec, Guard() if guard_state is not None else None


def test_preview_service_uses_verified_fresh_quote_broker_math_and_never_sends(monkeypatch):
    mt5 = PreviewMT5()
    spec, guard = _preview_environment(monkeypatch, mt5)
    registry = TradeTicketPreviewRegistry(monotonic=lambda: 1.0)
    service = TradeTicketPreviewService(mt5, registry, guard, now=lambda: 100.0)
    request = SimpleNamespace(account='titan', symbol='XAUUSD', orderType='BUY_LIMIT',
                              volumeLots=0.01, entryPrice=99.4, slPrice=98.0, tpPrice=100.4)
    result = service.preview(request, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert result['status'] == 'READY_FOR_CONFIRMATION'
    assert result['canExecute'] is False
    assert result['canCommit'] is True
    assert result['brokerRisk']['pnlAtSl'] == -1.4
    assert result['brokerRisk']['pnlAtTp'] == 1.0
    assert result['brokerRisk']['margin'] == 100.0
    assert result['order']['type'] == MT5Constants.ORDER_TYPE_BUY_LIMIT
    assert result['previewId'] in registry.items
    assert mt5.sent == []


def test_preview_service_never_issues_commit_token_without_authoritative_guard(monkeypatch):
    mt5 = PreviewMT5()
    _spec, guard = _preview_environment(monkeypatch, mt5, guard_state=None)
    registry = TradeTicketPreviewRegistry(monotonic=lambda: 1.0)
    service = TradeTicketPreviewService(mt5, registry, guard, now=lambda: 100.0)
    request = SimpleNamespace(account='titan', symbol='XAUUSD', orderType='BUY_LIMIT',
                              volumeLots=0.01, entryPrice=99.4, slPrice=98.0, tpPrice=100.4)
    result = service.preview(request, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert result['status'] == 'PREVIEW_ONLY'
    assert result['canCommit'] is False
    assert result['guard'] == {'state': 'UNKNOWN', 'source': 'NONE'}
    assert 'previewId' not in result
    assert registry.items == {}
    assert mt5.sent == []


def test_preview_service_rejects_stale_quote_before_calculation(monkeypatch):
    mt5 = PreviewMT5()
    _spec, guard = _preview_environment(monkeypatch, mt5, quote_state='STALE')
    service = TradeTicketPreviewService(mt5, TradeTicketPreviewRegistry(), guard, now=lambda: 100.0)
    request = SimpleNamespace(account='titan', symbol='XAUUSD', orderType='BUY_LIMIT',
                              volumeLots=0.01, entryPrice=99.4, slPrice=98.0, tpPrice=100.4)
    with pytest.raises(HTTPException) as stale:
        service.preview(request, ('proxy', 'operator', 'trade'), '203.0.113.5')
    assert stale.value.status_code == 503
    assert stale.value.detail['code'] == 'QUOTE_NOT_FRESH'
    assert mt5.sent == []
