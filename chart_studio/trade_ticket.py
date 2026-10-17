"""Pure safety rules for chart-originated MT5 pending-order tickets."""
import copy
import secrets
import threading
import time
from decimal import Decimal, InvalidOperation
import math

from fastapi import HTTPException

import account_gateway as gateway
from chart_studio import broker_reads as reads
from chart_studio.money import PreviewError, validate_plan
from chart_studio.position_preview import actual_number


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


class TradeTicketPreviewRegistry:
    """Bounded, short-lived, single-use registry for server-side proposals."""

    def __init__(self, *, monotonic=time.monotonic, ttl_seconds=60, capacity=256):
        if type(ttl_seconds) is not int or not 1 <= ttl_seconds <= 120:
            raise ValueError('Preview TTL must be between 1 and 120 seconds')
        if type(capacity) is not int or not 1 <= capacity <= 4096:
            raise ValueError('Preview capacity must be between 1 and 4096')
        self.clock = monotonic
        self.ttl = ttl_seconds
        self.capacity = capacity
        self.lock = threading.RLock()
        self.items = {}

    def issue(self, scope, proposal):
        with self.lock:
            now = self.clock()
            self.items = {key: value for key, value in self.items.items() if value[0] > now}
            if len(self.items) >= self.capacity:
                raise HTTPException(429, {
                    'code': 'TICKET_PREVIEW_CAPACITY', 'canExecute': False,
                    'canCommit': False,
                })
            token = secrets.token_urlsafe(32)
            self.items[token] = (now + self.ttl, copy.deepcopy(scope),
                                 copy.deepcopy(proposal))
            return token

    def consume(self, token, scope):
        with self.lock:
            item = self.items.get(token)
            if item is None or item[0] <= self.clock() or item[1] != scope:
                raise HTTPException(410, {
                    'code': 'TICKET_PREVIEW_EXPIRED', 'canExecute': False,
                    'canCommit': False,
                })
            del self.items[token]
            return copy.deepcopy(item[2])


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


def build_pending_order_request(mt5, symbol_info, *, symbol, order_type,
                                volume, entry, stop, target, bid, ask):
    """Build a broker-shaped pending request after fail-closed rule checks.

    This is a pure request builder. It does not call `order_check` or `order_send`.
    The pending-order and SL/TP mode flags follow the MQL5 symbol order-mode
    bitmask. Pending requests use MT5's RETURN filling policy and GTC lifetime.
    """
    rule = _REFERENCES.get(order_type) if isinstance(order_type, str) else None
    if rule is None:
        raise TradeTicketError('ORDER_TYPE_UNSUPPORTED')
    side = 'BUY' if order_type.startswith('BUY_') else 'SELL'
    try:
        volume, entry, stop, target = (
            float(_positive(volume, 'PENDING_VOLUME_INVALID')),
            float(_positive(entry, 'PENDING_PRICE_INVALID')),
            float(_positive(stop, 'PENDING_SL_INVALID')),
            float(_positive(target, 'PENDING_TP_INVALID')),
        )
    except OverflowError:
        raise TradeTicketError('PENDING_PRICE_INVALID') from None
    if not all(math.isfinite(value) for value in (volume, entry, stop, target)):
        raise TradeTicketError('PENDING_PRICE_INVALID')
    try:
        volume, entry, stop, target = validate_plan(
            side=side, volume=volume, entry=entry, stop=stop, target=target,
            info=symbol_info,
        )
    except PreviewError as exc:
        raise TradeTicketError(exc.code) from exc

    geometry = validate_pending_order_geometry(
        order_type=order_type, entry=entry, bid=bid, ask=ask,
        point=getattr(symbol_info, 'point', None),
        tick_size=getattr(symbol_info, 'trade_tick_size', None),
        stops_level=getattr(symbol_info, 'trade_stops_level', None),
    )
    order_mode = getattr(symbol_info, 'order_mode', None)
    if type(order_mode) is not int or order_mode < 0:
        raise TradeTicketError('ORDER_MODE_UNAVAILABLE')
    pending_mask = 2 if order_type.endswith('_LIMIT') else 4
    if not order_mode & pending_mask or not order_mode & 16 or not order_mode & 32:
        raise TradeTicketError('ORDER_MODE_UNSUPPORTED')

    trade_mode = getattr(symbol_info, 'trade_mode', None)
    full = getattr(mt5, 'SYMBOL_TRADE_MODE_FULL', None)
    long_only = getattr(mt5, 'SYMBOL_TRADE_MODE_LONGONLY', None)
    short_only = getattr(mt5, 'SYMBOL_TRADE_MODE_SHORTONLY', None)
    close_only = getattr(mt5, 'SYMBOL_TRADE_MODE_CLOSEONLY', None)
    disabled = getattr(mt5, 'SYMBOL_TRADE_MODE_DISABLED', None)
    if type(trade_mode) is not int or any(type(v) is not int for v in
            (full, long_only, short_only, close_only, disabled)):
        raise TradeTicketError('TRADE_MODE_UNAVAILABLE')
    if (trade_mode == disabled or trade_mode == close_only or
            (trade_mode == long_only and side != 'BUY') or
            (trade_mode == short_only and side != 'SELL') or
            trade_mode not in {disabled, long_only, short_only, close_only, full}):
        raise TradeTicketError('TRADE_MODE_BLOCKED')

    mt5_order_type = getattr(mt5, 'ORDER_TYPE_' + order_type, None)
    action = getattr(mt5, 'TRADE_ACTION_PENDING', None)
    filling = getattr(mt5, 'ORDER_FILLING_RETURN', None)
    time_type = getattr(mt5, 'ORDER_TIME_GTC', None)
    if any(type(value) is not int for value in
           (mt5_order_type, action, filling, time_type)):
        raise TradeTicketError('BROKER_ORDER_CONSTANTS_UNAVAILABLE')

    request = {
        'action': action,
        'symbol': symbol,
        'volume': volume,
        'type': mt5_order_type,
        'price': entry,
        'sl': stop,
        'tp': target,
        'type_filling': filling,
        'type_time': time_type,
    }
    return {'request': request, 'side': side, 'geometry': geometry}


class TradeTicketPreviewService:
    """Read-only MT5 pending-order preview; it has no order mutation path."""

    def __init__(self, mt5, previews, guard_provider, *, now=None):
        self.mt5 = mt5
        self.previews = previews
        self.guard = guard_provider
        self.clock = now or time.time

    @staticmethod
    def _error(status, code):
        return HTTPException(status, {'code': code, 'canExecute': False,
                                      'canCommit': False,
                                      'guard': {'state': 'UNKNOWN', 'source': 'NONE'}})

    def preview(self, payload, identity, peer):
        account = payload.account
        config = gateway.ACCOUNTS.get(account)
        if (account not in {'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'} or
                not isinstance(config, dict) or config.get('is_demo') is not True or
                payload.symbol != config.get('symbol')):
            raise self._error(403, 'DEMO_ACCOUNT_REQUIRED')
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                any(not isinstance(part, str) or not part.strip() for part in identity) or
                identity[2] != 'trade' or not isinstance(peer, str) or not peer.strip()):
            raise self._error(403, 'IDENTITY_REQUIRED')
        try:
            with gateway.traced_session(self.mt5, account) as spec:
                account_info = gateway.verify_identity(self.mt5, spec)
                metadata = reads.require_symbol(self.mt5, payload.symbol)
                reads.symbol_model(metadata, spec)
                quote = reads.quote_model(self.mt5.symbol_info_tick(payload.symbol), spec,
                                          now=self.clock())
                if quote.get('freshness') != 'FRESH':
                    raise self._error(503, 'QUOTE_NOT_FRESH')
                built = build_pending_order_request(
                    self.mt5, metadata, symbol=payload.symbol,
                    order_type=payload.orderType, volume=payload.volumeLots,
                    entry=payload.entryPrice, stop=payload.slPrice,
                    target=payload.tpPrice, bid=quote['bid'], ask=quote['ask'])
                request = built['request']
                action = getattr(self.mt5, 'ORDER_TYPE_' + built['side'], None)
                if type(action) is not int:
                    raise self._error(503, 'BROKER_CALCULATION_UNAVAILABLE')
                calc_profit = getattr(self.mt5, 'order_calc_profit', None)
                calc_margin = getattr(self.mt5, 'order_calc_margin', None)
                if not callable(calc_profit) or not callable(calc_margin):
                    raise self._error(503, 'BROKER_CALCULATION_UNAVAILABLE')
                values = {}
                for label, close in (('pnlAtSl', request['sl']),
                                     ('pnlAtTp', request['tp'])):
                    value = calc_profit(action, payload.symbol, request['volume'],
                                        request['price'], close)
                    if (isinstance(value, bool) or not isinstance(value, (int, float)) or
                            not math.isfinite(value)):
                        raise self._error(503, 'BROKER_CALCULATION_UNAVAILABLE')
                    values[label] = round(float(value), 2)
                if values['pnlAtSl'] >= 0 or values['pnlAtTp'] <= 0:
                    raise self._error(503, 'BROKER_CALCULATION_INVALID')
                margin = calc_margin(action, payload.symbol, request['volume'], request['price'])
                if isinstance(margin, bool) or not isinstance(margin, (int, float)) or not math.isfinite(margin) or margin < 0:
                    raise self._error(503, 'BROKER_CALCULATION_UNAVAILABLE')
                currency = reads.text(reads.required(account_info, 'currency'))
                free_margin = actual_number(reads.required(account_info, 'margin_free'), maximum=Decimal('1e15'))
                margin_value = Decimal(str(margin))
                if not margin_value.is_finite() or margin_value > free_margin:
                    raise self._error(422, 'INSUFFICIENT_FREE_MARGIN')
                evaluator = getattr(self.guard, 'evaluate', None)
                decision = None
                if callable(evaluator):
                    try:
                        decision = evaluator(spec=spec, action='NEW_PENDING_ENTRY',
                                             riskIncreasing=True, symbol=payload.symbol,
                                             order=request, accountInfo=account_info)
                    except Exception:
                        decision = None
                guard = ({'state': 'ALLOW', 'source': decision['source']}
                         if isinstance(decision, dict) and decision.get('state') == 'ALLOW'
                         and decision.get('hardLock') is False
                         and isinstance(decision.get('source'), str)
                         and decision['source'] not in ('', 'NONE')
                         else {'state': 'UNKNOWN', 'source': 'NONE'})
                scope = {'identity': identity, 'peer': peer, 'account': account,
                         'login': str(spec['login']), 'server': spec['server'],
                         'terminal': spec['terminal'], 'symbol': payload.symbol}
                proposal = {'request': request, 'scope': scope,
                            'guard': guard, 'account': account, 'symbol': payload.symbol}
                result = {
                    'status': 'READY_FOR_CONFIRMATION' if guard['state'] == 'ALLOW' else 'PREVIEW_ONLY',
                    'account': account, 'symbol': payload.symbol,
                    'order': {'type': request['type'], 'orderType': payload.orderType,
                              'volumeLots': request['volume'], 'entryPrice': request['price'],
                              'slPrice': request['sl'], 'tpPrice': request['tp'],
                              'geometry': built['geometry']},
                    'brokerRisk': {**values, 'margin': round(float(margin), 2),
                                   'freeMargin': float(free_margin), 'currency': currency},
                    'quote': {'bid': quote['bid'], 'ask': quote['ask'],
                              'timeUtc': quote['quoteTimeUtc'], 'ageSeconds': quote['ageSeconds']},
                    'guard': guard, 'canExecute': False,
                    'canCommit': guard['state'] == 'ALLOW',
                }
                if result['canCommit']:
                    result['previewId'] = self.previews.issue(scope, proposal)
                return result
        except HTTPException:
            raise
        except TradeTicketError as exc:
            raise self._error(422, exc.code) from exc
        except PreviewError as exc:
            raise self._error(422, exc.code) from exc
        except Exception as exc:
            raise self._error(503, 'BROKER_DATA_UNAVAILABLE') from exc
