"""Opaque, account-scoped encrypted Chart Studio device-sync revisions."""
from __future__ import annotations

import base64
import re
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from .workspaces import SYMBOL_RE

BUNDLE_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ACCOUNT_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
MAX_CIPHERTEXT_BYTES = 700_000
MAX_REVISIONS = 10


class DeviceSyncError(ValueError):
    code = "INVALID_SYNC_BUNDLE"


class DeviceSyncMissing(DeviceSyncError):
    code = "SYNC_BUNDLE_NOT_FOUND"


class DeviceSyncConflict(DeviceSyncError):
    code = "REVISION_CONFLICT"

    def __init__(self, current_revision: int):
        super().__init__("Sync-Stand wurde auf einem anderen Gerät geändert.")
        self.current_revision = current_revision


def _b64url_bytes(value: object, label: str, *, min_bytes: int, max_bytes: int) -> bytes:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise DeviceSyncError(f"Ungültige {label}-Kodierung.")
    try:
        decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, base64.binascii.Error):
        raise DeviceSyncError(f"Ungültige {label}-Kodierung.") from None
    if not min_bytes <= len(decoded) <= max_bytes:
        raise DeviceSyncError(f"Ungültige {label}-Länge.")
    if base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value:
        raise DeviceSyncError(f"Nicht-kanonische {label}-Kodierung.")
    return decoded


def validate_envelope(bundle_id: str, account: str, symbol: str,
                      format_version: int, nonce: str, ciphertext: str) -> dict:
    if not isinstance(bundle_id, str) or not BUNDLE_RE.fullmatch(bundle_id):
        raise DeviceSyncError("Ungültige Bundle-ID.")
    if not isinstance(account, str) or not ACCOUNT_RE.fullmatch(account):
        raise DeviceSyncError("Ungültiger Konto-Scope.")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol):
        raise DeviceSyncError("Ungültiger Symbol-Scope.")
    if type(format_version) is not int or not 1 <= format_version <= 32:
        raise DeviceSyncError("Ungültige Formatversion.")
    _b64url_bytes(nonce, "Nonce", min_bytes=12, max_bytes=12)
    _b64url_bytes(ciphertext, "Ciphertext", min_bytes=16,
                  max_bytes=MAX_CIPHERTEXT_BYTES)
    return {"bundleId": bundle_id, "account": account, "symbol": symbol,
            "formatVersion": format_version, "nonce": nonce,
            "ciphertext": ciphertext}


class DeviceSyncStore:
    """Stores ciphertext only and keeps a bounded immutable revision history."""

    def __init__(self, path: str | Path):
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("""CREATE TABLE IF NOT EXISTS chart_device_sync_revision (
                owner TEXT NOT NULL,
                bundle_id TEXT NOT NULL,
                account TEXT NOT NULL,
                symbol TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision >= 1),
                format_version INTEGER NOT NULL,
                nonce TEXT NOT NULL,
                ciphertext TEXT NOT NULL,
                created_utc INTEGER NOT NULL,
                PRIMARY KEY(owner,bundle_id,account,symbol,revision)
            )""")
            conn.execute("""CREATE INDEX IF NOT EXISTS chart_device_sync_head
                ON chart_device_sync_revision(owner,bundle_id,account,symbol,revision DESC)""")

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(str(self.path), timeout=10)
        try:
            conn.execute("PRAGMA busy_timeout=10000")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def _owner(owner: str) -> str:
        if not isinstance(owner, str) or not 1 <= len(owner) <= 128 or any(ord(c) < 32 for c in owner):
            raise DeviceSyncError("Ungültige Nutzeridentität.")
        return owner

    def current(self, owner: str, bundle_id: str, account: str, symbol: str) -> dict:
        owner = self._owner(owner)
        # The empty envelope values are never used; this applies the same scope checks.
        if not BUNDLE_RE.fullmatch(bundle_id or "") or not ACCOUNT_RE.fullmatch(account or "") or not SYMBOL_RE.fullmatch(symbol or ""):
            raise DeviceSyncError("Ungültiger Bundle- oder Scopewert.")
        with self._conn() as conn:
            row = conn.execute("""SELECT revision,format_version,nonce,ciphertext,created_utc
                FROM chart_device_sync_revision WHERE owner=? AND bundle_id=? AND account=? AND symbol=?
                ORDER BY revision DESC LIMIT 1""", (owner,bundle_id,account,symbol)).fetchone()
        if row is None:
            raise DeviceSyncMissing("Verschlüsseltes Sync-Bundle nicht gefunden.")
        return {"bundleId": bundle_id, "account": account, "symbol": symbol,
                "revision": row[0], "formatVersion": row[1], "nonce": row[2],
                "ciphertext": row[3], "createdUtc": row[4]}

    def history(self, owner: str, bundle_id: str, account: str, symbol: str) -> list[dict]:
        owner = self._owner(owner)
        if not BUNDLE_RE.fullmatch(bundle_id or "") or not ACCOUNT_RE.fullmatch(account or "") or not SYMBOL_RE.fullmatch(symbol or ""):
            raise DeviceSyncError("Ungültiger Bundle- oder Scopewert.")
        with self._conn() as conn:
            rows = conn.execute("""SELECT revision,format_version,nonce,ciphertext,created_utc
                FROM chart_device_sync_revision WHERE owner=? AND bundle_id=? AND account=? AND symbol=?
                ORDER BY revision DESC LIMIT ?""", (owner,bundle_id,account,symbol,MAX_REVISIONS)).fetchall()
        if not rows:
            raise DeviceSyncMissing("Verschlüsseltes Sync-Bundle nicht gefunden.")
        return [{"revision": r[0], "formatVersion": r[1], "nonce": r[2],
                 "ciphertext": r[3], "createdUtc": r[4]} for r in rows]

    def put(self, owner: str, bundle_id: str, account: str, symbol: str,
            format_version: int, nonce: str, ciphertext: str,
            expected_revision: int) -> dict:
        owner = self._owner(owner)
        envelope = validate_envelope(bundle_id, account, symbol, format_version,
                                     nonce, ciphertext)
        if type(expected_revision) is not int or expected_revision < 0:
            raise DeviceSyncError("expectedRevision muss eine nichtnegative Ganzzahl sein.")
        now = int(time.time())
        with self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("""SELECT revision FROM chart_device_sync_revision
                WHERE owner=? AND bundle_id=? AND account=? AND symbol=?
                ORDER BY revision DESC LIMIT 1""", (owner,bundle_id,account,symbol)).fetchone()
            current = row[0] if row else 0
            if current != expected_revision:
                raise DeviceSyncConflict(current)
            revision = current + 1
            conn.execute("""INSERT INTO chart_device_sync_revision
                (owner,bundle_id,account,symbol,revision,format_version,nonce,ciphertext,created_utc)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (owner,bundle_id,account,symbol,revision,format_version,nonce,ciphertext,now))
            conn.execute("""DELETE FROM chart_device_sync_revision
                WHERE owner=? AND bundle_id=? AND account=? AND symbol=? AND revision NOT IN
                (SELECT revision FROM chart_device_sync_revision WHERE owner=? AND bundle_id=?
                 AND account=? AND symbol=? ORDER BY revision DESC LIMIT ?)""",
                (owner,bundle_id,account,symbol,owner,bundle_id,account,symbol,MAX_REVISIONS))
        return {**envelope, "revision": revision, "createdUtc": now}
