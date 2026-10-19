import pytest
import tempfile
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

from dashboard_security import CONTROL_PATHS, install_control_security
from chart_studio.mutation_audit import MutationAuditStore


PATH = '/api/chart/v1/trade-ticket/commit'
PREVIEW_PATH = '/api/chart/v1/trade-ticket/preview'
PAYLOAD = {
    'schemaVersion': 1,
    'account': 'titan',
    'symbol': 'XAUUSD',
    'previewId': 'a-valid-server-issued-ticket-preview-id-123456',
    'userConfirmed': True,
    'confirmationText': 'titan XAUUSD BUY 0.01',
    'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
}
PREVIEW_PAYLOAD = {
    'schemaVersion': 1,
    'account': 'titan',
    'symbol': 'XAUUSD',
    'orderType': 'BUY_LIMIT',
    'volumeLots': 0.01,
    'entryPrice': 4000.0,
    'slPrice': 3990.0,
    'tpPrice': 4020.0,
}


def _install_security(app):
    install_control_security(app)
    temp = tempfile.TemporaryDirectory(prefix='trade-ticket-audit-')
    app.state.audit_tempdir = temp
    app.state.mutation_audit_store = MutationAuditStore(
        Path(temp.name) / 'audit.sqlite', checkout_root=Path(temp.name) / 'checkout'
    )


class NoTouchGateway:
    def __getattr__(self, name):
        pytest.fail(f'gateway touched while trade ticket is disabled: {name}')


def _client(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes
    app = FastAPI()
    _install_security(app)
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


def test_trade_ticket_preview_is_a_separate_exact_control_path():
    assert PREVIEW_PATH in CONTROL_PATHS


def test_goldm15_is_preview_enabled_but_stays_outside_the_trade_commit_allowlist():
    from pydantic import ValidationError
    from chart_studio.trade_ticket_api import TradeTicketCommitRequest, TradeTicketPreviewRequest

    TradeTicketPreviewRequest.model_validate({**PREVIEW_PAYLOAD, 'account': 'goldm15'})
    with pytest.raises(ValidationError, match='Authorized demo account required'):
        TradeTicketCommitRequest.model_validate({**PAYLOAD, 'account': 'goldm15'})


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
    assert response.status_code == (403 if changes.get('account') == 'blueberry' else 422)


def test_enabled_flag_alone_does_not_enable_order_sending(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes
    app = FastAPI()
    _install_security(app)
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

    class PreviewService:
        def __init__(self, mt5, previews):
            self.mt5, self.previews = mt5, previews

        def preview(self, *_args):
            return {'status': 'READ_ONLY_DRAFT', 'canCommit': False}

    app = FastAPI()
    _install_security(app)
    gateway = NoTouchGateway()
    previews, guard, store = object(), object(), object()
    service = Service(gateway, previews, guard, store)
    preview_service = PreviewService(gateway, previews)
    install_trade_ticket_routes(
        app, gateway, enabled=True, preview_registry=previews,
        guard_provider=guard, audit_store=store, commit_service=service,
        preview_service=preview_service,
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
    _install_security(app)
    install_trade_ticket_routes(
        app, object(), enabled=True, preview_registry=object(),
        guard_provider=object(), audit_store=object(), commit_service=Service(),
    )
    response = _post(TestClient(app), PAYLOAD)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'


def test_preview_route_is_disabled_without_a_bound_read_service(monkeypatch):
    response = _client(monkeypatch).post(
        PREVIEW_PATH, json=PREVIEW_PAYLOAD,
        headers={'Authorization': 'Bearer unit-test-control-token'},
    )
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_PREVIEW_DISABLED'


@pytest.mark.parametrize('changes', [
    {'account': 'blueberry'},
    {'volumeLots': True},
    {'orderType': 'MARKET'},
    {'entryPrice': '4000.0'},
    {'guard': {'state': 'ALLOW'}},
])
def test_preview_rejects_invalid_or_client_guarded_payload(monkeypatch, changes):
    response = _client(monkeypatch).post(
        PREVIEW_PATH, json={**PREVIEW_PAYLOAD, **changes},
        headers={'Authorization': 'Bearer unit-test-control-token'},
    )
    assert response.status_code == 422


def test_preview_calls_only_bound_service_and_returns_no_store(monkeypatch):
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'unit-test-control-token')
    from chart_studio.trade_ticket_api import install_trade_ticket_routes
    app = FastAPI()
    _install_security(app)
    gateway = NoTouchGateway()
    registry = object()

    class PreviewService:
        mt5 = gateway
        previews = registry

        def __init__(self):
            self.call = None

        def preview(self, payload, identity, peer):
            self.call = (payload, identity, peer)
            return {'status': 'READ_ONLY_DRAFT', 'canExecute': False, 'canCommit': False}

    service = PreviewService()
    install_trade_ticket_routes(app, gateway, preview_registry=registry,
                                preview_service=service)
    client = TestClient(app)
    response = client.post(
        PREVIEW_PATH, json=PREVIEW_PAYLOAD,
        headers={'Authorization': 'Bearer unit-test-control-token'},
    )
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert response.json()['canCommit'] is False
    assert service.call[0].orderType == 'BUY_LIMIT'
    assert service.call[1][2] == 'trade'
    assert service.call[2]

    # The same preview-only wiring must leave the commit route hard-disabled.
    commit_response = _post(client, PAYLOAD)
    assert commit_response.status_code == 503
    assert commit_response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'
    assert app.state.trade_ticket_preview_capable is True
    assert app.state.trade_ticket_write_capable is False


def test_live_preview_smoke_accepts_explicit_insufficient_margin_denial():
    from runpy import run_path

    smoke = run_path(str(Path(__file__).parents[1] / 'scripts' / 'smoke_live_trade_ticket_preview.py'))
    result = smoke['validate_preview_response'](
        'xau5m_m5', 'XAUUSD.p', 422,
        {'detail': {
            'code': 'INSUFFICIENT_FREE_MARGIN',
            'canExecute': False,
            'canCommit': False,
            'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
        }},
    )

    assert result == 'REJECTED_INSUFFICIENT_FREE_MARGIN'


def test_live_preview_smoke_rejects_any_other_http_422():
    from runpy import run_path

    smoke = run_path(str(Path(__file__).parents[1] / 'scripts' / 'smoke_live_trade_ticket_preview.py'))
    with pytest.raises(AssertionError, match='unexpected preview rejection'):
        smoke['validate_preview_response'](
            'xau5m_m5', 'XAUUSD.p', 422,
            {'detail': {
                'code': 'EA_GUARD_HARD_LOCK',
                'canExecute': False,
                'canCommit': False,
                'guard': {'state': 'UNKNOWN', 'source': 'NONE'},
            }},
        )


def test_live_preview_smoke_accepts_only_unique_non_blueberry_demo_aliases(monkeypatch):
    from runpy import run_path

    smoke = run_path(str(Path(__file__).parents[1] / 'scripts' / 'smoke_live_trade_ticket_preview.py'))
    monkeypatch.setenv('CHART_STUDIO_ACCOUNTS', 'titan,goldm15')
    assert smoke['_selected_demo_symbols']() == {'titan': 'XAUUSD', 'goldm15': 'XAUUSD'}

    monkeypatch.setenv('CHART_STUDIO_ACCOUNTS', 'titan,blueberry')
    with pytest.raises(RuntimeError, match='approved non-Blueberry demo aliases'):
        smoke['_selected_demo_symbols']()

    monkeypatch.setenv('CHART_STUDIO_ACCOUNTS', 'titan,titan')
    with pytest.raises(RuntimeError, match='approved non-Blueberry demo aliases'):
        smoke['_selected_demo_symbols']()
