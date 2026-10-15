"""Signed declarative indicator packages with bounded, non-code evaluation."""
from __future__ import annotations

import base64
import binascii
from collections import deque
from dataclasses import dataclass
import json
import math
import re
import time
from typing import Mapping, Sequence

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

MAX_PACKAGE_BYTES = 64 * 1024
MAX_NODES = 128
MAX_DEPTH = 16
MAX_PARAMETERS = 16
MAX_BARS = 10_000
MAX_PERIOD = 1_000
MAX_MEMORY_BYTES = 64 * 1024 * 1024
MAX_OPERATIONS = 3_000_000
MAX_EVALUATION_SECONDS = 0.250
_ARRAY_BYTES_PER_CELL = 64
_ARRAY_OVERHEAD_BYTES = 1_024
_ROLLING_SCRATCH_BYTES_PER_PERIOD = 16
_IDENTIFIER = re.compile(r"^[a-z][a-z0-9-]{0,47}$")
_VERSION = re.compile(r"^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$")
_SOURCES = frozenset(("open", "high", "low", "close", "hl2", "hlc3", "ohlc4"))
_LEAF_KEYS = frozenset(("source", "constant", "parameter"))
_UNARY = frozenset(("abs", "neg"))
_BINARY = frozenset(("add", "sub", "mul", "div", "min", "max"))
_ROLLING = frozenset(("sma", "ema"))


def _fail(code: str):
    raise ValueError(code)


def _canonical(value) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                          separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError) as exc:
        raise ValueError("INVALID_JSON_VALUE") from exc


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _fail("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _json_constant(_value):
    _fail("NONFINITE_JSON_NUMBER")


def _strict_number(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail("INVALID_NUMBER")
    try:
        number = float(value)
    except (OverflowError, ValueError):
        _fail("INVALID_NUMBER")
    if not math.isfinite(number) or abs(number) > 1e12 or (positive and number <= 0):
        _fail("NUMBER_OUT_OF_RANGE")
    return number


def _identifier(value):
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail("INVALID_IDENTIFIER")
    return value


def _manifest(value):
    if type(value) is not dict or set(value) != {"id", "version", "name", "parameters", "expression"}:
        _fail("INVALID_MANIFEST")
    result = dict(value)
    result["id"] = _identifier(result["id"])
    if not isinstance(result["version"], str) or not _VERSION.fullmatch(result["version"]):
        _fail("INVALID_VERSION")
    name = result["name"]
    if (not isinstance(name, str) or not name or len(name) > 48 or
            any(ord(char) < 0x20 or ord(char) == 0x7f for char in name)):
        _fail("INVALID_NAME")

    declarations = result["parameters"]
    if type(declarations) is not list or len(declarations) > MAX_PARAMETERS:
        _fail("PARAMETER_LIMIT")
    parameters = {}
    normalized_declarations = []
    for declaration in declarations:
        if type(declaration) is not dict or set(declaration) != {"id", "min", "max", "default", "step"}:
            _fail("INVALID_PARAMETER")
        parameter_id = _identifier(declaration["id"])
        if parameter_id in parameters:
            _fail("DUPLICATE_PARAMETER")
        minimum = _strict_number(declaration["min"])
        maximum = _strict_number(declaration["max"])
        default = _strict_number(declaration["default"])
        step = _strict_number(declaration["step"], positive=True)
        if maximum < minimum or default < minimum or default > maximum:
            _fail("INVALID_PARAMETER_RANGE")
        ratio = (default - minimum) / step
        if not math.isfinite(ratio) or abs(ratio - round(ratio)) > 1e-9:
            _fail("INVALID_PARAMETER_STEP")
        spec = {"id": parameter_id, "min": minimum, "max": maximum,
                "default": default, "step": step}
        parameters[parameter_id] = spec
        normalized_declarations.append(spec)
    result["parameters"] = normalized_declarations

    stats = {"nodes": 0, "rolling": 0, "weight": 0, "max_period": 0}

    def visit(node, depth):
        if depth > MAX_DEPTH:
            _fail("DEPTH_LIMIT")
        if type(node) is not dict:
            _fail("INVALID_EXPRESSION")
        stats["nodes"] += 1
        if stats["nodes"] > MAX_NODES:
            _fail("NODE_LIMIT")
        keys = set(node)
        if len(keys) == 1 and next(iter(keys)) in _LEAF_KEYS:
            key = next(iter(keys))
            operand = node[key]
            if key == "source":
                if not isinstance(operand, str) or operand not in _SOURCES:
                    _fail("INVALID_SOURCE")
                normalized = {key: operand}
            elif key == "constant":
                normalized = {key: _strict_number(operand)}
            else:
                parameter_id = _identifier(operand)
                if parameter_id not in parameters:
                    _fail("UNKNOWN_PARAMETER")
                normalized = {key: parameter_id}
            stats["weight"] += 1
            return normalized
        op = node.get("op")
        if not isinstance(op, str):
            _fail("UNSUPPORTED_OPERATION")
        if op in _UNARY and keys == {"op", "input"}:
            child = visit(node["input"], depth + 1)
            stats["weight"] += 1
            return {"op": op, "input": child}
        if op in _BINARY and keys == {"op", "left", "right"}:
            left = visit(node["left"], depth + 1)
            right = visit(node["right"], depth + 1)
            stats["weight"] += 1
            return {"op": op, "left": left, "right": right}
        if op in _ROLLING and keys == {"op", "period", "input"}:
            period = node["period"]
            if type(period) is not int or not 2 <= period <= MAX_PERIOD:
                _fail("PERIOD_LIMIT")
            child = visit(node["input"], depth + 1)
            stats["rolling"] += 1
            stats["max_period"] = max(stats["max_period"], period)
            stats["weight"] += 10
            return {"op": op, "period": period, "input": child}
        _fail("UNSUPPORTED_OPERATION")

    result["expression"] = visit(result["expression"], 1)
    result["_stats"] = stats
    return result


def _decode_b64(value, expected_bytes, code):
    if not isinstance(value, str) or not value or len(value) > 128:
        _fail(code)
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(code) from exc
    if len(decoded) != expected_bytes or base64.b64encode(decoded).decode("ascii") != value:
        _fail(code)
    return decoded


def export_signed_package(manifest, *, key_id: str, private_key: Ed25519PrivateKey) -> bytes:
    """Create canonical bytes. The caller owns the signing key lifecycle."""
    key_id = _identifier(key_id)
    if not isinstance(private_key, Ed25519PrivateKey):
        _fail("INVALID_SIGNING_KEY")
    normalized = _manifest(manifest)
    normalized.pop("_stats", None)
    signed = _canonical(normalized)
    package = {"schemaVersion": 1, "keyId": key_id,
               "signature": base64.b64encode(private_key.sign(signed)).decode("ascii"),
               "manifest": normalized}
    raw = _canonical(package)
    if len(raw) > MAX_PACKAGE_BYTES:
        _fail("PACKAGE_LIMIT")
    return raw


def parse_signed_package(raw: bytes | str, *, trusted_keys: Mapping[str, str | bytes]):
    """Parse and verify a canonical package against host-provisioned public keys."""
    if isinstance(raw, str):
        # Bound the caller-controlled object before allocating its UTF-8 copy. A
        # bounded number of Unicode code points can expand to at most 4x bytes;
        # the byte-level limit below still enforces the actual package budget.
        if str.__len__(raw) > MAX_PACKAGE_BYTES:
            _fail("PACKAGE_LIMIT")
        try:
            # Invoke the built-in encoder directly so str subclasses cannot
            # override encode() and allocate an unbounded result.
            encoded = str.encode(raw, "utf-8")
        except UnicodeEncodeError as exc:
            raise ValueError("INVALID_UTF8") from exc
    elif isinstance(raw, bytes):
        encoded = raw
    else:
        _fail("INVALID_PACKAGE")
    if len(encoded) > MAX_PACKAGE_BYTES:
        _fail("PACKAGE_LIMIT")
    try:
        package = json.loads(encoded.decode("utf-8"), object_pairs_hook=_object_pairs,
                             parse_constant=_json_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise ValueError("INVALID_PACKAGE") from exc
    if type(package) is not dict or set(package) != {"schemaVersion", "keyId", "signature", "manifest"}:
        _fail("INVALID_PACKAGE")
    if type(package["schemaVersion"]) is not int or package["schemaVersion"] != 1:
        _fail("INVALID_VERSION")
    key_id = _identifier(package["keyId"])
    try:
        keys = trusted_keys
        if not isinstance(keys, Mapping) or key_id not in keys:
            _fail("UNTRUSTED_SIGNER")
        encoded_key = keys[key_id]
        public_bytes = (_decode_b64(encoded_key, 32, "INVALID_TRUSTED_KEY")
                        if isinstance(encoded_key, str) else encoded_key)
        if not isinstance(public_bytes, bytes) or len(public_bytes) != 32:
            _fail("INVALID_TRUSTED_KEY")
        signature = _decode_b64(package["signature"], 64, "INVALID_SIGNATURE")
        normalized = _manifest(package["manifest"])
        normalized.pop("_stats", None)
        canonical_package = {"schemaVersion": 1, "keyId": key_id,
                             "signature": package["signature"], "manifest": normalized}
        # Exported files have exactly one canonical representation, preventing parser ambiguity.
        if _canonical(canonical_package) != encoded:
            _fail("NONCANONICAL_PACKAGE")
        Ed25519PublicKey.from_public_bytes(public_bytes).verify(signature, _canonical(normalized))
    except InvalidSignature as exc:
        raise ValueError("INVALID_SIGNATURE") from exc
    return {"schemaVersion": 1, "keyId": key_id, "signature": package["signature"],
            "manifest": normalized}


@dataclass(frozen=True)
class IndicatorSeries:
    times: tuple[int, ...]
    values: tuple[float | None, ...]


class _Budget:
    def __init__(self, monotonic):
        self.monotonic = monotonic
        self.deadline = monotonic() + MAX_EVALUATION_SECONDS
        self.operations = 0

    def consume(self, count=1):
        self.operations += count
        if self.operations > MAX_OPERATIONS:
            _fail("OPERATION_BUDGET")
        if self.operations % 64 < count and self.monotonic() >= self.deadline:
            _fail("TIME_BUDGET")


def _normalize_bars(bars, budget):
    if not isinstance(bars, (list, tuple)) or not 1 <= len(bars) <= MAX_BARS:
        _fail("BAR_LIMIT")
    times = []
    columns = {name: [] for name in ("open", "high", "low", "close")}
    previous = None
    for bar in bars:
        budget.consume(5)
        if type(bar) is not dict or not {"time", "open", "high", "low", "close"} <= set(bar):
            _fail("INVALID_BAR")
        timestamp = bar["time"]
        if type(timestamp) is not int or not -(2**53) < timestamp < 2**53 or (previous is not None and timestamp <= previous):
            _fail("INVALID_BAR_TIME")
        values = {name: _strict_number(bar[name]) for name in columns}
        if values["high"] < max(values["open"], values["close"]) or values["low"] > min(values["open"], values["close"]):
            _fail("INVALID_BAR_RANGE")
        times.append(timestamp)
        for name in columns:
            columns[name].append(values[name])
        previous = timestamp
    return tuple(times), columns


def evaluate_extension(manifest, bars, parameters=None, *, monotonic=time.monotonic) -> IndicatorSeries:
    """Evaluate a validated tree. No source code, callbacks, or broker handles run here."""
    normalized_manifest = _manifest(manifest)
    stats = normalized_manifest.pop("_stats")
    if not isinstance(bars, (list, tuple)) or not 1 <= len(bars) <= MAX_BARS:
        _fail("BAR_LIMIT")
    bar_count = len(bars)
    estimated_cells = (stats["nodes"] + 5) * bar_count
    memory_bytes = (estimated_cells * _ARRAY_BYTES_PER_CELL +
                    (stats["nodes"] + 5) * _ARRAY_OVERHEAD_BYTES +
                    stats["rolling"] * stats["max_period"] * _ROLLING_SCRATCH_BYTES_PER_PERIOD)
    if memory_bytes > MAX_MEMORY_BYTES:
        _fail("MEMORY_BUDGET")
    estimated_operations = 5 * bar_count + stats["nodes"] + stats["weight"] * bar_count
    if estimated_operations > MAX_OPERATIONS:
        _fail("OPERATION_BUDGET")
    budget = _Budget(monotonic)
    times, columns = _normalize_bars(bars, budget)
    specs = {p["id"]: p for p in normalized_manifest["parameters"]}
    supplied = {} if parameters is None else parameters
    if type(supplied) is not dict or set(supplied) - set(specs):
        _fail("INVALID_PARAMETERS")
    values = {}
    for parameter_id, spec in specs.items():
        value = _strict_number(supplied.get(parameter_id, spec["default"]))
        if value < spec["min"] or value > spec["max"]:
            _fail("PARAMETER_OUT_OF_RANGE")
        steps = (value - spec["min"]) / spec["step"]
        if abs(steps - round(steps)) > 1e-9:
            _fail("PARAMETER_STEP")
        values[parameter_id] = value

    def compute(node):
        budget.consume()  # Count each dispatched tree node.
        if "source" in node:
            source = node["source"]
            if source == "hl2":
                source_values = [(columns["high"][i] + columns["low"][i]) / 2 for i in range(bar_count)]
            elif source == "hlc3":
                source_values = [(columns["high"][i] + columns["low"][i] + columns["close"][i]) / 3 for i in range(bar_count)]
            elif source == "ohlc4":
                source_values = [(columns["open"][i] + columns["high"][i] + columns["low"][i] + columns["close"][i]) / 4 for i in range(bar_count)]
            else:
                source_values = columns[source]
            result = []
            for value in source_values:
                budget.consume()
                if not math.isfinite(value): _fail("NONFINITE_RESULT")
                result.append(value)
            return result
        if "constant" in node:
            value = node["constant"]
            result = []
            for _ in times:
                budget.consume()
                result.append(value)
            return result
        if "parameter" in node:
            value = values[node["parameter"]]
            result = []
            for _ in times:
                budget.consume()
                result.append(value)
            return result
        op = node["op"]
        if op in _UNARY:
            source = compute(node["input"])
            result = []
            fn = abs if op == "abs" else lambda value: -value
            for value in source:
                budget.consume()
                calculated = None if value is None else fn(value)
                if calculated is not None and not math.isfinite(calculated): _fail("NONFINITE_RESULT")
                result.append(calculated)
            return result
        if op in _BINARY:
            left = compute(node["left"])
            right = compute(node["right"])
            result = []
            for a, b in zip(left, right):
                budget.consume()
                if a is None or b is None or (op == "div" and b == 0):
                    result.append(None)
                    continue
                if op == "add": value = a + b
                elif op == "sub": value = a - b
                elif op == "mul": value = a * b
                elif op == "div": value = a / b
                elif op == "min": value = min(a, b)
                else: value = max(a, b)
                if not math.isfinite(value): _fail("NONFINITE_RESULT")
                result.append(value)
            return result
        source = compute(node["input"])
        period = node["period"]
        result = []
        if op == "sma":
            window = deque()
            running = 0.0
            for value in source:
                budget.consume(10)
                if value is None:
                    window.clear(); running = 0.0; result.append(None); continue
                window.append(value); running += value
                if len(window) > period:
                    running -= window.popleft()
                result.append(running / period if len(window) == period else None)
        else:
            previous = None
            count = 0
            factor = 2.0 / (period + 1)
            for value in source:
                budget.consume(10)
                if value is None:
                    previous = None; count = 0; result.append(None); continue
                previous = value if previous is None else previous + factor * (value - previous)
                count += 1
                calculated = previous if count >= period else None
                if calculated is not None and not math.isfinite(calculated): _fail("NONFINITE_RESULT")
                result.append(calculated)
        return result

    output = compute(normalized_manifest["expression"])
    return IndicatorSeries(times=times, values=tuple(output))
