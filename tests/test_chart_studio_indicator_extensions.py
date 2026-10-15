"""Signed, bounded indicator packages must never execute imported code."""
import base64
import copy
import importlib
import importlib.util
import json
import math

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def api():
    assert importlib.util.find_spec("chart_studio.indicator_extensions"), "indicator extension sandbox is missing"
    return importlib.import_module("chart_studio.indicator_extensions")


def keypair():
    private = Ed25519PrivateKey.generate()
    public = private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return private, {"test-key": base64.b64encode(public).decode("ascii")}


def manifest(expression=None, parameters=None):
    return {
        "id": "demo-spread",
        "version": "1.0.0",
        "name": "Demo spread",
        "parameters": parameters or [],
        "expression": expression or {"source": "close"},
    }


def bars(closes):
    return [
        {"time": i + 1, "open": close - 0.25, "high": close + 1,
         "low": close - 1, "close": close}
        for i, close in enumerate(closes)
    ]


def signed(value=None):
    engine = api()
    private, trusted = keypair()
    raw = engine.export_signed_package(value or manifest(), key_id="test-key", private_key=private)
    return engine, private, trusted, raw


def test_signed_export_roundtrips_manifest_and_import_never_contains_private_key():
    engine, private, trusted, raw = signed()
    package = json.loads(raw)
    assert set(package) == {"schemaVersion", "keyId", "signature", "manifest"}
    assert package["manifest"] == manifest()
    assert private.private_bytes(
        serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()
    ) not in raw
    assert engine.parse_signed_package(raw, trusted_keys=trusted)["manifest"] == manifest()
    assert raw == engine.export_signed_package(manifest(), key_id="test-key", private_key=private)


@pytest.mark.parametrize("mutation", [
    lambda p: p.update(signature="!"),
    lambda p: p["manifest"].update(name="tampered"),
    lambda p: p.update(schemaVersion=True),
])
def test_import_rejects_tampering_and_malformed_package(mutation):
    engine, _, trusted, raw = signed()
    package = json.loads(raw)
    mutation(package)
    with pytest.raises(ValueError):
        engine.parse_signed_package(json.dumps(package), trusted_keys=trusted)


def test_import_rejects_unknown_or_malformed_trust_keys_and_duplicate_json_keys():
    engine, _, trusted, raw = signed()
    with pytest.raises(ValueError):
        engine.parse_signed_package(raw, trusted_keys={})
    with pytest.raises(ValueError):
        engine.parse_signed_package(raw, trusted_keys={"test-key": "not-base64!"})
    with pytest.raises(ValueError):
        engine.parse_signed_package(b'{"schemaVersion":1,"schemaVersion":1}', trusted_keys=trusted)
    with pytest.raises(ValueError):
        engine.parse_signed_package(b" " * (engine.MAX_PACKAGE_BYTES + 1), trusted_keys=trusted)
    pretty = json.dumps(json.loads(raw), sort_keys=True).encode("utf-8")
    with pytest.raises(ValueError, match="NONCANONICAL_PACKAGE"):
        engine.parse_signed_package(pretty, trusted_keys=trusted)


def test_oversized_text_package_is_rejected_before_utf8_encoding():
    engine = api()

    class OversizedText(str):
        def __len__(self):
            return 1

        def encode(self, *args, **kwargs):
            raise AssertionError("oversized text must be rejected before encoding")

    raw = OversizedText(" " * (engine.MAX_PACKAGE_BYTES + 1))
    with pytest.raises(ValueError, match="PACKAGE_LIMIT"):
        engine.parse_signed_package(raw, trusted_keys={})


def test_text_subclass_cannot_override_the_bounded_utf8_encoder():
    engine = api()

    class HostileText(str):
        def encode(self, *args, **kwargs):
            raise AssertionError("caller-provided encoder must not run")

    with pytest.raises(ValueError, match="INVALID_PACKAGE"):
        engine.parse_signed_package(HostileText("not json"), trusted_keys={})


def test_canonical_package_with_wrong_ed25519_signature_is_rejected():
    engine, _, trusted, raw = signed()
    package = json.loads(raw)
    package["signature"] = base64.b64encode(b"\0" * 64).decode("ascii")
    wrong_signature = json.dumps(package, sort_keys=True, separators=(",", ":")).encode("utf-8")
    with pytest.raises(ValueError, match="INVALID_SIGNATURE"):
        engine.parse_signed_package(wrong_signature, trusted_keys=trusted)


@pytest.mark.parametrize("bad_manifest", [
    {**manifest(), "unexpected": True},
    manifest({"op": "python", "source": "__import__('os')"}),
    manifest({"op": [], "left": {"source": "close"}, "right": {"constant": 1}}),
    manifest({"source": "close", "attribute": "__class__"}),
    manifest({"constant": True}),
    manifest({"op": "sma", "period": 1, "input": {"source": "close"}}),
    manifest(parameters=[{"id": "x", "min": 0, "max": 2, "default": 1, "step": 1, "extra": 0}]),
    manifest(parameters=[{"id": "x", "min": 0, "max": 2, "default": 1, "step": 1}],
             expression={"parameter": "missing"}),
])
def test_export_rejects_unknown_schema_fields_dynamic_code_and_invalid_parameters(bad_manifest):
    engine = api()
    private, _ = keypair()
    with pytest.raises(ValueError):
        engine.export_signed_package(bad_manifest, key_id="test-key", private_key=private)


def test_evaluator_calculates_sma_and_keeps_utc_bar_alignment():
    engine = api()
    expression = {"op": "sma", "period": 2, "input": {"source": "close"}}
    result = engine.evaluate_extension(manifest(expression), bars([1, 2, 3, 4]))
    assert result.times == (1, 2, 3, 4)
    assert result.values == (None, 1.5, 2.5, 3.5)


def test_evaluator_composes_derived_sources_and_declared_parameters():
    engine = api()
    params = [{"id": "scale", "min": 1, "max": 3, "default": 2, "step": 0.5}]
    expression = {
        "op": "add",
        "left": {"op": "mul", "left": {"source": "hl2"}, "right": {"parameter": "scale"}},
        "right": {"constant": 1},
    }
    input_bars = bars([2, 3])
    before = copy.deepcopy(input_bars)
    result = engine.evaluate_extension(manifest(expression, params), input_bars, {"scale": 1.5})
    assert result.values == (4, 5.5)
    assert input_bars == before


def test_evaluator_uses_ema_warmup_and_divide_by_zero_is_unavailable():
    engine = api()
    ema = {"op": "ema", "period": 2, "input": {"source": "close"}}
    values = engine.evaluate_extension(manifest(ema), bars([1, 2, 3])).values
    assert values[0] is None
    assert values[1:] == pytest.approx((5 / 3, 23 / 9))
    divide = {"op": "div", "left": {"source": "close"}, "right": {"constant": 0}}
    assert engine.evaluate_extension(manifest(divide), bars([1, 2])).values == (None, None)


def test_evaluator_rejects_bad_bars_parameters_and_nonfinite_results():
    engine = api()
    params = [{"id": "scale", "min": 1, "max": 3, "default": 2, "step": 0.5}]
    expr = {"op": "mul", "left": {"source": "close"}, "right": {"parameter": "scale"}}
    with pytest.raises(ValueError):
        engine.evaluate_extension(manifest(expr, params), bars([1]), {"scale": 1.25})
    invalid = bars([1])
    invalid[0]["close"] = math.inf
    with pytest.raises(ValueError):
        engine.evaluate_extension(manifest(), invalid)
    with pytest.raises(ValueError):
        engine.evaluate_extension(manifest(), bars([1]), {"other": 2})


def test_export_rejects_expression_depth_and_node_limits():
    engine = api()
    private, _ = keypair()
    deep = {"source": "close"}
    for _ in range(engine.MAX_DEPTH):
        deep = {"op": "abs", "input": deep}
    with pytest.raises(ValueError, match="DEPTH_LIMIT"):
        engine.export_signed_package(manifest(deep), key_id="test-key", private_key=private)

    leaves = [{"source": "close"} for _ in range(65)]
    while len(leaves) > 1:
        leaves = [{"op": "add", "left": leaves[i], "right": leaves[i + 1]}
                  for i in range(0, len(leaves) - 1, 2)] + leaves[len(leaves) // 2 * 2:]
    with pytest.raises(ValueError, match="NODE_LIMIT"):
        engine.export_signed_package(manifest(leaves[0]), key_id="test-key", private_key=private)


def test_evaluator_preflights_memory_and_operation_budgets():
    engine = api()

    def make_tree(count):
        leaves = [{"op": "sma", "period": 2, "input": {"source": "close"}} for _ in range(count)]
        while len(leaves) > 1:
            leaves = [{"op": "add", "left": leaves[i], "right": leaves[i + 1]}
                      for i in range(0, len(leaves) - 1, 2)] + leaves[len(leaves) // 2 * 2:]
        return leaves[0]

    with pytest.raises(ValueError, match="MEMORY_BUDGET"):
        engine.evaluate_extension(manifest(make_tree(42)), bars([float(i) for i in range(10_000)]))
    with pytest.raises(ValueError, match="OPERATION_BUDGET"):
        engine.evaluate_extension(manifest(make_tree(32)), bars([float(i) for i in range(8_000)]))
    with pytest.raises(ValueError, match="BAR_LIMIT"):
        engine.evaluate_extension(manifest(), bars([1] * (engine.MAX_BARS + 1)))


def test_evaluator_checks_monotonic_deadline_and_returns_no_partial_series():
    engine = api()
    reads = iter([0.0, 1.0])
    with pytest.raises(ValueError, match="TIME_BUDGET"):
        engine.evaluate_extension(manifest(), bars([1] * 100), monotonic=lambda: next(reads))
