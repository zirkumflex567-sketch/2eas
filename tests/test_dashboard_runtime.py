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
PWSH = shutil.which('pwsh')
WINDOWS_SHELLS = [
    'powershell.exe',
    pytest.param(PWSH, marks=pytest.mark.skipif(PWSH is None, reason='PowerShell 7 is not installed')),
]


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


def test_private_environment_accepts_only_well_formed_demo_capture_allowlist(checkout, tmp_path):
    private = tmp_path.parent / (tmp_path.name + '-deal-capture.json')
    private.write_text(json.dumps({'CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS': 'titan,xau5m_m5'}))
    try:
        runtime_module().validate_environment_file(checkout, private)
        for value in ('titan,,xau5m_m5', 'titan,titan', 'Titan'):
            private.write_text(json.dumps({'CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS': value}))
            with pytest.raises(ValueError, match='Invalid private environment'):
                runtime_module().validate_environment_file(checkout, private)
    finally:
        private.unlink(missing_ok=True)


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


@pytest.mark.parametrize('flag', ['--assume-unchanged', '--skip-worktree'])
def test_git_index_flags_cannot_hide_application_changes(checkout, flag):
    module = runtime_module()
    original = module.inspect_checkout(checkout)
    git(checkout, 'update-index', flag, 'module.py')
    (checkout / 'module.py').write_text('changed = True\n')
    current = module.inspect_checkout(checkout)
    assert current['digest'] != original['digest']
    assert current['applicationCodeDirty'] is True


@pytest.mark.parametrize('username', ['viewer other', 'viewer,other', 'viewer\tother', 'viewer\u00e4'])
def test_private_environment_matches_actual_proxy_username_grammar(checkout, tmp_path, username):
    private = tmp_path.parent / (tmp_path.name + '-user-validation.json')
    private.write_text(json.dumps({'DASHBOARD_PROXY_SECRET': 'fixture-secret-never-emit' * 2,
                                  'DASHBOARD_PROXY_USERS': json.dumps({'operator': 'trade', username: 'read'})}))
    try:
        with pytest.raises(ValueError, match='Invalid private environment'):
            runtime_module().validate_environment_file(checkout, private)
    finally:
        private.unlink(missing_ok=True)


def test_source_preflight_rejects_committed_helper_syntax_error_without_import(checkout):
    module = runtime_module()
    assert hasattr(module, 'preflight_checkout'), 'complete Python inventory preflight required'
    (checkout / 'module.py').write_text('this is invalid python :\n')
    git(checkout, 'add', 'module.py')
    git(checkout, 'commit', '-qm', 'bad helper syntax fixture')
    with pytest.raises(ValueError, match='Invalid application source'):
        module.preflight_checkout(checkout)


def test_source_preflight_does_not_import_or_compile_excluded_private_files(checkout):
    module = runtime_module()
    assert hasattr(module, 'preflight_checkout'), 'complete Python inventory preflight required'
    (checkout / 'app.py').write_text('raise RuntimeError("must never import")\n')
    for name in ('tests/test_bad.py', 'docs/example.py', 'private/settings.py'):
        path = checkout / name
        path.parent.mkdir(exist_ok=True)
        path.write_text('fixture secret invalid syntax :\n')
        git(checkout, 'add', name)
    (checkout / 'untracked.py').write_text('invalid private syntax :\n')
    (checkout / 'drawdown_config.json').write_text('{"invalid-json"')
    module.preflight_checkout(checkout)


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


MOCK_APP = '''import hashlib, json, os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from dashboard_runtime import RuntimeIdentity
identity = RuntimeIdentity(Path(__file__).resolve().parent)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        if self.path == '/fixture/demo-allowlist-proof':
            self.wfile.write(json.dumps({'demoAllowlistMatches': os.environ.get('CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS') == 'titan,xau5m_m5'}).encode())
            return
        if self.path == '/fixture/env-proof':
            matches = hashlib.sha256(os.environ.get('DASHBOARD_CONTROL_TOKEN', '').encode()).hexdigest() == 'b0a9b0c0a1a43b72218766d72d6e64d8ad0b7a677db3ab8e3a1e0c03539a761a'
            self.wfile.write(json.dumps({'privateEnvironmentMatches': matches}).encode())
            return
        self.wfile.write(json.dumps(identity.payload()).encode())
    def log_message(self, *args): pass
HTTPServer(('127.0.0.1', int(os.environ['DASHBOARD_PORT'])), Handler).serve_forever()
'''


def run_control(repo, port, action, env_file=None, shell='powershell.exe', script=None):
    script = script or ROOT / 'scripts' / 'dashboard_runtime.ps1'
    assert script.exists(), 'guarded restart script is required'
    args = [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
            '-Action', action, '-Repo', str(repo), '-Python', sys.executable, '-Port', str(port),
            '-StartupTimeoutSeconds', '8']
    if env_file:
        args += ['-PrivateEnvJson', str(env_file)]
    # Windows background children can inherit subprocess pipe handles even with
    # their own log redirection. File capture keeps operator exit independent.
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        # This includes repeated Git/PowerShell preflight in addition to the
        # bounded 8s application startup wait, and may run beside the full suite.
        result = subprocess.run(args, stdout=stdout, stderr=stderr, timeout=120)
        stdout.seek(0)
        stderr.seek(0)
        return subprocess.CompletedProcess(args, result.returncode,
                                           stdout.read().decode(), stderr.read().decode())


def cleanup_mock_processes(checkout):
    """Match the exact disposable app path AND interpreter, never a port/PID alone."""
    env = os.environ.copy()
    env['DASHBOARD_TEST_FIXTURE_APP'] = str(checkout / 'app.py')
    env['DASHBOARD_TEST_FIXTURE_PYTHON'] = sys.executable
    command = '''$targetPattern = '(?:^|\\s)"?' + [regex]::Escape($env:DASHBOARD_TEST_FIXTURE_APP) + '"?(?:\\s|$)';
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
Where-Object { $_.ExecutablePath -eq $env:DASHBOARD_TEST_FIXTURE_PYTHON -and $_.CommandLine -match $targetPattern } |
ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }'''
    subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=True)


def prepare_mock_checkout(checkout, app=MOCK_APP):
    (checkout / 'app.py').write_text(app)
    shutil.copyfile(ROOT / 'dashboard_runtime.py', checkout / 'dashboard_runtime.py')
    (checkout / '.gitignore').write_text('*.log\n')
    git(checkout, 'add', 'app.py', 'dashboard_runtime.py', '.gitignore')
    git(checkout, 'commit', '-qm', 'mock runtime')
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        return reservation.getsockname()[1]


def mock_endpoint(port, path='/api/runtime'):
    with urlopen(f'http://127.0.0.1:{port}{path}', timeout=3) as response:
        return json.load(response)


@pytest.mark.skipif(os.name != 'nt' or PWSH is None, reason='Windows PowerShell and PowerShell 7 required')
def test_powershell_cross_shell_runtime_timestamp_and_private_environment(checkout, tmp_path):
    port = prepare_mock_checkout(checkout)
    env_file = tmp_path.parent / (tmp_path.name + '-cross-shell-private.json')
    secret = 'fixture-secret-never-emit'
    env_file.write_text(json.dumps({'DASHBOARD_CONTROL_TOKEN': secret,
                                    'CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS': 'titan,xau5m_m5'}))
    results = []
    try:
        started = run_control(checkout, port, 'Start', env_file)
        results.append(started)
        assert started.returncode == 0, started.stdout + started.stderr
        original = mock_endpoint(port)
        assert mock_endpoint(port, '/fixture/env-proof') == {'privateEnvironmentMatches': True}
        assert mock_endpoint(port, '/fixture/demo-allowlist-proof') == {'demoAllowlistMatches': True}
        status = run_control(checkout, port, 'Status', shell=PWSH)
        results.append(status)
        assert status.returncode == 0, status.stdout + status.stderr
        assert json.loads(status.stdout) == original
        restarted = run_control(checkout, port, 'Restart', env_file, shell=PWSH)
        results.append(restarted)
        assert restarted.returncode == 0, restarted.stdout + restarted.stderr
        replacement = mock_endpoint(port)
        assert replacement['pid'] != original['pid']
        assert replacement['startupDigest'] == original['startupDigest'] == replacement['diskDigest']
        assert replacement['startupRevision'] == original['startupRevision'] == replacement['diskRevision']
        assert replacement['applicationCodeDirty'] is False
        assert replacement['restart_required'] is False
        assert mock_endpoint(port, '/fixture/env-proof') == {'privateEnvironmentMatches': True}
        assert mock_endpoint(port, '/fixture/demo-allowlist-proof') == {'demoAllowlistMatches': True}
        for shell in ('powershell.exe', PWSH):
            status = run_control(checkout, port, 'Status', shell=shell)
            results.append(status)
            assert status.returncode == 0, status.stdout + status.stderr
            assert json.loads(status.stdout) == replacement
    finally:
        cleanup_mock_processes(checkout)
        env_file.unlink(missing_ok=True)
        for result in results:
            assert secret not in result.stdout + result.stderr


@pytest.mark.skipif(os.name != 'nt', reason='Windows PowerShell operational workflow')
@pytest.mark.parametrize('shell', WINDOWS_SHELLS)
@pytest.mark.parametrize('invalid_identity', ['non_string', 'invalid_utc', 'invalid_date', 'wrong_pid', 'other_checkout'])
def test_powershell_raw_identity_guards_refuse_without_stop(checkout, tmp_path, shell, invalid_identity):
    overrides = {
        'non_string': 'dict(identity.payload(), startedUtc=123)',
        'invalid_utc': 'dict(identity.payload(), startedUtc="2026-10-09T12:34:56+00:00")',
        'invalid_date': 'dict(identity.payload(), startedUtc="2026-02-30T12:34:56Z")',
        'wrong_pid': 'dict(identity.payload(), pid=os.getpid()+1)',
    }
    app = MOCK_APP.replace('json.dumps(identity.payload())',
                           'json.dumps(' + overrides.get(invalid_identity, 'identity.payload()') + ')')
    port = prepare_mock_checkout(checkout, app)
    target = checkout
    if invalid_identity == 'other_checkout':
        target = tmp_path / 'other-worktree'
        git(checkout, 'worktree', 'add', '--detach', str(target), 'HEAD')
    env_file = tmp_path.parent / (tmp_path.name + '-guard-private.json')
    secret = 'fixture-secret-never-emit'
    env_file.write_text(json.dumps({'DASHBOARD_CONTROL_TOKEN': secret}))
    env = os.environ.copy()
    env.update(DASHBOARD_PORT=str(port), DASHBOARD_CONTROL_TOKEN=secret)
    process = None
    results = []
    try:
        process = subprocess.Popen([sys.executable, str(checkout / 'app.py')], env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                original = mock_endpoint(port)
                break
            except OSError:
                time.sleep(.05)
        else:
            pytest.fail('disposable HTTP fixture did not start')
        for action in ('Status', 'Restart'):
            refused = run_control(target, port, action, env_file, shell=shell)
            results.append(refused)
            assert refused.returncode != 0, refused.stdout + refused.stderr
            expected_message = ('Listener belongs to another checkout; nothing stopped.'
                                if invalid_identity == 'other_checkout' else
                                'Listener runtime identity unavailable or malformed; nothing stopped.')
            assert expected_message in refused.stdout
            assert process.poll() is None
            assert mock_endpoint(port) == original
            assert mock_endpoint(port, '/fixture/env-proof') == {'privateEnvironmentMatches': True}
    finally:
        cleanup_mock_processes(checkout)
        if process is not None:
            process.wait(timeout=5)
        env_file.unlink(missing_ok=True)
        for result in results:
            assert secret not in result.stdout + result.stderr


@pytest.mark.skipif(os.name != 'nt' or PWSH is None, reason='Windows PowerShell and PowerShell 7 required')
def test_powershell_core_without_string_parser_refuses_before_stop(checkout, tmp_path):
    port = prepare_mock_checkout(checkout)
    # Emulate the ConvertFrom-Json parameter metadata of an older Core shell.
    # The installed shell remains real and all process/HTTP guards still execute.
    wrapper = tmp_path.parent / (tmp_path.name + '-old-core-parser.ps1')
    guard = str(ROOT / 'scripts' / 'dashboard_runtime.ps1').replace("'", "''")
    wrapper.write_text('''function ConvertFrom-Json {
    [CmdletBinding()] param([Parameter(ValueFromPipeline=$true)][string]$InputObject)
    process { Microsoft.PowerShell.Utility\\ConvertFrom-Json -InputObject $InputObject }
}
''' + "& '" + guard + "' @args\nexit $LASTEXITCODE\n")
    try:
        started = run_control(checkout, port, 'Start')
        assert started.returncode == 0, started.stdout + started.stderr
        original = mock_endpoint(port)
        refused = run_control(checkout, port, 'Restart', shell=PWSH, script=wrapper)
        assert refused.returncode != 0, refused.stdout + refused.stderr
        assert 'PowerShell JSON parser cannot preserve runtime timestamp strings; nothing stopped.' in refused.stdout
        assert mock_endpoint(port) == original
    finally:
        cleanup_mock_processes(checkout)
        wrapper.unlink(missing_ok=True)


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
        for flag in ('--assume-unchanged', '--skip-worktree'):
            git(checkout, 'update-index', flag, 'module.py')
            (checkout / 'module.py').write_text('concealed = True\n')
            refused = run_control(checkout, port, 'Restart', env_file)
            assert refused.returncode != 0, refused.stdout + refused.stderr
            assert endpoint()['pid'] == first['pid']
            git(checkout, 'update-index', '--no-' + flag[2:], 'module.py')
            git(checkout, 'restore', 'module.py')
        invalid_env = tmp_path.parent / (tmp_path.name + '-invalid.json')
        invalid_env.write_text('{"PYTHONPATH":"fixture-secret-never-emit"}')
        refused = run_control(checkout, port, 'Restart', invalid_env)
        assert refused.returncode != 0
        assert 'fixture-secret-never-emit' not in refused.stdout + refused.stderr
        assert endpoint()['pid'] == first['pid']
        for username in ('viewer other', 'viewer,other', 'viewer\tother', 'viewer\u00e4'):
            invalid_env.write_text(json.dumps({'DASHBOARD_PROXY_SECRET': 'fixture-secret-never-emit' * 2,
                'DASHBOARD_PROXY_USERS': json.dumps({'operator': 'trade', username: 'read'})}))
            refused = run_control(checkout, port, 'Restart', invalid_env)
            assert refused.returncode != 0, refused.stdout + refused.stderr
            assert 'fixture-secret-never-emit' not in refused.stdout + refused.stderr
            assert endpoint()['pid'] == first['pid']
        invalid_env.write_text('{"DASHBOARD_PROXY_PREFIX":"/stt/"}')
        refused = run_control(checkout, port, 'Restart', invalid_env)
        assert refused.returncode != 0
        assert endpoint()['pid'] == first['pid']
        invalid_env.unlink()
        (checkout / 'module.py').write_text('this is invalid python :\n')
        git(checkout, 'add', 'module.py')
        git(checkout, 'commit', '-qm', 'committed invalid helper syntax fixture')
        refused = run_control(checkout, port, 'Restart', env_file)
        assert refused.returncode != 0, refused.stdout + refused.stderr
        assert endpoint()['pid'] == first['pid']
        (checkout / 'module.py').write_text('value = 2\n')
        git(checkout, 'add', 'module.py')
        git(checkout, 'commit', '-qm', 'restore helper syntax fixture')
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
        cleanup_mock_processes(checkout)
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


def test_private_environment_allows_only_external_existing_spool_root(checkout, tmp_path):
    module = runtime_module()
    spool = tmp_path.parent / (tmp_path.name + '-private-spool')
    spool.mkdir()
    private = tmp_path.parent / (tmp_path.name + '-spool-env.json')
    private.write_text(json.dumps({'CHART_STUDIO_EVIDENCE_SPOOL_ROOT': str(spool)}))
    try:
        module.validate_environment_file(checkout, private)
        inside = checkout / 'spool'
        inside.mkdir()
        private.write_text(json.dumps({'CHART_STUDIO_EVIDENCE_SPOOL_ROOT': str(inside)}))
        with pytest.raises(ValueError, match='Invalid private environment'):
            module.validate_environment_file(checkout, private)
    finally:
        private.unlink(missing_ok=True)
        import shutil
        shutil.rmtree(spool, ignore_errors=True)


def test_private_environment_allows_external_evidence_store_and_spool(checkout, tmp_path):
    module = runtime_module()
    evidence_root = tmp_path.parent / (tmp_path.name + '-evidence')
    spool_root = tmp_path.parent / (tmp_path.name + '-evidence-spool')
    evidence_root.mkdir()
    spool_root.mkdir()
    private = tmp_path.parent / (tmp_path.name + '-evidence-env.json')
    private.write_text(json.dumps({
        'CHART_STUDIO_EVIDENCE_ROOT': str(evidence_root),
        'CHART_STUDIO_EVIDENCE_DB': str(evidence_root / 'events.sqlite'),
        'CHART_STUDIO_EVIDENCE_SPOOL_ROOT': str(spool_root),
    }))
    try:
        module.validate_environment_file(checkout, private)
        private.write_text(json.dumps({
            'CHART_STUDIO_EVIDENCE_ROOT': str(checkout / 'private-evidence'),
            'CHART_STUDIO_EVIDENCE_DB': str(evidence_root / 'events.sqlite'),
        }))
        with pytest.raises(ValueError, match='Invalid private environment'):
            module.validate_environment_file(checkout, private)
        private.write_text(json.dumps({
            'CHART_STUDIO_EVIDENCE_ROOT': str(evidence_root),
            'CHART_STUDIO_EVIDENCE_DB': str(checkout / 'private-evidence.sqlite3'),
        }))
        with pytest.raises(ValueError, match='Invalid private environment'):
            module.validate_environment_file(checkout, private)
        private.write_text(json.dumps({
            'CHART_STUDIO_EVIDENCE_ROOT': os.path.relpath(evidence_root),
            'CHART_STUDIO_EVIDENCE_DB': str(evidence_root / 'events.sqlite'),
        }))
        with pytest.raises(ValueError, match='Invalid private environment'):
            module.validate_environment_file(checkout, private)
    finally:
        private.unlink(missing_ok=True)
        import shutil
        shutil.rmtree(evidence_root, ignore_errors=True)
        shutil.rmtree(spool_root, ignore_errors=True)


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
        cleanup_mock_processes(checkout)
        env_file.unlink(missing_ok=True)
