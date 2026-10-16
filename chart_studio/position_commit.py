"""Server-side stop commit orchestration. Production wiring stays disabled."""
from decimal import Decimal, localcontext
import time
from fastapi import HTTPException

import account_gateway as gateway
from chart_studio import broker_reads as reads
from chart_studio.position_preview import actual_number, geometry, scope_hash

DEMO_COMMIT_ACCOUNTS = frozenset({'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'})


class PositionCommitService:
    def __init__(self, mt5, preview_registry, audit_store, guard_provider, *, now=None):
        self.mt5 = mt5
        self.previews = preview_registry
        self.store = audit_store
        self.guard = guard_provider
        self.clock = now or time.time

    @staticmethod
    def _error(status, code):
        return HTTPException(status, {'code': code, 'canExecute': False, 'canCommit': False,
                                      'guard': {'state': 'UNKNOWN', 'source': 'NONE'}})

    def _snapshot(self, spec, symbol, ticket):
        book = reads.positions_read(self.mt5, spec, symbol, now=self.clock())
        matches = [row for row in book['positions'] if row['ticket'] == ticket]
        if len(matches) != 1:
            raise self._error(404 if not matches else 503,
                              'POSITION_NOT_FOUND' if not matches else 'BROKER_DATA_UNAVAILABLE')
        observed = self.clock()
        quote = reads.quote_model(self.mt5.symbol_info_tick(symbol), spec, now=observed)
        age = observed * 1000 - quote['quoteTimeUtcMs']
        if not -500 <= age <= 5000:
            raise self._error(503, 'QUOTE_NOT_FRESH')
        actual_number(Decimal(quote['bid']))
        actual_number(Decimal(quote['ask']))
        quote.update(ageMs=age)
        return matches[0], quote

    def _guard(self, spec, position, changes):
        evaluator = getattr(self.guard, 'evaluate', None)
        if not callable(evaluator):
            raise self._error(503, 'GUARD_UNAVAILABLE')
        increasing = False
        if 'slPrice' in changes:
            proposed = changes['slPrice']
            old = position['sl']
            if proposed is None:
                increasing = old is not None
            elif old is None:
                increasing = False
            elif position['side'] == 'BUY':
                increasing = Decimal(proposed) < Decimal(old)
            else:
                increasing = Decimal(proposed) > Decimal(old)
        if 'tpPrice' in changes:
            proposed = changes['tpPrice']
            old = position['tp']
            if proposed is None:
                increasing = increasing or old is not None
            elif old is not None:
                if position['side'] == 'BUY':
                    increasing = increasing or Decimal(proposed) > Decimal(old)
                else:
                    increasing = increasing or Decimal(proposed) < Decimal(old)
        action = 'RISK_INCREASING_PROTECTION' if increasing else 'RISK_REDUCING_PROTECTION'
        try:
            decision = evaluator(spec=spec, position=position, action=action,
                                riskIncreasing=increasing, changes=dict(changes))
        except Exception as exc:
            raise self._error(503, 'GUARD_UNAVAILABLE') from exc
        if (not isinstance(decision, dict) or decision.get('state') != 'ALLOW' or
                decision.get('hardLock') is not False or
                not isinstance(decision.get('source'), str) or
                not decision['source'] or decision['source'] == 'NONE'):
            raise self._error(403, 'GUARD_BLOCKED')
        return decision

    @staticmethod
    def _same_price(left, right):
        if left is None or right is None:
            return left is None and right is None
        return Decimal(str(left)) == Decimal(str(right))

    def _finish(self, principal, key, status, *, code=None, retcode=None,
                revision=None, sl=None, tp=None, verified=False):
        result = {'status': status, 'verified': verified}
        if code is not None: result['code'] = code
        if retcode is not None and type(retcode) is int: result['brokerRetcode'] = retcode
        if revision is not None: result['positionRevision'] = revision
        if sl is not ...: result['slPrice'] = sl
        if tp is not ...: result['tpPrice'] = tp
        return self.store.finish(principal, key, result)

    def commit(self, payload, identity, peer):
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                any(not isinstance(part, str) for part in identity) or identity[2] != 'trade' or
                not isinstance(peer, str) or not peer or payload.userConfirmed is not True):
            raise self._error(403, 'IDENTITY_REQUIRED')
        if (payload.account not in DEMO_COMMIT_ACCOUNTS or
                payload.account not in gateway.ACCOUNTS or
                gateway.ACCOUNTS[payload.account].get('is_demo') is not True or
                payload.symbol != gateway.ACCOUNTS[payload.account].get('symbol')):
            raise self._error(403, 'DEMO_ACCOUNT_REQUIRED')
        principal = identity[0] + ':' + identity[1]
        key = payload.idempotencyKey
        store_payload = {'account': payload.account, 'symbol': payload.symbol,
                         'ticket': payload.positionTicket, 'revision': payload.expectedRevision,
                         'previewId': payload.previewId}
        reservation = self.store.reserve(principal, key, store_payload)
        if reservation.state == 'CONFLICT':
            raise self._error(409, 'IDEMPOTENCY_CONFLICT')
        if reservation.state != 'NEW':
            return reservation.result or {'status': reservation.state,
                                          'canCommit': False, 'canExecute': False}
        reserved, sent = True, False
        try:
            spec_hint = gateway.ACCOUNTS[payload.account]
            scope = scope_hash(identity, peer, spec_hint, payload.symbol,
                               payload.positionTicket, payload.expectedRevision)
            try:
                preview = self.previews.lookup(payload.previewId, scope)
            except HTTPException as exc:
                raise self._error(410, 'PREVIEW_EXPIRED') from exc
            if (preview.get('valid') is not True or
                    preview.get('positionRevision') != payload.expectedRevision or
                    preview.get('account') != payload.account or
                    preview.get('symbol') != payload.symbol or
                    preview.get('positionTicket') != payload.positionTicket or
                    not isinstance(preview.get('brokerPreview'), dict) or
                    set(preview['brokerPreview']) != {'slPrice', 'tpPrice'}):
                raise self._error(409, 'PREVIEW_MISMATCH')
            proposed = preview['brokerPreview']
            with localcontext() as context:
                context.prec = 64
                with gateway.traced_session(self.mt5, payload.account) as spec:
                    gateway.verify_identity(self.mt5, spec)
                    position, quote = self._snapshot(spec, payload.symbol, payload.positionTicket)
                    if position['revision'] != payload.expectedRevision:
                        raise self._error(409, 'POSITION_CHANGED')
                    candidate = {}
                    for leg in ('sl', 'tp'):
                        value = proposed[leg + 'Price']
                        if not self._same_price(position[leg], value):
                            candidate[leg + 'Price'] = value
                    if not candidate:
                        raise self._error(422, 'NO_CHANGE')
                    metadata = reads.require_symbol(self.mt5, payload.symbol)
                    reads.symbol_model(metadata, spec)
                    final, reasons, _ = geometry(position, candidate, metadata, quote)
                    if reasons:
                        raise self._error(422, 'GEOMETRY_INVALID')
                    self._guard(spec, position, candidate)
                    # Consume only after the exact scoped proposal and first guard pass.
                    self.previews.consume(payload.previewId, scope)
                    names = ('point', 'trade_tick_size', 'volume_step', 'trade_stops_level',
                             'trade_freeze_level', 'trade_mode', 'order_mode')
                    original_revision = position['revision']
                    original_metadata = tuple(getattr(metadata, name, None) for name in names)
                    check_request = {'action': getattr(self.mt5, 'TRADE_ACTION_SLTP', None),
                                     'position': int(payload.positionTicket), 'symbol': payload.symbol,
                                     'sl': float(final['sl']) if final['sl'] is not None else 0.0,
                                     'tp': float(final['tp']) if final['tp'] is not None else 0.0}
                    if check_request['action'] is None:
                        raise self._error(503, 'BROKER_DATA_UNAVAILABLE')
                    check_fn = getattr(self.mt5, 'order_check', None)
                    if callable(check_fn):
                        checked = check_fn(check_request)
                        if checked is None or type(getattr(checked, 'retcode', None)) is not int or checked.retcode != 0:
                            check_retcode = getattr(checked, 'retcode', None)
                            self._finish(principal, key, 'BROKER_REJECTED',
                                         code='ORDER_CHECK_REJECTED',
                                         retcode=check_retcode if type(check_retcode) is int else None)
                            reserved = False
                            raise self._error(422, 'ORDER_CHECK_REJECTED')
                    # order_check is only a preflight; it is not evidence of a broker change.
                    current, current_quote = self._snapshot(spec, payload.symbol, payload.positionTicket)
                    if current['revision'] != original_revision:
                        raise self._error(409, 'POSITION_CHANGED')
                    current_metadata = reads.require_symbol(self.mt5, payload.symbol)
                    if original_metadata != tuple(getattr(current_metadata, name, None) for name in names):
                        raise self._error(409, 'SYMBOL_CHANGED')
                    final, reasons, _ = geometry(current, candidate, current_metadata, current_quote)
                    if reasons:
                        raise self._error(422, 'GEOMETRY_INVALID')
                    self._guard(spec, current, candidate)
                    request = {'action': check_request['action'],
                               'position': int(payload.positionTicket), 'symbol': payload.symbol,
                               'sl': float(final['sl']) if final['sl'] is not None else 0.0,
                               'tp': float(final['tp']) if final['tp'] is not None else 0.0}
                    gateway.verify_identity(self.mt5, spec)
                    sent = True
                    response = self.mt5.order_send(request)
                    if response is None:
                        result = self._finish(principal, key, 'UNKNOWN', code='BROKER_TIMEOUT')
                        reserved = False
                        return result
                    retcode = getattr(response, 'retcode', None)
                    done = getattr(self.mt5, 'TRADE_RETCODE_DONE', None)
                    if type(retcode) is not int or retcode != done:
                        ambiguous_codes = {getattr(self.mt5, name, None) for name in
                                           ('TRADE_RETCODE_TIMEOUT', 'TRADE_RETCODE_CONNECTION')}
                        status = 'UNKNOWN' if retcode in ambiguous_codes or type(retcode) is not int else 'BROKER_REJECTED'
                        result = self._finish(principal, key, status,
                                              code='BROKER_TIMEOUT' if status == 'UNKNOWN' else 'BROKER_REJECTED',
                                              retcode=retcode if type(retcode) is int else None)
                        reserved = False
                        return result
                    readback, _ = self._snapshot(spec, payload.symbol, payload.positionTicket)
                    if (readback['revision'] == original_revision or
                            not self._same_price(readback['sl'], final['sl']) or
                            not self._same_price(readback['tp'], final['tp'])):
                        result = self._finish(principal, key, 'UNKNOWN', code='READBACK_MISMATCH',
                                              retcode=retcode, revision=readback['revision'],
                                              sl=readback['sl'], tp=readback['tp'])
                        reserved = False
                        return result
                    result = self._finish(principal, key, 'SAVED', retcode=retcode,
                                          revision=readback['revision'], sl=readback['sl'],
                                          tp=readback['tp'], verified=True)
                    reserved = False
                    return result
        except HTTPException as exc:
            if reserved:
                code = exc.detail.get('code') if isinstance(exc.detail, dict) else None
                safe_codes = {'POSITION_CHANGED', 'SYMBOL_CHANGED', 'QUOTE_NOT_FRESH',
                              'GEOMETRY_INVALID', 'GUARD_BLOCKED', 'GUARD_UNAVAILABLE',
                              'BROKER_DATA_UNAVAILABLE', 'ORDER_CHECK_REJECTED', 'NO_CHANGE',
                              'PREVIEW_EXPIRED', 'PREVIEW_MISMATCH', 'DEMO_ACCOUNT_REQUIRED'}
                try:
                    self._finish(principal, key, 'UNKNOWN' if sent else 'BROKER_REJECTED',
                                 code=('BROKER_TIMEOUT' if sent else code if code in safe_codes else 'BROKER_DATA_UNAVAILABLE'))
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
