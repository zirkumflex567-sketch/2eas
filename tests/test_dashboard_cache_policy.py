import json

from fastapi.testclient import TestClient

from app import app


def test_dashboard_html_is_never_cached_between_runtime_releases():
    response = TestClient(app).get('/')

    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'


def test_dashboard_scripts_are_revalidated_after_runtime_releases():
    response = TestClient(app).get('/static/chart-studio-beta.js')

    assert response.status_code == 200
    assert response.headers['cache-control'] == 'private, no-cache'


def test_static_assets_are_revalidated_through_authenticated_stt_prefix(monkeypatch):
    secret = 'stt-cache-test-' + 'x' * 32
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET', secret)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', json.dumps({'viewer': 'read'}))
    monkeypatch.setenv('DASHBOARD_PROXY_PREFIX', '/stt')
    headers = {
        'X-Dashboard-Proxy-Secret': secret,
        'X-Dashboard-User': 'viewer',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': '203.0.113.8',
        'X-Forwarded-Prefix': '/stt',
    }
    client = TestClient(app, base_url='http://127.0.0.1', client=('127.0.0.1', 4321))

    response = client.get('/static/chart-studio-beta.js', headers=headers)
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'private, no-cache'
    etag = response.headers['etag']

    revalidated = client.get('/static/chart-studio-beta.js', headers={**headers, 'If-None-Match': etag})
    assert revalidated.status_code == 304
    assert revalidated.headers['cache-control'] == 'private, no-cache'
