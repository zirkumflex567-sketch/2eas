"""Credential-free append-only journal for state-changing dashboard API calls."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import uuid


# `global` is a reserved, non-trading scope for encrypted symbol-wide chart
# drawings. It is auditable like a demo target but never maps to an MT5 account.
_ACCOUNT_ALIASES = frozenset({'global', 'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15'})
_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})
_ROUTE = re.compile(r'^/api/[A-Za-z0-9_./{}:-]{1,196}$')
_OUTCOMES = frozenset({'ok', 'rejected', 'unknown'})


class AuditScopeRejected(ValueError):
    """The attempted API mutation targets an account outside the demo allowlist."""


class MutationAuditStore:
    """Two append-only events per request; principals are stored only as hashes."""

    def __init__(self, path, *, checkout_root, allowed_accounts=None):
        raw = Path(path).expanduser()
        if not raw.is_absolute():
            raise ValueError('Audit store path must be absolute')
        root = Path(checkout_root).expanduser().resolve()
        cursor = Path(raw.anchor)
        for part in raw.parts[1:]:
            cursor /= part
            if cursor.is_symlink():
                raise ValueError('Audit store path cannot contain symlinks')
        resolved = raw.resolve(strict=False)
        if resolved.suffix.lower() not in ('.sqlite', '.sqlite3', '.db'):
            raise ValueError('Audit store must be a SQLite file')
        try:
            resolved.relative_to(root)
        except ValueError:
            pass
        else:
            raise ValueError('Audit store must be outside checkout')

        parent_existed = resolved.parent.exists()
        resolved.parent.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            if not parent_existed:
                os.chmod(resolved.parent, 0o700)
            if resolved.parent.stat().st_mode & 0o077:
                raise ValueError('Audit store directory permissions are too broad')
        self.path = resolved
        allowed = _ACCOUNT_ALIASES if allowed_accounts is None else frozenset(allowed_accounts)
        if not allowed or 'blueberry' in allowed or any(
                not isinstance(name, str) or not re.fullmatch(r'[a-z0-9_]{1,64}', name)
                for name in allowed):
            raise ValueError('Audit account allowlist must contain non-protected aliases only')
        self.allowed_accounts = allowed
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connection(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=10000')
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA trusted_schema=OFF')
        try:
            yield db
        finally:
            db.close()

    def _initialize(self):
        with self._lock, self._connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    event TEXT NOT NULL CHECK(event IN ('REQUEST_STARTED','REQUEST_FINISHED')),
                    method TEXT NOT NULL,
                    route TEXT NOT NULL,
                    account TEXT,
                    principal_hash TEXT NOT NULL,
                    role TEXT,
                    status_code INTEGER,
                    outcome TEXT,
                    created_utc TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS audit_events_request_id ON audit_events(request_id,id);
                CREATE TRIGGER IF NOT EXISTS audit_events_no_update
                  BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
                CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
                  BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
            ''')
        if os.name != 'nt':
            os.chmod(self.path, 0o600)

    def _validate_request(self, method, route, account, principal):
        if method not in _METHODS or not isinstance(route, str) or not _ROUTE.fullmatch(route):
            raise ValueError('Invalid audited request')
        if account is not None and (not isinstance(account, str) or account not in self.allowed_accounts):
            raise AuditScopeRejected('Configured non-protected demo alias required')
        role = None
        principal_hash = hashlib.sha256(b'anonymous').hexdigest()
        if principal is not None:
            if (not isinstance(principal, tuple) or len(principal) != 3 or
                    any(not isinstance(part, str) or not part.strip() for part in principal)):
                raise ValueError('Invalid principal')
            role = principal[2]
            if role not in {'read', 'layout', 'trade'}:
                raise ValueError('Invalid principal role')
            principal_hash = hashlib.sha256(
                json.dumps(principal, ensure_ascii=True, separators=(',', ':')).encode('ascii')
            ).hexdigest()
        return role, principal_hash

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    def begin_request(self, *, method, route, account=None, principal=None):
        role, principal_hash = self._validate_request(method, route, account, principal)
        request_id = uuid.uuid4().hex
        with self._lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('''INSERT INTO audit_events
                (request_id,event,method,route,account,principal_hash,role,created_utc)
                VALUES(?,?,?,?,?,?,?,?)''',
                (request_id, 'REQUEST_STARTED', method, route, account, principal_hash, role, self._now()))
            db.commit()
        return request_id

    def finish_request(self, request_id, *, status_code, outcome):
        if (not isinstance(request_id, str) or not re.fullmatch(r'[0-9a-f]{32}', request_id) or
                isinstance(status_code, bool) or not isinstance(status_code, int) or not 100 <= status_code <= 599 or
                outcome not in _OUTCOMES):
            raise ValueError('Invalid audit result')
        with self._lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            started = db.execute("SELECT 1 FROM audit_events WHERE request_id=? AND event='REQUEST_STARTED'",
                                 (request_id,)).fetchone()
            finished = db.execute("SELECT 1 FROM audit_events WHERE request_id=? AND event='REQUEST_FINISHED'",
                                  (request_id,)).fetchone()
            if started is None or finished is not None:
                db.rollback()
                raise ValueError('Unknown or already finished audit request')
            source = db.execute("SELECT method,route,account,principal_hash,role FROM audit_events WHERE request_id=? AND event='REQUEST_STARTED'",
                                (request_id,)).fetchone()
            db.execute('''INSERT INTO audit_events
                (request_id,event,method,route,account,principal_hash,role,status_code,outcome,created_utc)
                VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (request_id, 'REQUEST_FINISHED', source['method'], source['route'], source['account'],
                 source['principal_hash'], source['role'], status_code, outcome, self._now()))
            db.commit()

    def recent(self, *, limit=100):
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError('Audit limit must be from 1 to 500')
        with self._lock, self._connection() as db:
            rows = db.execute('''SELECT request_id,event,method,route,account,principal_hash,role,
                                       status_code,outcome,created_utc
                                FROM audit_events ORDER BY id DESC LIMIT ?''', (limit,)).fetchall()
        keys = {'request_id': 'requestId', 'principal_hash': 'principalHash',
                'status_code': 'statusCode', 'created_utc': 'createdUtc'}
        return [{keys.get(key, key): row[key] for key in row.keys()} for row in reversed(rows)]
