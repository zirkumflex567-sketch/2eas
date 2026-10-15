from fastapi.testclient import TestClient

from app import app


def test_dashboard_html_is_never_cached_between_runtime_releases():
    response = TestClient(app).get('/')

    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'


def test_dashboard_scripts_are_revalidated_after_runtime_releases():
    response = TestClient(app).get('/static/chart-studio-beta.js')

    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-cache'
