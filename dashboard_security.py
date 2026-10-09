"""Local operator-session gate for real dashboard mutations, not read-only charts.

Default loopback use creates a short-lived per-browser capability. Remote clients
require an explicitly configured DASHBOARD_CONTROL_TOKEN bearer; no token is
persisted or rendered into HTML. Proxy authentication remains deployment policy.
"""
import ipaddress
import os
import secrets
import threading
import time
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette._utils import get_route_path

CONTROL_PATHS = frozenset({'/api/modify_position', '/api/close_position', '/api/reset_drawdown'})
COOKIE = 'dashboard_control_session'
TTL_SECONDS = 3600
MAX_SESSIONS = 128


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


def install_control_security(app):
    sessions = {}
    lock = threading.RLock()

    def peer_allowed(request):
        peer = request.client.host if request.client else ''
        return _loopback(peer) or peer == 'testclient'

    def bearer_allowed(request):
        configured = os.environ.get('DASHBOARD_CONTROL_TOKEN', '')
        supplied = request.headers.get('authorization', '')
        return bool(configured) and secrets.compare_digest(supplied, 'Bearer ' + configured)

    def host_allowed(request):
        try:
            hostname = urlsplit('http://' + request.headers.get('host', '')).hostname
        except ValueError:
            return False
        allowed = {'127.0.0.1', 'localhost', '::1', 'testserver'}
        allowed.update(x.strip().lower() for x in os.environ.get('DASHBOARD_ALLOWED_HOSTS', '').split(',') if x.strip())
        return bool(hostname) and hostname.lower() in allowed

    def reject():
        return JSONResponse(status_code=403, content={'detail': 'Steuerzugriff nicht autorisiert. Dashboard neu laden; Remote-Zugriff benötigt explizite Freigabe.'})

    @app.middleware('http')
    async def guard(request: Request, call_next):
        # Match precisely the router's deployment-relative path, including
        # decoded/trailing-slash forms; URL.path includes root_path under proxies.
        route_path = get_route_path(request.scope).rstrip('/') or '/'
        if request.method == 'POST' and route_path in CONTROL_PATHS:
            if not host_allowed(request):
                return reject()
            origin = request.headers.get('origin')
            if origin and not _same_origin(origin, request.headers.get('host', ''), request.url.scheme):
                return reject()
            if request.headers.get('sec-fetch-site') in ('cross-site', 'same-site'):
                return reject()
            if not bearer_allowed(request):
                cookie = request.cookies.get(COOKIE, '')
                token = request.headers.get('x-dashboard-csrf', '')
                with lock:
                    saved = sessions.get(cookie)
                if not saved or saved['expires'] <= time.monotonic() or not token or not secrets.compare_digest(token, saved['csrf']):
                    return reject()
                if not peer_allowed(request) and not saved['remote']:
                    return reject()
        return await call_next(request)

    @app.get('/api/control_session')
    def control_session(request: Request):
        if not host_allowed(request):
            raise HTTPException(403, 'Steuerhost nicht freigegeben.')
        origin = request.headers.get('origin')
        if origin and not _same_origin(origin, request.headers.get('host', ''), request.url.scheme):
            raise HTTPException(403, 'Fremder Origin ist nicht freigegeben.')
        if request.headers.get('sec-fetch-site') in ('cross-site', 'same-site'):
            raise HTTPException(403, 'Fremde Browserseite ist nicht freigegeben.')
        remote = not peer_allowed(request)
        if remote and not bearer_allowed(request):
            raise HTTPException(403, 'Remote-Steuerzugriff benötigt DASHBOARD_CONTROL_TOKEN.')
        now = time.monotonic()
        with lock:
            for key in list(sessions):
                if sessions[key]['expires'] <= now:
                    del sessions[key]
            cookie = request.cookies.get(COOKIE, '')
            saved = sessions.get(cookie)
            if saved and saved['remote'] == remote:
                saved['expires'] = now + TTL_SECONDS
            else:
                while len(sessions) >= MAX_SESSIONS:
                    oldest = min(sessions, key=lambda k: sessions[k]['expires'])
                    del sessions[oldest]
                cookie = secrets.token_urlsafe(32)
                saved = {'csrf': secrets.token_urlsafe(32), 'expires': now + TTL_SECONDS, 'remote': remote}
                sessions[cookie] = saved
        response = JSONResponse({'csrf_token': saved['csrf'], 'control_enabled': True}, headers={'Cache-Control': 'no-store'})
        response.set_cookie(COOKIE, cookie, max_age=TTL_SECONDS, httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/')
        return response
