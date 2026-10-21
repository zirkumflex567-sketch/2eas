"""Authenticated, account-explicit evidence reads; deliberately no write route."""
import base64
import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette._utils import get_route_path
from chart_studio import evidence_models as models
from chart_studio.evidence_store import EvidenceStore, StoreUnavailable, StoreReplaced
from chart_studio.evidence_mfe_mae import estimate_ohlc_mfe_mae, observe_tick_mfe_mae
from chart_studio.execution_quality import analyze_execution_quality
from chart_studio.evidence_spool_service import SpoolFileConsumer, run_spool_service
from chart_studio.broker_lifecycle_capture import (DemoBrokerLifecycleCapture,
    parse_demo_allowlist, run_demo_broker_lifecycle_capture)

DEFAULT_EVIDENCE_PRODUCERS = {
    # Only non-Blueberry source candidates are eligible. The two Marketplace
    # setups have no EA source and must never be labeled Titan.
    'xau5m_m5': 'titan_puprime250',
    'titan_m5': 'titan_puprime500',
    'goldm15': 'goldm15_demo',
}
DEFAULT_EVIDENCE_RECORD_ONLY_PRODUCERS = {
    'xau5m_m5': 'titan_puprime250_recordonly',
    'titan_m5': 'titan_puprime500_recordonly',
    'goldm15': 'goldm15_demo_recordonly',
}


def _evidence_spool_producers():
    return {
        account: tuple(producer for producer in (
            DEFAULT_EVIDENCE_PRODUCERS[account],
            DEFAULT_EVIDENCE_RECORD_ONLY_PRODUCERS.get(account),
        ) if producer)
        for account in DEFAULT_EVIDENCE_PRODUCERS
    }


def _merge_capture_producer_statuses(rows):
    codes = [row.get('code') if isinstance(row, dict) else None for row in rows]
    known_idle_codes = {'IDLE', 'IMPORTED', 'ARCHIVED'}
    if all(code in known_idle_codes for code in codes):
        code = 'IMPORTED' if any(value in ('IMPORTED', 'ARCHIVED') for value in codes) else 'IDLE'
    else:
        code = next((value for value in codes if isinstance(value, str)), None)
    merged = {'code': code}
    for key in ('imported', 'duplicates', 'importedTotal', 'duplicatesTotal',
                'staleTemporaryCount', 'staleTemporaryTotal',
                'temporaryFileCount', 'temporaryBytes', 'gapCount', 'storeLostCount'):
        merged[key] = sum(row.get(key, 0) for row in rows
                          if isinstance(row, dict) and type(row.get(key, 0)) is int and row.get(key, 0) >= 0)
    merged['gapObserved'] = any(
        row.get('gapObserved', False) is True for row in rows if isinstance(row, dict)) or any(
        isinstance(row, dict) and type(row.get('gapObserved', False)) is not bool for row in rows)
    merged['lastIssueCode'] = next((row.get('lastIssueCode') for row in rows
                                    if isinstance(row, dict) and isinstance(row.get('lastIssueCode'), str) and
                                    re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', row['lastIssueCode']) and
                                    row['lastIssueCode'] not in {'IDLE', 'IMPORTED', 'ARCHIVED'}), None)
    for key in ('temporaryOldestMtimeUtc', 'temporaryNewestMtimeUtc'):
        values = []
        for row in rows:
            value = row.get(key) if isinstance(row, dict) else None
            if isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value):
                try:
                    datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')
                except ValueError:
                    continue
                values.append(value)
        merged[key] = (min(values) if key.endswith('OldestMtimeUtc') else max(values)) if values else None
    return merged


class CursorInvalid(Exception):
    pass


class CursorCodec:
    def __init__(self, clock=time.time):
        self.key = secrets.token_bytes(32)
        self.clock = clock

    def encode(self, generation, scope, pin, last):
        body = {'v':1, 'generation':generation, 'scopeHash':scope, 'pinnedMaxSeq':pin,
                'last':last, 'expiryUtc':models.utc_timestamp(datetime.fromtimestamp(self.clock()+900, timezone.utc).isoformat())}
        raw = models.canonical_bytes(body)
        if len(raw) > 1024:
            raise CursorInvalid()
        return base64.urlsafe_b64encode(raw + hmac.digest(self.key, raw, 'sha256')).decode().rstrip('=')

    def decode(self, value, scope):
        try:
            if not isinstance(value, str) or len(value)>2048 or not re.fullmatch('[A-Za-z0-9_-]+', value):
                raise CursorInvalid()
            packed = base64.urlsafe_b64decode(value + '='*((-len(value))%4))
            raw, signature = packed[:-32], packed[-32:]
            if len(raw)>1024 or not hmac.compare_digest(signature, hmac.digest(self.key, raw, 'sha256')):
                raise CursorInvalid()
            body = json.loads(raw)
            if models.canonical_bytes(body)!=raw or set(body)!={'v','generation','scopeHash','pinnedMaxSeq','last','expiryUtc'}:
                raise CursorInvalid()
            last = body['last']
            if (type(body['v']) is not int or body['v']!=1 or body['scopeHash']!=scope or
                    type(body['pinnedMaxSeq']) is not int or body['pinnedMaxSeq']<0 or
                    type(last) is not list or len(last)!=4 or type(last[0]) is not int or
                    type(last[2]) is not int or type(last[3]) is not int or last[3]<1 or last[3]>body['pinnedMaxSeq']):
                raise CursorInvalid()
            models.identifier(last[1]); models.integer(last[2])
            if models.utc_microseconds(body['expiryUtc']) <= int(self.clock()*1000000):
                raise CursorInvalid()
            return body
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            raise CursorInvalid() from exc


def install_evidence_routes(app, *, store=None, clock=time.time, mt5=None):
    """Configure only from explicit private root. GET never initializes files."""
    configuration_error = False
    excluded = [Path(__file__).resolve().parents[1]]
    for route in app.routes:
        mounted = getattr(route, 'app', None)
        if isinstance(mounted, StaticFiles):
            excluded.extend(mounted.all_directories)
    if store is None:
        try:
            root, db_path = os.environ.get('CHART_STUDIO_EVIDENCE_ROOT'), os.environ.get('CHART_STUDIO_EVIDENCE_DB')
            store = EvidenceStore(root if root and db_path else None, db_path=db_path if root and db_path else None, excluded_roots=excluded)
        except StoreUnavailable:
            configuration_error = True
            store = EvidenceStore(None)
    app.state.evidence_store = store
    app.state.evidence_spool_service = None
    app.state.evidence_spool_status = {}
    app.state.evidence_spool_task = None
    app.state.evidence_deal_capture_service = None
    app.state.evidence_deal_capture_status = {}
    app.state.evidence_deal_capture_task = None
    spool_root = os.environ.get('CHART_STUDIO_EVIDENCE_SPOOL_ROOT')
    if spool_root:
        try:
            if not getattr(store, 'root', None) or not getattr(store, 'path', None):
                raise ValueError('evidence store is not configured')
            app.state.evidence_spool_service = SpoolFileConsumer(
                store, spool_root, producers=_evidence_spool_producers(), excluded_roots=excluded)
        except (OSError, ValueError, StoreUnavailable):
            # Keep the dashboard available but expose only a generic internal state.
            app.state.evidence_spool_status = {'service': {'code':'CONFIG_INVALID'}}
        else:
            async def start_spool_service():
                app.state.evidence_spool_task = asyncio.create_task(run_spool_service(app, app.state.evidence_spool_service))

            async def stop_spool_service():
                task = app.state.evidence_spool_task
                if task is None: return
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass
                app.state.evidence_spool_task = None

            app.router.add_event_handler('startup', start_spool_service)
            app.router.add_event_handler('shutdown', stop_spool_service)
    deal_accounts = os.environ.get('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS')
    if deal_accounts:
        try:
            if not store.root or mt5 is None:
                raise ValueError('private store and MT5 adapter are required')
            aliases = parse_demo_allowlist(deal_accounts)
            service = DemoBrokerLifecycleCapture(store, mt5, aliases, clock=clock)
        except (OSError, TypeError, ValueError, StoreUnavailable):
            app.state.evidence_deal_capture_status = {'service': {'code': 'CONFIG_INVALID'}}
        else:
            app.state.evidence_deal_capture_service = service

            async def start_demo_deal_capture():
                app.state.evidence_deal_capture_task = asyncio.create_task(
                    run_demo_broker_lifecycle_capture(app, service))

            async def stop_demo_deal_capture():
                task = app.state.evidence_deal_capture_task
                if task is None: return
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass
                app.state.evidence_deal_capture_task = None

            app.router.add_event_handler('startup', start_demo_deal_capture)
            app.router.add_event_handler('shutdown', stop_demo_deal_capture)
    codec = CursorCodec(clock)
    app.state.evidence_cursors = codec
    paths = ('/api/chart/v1/decisions','/api/chart/v1/lifecycle','/api/chart/v1/snapshots')

    def error(status, code, account=None):
        return JSONResponse({'schemaVersion':1, 'detail':{'code':code, 'canExecute':False, 'coverage':'UNKNOWN',
                            'gaps':store.gaps(account)}},
                            status_code=status, headers={'Cache-Control':'no-store'})

    def tick_observation(account, result):
        if result.get('status') != 'AVAILABLE' and result.get('reason') != 'NO_COMPLETE_CANDLES':
            return {'status': 'UNAVAILABLE', 'reason': 'OHLC_POSITION_UNAVAILABLE'}
        if not all(result.get(key) for key in ('positionIdentifier', 'symbol', 'side',
                                               'entryPrice', 'entryTimeUtc', 'exitTimeUtc')):
            return {'status': 'UNAVAILABLE', 'reason': 'TICK_CONTEXT_UNAVAILABLE'}
        reader = getattr(mt5, 'copy_ticks_range', None)
        flags = getattr(mt5, 'COPY_TICKS_INFO', None)
        if not callable(reader) or type(flags) is not int:
            return {'status': 'UNAVAILABLE', 'reason': 'TICK_SOURCE_UNAVAILABLE'}
        try:
            start_us = models.utc_microseconds(result['entryTimeUtc'])
            stop_us = models.utc_microseconds(result['exitTimeUtc'])
            if stop_us - start_us > 7 * 24 * 60 * 60 * 1_000_000:
                return {'status': 'UNAVAILABLE', 'reason': 'TICK_WINDOW_LIMIT'}
            start = datetime.fromtimestamp(start_us / 1_000_000, timezone.utc)
            stop = datetime.fromtimestamp(stop_us / 1_000_000, timezone.utc)
            with models.gateway.traced_session(mt5, account) as verified_spec:
                if result.get('symbol') != verified_spec.get('symbol'):
                    return {'status': 'UNAVAILABLE', 'reason': 'SYMBOL_SCOPE_MISMATCH'}
                ticks = reader(result['symbol'], start, stop, flags)
            if ticks is None:
                return {'status': 'UNAVAILABLE', 'reason': 'TICK_HISTORY_UNAVAILABLE'}
            if len(ticks) > 1_000_000:
                return {'status': 'UNAVAILABLE', 'reason': 'TICK_COUNT_LIMIT'}
            return observe_tick_mfe_mae(result['positionIdentifier'], result['side'],
                                        result['entryPrice'], start_us, stop_us, ticks)
        except Exception:
            # Terminal/history errors never invalidate the independent OHLC record.
            return {'status': 'UNAVAILABLE', 'reason': 'TICK_HISTORY_UNAVAILABLE'}

    @app.middleware('http')
    async def evidence_headers(request, call_next):
        response = await call_next(request)
        path = get_route_path(request.scope)
        if any(path == p or path.startswith(p + '/') for p in paths):
            identity = getattr(request.state, 'control_identity', None)
            peer = getattr(request.state, 'raw_peer', None)
            authenticated = (isinstance(identity, tuple) and len(identity) == 3 and
                             isinstance(peer, str) and bool(peer))
            if response.status_code == 403 and not authenticated:
                return error(403, 'IDENTITY_REQUIRED')
            if response.status_code == 405:
                return error(405, 'METHOD_NOT_ALLOWED')
            response.headers['Cache-Control'] = 'no-store'
        return response

    def serve(request, kind, record_id=None):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity)!=3 or
                not all(isinstance(x,str) and x for x in identity) or
                identity[0] not in ('local','bearer','proxy') or identity[2] not in ('read','layout','trade') or
                not isinstance(peer,str) or not peer):
            return error(403, 'IDENTITY_REQUIRED')
        params = request.query_params
        account = params.get('account')
        if not isinstance(account,str) or not re.fullmatch('[a-z0-9_-]{1,32}',account):
            return error(422, 'INVALID_ACCOUNT')
        if account not in models.gateway.ACCOUNTS:
            return error(400, 'UNKNOWN_ACCOUNT')
        account_policy = models.gateway.ACCOUNTS[account]
        if account_policy.get('is_demo') is not True or account_policy.get('challenge_protection') is True:
            return JSONResponse({'schemaVersion':1,
                                 'detail':{'code':'DEMO_ACCOUNT_REQUIRED','canExecute':False,
                                           'coverage':'UNKNOWN'}},
                                status_code=403, headers={'Cache-Control':'no-store'})
        context = models.AccountContext.from_config(account)
        cursor = None
        def failure(status, code):
            return error(status, code, account)
        try:
            allowed = {'account','revision'} if record_id else {'account','fromUtc','toUtc','limit','cursor','symbol','strategyId','positionIdentifier'}
            if any(k not in allowed or len(params.getlist(k))!=1 for k in params):
                raise ValueError()
            filters = {}
            if record_id:
                models.identifier(record_id)
                revision = None
                if 'revision' in params:
                    if not re.fullmatch('[1-9][0-9]{0,9}', params['revision']):
                        raise ValueError()
                    revision = models.integer(int(params['revision']))
                if configuration_error:
                    raise StoreUnavailable()
                result = store.read(context, kind=kind, record_id=record_id, revision=revision)
                if not result['records']:
                    return failure(404, 'RECORD_NOT_FOUND')
                record = result.pop('records')[0]
                result['record'] = record
                if revision is None:
                    result['latestRevision'] = record['dataRevision']
            else:
                start = models.utc_microseconds(params.get('fromUtc'))
                end = models.utc_microseconds(params.get('toUtc'))
                if not 0<=end-start<=31*86400*1000000:
                    raise ValueError()
                text_limit = params.get('limit','100')
                if not re.fullmatch('[1-9][0-9]{0,2}', text_limit) or not 1<=int(text_limit)<=200:
                    raise ValueError()
                limit = int(text_limit)
                if 'symbol' in params:
                    if kind == 'LIFECYCLE':
                        raise ValueError()
                    filters['symbol'] = models.broker_symbol(params['symbol'])
                if 'strategyId' in params:
                    if kind != 'DECISION':
                        raise ValueError()
                    filters['strategy'] = models.identifier(params['strategyId'])
                if 'positionIdentifier' in params:
                    if kind == 'DECISION':
                        raise ValueError()
                    filters['position_id'] = models.ticket(params['positionIdentifier'])
                scope = hashlib.sha256(models.canonical_bytes([list(identity),peer,account,context.terminal_identity_hash,kind,filters,start,end,limit])).hexdigest()
                cursor = codec.decode(params['cursor'],scope) if 'cursor' in params else None
                if configuration_error:
                    raise StoreUnavailable()
                result = store.read(context,kind=kind,start=start,end=end,filters=filters,limit=limit,
                                    pinned=cursor['pinnedMaxSeq'] if cursor else None,last=cursor['last'] if cursor else None)
                if cursor and result['generation']!=cursor['generation']:
                    raise CursorInvalid()
                result['nextCursor'] = codec.encode(result['generation'],scope,result['pinnedMaxSeq'],result['last']) if result['hasMore'] else None
            for internal in ('generation','pinnedMaxSeq','last','hasMore'):
                result.pop(internal,None)
            return JSONResponse(result, headers={'Cache-Control':'no-store'})
        except CursorInvalid:
            return failure(410, 'CURSOR_INVALID_OR_EXPIRED')
        except (ValueError, TypeError):
            return failure(422, 'INVALID_REQUEST')
        except StoreReplaced:
            return failure(410, 'CURSOR_INVALID_OR_EXPIRED') if cursor else failure(503, 'STORE_UNAVAILABLE')
        except StoreUnavailable:
            return failure(503, 'STORE_UNAVAILABLE')

    @app.get(paths[0] + '/capture/status')
    def decision_capture_status(request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                not all(isinstance(x, str) and x for x in identity) or
                identity[0] not in ('local', 'bearer', 'proxy') or
                identity[2] not in ('read', 'layout', 'trade') or
                not isinstance(peer, str) or not peer):
            return error(403, 'IDENTITY_REQUIRED')
        params = request.query_params
        account = params.get('account')
        if (set(params) != {'account'} or len(params.getlist('account')) != 1 or
                not isinstance(account, str) or not re.fullmatch('[a-z0-9_-]{1,32}', account)):
            return error(422, 'INVALID_REQUEST')
        spec = models.gateway.ACCOUNTS.get(account)
        if spec is None:
            return error(400, 'UNKNOWN_ACCOUNT')
        if spec.get('is_demo') is not True or spec.get('challenge_protection') is True:
            # Do not touch any account-scoped store/MT5 state for protected accounts.
            return error(403, 'DEMO_ACCOUNT_REQUIRED')

        producer = DEFAULT_EVIDENCE_PRODUCERS.get(account)
        if producer is None:
            status = {'code': 'NOT_CONFIGURED', 'imported': 0, 'duplicates': 0,
                      'importedTotal': 0, 'duplicatesTotal': 0,
                      'staleTemporaryCount': 0, 'staleTemporaryTotal': 0,
                      'temporaryFileCount': 0, 'temporaryBytes': 0,
                      'temporaryOldestMtimeUtc': None, 'temporaryNewestMtimeUtc': None,
                      'gapCount': 0, 'gapObserved': False, 'storeLostCount': 0,
                      'lastIssueCode': None, 'recordingState': 'NOT_RECORDED'}
        else:
            producer_ids = (producer,)
            record_only_producer = DEFAULT_EVIDENCE_RECORD_ONLY_PRODUCERS.get(account)
            if record_only_producer:
                producer_ids += (record_only_producer,)
            producer_rows = [app.state.evidence_spool_status.get(producer_id)
                             for producer_id in producer_ids]
            raw_status = (_merge_capture_producer_statuses(producer_rows)
                          if len(producer_rows) > 1 else producer_rows[0])
            if raw_status is None:
                raw_status = {}
            code = raw_status.get('code')
            if not isinstance(code, str) or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
                if app.state.evidence_spool_status.get('service', {}).get('code') == 'CONFIG_INVALID':
                    code = 'SPOOL_UNAVAILABLE'
                elif app.state.evidence_spool_service is None and app.state.evidence_spool_task is None:
                    code = 'NOT_STARTED'
                elif app.state.evidence_spool_task is None:
                    code = 'NOT_STARTED'
                else:
                    code = 'NOT_RECORDED'
            status = {'code': code}
            for key in ('imported', 'duplicates', 'importedTotal', 'duplicatesTotal',
                        'staleTemporaryCount', 'staleTemporaryTotal',
                        'temporaryFileCount', 'temporaryBytes', 'gapCount', 'storeLostCount'):
                value = raw_status.get(key, 0)
                status[key] = value if type(value) is int and value >= 0 else 0
            last_issue_code = raw_status.get('lastIssueCode')
            status['lastIssueCode'] = (last_issue_code if isinstance(last_issue_code, str) and
                                       re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', last_issue_code) and
                                       last_issue_code not in {'IDLE', 'IMPORTED', 'ARCHIVED'} else None)
            for key in ('temporaryOldestMtimeUtc', 'temporaryNewestMtimeUtc'):
                value = raw_status.get(key)
                if isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value):
                    try:
                        datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')
                    except ValueError:
                        value = None
                else:
                    value = None
                status[key] = value
            gap_observed = raw_status.get('gapObserved', False)
            status['gapObserved'] = gap_observed if type(gap_observed) is bool else True
            try:
                recorded = store.read(models.AccountContext.from_config(account), kind='DECISION', limit=1)
                status['recordingState'] = 'RECORDED' if recorded.get('records') else 'NOT_RECORDED'
            except (StoreUnavailable, AttributeError, TypeError, ValueError):
                status['recordingState'] = 'UNKNOWN'
        return JSONResponse({'schemaVersion': 1, 'account': account, 'canExecute': False,
                             'status': status}, headers={'Cache-Control': 'no-store'})

    @app.get(paths[0])
    def decisions(request: Request):
        return serve(request,'DECISION')

    @app.get(paths[0] + '/execution-quality')
    def execution_quality(request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                not all(isinstance(x, str) and x for x in identity) or
                identity[0] not in ('local', 'bearer', 'proxy') or
                identity[2] not in ('read', 'layout', 'trade') or
                not isinstance(peer, str) or not peer):
            return error(403, 'IDENTITY_REQUIRED')
        params = request.query_params
        account = params.get('account')
        if (not isinstance(account, str) or not re.fullmatch('[a-z0-9_-]{1,32}', account) or
                any(len(params.getlist(key)) != 1 for key in params)):
            return error(422, 'INVALID_REQUEST')
        spec = models.gateway.ACCOUNTS.get(account)
        if spec is None:
            return error(400, 'UNKNOWN_ACCOUNT')
        if spec.get('is_demo') is not True or spec.get('challenge_protection') is True:
            return error(403, 'DEMO_ACCOUNT_REQUIRED')
        try:
            allowed = {'account', 'fromUtc', 'toUtc', 'symbol', 'minimumSamples'}
            if set(params) - allowed or not {'fromUtc', 'toUtc', 'symbol'} <= set(params):
                raise ValueError()
            start, end = models.utc_microseconds(params['fromUtc']), models.utc_microseconds(params['toUtc'])
            if not 0 <= end - start <= 31 * 86400 * 1000000:
                raise ValueError()
            symbol = models.broker_symbol(params['symbol'])
            minimum_text = params.get('minimumSamples', '20')
            if not re.fullmatch('[1-9][0-9]{0,2}', minimum_text) or int(minimum_text) > 1000:
                raise ValueError()
            if configuration_error:
                raise StoreUnavailable()
            context = models.AccountContext.from_config(account)

            def read_all(kind):
                records, pinned, generation, last = [], None, None, None
                for _ in range(50):
                    page = store.read(context, kind=kind, start=start, end=end,
                                      filters={'symbol': symbol} if kind == 'DECISION' else {},
                                      limit=200, pinned=pinned, last=last)
                    if generation is not None and page.get('generation') != generation:
                        raise StoreReplaced()
                    generation = page.get('generation')
                    pinned = page.get('pinnedMaxSeq')
                    records.extend(page.get('records') or [])
                    if len(records) > 10_000:
                        raise ValueError()
                    if not page.get('hasMore'):
                        return records
                    last = page.get('last')
                raise ValueError()

            decisions_rows = read_all('DECISION')
            lifecycle_rows = read_all('LIFECYCLE')
            result = analyze_execution_quality(decisions_rows, lifecycle_rows, account_id=account,
                                               symbol=symbol, minimum_samples=int(minimum_text))
            result['range'] = {'fromUtc': params['fromUtc'], 'toUtc': params['toUtc']}
            result['evidenceCounts'] = {'decisions': len(decisions_rows), 'lifecycle': len(lifecycle_rows)}
            return JSONResponse(result, headers={'Cache-Control': 'no-store'})
        except StoreReplaced:
            return error(503, 'STORE_UNAVAILABLE', account)
        except (ValueError, TypeError):
            return error(422, 'INVALID_REQUEST', account)
        except StoreUnavailable:
            return error(503, 'STORE_UNAVAILABLE', account)

    @app.get(paths[0]+'/{record_id}')
    def decision(record_id: str, request: Request):
        return serve(request,'DECISION',record_id)

    @app.get(paths[1])
    def lifecycle(request: Request):
        return serve(request,'LIFECYCLE')

    @app.get(paths[1] + '/capture/status')
    def lifecycle_capture_status(request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                not all(isinstance(x, str) and x for x in identity) or
                identity[0] not in ('local', 'bearer', 'proxy') or
                identity[2] not in ('read', 'layout', 'trade') or
                not isinstance(peer, str) or not peer):
            return error(403, 'IDENTITY_REQUIRED')
        params = request.query_params
        account = params.get('account')
        service = app.state.evidence_deal_capture_service
        if (set(params) != {'account'} or len(params.getlist('account')) != 1 or
                not isinstance(account, str) or not re.fullmatch('[a-z0-9_-]{1,32}', account)):
            return error(422, 'INVALID_REQUEST')
        spec = models.gateway.ACCOUNTS.get(account)
        if spec is None:
            return error(400, 'UNKNOWN_ACCOUNT')
        if spec.get('is_demo') is not True or spec.get('challenge_protection') is True:
            return error(400, 'UNKNOWN_ACCOUNT')
        if service is None or account not in service.accounts:
            if app.state.evidence_deal_capture_status.get('service', {}).get('code') == 'CONFIG_INVALID':
                return error(503, 'CAPTURE_UNAVAILABLE', account)
            return JSONResponse({'schemaVersion': 1, 'account': account,
                                 'status': {'code': 'NOT_CONFIGURED', 'coverage': 'UNKNOWN'}},
                                headers={'Cache-Control': 'no-store'})
        status = app.state.evidence_deal_capture_status.get(account, {})
        if not isinstance(status, dict) or not status:
            return JSONResponse({'schemaVersion': 1, 'account': account,
                                 'status': {'code': 'NOT_STARTED', 'coverage': 'UNKNOWN'}},
                                headers={'Cache-Control': 'no-store'})
        allowed = ('code', 'coverage', 'appended', 'duplicates', 'rejected',
                   'storeLostCount', 'gapObserved', 'windowStartUtc','snapshotCoverage',
                   'snapshotsAppended','snapshotDuplicates','snapshotUnavailable','snapshotStoreLostCount')
        safe_status = {key: status[key] for key in allowed if key in status}
        gap_observed = status.get('gapObserved', False)
        if type(gap_observed) is not bool:
            gap_observed = True
        safe_status['gapObserved'] = gap_observed
        if gap_observed:
            reason = status.get('gapReason')
            allowed_gap_reasons = {
                'BROKER_READ_UNAVAILABLE', 'STORE_UNAVAILABLE',
                'CAPTURE_INCOMPLETE', 'PAGE_LIMIT', 'UNKNOWN'}
            safe_status['gapReason'] = (reason if isinstance(reason, str)
                                        and reason in allowed_gap_reasons else 'UNKNOWN')
        if not safe_status:
            safe_status = {'code': 'NOT_STARTED', 'coverage': 'UNKNOWN'}
        return JSONResponse({'schemaVersion': 1, 'account': account, 'status': safe_status},
                            headers={'Cache-Control': 'no-store'})

    @app.get(paths[1] + '/positions/{position_id}/mfe-mae')
    def lifecycle_position_mfe_mae(position_id: str, request: Request):
        identity = getattr(request.state, 'control_identity', None)
        peer = getattr(request.state, 'raw_peer', None)
        if (not isinstance(identity, tuple) or len(identity) != 3 or
                not all(isinstance(x, str) and x for x in identity) or
                identity[0] not in ('local', 'bearer', 'proxy') or
                identity[2] not in ('read', 'layout', 'trade') or
                not isinstance(peer, str) or not peer):
            return error(403, 'IDENTITY_REQUIRED')
        params = request.query_params
        account = params.get('account')
        if (set(params) != {'account'} or len(params.getlist('account')) != 1 or
                not isinstance(account, str) or not re.fullmatch('[a-z0-9_-]{1,32}', account)):
            return error(422, 'INVALID_REQUEST')
        spec = models.gateway.ACCOUNTS.get(account)
        if spec is None:
            return error(400, 'UNKNOWN_ACCOUNT')
        if spec.get('is_demo') is not True or spec.get('challenge_protection') is True:
            return error(403, 'DEMO_ACCOUNT_REQUIRED')
        try:
            position_id = models.ticket(position_id)
            if configuration_error:
                raise StoreUnavailable()
            context = models.AccountContext.from_config(account)
            lifecycle = store.read(context, kind='LIFECYCLE', filters={'position_id': position_id}, limit=201)
            snapshots = store.read(context, kind='SNAPSHOT', filters={'position_id': position_id}, limit=201)
            if lifecycle.get('hasMore') or snapshots.get('hasMore'):
                result = {'status': 'UNAVAILABLE', 'reason': 'POSITION_HISTORY_LIMIT'}
            else:
                result = estimate_ohlc_mfe_mae(position_id, lifecycle.get('records'), snapshots.get('records'))
                result['tickObservation'] = tick_observation(account, result)
            return JSONResponse({'schemaVersion': 1, 'account': account, 'canExecute': False,
                                 'result': result}, headers={'Cache-Control': 'no-store'})
        except (StoreUnavailable, StoreReplaced):
            return error(503, 'STORE_UNAVAILABLE', account)
        except (ValueError, TypeError):
            return error(422, 'INVALID_REQUEST', account)

    @app.get(paths[2])
    def snapshots(request: Request):
        return serve(request,'SNAPSHOT')

    @app.get(paths[2]+'/{record_id}')
    def snapshot(record_id: str, request: Request):
        return serve(request,'SNAPSHOT',record_id)

    @app.get(paths[1]+'/{record_id}')
    def lifecycle_record(record_id: str, request: Request):
        return serve(request,'LIFECYCLE',record_id)
