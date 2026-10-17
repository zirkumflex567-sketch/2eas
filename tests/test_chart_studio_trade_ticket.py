import pytest

from chart_studio.trade_ticket import TradeTicketError, validate_pending_order_geometry


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
