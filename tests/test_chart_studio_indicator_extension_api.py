import asyncio
import base64
import importlib.util
import json
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def api():
    assert importlib.util.find_spec("chart_studio.indicator_extension_api"), "indicator preview route is missing"
    return importlib.import_module("chart_studio.indicator_extension_api")


def signed_package():
    from chart_studio import indicator_extensions

    private = Ed25519PrivateKey.generate()
    public = private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    manifest = {
        "id": "close-copy",
        "version": "1.0.0",
        "name": "Close copy",
        "parameters": [],
        "expression": {"source": "close"},
    }
    package = indicator_extensions.export_signed_package(
        manifest, key_id="test-key", private_key=private
    ).decode("utf-8")
    trusted = {"test-key": base64.b64encode(public).decode("ascii")}
    return package, trusted, public


def request_body(package, **overrides):
    body = {
        "account": "titan",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "package": package,
        "parameters": {},
        "bars": [
            {"time": 1, "open": 10, "high": 12, "low": 9, "close": 11},
            {"time": 2, "open": 11, "high": 13, "low": 10, "close": 12},
        ],
    }
    body.update(overrides)
    return body


def client(trusted_keys):
    app = FastAPI()
    api().install_indicator_extension_routes(app, trusted_keys_provider=lambda: trusted_keys)
    return TestClient(app)


def test_environment_trust_provider_reads_bounded_unique_host_map(monkeypatch):
    trusted = {"runtime-key": base64.b64encode(bytes(range(32))).decode("ascii")}
    monkeypatch.setenv("CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON", json.dumps(trusted))
    assert api()._trusted_keys_from_environment() == trusted

    monkeypatch.setenv("CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON",
                       '{"runtime-key":"' + trusted["runtime-key"] + '","runtime-key":"' + trusted["runtime-key"] + '"}')
    assert api()._trusted_keys_from_environment() is None

    monkeypatch.setenv("CHART_STUDIO_INDICATOR_TRUSTED_KEYS_JSON", "x" * 16_385)
    assert api()._trusted_keys_from_environment() is None


def test_preview_verifies_package_and_returns_aligned_caller_supplied_series_without_storage():
    package, trusted, _ = signed_package()
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(package)
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "account": "titan",
        "symbol": "XAUUSD",
        "timeframe": "M15",
        "indicator": {"id": "close-copy", "version": "1.0.0", "name": "Close copy"},
        "source": "CALLER_SUPPLIED_BARS",
        "canExecute": False,
        "series": [{"time": 1, "value": 11.0}, {"time": 2, "value": 12.0}],
    }


def test_preview_accepts_marketplace_demo_account():
    package, trusted, _ = signed_package()
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview",
        json=request_body(package, account="goldm15"),
    )
    assert response.status_code == 200
    assert response.json()["account"] == "goldm15"
    assert response.json()["canExecute"] is False


def test_preview_evaluation_runs_outside_the_asgi_event_loop(monkeypatch):
    package, trusted, _ = signed_package()
    extension_api = api()
    original = extension_api.evaluate_extension
    observed = {}

    def assert_worker(manifest, bars, parameters):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            observed["outside_event_loop"] = True
        else:
            observed["outside_event_loop"] = False
        return original(manifest, bars, parameters)

    monkeypatch.setattr(extension_api, "evaluate_extension", assert_worker)
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(package)
    )
    assert response.status_code == 200
    assert observed["outside_event_loop"] is True


def test_preview_rejects_evaluations_over_the_concurrency_limit(monkeypatch):
    package, trusted, _ = signed_package()
    extension_api = api()
    original = extension_api.evaluate_extension
    both_started = threading.Event()
    release = threading.Event()
    lock = threading.Lock()
    active = 0

    def hold_two(manifest, bars, parameters):
        nonlocal active
        with lock:
            active += 1
            if active == 2:
                both_started.set()
        try:
            assert release.wait(5), "test did not release blocked evaluations"
            return original(manifest, bars, parameters)
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(extension_api, "evaluate_extension", hold_two)
    test_client = client(trusted)
    body = request_body(package)
    try:
        with ThreadPoolExecutor(max_workers=3) as pool:
            first = pool.submit(test_client.post, "/api/chart/v1/indicator-extensions/preview", json=body)
            second = pool.submit(test_client.post, "/api/chart/v1/indicator-extensions/preview", json=body)
            assert both_started.wait(5), "two evaluations did not start"
            third = pool.submit(test_client.post, "/api/chart/v1/indicator-extensions/preview", json=body)
            rejected = third.result(timeout=5)
            assert rejected.status_code == 503
            assert rejected.json()["detail"]["code"] == "EVALUATION_CAPACITY"
            release.set()
            assert first.result(timeout=5).status_code == 200
            assert second.result(timeout=5).status_code == 200
    finally:
        release.set()


def test_preview_fails_closed_without_host_trust_keys_and_on_unknown_signer():
    package, trusted, public = signed_package()
    missing = client(None).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(package)
    )
    assert missing.status_code == 503
    assert missing.json()["detail"]["code"] == "TRUST_STORE_UNAVAILABLE"

    untrusted = client({"other-key": base64.b64encode(public).decode("ascii")}).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(package)
    )
    assert untrusted.status_code == 422
    assert untrusted.json()["detail"]["code"] == "UNTRUSTED_SIGNER"


def test_preview_rejects_bad_signature_and_never_reads_protected_account():
    package, trusted, _ = signed_package()
    envelope = json.loads(package)
    envelope["manifest"]["name"] = "tampered"
    bad = json.dumps(envelope, sort_keys=True, separators=(",", ":"))
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(bad)
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"INVALID_SIGNATURE", "NONCANONICAL_PACKAGE"}

    protected = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview",
        json=request_body(package, account="blueberry"),
    )
    assert protected.status_code == 403


@pytest.mark.parametrize("overrides", [
    {"symbol": "EURUSD"},
    {"timeframe": "H12"},
    {"canExecute": True},
    {"parameters": {"unknown": 1}},
    {"bars": [{"time": 1, "open": 10, "high": 9, "low": 8, "close": 10}]},
])
def test_preview_rejects_unknown_scope_fields_and_invalid_chart_data(overrides):
    package, trusted, _ = signed_package()
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview", json=request_body(package, **overrides)
    )
    assert response.status_code == 422


def test_preview_rejects_duplicate_outer_json_keys_and_oversized_body():
    package, trusted, _ = signed_package()
    duplicate = json.dumps(request_body(package), separators=(",", ":"))
    duplicate = duplicate.replace('"account":"titan"', '"account":"titan","account":"titan"', 1)
    response = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview",
        content=duplicate,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "DUPLICATE_JSON_KEY"

    too_large = client(trusted).post(
        "/api/chart/v1/indicator-extensions/preview",
        content=b" " * (1_200_000 + 1),
        headers={"Content-Type": "application/json"},
    )
    assert too_large.status_code == 413
