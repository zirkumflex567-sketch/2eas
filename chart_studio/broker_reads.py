"""MT5-only read models. Decimal values and identifiers never lose precision in JSON."""
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
import time

from fastapi import HTTPException
import account_gateway as gateway
import broker_clock

SOURCE = 'MT5_VERIFIED'
SYMBOL_PATTERN = r'^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$'
FRESH_SECONDS = 30
PENDING_TYPES = {2:'BUY_LIMIT', 3:'SELL_LIMIT', 4:'BUY_STOP', 5:'SELL_STOP',
                 6:'BUY_STOP_LIMIT', 7:'SELL_STOP_LIMIT'}


class BrokerReadError(ValueError):
    """Invalid or unavailable broker data; details never leave the read boundary."""


def required(row, field):
    value = getattr(row, field, None)
    if value is None:
        raise BrokerReadError('missing '+field)
    return value


def decimal(value, *, positive=False, signed=False):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise BrokerReadError('invalid decimal')
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise BrokerReadError('invalid decimal') from exc
    if not number.is_finite() or (not signed and number < 0) or (positive and number <= 0):
        raise BrokerReadError('invalid decimal')
    if number == 0:
        return '0'
    result = format(number, 'f')
    return result.rstrip('0').rstrip('.') if '.' in result else result


def integer(value, *, positive=False, choices=None):
    if isinstance(value, bool) or not isinstance(value, int) or value < (1 if positive else 0):
        raise BrokerReadError('invalid integer')
    if choices is not None and value not in choices:
        raise BrokerReadError('invalid enumeration')
    return value


def text(value, *, nonempty=True):
    if not isinstance(value, str) or (nonempty and not value.strip()):
        raise BrokerReadError('invalid text')
    return value


def broker_symbol(value):
    value = text(value)
    if not re.fullmatch(SYMBOL_PATTERN, value) or value != value.strip():
        raise BrokerReadError('invalid symbol')
    return value


def timestamp(raw_ms, spec):
    raw_ms = integer(raw_ms, positive=True)
    offset = broker_clock.offset_seconds(spec)
    utc_ms = raw_ms - offset*1000
    if utc_ms <= 0:
        raise BrokerReadError('invalid clock')
    return {'rawBrokerEpochMs': raw_ms, 'utcEpochMs': utc_ms,
            'brokerUtcOffsetSeconds': offset, 'offsetSource': 'ACCOUNT_CONFIG'}


def paired_timestamp(row, seconds_field, milliseconds_field, spec):
    seconds = integer(required(row, seconds_field), positive=True)
    milliseconds = integer(required(row, milliseconds_field), positive=True)
    if milliseconds//1000 != seconds:
        raise BrokerReadError('inconsistent broker clock')
    return timestamp(milliseconds, spec)


def provenance(spec):
    return {'account': spec['id'], 'login': str(spec['login']), 'server': spec['server'],
            'source': SOURCE, 'canExecute': False}


def quote_model(tick, spec, *, now=None):
    bid = decimal(required(tick, 'bid'), positive=True)
    ask = decimal(required(tick, 'ask'), positive=True)
    if Decimal(bid) > Decimal(ask):
        raise BrokerReadError('crossed quote')
    raw = integer(required(tick, 'time'), positive=True)
    # MT5 exposes millisecond time; older adapters expose only the required seconds.
    raw_ms = integer(getattr(tick, 'time_msc', raw*1000), positive=True)
    if raw_ms // 1000 != raw:
        raise BrokerReadError('inconsistent quote clock')
    clock = timestamp(raw_ms, spec)
    utc = broker_clock.to_utc_epoch(raw, spec)
    observed = float(time.time() if now is None else now)
    if not Decimal(str(observed)).is_finite():
        raise BrokerReadError('invalid observation clock')
    delta = observed-clock['utcEpochMs']/1000
    freshness = 'FUTURE' if delta < -1 else ('STALE' if delta > FRESH_SECONDS else 'FRESH')
    return {**provenance(spec), 'bid': bid, 'ask': ask, 'quoteTimeUtc': utc,
            'quoteTimeUtcMs': clock['utcEpochMs'], 'rawBrokerEpoch': raw,
            'rawBrokerEpochMs': raw_ms, 'brokerUtcOffsetSeconds': clock['brokerUtcOffsetSeconds'],
            'offsetSource': clock['offsetSource'], 'ageSeconds': max(0., delta),
            'freshness': freshness, 'stale': freshness != 'FRESH'}


def symbol_summary(row, spec):
    return {**provenance(spec), 'symbol': broker_symbol(required(row, 'name')),
            'tradeMode': integer(required(row, 'trade_mode'), choices=range(5))}


def symbol_model(row, spec):
    result = {**symbol_summary(row, spec), 'digits': integer(required(row, 'digits')),
              'stopsLevel': integer(required(row, 'trade_stops_level')),
              'freezeLevel': integer(required(row, 'trade_freeze_level'))}
    for field, key in [('point','point'), ('trade_tick_size','tickSize'),
                       ('volume_min','volumeMin'), ('volume_max','volumeMax'),
                       ('volume_step','volumeStep')]:
        result[key] = decimal(required(row, field), positive=True)
    if Decimal(result['volumeMin']) > Decimal(result['volumeMax']):
        raise BrokerReadError('invalid volume limits')
    for field, key in [('currency_base','currencyBase'), ('currency_profit','currencyProfit'),
                       ('currency_margin','currencyMargin')]:
        result[key] = text(required(row, field), nonempty=False)
    return result


def revision(spec, row, schema, decimals):
    canonical = {'account': spec['id'], 'login': str(spec['login']), 'server': spec['server']}
    for field in schema:
        value = required(row, field)
        canonical[field] = (decimal(value) if field in decimals else
                            broker_symbol(value) if field == 'symbol' else str(integer(value)))
    encoded = json.dumps(canonical, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


POSITION_SCHEMA = ('symbol','ticket','identifier','type','volume','price_open','sl','tp','time_update_msc')
ORDER_SCHEMA = ('symbol','ticket','position_id','type','volume_current','volume_initial',
                'price_open','price_stoplimit','sl','tp','time_setup_msc','time_expiration',
                'type_time','type_filling','state')


def base_trade(row, spec, expected_symbol):
    symbol = broker_symbol(required(row, 'symbol'))
    if symbol != expected_symbol:
        raise BrokerReadError('broker returned a different symbol')
    magic = integer(required(row, 'magic'))
    result = {**provenance(spec), 'symbol': symbol,
              'ticket': str(integer(required(row, 'ticket'), positive=True)),
              'magic': str(magic), 'ownership': 'MANUAL' if magic == 0 else 'UNKNOWN',
              'comment': text(required(row, 'comment'), nonempty=False)}
    for field in ('sl','tp'):
        value = decimal(required(row, field))
        result[field] = None if Decimal(value) == 0 else value
    result['priceOpen'] = decimal(required(row, 'price_open'), positive=True)
    result['priceCurrent'] = decimal(required(row, 'price_current'), positive=True)
    return result


def position_model(row, spec, symbol, currency):
    result = base_trade(row, spec, symbol)
    kind = integer(required(row, 'type'), choices=(0,1))
    result.update(identifier=str(integer(required(row, 'identifier'), positive=True)),
                  type='BUY' if kind == 0 else 'SELL', side='BUY' if kind == 0 else 'SELL',
                  volume=decimal(required(row, 'volume'), positive=True),
                  createdTime=paired_timestamp(row, 'time', 'time_msc', spec),
                  updatedTime=paired_timestamp(row, 'time_update', 'time_update_msc', spec),
                  rawBrokerTime=integer(required(row, 'time'), positive=True),
                  rawBrokerUpdateTime=integer(required(row, 'time_update'), positive=True))
    result.update(profit=decimal(required(row, 'profit'), signed=True),
                  swap=decimal(required(row, 'swap'), signed=True), currency=currency)
    result['revision'] = revision(spec, row, POSITION_SCHEMA, ('volume','price_open','sl','tp'))
    return result


def order_model(row, spec, symbol):
    result = base_trade(row, spec, symbol)
    kind = integer(required(row, 'type'), choices=PENDING_TYPES)
    expiry = integer(required(row, 'time_expiration'))
    result.update(type=PENDING_TYPES[kind], side='BUY' if kind in (2,4,6) else 'SELL',
                  positionId=str(integer(required(row, 'position_id'))),
                  volumeCurrent=decimal(required(row, 'volume_current')),
                  volumeInitial=decimal(required(row, 'volume_initial'), positive=True),
                  priceStoplimit=decimal(required(row, 'price_stoplimit')),
                  createdTime=paired_timestamp(row, 'time_setup', 'time_setup_msc', spec),
                  rawBrokerSetupTime=integer(required(row, 'time_setup'), positive=True),
                  expirationTime=timestamp(expiry*1000, spec) if expiry else None,
                  rawBrokerExpirationTime=expiry,
                  typeTime=integer(required(row, 'type_time'), choices=range(4)),
                  typeFilling=integer(required(row, 'type_filling'), choices=range(4)),
                  state=integer(required(row, 'state'), choices=range(10)))
    result['revision'] = revision(spec, row, ORDER_SCHEMA,
                                  ('volume_current','volume_initial','price_open','price_stoplimit','sl','tp'))
    return result


def verified_read(mt5, account, operation):
    """Hold the shared gateway lock through fetching AND serializing broker rows."""
    try:
        with gateway.session(mt5, account) as spec:
            return operation(spec)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'MT5-Lesedaten ungültig oder nicht verfügbar.') from exc


def broker_rows(value):
    if value is None or not isinstance(value, (tuple, list)):
        raise BrokerReadError('broker collection unavailable')
    return value


def require_symbol(mt5, symbol):
    row = mt5.symbol_info(symbol)
    if row is None:
        raise HTTPException(404, 'Broker-Symbol nicht gefunden.')
    if broker_symbol(required(row, 'name')) != symbol:
        raise BrokerReadError('symbol mismatch')
    return row


def positions_read(mt5, spec, symbol, *, ticket=None, magic=None, manual=None, now=None):
    require_symbol(mt5, symbol)
    info = gateway.verify_identity(mt5, spec)
    currency = text(required(info, 'currency'))
    margin_mode = integer(required(info, 'margin_mode'), choices=(0,1,2))
    positions = broker_rows(mt5.positions_get(symbol=symbol))
    orders = broker_rows(mt5.orders_get(symbol=symbol))
    quote = quote_model(mt5.symbol_info_tick(symbol), spec, now=now)
    # Validate ALL rows first: ticket/magic filters never conceal malformed data.
    models = [position_model(row, spec, symbol, currency) for row in positions]
    pending = [order_model(row, spec, symbol) for row in orders]
    def matches(row):
        return ((ticket is None or row['ticket'] == ticket)
                and (magic is None or row['magic'] == magic)
                and (manual is None or (row['ownership'] == 'MANUAL') == manual))
    return {**provenance(spec), 'symbol': symbol, 'currency': currency,
            'marginMode': margin_mode, 'quote': quote,
            'positions': [r for r in models if matches(r)],
            'orders': [r for r in pending if matches(r)]}


def legacy_quote(mt5, spec, info, symbol, *, now=None):
    """Keep legacy numeric names/types while correcting the explicit broker clock."""
    try:
        quote = quote_model(mt5.symbol_info_tick(symbol), spec, now=now)
        sym = mt5.symbol_info(symbol)
        if broker_symbol(required(sym, 'name')) != symbol:
            raise BrokerReadError('symbol mismatch')
        tick_size = decimal(required(sym, 'trade_tick_size'), positive=True)
        return {**quote, 'symbol': symbol, 'currency': text(required(info, 'currency')),
                'bid': float(quote['bid']), 'ask': float(quote['ask']), 'tickSize': float(tick_size)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'Broker-Quote oder Symbolinformationen ungültig.') from exc
