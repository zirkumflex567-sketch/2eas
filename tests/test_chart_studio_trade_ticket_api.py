import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from dashboard_security import CONTROL_PATHS, install_control_security


PATH = '/api/chart/v1/trade-ticket/commit'
PAYLOAD = {
    'schemaVersion': 1,
    'account': 'titan',
    'symbol': 'XAUUSD',
    'previewId': 'a-valid-server-issued-ticket-preview-id-123456',
    'userConfirmed': True,
    'confirmationText': 'titan XAUUSD BUY 0.01',
    'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
}


class NoTouchGateway:
    def __getattr__(self, name):
        pytest.fail(f'gateway touched while trade ticket is disabled: {name}')


def _client(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes
    app = FastAPI()
    install_control_security(app)
    install_trade_ticket_routes(app, NoTouchGateway())
    return TestClient(app)


def _post(client, payload):
    return client.post(PATH, json=payload,
                       headers={'Authorization': 'Bearer unit-test-control-token'})


def test_new_entry_route_is_disabled_before_gateway_access(monkeypatch):
    response = _post(_client(monkeypatch), PAYLOAD)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'
    assert response.json()['detail']['canCommit'] is False
    assert response.json()['detail']['status'] == 'DISABLED'


def test_trade_ticket_commit_is_an_exact_control_path():
    assert PATH in CONTROL_PATHS


@pytest.mark.parametrize('changes', [
    {'userConfirmed': False},
    {'previewId': 'too-short'},
    {'idempotencyKey': 'not-a-uuid'},
    {'account': 'blueberry'},
    {'confirmationText': ''},
    {'guard': {'state': 'ALLOW'}},
    {'entryPrice': 4000.0},
])
def test_invalid_or_client_modified_trade_ticket_is_rejected_before_gateway(monkeypatch, changes):
    response = _post(_client(monkeypatch), {**PAYLOAD, **changes})
    assert response.status_code == 422


def test_enabled_flag_alone_does_not_enable_order_sending(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes
    app = FastAPI()
    install_control_security(app)
    install_trade_ticket_routes(app, NoTouchGateway(), enabled=True)
    response = TestClient(app).post(
        PATH, json=PAYLOAD,
        headers={'Authorization': 'Bearer unit-test-control-token'},
    )
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'


def test_trade_ticket_requires_all_exactly_bound_dependencies(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes

    class Service:
        def __init__(self, mt5, previews, guard, store):
            self.mt5, self.previews = mt5, previews
            self.guard, self.store = guard, store
            self.received = None

        def commit(self, payload, identity, peer):
            self.received = (payload, identity, peer)
            return {'status': 'SAVED', 'verified': True, 'canCommit': False}

    app = FastAPI()
    install_control_security(app)
    gateway = NoTouchGateway()
    previews, guard, store = object(), object(), object()
    service = Service(gateway, previews, guard, store)
    install_trade_ticket_routes(
        app, gateway, enabled=True, preview_registry=previews,
        guard_provider=guard, audit_store=store, commit_service=service,
    )
    response = _post(TestClient(app), PAYLOAD)
    assert response.status_code == 200
    assert response.json()['verified'] is True
    assert service.received[0].account == 'titan'
    assert service.received[1][2] == 'trade'
    assert service.received[2]


def test_misbound_commit_service_remains_disabled(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes

    class Service:
        mt5 = object()
        previews = object()
        guard = object()
        store = object()

    app = FastAPI()
    install_control_security(app)
    install_trade_ticket_routes(
        app, object(), enabled=True, preview_registry=object(),
        guard_provider=object(), audit_store=object(), commit_service=Service(),
    )
    response = _post(TestClient(app), PAYLOAD)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'
