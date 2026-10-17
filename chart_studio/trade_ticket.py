"""Pure safety rules for chart-originated MT5 pending-order tickets."""
from decimal import Decimal, InvalidOperation


class TradeTicketError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


_REFERENCES = {
    'BUY_LIMIT': ('ask', -1),
    'SELL_LIMIT': ('bid', 1),
    'BUY_STOP': ('ask', 1),
    'SELL_STOP': ('bid', -1),
}


def _positive(value, code):
    if isinstance(value, bool) or value is None:
        raise TradeTicketError(code)
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise TradeTicketError(code) from None
    if not number.is_finite() or number <= 0:
        raise TradeTicketError(code)
    return number


def _text(number):
    return format(number, 'f')


def validate_pending_order_geometry(*, order_type, entry, bid, ask, point,
                                    tick_size, stops_level):
    """Validate a pending price against the correct side of one fresh quote.

    The caller remains responsible for quote freshness, account/symbol identity,
    SL/TP validation, MT5 order_check, and the independent guard. This helper is
    deliberately pure and never implies that an order can be sent.
    """
    rule = _REFERENCES.get(order_type) if isinstance(order_type, str) else None
    if rule is None:
        raise TradeTicketError('ORDER_TYPE_UNSUPPORTED')
    if type(stops_level) is not int or not 0 <= stops_level <= 2_147_483_647:
        raise TradeTicketError('PENDING_STOPS_LEVEL_UNAVAILABLE')
    price = _positive(entry, 'PENDING_PRICE_INVALID')
    bid_value = _positive(bid, 'PENDING_QUOTE_INVALID')
    ask_value = _positive(ask, 'PENDING_QUOTE_INVALID')
    point_value = _positive(point, 'PENDING_POINT_INVALID')
    tick_value = _positive(tick_size, 'PENDING_TICK_SIZE_INVALID')
    if ask_value < bid_value:
        raise TradeTicketError('PENDING_QUOTE_INVALID')
    if price % tick_value:
        raise TradeTicketError('PENDING_PRICE_OFF_GRID')

    quote_side, direction = rule
    reference = ask_value if quote_side == 'ask' else bid_value
    distance = (price - reference) * direction
    if distance <= 0:
        raise TradeTicketError('PENDING_PRICE_WRONG_SIDE')
    minimum = point_value * stops_level
    if distance < minimum:
        raise TradeTicketError('PENDING_STOPS_LEVEL')
    return {
        'state': 'VALID',
        'referencePrice': _text(reference),
        'distance': _text(distance),
        'minimumDistance': _text(minimum),
    }
