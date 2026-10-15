"""Opt-in, read-only capture of verified MT5 deal facts for demo accounts."""
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import ntpath
import time

import account_gateway as gateway
from chart_studio import broker_reads, history_cursor
from chart_studio import evidence_models as models

POLL_SECONDS = 60.0
INITIAL_LOOKBACK_SECONDS = 48 * 60 * 60
OVERLAP_SECONDS = 5 * 60
PAGE_SIZE = 500
MAX_PAGES_PER_ACCOUNT = 100
MONEY_QUANTUM = Decimal('0.000000000001')


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
                     'gapObserved': self._gap_observed[account]}
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
            cursor = page.get('nextCursor')
            if cursor is None:
                self._last_scan_us[account] = stop
                aggregate['gapObserved'] = self._gap_observed[account]
                return aggregate
        aggregate.update(code='PAGE_LIMIT', coverage='UNKNOWN')
        aggregate['gapObserved'] = True
        self._gap_observed[account] = True
        return aggregate


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
