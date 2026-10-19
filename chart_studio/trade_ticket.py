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


TRADE_TICKET_COMMIT_DEMO_ACCOUNTS = frozenset({
    'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500',
})
TRADE_TICKET_PREVIEW_DEMO_ACCOUNTS = TRADE_TICKET_COMMIT_DEMO_ACCOUNTS | {'goldm15'}


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
        if (account not in TRADE_TICKET_PREVIEW_DEMO_ACCOUNTS or
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
                                          symbol=payload.symbol, now=self.clock())
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
                         if account in TRADE_TICKET_COMMIT_DEMO_ACCOUNTS
                         and isinstance(decision, dict) and decision.get('state') == 'ALLOW'
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


class TradeTicketCommitService:
    """One-shot pending-order commit with durable idempotency and readback."""

    def __init__(self, mt5, preview_registry, audit_store, guard_provider, *, now=None):
        self.mt5 = mt5
        self.previews = preview_registry
        self.store = audit_store
        self.guard = guard_provider
        self.clock = now or time.time

    @staticmethod
    def _error(status, code):
        return HTTPException(status, {'code': code, 'canExecute': False,
                                      'canCommit': False,
                                      'guard': {'state': 'UNKNOWN', 'source': 'NONE'}})

    def _guard(self, spec, request, account_info=None):
        evaluator = getattr(self.guard, 'evaluate', None)
        if not callable(evaluator):
            raise self._error(503, 'GUARD_UNAVAILABLE')
        try:
            decision = evaluator(spec=spec, accountInfo=account_info,
                                 action='NEW_PENDING_ENTRY',
                                 riskIncreasing=True, symbol=request['symbol'],
                                 order=request)
        except Exception as exc:
            raise self._error(503, 'GUARD_UNAVAILABLE') from exc
        if (not isinstance(decision, dict) or decision.get('state') != 'ALLOW' or
                decision.get('hardLock') is not False or
                not isinstance(decision.get('source'), str) or
                decision['source'] in ('', 'NONE')):
            raise self._error(403, 'GUARD_BLOCKED')
        return decision

    def _snapshot(self, spec, payload):
        info = reads.require_symbol(self.mt5, payload.symbol)
        reads.symbol_model(info, spec)
        observed = self.clock()
        quote = reads.quote_model(self.mt5.symbol_info_tick(payload.symbol), spec,
                                  symbol=payload.symbol, now=observed)
        age = observed * 1000 - quote['quoteTimeUtcMs']
        if quote.get('freshness') != 'FRESH' or not -1000 <= age <= 5000:
            raise self._error(503, 'QUOTE_NOT_FRESH')
        quote['ageMs'] = age
        return info, quote

    def _finish(self, principal, key, status, *, code=None, retcode=None,
                order_ticket=None, verified=False):
        result = {'status': status, 'verified': verified}
        if code is not None:
            result['code'] = code
        if type(retcode) is int:
            result['brokerRetcode'] = retcode
        if order_ticket is not None:
            result['orderTicket'] = str(order_ticket)
        return self.store.finish(principal, key, result)

    @staticmethod
    def _same_number(left, right):
        try:
            a, b = Decimal(str(left)), Decimal(str(right))
            return a.is_finite() and b.is_finite() and a == b
        except Exception:
            return False

    def commit(self, payload, identity, peer):
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                any(not isinstance(part, str) or not part.strip() for part in identity) or
                identity[2] != 'trade' or not isinstance(peer, str) or not peer.strip() or
                payload.userConfirmed is not True):
            raise self._error(403, 'IDENTITY_REQUIRED')
        config = gateway.ACCOUNTS.get(payload.account)
        if (payload.account not in {'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'} or
                not isinstance(config, dict) or config.get('is_demo') is not True or
                config.get('symbol') != payload.symbol):
            raise self._error(403, 'DEMO_ACCOUNT_REQUIRED')
        principal = identity[0] + ':' + identity[1]
        key = payload.idempotencyKey
        store_payload = {'account': payload.account, 'symbol': payload.symbol,
                         'previewId': payload.previewId,
                         'confirmationText': payload.confirmationText}
        try:
            reservation = self.store.reserve(principal, key, store_payload)
        except Exception as exc:
            raise self._error(503, 'BROKER_DATA_UNAVAILABLE') from exc
        if reservation.state == 'CONFLICT':
            raise self._error(409, 'PREVIEW_MISMATCH')
        if reservation.state != 'NEW':
            return reservation.result or {'status': reservation.state,
                                          'canCommit': False, 'canExecute': False}
        reserved, sent = True, False
        try:
            with gateway.traced_session(self.mt5, payload.account) as spec:
                account_info = gateway.verify_identity(self.mt5, spec)
                scope = {'identity': identity, 'peer': peer, 'account': payload.account,
                         'login': str(spec['login']), 'server': spec['server'],
                         'terminal': spec['terminal'], 'symbol': payload.symbol}
                _, quote = self._snapshot(spec, payload)
                try:
                    proposal = self.previews.consume(payload.previewId, scope)
                except HTTPException as exc:
                    raise self._error(410, 'PREVIEW_EXPIRED') from exc
                proposal_guard = proposal.get('guard') if isinstance(proposal, dict) else None
                if (not isinstance(proposal, dict) or proposal.get('scope') != scope or
                        proposal.get('account') != payload.account or
                        proposal.get('symbol') != payload.symbol or
                        not isinstance(proposal_guard, dict) or
                        proposal_guard.get('state') != 'ALLOW' or
                        not isinstance(proposal_guard.get('source'), str) or
                        proposal_guard['source'] in ('', 'NONE')):
                    raise self._error(409, 'PREVIEW_MISMATCH')
                order = proposal.get('request')
                if not isinstance(order, dict) or order.get('symbol') != payload.symbol:
                    raise self._error(409, 'PREVIEW_MISMATCH')
                reverse_types = {getattr(self.mt5, 'ORDER_TYPE_' + name, None): name
                                 for name in ('BUY_LIMIT', 'SELL_LIMIT', 'BUY_STOP', 'SELL_STOP')}
                order_type = reverse_types.get(order.get('type'))
                if order_type is None:
                    raise self._error(409, 'PREVIEW_MISMATCH')
                volume = order.get('volume')
                if (not isinstance(volume, (int, float)) or isinstance(volume, bool) or
                        not math.isfinite(volume)):
                    raise self._error(409, 'PREVIEW_MISMATCH')
                confirmation = f"{payload.account} {payload.symbol} {order_type} {format(Decimal(str(volume)).normalize(), 'f')}"
                if payload.confirmationText != confirmation:
                    raise self._error(422, 'PREVIEW_MISMATCH')

                def current_request():
                    current_account = gateway.verify_identity(self.mt5, spec)
                    info, fresh = self._snapshot(spec, payload)
                    built = build_pending_order_request(
                        self.mt5, info, symbol=payload.symbol, order_type=order_type,
                        volume=volume, entry=order.get('price'), stop=order.get('sl'),
                        target=order.get('tp'), bid=fresh['bid'], ask=fresh['ask'])
                    action = getattr(self.mt5, 'ORDER_TYPE_' + built['side'], None)
                    calculator = getattr(self.mt5, 'order_calc_margin', None)
                    profit_calc = getattr(self.mt5, 'order_calc_profit', None)
                    if type(action) is not int or not callable(calculator) or not callable(profit_calc):
                        raise self._error(503, 'BROKER_CALCULATION_UNAVAILABLE')
                    stop_pnl = profit_calc(action, payload.symbol,
                                           built['request']['volume'],
                                           built['request']['price'], built['request']['sl'])
                    target_pnl = profit_calc(action, payload.symbol,
                                             built['request']['volume'],
                                             built['request']['price'], built['request']['tp'])
                    margin = calculator(action, payload.symbol,
                                        built['request']['volume'], built['request']['price'])
                    free = reads.required(current_account, 'margin_free')
                    if (isinstance(margin, bool) or not isinstance(margin, (int, float)) or
                            not math.isfinite(margin) or margin < 0 or
                            isinstance(stop_pnl, bool) or not isinstance(stop_pnl, (int, float)) or
                            not math.isfinite(stop_pnl) or stop_pnl >= 0 or
                            isinstance(target_pnl, bool) or not isinstance(target_pnl, (int, float)) or
                            not math.isfinite(target_pnl) or target_pnl <= 0 or
                            isinstance(free, bool) or not isinstance(free, (int, float)) or
                            not math.isfinite(free) or margin > free):
                        raise self._error(422, 'INSUFFICIENT_FREE_MARGIN')
                    self._guard(spec, built['request'], current_account)
                    return built['request']

                request = current_request()
                check = getattr(self.mt5, 'order_check', None)
                if not callable(check):
                    raise self._error(503, 'BROKER_DATA_UNAVAILABLE')
                checked = check(dict(request))
                if checked is None or type(getattr(checked, 'retcode', None)) is not int or checked.retcode != 0:
                    retcode = getattr(checked, 'retcode', None)
                    self._finish(principal, key, 'BROKER_REJECTED', code='ORDER_CHECK_REJECTED',
                                 retcode=retcode if type(retcode) is int else None)
                    reserved = False
                    raise self._error(422, 'ORDER_CHECK_REJECTED')
                checked_request = dict(request)
                request = current_request()
                if request != checked_request:
                    raise self._error(409, 'ORDER_REQUEST_CHANGED')
                account_info = gateway.verify_identity(self.mt5, spec)
                send = getattr(self.mt5, 'order_send', None)
                if not callable(send):
                    raise self._error(503, 'BROKER_DATA_UNAVAILABLE')
                sent = True
                try:
                    response = send(request)
                except Exception:
                    result = self._finish(principal, key, 'UNKNOWN', code='BROKER_TIMEOUT')
                    reserved = False
                    return result
                retcode = getattr(response, 'retcode', None)
                placed = getattr(self.mt5, 'TRADE_RETCODE_PLACED', None)
                ticket = getattr(response, 'order', None)
                if type(retcode) is not int or retcode != placed or type(ticket) is not int or ticket <= 0:
                    ambiguous = {getattr(self.mt5, name, None) for name in
                                 ('TRADE_RETCODE_TIMEOUT', 'TRADE_RETCODE_CONNECTION')}
                    status = 'UNKNOWN' if type(retcode) is not int or retcode in ambiguous else 'BROKER_REJECTED'
                    result = self._finish(principal, key, status,
                                          code='BROKER_TIMEOUT' if status == 'UNKNOWN' else 'BROKER_REJECTED',
                                          retcode=retcode if type(retcode) is int else None)
                    reserved = False
                    return result
                get_orders = getattr(self.mt5, 'orders_get', None)
                try:
                    rows = get_orders(ticket=ticket) if callable(get_orders) else None
                    rows = list(rows) if rows is not None else []
                except Exception:
                    rows = []
                matching = [row for row in rows if getattr(row, 'ticket', None) == ticket]
                if len(matching) != 1:
                    result = self._finish(principal, key, 'UNKNOWN', code='READBACK_MISMATCH',
                                          retcode=retcode)
                    reserved = False
                    return result
                row = matching[0]
                valid = (getattr(row, 'symbol', None) == payload.symbol and
                         getattr(row, 'type', None) == request['type'] and
                         self._same_number(getattr(row, 'volume_current', None), request['volume']) and
                         self._same_number(getattr(row, 'price_open', None), request['price']) and
                         self._same_number(getattr(row, 'sl', None), request['sl']) and
                         self._same_number(getattr(row, 'tp', None), request['tp']))
                if not valid:
                    result = self._finish(principal, key, 'UNKNOWN', code='READBACK_MISMATCH',
                                          retcode=retcode)
                    reserved = False
                    return result
                result = self._finish(principal, key, 'PLACED', retcode=retcode,
                                      order_ticket=ticket, verified=True)
                reserved = False
                return result
        except HTTPException as exc:
            if reserved:
                detail = exc.detail if isinstance(exc.detail, dict) else {}
                code = detail.get('code')
                allowed = {'PREVIEW_EXPIRED', 'PREVIEW_MISMATCH', 'DEMO_ACCOUNT_REQUIRED',
                           'QUOTE_NOT_FRESH', 'GEOMETRY_INVALID', 'GUARD_BLOCKED',
                           'GUARD_UNAVAILABLE', 'BROKER_DATA_UNAVAILABLE',
                           'INSUFFICIENT_FREE_MARGIN', 'ORDER_CHECK_REJECTED',
                           'ORDER_REQUEST_CHANGED'}
                try:
                    self._finish(principal, key, 'UNKNOWN' if sent else 'BROKER_REJECTED',
                                 code='BROKER_TIMEOUT' if sent else code if code in allowed else 'BROKER_DATA_UNAVAILABLE')
                except Exception:
                    pass
            raise
        except Exception as exc:
            if reserved:
                try:
                    self._finish(principal, key, 'UNKNOWN' if sent else 'BROKER_REJECTED',
                                 code='BROKER_TIMEOUT' if sent else 'BROKER_DATA_UNAVAILABLE')
                except Exception:
                    pass
            raise self._error(503, 'BROKER_DATA_UNAVAILABLE') from exc
