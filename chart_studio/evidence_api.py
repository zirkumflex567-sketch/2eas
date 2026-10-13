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
from chart_studio.evidence_spool_service import SpoolFileConsumer, run_spool_service


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


def install_evidence_routes(app, *, store=None, clock=time.time):
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
    spool_root = os.environ.get('CHART_STUDIO_EVIDENCE_SPOOL_ROOT')
    if spool_root:
        try:
            if not store.root:
                raise ValueError('evidence store is not configured')
            app.state.evidence_spool_service = SpoolFileConsumer(
                store, spool_root, producers={'titan':'titan_demo','goldm15':'goldm15_demo'}, excluded_roots=excluded)
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

            app.add_event_handler('startup', start_spool_service)
            app.add_event_handler('shutdown', stop_spool_service)
    codec = CursorCodec(clock)
    app.state.evidence_cursors = codec
    paths = ('/api/chart/v1/decisions','/api/chart/v1/lifecycle','/api/chart/v1/snapshots')

    def error(status, code, account=None):
        return JSONResponse({'schemaVersion':1, 'detail':{'code':code, 'canExecute':False, 'coverage':'UNKNOWN',
                            'gaps':store.gaps(account)}},
                            status_code=status, headers={'Cache-Control':'no-store'})

    @app.middleware('http')
    async def evidence_headers(request, call_next):
        response = await call_next(request)
        path = get_route_path(request.scope)
        if any(path == p or path.startswith(p + '/') for p in paths):
            if response.status_code == 403:
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

    @app.get(paths[0])
    def decisions(request: Request):
        return serve(request,'DECISION')

    @app.get(paths[0]+'/{record_id}')
    def decision(record_id: str, request: Request):
        return serve(request,'DECISION',record_id)

    @app.get(paths[1])
    def lifecycle(request: Request):
        return serve(request,'LIFECYCLE')

    @app.get(paths[2])
    def snapshots(request: Request):
        return serve(request,'SNAPSHOT')

    @app.get(paths[2]+'/{record_id}')
    def snapshot(record_id: str, request: Request):
        return serve(request,'SNAPSHOT',record_id)
