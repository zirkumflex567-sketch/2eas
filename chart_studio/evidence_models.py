"""Strict, pure schema-v1 evidence boundary.

Context must come from trusted server configuration, never client identity. These
models establish shape and available temporal facts only: revision graphs,
reference existence and recording are the store's responsibility. No MT5 calls.
Unknown fields are rejected; arbitrary string-content secret detection is not
promised. Returned normalized dictionaries are detached from caller input.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import math
import ntpath
import re
import account_gateway as gateway
from chart_studio.broker_reads import broker_symbol

MAX_BYTES = 131072
TIMEFRAMES = 'M1 M5 M15 M30 H1 H4 D1 W1 MN1'.split()
TYPES = 'DECISION LIFECYCLE SNAPSHOT'.split()
OUTCOMES = 'PASS BLOCK UNKNOWN'.split()


def _fail():
    raise ValueError('invalid evidence')


def _pattern(value, pattern):
    if not isinstance(value, str) or re.fullmatch(pattern, value, flags=re.ASCII) is None:
        _fail()
    return value


def identifier(value):
    return _pattern(value, r'[A-Za-z0-9_-]{1,64}')


def hash_string(value):
    return _pattern(value, r'[0-9a-f]{64}')


def ticket(value):
    return _pattern(value, r'[1-9][0-9]{0,19}')


def integer(value):
    if type(value) is not int or not 1 <= value <= 2**31-1:
        _fail()
    return value


def choice(*values):
    def validate(value):
        if not isinstance(value, str) or value not in values:
            _fail()
        return value
    return validate


def nullable(validator):
    return lambda value: None if value is None else validator(value)


def strict_bool(value):
    if type(value) is not bool:
        _fail()
    return value


def number(value):
    if type(value) not in (int, float) or abs(value) > 10**12 or not math.isfinite(value):
        _fail()
    return value


def decimal_string(value, *, signed=False):
    pattern = r'-?[0-9]+(?:\.[0-9]{1,12})?' if signed else r'[0-9]+(?:\.[0-9]{1,12})?'
    _pattern(value, pattern)
    if len(value) > 32:
        _fail()
    d = Decimal(value)
    if d.copy_abs() > Decimal('1000000000000') or (not signed and d <= 0):
        _fail()
    if d == 0:
        return '0'
    result = format(d, 'f')
    if '.' in result:
        result = result.rstrip('0').rstrip('.')
    negative = result.startswith('-')
    result = result.lstrip('-').lstrip('0')
    if not result or result.startswith('.'):
        result = '0' + result
    return ('-' if negative else '') + result


def utc_timestamp(value):
    _pattern(value, r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|\+00:00)')
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        _fail()
    return dt.isoformat(timespec='microseconds').replace('+00:00', 'Z')


def utc_microseconds(value):
    dt = datetime.fromisoformat(utc_timestamp(value).replace('Z', '+00:00'))
    delta = dt - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (delta.days * 86400 + delta.seconds) * 1000000 + delta.microseconds


def _bounds(value):
    entries = 0
    ancestors = set()
    def walk(v, depth):
        nonlocal entries
        if depth > 8:
            _fail()
        if isinstance(v, (dict, list)):
            if id(v) in ancestors:
                _fail()
            ancestors.add(id(v))
            entries += len(v)
            if entries > 2048:
                _fail()
            if isinstance(v, dict):
                if any(not isinstance(k, str) for k in v):
                    _fail()
                children = v.values()
            else:
                children = v
            for child in children:
                walk(child, depth + 1)
            ancestors.remove(id(v))
        elif v is not None and type(v) not in (str, bool, int, float):
            _fail()
        elif type(v) is float and not math.isfinite(v):
            _fail()
    walk(value, 0)


def canonical_bytes(value):
    _bounds(value)
    try:
        result = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    except (ValueError, TypeError, UnicodeError, RecursionError) as exc:
        raise ValueError('invalid evidence') from exc
    if len(result) > MAX_BYTES:
        _fail()
    return result


def scoped_identity_hash(account_id, decimal_login, server, configured_terminal_path):
    identifier(account_id)
    ticket(decimal_login)
    if not isinstance(server, str) or not server or not isinstance(configured_terminal_path, str) or not configured_terminal_path:
        _fail()
    path = ntpath.normcase(ntpath.normpath(configured_terminal_path))
    return hashlib.sha256(canonical_bytes([account_id, decimal_login, server, path])).hexdigest()


@dataclass(frozen=True)
class AccountContext:
    account_id: str
    broker_server: str
    terminal_identity_hash: str

    def __post_init__(self):
        if self.account_id not in gateway.ACCOUNTS or self.broker_server != gateway.ACCOUNTS[self.account_id]['server']:
            _fail()
        hash_string(self.terminal_identity_hash)
        spec = gateway.ACCOUNTS[self.account_id]
        expected = scoped_identity_hash(self.account_id, str(spec['login']), spec['server'], spec['terminal'])
        if self.terminal_identity_hash != expected:
            _fail()

    @classmethod
    def from_config(cls, account_id):
        if not isinstance(account_id, str) or account_id not in gateway.ACCOUNTS:
            _fail()
        spec = gateway.ACCOUNTS[account_id]
        return cls(account_id, spec['server'], scoped_identity_hash(account_id, str(spec['login']), spec['server'], spec['terminal']))


def _object(value, required, optional=None):
    optional = optional or {}
    if type(value) is not dict or not required.keys() <= value.keys() or value.keys() - required.keys() - optional.keys():
        _fail()
    fields = {**required, **optional}
    return {key: fields[key](item) for key, item in value.items()}


def _list(validator, limit, unique=None):
    def validate(value):
        if type(value) is not list or len(value) > limit:
            _fail()
        result = [validator(v) for v in value]
        if unique and len({v[unique] for v in result}) != len(result):
            _fail()
        return result
    return validate


def record_ref(value):
    return _object(value, dict(type=choice(*TYPES), id=identifier, dataRevision=integer))


def _account(value, context):
    if value != context.account_id:
        _fail()
    return value


def _server(value, context):
    if value != context.broker_server:
        _fail()
    return value


def evidence_ref(value, *, context):
    result = _object(value, dict(id=identifier, sourceType=choice(*'MT5_DEAL MT5_POSITION MT5_ORDER EA_DECISION BROKER_QUOTE MARKET_BAR NEWS_PROVIDER RECONSTRUCTED'.split()),
        accountId=lambda v: _account(v, context), brokerServer=lambda v: _server(v, context), symbol=broker_symbol,
        eventTimeUtc=utc_timestamp, recordedAtUtc=utc_timestamp, sourceRevision=hash_string,
        confidenceKind=choice(*'OBSERVED CALCULATED PROXY UNAVAILABLE'.split())))
    _ordered(result['eventTimeUtc'], result['recordedAtUtc'])
    return result


def _ordered(before, after):
    if utc_microseconds(before) > utc_microseconds(after):
        _fail()


def _guard(value):
    check = lambda v: _object(v, dict(id=identifier, outcome=choice(*OUTCOMES), value=nullable(lambda x: decimal_string(x, signed=True)), limit=nullable(lambda x: decimal_string(x, signed=True))))
    result = _object(value, dict(state=choice('RECORDED', 'UNKNOWN'), sourceRevision=nullable(hash_string), checks=_list(check, 32, 'id')))
    if result['state'] == 'UNKNOWN' and result['sourceRevision'] is not None:
        _fail()
    return result


def decision_event(value, *, context):
    feature = lambda v: _object(v, dict(id=identifier, value=nullable(number), unit=identifier, timeframe=choice(*TIMEFRAMES)))
    predicate = lambda v: _object(v, dict(ruleId=identifier, observedValue=nullable(number), comparator=choice(*'GT GE LT LE EQ NE PRESENT'.split()), threshold=nullable(number), outcome=choice(*OUTCOMES), reasonCode=identifier))
    result = _object(value, dict(eventId=identifier, accountId=lambda v: _account(v, context), terminalIdentityHash=hash_string,
        symbol=broker_symbol, strategyId=identifier, strategyVersion=identifier, parameterSetHash=hash_string,
        decisionTimeUtc=utc_timestamp, evaluatedBarCloseUtc=utc_timestamp, timeframe=choice(*TIMEFRAMES), barIsClosed=strict_bool,
        featureVector=_list(feature,128,'id'), predicates=_list(predicate,128,'ruleId'), stage=choice(*'CANDIDATE SIGNAL ENTRY_FILTER RISK_GUARD ORDER_ATTEMPT BROKER_RESULT'.split()),
        outcome=choice(*OUTCOMES), dataProvenance=choice('recorded','reconstructed'), dataRevision=integer, capturedAtUtc=utc_timestamp, correlationId=identifier),
        dict(subsystemId=identifier,sourceQuoteTimeUtc=utc_timestamp,guardSnapshot=_guard,orderAttemptId=identifier,brokerTicket=ticket))
    if result['terminalIdentityHash'] != context.terminal_identity_hash:
        _fail()
    if result['barIsClosed']:
        _ordered(result['evaluatedBarCloseUtc'], result['decisionTimeUtc'])
    _ordered(result['decisionTimeUtc'], result['capturedAtUtc'])
    if 'sourceQuoteTimeUtc' in result:
        _ordered(result['sourceQuoteTimeUtc'], result['capturedAtUtc'])
    return result


def _lifecycle(value, context, with_revision=True):
    required = dict(id=identifier,accountId=lambda v: _account(v, context),positionIdentifier=ticket,
        eventType=choice(*'ENTRY EXIT PARTIAL_FILL SL_CHANGED TP_CHANGED POSITION_OBSERVED'.split()),source=choice('MT5_DEAL','MT5_POSITION','EA_EVENT'),
        asOfUtc=utc_timestamp,actor=choice('EA','USER','BROKER','UNKNOWN'),dataQuality=choice('OBSERVED','RECONSTRUCTED','UNAVAILABLE'))
    if with_revision:
        required['revision'] = hash_string
    return _object(value,required,dict(orderTicket=ticket,dealTicket=ticket,price=decimal_string,volume=decimal_string,
        slBefore=nullable(decimal_string),slAfter=nullable(decimal_string),tpBefore=nullable(decimal_string),tpAfter=nullable(decimal_string)))


def lifecycle_hash(value, *, context):
    if type(value) is not dict:
        _fail()
    body = dict(value)
    body.pop('revision',None)
    return hashlib.sha256(canonical_bytes(_lifecycle(body,context,False))).hexdigest()


def seal_lifecycle(value, *, context):
    body = _lifecycle(value,context,False)
    return {**body, 'revision': lifecycle_hash(body,context=context)}


def verify_lifecycle(value, *, context):
    result = _lifecycle(value,context)
    if result['revision'] != lifecycle_hash(result,context=context):
        _fail()
    return result


def _chart(value):
    result = _object(value,dict(symbol=broker_symbol,timeframe=choice(*TIMEFRAMES),fromUtc=utc_timestamp,toUtc=utc_timestamp,seriesType=choice('CANDLE'),priceScale=choice('NORMAL','LOG')))
    delta = utc_microseconds(result['toUtc']) - utc_microseconds(result['fromUtc'])
    if not 0 <= delta <= 31*86400*1000000:
        _fail()
    return result


def trade_snapshot(value, *, context):
    indicator = lambda v: _object(v,dict(id=identifier,algorithmVersion=identifier,parameterHash=hash_string,sourceRevision=hash_string))
    def decision_ref(v):
        result = record_ref(v)
        if result['type'] != 'DECISION':
            _fail()
        return result
    def only_null(v):
        if v is not None:
            _fail()
        return None
    result = _object(value,dict(snapshotId=identifier,accountId=lambda v: _account(v,context),positionIdentifier=ticket,dealTicket=ticket,
        captureType=choice('ENTRY','EXIT','BACKFILL'),asOfUtc=utc_timestamp,chartView=_chart,marketDataRef=nullable(lambda v: evidence_ref(v,context=context)),
        indicatorInstanceRevisions=_list(indicator,256,'id'),decisionEventIds=_list(decision_ref,256),renderStatus=choice('DATA_ONLY','RENDERED','UNAVAILABLE'),
        renderAssetRef=only_null,createdAtUtc=utc_timestamp))
    if len(result['indicatorInstanceRevisions']) + len(result['decisionEventIds']) + (result['marketDataRef'] is not None) > 256:
        _fail()
    _ordered(result['asOfUtc'],result['createdAtUtc'])
    ref = result['marketDataRef']
    if ref:
        if ref['symbol'] != result['chartView']['symbol']:
            _fail()
        _ordered(ref['eventTimeUtc'],result['asOfUtc'])
        if ref['sourceType'] == 'RECONSTRUCTED' and result['captureType'] != 'BACKFILL':
            _fail()
    return result


def validate_envelope(value, *, context):
    if not isinstance(context, AccountContext):
        _fail()
    _bounds(value)
    # Select only after a strict outer schema has established the type.
    result = _object(value,dict(schemaVersion=lambda v: 1 if type(v) is int and v == 1 else _fail(),type=choice(*TYPES),id=identifier,
        accountId=lambda v: _account(v,context),brokerServer=lambda v: _server(v,context),terminalIdentityHash=hash_string,dataRevision=integer,
        provenance=choice('RECORDED','RECONSTRUCTED'),supersedes=nullable(record_ref),payload=lambda v:v))
    if result['terminalIdentityHash'] != context.terminal_identity_hash:
        _fail()
    validators = {'DECISION':decision_event,'LIFECYCLE':verify_lifecycle,'SNAPSHOT':trade_snapshot}
    result['payload'] = validators[result['type']](result['payload'],context=context)
    p = result['payload']
    key = {'DECISION':'eventId','LIFECYCLE':'id','SNAPSHOT':'snapshotId'}[result['type']]
    if result['id'] != p[key]:
        _fail()
    if result['type'] == 'DECISION' and (result['dataRevision'] != p['dataRevision'] or result['provenance'].lower() != p['dataProvenance']):
        _fail()
    if result['type'] == 'LIFECYCLE' and p['dataQuality'] != 'UNAVAILABLE' and result['provenance'] != ('RECORDED' if p['dataQuality']=='OBSERVED' else 'RECONSTRUCTED'):
        _fail()
    if result['type'] == 'SNAPSHOT' and p['captureType'] == 'BACKFILL' and result['provenance'] != 'RECONSTRUCTED':
        _fail()
    canonical_bytes(result)
    return result


def parse_envelope(raw, *, context):
    if not isinstance(raw,(str,bytes)):
        _fail()
    try:
        encoded = raw.encode('utf-8') if isinstance(raw,str) else raw
        if len(encoded) > MAX_BYTES:
            _fail()
        def pairs(items):
            result = {}
            for key,value in items:
                if key in result:
                    _fail()
                result[key] = value
            return result
        value = json.loads(encoded.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _: _fail())
    except (UnicodeError,RecursionError,json.JSONDecodeError) as exc:
        raise ValueError('invalid evidence') from exc
    return validate_envelope(value,context=context)


def envelope_hash(value, *, context):
    return hashlib.sha256(canonical_bytes(validate_envelope(value,context=context))).hexdigest()


def event_metadata(value, *, context):
    """Store ordering metadata without lossy epoch floats or broker identities."""
    result = validate_envelope(value,context=context)
    p = result['payload']
    time_key = 'decisionTimeUtc' if result['type']=='DECISION' else 'asOfUtc'
    return {'type':result['type'],'id':result['id'],'dataRevision':result['dataRevision'],
            'eventTimeUtc':p[time_key],'eventTimeUs':utc_microseconds(p[time_key])}
