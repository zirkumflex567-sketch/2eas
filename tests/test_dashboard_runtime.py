"""Runtime proof tests use disposable checkouts and never import MT5/app."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import shutil
import socket
import time
import tempfile
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[1]


def runtime_module():
    path = ROOT / 'dashboard_runtime.py'
    assert path.exists(), 'runtime identity module is required'
    spec = importlib.util.spec_from_file_location('runtime_under_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], timeout=10)


@pytest.fixture
def checkout(tmp_path):
    git(tmp_path, 'init', '-q')
    git(tmp_path, 'config', 'user.email', 'fixture@example.invalid')
    git(tmp_path, 'config', 'user.name', 'Fixture')
    (tmp_path / 'app.py').write_text('value = 1\n')
    (tmp_path / 'module.py').write_text('value = 2\n')
    (tmp_path / 'static').mkdir()
    (tmp_path / 'static' / 'ui.js').write_text('const value = 1;\n')
    (tmp_path / 'package.json').write_text('{"private":true}')
    (tmp_path / 'drawdown_config.json').write_text('{"balance":123}')
    git(tmp_path, 'add', '.')
    git(tmp_path, 'commit', '-qm', 'fixture')
    return tmp_path


def test_captures_startup_then_detects_source_edit(checkout):
    runtime = runtime_module().RuntimeIdentity(checkout)
    initial = runtime.payload()
    assert initial['pid'] == os.getpid()
    assert initial['startedUtc'].endswith('Z')
    assert initial['startupRevision'] == git(checkout, 'rev-parse', 'HEAD').decode().strip()
    assert initial['startupDigest'] == initial['diskDigest']
    assert initial['restart_required'] is False
    (checkout / 'module.py').write_text('value = 3\n')
    changed = runtime.payload()
    assert changed['startupDigest'] == initial['startupDigest']
    assert changed['diskDigest'] != initial['startupDigest']
    assert changed['restart_required'] is True
    assert changed['applicationCodeDirty'] is True


@pytest.mark.parametrize('action', ['static', 'deleted', 'added', 'package', 'commit'])
def test_detects_tracked_inventory_and_revision_changes(checkout, action):
    runtime = runtime_module().RuntimeIdentity(checkout)
    if action == 'static':
        (checkout / 'static' / 'ui.js').write_text('changed')
    elif action == 'deleted':
        (checkout / 'module.py').unlink()
    elif action == 'added':
        (checkout / 'new.py').write_text('new = 1')
        git(checkout, 'add', 'new.py')
    elif action == 'package':
        (checkout / 'package.json').write_text('{"version":"2"}')
    else:
        git(checkout, 'commit', '--allow-empty', '-qm', 'new revision')
    assert runtime.payload()['restart_required'] is True


def test_private_untracked_generated_and_mutable_files_are_excluded(checkout, monkeypatch):
    runtime = runtime_module().RuntimeIdentity(checkout)
    monkeypatch.setenv('RUNTIME_TEST_SECRET', 'never-emit-this-secret')
    for name in ['private/secret.py', 'docs/sample.py', 'tests/test_new.py', 'output/generated.js']:
        path = checkout / name
        path.parent.mkdir(exist_ok=True)
        path.write_text('never-emit-this-secret')
        git(checkout, 'add', name)
    (checkout / 'untracked.py').write_text('never-emit-this-secret')
    (checkout / 'drawdown_config.json').write_text('{"balance":999}')
    result = runtime.payload()
    assert result['restart_required'] is False
    assert result['applicationCodeDirty'] is False
    serialized = json.dumps(result)
    assert str(checkout) not in serialized
    assert 'never-emit-this-secret' not in serialized


def test_checkout_identity_distinguishes_identical_worktrees(checkout, tmp_path):
    module = runtime_module()
    other = tmp_path / 'other'
    git(checkout, 'worktree', 'add', '--detach', str(other), 'HEAD')
    first, second = module.inspect_checkout(checkout), module.inspect_checkout(other)
    assert first['digest'] == second['digest']
    assert first['revision'] == second['revision']
    assert first['checkoutId'] != second['checkoutId']
    assert len(first['checkoutId']) == 64


def test_nongit_safe_fallback_and_missing_code(tmp_path):
    (tmp_path / 'app.py').write_text('pass')
    (tmp_path / 'private.py').write_text('secret')
    module = runtime_module()
    runtime = module.RuntimeIdentity(tmp_path)
    assert runtime.payload()['startupRevision'] == 'unknown'
    (tmp_path / 'private.py').write_text('changed secret')
    assert runtime.payload()['restart_required'] is False
    (tmp_path / 'app.py').unlink()
    assert runtime.payload()['restart_required'] is True
    assert runtime.payload()['sourceAvailable'] is False


def test_inspect_cli_no_app_import_and_safe_json(checkout):
    runtime_module()
    (checkout / 'app.py').write_text('raise RuntimeError("must not import")')
    result = subprocess.run([sys.executable, str(ROOT / 'dashboard_runtime.py'),
                             '--inspect-checkout', str(checkout)], capture_output=True, timeout=15)
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload['applicationCodeDirty'] is True
    assert payload['revision'] != 'unknown'
    assert str(checkout).encode() not in result.stdout
    assert not result.stderr


def test_git_checkout_cannot_attest_an_untracked_entrypoint(checkout):
    module = runtime_module()
    git(checkout, 'rm', '--cached', 'app.py')
    git(checkout, 'commit', '-qm', 'remove entrypoint from tracked source')
    assert (checkout / 'app.py').exists()
    assert module.inspect_checkout(checkout)['sourceAvailable'] is False
    assert module.RuntimeIdentity(checkout).payload()['restart_required'] is True


def test_route_is_installed_without_dependency_on_fastapi(checkout):
    module = runtime_module()
    routes = {}
    class App:
        def get(self, path):
            def decorate(handler):
                routes[path] = handler
                return handler
            return decorate
    module.install_runtime(App(), checkout)
    assert routes['/api/runtime']()['startupDigest']


MOCK_APP = '''import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from dashboard_runtime import RuntimeIdentity
identity = RuntimeIdentity(Path(__file__).resolve().parent)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(identity.payload()).encode())
    def log_message(self, *args): pass
HTTPServer(('127.0.0.1', int(os.environ['DASHBOARD_PORT'])), Handler).serve_forever()
'''


def run_control(repo, port, action, env_file=None):
    script = ROOT / 'scripts' / 'dashboard_runtime.ps1'
    assert script.exists(), 'guarded restart script is required'
    args = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
            '-Action', action, '-Repo', str(repo), '-Python', sys.executable, '-Port', str(port),
            '-StartupTimeoutSeconds', '8']
    if env_file:
        args += ['-PrivateEnvJson', str(env_file)]
    # Windows background children can inherit subprocess pipe handles even with
    # their own log redirection. File capture keeps operator exit independent.
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        result = subprocess.run(args, stdout=stdout, stderr=stderr, timeout=35)
        stdout.seek(0)
        stderr.seek(0)
        return subprocess.CompletedProcess(args, result.returncode,
                                           stdout.read().decode(), stderr.read().decode())


@pytest.mark.skipif(os.name != 'nt', reason='Windows PowerShell operational workflow')
def test_powershell_lifecycle_and_pre_stop_guards(checkout, tmp_path):
    runtime_module()
    (checkout / 'app.py').write_text(MOCK_APP)
    shutil.copyfile(ROOT / 'dashboard_runtime.py', checkout / 'dashboard_runtime.py')
    (checkout / '.gitignore').write_text('*.log\n')
    git(checkout, 'add', 'app.py', 'dashboard_runtime.py', '.gitignore')
    git(checkout, 'commit', '-qm', 'mock runtime')
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    # Outside the checkout; never emit values to subprocess output.
    env_file = tmp_path.parent / (tmp_path.name + '-private.json')
    env_file.write_text(json.dumps({'DASHBOARD_CONTROL_TOKEN': 'fixture-secret-never-emit'}))
    launched = []
    def endpoint():
        with urlopen(f'http://127.0.0.1:{port}/api/runtime', timeout=3) as response:
            return json.load(response)
    try:
        started = run_control(checkout, port, 'Start', env_file)
        assert started.returncode == 0, started.stdout + started.stderr
        first = endpoint()
        launched.append(first['pid'])
        status = run_control(checkout, port, 'Status')
        assert status.returncode == 0
        assert json.loads(status.stdout)['pid'] == first['pid']
        (checkout / 'module.py').write_text('dirty = True')
        refused = run_control(checkout, port, 'Restart', env_file)
        assert refused.returncode != 0
        assert endpoint()['pid'] == first['pid']
        git(checkout, 'restore', 'module.py')
        invalid_env = tmp_path.parent / (tmp_path.name + '-invalid.json')
        invalid_env.write_text('{"PYTHONPATH":"fixture-secret-never-emit"}')
        refused = run_control(checkout, port, 'Restart', invalid_env)
        assert refused.returncode != 0
        assert 'fixture-secret-never-emit' not in refused.stdout + refused.stderr
        assert endpoint()['pid'] == first['pid']
        invalid_env.write_text('{"DASHBOARD_PROXY_PREFIX":"/stt/"}')
        refused = run_control(checkout, port, 'Restart', invalid_env)
        assert refused.returncode != 0
        assert endpoint()['pid'] == first['pid']
        invalid_env.unlink()
        other = tmp_path / 'identical-other-worktree'
        git(checkout, 'worktree', 'add', '--detach', str(other), 'HEAD')
        refused = run_control(other, port, 'Restart', env_file)
        assert refused.returncode != 0
        assert endpoint()['pid'] == first['pid']
        restarted = run_control(checkout, port, 'Restart', env_file)
        assert restarted.returncode == 0, restarted.stdout + restarted.stderr
        second = endpoint()
        launched.append(second['pid'])
        assert second['pid'] != first['pid']
        assert second['startupDigest'] == first['startupDigest']
        assert 'fixture-secret-never-emit' not in started.stdout + restarted.stdout
    finally:
        for pid in launched:
            subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True, timeout=10)
        env_file.unlink(missing_ok=True)


@pytest.mark.skipif(os.name != 'nt', reason='Windows PowerShell operational workflow')
def test_powershell_refuses_unrelated_listener(checkout):
    runtime_module()
    shutil.copyfile(ROOT / 'dashboard_runtime.py', checkout / 'dashboard_runtime.py')
    git(checkout, 'add', 'dashboard_runtime.py')
    git(checkout, 'commit', '-qm', 'inspection')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        port = listener.getsockname()[1]
        refused = run_control(checkout, port, 'Restart')
        assert refused.returncode != 0
        assert listener.fileno() != -1


def test_git_timeout_returns_explicit_unknown_without_private_errors(checkout, monkeypatch):
    module = runtime_module()
    def timeout(command, **kwargs):
        assert kwargs['timeout'] == 2
        assert 'shell' not in kwargs
        raise subprocess.TimeoutExpired(command, 2, stderr='private error never emit')
    monkeypatch.setattr(module.subprocess, 'run', timeout)
    payload = module.inspect_checkout(checkout)
    assert payload['revision'] == 'unknown'
    assert payload['applicationCodeDirty'] is None
    assert 'private error' not in json.dumps(payload)


@pytest.mark.parametrize('contents', [
    '{"DASHBOARD_PROXY_SECRET":"short"}',
    '{"DASHBOARD_PROXY_PREFIX":"/stt/"}',
    '{"DASHBOARD_QUOTE_MAX_AGE_SECONDS":"nan"}',
    '{"CHART_STUDIO_STORAGE_ENABLED":"1"}',
    '{"DASHBOARD_CONTROL_TOKEN":"first","DASHBOARD_CONTROL_TOKEN":"second"}',
    '{"DASHBOARD_PROXY_USERS":"{\\"same\\":\\"read\\",\\"same\\":\\"trade\\"}"}',
])
def test_private_environment_preflight_rejects_invalid_config(checkout, tmp_path, contents):
    module = runtime_module()
    assert hasattr(module, 'validate_environment_file'), 'strict private preflight required'
    private = tmp_path.parent / (tmp_path.name + '-validation.json')
    private.write_text(contents)
    try:
        with pytest.raises(ValueError, match='Invalid private environment'):
            module.validate_environment_file(checkout, private)
    finally:
        private.unlink(missing_ok=True)


def test_private_environment_preflight_rejects_checkout_file(checkout):
    module = runtime_module()
    assert hasattr(module, 'validate_environment_file'), 'strict private preflight required'
    private = checkout / 'private-env.json'
    private.write_text('{}')
    with pytest.raises(ValueError, match='Invalid private environment'):
        module.validate_environment_file(checkout, private)


@pytest.mark.skipif(os.name != 'nt', reason='Windows PowerShell operational workflow')
def test_powershell_refuses_malformed_runtime_identity(checkout):
    runtime_module()
    shutil.copyfile(ROOT / 'dashboard_runtime.py', checkout / 'dashboard_runtime.py')
    (checkout / '.gitignore').write_text('*.log\n')
    # A live HTTP listener with an endpoint is still not enough for ownership.
    bad_app = MOCK_APP.replace('json.dumps(identity.payload())',
                               'json.dumps({"pid":os.getpid(),"checkoutId":"malformed"})')
    (checkout / 'app.py').write_text(bad_app)
    git(checkout, 'add', 'app.py', 'dashboard_runtime.py', '.gitignore')
    git(checkout, 'commit', '-qm', 'malformed endpoint fixture')
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    env = os.environ.copy()
    env['DASHBOARD_PORT'] = str(port)
    process = subprocess.Popen([sys.executable, str(checkout / 'app.py')], env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                with urlopen(f'http://127.0.0.1:{port}/api/runtime', timeout=1) as response:
                    assert json.load(response)['checkoutId'] == 'malformed'
                break
            except OSError:
                time.sleep(.05)
        else:
            pytest.fail('disposable HTTP fixture did not start')
        refused = run_control(checkout, port, 'Restart')
        assert refused.returncode != 0
        assert 'malformed' in refused.stdout
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=5)


@pytest.mark.skipif(os.name != 'nt', reason='Windows PowerShell operational workflow')
def test_powershell_failed_restart_retains_recovery_state(checkout, tmp_path):
    runtime_module()
    (checkout / 'app.py').write_text(MOCK_APP)
    shutil.copyfile(ROOT / 'dashboard_runtime.py', checkout / 'dashboard_runtime.py')
    (checkout / '.gitignore').write_text('*.log\n')
    git(checkout, 'add', 'app.py', 'dashboard_runtime.py', '.gitignore')
    git(checkout, 'commit', '-qm', 'mock runtime')
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    env_file = tmp_path.parent / (tmp_path.name + '-recovery-private.json')
    env_file.write_text('{"DASHBOARD_CONTROL_TOKEN":"fixture-secret-never-emit"}')
    old_pid = None
    try:
        started = run_control(checkout, port, 'Start', env_file)
        assert started.returncode == 0, started.stdout + started.stderr
        previous = json.loads(started.stdout)
        old_pid = previous['pid']
        (checkout / 'app.py').write_text('raise RuntimeError("fixture startup fails")\n')
        git(checkout, 'add', 'app.py')
        git(checkout, 'commit', '-qm', 'broken startup fixture')
        failed = run_control(checkout, port, 'Restart', env_file)
        assert failed.returncode != 0
        assert 'Previous dashboard stopped' in failed.stdout
        assert previous['startupRevision'] in failed.stdout
        assert 'fixture-secret-never-emit' not in failed.stdout + failed.stderr
        recovery = list(checkout.glob('*.previous.log'))
        assert len(recovery) == 1
        assert json.loads(recovery[0].read_text(encoding='utf-8-sig'))['pid'] == old_pid
        assert env_file.exists()
        assert (checkout / 'app.py').exists()
    finally:
        if old_pid:
            subprocess.run(['taskkill', '/PID', str(old_pid), '/F'], capture_output=True, timeout=10)
        env_file.unlink(missing_ok=True)
