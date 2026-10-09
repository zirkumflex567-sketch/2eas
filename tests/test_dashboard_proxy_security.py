"""Authenticated proxy contract, using isolated mock mutations only."""
import json
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from dashboard_security import install_control_security

SECRET = 'test-proxy-secret-' + 'x' * 32
HOST = 'dashboard.example'


@pytest.fixture
def proxy(monkeypatch):
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET', SECRET)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', json.dumps({'viewer': 'read', 'designer': 'layout', 'operator': 'trade'}))
    monkeypatch.setenv('DASHBOARD_ALLOWED_HOSTS', HOST)
    monkeypatch.delenv('DASHBOARD_CONTROL_TOKEN', raising=False)
    app = FastAPI()
    install_control_security(app)
    writes = []
    for path in ('modify_position', 'close_position', 'reset_drawdown'):
        def mutate():
            writes.append(True)
            return {'success': True}
        app.post('/api/' + path)(mutate)
    @app.get('/inspect')
    def inspect(request: Request):
        return {'scheme': request.url.scheme, 'peer': request.client.host, 'root_path': request.scope.get('root_path')}
    client = TestClient(app, base_url='https://' + HOST, client=('127.0.0.1', 4321))
    return app, client, writes


def headers(user='operator', **overrides):
    values = {'X-Dashboard-Proxy-Secret': SECRET, 'X-Dashboard-User': user,
              'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.8',
              'X-Forwarded-Prefix': '/stt'}
    values.update(overrides)
    return values


@pytest.mark.parametrize('user,role', [('viewer', 'read'), ('designer', 'layout'), ('operator', 'trade')])
def test_verified_proxy_gets_role_and_only_trade_can_mutate(proxy, user, role):
    _, client, writes = proxy
    response = client.get('/api/control_session', headers=headers(user))
    assert response.status_code == 200
    assert response.json()['role'] == role
    assert response.json()['control_enabled'] == (role == 'trade')
    assert 'Secure' in response.headers['set-cookie']
    for route in ('modify_position', 'close_position', 'reset_drawdown'):
        result = client.post('/api/' + route, headers={**headers(user), 'Origin': 'https://' + HOST,
                             'X-Dashboard-CSRF': response.json()['csrf_token']})
        assert result.status_code == (200 if role == 'trade' else 403)
    assert len(writes) == (3 if role == 'trade' else 0)


@pytest.mark.parametrize('changes', [
    {'X-Dashboard-Proxy-Secret': ''}, {'X-Dashboard-Proxy-Secret': 'wrong'},
    {'X-Dashboard-User': ''}, {'X-Dashboard-User': 'unknown'},
    {'X-Dashboard-User': 'operator,viewer'}, {'X-Dashboard-User': ' operator'},
    {'X-Forwarded-For': '203.0.113.8, 127.0.0.1'}, {'X-Forwarded-For': 'bad-ip'},
    {'X-Forwarded-Proto': 'https,http'}, {'X-Forwarded-Prefix': '/evil'},
    {'X-Forwarded-Prefix': '/stt/'},
])
def test_invalid_proxy_claim_cannot_fall_back_to_local_capability(proxy, changes):
    app, _, writes = proxy
    local = TestClient(app, base_url='http://localhost', client=('127.0.0.1', 123))
    assert local.get('/api/control_session', headers=headers(**changes)).status_code == 403
    assert not writes


@pytest.mark.parametrize('name', ['X-Dashboard-User', 'X-Dashboard-Proxy-Secret', 'X-Forwarded-For', 'X-Forwarded-Proto', 'X-Forwarded-Prefix', 'Host'])
def test_duplicate_security_headers_rejected(proxy, name):
    _, client, _ = proxy
    supplied = list(headers().items()) + [(name, headers().get(name, HOST))]
    if name == 'Host':
        supplied.append(('Host', HOST))
    assert client.get('/api/control_session', headers=supplied).status_code == 403


@pytest.mark.parametrize('peer', ['203.0.113.8', 'testclient'])
def test_proxy_identity_requires_raw_tcp_loopback_peer(proxy, peer):
    app, _, _ = proxy
    remote = TestClient(app, base_url='https://' + HOST, client=(peer, 123))
    assert remote.get('/api/control_session', headers=headers()).status_code == 403


@pytest.mark.parametrize('secret,users', [('', '{"operator":"trade"}'), ('short', '{"operator":"trade"}'),
    (SECRET, 'bad-json'), (SECRET, '{"operator":"admin"}'),
    (SECRET, '{"operator":"read","operator":"trade"}'), (SECRET, '[]')])
def test_proxy_configuration_fails_closed(proxy, monkeypatch, secret, users):
    _, client, _ = proxy
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET', secret)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', users)
    assert client.get('/api/control_session', headers=headers()).status_code == 403


def test_allowed_remote_host_loopback_is_not_local_operator(proxy):
    _, client, _ = proxy
    assert client.get('/api/control_session').status_code == 403


def test_forwarding_only_does_not_grant_or_normalize_local_capability(proxy):
    app, _, _ = proxy
    client = TestClient(app, base_url='http://localhost', client=('127.0.0.1', 123))
    supplied = {'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.8', 'X-Forwarded-Prefix': '/stt'}
    assert client.get('/api/control_session', headers=supplied).status_code == 403


@pytest.mark.parametrize('peer', ['203.0.113.8', '2001:db8::8'])
def test_verified_forwarding_is_normalized_after_authentication(proxy, peer):
    _, client, _ = proxy
    response = client.get('/inspect', headers=headers(**{'X-Forwarded-For': peer}))
    assert response.status_code == 200
    assert response.json() == {'scheme': 'https', 'peer': peer, 'root_path': '/stt'}


@pytest.mark.parametrize('change', ['user', 'role', 'missing_identity'])
def test_session_rechecks_proxy_principal_role_and_channel(proxy, monkeypatch, change):
    _, client, writes = proxy
    token = client.get('/api/control_session', headers=headers()).json()['csrf_token']
    supplied = headers()
    if change == 'user':
        monkeypatch.setenv('DASHBOARD_PROXY_USERS', '{"operator":"trade","other":"trade"}')
        supplied = headers('other')
    elif change == 'role':
        monkeypatch.setenv('DASHBOARD_PROXY_USERS', '{"operator":"read"}')
    else:
        supplied = {}
    response = client.post('/api/modify_position', headers={**supplied, 'X-Dashboard-CSRF': token})
    assert response.status_code == 403
    assert not writes


@pytest.mark.parametrize('path', ['/api/modify_position/', '/api/%6dodify_position', '/stt/api/modify_position/', '/stt/api/%6dodify_position'])
def test_proxy_encoded_and_prefixed_routes_keep_role_gate(proxy, path):
    _, client, writes = proxy
    token = client.get('/api/control_session', headers=headers('viewer')).json()['csrf_token']
    response = client.post(path, headers={**headers('viewer'), 'X-Dashboard-CSRF': token}, follow_redirects=True)
    assert response.status_code == 403
    assert not writes


def test_proxy_trade_needs_cookie_csrf_and_correct_external_origin(proxy):
    _, client, writes = proxy
    token = client.get('/api/control_session', headers=headers()).json()['csrf_token']
    assert client.post('/api/modify_position', headers=headers()).status_code == 403
    assert client.post('/api/modify_position', headers={**headers(), 'X-Dashboard-CSRF': token, 'Origin': 'http://' + HOST}).status_code == 403
    client.cookies.clear()
    assert client.post('/api/modify_position', headers={**headers(), 'X-Dashboard-CSRF': token}).status_code == 403
    assert not writes


def test_uvicorn_keeps_raw_peer_and_nginx_overwrites_identity():
    source = Path('app.py').read_text(encoding='utf-8')
    assert 'proxy_headers=False' in source[source.index('if __name__ == "__main__":'):]
    template = Path('stt_nginx.conf').read_text(encoding='utf-8')
    assert 'proxy_set_header X-Dashboard-User $remote_user;' in template
    assert 'include /etc/nginx/snippets/stt-proxy-secret.conf;' in template
    assert 'proxy_set_header Authorization "";' in template
    assert 'proxy_set_header X-Forwarded-For $remote_addr;' in template
    assert '$proxy_add_x_forwarded_for' not in template


def test_downgrade_permanently_revokes_existing_session(proxy, monkeypatch):
    _, client, writes = proxy
    token = client.get('/api/control_session', headers=headers()).json()['csrf_token']
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', '{"operator":"read"}')
    assert client.post('/api/modify_position', headers={**headers(), 'X-Dashboard-CSRF': token}).status_code == 403
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', '{"operator":"trade"}')
    assert client.post('/api/modify_position', headers={**headers(), 'X-Dashboard-CSRF': token}).status_code == 403
    assert not writes


@pytest.mark.parametrize('host', ['localhost@dashboard.example', 'dashboard.example/evil', 'dashboard.example:bad', 'dashboard.example,localhost', 'evil.example'])
def test_strict_host_allowlist_rejects_malformed_or_unlisted_host(proxy, host):
    _, client, _ = proxy
    assert client.get('/api/control_session', headers={**headers(), 'Host': host}).status_code == 403


def test_trusted_proxy_scheme_normalizes_raw_http_and_sets_secure_cookie(proxy):
    app, _, _ = proxy
    client = TestClient(app, base_url='http://' + HOST, client=('::1', 123))
    response = client.get('/api/control_session', headers=headers())
    assert response.status_code == 200
    assert 'Secure' in response.headers['set-cookie']
    assert client.get('/inspect', headers=headers()).json()['scheme'] == 'https'


def test_custom_exact_proxy_prefix(proxy, monkeypatch):
    _, client, _ = proxy
    monkeypatch.setenv('DASHBOARD_PROXY_PREFIX', '/cockpit')
    assert client.get('/api/control_session', headers=headers()).status_code == 403
    response = client.get('/api/control_session', headers=headers(**{'X-Forwarded-Prefix': '/cockpit'}))
    assert response.status_code == 200


@pytest.mark.parametrize('prefix', ['/stt/../x', '/stt//x', '/stt%2f', '/stt?x', '/stt#x', '/'])
def test_malformed_configured_prefix_fails_closed(proxy, monkeypatch, prefix):
    _, client, _ = proxy
    monkeypatch.setenv('DASHBOARD_PROXY_PREFIX', prefix)
    assert client.get('/api/control_session', headers=headers(**{'X-Forwarded-Prefix': prefix})).status_code == 403


def test_non_ascii_configured_prefix_fails_closed_without_server_error(proxy, monkeypatch):
    app, _, _ = proxy
    prefix = '/stt\N{LATIN SMALL LETTER O WITH DIAERESIS}'
    monkeypatch.setenv('DASHBOARD_PROXY_PREFIX', prefix)
    async def raw_header_app(scope, receive, send):
        scope['headers'] = [(key, prefix.encode('latin-1') if key == b'x-forwarded-prefix' else value)
                            for key, value in scope['headers']]
        await app(scope, receive, send)
    client = TestClient(raw_header_app, base_url='https://' + HOST, client=('127.0.0.1', 123))
    assert client.get('/api/control_session', headers=headers()).status_code == 403


def test_local_bearer_session_retains_cookie_csrf_compatibility(proxy, monkeypatch):
    app, _, writes = proxy
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'test-only-bearer-capability')
    client = TestClient(app, base_url='http://localhost', client=('127.0.0.1', 123))
    token = client.get('/api/control_session', headers={'Authorization': 'Bearer test-only-bearer-capability'}).json()['csrf_token']
    response = client.post('/api/modify_position', headers={'X-Dashboard-CSRF': token, 'Origin': 'http://localhost'})
    assert response.status_code == 200
    assert writes == [True]


@pytest.mark.parametrize('change', ['rotated_token', 'foreign_peer', 'verified_read_proxy'])
def test_saved_local_bearer_cannot_override_changed_credential_peer_or_proxy_role(proxy, monkeypatch, change):
    app, _, writes = proxy
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'test-only-bearer-capability')
    client = TestClient(app, base_url='http://localhost', client=('127.0.0.1', 123))
    token = client.get('/api/control_session', headers={'Authorization': 'Bearer test-only-bearer-capability'}).json()['csrf_token']
    supplied = {'X-Dashboard-CSRF': token, 'Origin': 'http://localhost'}
    if change == 'rotated_token':
        monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'rotated-test-only-bearer')
    elif change == 'foreign_peer':
        other = TestClient(app, base_url='http://localhost', client=('203.0.113.8', 123))
        other.cookies.update(client.cookies)
        client = other
    else:
        supplied.update(headers('viewer', **{'X-Forwarded-Proto': 'http'}))
    assert client.post('/api/modify_position', headers=supplied).status_code == 403
    assert not writes
