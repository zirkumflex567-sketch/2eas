"""Opt-in, read-only capture of verified MT5 deal facts for demo accounts."""
import asyncio
import copy
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import ntpath
import numbers
import time

import account_gateway as gateway
import broker_clock
import broker_telemetry
from chart_studio import broker_reads, history_cursor
from chart_studio import evidence_models as models

POLL_SECONDS = 60.0
INITIAL_LOOKBACK_SECONDS = 48 * 60 * 60
OVERLAP_SECONDS = 5 * 60
PAGE_SIZE = 500
MAX_PAGES_PER_ACCOUNT = 100
MONEY_QUANTUM = Decimal('0.000000000001')
SNAPSHOT_MAX_BARS = 150
DECISION_LOOKBACK_SECONDS = 48 * 60 * 60
TIMEFRAME_SECONDS = {'M1':60, 'M5':300, 'M15':900, 'M30':1800, 'H1':3600, 'H4':14400,
                     'D1':86400, 'W1':604800}


def _bar_value(row, name):
    try:
        return row[name]
    except (KeyError, TypeError, IndexError):
        return getattr(row, name)


def _price_string(value, digits):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite():
            raise ValueError('invalid bar price')
        quantum = Decimal(1).scaleb(-digits)
        return models.decimal_string(format(amount.quantize(quantum, rounding=ROUND_HALF_UP), 'f'))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError('invalid bar price') from exc


def _bar_integer(value):
    if isinstance(value, bool) or not isinstance(value, numbers.Integral):
        raise ValueError('invalid bar integer')
    return int(value)


def trade_snapshot_id(context, row):
    """Return the immutable entry/exit snapshot key for one verified demo deal."""
    if not isinstance(context, models.AccountContext) or type(row) is not dict:
        raise ValueError('invalid snapshot source')
    spec = gateway.ACCOUNTS.get(context.account_id)
    if (not spec or spec.get('is_demo') is not True or row.get('account') != context.account_id or
            row.get('login') != str(spec['login']) or row.get('server') != context.broker_server or
            row.get('symbol') != spec.get('symbol') or row.get('source') != 'MT5_VERIFIED' or
            row.get('canExecute') is not False or row.get('entry') not in ('IN', 'OUT', 'OUT_BY')):
        raise ValueError('unverified snapshot source')
    capture_type = 'ENTRY' if row['entry'] == 'IN' else 'EXIT'
    identity = hashlib.sha256(models.canonical_bytes([context.account_id, context.terminal_identity_hash,
        models.ticket(row['positionIdentifier']), models.ticket(row['ticket']), capture_type])).hexdigest()[:40]
    return 'snap_' + identity


def trade_snapshot_envelope(context, row, raw_bars, *, captured_at_utc, timeframe, digits,
                            decision_event_ids=None):
    """Freeze completed MT5 bars for a verified entry/exit deal."""
    if not isinstance(context, models.AccountContext) or type(row) is not dict:
        raise ValueError('invalid snapshot source')
    if row.get('entry') not in ('IN', 'OUT', 'OUT_BY'):
        return None
    spec = gateway.ACCOUNTS.get(context.account_id)
    if (not spec or spec.get('is_demo') is not True or row.get('account') != context.account_id or
            row.get('login') != str(spec['login']) or row.get('server') != context.broker_server or
            row.get('symbol') != spec.get('symbol') or row.get('source') != 'MT5_VERIFIED' or row.get('canExecute') is not False):
        raise ValueError('unverified snapshot source')
    tf_seconds = TIMEFRAME_SECONDS.get(timeframe)
    if not tf_seconds or type(digits) is not int or not 0 <= digits <= 10:
        raise ValueError('invalid snapshot timeframe')
    asof = _deal_time(row['fillTime']['utcEpochMs'])
    captured = models.utc_timestamp(captured_at_utc)
    asof_epoch = row['fillTime']['utcEpochMs'] // 1000
    normalized = []
    for source in raw_bars:
        stamp = _bar_integer(_bar_value(source, 'time'))
        # MT5 bars are keyed by opening time; only a candle closed by fill time is evidence.
        stamp_utc = models.utc_timestamp(datetime.fromtimestamp(
            broker_clock.rates_to_utc_epoch(stamp, spec), timezone.utc).isoformat())
        if models.market_bar_close_microseconds(stamp_utc,timeframe) > models.utc_microseconds(asof):
            continue
        normalized.append(dict(timeUtc=stamp_utc,
            open=_price_string(_bar_value(source,'open'),digits), high=_price_string(_bar_value(source,'high'),digits),
            low=_price_string(_bar_value(source,'low'),digits), close=_price_string(_bar_value(source,'close'),digits),
            tickVolume=_bar_integer(_bar_value(source,'tick_volume')), spread=_bar_integer(_bar_value(source,'spread')),
            realVolume=_bar_integer(_bar_value(source,'real_volume'))))
    normalized.sort(key=lambda bar: models.utc_microseconds(bar['timeUtc']))
    normalized = normalized[-SNAPSHOT_MAX_BARS:]
    if not normalized:
        raise ValueError('completed market bars unavailable')
    digest = hashlib.sha256(models.canonical_bytes(normalized)).hexdigest()
    capture_type = 'ENTRY' if row['entry'] == 'IN' else 'EXIT'
    snapshot_id = trade_snapshot_id(context, row)
    market_ref_id = 'bars_' + digest[:48]
    body = dict(snapshotId=snapshot_id, accountId=context.account_id,
        positionIdentifier=models.ticket(row['positionIdentifier']), dealTicket=models.ticket(row['ticket']),
        captureType=capture_type, asOfUtc=asof,
        chartView=dict(symbol=row['symbol'],timeframe=timeframe,fromUtc=normalized[0]['timeUtc'],toUtc=normalized[-1]['timeUtc'],
                       seriesType='CANDLE',priceScale='NORMAL'),
        marketDataRef=dict(id=market_ref_id,sourceType='MARKET_BAR',accountId=context.account_id,
            brokerServer=context.broker_server,symbol=row['symbol'],eventTimeUtc=normalized[-1]['timeUtc'],
            recordedAtUtc=captured,sourceRevision=digest,confidenceKind='OBSERVED'),
        indicatorInstanceRevisions=[],decisionEventIds=list(decision_event_ids or []),lifecycleEventIds=[dict(type='LIFECYCLE',
            id='mt5_deal_'+models.ticket(row['ticket']),dataRevision=1)],renderStatus='DATA_ONLY',renderAssetRef=None,
        createdAtUtc=captured,marketData=dict(source='MT5_COMPLETED_BARS',bars=normalized,sha256=digest))
    envelope = dict(schemaVersion=1,type='SNAPSHOT',id=body['snapshotId'],accountId=context.account_id,
        brokerServer=context.broker_server,terminalIdentityHash=context.terminal_identity_hash,
        dataRevision=1,provenance='RECORDED',supersedes=None,payload=body)
    return models.validate_envelope(envelope, context=context)


def parse_demo_allowlist(raw, *, accounts=None):
    """Require explicit, unique demo identities. Funded accounts fail closed."""
    accounts = gateway.ACCOUNTS if accounts is None else accounts
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError('demo account allowlist is required')
    aliases = [part.strip() for part in raw.split(',')]
    if any(not alias for alias in aliases) or len(set(aliases)) != len(aliases):
        raise ValueError('invalid demo account allowlist')
    identities = set()
    for alias in aliases:
        spec = accounts.get(alias)
        if not isinstance(spec, dict) or spec.get('is_demo') is not True:
            raise ValueError('only configured demo accounts may be captured')
        terminal = spec.get('terminal')
        if not isinstance(terminal, str) or not terminal.strip():
            raise ValueError('invalid demo terminal identity')
        identity = ntpath.normcase(ntpath.normpath(terminal))
        if identity in identities:
            raise ValueError('duplicate or invalid demo terminal identity')
        identities.add(identity)
    return tuple(aliases)


def _deal_time(value):
    if type(value) is not int or value < 1:
        raise ValueError('invalid broker deal time')
    seconds, milliseconds = divmod(value, 1000)
    return models.utc_timestamp((datetime.fromtimestamp(seconds, timezone.utc) +
                                 timedelta(milliseconds=milliseconds)).isoformat(timespec='microseconds'))


def _exact_decision_refs(context, deal_row, records, *, has_more, fill_utc):
    """Return one unambiguous recorded decision bound to this exact broker deal."""
    if has_more or not isinstance(records, list):
        return []
    fill_us = models.utc_microseconds(fill_utc)
    start_us = fill_us - DECISION_LOOKBACK_SECONDS * 1_000_000
    deal_ticket = models.ticket(deal_row['ticket'])
    position_ticket = models.ticket(deal_row['positionIdentifier'])
    latest_by_id = {}
    for record in records:
        if (not isinstance(record, dict) or record.get('type') != 'DECISION' or
                not isinstance(record.get('id'), str) or not isinstance(record.get('dataRevision'), int)):
            continue
        prior = latest_by_id.get(record['id'])
        if prior is None or record['dataRevision'] > prior['dataRevision']:
            latest_by_id[record['id']] = record
    matching = {}
    for record in latest_by_id.values():
        payload = record.get('payload')
        if not isinstance(payload, dict):
            continue
        try:
            decision_us = models.utc_microseconds(payload['decisionTimeUtc'])
            revision = record['dataRevision']
        except (KeyError, TypeError, ValueError):
            continue
        if not isinstance(revision, int) or decision_us < start_us or decision_us > fill_us:
            continue
        tickets_match = False
        if payload.get('stage') == 'BROKER_RESULT':
            try:
                tickets_match = (models.ticket(payload['brokerDealTicket']) == deal_ticket and
                                 models.ticket(payload['brokerPositionTicket']) == position_ticket)
            except (KeyError, TypeError, ValueError):
                tickets_match = False
        elif payload.get('stage') == 'ORDER_ATTEMPT' and payload.get('outcome') == 'PASS':
            attempt = payload.get('orderAttempt')
            try:
                order_ticket = models.ticket(deal_row['orderTicket'])
                tickets_match = (models.ticket(payload['brokerTicket']) == order_ticket and
                                 isinstance(attempt, dict) and
                                 models.ticket(attempt['brokerTicket']) == order_ticket and
                                 models.utc_microseconds(attempt['requestTimeUtc']) <= fill_us and
                                 models.utc_microseconds(attempt['ackTimeUtc']) <= fill_us)
            except (KeyError, TypeError, ValueError):
                tickets_match = False
        if (payload.get('accountId') != context.account_id or
                payload.get('terminalIdentityHash') != context.terminal_identity_hash or
                payload.get('stage') not in ('BROKER_RESULT', 'ORDER_ATTEMPT') or
                payload.get('symbol') != deal_row['symbol'] or
                payload.get('timeframe') != deal_row.get('timeframe', 'M15') or not tickets_match):
            continue
        matching[record['id']] = record
    if len(matching) != 1:
        return []
    record = next(iter(matching.values()))
    return [dict(type='DECISION', id=record['id'], dataRevision=record['dataRevision'])]


def _snapshot_revision_with_decisions(context, record, decision_refs, captured_at):
    """Append only decision references while preserving all frozen snapshot facts."""
    payload = record.get('payload')
    if not isinstance(payload, dict):
        raise ValueError('invalid existing snapshot payload')
    prior_refs = payload.get('decisionEventIds', [])
    merged = {(ref['id'], ref['dataRevision']): ref for ref in prior_refs}
    merged.update({(ref['id'], ref['dataRevision']): ref for ref in decision_refs})
    if len(merged) == len(prior_refs):
        return None
    revised = copy.deepcopy(record)
    revised['dataRevision'] = record['dataRevision'] + 1
    revised['supersedes'] = dict(type='SNAPSHOT', id=record['id'],
        dataRevision=record['dataRevision'])
    revised['payload']['decisionEventIds'] = list(merged.values())
    revised['payload']['createdAtUtc'] = captured_at
    return models.validate_envelope(revised, context=context)


def _money_string(value):
    """Fit MT5's binary-float text to the evidence schema's 12-place decimal contract."""
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError('invalid broker amount')
    try:
        amount = Decimal(value)
        if not amount.is_finite():
            raise ValueError('invalid broker amount')
        normalized = amount.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError('invalid broker amount') from exc
    text = format(normalized, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return models.decimal_string(text or '0', signed=True)


def deal_envelope(context, row, captured_at_utc):
    """Map one normalized, MT5-verified execution to an immutable lifecycle fact."""
    if not isinstance(context, models.AccountContext) or type(row) is not dict:
        raise ValueError('invalid broker deal')
    spec = gateway.ACCOUNTS.get(context.account_id)
    if not spec or spec.get('is_demo') is not True:
        raise ValueError('demo account required')
    captured = models.utc_timestamp(captured_at_utc)
    if (row.get('source') != 'MT5_VERIFIED' or row.get('canExecute') is not False or
            row.get('account') != context.account_id or row.get('login') != str(spec['login']) or
            row.get('server') != context.broker_server or row.get('status') != 'EXECUTED' or
            row.get('type') not in ('BUY', 'SELL') or row.get('symbol') != spec.get('symbol')):
        raise ValueError('unverified or out-of-scope broker deal')
    entry = row.get('entry')
    if entry not in ('IN', 'OUT', 'INOUT', 'OUT_BY'):
        raise ValueError('unknown broker deal entry')
    fill_time = row.get('fillTime')
    if type(fill_time) is not dict or set(fill_time) != {'rawBrokerEpochMs', 'utcEpochMs', 'brokerUtcOffsetSeconds', 'offsetSource'}:
        raise ValueError('invalid broker deal time provenance')
    if (type(fill_time['rawBrokerEpochMs']) is not int or type(fill_time['utcEpochMs']) is not int or
            type(fill_time['brokerUtcOffsetSeconds']) is not int or
            abs(fill_time['brokerUtcOffsetSeconds']) > 86400 or fill_time['offsetSource'] != 'ACCOUNT_CONFIG' or
            fill_time['rawBrokerEpochMs'] - fill_time['brokerUtcOffsetSeconds'] * 1000 != fill_time['utcEpochMs']):
        raise ValueError('invalid broker deal time provenance')
    as_of = _deal_time(fill_time['utcEpochMs'])
    if models.utc_microseconds(as_of) > models.utc_microseconds(captured):
        raise ValueError('broker deal time is after capture time')
    deal_ticket = models.ticket(row.get('ticket'))
    position = models.ticket(row.get('positionIdentifier'))
    order = models.ticket(row.get('orderTicket'))
    event_type = {'IN': 'ENTRY', 'OUT': 'EXIT', 'OUT_BY': 'EXIT', 'INOUT': 'POSITION_OBSERVED'}[entry]
    body = {
        'id': 'mt5_deal_' + deal_ticket,
        'accountId': context.account_id,
        'positionIdentifier': position,
        'eventType': event_type,
        'source': 'MT5_DEAL',
        'symbol': row['symbol'],
        'asOfUtc': as_of,
        'actor': 'BROKER',
        'dataQuality': 'OBSERVED',
        'orderTicket': order,
        'dealTicket': deal_ticket,
        'dealEntry': entry,
        'dealSide': row['type'],
        'price': models.decimal_string(row.get('price')),
        'volume': models.decimal_string(row.get('volume')),
        'capturedAtUtc': captured,
    }
    for field in ('commission', 'fee', 'swap', 'profit'):
        if field in row:
            body[field] = _money_string(row[field])
    body = models.seal_lifecycle(body, context=context)
    envelope = {
        'schemaVersion': 1, 'type': 'LIFECYCLE', 'id': body['id'],
        'accountId': context.account_id, 'brokerServer': context.broker_server,
        'terminalIdentityHash': context.terminal_identity_hash,
        'dataRevision': 1, 'provenance': 'RECORDED', 'supersedes': None, 'payload': body,
    }
    return models.validate_envelope(envelope, context=context)


def capture_deals(store, context, rows, captured_at_utc):
    """Append a batch, preserving per-record failures and duplicate idempotency."""
    result = {'code': 'OK', 'appended': 0, 'duplicates': 0, 'rejected': 0, 'storeLostCount': 0}
    for row in rows:
        try:
            envelope = deal_envelope(context, row, captured_at_utc)
        except Exception:
            result['rejected'] += 1
            result['code'] = 'CAPTURE_INCOMPLETE'
            continue
        try:
            outcome = store.append(context, envelope)
        except Exception:
            result['storeLostCount'] += 1
            result['code'] = 'STORE_UNAVAILABLE'
            continue
        if not isinstance(outcome, dict):
            result['storeLostCount'] = max(result['storeLostCount'], 1)
            result['code'] = 'STORE_UNAVAILABLE'
        elif outcome.get('ok') is not True and outcome.get('code') == 'CONFLICT':
            result['rejected'] += 1
            result['code'] = 'CAPTURE_INCOMPLETE'
        elif outcome.get('ok') is not True:
            result['storeLostCount'] = max(result['storeLostCount'], outcome.get('lostCount', 1))
            result['code'] = 'STORE_UNAVAILABLE'
        elif outcome.get('code') == 'IDEMPOTENT':
            result['duplicates'] += 1
        elif outcome.get('code') == 'APPENDED':
            result['appended'] += 1
        else:
            result['code'] = 'CAPTURE_INCOMPLETE'
            result['rejected'] += 1
    return result


class DemoBrokerLifecycleCapture:
    """Poll demo deal history under the verified account lock, off the event loop."""
    def __init__(self, store, mt5, accounts, *, clock=time.time):
        if not getattr(store, 'root', None) or mt5 is None:
            raise ValueError('private store and MT5 adapter are required')
        self.store, self.mt5, self.accounts, self.clock = store, mt5, tuple(accounts), clock
        # Validate even when callers bypass parse_demo_allowlist.
        parse_demo_allowlist(','.join(self.accounts))
        self._last_scan_us = {}
        self._gap_observed = {name: False for name in self.accounts}
        self.status = {name: {'code': 'NOT_STARTED', 'coverage': 'UNKNOWN', 'appended': 0,
                              'duplicates': 0, 'rejected': 0, 'storeLostCount': 0}
                       for name in self.accounts}

    def poll_once(self):
        for account in self.accounts:
            try:
                self.status[account] = self._poll_account(account)
            except Exception:
                # Keep the app available; details may contain terminal/provider data.
                self._gap_observed[account] = True
                self.status[account] = {'code': 'BROKER_READ_UNAVAILABLE', 'coverage': 'UNKNOWN',
                                        'gapObserved': True, 'appended': 0, 'duplicates': 0,
                                        'rejected': 0, 'storeLostCount': 0}
        return {name: dict(value) for name, value in self.status.items()}

    def _poll_account(self, account):
        now = self.clock()
        observed_us = history_cursor.observed_us(now)
        start = self._last_scan_us.get(account, observed_us - INITIAL_LOOKBACK_SECONDS * 1_000_000)
        start = max(0, start - OVERLAP_SECONDS * 1_000_000)
        stop = observed_us
        if stop <= start:
            start = max(0, stop - 1_000_000)
        captured_at = history_cursor.utc_text(observed_us)
        aggregate = {'code': 'OK', 'coverage': 'ROLLING_WINDOW', 'windowStartUtc': history_cursor.utc_text(start),
                     'appended': 0, 'duplicates': 0, 'rejected': 0, 'storeLostCount': 0,
                     'gapObserved': self._gap_observed[account], 'snapshotCoverage':'ROLLING_WINDOW',
                     'snapshotsAppended':0, 'snapshotDuplicates':0, 'snapshotUnavailable':0,
                     'snapshotStoreLostCount':0}
        cursor = None
        spec = gateway.ACCOUNTS[account]
        if spec.get('is_demo') is not True:
            raise ValueError('demo account required')
        for page_index in range(MAX_PAGES_PER_ACCOUNT):
            # Release the shared terminal lock between bounded history pages.
            with gateway.traced_session(self.mt5, account) as verified_spec:
                if verified_spec is not spec and (verified_spec.get('login'), verified_spec.get('server'), verified_spec.get('terminal')) != (spec['login'], spec['server'], spec['terminal']):
                    raise ValueError('terminal identity changed during history scan')
                page = broker_reads.trades_read(self.mt5, spec, spec['symbol'], start, stop,
                                                limit=PAGE_SIZE, cursor=cursor, now=now)
            captured = capture_deals(self.store, models.AccountContext.from_config(account),
                                     page['trades'], captured_at)
            for key in ('appended', 'duplicates', 'rejected'):
                aggregate[key] += captured[key]
            aggregate['storeLostCount'] = max(aggregate['storeLostCount'], captured['storeLostCount'])
            if captured['code'] != 'OK':
                aggregate['code'] = captured['code']
                aggregate['coverage'] = 'UNKNOWN'
                aggregate['gapObserved'] = True
                self._gap_observed[account] = True
                return aggregate
            for deal_row in page['trades']:
                if deal_row.get('entry') not in ('IN','OUT','OUT_BY'):
                    continue
                try:
                    context = models.AccountContext.from_config(account)
                    snapshot_id = trade_snapshot_id(context, deal_row)
                    existing = self.store.read(context, kind='SNAPSHOT', record_id=snapshot_id)
                    existing_rows = existing.get('records') if isinstance(existing, dict) else None
                    if existing_rows:
                        record = existing_rows[0]
                        if (len(existing_rows) != 1 or not isinstance(record, dict) or
                                record.get('type') != 'SNAPSHOT' or record.get('id') != snapshot_id or
                                record.get('accountId') != account or not isinstance(record.get('dataRevision'), int)):
                            raise ValueError('invalid existing snapshot record')
                        decision_refs = self._decision_refs_for_deal(context, deal_row, spec)
                        revised = _snapshot_revision_with_decisions(context, record, decision_refs, captured_at)
                        if revised is not None:
                            outcome = self.store.append(context, revised)
                            if outcome.get('ok') is True and outcome.get('code') == 'APPENDED':
                                aggregate['snapshotsAppended'] += 1
                            elif outcome.get('ok') is not True:
                                aggregate['snapshotStoreLostCount'] += max(1, outcome.get('lostCount', 0))
                                aggregate['snapshotCoverage'] = 'UNKNOWN'
                            else:
                                aggregate['snapshotDuplicates'] += 1
                            continue
                        aggregate['snapshotDuplicates'] += 1
                        continue
                    decision_refs = self._decision_refs_for_deal(context, deal_row, spec)
                    snapshot = self._snapshot_for_deal(account, deal_row, captured_at, spec, decision_refs)
                    outcome = self.store.append(context, snapshot)
                    if outcome.get('ok') is not True:
                        aggregate['snapshotStoreLostCount'] += max(1, outcome.get('lostCount', 0))
                        aggregate['snapshotCoverage'] = 'UNKNOWN'
                    elif outcome.get('code') == 'APPENDED':
                        aggregate['snapshotsAppended'] += 1
                    elif outcome.get('code') == 'IDEMPOTENT':
                        aggregate['snapshotDuplicates'] += 1
                    else:
                        aggregate['snapshotUnavailable'] += 1
                        aggregate['snapshotCoverage'] = 'UNKNOWN'
                except Exception:
                    # A missing/invalid bar series never invalidates the separately captured deal.
                    aggregate['snapshotUnavailable'] += 1
                    aggregate['snapshotCoverage'] = 'UNKNOWN'
            cursor = page.get('nextCursor')
            if cursor is None:
                self._last_scan_us[account] = stop
                aggregate['gapObserved'] = self._gap_observed[account]
                return aggregate
        aggregate.update(code='PAGE_LIMIT', coverage='UNKNOWN')
        aggregate['gapObserved'] = True
        self._gap_observed[account] = True
        return aggregate

    def _decision_refs_for_deal(self, context, row, spec):
        fill_utc = _deal_time(row['fillTime']['utcEpochMs'])
        fill_us = models.utc_microseconds(fill_utc)
        result = self.store.read(context, kind='DECISION',
            start=max(0, fill_us - DECISION_LOOKBACK_SECONDS * 1_000_000), end=fill_us,
            filters={'symbol': row['symbol']}, limit=500)
        if not isinstance(result, dict):
            return []
        records = result.get('records')
        if result.get('hasMore') is True or not isinstance(records, list):
            return []
        latest = []
        for event_id in dict.fromkeys(item.get('id') for item in records
                                      if isinstance(item, dict) and item.get('type') == 'DECISION'
                                      and isinstance(item.get('id'), str)):
            current = self.store.read(context, kind='DECISION', record_id=event_id)
            current_rows = current.get('records') if isinstance(current, dict) else None
            if not isinstance(current_rows, list) or len(current_rows) != 1:
                return []
            latest.append(current_rows[0])
        return _exact_decision_refs(context, row, latest, has_more=False, fill_utc=fill_utc)

    def _snapshot_for_deal(self, account, row, captured_at, spec, decision_refs=None):
        timeframe = spec.get('timeframe', 'M15')
        seconds = TIMEFRAME_SECONDS.get(timeframe)
        reader = getattr(self.mt5, 'copy_rates_range', None)
        if not seconds or not callable(reader):
            raise ValueError('broker bar history unavailable')
        epoch_ms = row['fillTime']['utcEpochMs']
        stop = datetime.fromtimestamp(epoch_ms / 1000, timezone.utc)
        start = stop - timedelta(seconds=seconds * SNAPSHOT_MAX_BARS)
        with gateway.traced_session(self.mt5, account) as verified_spec:
            if (verified_spec is not spec and
                    (verified_spec.get('login'),verified_spec.get('server'),verified_spec.get('terminal')) !=
                    (spec['login'],spec['server'],spec['terminal'])):
                raise ValueError('terminal identity changed during snapshot read')
            info = broker_reads.require_symbol(self.mt5, spec['symbol'])
            digits = getattr(info, 'digits', None)
            timeframe_value = getattr(self.mt5, 'TIMEFRAME_'+timeframe, None)
            if type(digits) is not int or timeframe_value is None:
                raise ValueError('broker bar metadata unavailable')
            with broker_telemetry.span('mt5_rates', count=SNAPSHOT_MAX_BARS):
                raw = reader(spec['symbol'], timeframe_value, start, stop)
        if raw is None:
            raise ValueError('broker bar history unavailable')
        return trade_snapshot_envelope(models.AccountContext.from_config(account),row,list(raw),
            captured_at_utc=captured_at,timeframe=timeframe,digits=digits,
            decision_event_ids=decision_refs)


async def run_demo_broker_lifecycle_capture(app, service, *, interval=POLL_SECONDS, poll=asyncio.to_thread):
    """Poll MT5 in a worker thread and isolate failures from request handling."""
    app.state.evidence_deal_capture_status = service.status
    try:
        while True:
            in_flight = asyncio.create_task(poll(service.poll_once))
            try:
                app.state.evidence_deal_capture_status = await asyncio.shield(in_flight)
            except asyncio.CancelledError:
                try:
                    await asyncio.shield(in_flight)
                except Exception:
                    pass
                raise
            except Exception:
                app.state.evidence_deal_capture_status = {
                    name: {'code': 'CAPTURE_UNAVAILABLE', 'coverage': 'UNKNOWN'} for name in service.accounts}
            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        raise
