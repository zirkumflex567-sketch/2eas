"""Browser mutation security tests; no MT5 and no real writes."""
import unittest
from fastapi import FastAPI
from fastapi.testclient import TestClient


class ControlSecurityTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        try:
            from dashboard_security import install_control_security
        except ImportError:
            install_control_security = lambda app: None
        install_control_security(self.app)
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
        response = client.post('/api/close_position', json={'ticket': 999})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(client.get('/api/control_session').status_code, 200)
        self.assertFalse(app.app.state.position_commit_write_capable)
        from unittest.mock import patch
        payload = {
            'schemaVersion': 1, 'account': 'titan', 'symbol': 'XAUUSD',
            'positionTicket': '123456', 'expectedRevision': 'a' * 64,
            'previewId': 'valid-preview-token-at-least-32-characters',
            'userConfirmed': True, 'idempotencyKey': 'b98d71dc-bd22-4a68-8d45-935a5e4b1cf1',
        }
        with patch.dict('os.environ', {'DASHBOARD_CONTROL_TOKEN': 'real-app-test-token'}):
            response = client.post('/api/chart/v1/position/commit-stop', json=payload,
                                   headers={'Authorization': 'Bearer real-app-test-token'})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['detail']['code'], 'COMMIT_DISABLED')

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
