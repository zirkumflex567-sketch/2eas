"""Browser mutation security tests; no MT5 and no real writes."""
import unittest
import tempfile
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse, Response
from chart_studio.mutation_audit import MutationAuditStore


class ControlSecurityTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        try:
            from dashboard_security import install_control_security
        except ImportError:
            install_control_security = lambda app: None
        install_control_security(self.app)
        self.audit_tmp = tempfile.TemporaryDirectory()
        self.app.state.mutation_audit_store = MutationAuditStore(
            Path(self.audit_tmp.name) / 'audit.sqlite', checkout_root=Path(self.audit_tmp.name) / 'checkout'
        )
        self.writes = []
        @self.app.post('/api/modify_position')
        def change():
            self.writes.append(True)
            return {'success': True}
        @self.app.post('/api/chart/v1/scenarios/preview')
        def preview():
            return {'read_only': True}
        self.client = TestClient(self.app, base_url='http://127.0.0.1:8058')

    def test_mutation_requires_operator_browser_session(self):
        response = self.client.post('/api/modify_position', json={'ticket': 1})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.writes, [])
    def test_real_app_installs_control_gate(self):
        import app
        client = TestClient(app.app)
        production_audit_store = app.app.state.mutation_audit_store
        assert production_audit_store.allowed_accounts == {
            name for name, spec in app.ACCOUNTS.items()
            if spec.get('is_demo') is True and spec.get('challenge_protection') is not True
        } | {'global'}
        assert 'blueberry' not in production_audit_store.allowed_accounts
        response = client.post('/api/close_position', json={'ticket': 999})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(client.get('/api/control_session').status_code, 200)
        self.assertFalse(app.app.state.position_commit_write_capable)
        self.assertTrue(app.app.state.position_commit_dependencies_supplied)
        self.assertIs(app.app.state.position_commit_service.store, app.app.state.position_commit_store)
        self.assertIs(app.app.state.position_commit_service.previews, app.app.state.position_preview_registry)
        self.assertEqual(app.app.state.position_commit_service.guard.__class__.__name__, 'DemoPositionGuard')
        self.assertFalse(app.app.state.trade_ticket_write_capable)
        self._assert_real_app_commit_routes_reject_blueberry(client, app)

    def _assert_real_app_commit_routes_reject_blueberry(self, client, app):
        payload = {
            'schemaVersion': 1, 'account': 'titan', 'symbol': 'XAUUSD',
            'positionTicket': '123456', 'expectedRevision': 'a' * 64,
            'previewId': 'valid-preview-token-at-least-32-characters',
            'userConfirmed': True, 'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
        }
        payload['account'] = 'blueberry'
        payload['symbol'] = 'XAUUSD.pi'
        from unittest.mock import patch
        with patch.dict('os.environ', {'DASHBOARD_CONTROL_TOKEN': 'real-app-test-token'}):
            response = client.post('/api/chart/v1/position/commit-stop', json=payload,
                                   headers={'Authorization': 'Bearer real-app-test-token'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['detail']['code'], 'AUDIT_SCOPE_FORBIDDEN')
        payload['account'] = 'titan'
        payload['symbol'] = 'XAUUSD'
        with patch.dict('os.environ', {'DASHBOARD_CONTROL_TOKEN': 'real-app-test-token'}):
            disabled_response = client.post('/api/chart/v1/position/commit-stop', json=payload,
                                            headers={'Authorization': 'Bearer real-app-test-token'})
        self.assertEqual(disabled_response.status_code, 503)
        self.assertEqual(disabled_response.json()['detail']['code'], 'COMMIT_DISABLED')
        self.assertFalse(app.app.state.trade_ticket_write_capable)
        ticket_payload = {
            'schemaVersion': 1, 'account': 'titan', 'symbol': 'XAUUSD',
            'previewId': 'a-valid-server-issued-ticket-preview-id-123456',
            'userConfirmed': True, 'confirmationText': 'titan XAUUSD BUY 0.01',
            'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
        }
        with patch.dict('os.environ', {'DASHBOARD_CONTROL_TOKEN': 'real-app-test-token'}):
            ticket_response = client.post(
                '/api/chart/v1/trade-ticket/commit', json=ticket_payload,
                headers={'Authorization': 'Bearer real-app-test-token'},
            )
        self.assertEqual(ticket_response.status_code, 503)
        self.assertEqual(ticket_response.json()['detail']['code'], 'TRADE_TICKET_DISABLED')
        self.assertTrue(app.app.state.trade_ticket_preview_capable)
        self.assertFalse(app.app.state.trade_ticket_write_capable)

    def test_authenticated_browser_mutation_is_allowed(self):
        response = self.client.get('/api/control_session')
        self.assertEqual(response.status_code, 200)
        token = response.json()['csrf_token']
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertIn('SameSite=strict', response.headers['set-cookie'])
        result = self.client.post('/api/modify_position', headers={'X-Dashboard-CSRF': token, 'Origin': 'http://127.0.0.1:8058'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(self.writes), 1)

    def test_foreign_origin_cannot_mutate_with_valid_token(self):
        token = self.client.get('/api/control_session').json()['csrf_token']
        result = self.client.post('/api/modify_position', headers={'X-Dashboard-CSRF': token, 'Origin': 'https://evil.example'})
        self.assertEqual(result.status_code, 403)
        self.assertFalse(self.writes)

    def test_dns_rebinding_host_is_rejected(self):
        self.assertEqual(self.client.get('/api/control_session', headers={'Host': 'evil.example'}).status_code, 403)
        token = self.client.get('/api/control_session').json()['csrf_token']
        result = self.client.post('/api/modify_position', headers={'Host': 'evil.example', 'X-Dashboard-CSRF': token})
        self.assertEqual(result.status_code, 403)

    def test_preview_post_is_unchanged(self):
        response = self.client.post('/api/chart/v1/scenarios/preview')
        self.assertEqual(response.status_code, 200)


def test_authorized_mutations_are_journaled_without_payload_or_secret(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    audit_path = tmp_path / 'private' / 'audit.sqlite'
    store = MutationAuditStore(audit_path, checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store

    @app.post('/api/modify_position')
    def mutate():
        return {'success': True}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    session = client.get('/api/control_session')
    response = client.post(
        '/api/modify_position?account=titan',
        json={'password': 'password-sentinel', 'sl_price': 4100},
        headers={'X-Dashboard-CSRF': session.json()['csrf_token'],
                 'Origin': 'http://127.0.0.1:8058'},
    )

    assert response.status_code == 200
    events = store.recent(limit=10)
    assert [event['event'] for event in events] == ['REQUEST_STARTED', 'REQUEST_FINISHED']
    assert all(event['account'] == 'titan' for event in events)
    assert events[1]['outcome'] == 'ok'
    assert 'password-sentinel' not in audit_path.read_bytes().decode('latin1')


def test_audit_storage_failure_blocks_mutation_before_handler_runs():
    from dashboard_security import install_control_security

    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = type('UnavailableStore', (), {
        'begin_request': lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError('disk unavailable')),
    })()
    calls = []

    @app.post('/api/close_position')
    def close_position():
        calls.append('called')
        return {'success': True}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    session = client.get('/api/control_session')
    response = client.post(
        '/api/close_position?account=titan', json={'ticket': 123},
        headers={'X-Dashboard-CSRF': session.json()['csrf_token'],
                 'Origin': 'http://127.0.0.1:8058'},
    )
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'AUDIT_UNAVAILABLE'
    assert calls == []


def test_protected_account_mutation_scope_is_rejected_before_handler(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store
    calls = []

    @app.post('/api/modify_position')
    def mutate():
        calls.append('called')
        return {'success': True}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    session = client.get('/api/control_session')
    response = client.post(
        '/api/modify_position?account=blueberry', json={'ticket': 123},
        headers={'X-Dashboard-CSRF': session.json()['csrf_token'],
                 'Origin': 'http://127.0.0.1:8058'},
    )
    assert response.status_code == 403
    assert response.json()['detail']['code'] == 'AUDIT_SCOPE_FORBIDDEN'
    assert calls == []
    assert store.recent(limit=10) == []


def test_audit_records_unknown_result_when_state_change_handler_throws(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store

    @app.put('/api/chart/v1/device-sync/{bundle_id}')
    def sync_bundle(bundle_id: str):
        raise RuntimeError('sensitive internal error')

    client = TestClient(app, base_url='http://127.0.0.1:8058', raise_server_exceptions=False)
    response = client.put(
        '/api/chart/v1/device-sync/private-bundle-secret?account=goldm15',
        json={'account': 'goldm15'},
    )
    assert response.status_code == 500
    events = store.recent(limit=10)
    assert [event['event'] for event in events] == ['REQUEST_STARTED', 'REQUEST_FINISHED']
    assert events[0]['route'] == '/api/chart/v1/device-sync/{bundle_id}'
    assert events[1]['outcome'] == 'unknown'
    assert 'private-bundle-secret' not in str(events)


def test_workspace_put_and_delete_are_journaled_without_layout_payload(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    path = tmp_path / 'private' / 'audit.sqlite'
    store = MutationAuditStore(path, checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store

    @app.put('/api/chart/v1/workspace')
    def save_workspace():
        return {'saved': True}

    @app.delete('/api/chart/v1/workspace')
    def delete_workspace():
        return Response(status_code=204)

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    put = client.put('/api/chart/v1/workspace', json={
        'account': 'goldm15', 'password': 'layout-secret-sentinel',
    })
    delete = client.request('DELETE', '/api/chart/v1/workspace', json={'account': 'goldm15'})
    assert put.status_code == 200
    assert delete.status_code == 204
    events = store.recent(limit=10)
    assert [event['event'] for event in events] == [
        'REQUEST_STARTED', 'REQUEST_FINISHED', 'REQUEST_STARTED', 'REQUEST_FINISHED',
    ]
    assert [event['method'] for event in events] == ['PUT', 'PUT', 'DELETE', 'DELETE']
    assert [event['route'] for event in events] == ['/api/chart/v1/workspace'] * 4
    assert [event['account'] for event in events] == ['goldm15'] * 4
    assert 'layout-secret-sentinel' not in path.read_bytes().decode('latin1')


def test_body_scoped_workspace_rejects_protected_and_audits_allowed_account(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store
    calls = []

    @app.put('/api/chart/v1/workspace')
    def save_workspace(payload: dict):
        calls.append(True)
        return {'saved': payload['account'] == 'goldm15'}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    blocked = client.put('/api/chart/v1/workspace?account=titan', json={'account': 'blueberry'})
    assert blocked.status_code == 403
    assert calls == []
    allowed = client.put('/api/chart/v1/workspace', json={'account': 'goldm15', 'document': {'secret': 'must-not-persist'}})
    assert allowed.status_code == 200
    assert calls == [True]
    assert [event['account'] for event in store.recent(limit=4)] == ['goldm15', 'goldm15']
    assert 'must-not-persist' not in store.path.read_bytes().decode('latin1')


@pytest.mark.parametrize(('path', 'payload'), [
    ('/api/chart/v1/workspace', {'account': 'goldm15', 'document': 'x' * 70000}),
    ('/api/chart/v1/device-sync/bundle_1234567890123456',
     {'account': 'goldm15', 'ciphertext': 'A' * 900000}),
])
def test_body_scoped_audit_preserves_supported_large_payloads(tmp_path, path, payload):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store

    @app.put(path)
    def save(body: dict):
        return {'account': body['account'], 'size': len(str(body))}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    response = client.put(path, json=payload)
    assert response.status_code == 200
    assert response.json()['account'] == 'goldm15'
    assert store.recent(limit=2)[0]['account'] == 'goldm15'


def test_missing_audit_store_blocks_authenticated_mutation():
    from dashboard_security import install_control_security

    app = FastAPI()
    install_control_security(app)
    calls = []

    @app.post('/api/modify_position')
    def mutate():
        calls.append(True)
        return {'success': True}

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    csrf = client.get('/api/control_session').json()['csrf_token']
    response = client.post('/api/modify_position?account=titan', headers={
        'X-Dashboard-CSRF': csrf, 'Origin': 'http://127.0.0.1:8058',
    })
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'AUDIT_UNAVAILABLE'
    assert calls == []


def test_explicit_broker_rejection_is_journaled_as_rejected(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store

    @app.post('/api/modify_position')
    def mutate():
        return JSONResponse({'success': False, 'retcode': 10016},
                            headers={'X-Dashboard-Audit-Outcome': 'rejected'})

    client = TestClient(app, base_url='http://127.0.0.1:8058')
    csrf = client.get('/api/control_session').json()['csrf_token']
    response = client.post('/api/modify_position?account=titan', headers={
        'X-Dashboard-CSRF': csrf, 'Origin': 'http://127.0.0.1:8058',
    })
    assert response.status_code == 200
    assert 'x-dashboard-audit-outcome' not in response.headers
    assert store.recent(limit=1)[0]['outcome'] == 'rejected'


def test_audit_read_endpoint_requires_identity_and_returns_no_store_path(tmp_path):
    from dashboard_security import install_control_security

    root = tmp_path / 'checkout'
    root.mkdir()
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root)
    request_id = store.begin_request(
        method='DELETE', route='/api/chart/v1/workspace', principal=('proxy', 'reader', 'read'),
    )
    store.finish_request(request_id, status_code=404, outcome='rejected')
    app = FastAPI()
    install_control_security(app)
    app.state.mutation_audit_store = store
    local = TestClient(app, base_url='http://127.0.0.1:8058')
    response = local.get('/api/audit/mutations?limit=2')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    body = response.json()
    assert body['schemaVersion'] == 1
    assert body['events'][-1]['requestId'] == request_id
    assert 'path' not in body
    assert local.get('/api/audit/mutations?limit=501').status_code == 422
    external = TestClient(app, client=('203.0.113.5', 1234))
    assert external.get('/api/audit/mutations').status_code == 403


def test_disabled_real_app_commit_attempt_is_audited_without_broker_access(tmp_path, monkeypatch):
    import app as live_app

    root = Path(live_app.__file__).resolve().parent
    store = MutationAuditStore(tmp_path / 'private' / 'audit.sqlite', checkout_root=root,
                               allowed_accounts={'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15'})
    monkeypatch.setattr(live_app.app.state, 'mutation_audit_store', store)
    token = 'runtime-test-token-that-must-not-be-stored'
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', token)
    client = TestClient(live_app.app)
    response = client.post(
        '/api/chart/v1/trade-ticket/commit',
        headers={'Authorization': 'Bearer ' + token},
        json={
            'schemaVersion': 1, 'account': 'titan', 'symbol': 'XAUUSD',
            'previewId': 'a-valid-server-issued-ticket-preview-id-123456',
            'userConfirmed': True, 'confirmationText': 'titan XAUUSD BUY_LIMIT 0.01',
            'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
        },
    )
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'TRADE_TICKET_DISABLED'
    events = store.recent(limit=10)
    assert events[0]['route'] == '/api/chart/v1/trade-ticket/commit'
    assert events[-1]['outcome'] == 'unknown'
    assert token not in store.path.read_bytes().decode('latin1')
    assert live_app.app.state.trade_ticket_write_capable is False

    def test_csrf_cookie_and_header_both_required(self):
        token = self.client.get('/api/control_session').json()['csrf_token']
        self.assertEqual(self.client.post('/api/modify_position').status_code, 403)
        self.client.cookies.clear()
        self.assertEqual(self.client.post('/api/modify_position', headers={'X-Dashboard-CSRF': token}).status_code, 403)

    def test_cross_site_bootstrap_is_rejected(self):
        self.assertEqual(self.client.get('/api/control_session', headers={'Sec-Fetch-Site': 'cross-site'}).status_code, 403)
        self.assertEqual(self.client.get('/api/control_session', headers={'Origin': 'https://evil.example'}).status_code, 403)

    def test_root_path_prefix_cannot_bypass_any_control_mutation(self):
        prefixed = TestClient(self.app, base_url='http://127.0.0.1:8058', root_path='/stt', client=('203.0.113.2',9999))
        for path in ('modify_position','close_position','reset_drawdown'):
            response = prefixed.post('/stt/api/'+path, headers={'Origin':'https://evil.example'})
            self.assertEqual(response.status_code,403,path)
        self.assertEqual(self.writes,[])

    def test_valid_prefixed_browser_session_and_readonly_preview_work(self):
        client=TestClient(self.app,base_url='http://127.0.0.1:8058',root_path='/stt')
        token=client.get('/stt/api/control_session').json()['csrf_token']
        self.assertEqual(client.post('/stt/api/modify_position',headers={'X-Dashboard-CSRF':token,'Origin':'http://127.0.0.1:8058'}).status_code,200)
        self.assertEqual(client.post('/stt/api/chart/v1/scenarios/preview').status_code,200)

    def test_trailing_and_encoded_paths_cannot_bypass_control_gate(self):
        for path in ('/api/modify_position/','/api/%6dodify_position'):
            self.assertEqual(self.client.post(path,follow_redirects=True).status_code,403)
        self.assertFalse(self.writes)

    def test_remote_clients_require_explicit_bearer(self):
        from unittest.mock import patch
        remote = TestClient(self.app, base_url='http://127.0.0.1:8058', client=('203.0.113.2', 9999))
        with patch.dict('os.environ', {'DASHBOARD_CONTROL_TOKEN': 'test-only-capability'}):
            self.assertEqual(remote.get('/api/control_session').status_code, 403)
            self.assertEqual(remote.post('/api/modify_position').status_code, 403)
            header = {'Authorization': 'Bearer test-only-capability'}
            self.assertEqual(remote.post('/api/modify_position', headers=header).status_code, 200)
            token = remote.get('/api/control_session', headers=header).json()['csrf_token']
            self.assertEqual(remote.post('/api/modify_position', headers={'X-Dashboard-CSRF': token}).status_code, 200)

    def test_expired_browser_session_is_rejected(self):
        from unittest.mock import patch
        token = self.client.get('/api/control_session').json()['csrf_token']
        with patch('dashboard_security.time.monotonic', return_value=1e30):
            self.assertEqual(self.client.post('/api/modify_position', headers={'X-Dashboard-CSRF': token}).status_code, 403)


if __name__ == '__main__':
    unittest.main()
