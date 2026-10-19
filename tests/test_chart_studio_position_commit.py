import pytest
import tempfile
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from dashboard_security import CONTROL_PATHS, install_control_security
from chart_studio.mutation_audit import MutationAuditStore

PAYLOAD = {
    'schemaVersion': 1,
    'account': 'titan',
    'symbol': 'XAUUSD',
    'positionTicket': '123456',
    'expectedRevision': 'a' * 64,
    'previewId': 'valid-preview-token-at-least-32-characters',
    'userConfirmed': True,
    'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
}

class NoTouchGateway:
    def __getattr__(self, name):
        pytest.fail(f'gateway touched while commit route disabled: {name}')


def _install_security(app):
    install_control_security(app)
    temp = tempfile.TemporaryDirectory(prefix='position-commit-audit-')
    app.state.audit_tempdir = temp
    app.state.mutation_audit_store = MutationAuditStore(
        Path(temp.name) / 'audit.sqlite', checkout_root=Path(temp.name) / 'checkout'
    )


def test_disabled_commit_route_rejects_before_gateway_access(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.position_commit_api import install_position_commit_routes
    app = FastAPI()
    _install_security(app)
    install_position_commit_routes(app, NoTouchGateway())
    response = TestClient(app).post('/api/chart/v1/position/commit-stop', json=PAYLOAD, headers={'Authorization': 'Bearer unit-test-control-token'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'COMMIT_DISABLED'
    assert response.json()['detail']['canCommit'] is False


def test_commit_route_requires_production_dependencies_even_when_enabled(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.position_commit_api import install_position_commit_routes
    app = FastAPI()
    _install_security(app)
    install_position_commit_routes(app, NoTouchGateway(), enabled=True)
    response = TestClient(app).post('/api/chart/v1/position/commit-stop', json=PAYLOAD, headers={'Authorization': 'Bearer unit-test-control-token'})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'COMMIT_DISABLED'


def test_commit_route_is_a_control_path():
    assert '/api/chart/v1/position/commit-stop' in CONTROL_PATHS


@pytest.mark.parametrize('changes', [
    {'userConfirmed': False},
    {'previewId': 'too-short'},
    {'idempotencyKey': 'not-a-uuid'},
    {'unexpected': 'client candidate values are forbidden'},
])
def test_malformed_or_unconfirmed_commit_is_rejected_before_gateway(monkeypatch, changes):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.position_commit_api import install_position_commit_routes
    app = FastAPI()
    _install_security(app)
    install_position_commit_routes(app, NoTouchGateway())
    payload = {**PAYLOAD, **changes}
    response = TestClient(app).post(
        '/api/chart/v1/position/commit-stop', json=payload,
        headers={'Authorization': 'Bearer unit-test-control-token'},
    )
    assert response.status_code == 422
