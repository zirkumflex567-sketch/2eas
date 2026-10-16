"""Pure numeric policy, geometry and process-local preview state. Never authorizes writes."""
import copy
import hashlib
import json
import math
import re
import secrets
import threading
import time
from contextlib import contextmanager
from decimal import Decimal, localcontext
from fastapi import HTTPException

SL_MASK = 16
TP_MASK = 32

class PolicyError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

def number(value, *, maximum=Decimal('1e12')):
    if (not isinstance(value, str) or len(value)>32 or
            not re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?', value)):
        raise PolicyError('NUMERIC_POLICY_UNSUPPORTED')
    result = Decimal(value)
    if not 0 < result <= maximum:
        raise PolicyError('NUMERIC_POLICY_UNSUPPORTED')
    return result

def actual_number(value, *, maximum=Decimal('1e12')):
    from chart_studio.broker_reads import decimal
    return number(decimal(value, positive=True), maximum=maximum)

def canonical(value):
    result = format(value, 'f')
    return result.rstrip('0').rstrip('.') if '.' in result else result

def mt5_float(value, step):
    with localcontext() as ctx:
        ctx.prec = 64
        converted = float(value)
        if (not math.isfinite(converted) or converted <= 0 or
                abs(Decimal(str(converted))-value) > step/100 or
                Decimal(str(math.ulp(converted))) > step/4):
            raise PolicyError('PRECISION_UNSUPPORTED')
        return converted

def scope_hash(identity, peer, spec, symbol, ticket, revision):
    payload = [identity, peer, spec['id'], str(spec['login']), spec['server'],
               spec['terminal'], symbol, ticket, revision]
    return hashlib.sha256(json.dumps(payload, separators=(',', ':')).encode()).hexdigest()

def geometry(position, candidate, metadata, quote):
    with localcontext() as ctx:
        ctx.prec = 64
        point = actual_number(metadata.point)
        step = actual_number(metadata.trade_tick_size)
        for field in ('volume_min', 'volume_max', 'volume_step'):
            actual_number(getattr(metadata,field), maximum=Decimal('1e9'))
        for field in ('priceOpen', 'priceCurrent'):
            actual_number(Decimal(position[field]))
        for leg in ('sl','tp'):
            if position[leg] is not None: number(position[leg])
        actual_number(position['volume'] if not isinstance(position['volume'], str) else Decimal(position['volume']), maximum=Decimal('1e9'))
        for attr in ('trade_stops_level', 'trade_freeze_level'):
            value = getattr(metadata, attr, None)
            if type(value) is not int or not 0 <= value <= 2147483647:
                raise PolicyError('NUMERIC_POLICY_UNSUPPORTED')
        reference = actual_number(Decimal(quote['bid' if position['side']=='BUY' else 'ask']))
        existing = {leg: position[leg] for leg in ('sl', 'tp')}
        final = dict(existing)
        reasons = []
        mode = getattr(metadata, 'order_mode', None)
        if type(mode) is not int or mode < 0:
            reasons.append('ORDER_MODE_UNAVAILABLE')
        trade_reasons={0:'TRADE_DISABLED',1:'TRADE_LONG_ONLY',
                       2:'TRADE_SHORT_ONLY',3:'TRADE_CLOSE_ONLY'}
        actual_mode=getattr(metadata,'trade_mode',None)
        if type(actual_mode) is not int or actual_mode not in range(5):
            reasons.append('TRADE_MODE_UNKNOWN')
        elif actual_mode in trade_reasons:
            reasons.append(trade_reasons[actual_mode])
        for leg in ('sl', 'tp'):
            key = leg+'Price'
            if key not in candidate: continue
            proposed = candidate[key]
            final[leg] = proposed
            if type(mode) is int and mode >= 0 and not mode & (SL_MASK if leg=='sl' else TP_MASK):
                reasons.append(leg.upper()+'_UNSUPPORTED')
            # Decimal spelling cannot turn an unchanged broker level into a change.
            unchanged = (proposed is None and existing[leg] is None) or (
                proposed is not None and existing[leg] is not None and
                number(proposed) == number(existing[leg]))
            if unchanged: continue
            downward = (position['side']=='BUY') == (leg=='sl')
            def distance(value):
                return reference-value if downward else value-reference
            freeze = metadata.trade_freeze_level*point
            if freeze > 0 and existing[leg] is not None and distance(number(existing[leg])) <= freeze:
                reasons.append(leg.upper()+'_EXISTING_FROZEN')
            if proposed is not None:
                value = number(proposed)
                if value % step: reasons.append(leg.upper()+'_OFF_GRID')
                gap = distance(value)
                if gap <= 0: reasons.append(leg.upper()+'_WRONG_SIDE')
                elif gap < metadata.trade_stops_level*point: reasons.append(leg.upper()+'_STOPS_LEVEL')
                if freeze > 0 and gap <= freeze: reasons.append(leg.upper()+'_FREEZE_LEVEL')
        return final, reasons, step

class PreviewRegistry:
    def __init__(self, *, monotonic=time.monotonic, capacity=256):
        self.clock, self.capacity = monotonic, capacity
        self.lock = threading.RLock()
        self.items = {}
    def put(self, scope, result):
        with self.lock:
            now = self.clock()
            self.items = {k:v for k,v in self.items.items() if v[0]>now}
            if len(self.items)>=self.capacity: self.items.pop(next(iter(self.items)))
            token = secrets.token_urlsafe(32)
            saved = copy.deepcopy(result)
            saved['previewId'] = token
            self.items[token] = (now+10, scope, saved)
            return copy.deepcopy(saved)
    def lookup(self, token, scope):
        with self.lock:
            item = self.items.get(token)
            if item is None or item[0]<=self.clock() or item[1]!=scope:
                raise HTTPException(410, {'code':'PREVIEW_EXPIRED', 'canExecute':False, 'canCommit':False,
                                          'guard':{'state':'UNKNOWN','source':'NONE'}})
            return copy.deepcopy(item[2])
    def consume(self, token, scope):
        """Return and atomically remove a valid, scope-bound preview token."""
        with self.lock:
            item = self.items.get(token)
            if item is None or item[0] <= self.clock() or item[1] != scope:
                raise HTTPException(410, {'code':'PREVIEW_EXPIRED', 'canExecute':False, 'canCommit':False,
                                          'guard':{'state':'UNKNOWN','source':'NONE'}})
            del self.items[token]
            return copy.deepcopy(item[2])

class PreviewLimiter:
    def __init__(self, *, monotonic=time.monotonic):
        self.clock = monotonic
        self.lock = threading.RLock()
        self.users = {}
        self.active = False
    @contextmanager
    def acquire(self, principal):
        with self.lock:
            now = self.clock()
            state = self.users.get(principal)
            if state is None:
                if len(self.users)>=256:
                    idle = [(v[1], k) for k,v in self.users.items() if not v[2]]
                    if idle: del self.users[min(idle)[1]]
                    else: raise HTTPException(429, {'code':'RATE_LIMITED','canExecute':False,'canCommit':False,'guard':{'state':'UNKNOWN','source':'NONE'}}, headers={'Retry-After':'1'})
                state = [8., now, False]
                self.users[principal] = state
            state[0] = min(8., state[0]+max(0., now-state[1])*4)
            state[1] = now
            if self.active or state[2] or state[0]<1:
                raise HTTPException(429, {'code':'RATE_LIMITED', 'canExecute':False, 'canCommit':False,'guard':{'state':'UNKNOWN','source':'NONE'}}, headers={'Retry-After':'1'})
            state[0]-=1
            state[2] = self.active = True
        try: yield
        finally:
            with self.lock:
                state[2] = self.active = False
