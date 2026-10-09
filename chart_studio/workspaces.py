"""Versioned, account-scoped local SQLite Chart Studio layout storage.

No trading/MT5 dependency. Repository code never exposes this store without a
separate, explicit authorization gate. Avoid putting DB under /static.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
import math
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

ACCOUNTS = frozenset({"titan", "goldm15"})
SYMBOL_RE = re.compile(r"^[A-Z0-9._-]{1,32}$")
DRAWING_TYPES = frozenset({"horizontal", "trend", "rect", "fib", "ray", "ruler", "channel"})
UI_FLAGS = frozenset({"ema20", "ema50", "ema200", "sma20", "sma50",
                      "bb", "positions"})
INDICATORS = frozenset({"rsi", "atr", "macd", "volume", "adx", "vwap"})
PERIOD_FIELDS = frozenset({"period", "fast", "slow", "signal"})
TIMEFRAMES = frozenset({"M1", "M5", "M15", "M30", "H1", "H4", "D1"})
MAX_DOCUMENT_BYTES = 131072
MAX_DRAWINGS = 500


class StoreError(ValueError):
    code = "INVALID_WORKSPACE"


class RevisionConflict(StoreError):
    code = "REVISION_CONFLICT"


class WorkspaceMissing(StoreError):
    code = "WORKSPACE_NOT_FOUND"


def _ident(owner: str, account: str, symbol: str, name: str) -> tuple:
    if not isinstance(owner, str) or not (1 <= len(owner) <= 64) or any(
        ord(c) < 32 for c in owner
    ):
        raise StoreError("Ungültiger Workspace-Besitzer.")
    if not isinstance(account, str) or account not in ACCOUNTS:
        raise StoreError("Unbekanntes Konto.")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol):
        raise StoreError("Ungültiges Symbol.")
    if not isinstance(name, str) or name != name.strip() or not (
        1 <= len(name) <= 64
    ) or any(ord(c) < 32 or c in "/\\" for c in name):
        raise StoreError("Ungültiger Layout-Name.")
    return owner, account, symbol, name


def _number(value: Any, label: str, *, integer: bool = False) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StoreError(f"{label}: Zahlenwert erforderlich.")
    if not math.isfinite(value):
        raise StoreError(f"{label}: Zahl darf nicht NaN/Inf sein.")
    if integer and not isinstance(value, int):
        raise StoreError(f"{label}: Ganzzahl erforderlich.")
    return value


def validate_document(raw: Any) -> dict:
    """Strict version-1 JSON input; never store executable markup or arbitrary keys."""
    if not isinstance(raw, dict) or set(raw) != {
        "schemaVersion", "drawings", "options", "indicators", "timeframe"
    } or raw["schemaVersion"] != 1:
        raise StoreError("Nicht unterstütztes Workspace-Schema.")
    drawings = raw["drawings"]
    if not isinstance(drawings, list) or len(drawings) > MAX_DRAWINGS:
        raise StoreError("Zu viele oder ungültige Zeichnungen.")
    out = []
    for drawing in drawings:
        if not isinstance(drawing, dict) or set(drawing) != {"kind", "anchors"}:
            raise StoreError("Unbekannte Zeichenobjekt-Eigenschaften.")
        kind = drawing["kind"]
        if not isinstance(kind, str) or kind not in DRAWING_TYPES:
            raise StoreError("Nicht unterstützter Zeichnungstyp.")
        anchors = drawing["anchors"]
        expected = 1 if kind == "horizontal" else (3 if kind == "channel" else 2)
        if not isinstance(anchors, list) or len(anchors) != expected:
            raise StoreError("Ungültige Ankeranzahl.")
        safe_anchors = []
        for anchor in anchors:
            if not isinstance(anchor, dict) or set(anchor) != {"time", "price"}:
                raise StoreError("Unbekannte Ankereigenschaft.")
            stamp = _number(anchor["time"], "time", integer=True)
            price = _number(anchor["price"], "price")
            if stamp <= 0 or stamp > 7258118400 or price <= 0 or price > 1e15:
                raise StoreError("Ungültiger Zeitpunkt oder Preis.")
            safe_anchors.append({"time": stamp, "price": price})
        out.append({"kind": kind, "anchors": safe_anchors})
    options = raw["options"]
    if not isinstance(options, dict) or any(k not in UI_FLAGS for k in options):
        raise StoreError("Nicht unterstützte Chart-Option.")
    if any(type(v) is not bool for v in options.values()):
        raise StoreError("Chart-Optionen müssen boolesch sein.")
    indicators = raw["indicators"]
    if not isinstance(indicators, dict) or any(k not in INDICATORS for k in indicators):
        raise StoreError("Unbekannter Indikator.")
    clean_indicators = {}
    for kind, values in indicators.items():
        if not isinstance(values, dict) or any(
            k not in PERIOD_FIELDS | {"enabled"} for k in values
        ):
            raise StoreError("Ungültige Indikator-Parameter.")
        cleaned = {}
        for param, value in values.items():
            if param == "enabled":
                if type(value) is not bool:
                    raise StoreError("Indikator-Sichtbarkeit muss boolesch sein.")
            else:
                _number(value, param, integer=True)
                if not 2 <= value <= 300:
                    raise StoreError("Indikator-Periode außerhalb der Grenzen.")
            cleaned[param] = value
        clean_indicators[kind] = cleaned
    tf = raw["timeframe"]
    if not isinstance(tf, str) or tf not in TIMEFRAMES:
        raise StoreError("Unbekannter Timeframe.")
    safe = {"schemaVersion": 1, "drawings": out, "options": options,
            "indicators": clean_indicators, "timeframe": tf}
    encoded = json.dumps(safe, ensure_ascii=False, allow_nan=False,
                         separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise StoreError("Workspace ist zu groß.")
    return safe


class WorkspaceStore:
    """One SQLite connection per operation; atomic optimistic revision check."""

    def __init__(self, path: str | Path):
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("""CREATE TABLE IF NOT EXISTS chart_schema_migration (
                version INTEGER PRIMARY KEY,
                installed_utc INTEGER NOT NULL
            )""")
            conn.execute("""CREATE TABLE IF NOT EXISTS chart_workspace (
                owner TEXT NOT NULL,
                account TEXT NOT NULL,
                symbol TEXT NOT NULL,
                name TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision >= 1),
                document TEXT NOT NULL,
                created_utc INTEGER NOT NULL,
                updated_utc INTEGER NOT NULL,
                PRIMARY KEY(owner,account,symbol,name)
            )""")
            conn.execute(
                "INSERT OR IGNORE INTO chart_schema_migration(version,installed_utc) "
                "VALUES (1,?)", (int(time.time()),)
            )

    @contextmanager
    def _conn(self):
        # sqlite3.Connection.__exit__ does NOT close the connection; always close.
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

    def list(self, owner: str, account: str, symbol: str) -> list[dict]:
        _ident(owner, account, symbol, "Default")
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT name, revision, updated_utc FROM chart_workspace
                WHERE owner=? AND account=? AND symbol=? ORDER BY name COLLATE NOCASE""",
                (owner, account, symbol)
            ).fetchall()
        return [{"name": r[0], "revision": r[1], "updatedUtc": r[2]} for r in rows]

    def get(self, owner: str, account: str, symbol: str, name: str) -> dict:
        key = _ident(owner, account, symbol, name)
        with self._conn() as conn:
            row = conn.execute(
                """SELECT revision, document, updated_utc FROM chart_workspace
                WHERE owner=? AND account=? AND symbol=? AND name=?""", key
            ).fetchone()
        if row is None:
            raise WorkspaceMissing("Workspace nicht gefunden.")
        return {"name": name, "revision": row[0], "document": json.loads(row[1]),
                "updatedUtc": row[2]}

    def put(self, owner: str, account: str, symbol: str, name: str,
            document: dict, expected_revision: int) -> dict:
        key = _ident(owner, account, symbol, name)
        if type(expected_revision) is not int or expected_revision < 0:
            raise StoreError("expectedRevision muss eine nichtnegative Ganzzahl sein.")
        safe = validate_document(document)
        serialized = json.dumps(safe, ensure_ascii=False, allow_nan=False,
                                separators=(",", ":"))
        now = int(time.time())
        with self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT revision FROM chart_workspace
                WHERE owner=? AND account=? AND symbol=? AND name=?""", key
            ).fetchone()
            current = row[0] if row else 0
            if current != expected_revision:
                raise RevisionConflict("Workspace wurde anderswo verändert: zuerst neu laden.")
            next_revision = current + 1
            if row:
                conn.execute(
                    """UPDATE chart_workspace SET revision=?,document=?,updated_utc=?
                    WHERE owner=? AND account=? AND symbol=? AND name=?""",
                    (next_revision, serialized, now, *key)
                )
            else:
                conn.execute(
                    """INSERT INTO chart_workspace
                    (owner,account,symbol,name,revision,document,created_utc,updated_utc)
                    VALUES (?,?,?,?,?,?,?,?)""",
                    (*key, next_revision, serialized, now, now)
                )
        return {"name": name, "revision": next_revision,
                "document": safe, "updatedUtc": now}

    def delete(self, owner: str, account: str, symbol: str, name: str,
               expected_revision: int) -> dict:
        key = _ident(owner, account, symbol, name)
        if type(expected_revision) is not int or expected_revision < 1:
            raise StoreError("Löschung erfordert gültige Revision.")
        with self._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT revision FROM chart_workspace
                WHERE owner=? AND account=? AND symbol=? AND name=?""", key
            ).fetchone()
            if row is None:
                raise WorkspaceMissing("Workspace nicht gefunden.")
            if row[0] != expected_revision:
                raise RevisionConflict("Workspace wurde anderswo verändert: zuerst neu laden.")
            conn.execute(
                """DELETE FROM chart_workspace
                WHERE owner=? AND account=? AND symbol=? AND name=?""", key
            )
        return {"deleted": True, "name": name}
