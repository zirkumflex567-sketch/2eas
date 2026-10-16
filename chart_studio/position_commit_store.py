"""Private, durable idempotency and append-only audit for position commits.

The store is intentionally independent of MT5. A reservation is persisted
before any broker operation; explicit process-start recovery converts unfinished
work to UNKNOWN so an ambiguous request is never sent again automatically.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID


@dataclass(frozen=True)
class Reservation:
    state: str
    result: dict | None = None


_PAYLOAD_KEYS = frozenset({'account', 'symbol', 'ticket', 'revision', 'previewId'})
_PAYLOAD_SCOPE = frozenset({'account', 'symbol', 'ticket', 'revision'})
_RESULT_KEYS = frozenset({'status', 'positionRevision', 'slPrice', 'tpPrice',
                          'brokerRetcode', 'code', 'verified'})
_TERMINAL = frozenset({'SAVED', 'BROKER_REJECTED', 'UNKNOWN'})
_RESULT_CODES = frozenset({'INTERRUPTED', 'BROKER_REJECTED', 'BROKER_TIMEOUT', 'READBACK_MISMATCH', 'UNKNOWN', 'POSITION_CHANGED', 'SYMBOL_CHANGED',
                         'QUOTE_NOT_FRESH', 'GEOMETRY_INVALID', 'GUARD_BLOCKED',
                         'GUARD_UNAVAILABLE', 'BROKER_DATA_UNAVAILABLE', 'ORDER_CHECK_REJECTED',
                         'NO_CHANGE', 'PREVIEW_EXPIRED', 'PREVIEW_MISMATCH', 'DEMO_ACCOUNT_REQUIRED'})


def _canonical_json(value, *, limit=16384):
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':'),
                         ensure_ascii=True, allow_nan=False).encode('ascii')
    if len(encoded) > limit:
        raise ValueError('Commit record too large')
    return encoded


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


class PositionCommitStore:
    def __init__(self, path, *, checkout_root):
        raw = Path(path).expanduser()
        if not raw.is_absolute():
            raise ValueError('Private store path must be absolute')
        root = Path(checkout_root).expanduser().resolve()
        # Reject symlink components before resolving the private DB location.
        cursor = Path(raw.anchor)
        for part in raw.parts[1:]:
            cursor = cursor / part
            if cursor.is_symlink():
                raise ValueError('Private store path cannot contain symlinks')
        resolved = raw.resolve(strict=False)
        if resolved.suffix.lower() not in ('.sqlite', '.sqlite3', '.db'):
            raise ValueError('Private store must be a SQLite file')
        if _inside(resolved, root):
            raise ValueError('Private store must be outside the checkout')
        self.path = resolved
        parent_existed = self.path.parent.exists()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            if not parent_existed:
                os.chmod(self.path.parent, 0o700)
            parent_mode = self.path.parent.stat().st_mode & 0o777
            if parent_mode & 0o077:
                raise ValueError('Private store directory permissions are too broad')
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connection(self):
        db = self._connect()
        try:
            yield db
        finally:
            db.close()

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=10000')
        db.execute('PRAGMA synchronous=FULL')
        db.execute('PRAGMA trusted_schema=OFF')
        return db

    def _initialize(self):
        with self._lock, self._connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS reservations (
                    principal_hash TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('IN_FLIGHT','UNKNOWN','SAVED','BROKER_REJECTED')),
                    result_json TEXT,
                    created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(principal_hash, idempotency_key)
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event TEXT NOT NULL,
                    details_json TEXT NOT NULL,
                    created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TRIGGER IF NOT EXISTS audit_no_update
                BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;
                CREATE TRIGGER IF NOT EXISTS audit_no_delete
                BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END;
            ''')
        if os.name != 'nt':
            os.chmod(self.path, 0o600)

    def recover_interrupted(self):
        """Call once before accepting traffic in a single-process deployment."""
        recovered = 0
        with self._lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            pending = db.execute("SELECT principal_hash,idempotency_key,payload_hash FROM reservations WHERE state='IN_FLIGHT'").fetchall()
            for row in pending:
                db.execute("UPDATE reservations SET state='UNKNOWN',result_json=?,updated_utc=CURRENT_TIMESTAMP WHERE principal_hash=? AND idempotency_key=?",
                           (json.dumps({'status':'UNKNOWN','code':'INTERRUPTED'}, separators=(',', ':')),
                            row['principal_hash'], row['idempotency_key']))
                self._audit(db, 'RECOVERED_UNKNOWN', row['principal_hash'], row['idempotency_key'], row['payload_hash'], 'UNKNOWN')
                recovered += 1
            db.commit()
        return recovered

    @staticmethod
    def _key(principal, key):
        if not isinstance(principal, str) or not principal or len(principal) > 512:
            raise ValueError('Invalid principal')
        if not isinstance(key, str) or str(UUID(key)) != key:
            raise ValueError('Canonical idempotency UUID required')
        principal_hash = hashlib.sha256(principal.encode('utf-8')).hexdigest()
        return principal_hash, key

    @staticmethod
    def _payload(payload):
        if (not isinstance(payload, dict) or not _PAYLOAD_KEYS <= set(payload) or
                set(payload) != _PAYLOAD_KEYS):
            raise ValueError('Commit payload fields are not allowed')
        if any(not isinstance(value, str) for value in payload.values()):
            raise ValueError('Commit payload values must be strings')
        return hashlib.sha256(_canonical_json(payload)).hexdigest()

    @staticmethod
    def _audit(db, event, principal_hash, key, payload_hash, state):
        details = {'principalHash': principal_hash, 'idempotencyKeyHash': hashlib.sha256(key.encode('ascii')).hexdigest(),
                   'payloadHash': payload_hash, 'state': state}
        db.execute('INSERT INTO audit_events(event,details_json) VALUES(?,?)',
                   (event, _canonical_json(details).decode('ascii')))

    def reserve(self, principal, idempotency_key, payload) -> Reservation:
        principal_hash, key = self._key(principal, idempotency_key)
        payload_hash = self._payload(payload)
        with self._lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload_hash,state,result_json FROM reservations WHERE principal_hash=? AND idempotency_key=?',
                             (principal_hash, key)).fetchone()
            if row is None:
                db.execute("INSERT INTO reservations(principal_hash,idempotency_key,payload_hash,state) VALUES(?,?,?,'IN_FLIGHT')",
                           (principal_hash, key, payload_hash))
                self._audit(db, 'RESERVED', principal_hash, key, payload_hash, 'IN_FLIGHT')
                db.commit()
                return Reservation('NEW')
            if row['payload_hash'] != payload_hash:
                self._audit(db, 'KEY_CONFLICT', principal_hash, key, payload_hash, 'CONFLICT')
                db.commit()
                return Reservation('CONFLICT')
            db.commit()
            result = json.loads(row['result_json']) if row['result_json'] else None
            return Reservation(row['state'], result)

    @staticmethod
    def _validate_result(result):
        if not isinstance(result, dict) or set(result) - _RESULT_KEYS:
            raise ValueError('Result contains unsupported fields')
        status = result.get('status')
        if not isinstance(status, str) or status not in _TERMINAL:
            raise ValueError('Invalid terminal status')
        for name, value in result.items():
            if name == 'status':
                if type(value) is not str:
                    raise ValueError('Invalid terminal status')
            elif name == 'positionRevision':
                if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
                    raise ValueError('Invalid broker revision')
            elif name in {'slPrice', 'tpPrice'}:
                if value is not None and (not isinstance(value, str) or
                                          not re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?', value)):
                    raise ValueError('Invalid readback price')
            elif name == 'code':
                if not isinstance(value, str) or value not in _RESULT_CODES:
                    raise ValueError('Invalid result code')
            elif name == 'brokerRetcode':
                if type(value) is not int:
                    raise ValueError('Invalid broker retcode')
            elif name == 'verified' and type(value) is not bool:
                raise ValueError('Invalid readback verification')
        if status == 'SAVED' and (result.get('verified') is not True or
                                  not isinstance(result.get('positionRevision'), str)):
            raise ValueError('Saved status requires verified broker readback')
        return _canonical_json(result).decode('ascii')

    def finish(self, principal, idempotency_key, result):
        principal_hash, key = self._key(principal, idempotency_key)
        result_json = self._validate_result(result)
        with self._lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload_hash,state,result_json FROM reservations WHERE principal_hash=? AND idempotency_key=?',
                             (principal_hash, key)).fetchone()
            if row is None:
                db.rollback()
                raise KeyError('Reservation not found')
            if row['state'] != 'IN_FLIGHT':
                db.rollback()
                raise ValueError('Reservation already terminal; broker send cannot repeat')
            db.execute('UPDATE reservations SET state=?,result_json=?,updated_utc=CURRENT_TIMESTAMP WHERE principal_hash=? AND idempotency_key=?',
                       (result['status'], result_json, principal_hash, key))
            self._audit(db, result['status'], principal_hash, key, row['payload_hash'], result['status'])
            db.commit()
        return dict(result)
