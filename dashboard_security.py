"""Dashboard mutation capabilities for local operators and authenticated proxies.

The ASGI client must remain the raw TCP peer (uvicorn proxy_headers=False).
Forwarding metadata is trusted only after the loopback proxy authenticates.
Chart workspace authorization remains a separate gate.
"""
import hashlib
import ipaddress
import json
import os
import secrets
import threading
import time
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette._utils import get_route_path

CONTROL_PATHS = frozenset({'/api/modify_position', '/api/close_position', '/api/reset_drawdown',
                           '/api/chart/v1/position/commit-stop', '/api/chart/v1/trade-ticket/preview',
                           '/api/chart/v1/trade-ticket/commit'})
COOKIE = 'dashboard_control_session'
TTL_SECONDS = 3600
MAX_SESSIONS = 128
PROXY_IDENTITY_HEADERS = ('x-dashboard-proxy-secret', 'x-dashboard-user')
FORWARD_HEADERS = ('x-forwarded-proto', 'x-forwarded-for', 'x-forwarded-prefix')
SINGLE_HEADERS = PROXY_IDENTITY_HEADERS + FORWARD_HEADERS + ('host', 'authorization', 'origin', 'x-dashboard-csrf')
LOCAL_HOSTS = frozenset({'127.0.0.1', 'localhost', '::1', 'testserver'})


def _loopback(peer):
    try:
        return ipaddress.ip_address(peer).is_loopback
    except ValueError:
        return False


def _same_origin(origin, host, scheme):
    try:
        parsed = urlsplit(origin)
        expected = urlsplit(scheme + '://' + host)
        return (not parsed.username and not parsed.password and
                parsed.scheme == expected.scheme and
                parsed.hostname == expected.hostname and
                (parsed.port or (443 if parsed.scheme == 'https' else 80)) ==
                (expected.port or (443 if scheme == 'https' else 80)) and
                parsed.path in ('', '/') and not parsed.query and not parsed.fragment)
    except (ValueError, TypeError):
        return False


def _host(request):
    value = request.headers.get('host', '')
    if not value or any(ord(c) <= 32 or ord(c) >= 127 for c in value):
        return None
    try:
        parsed = urlsplit('http://' + value)
        # Reject URL-shaped Host values, userinfo, malformed ports and commas.
        if (parsed.username is not None or parsed.password is not None or
                parsed.path or parsed.query or parsed.fragment or ',' in value):
            return None
        parsed.port
        return parsed.hostname
    except ValueError:
        return None


def _proxy_users():
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate proxy user')
            result[key] = value
        return result
    try:
        users = json.loads(os.environ.get('DASHBOARD_PROXY_USERS', '{}'), object_pairs_hook=unique)
        if not isinstance(users, dict) or any(
                not _valid_user(user) or role not in ('read', 'layout', 'trade')
                for user, role in users.items()):
            return {}
        return users
    except (ValueError, TypeError):
        return {}


def _valid_user(user):
    return isinstance(user, str) and bool(user) and all(32 < ord(c) < 127 and c != ',' for c in user)


def _bearer_principal():
    configured = os.environ.get('DASHBOARD_CONTROL_TOKEN', '')
    return hashlib.sha256(configured.encode('utf-8')).hexdigest() if configured else None


def install_control_security(app):
    sessions = {}
    lock = threading.RLock()

    def host_allowed(request):
        allowed = set(LOCAL_HOSTS)
        allowed.update(x.strip().lower() for x in os.environ.get('DASHBOARD_ALLOWED_HOSTS', '').split(',') if x.strip())
        return _host(request) in allowed

    def bearer_allowed(request):
        configured = os.environ.get('DASHBOARD_CONTROL_TOKEN', '')
        supplied = request.headers.get('authorization', '')
        return bool(configured) and secrets.compare_digest(supplied.encode('utf-8'), ('Bearer ' + configured).encode('utf-8'))

    def reject():
        return JSONResponse(status_code=403, content={'detail': 'Steuerzugriff nicht autorisiert. Dashboard neu laden; Remote-Zugriff benötigt explizite Freigabe.'})

    def proxy_identity(request, raw_peer):
        configured = os.environ.get('DASHBOARD_PROXY_SECRET', '')
        supplied = request.headers.get('x-dashboard-proxy-secret', '')
        user = request.headers.get('x-dashboard-user', '')
        if (not _loopback(raw_peer) or len(configured) < 32 or not _valid_user(user) or
                not secrets.compare_digest(supplied.encode('utf-8'), configured.encode('utf-8'))):
            return None
        role = _proxy_users().get(user)
        if role is None:
            return None
        proto = request.headers.get('x-forwarded-proto')
        forwarded = request.headers.get('x-forwarded-for')
        prefix = request.headers.get('x-forwarded-prefix')
        configured_prefix = os.environ.get('DASHBOARD_PROXY_PREFIX', '/stt')
        if proto is not None and proto not in ('http', 'https'):
            return None
        if forwarded is not None:
            try:
                # A single literal IP, never a chain, port, zone ID or whitespace.
                if '%' in forwarded or forwarded != forwarded.strip():
                    return None
                forwarded = str(ipaddress.ip_address(forwarded))
            except ValueError:
                return None
        if prefix is not None and (prefix != configured_prefix or not prefix.startswith('/') or
                                   prefix == '/' or prefix.endswith('/') or
                                   any(c in prefix for c in ('%', '?', '#', '\\')) or
                                   any(ord(c) <= 32 or ord(c) >= 127 for c in prefix) or '//' in prefix or
                                   any(segment in ('.', '..') for segment in prefix.split('/'))):
            return None
        # Keep raw_peer in state before replacing presentation metadata.
        if proto is not None:
            request.scope['scheme'] = proto
        if forwarded is not None:
            request.scope['client'] = (forwarded, 0)
        if prefix is not None:
            request.scope['root_path'] = prefix
            path = request.scope['path']
            if path != prefix and not path.startswith(prefix + '/'):
                request.scope['path'] = prefix + path
                request.scope['raw_path'] = prefix.encode('ascii') + request.scope.get('raw_path', path.encode('utf-8'))
        return ('proxy', user, role)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        raw_peer = request.client.host if request.client else ''
        request.state.raw_peer = raw_peer
        if any(len(request.headers.getlist(name)) > 1 for name in SINGLE_HEADERS):
            return reject()
        if not host_allowed(request):
            return reject()
        claimed_proxy = any(name in request.headers for name in PROXY_IDENTITY_HEADERS)
        forwarding = any(name in request.headers for name in FORWARD_HEADERS)
        identity = None
        if claimed_proxy:
            identity = proxy_identity(request, raw_peer)
            if identity is None:
                with lock:
                    sessions.pop(request.cookies.get(COOKIE, ''), None)
                return reject()
        elif bearer_allowed(request):
            identity = ('bearer', _bearer_principal(), 'trade')
        elif not forwarding and (_loopback(raw_peer) or raw_peer == 'testclient') and (
                _host(request) in LOCAL_HOSTS or _loopback(_host(request) or '')):
            identity = ('local', raw_peer, 'trade')
        request.state.control_identity = identity
        # Router-relative decoded paths also cover redirects and root_path deployments.
        route_path = get_route_path(request.scope).rstrip('/') or '/'
        if request.method == 'POST' and route_path in CONTROL_PATHS:
            direct_bearer = bool(identity and identity[0] == 'bearer')
            cookie = request.cookies.get(COOKIE, '')
            with lock:
                saved = sessions.get(cookie)
            if saved and not direct_bearer:
                # Resolve the existing bearer cookie compatibility before checking
                # session identity. This must never override a verified proxy role.
                if (identity is None or identity[0] == 'local') and not claimed_proxy and not forwarding:
                    bearer_identity = ('bearer', _bearer_principal(), 'trade')
                    if saved['identity'] == bearer_identity and saved['peer'] == raw_peer:
                        identity = bearer_identity
                # Observed identity/role changes revoke the old capability even
                # when Origin, fetch metadata or CSRF would also reject this request.
                if identity != saved['identity'] or identity[2] != 'trade' or saved['peer'] != raw_peer:
                    with lock:
                        sessions.pop(cookie, None)
                    return reject()
            origin = request.headers.get('origin')
            if origin and not _same_origin(origin, request.headers.get('host', ''), request.url.scheme):
                return reject()
            if request.headers.get('sec-fetch-site') in ('cross-site', 'same-site'):
                return reject()
            if not direct_bearer:
                token = request.headers.get('x-dashboard-csrf', '')
                if not saved or saved['expires'] <= time.monotonic() or not token or not secrets.compare_digest(token.encode('utf-8'), saved['csrf'].encode('utf-8')):
                    return reject()
        return await call_next(request)

    @app.get('/api/control_session')
    def control_session(request: Request):
        origin = request.headers.get('origin')
        if origin and not _same_origin(origin, request.headers.get('host', ''), request.url.scheme):
            raise HTTPException(403, 'Fremder Origin ist nicht freigegeben.')
        if request.headers.get('sec-fetch-site') in ('cross-site', 'same-site'):
            raise HTTPException(403, 'Fremde Browserseite ist nicht freigegeben.')
        identity = request.state.control_identity
        if identity is None:
            raise HTTPException(403, 'Steuerzugriff benötigt eine freigegebene Identität.')
        now = time.monotonic()
        with lock:
            for key in list(sessions):
                if sessions[key]['expires'] <= now:
                    del sessions[key]
            cookie = request.cookies.get(COOKIE, '')
            saved = sessions.get(cookie)
            if saved and saved['identity'] == identity and saved['peer'] == request.state.raw_peer:
                saved['expires'] = now + TTL_SECONDS
            else:
                sessions.pop(cookie, None)
                while len(sessions) >= MAX_SESSIONS:
                    oldest = min(sessions, key=lambda k: sessions[k]['expires'])
                    del sessions[oldest]
                cookie = secrets.token_urlsafe(32)
                saved = {'csrf': secrets.token_urlsafe(32), 'expires': now + TTL_SECONDS,
                         'identity': identity, 'peer': request.state.raw_peer}
                sessions[cookie] = saved
        response = JSONResponse({'csrf_token': saved['csrf'], 'control_enabled': identity[2] == 'trade',
                                 'role': identity[2]}, headers={'Cache-Control': 'no-store'})
        response.set_cookie(COOKIE, cookie, max_age=TTL_SECONDS, httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/')
        return response
