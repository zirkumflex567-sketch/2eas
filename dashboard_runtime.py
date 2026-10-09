"""Public runtime provenance; stdlib only, with no application/broker imports.

The startup snapshot describes bytes on disk when this process is initialized.
It is immutable; current disk inspection never overwrites the running identity.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import re

_EXTENSIONS = {'.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html'}
_EXCLUDED = {'tests', 'docs', 'private', 'secrets', 'output', 'node_modules',
             'dist', 'build', 'state', 'dashboard-backups', '__pycache__', 'venv', 'env'}
_MANIFESTS = {'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
              'tsconfig.json', 'pyproject.toml', 'poetry.lock', 'uv.lock',
              'requirements-dashboard.txt', 'constraints-dashboard.txt'}
# Without Git, inspect only known dashboard files/directories, never arbitrary
# user files. This fallback is explicit and is not eligible for guarded restart.
_FALLBACK_ROOT = {'app.py', 'dashboard_runtime.py', 'dashboard_security.py',
                  'account_gateway.py', 'broker_clock.py', 'dd_persistence.py',
                  'journal_accounting.py', 'metrics_cache.py', 'goldm15_dashboard.py'}
_FALLBACK_DIRS = {'static', 'chart_studio', 'chart_studio_v5'}
_ENV_KEYS = {'DASHBOARD_ALLOWED_HOSTS', 'DASHBOARD_PROXY_SECRET', 'DASHBOARD_PROXY_USERS',
             'DASHBOARD_PROXY_PREFIX', 'DASHBOARD_CONTROL_TOKEN', 'DASHBOARD_QUOTE_MAX_AGE_SECONDS',
             'CHART_STUDIO_STORAGE_TOKEN', 'CHART_STUDIO_STORAGE_ENABLED', 'CHART_STUDIO_DB'}


def validate_environment_file(root, private_path):
    """Validate launch configuration without returning/logging any private values."""
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate key')
            result[key] = value
        return result

    try:
        private_path = Path(private_path).resolve()
        if private_path.is_relative_to(Path(root).resolve()):
            raise ValueError('private file in checkout')
        values = json.loads(private_path.read_text(encoding='utf-8-sig'), object_pairs_hook=unique)
        if not isinstance(values, dict) or any(k not in _ENV_KEYS or not isinstance(v, str)
                                              or '\0' in v for k, v in values.items()):
            raise ValueError('invalid environment')
        if 'DASHBOARD_PROXY_SECRET' in values and len(values['DASHBOARD_PROXY_SECRET']) < 32:
            raise ValueError('short secret')
        users = json.loads(values.get('DASHBOARD_PROXY_USERS', '{}'), object_pairs_hook=unique)
        if not isinstance(users, dict) or any(not k or not all(32 < ord(c) < 127 and c != ',' for c in k)
                                              or v not in ('read', 'layout', 'trade')
                                              for k, v in users.items()):
            raise ValueError('invalid proxy users')
        if users and len(values.get('DASHBOARD_PROXY_SECRET', '')) < 32:
            raise ValueError('missing secret')
        prefix = values.get('DASHBOARD_PROXY_PREFIX', '/stt')
        if not re.fullmatch(r'/[A-Za-z0-9][A-Za-z0-9/_-]*', prefix) or prefix.endswith('/') or '//' in prefix:
            raise ValueError('invalid prefix')
        age = float(values.get('DASHBOARD_QUOTE_MAX_AGE_SECONDS', '15'))
        if not math.isfinite(age) or age <= 0:
            raise ValueError('invalid quote age')
        enabled = values.get('CHART_STUDIO_STORAGE_ENABLED', '0')
        if enabled not in ('0', '1') or (enabled == '1' and len(values.get('CHART_STUDIO_STORAGE_TOKEN', '')) < 32):
            raise ValueError('invalid chart storage gate')
    except (OSError, ValueError, TypeError):
        raise ValueError('Invalid private environment') from None


def _is_source(name):
    path = Path(name)
    if any(part.lower() in _EXCLUDED or part.startswith('.') for part in path.parts):
        return False
    if path.name.lower().startswith('test_'):
        return False
    return path.suffix.lower() in _EXTENSIONS or path.name in _MANIFESTS


def _git(root, *args):
    """Never surface Git stderr (it can contain private local paths)."""
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True,
                            timeout=2, check=True)
    return result.stdout


def preflight_checkout(root):
    """Compile the tracked application Python inventory; never import/execute it."""
    try:
        root = Path(root).resolve()
        names = {os.fsdecode(p) for p in _git(root, 'ls-files', '-z').split(b'\0') if p}
        for name in sorted(names):
            if _is_source(name) and Path(name).suffix.lower() == '.py':
                path = root / name
                if path.is_symlink() or not path.resolve().is_relative_to(root):
                    raise ValueError('unsafe source')
                compile(path.read_bytes(), '<application-source>', 'exec')
    except (OSError, ValueError, SyntaxError, subprocess.SubprocessError):
        raise ValueError('Invalid application source') from None


def inspect_checkout(root):
    root = Path(root).resolve()
    checkout_id = hashlib.sha256(os.path.normcase(str(root)).encode('utf-8')).hexdigest()
    revision = 'unknown'
    dirty = None
    try:
        top = Path(os.fsdecode(_git(root, 'rev-parse', '--show-toplevel')).strip()).resolve()
        if top != root:
            raise ValueError('not a checkout root')
        revision = _git(root, 'rev-parse', '--verify', 'HEAD').decode('ascii').strip()
        entries = [p for p in _git(root, 'ls-files', '-v', '-z').split(b'\0') if p]
        names = {os.fsdecode(p[2:]) for p in entries}
        changed = {os.fsdecode(p) for p in _git(root, 'diff', '--name-only', '-z',
                                               '--no-renames', 'HEAD', '--').split(b'\0') if p}
        # Git diff can conceal edits behind assume-unchanged/skip-worktree.
        # Refuse these flags on source, including when bytes currently match.
        concealed = any(_is_source(os.fsdecode(p[2:])) and
                        (p[:1].islower() or p[:1] == b'S') for p in entries)
        dirty = concealed or any(_is_source(p) for p in changed)
    except (OSError, subprocess.SubprocessError, ValueError, UnicodeError):
        revision = 'unknown'
        dirty = None
        names = {p for p in _FALLBACK_ROOT if (root / p).is_file()}
        for folder in _FALLBACK_DIRS:
            directory = root / folder
            if directory.is_dir():
                names.update(p.relative_to(root).as_posix() for p in directory.rglob('*')
                             if p.is_file() and _is_source(p.relative_to(root).as_posix()))
    digest = hashlib.sha256()
    source_available = 'app.py' in names and (root / 'app.py').is_file()
    count = 0
    for name in sorted(p for p in names if _is_source(p)):
        count += 1
        digest.update(name.encode('utf-8', errors='surrogateescape') + b'\0')
        path = root / name
        try:
            # Reject symlinks, including a parent directory escaping this root.
            if path.is_symlink() or not path.resolve().is_relative_to(root):
                raise OSError('unsafe source')
            file_hash = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(65536), b''):
                    file_hash.update(block)
            digest.update(b'file\0' + file_hash.digest())
        except OSError:
            source_available = False
            digest.update(b'missing-or-unreadable\0')
    return {'revision': revision, 'digest': digest.hexdigest(), 'checkoutId': checkout_id,
            'applicationCodeDirty': dirty, 'sourceAvailable': source_available and count > 0}


class RuntimeIdentity:
    def __init__(self, root):
        self._root = Path(root).resolve()
        self._startup = inspect_checkout(self._root)
        self._pid = os.getpid()
        self._started = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    def payload(self):
        current = inspect_checkout(self._root)
        return {'pid': self._pid, 'startedUtc': self._started,
                'checkoutId': self._startup['checkoutId'],
                'startupRevision': self._startup['revision'],
                'startupDigest': self._startup['digest'],
                'diskRevision': current['revision'], 'diskDigest': current['digest'],
                'applicationCodeDirty': current['applicationCodeDirty'],
                'sourceAvailable': current['sourceAvailable'],
                'restart_required': not current['sourceAvailable'] or
                current['revision'] != self._startup['revision'] or
                current['digest'] != self._startup['digest']}


def install_runtime(app, root):
    identity = RuntimeIdentity(root)

    @app.get('/api/runtime')
    def runtime_status():
        return identity.payload()

    return identity


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Inspect dashboard code without loading the app')
    parser.add_argument('--inspect-checkout', required=True)
    parser.add_argument('--validate-env', help='Validate private launch JSON without disclosing it')
    parser.add_argument('--preflight', action='store_true', help='Compile tracked application Python without importing it')
    args = parser.parse_args()
    try:
        if args.validate_env:
            validate_environment_file(args.inspect_checkout, args.validate_env)
        if args.preflight:
            preflight_checkout(args.inspect_checkout)
        print(json.dumps(inspect_checkout(args.inspect_checkout), sort_keys=True))
    except Exception:
        # No filenames, environment values, Git stderr or arbitrary exception text.
        print('{"error":"checkout inspection failed"}')
        raise SystemExit(1)
