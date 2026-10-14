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
DRAWING_TYPES = frozenset({"horizontal", "vertical", "text", "trend", "rect", "fib", "ray", "ruler", "channel"})
UI_FLAGS = frozenset({"ema20", "ema50", "ema200", "sma20", "sma50",
                      "bb", "positions"})
UI_NUMBERS = frozenset({"bbPeriod", "bbStdDev"})
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
    required = {"schemaVersion", "drawings", "options", "indicators", "timeframe"}
    allowed = required | {"movingAverages", "chartAppearance", "oscillatorInstances", "chartType"}
    if not isinstance(raw, dict) or not required.issubset(raw) or not set(raw).issubset(allowed) or type(raw["schemaVersion"]) is not int or raw["schemaVersion"] != 1:
        raise StoreError("Nicht unterstütztes Workspace-Schema.")
    drawings = raw["drawings"]
    if not isinstance(drawings, list) or len(drawings) > MAX_DRAWINGS:
        raise StoreError("Zu viele oder ungültige Zeichnungen.")
    out = []
    seen_ids = set()
    for drawing in drawings:
        required_draw = {"kind", "anchors"}
        optional_draw = {"id", "label", "visible", "locked", "levels"}
        if not isinstance(drawing, dict) or not required_draw.issubset(drawing) or (
            set(drawing) - required_draw - optional_draw
        ):
            raise StoreError("Unbekannte Zeichenobjekt-Eigenschaften.")
        if "id" in drawing:
            drawing_id = drawing["id"]
            if not isinstance(drawing_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", drawing_id):
                raise StoreError("Ungültige Objekt-Identität.")
            if drawing_id in seen_ids:
                raise StoreError("Doppelte Objekt-Identität.")
            seen_ids.add(drawing_id)
        if "label" in drawing and (
            not isinstance(drawing["label"], str) or len(drawing["label"]) > 40
            or any(ord(char) < 32 for char in drawing["label"])
        ):
            raise StoreError("Ungültiger Objektname.")
        for field in ("visible", "locked"):
            if field in drawing and type(drawing[field]) is not bool:
                raise StoreError("Ungültige Objekt-Sichtbarkeit oder Sperre.")
        kind = drawing["kind"]
        if not isinstance(kind, str) or kind not in DRAWING_TYPES:
            raise StoreError("Nicht unterstützter Zeichnungstyp.")
        anchors = drawing["anchors"]
        expected = 1 if kind in {"horizontal", "vertical", "text"} else (3 if kind == "channel" else 2)
        if not isinstance(anchors, list) or len(anchors) != expected:
            raise StoreError("Ungültige Ankeranzahl.")
        if kind == "text" and (not isinstance(drawing.get("label"), str) or
                                not drawing["label"].strip() or len(drawing["label"]) > 40):
            raise StoreError("Textannotation benötigt einen Namen mit 1–40 Zeichen.")
        safe_anchors = []
        for anchor in anchors:
            if not isinstance(anchor, dict) or set(anchor) != {"time", "price"}:
                raise StoreError("Unbekannte Ankereigenschaft.")
            stamp = _number(anchor["time"], "time", integer=True)
            price = _number(anchor["price"], "price")
            if stamp <= 0 or stamp > 7258118400 or price <= 0 or price > 1e15:
                raise StoreError("Ungültiger Zeitpunkt oder Preis.")
            safe_anchors.append({"time": stamp, "price": price})
        normalized = {"kind": kind, "anchors": safe_anchors}
        if "levels" in drawing:
            if kind != "fib":
                raise StoreError("Fibonacci-Level nur für Fibonacci-Zeichnungen erlaubt.")
            levels = drawing["levels"]
            if not isinstance(levels, list) or not 1 <= len(levels) <= 16:
                raise StoreError("Fibonacci-Level müssen 1–16 Werte enthalten.")
            last = float("-inf")
            clean_levels = []
            for raw_level in levels:
                value = _number(raw_level, "Fibonacci-Level")
                if not -10 <= value <= 10 or value <= last + 1e-9:
                    raise StoreError("Fibonacci-Level ungültig oder nicht streng steigend.")
                clean_levels.append(value)
                last = value
            normalized["levels"] = clean_levels
        for field in ("id", "label", "visible", "locked"):
            if field in drawing:
                normalized[field] = drawing[field]
        out.append(normalized)
    options = raw["options"]
    if not isinstance(options, dict) or any(k not in UI_FLAGS | UI_NUMBERS | {"bbFill"} for k in options):
        raise StoreError("Nicht unterstützte Chart-Option.")
    if any(type(v) is not bool for k, v in options.items() if k in UI_FLAGS | {"bbFill"}):
        raise StoreError("Chart-Optionen müssen boolesch sein.")
    if "bbPeriod" in options and (type(options["bbPeriod"]) is not int or not 2 <= options["bbPeriod"] <= 300):
        raise StoreError("Bollinger-Periode muss zwischen 2 und 300 liegen.")
    if "bbStdDev" in options:
        deviation = _number(options["bbStdDev"], "Bollinger-StdDev")
        if not 0.1 <= deviation <= 10:
            raise StoreError("Bollinger-StdDev muss zwischen 0.1 und 10 liegen.")
    indicators = raw["indicators"]
    if not isinstance(indicators, dict) or any(k not in INDICATORS for k in indicators):
        raise StoreError("Unbekannter Indikator.")
    clean_indicators = {}
    for kind, values in indicators.items():
        color_fields = {"upColor", "downColor"} if kind == "volume" else set()
        if not isinstance(values, dict) or any(
            k not in PERIOD_FIELDS | {"enabled"} | color_fields for k in values
        ):
            raise StoreError("Ungültige Indikator-Parameter.")
        cleaned = {}
        for param, value in values.items():
            if param == "enabled":
                if type(value) is not bool:
                    raise StoreError("Indikator-Sichtbarkeit muss boolesch sein.")
            elif param in color_fields:
                if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                    raise StoreError("Ungültige Volumenfarbe.")
                value = value.lower()
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
    # Backward-compatible extension: historic schema-v1 documents omit this key.
    if "movingAverages" in raw:
        entries = raw["movingAverages"]
        if not isinstance(entries, list) or len(entries) > 16:
            raise StoreError("Maximal 16 gleitende Durchschnitte erlaubt.")
        ids = set()
        required_ma = {"id", "type", "period", "source", "color",
                       "lineWidth", "visible", "label"}
        optional_ma = {"displayShift"}
        types = {"EMA", "SMA", "WMA", "RMA", "SMMA"}
        sources = {"close", "open", "high", "low", "hl2", "hlc3", "ohlc4"}
        clean_ma = []
        for item in entries:
            if not isinstance(item, dict) or not required_ma.issubset(item) or set(item) - required_ma - optional_ma:
                raise StoreError("Unbekannte Eigenschaften einer MA-Linie.")
            ident = item["id"]
            if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", ident):
                raise StoreError("Ungültige MA-Identität.")
            if ident in ids:
                raise StoreError("Doppelte MA-Identität.")
            ids.add(ident)
            if not isinstance(item["type"], str) or item["type"] not in types:
                raise StoreError("Unbekannter Moving-Average-Typ.")
            if not isinstance(item["source"], str) or item["source"] not in sources:
                raise StoreError("Unbekannte MA-Preisquelle.")
            if type(item["period"]) is not int or not 1 <= item["period"] <= 1000:
                raise StoreError("MA-Periode muss zwischen 1 und 1000 liegen.")
            if "displayShift" in item and (
                type(item["displayShift"]) is not int or not -500 <= item["displayShift"] <= 500
            ):
                raise StoreError("MA-Anzeigeversatz muss eine Ganzzahl zwischen -500 und 500 sein.")
            if type(item["lineWidth"]) is not int or not 1 <= item["lineWidth"] <= 4:
                raise StoreError("Linienbreite außerhalb 1–4.")
            if type(item["visible"]) is not bool:
                raise StoreError("MA-Sichtbarkeit muss boolesch sein.")
            if not isinstance(item["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", item["color"]):
                raise StoreError("Ungültige MA-Farbe.")
            label = item["label"]
            if not isinstance(label, str) or len(label) > 40 or any(ord(c) < 32 for c in label):
                raise StoreError("Ungültiger MA-Name.")
            clean_ma.append(item.copy())
        safe["movingAverages"] = clean_ma
    if "chartAppearance" in raw:
        appearance = raw["chartAppearance"]
        fields = {"theme", "grid", "crosshair", "scale", "upColor",
                  "downColor", "wickVisible", "borderVisible", "lastPriceVisible"}
        if not isinstance(appearance, dict) or any(k not in fields for k in appearance):
            raise StoreError("Ungültige Chart-Darstellung.")
        if "theme" in appearance and (
            type(appearance["theme"]) is not str or
            appearance["theme"] not in {"inherit", "dark", "light"}
        ):
            raise StoreError("Unbekanntes Chart-Farbschema.")
        if "scale" in appearance and (
            type(appearance["scale"]) is not str or
            appearance["scale"] not in {"normal", "logarithmic"}
        ):
            raise StoreError("Ungültige Preisskala.")
        for key in {"grid", "crosshair", "wickVisible", "borderVisible", "lastPriceVisible"}:
            if key in appearance and type(appearance[key]) is not bool:
                raise StoreError("Chart-Sichtbarkeit muss boolesch sein.")
        for key in {"upColor", "downColor"}:
            if key in appearance and (
                not isinstance(appearance[key], str) or
                not re.fullmatch(r"#[0-9a-fA-F]{6}", appearance[key])
            ):
                raise StoreError("Ungültige Kerzenfarbe.")
        safe["chartAppearance"] = appearance.copy()
    if "oscillatorInstances" in raw:
        instances = raw["oscillatorInstances"]
        if not isinstance(instances, list) or len(instances) > 8:
            raise StoreError("Maximal acht zusätzliche Oszillatoren erlaubt.")
        ids = set()
        clean_osc = []
        common = {"id", "kind", "visible", "color", "lineWidth", "label"}
        for inst in instances:
            if not isinstance(inst, dict):
                raise StoreError("Ungültige Oszillator-Instanz.")
            kind = inst.get("kind")
            if type(kind) is not str or kind not in {"rsi", "macd", "atr", "adx"}:
                raise StoreError("Unbekannter Oszillator.")
            params = {"fast", "slow", "signal"} if kind == "macd" else {"period"}
            if set(inst) != common | params:
                raise StoreError("Unbekannte Oszillator-Eigenschaften.")
            ident = inst["id"]
            if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", ident):
                raise StoreError("Ungültige Oszillator-Identität.")
            if ident in ids:
                raise StoreError("Doppelte Oszillator-Identität.")
            ids.add(ident)
            if type(inst["visible"]) is not bool:
                raise StoreError("Ungültige Oszillator-Sichtbarkeit.")
            if not isinstance(inst["color"], str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", inst["color"]):
                raise StoreError("Ungültige Oszillator-Farbe.")
            if type(inst["lineWidth"]) is not int or not 1 <= inst["lineWidth"] <= 4:
                raise StoreError("Ungültige Oszillator-Linienbreite.")
            label = inst["label"]
            if not isinstance(label, str) or len(label) > 40 or any(ord(c) < 32 for c in label):
                raise StoreError("Ungültiger Oszillator-Name.")
            for param in params:
                bound = 300 if param == "slow" else 200
                if type(inst[param]) is not int or not 2 <= inst[param] <= bound:
                    raise StoreError("Ungültige Oszillator-Periode.")
            if kind == "macd" and inst["fast"] >= inst["slow"]:
                raise StoreError("MACD benötigt fast kleiner slow.")
            clean_osc.append(inst.copy())
        safe["oscillatorInstances"] = clean_osc
    if "chartType" in raw:
        if type(raw["chartType"]) is not str or raw["chartType"] not in {
            "candles", "bars", "line", "area"
        }:
            raise StoreError("Unbekannter Chart-Typ.")
        safe["chartType"] = raw["chartType"]
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
