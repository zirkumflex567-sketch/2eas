"""MT5-only read models. Decimal values and identifiers never lose precision in JSON."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
import math
import numbers
import re
import time

from fastapi import HTTPException
import account_gateway as gateway
import broker_clock
import broker_telemetry
from chart_studio import history_cursor
from chart_studio.currency_conversion import convert_amounts_to_usd

SOURCE = 'MT5_VERIFIED'
SYMBOL_PATTERN = r'^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$'
FRESH_SECONDS = 30
# Read-model tolerance for measured MT5 server/local clock skew. Stop-preview and
# commit services independently retain their stricter 1,000 ms future bound.
QUOTE_FUTURE_TOLERANCE_SECONDS = 1.5
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
    offset = broker_clock.offset_for_broker_epoch(raw_ms/1000, spec)
    utc_ms = raw_ms - offset*1000
    if utc_ms <= 0:
        raise BrokerReadError('invalid clock')
    return {'rawBrokerEpochMs': raw_ms, 'utcEpochMs': utc_ms,
            'brokerUtcOffsetSeconds': offset, 'offsetSource': broker_clock.offset_source(spec)}


def paired_timestamp(row, seconds_field, milliseconds_field, spec):
    seconds = integer(required(row, seconds_field), positive=True)
    milliseconds = integer(required(row, milliseconds_field), positive=True)
    if milliseconds//1000 != seconds:
        raise BrokerReadError('inconsistent broker clock')
    return timestamp(milliseconds, spec)


def provenance(spec):
    return {'account': spec['id'], 'login': str(spec['login']), 'server': spec['server'],
            'source': SOURCE, 'canExecute': False}


def snapshot_revision(scope, content):
    encoded = json.dumps({'scope':scope, 'content':content}, sort_keys=True,
                         separators=(',', ':'), ensure_ascii=True)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def quote_model(tick, spec, *, symbol='', now=None):
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
    freshness = 'FUTURE' if delta < -QUOTE_FUTURE_TOLERANCE_SECONDS else ('STALE' if delta > FRESH_SECONDS else 'FRESH')
    result = {**provenance(spec), 'bid': bid, 'ask': ask, 'quoteTimeUtc': utc,
            'quoteTimeUtcMs': clock['utcEpochMs'], 'rawBrokerEpoch': raw,
            'rawBrokerEpochMs': raw_ms, 'brokerUtcOffsetSeconds': clock['brokerUtcOffsetSeconds'],
            'offsetSource': clock['offsetSource'], 'ageSeconds': max(0., delta),
            'freshness': freshness, 'stale': freshness != 'FRESH'}
    result['revision'] = snapshot_revision(
        {'account':spec['id'], 'login':str(spec['login']), 'server':spec['server'],
         'kind':'quote'}, {'symbol':broker_symbol(symbol) if symbol else '', 'bid':bid, 'ask':ask,
                           'rawBrokerEpochMs':raw_ms})
    return result


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
    result['revision'] = snapshot_revision(
        {'account':spec['id'], 'login':str(spec['login']), 'server':spec['server'],
         'kind':'symbol-metadata'}, {key:value for key,value in result.items()
                                    if key not in ('account','login','server','source','canExecute')})
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
        with gateway.traced_session(mt5, account) as spec:
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
    quote = quote_model(mt5.symbol_info_tick(symbol), spec, symbol=symbol, now=now)
    # Validate ALL rows first: ticket/magic filters never conceal malformed data.
    models = [position_model(row, spec, symbol, currency) for row in positions]
    if models:
        conversion_inputs = {}
        for index, row in enumerate(models):
            conversion_inputs[f'{index}:profit'] = float(row['profit'])
            conversion_inputs[f'{index}:swap'] = float(row['swap'])
        conversion = convert_amounts_to_usd(mt5, conversion_inputs, currency,
                                            now_ms=int(now*1000) if now is not None else None)
        for index, row in enumerate(models):
            if conversion['state'] == 'AVAILABLE':
                row['usdConversion'] = {
                    'state':'AVAILABLE', 'source':conversion['source'],
                    'amountsUsd':{'profit':conversion['amountsUsd'][f'{index}:profit'],
                                  'swap':conversion['amountsUsd'][f'{index}:swap']}}
                if conversion.get('symbol'):
                    row['usdConversion'].update(symbol=conversion['symbol'],
                                                quoteTimeUtc=conversion.get('quoteTimeUtc'),
                                                conversionSides={
                                                    'profit':conversion.get('conversionSides',{}).get(f'{index}:profit'),
                                                    'swap':conversion.get('conversionSides',{}).get(f'{index}:swap')})
            else:
                row['usdConversion'] = {'state':'UNAVAILABLE',
                                        'reason':conversion.get('reason','FX_CONVERSION_UNAVAILABLE'),
                                        'source':'NONE'}
    pending = [order_model(row, spec, symbol) for row in orders]
    def matches(row):
        return ((ticket is None or row['ticket'] == ticket)
                and (magic is None or row['magic'] == magic)
                and (manual is None or (row['ownership'] == 'MANUAL') == manual))
    filtered_positions = [r for r in models if matches(r)]
    filtered_orders = [r for r in pending if matches(r)]
    scope = {'account':spec['id'], 'login':str(spec['login']), 'server':spec['server'],
             'symbol':symbol}
    return {**provenance(spec), 'symbol': symbol, 'currency': currency,
            'marginMode': margin_mode, 'quote': quote,
            'positionsRevision':snapshot_revision({**scope, 'kind':'positions'},
                sorted((r['revision'] for r in filtered_positions))),
            'ordersRevision':snapshot_revision({**scope, 'kind':'orders'},
                sorted((r['revision'] for r in filtered_orders))),
            'positions':filtered_positions, 'orders':filtered_orders}


PORTFOLIO_MAX_POSITIONS = 500
CORRELATION_MAX_SYMBOLS = 12
CORRELATION_BAR_COUNT = 257
CORRELATION_MIN_RETURNS = 60


def portfolio_correlations(mt5, symbols, scenario_symbol):
    """Pairwise Pearson correlations of aligned completed H1 close returns."""
    names = sorted(set(symbols) | {scenario_symbol})
    def unavailable(reason):
        return {'state':'UNAVAILABLE', 'reason':reason,
                'scenarioSymbol':scenario_symbol, 'symbols':names if len(names) <= CORRELATION_MAX_SYMBOLS else []}
    if len(names) < 2:
        return unavailable('NO_SYMBOL_PAIRS')
    if len(names) > CORRELATION_MAX_SYMBOLS:
        return unavailable('SYMBOL_LIMIT_EXCEEDED')
    reader = getattr(mt5, 'copy_rates_from_pos', None)
    timeframe = getattr(mt5, 'TIMEFRAME_H1', 16385)
    if not callable(reader):
        return unavailable('HISTORY_UNAVAILABLE')
    series = {}
    try:
        for name in names:
            with broker_telemetry.span('mt5_rates', count=CORRELATION_BAR_COUNT):
                raw = reader(name, timeframe, 1, CORRELATION_BAR_COUNT)
            if raw is None:
                return unavailable('HISTORY_UNAVAILABLE')
            rows = list(raw)
            if len(rows) > CORRELATION_BAR_COUNT:
                return unavailable('INVALID_CORRELATION_SERIES')
            values = {}
            for row in rows:
                try:
                    stamp = row['time'] if not hasattr(row, 'time') else row.time
                    close = row['close'] if not hasattr(row, 'close') else row.close
                    if isinstance(stamp, bool) or not isinstance(stamp, numbers.Integral) or stamp <= 0:
                        raise ValueError('timestamp')
                    if isinstance(close, bool) or not isinstance(close, (numbers.Real, Decimal)):
                        raise ValueError('close')
                    stamp, price = int(stamp), float(close)
                    if not math.isfinite(price) or price <= 0 or stamp in values:
                        raise ValueError('rate')
                    values[stamp] = price
                except Exception as exc:
                    raise BrokerReadError('invalid correlation rate') from exc
            series[name] = values
    except BrokerReadError:
        return unavailable('INVALID_CORRELATION_SERIES')
    except Exception:
        return unavailable('HISTORY_UNAVAILABLE')

    pairs = []
    for index, left in enumerate(names):
        for right in names[index+1:]:
            common = sorted(series[left].keys() & series[right].keys())
            intervals = [(a,b) for a,b in zip(common,common[1:]) if b-a == 3600]
            left_returns = [series[left][b]/series[left][a]-1 for a,b in intervals]
            right_returns = [series[right][b]/series[right][a]-1 for a,b in intervals]
            if len(left_returns) < CORRELATION_MIN_RETURNS:
                return unavailable('INSUFFICIENT_ALIGNED_HISTORY')
            mean_left = math.fsum(left_returns)/len(left_returns)
            mean_right = math.fsum(right_returns)/len(right_returns)
            centered_left = [v-mean_left for v in left_returns]
            centered_right = [v-mean_right for v in right_returns]
            variance_left = math.fsum(v*v for v in centered_left)
            variance_right = math.fsum(v*v for v in centered_right)
            if variance_left <= 0 or variance_right <= 0:
                return unavailable('INVALID_CORRELATION_SERIES')
            coefficient = math.fsum(a*b for a,b in zip(centered_left,centered_right))/math.sqrt(variance_left*variance_right)
            if not math.isfinite(coefficient):
                return unavailable('INVALID_CORRELATION_SERIES')
            coefficient = max(-1.0,min(1.0,coefficient))
            pairs.append({'symbols':[left,right], 'coefficient':decimal(Decimal(str(coefficient)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP), signed=True), 'observations':len(left_returns)})
    return {'state':'AVAILABLE', 'timeframe':'H1', 'source':'MT5_COMPLETED_BARS',
            'scenarioSymbol':scenario_symbol, 'symbols':names, 'pairs':pairs}


def portfolio_read(mt5, spec, scenario_symbol='XAUUSD'):
    """Read a bounded account-wide position and completed-bar correlation snapshot."""
    info = gateway.verify_identity(mt5, spec)
    currency = text(required(info, 'currency'))
    currency_digits = integer(required(info, 'currency_digits'), choices=range(0, 9))
    currency_quantum = Decimal(1).scaleb(-currency_digits)
    margin = {
        'state': 'AVAILABLE',
        'used': decimal(required(info, 'margin')),
        'free': decimal(required(info, 'margin_free'), signed=True),
        'equity': decimal(required(info, 'equity'), signed=True),
        'balance': decimal(required(info, 'balance'), signed=True),
        'currency': currency,
        'scope': 'ACCOUNT',
    }
    rows = broker_rows(mt5.positions_get())
    if len(rows) > PORTFOLIO_MAX_POSITIONS:
        raise BrokerReadError('portfolio position limit exceeded')
    totals = {}
    checked_symbols = set()
    stop_loss = Decimal(0)
    stop_risk_reason = None
    for row in rows:
        symbol = broker_symbol(required(row, 'symbol'))
        if symbol not in checked_symbols:
            require_symbol(mt5, symbol)
            checked_symbols.add(symbol)
        model = position_model(row, spec, symbol, currency)
        total = totals.setdefault(symbol, {
            'symbol': symbol, 'buyLots': Decimal(0), 'sellLots': Decimal(0),
            'floatingPnl': Decimal(0), 'swap': Decimal(0), 'currency': currency,
        })
        side_key = 'buyLots' if model['side'] == 'BUY' else 'sellLots'
        total[side_key] += Decimal(model['volume'])
        total['floatingPnl'] += Decimal(model['profit'])
        total['swap'] += Decimal(model['swap'])
        if model['sl'] is None:
            stop_risk_reason = stop_risk_reason or 'MISSING_STOP'
        elif stop_risk_reason is None:
            calculator = getattr(mt5, 'order_calc_profit', None)
            if not callable(calculator):
                stop_risk_reason = 'BROKER_CALCULATION_UNAVAILABLE'
            else:
                action = getattr(mt5, 'ORDER_TYPE_BUY' if model['side'] == 'BUY' else 'ORDER_TYPE_SELL',
                                 0 if model['side'] == 'BUY' else 1)
                try:
                    pnl = calculator(action, symbol, float(model['volume']),
                                     float(model['priceOpen']), float(model['sl']))
                    if isinstance(pnl, bool) or not isinstance(pnl, (int, float)):
                        raise BrokerReadError('invalid broker calculation')
                    pnl_decimal = Decimal(str(pnl))
                    if not pnl_decimal.is_finite():
                        raise BrokerReadError('invalid broker calculation')
                    pnl_decimal = pnl_decimal.quantize(currency_quantum, rounding=ROUND_HALF_UP)
                    stop_loss += max(Decimal(0), -pnl_decimal)
                except Exception:
                    stop_risk_reason = 'BROKER_CALCULATION_UNAVAILABLE'
    symbols = []
    for name in sorted(totals):
        total = totals[name]
        buy, sell = total['buyLots'], total['sellLots']
        symbols.append({
            'symbol': name, 'buyLots': decimal(buy), 'sellLots': decimal(sell),
            'netLots': decimal(buy-sell, signed=True),
            'floatingPnl': decimal(total['floatingPnl'], signed=True),
            'swap': decimal(total['swap'], signed=True), 'currency': currency,
        })
    stop_risk = ({'state':'UNAVAILABLE', 'reason':stop_risk_reason} if stop_risk_reason else
                 {'state':'AVAILABLE', 'lossAtStops':decimal(stop_loss.quantize(currency_quantum, rounding=ROUND_HALF_UP)), 'currency':currency,
                  'source':'MT5_ORDER_CALC_PROFIT'})
    if scenario_symbol not in checked_symbols:
        require_symbol(mt5, scenario_symbol)
    return {**provenance(spec), 'positionCount': len(rows), 'currency': currency,
            'margin': margin, 'stopRisk': stop_risk,
            'symbols': symbols,
            'correlation': portfolio_correlations(mt5, checked_symbols, scenario_symbol)}


# Official DEAL_TYPE values (BUY_CANCELED=13, SELL_CANCELED=14). Unknown newer
# categories remain explicit omissions rather than guessed executions.
DEAL_TYPES = {0:'BUY', 1:'SELL', 2:'BALANCE', 3:'CREDIT', 4:'CHARGE',
              5:'CORRECTION', 6:'BONUS', 7:'COMMISSION', 8:'COMMISSION_DAILY',
              9:'COMMISSION_MONTHLY', 10:'COMMISSION_AGENT_DAILY',
              11:'COMMISSION_AGENT_MONTHLY', 12:'INTEREST',
              13:'BUY_CANCELED', 14:'SELL_CANCELED'}
DEAL_ENTRIES = {0:'IN', 1:'OUT', 2:'INOUT', 3:'OUT_BY'}
HISTORY_MAX_ROWS = 50000


def deal_model(row, spec, currency):
    kind = integer(required(row, 'type'))
    executed = kind in (0, 1)
    raw_symbol = text(required(row, 'symbol'), nonempty=executed)
    symbol = broker_symbol(raw_symbol) if raw_symbol else ''
    entry = integer(required(row, 'entry'))
    magic = integer(required(row, 'magic'))
    result = {**provenance(spec), 'symbol':symbol,
              'ticket':str(integer(required(row, 'ticket'), positive=True)),
              'orderTicket':str(integer(required(row, 'order'))),
              'positionIdentifier':str(integer(required(row, 'position_id'))),
              'rawType':kind, 'type':DEAL_TYPES.get(kind, 'OTHER_UNKNOWN'),
              'side':DEAL_TYPES[kind] if executed else 'UNKNOWN',
              'status':'EXECUTED' if executed else 'OMITTED',
              'rawEntry':entry, 'entry':DEAL_ENTRIES.get(entry, 'UNKNOWN'),
              'rawReason':integer(required(row, 'reason')),
              'externalId':text(required(row, 'external_id'), nonempty=False),
              'magic':str(magic), 'ownership':'MANUAL' if magic == 0 else 'UNKNOWN',
              'comment':text(required(row, 'comment'), nonempty=False),
              'rawBrokerTime':integer(required(row, 'time'), positive=True),
              'fillTime':paired_timestamp(row, 'time', 'time_msc', spec),
              'price':decimal(required(row, 'price'), positive=executed),
              'volume':decimal(required(row, 'volume'), positive=executed),
              'currency':currency}
    for field in ('commission', 'swap', 'profit', 'fee'):
        result[field] = decimal(required(row, field), signed=True)
    return result


def trades_read(mt5, spec, symbol, start, stop, *, limit=100, ticket=None,
                magic=None, manual=None, cursor=None, now=None):
    """Read actual HISTORY_DEAL only, inside verified_read's shared session lock."""
    observed = history_cursor.observed_us(time.time() if now is None else now)
    start_offset = broker_clock.offset_seconds(spec, start/1_000_000)
    asof_offset = broker_clock.offset_seconds(spec, min(stop, observed)/1_000_000)
    scope = history_cursor.digest({'account':spec['id'], 'login':str(spec['login']),
        'server':spec['server'], 'terminal':spec['terminal'], 'offset':(start_offset,asof_offset),
        'symbol':symbol, 'start':start, 'stop':stop,
        'ticket':ticket, 'magic':magic, 'manual':manual})
    state = history_cursor.decode(cursor, scope, stop, observed) if cursor is not None else None
    asof = state['asof'] if state else min(stop, observed)
    require_symbol(mt5, symbol)
    currency = text(required(gateway.verify_identity(mt5, spec), 'currency'))
    # Broker wall-clock epochs are offset from UTC by this account's policy.
    # Both datetimes carry UTC tzinfo so no machine-local conversion is possible.
    if asof >= start:
        with broker_telemetry.span('mt5_history'):
            rows = broker_rows(mt5.history_deals_get(
                history_cursor.utc_datetime(start+start_offset*1000000),
                history_cursor.utc_datetime(asof+broker_clock.offset_seconds(spec, asof/1_000_000)*1000000)))
    else:
        rows = ()
    if len(rows) > HISTORY_MAX_ROWS:
        raise HTTPException(503, {'code':'HISTORY_LIMIT',
                                 'message':'Broker history exceeds 50000 rows; narrow the UTC range.'})
    # Validate all raw rows, including filtered and omitted categories, first.
    unique = {}
    for row in rows:
        model = deal_model(row, spec, currency)
        previous = unique.get(model['ticket'])
        if previous is not None and previous != model:
            raise BrokerReadError('conflicting duplicate deal ticket')
        unique[model['ticket']] = model
    key = lambda r: (r['fillTime']['rawBrokerEpochMs'], int(r['ticket']))
    eligible = sorted((r for r in unique.values()
                       if start <= r['fillTime']['utcEpochMs']*1000 <= asof), key=key)
    # Detect corrected or late-arriving history across pages instead of silently
    # repeating a moved deal or losing one inserted before the previous boundary.
    snapshot = history_cursor.digest(eligible)
    if state and state['snapshot'] != snapshot:
        raise history_cursor.invalid_cursor()
    omitted = {}
    fills = []
    for row in eligible:
        if row['status'] != 'EXECUTED':
            kind = row['rawType']
            omitted[kind] = omitted.get(kind, 0)+1
        elif (row['symbol'] == symbol and (ticket is None or row['ticket'] == ticket)
              and (magic is None or row['magic'] == magic)
              and (manual is None or (row['ownership'] == 'MANUAL') == manual)):
            fills.append(row)
    if state:
        boundary = tuple(state['after'])
        if not any(key(r) == boundary for r in fills):
            raise history_cursor.invalid_cursor()
        fills = [r for r in fills if key(r) > boundary]
    page = fills[:limit]
    next_cursor = (history_cursor.encode(scope, asof, key(page[-1]), snapshot)
                   if len(fills) > limit else None)
    return {**provenance(spec), 'symbol':symbol, 'currency':currency,
            'fromUtc':history_cursor.utc_text(start), 'toUtc':history_cursor.utc_text(stop),
            'asOfUtc':history_cursor.utc_text(asof), 'limit':limit,
            'historyRevision':snapshot_revision({'scope':scope, 'asof':asof}, snapshot),
            'trades':page, 'nextCursor':next_cursor,
            'omittedCategories':[{'type':DEAL_TYPES.get(k, 'OTHER_UNKNOWN'),
                                  'rawType':k, 'count':omitted[k]} for k in sorted(omitted)]}


def legacy_quote(mt5, spec, info, symbol, *, now=None):
    """Keep legacy numeric names/types while correcting the explicit broker clock."""
    try:
        quote = quote_model(mt5.symbol_info_tick(symbol), spec, symbol=symbol, now=now)
        sym = mt5.symbol_info(symbol)
        if broker_symbol(required(sym, 'name')) != symbol:
            raise BrokerReadError('symbol mismatch')
        tick_size = decimal(required(sym, 'trade_tick_size'), positive=True)
        digits = integer(required(sym, 'digits'), choices=range(11))
        return {**quote, 'symbol': symbol, 'currency': text(required(info, 'currency')),
                'bid': float(quote['bid']), 'ask': float(quote['ask']),
                'tickSize': float(tick_size), 'digits': digits}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'Broker-Quote oder Symbolinformationen ungültig.') from exc
