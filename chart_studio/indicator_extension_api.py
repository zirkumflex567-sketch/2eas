"""Read-only HTTP preview for signed, declarative indicator packages."""
from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from chart_studio.indicator_extensions import (
    MAX_BARS,
    MAX_PACKAGE_BYTES,
    evaluate_extension,
    parse_signed_package,
)

MAX_REQUEST_BYTES = 1_200_000
DEMO_ACCOUNTS = frozenset({"titan", "xau5m_m5", "titan_m5", "xau5m_500"})
TIMEFRAMES = frozenset({"M1", "M5", "M15", "M30", "H1", "H4", "D1"})
SYMBOL_PATTERN = re.compile(r"^XAUUSD(?:\.p|\.pi)?$", re.IGNORECASE)


def _fail(code: str, status: int = 422):
    raise HTTPException(status_code=status, detail={"code": code})


def _pairs_no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _fail("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _reject_json_constant(_value):
    _fail("INVALID_JSON")


def _trusted_keys_from_environment():
    raw = os.environ.get("CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON")
    if not raw or len(raw) > 16_384:
        return None
    try:
        value = json.loads(raw, object_pairs_hook=_pairs_no_duplicates,
                           parse_constant=_reject_json_constant)
    except (ValueError, json.JSONDecodeError, RecursionError):
        return None
    return value if isinstance(value, dict) and value else None


async def _bounded_body(request: Request) -> bytes:
    chunks = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_REQUEST_BYTES:
            _fail("REQUEST_TOO_LARGE", 413)
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_body(raw: bytes):
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs_no_duplicates,
                           parse_constant=_reject_json_constant)
    except HTTPException:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
        _fail("INVALID_JSON")
    required = {"account", "symbol", "timeframe", "package", "parameters", "bars"}
    if type(value) is not dict or set(value) != required:
        _fail("INVALID_REQUEST_FIELDS")
    if type(value["account"]) is not str or value["account"] not in DEMO_ACCOUNTS:
        if value["account"] == "blueberry":
            _fail("PROTECTED_ACCOUNT", 403)
        _fail("INVALID_ACCOUNT")
    if type(value["symbol"]) is not str or not SYMBOL_PATTERN.fullmatch(value["symbol"]):
        _fail("INVALID_SYMBOL")
    if type(value["timeframe"]) is not str or value["timeframe"] not in TIMEFRAMES:
        _fail("INVALID_TIMEFRAME")
    if type(value["package"]) is not str or len(value["package"]) > MAX_PACKAGE_BYTES:
        _fail("PACKAGE_LIMIT")
    if type(value["parameters"]) is not dict:
        _fail("INVALID_PARAMETERS")
    if type(value["bars"]) is not list or not 1 <= len(value["bars"]) <= MAX_BARS:
        _fail("BAR_LIMIT")
    return value


def install_indicator_extension_routes(
    app: FastAPI,
    *,
    trusted_keys_provider=_trusted_keys_from_environment,
):
    """Install a stateless preview route. It has no MT5 or persistence dependency."""

    @app.post("/api/chart/v1/indicator-extensions/preview")
    async def preview(request: Request):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            _fail("JSON_REQUIRED", 415)
        value = _parse_body(await _bounded_body(request))
        try:
            trusted_keys = trusted_keys_provider()
        except Exception:
            trusted_keys = None
        if not isinstance(trusted_keys, Mapping) or not trusted_keys:
            _fail("TRUST_STORE_UNAVAILABLE", 503)
        try:
            package = parse_signed_package(value["package"], trusted_keys=trusted_keys)
            result = evaluate_extension(package["manifest"], value["bars"], value["parameters"])
        except ValueError as exc:
            code = str(exc)
            _fail(code if re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", code) else "INVALID_EXTENSION")
        return JSONResponse({
            "account": value["account"],
            "symbol": value["symbol"],
            "timeframe": value["timeframe"],
            "indicator": {key: package["manifest"][key] for key in ("id", "version", "name")},
            "source": "CALLER_SUPPLIED_BARS",
            "canExecute": False,
            "series": [{"time": timestamp, "value": point}
                       for timestamp, point in zip(result.times, result.values)],
        }, headers={"Cache-Control": "no-store"})
