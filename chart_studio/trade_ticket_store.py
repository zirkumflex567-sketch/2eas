"""Private, durable idempotency and append-only audit for new-entry tickets."""
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


_PAYLOAD_KEYS = frozenset({'account', 'symbol', 'previewId', 'confirmationText'})
_RESULT_KEYS = frozenset({'status', 'brokerRetcode', 'orderTicket', 'code', 'verified'})
_TERMINAL = frozenset({'PLACED', 'BROKER_REJECTED', 'UNKNOWN'})
_CODES = frozenset({'INTERRUPTED', 'BROKER_REJECTED', 'BROKER_TIMEOUT',
                    'READBACK_MISMATCH', 'BROKER_DATA_UNAVAILABLE',
                    'ORDER_CHECK_REJECTED', 'ORDER_REQUEST_CHANGED',
                    'GUARD_BLOCKED', 'GUARD_UNAVAILABLE',
                    'QUOTE_NOT_FRESH', 'GEOMETRY_INVALID', 'PREVIEW_EXPIRED',
                    'PREVIEW_MISMATCH', 'DEMO_ACCOUNT_REQUIRED',
                    'INSUFFICIENT_FREE_MARGIN'})


def _json(value, limit=16384):
    result = json.dumps(value, sort_keys=True, separators=(',', ':'),
                        ensure_ascii=True, allow_nan=False).encode('ascii')
    if len(result) > limit:
        raise ValueError('Ticket commit record too large')
    return result


def _inside(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


class TradeTicketCommitStore:
    def __init__(self, path, *, checkout_root):
        raw = Path(path).expanduser()
        if not raw.is_absolute():
            raise ValueError('Private store path must be absolute')
        root = Path(checkout_root).expanduser().resolve()
        cursor = Path(raw.anchor)
        for part in raw.parts[1:]:
            cursor = cursor / part
            if cursor.is_symlink():
                raise ValueError('Private store path cannot contain symlinks')
        resolved = raw.resolve(strict=False)
        if resolved.suffix.lower() not in ('.sqlite', '.sqlite3', '.db') or _inside(resolved, root):
            raise ValueError('Private store must be a SQLite file outside checkout')
        self.path = resolved
        parent_existed = resolved.parent.exists()
        resolved.parent.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            if not parent_existed:
                os.chmod(resolved.parent, 0o700)
            if resolved.parent.stat().st_mode & 0o077:
                raise ValueError('Private store directory permissions are too broad')
        self.lock = threading.RLock()
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
        with self.lock, self._connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS reservations (
                    principal_hash TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('IN_FLIGHT','UNKNOWN','PLACED','BROKER_REJECTED')),
                    result_json TEXT,
                    created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(principal_hash,idempotency_key)
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event TEXT NOT NULL,
                    details_json TEXT NOT NULL,
                    created_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TRIGGER IF NOT EXISTS ticket_audit_no_update
                  BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
                CREATE TRIGGER IF NOT EXISTS ticket_audit_no_delete
                  BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
            ''')
        if os.name != 'nt':
            os.chmod(self.path, 0o600)

    @staticmethod
    def _keys(principal, key):
        if not isinstance(principal, str) or not principal or len(principal) > 512:
            raise ValueError('Invalid principal')
        if not isinstance(key, str) or str(UUID(key)) != key:
            raise ValueError('Canonical idempotency UUID required')
        return hashlib.sha256(principal.encode()).hexdigest(), key

    @staticmethod
    def _payload(payload):
        if not isinstance(payload, dict) or set(payload) != _PAYLOAD_KEYS or any(type(v) is not str for v in payload.values()):
            raise ValueError('Ticket payload fields are not allowed')
        if payload['account'] not in {'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500'}:
            raise ValueError('Demo account required')
        return hashlib.sha256(_json(payload)).hexdigest()

    @staticmethod
    def _audit(db, event, principal_hash, key, payload_hash, state):
        detail = {'principalHash': principal_hash,
                  'idempotencyKeyHash': hashlib.sha256(key.encode('ascii')).hexdigest(),
                  'payloadHash': payload_hash, 'state': state}
        db.execute('INSERT INTO audit_events(event,details_json) VALUES (?,?)',
                   (event, _json(detail).decode('ascii')))

    def reserve(self, principal, idempotency_key, payload):
        principal_hash, key = self._keys(principal, idempotency_key)
        payload_hash = self._payload(payload)
        with self.lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload_hash,state,result_json FROM reservations WHERE principal_hash=? AND idempotency_key=?',
                             (principal_hash, key)).fetchone()
            if row is None:
                db.execute("INSERT INTO reservations(principal_hash,idempotency_key,payload_hash,state) VALUES (?,?,?,'IN_FLIGHT')",
                           (principal_hash, key, payload_hash))
                self._audit(db, 'RESERVED', principal_hash, key, payload_hash, 'IN_FLIGHT')
                db.commit()
                return Reservation('NEW')
            if row['payload_hash'] != payload_hash:
                self._audit(db, 'KEY_CONFLICT', principal_hash, key, payload_hash, 'CONFLICT')
                db.commit()
                return Reservation('CONFLICT')
            db.commit()
            return Reservation(row['state'], json.loads(row['result_json']) if row['result_json'] else None)

    def finish(self, principal, idempotency_key, result):
        principal_hash, key = self._keys(principal, idempotency_key)
        if not isinstance(result, dict) or set(result) - _RESULT_KEYS:
            raise ValueError('Ticket result fields are not allowed')
        status = result.get('status')
        if status not in _TERMINAL:
            raise ValueError('Invalid terminal status')
        for name, value in result.items():
            if name == 'brokerRetcode' and type(value) is not int:
                raise ValueError('Invalid broker retcode')
            if name == 'orderTicket' and (not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,19}', value)):
                raise ValueError('Invalid broker order ticket')
            if name == 'code' and value not in _CODES:
                raise ValueError('Invalid result code')
            if name == 'verified' and type(value) is not bool:
                raise ValueError('Invalid verification status')
        if status == 'PLACED' and (result.get('verified') is not True or not isinstance(result.get('orderTicket'), str)):
            raise ValueError('Placed status requires verified broker order readback')
        result_json = _json(result).decode('ascii')
        with self.lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload_hash,state FROM reservations WHERE principal_hash=? AND idempotency_key=?',
                             (principal_hash, key)).fetchone()
            if row is None or row['state'] != 'IN_FLIGHT':
                db.rollback()
                raise ValueError('Reservation already terminal or missing')
            db.execute('UPDATE reservations SET state=?,result_json=?,updated_utc=CURRENT_TIMESTAMP WHERE principal_hash=? AND idempotency_key=?',
                       (status, result_json, principal_hash, key))
            self._audit(db, status, principal_hash, key, row['payload_hash'], status)
            db.commit()
        return dict(result)

    def recover_interrupted(self):
        with self.lock, self._connection() as db:
            db.execute('BEGIN IMMEDIATE')
            rows = db.execute("SELECT principal_hash,idempotency_key,payload_hash FROM reservations WHERE state='IN_FLIGHT'").fetchall()
            for row in rows:
                result = {'status': 'UNKNOWN', 'code': 'INTERRUPTED'}
                db.execute("UPDATE reservations SET state='UNKNOWN',result_json=?,updated_utc=CURRENT_TIMESTAMP WHERE principal_hash=? AND idempotency_key=?",
                           (_json(result).decode('ascii'), row['principal_hash'], row['idempotency_key']))
                self._audit(db, 'RECOVERED_UNKNOWN', row['principal_hash'], row['idempotency_key'], row['payload_hash'], 'UNKNOWN')
            db.commit()
            return len(rows)
