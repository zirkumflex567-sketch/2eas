import json
import os
import sqlite3
import time
from collections import deque
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from chart_studio.mutation_audit import MutationAuditStore


SECRET = "device-sync-proxy-secret-0123456789abcdef"
HOST = "sync.example.test"
ENVELOPE = {
    "formatVersion": 1,
    "nonce": "AAAAAAAAAAAAAAAA",
    "ciphertext": "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
}


def proxy_headers(user="designer", **overrides):
    values = {
        "X-Dashboard-Proxy-Secret": SECRET,
        "X-Dashboard-User": user,
        "X-Forwarded-Proto": "https",
        "Origin": "https://" + HOST,
    }
    values.update(overrides)
    return values


@pytest.fixture
def sync_client(monkeypatch, tmp_path):
    monkeypatch.setenv("DASHBOARD_PROXY_SECRET", SECRET)
    monkeypatch.setenv("DASHBOARD_PROXY_USERS", json.dumps({
        "reader": "read", "designer": "layout", "operator": "trade",
    }))
    monkeypatch.setenv("DASHBOARD_ALLOWED_HOSTS", HOST)
    monkeypatch.setenv("CHART_STUDIO_DEVICE_SYNC_ENABLED", "1")
    monkeypatch.setenv("CHART_STUDIO_DB", str(tmp_path / "private" / "chart.sqlite3"))
    monkeypatch.setenv("DASHBOARD_PROXY_PREFIX", "/stt")
    import app

    app._chart_store_at.cache_clear()
    audit_store = MutationAuditStore(
        tmp_path / "private" / "mutations.sqlite",
        checkout_root=Path(app.__file__).resolve().parent,
        allowed_accounts=app.app.state.mutation_audit_store.allowed_accounts,
    )
    app.app.state.mutation_audit_store = audit_store
    client = TestClient(app.app, base_url="https://" + HOST,
                        client=("127.0.0.1", 4321))
    yield app, client
    client.close()
    app._chart_store_at.cache_clear()


def test_device_sync_requires_encrypted_envelope_and_keeps_immutable_history(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    body = {"account": "titan", "symbol": "XAUUSD", "expectedRevision": 0,
            **ENVELOPE}

    saved = client.put(url, json=body, headers=proxy_headers())
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    body.update(expectedRevision=1, ciphertext="AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI")
    second = client.put(url, json=body, headers=proxy_headers())
    assert second.status_code == 200
    assert second.json()["revision"] == 2

    history = client.get(url + "/history?account=titan&symbol=XAUUSD",
                         headers=proxy_headers())
    assert history.status_code == 200
    assert [item["revision"] for item in history.json()["items"]] == [2, 1]
    assert history.json()["items"][1]["ciphertext"] == ENVELOPE["ciphertext"]

    stale = client.put(url, json={**body, "expectedRevision": 1},
                       headers=proxy_headers())
    assert stale.status_code == 409
    assert stale.json()["detail"]["currentRevision"] == 2

    with open(Path(os.environ["CHART_STUDIO_DB"]), "rb") as db:
        assert b"plaintext layout fixture" not in db.read()
    with sqlite3.connect(os.environ["CHART_STUDIO_DB"]) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(chart_device_sync_revision)")}
    assert {"ciphertext", "nonce", "format_version"}.issubset(columns)
    assert "document" not in columns


def test_sync_history_is_bounded_to_last_ten_immutable_revisions(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    for revision in range(12):
        saved = client.put(url, json={
            "account": "titan", "symbol": "XAUUSD", "expectedRevision": revision,
            **ENVELOPE,
        }, headers=proxy_headers())
        assert saved.status_code == 200
        assert saved.json()["revision"] == revision + 1
    history = client.get(url + "/history?account=titan&symbol=XAUUSD",
                         headers=proxy_headers())
    assert [item["revision"] for item in history.json()["items"]] == list(range(12, 2, -1))


def test_server_preserves_unknown_client_formats_as_ciphertext(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    body = {"account": "titan", "symbol": "XAUUSD", "expectedRevision": 0,
            **{**ENVELOPE, "formatVersion": 2}}
    saved = client.put(url, json=body, headers=proxy_headers())
    assert saved.status_code == 200
    assert saved.json()["formatVersion"] == 2
    history = client.get(url + "/history?account=titan&symbol=XAUUSD",
                         headers=proxy_headers())
    assert history.status_code == 200
    assert history.json()["items"][0]["ciphertext"] == ENVELOPE["ciphertext"]


def test_local_identity_and_disabled_feature_cannot_access_sync(sync_client, monkeypatch):
    app, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456?account=titan&symbol=XAUUSD"
    assert client.get(url).status_code == 403
    monkeypatch.setenv("CHART_STUDIO_DEVICE_SYNC_ENABLED", "0")
    assert client.get(url, headers=proxy_headers()).status_code == 503


def test_device_sync_write_rate_is_bounded_per_proxy_user(sync_client):
    app, client = sync_client
    key = "designer"
    with app._device_sync_write_lock:
        previous = app._device_sync_writes.get(key)
        app._device_sync_writes[key] = deque([time.monotonic()] * 30)
    try:
        response = client.put("/api/chart/v1/device-sync/bundle_1234567890123456", json={
            "account": "titan", "symbol": "XAUUSD", "expectedRevision": 0, **ENVELOPE,
        }, headers=proxy_headers(key))
        assert response.status_code == 429
    finally:
        with app._device_sync_write_lock:
            if previous is None:
                app._device_sync_writes.pop(key, None)
            else:
                app._device_sync_writes[key] = previous


def test_sync_isolated_by_proxy_user_account_and_symbol(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    saved = client.put(url, json={
        "account": "titan", "symbol": "XAUUSD", "expectedRevision": 0, **ENVELOPE,
    }, headers=proxy_headers("designer"))
    assert saved.status_code == 200

    assert client.get(url + "?account=titan&symbol=XAUUSD",
                      headers=proxy_headers("operator")).status_code == 404
    assert client.get(url + "?account=xau5m_m5&symbol=XAUUSD",
                      headers=proxy_headers("designer")).status_code == 404
    assert client.get(url + "?account=titan&symbol=XAUUSD.R",
                      headers=proxy_headers("designer")).status_code == 404


def test_read_role_cannot_write_and_plaintext_payload_is_rejected(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    body = {"account": "titan", "symbol": "XAUUSD", "expectedRevision": 0,
            **ENVELOPE}
    assert client.put(url, json=body, headers=proxy_headers("reader")).status_code == 403

    plaintext = {**body, "document": {"drawings": [], "options": {}}}
    assert client.put(url, json=plaintext, headers=proxy_headers()).status_code == 422


def test_sync_write_rejects_foreign_origin_and_non_same_site(sync_client):
    _, client = sync_client
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    body = {"account": "titan", "symbol": "XAUUSD", "expectedRevision": 0,
            **ENVELOPE}
    assert client.put(url, json=body, headers=proxy_headers(
        Origin="https://evil.example")).status_code == 403
    assert client.put(url, json=body, headers=proxy_headers(
        Origin="https://[")).status_code == 403
    assert client.put(url, json=body, headers=proxy_headers(
        **{"Sec-Fetch-Site": "cross-site"})).status_code == 403


def test_two_authenticated_devices_share_revisions_and_detect_concurrent_edits(sync_client):
    app, first_device = sync_client
    second_device = TestClient(app.app, base_url="https://" + HOST,
                               client=("127.0.0.1", 54323))
    url = "/api/chart/v1/device-sync/bundle_1234567890123456"
    scope = "?account=titan&symbol=XAUUSD"
    try:
        initial = first_device.put(url, json={
            "account": "titan", "symbol": "XAUUSD", "expectedRevision": 0,
            **ENVELOPE,
        }, headers=proxy_headers())
        assert initial.status_code == 200
        assert initial.json()["revision"] == 1

        remote = second_device.get(url + scope, headers=proxy_headers())
        assert remote.status_code == 200
        assert remote.json()["revision"] == 1
        assert remote.json()["ciphertext"] == ENVELOPE["ciphertext"]

        newer_ciphertext = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI"
        second = second_device.put(url, json={
            "account": "titan", "symbol": "XAUUSD", "expectedRevision": 1,
            **{**ENVELOPE, "ciphertext": newer_ciphertext},
        }, headers=proxy_headers())
        assert second.status_code == 200
        assert second.json()["revision"] == 2

        stale = first_device.put(url, json={
            "account": "titan", "symbol": "XAUUSD", "expectedRevision": 1,
            **ENVELOPE,
        }, headers=proxy_headers())
        assert stale.status_code == 409
        assert stale.json()["detail"]["currentRevision"] == 2

        latest = first_device.get(url + scope, headers=proxy_headers())
        assert latest.status_code == 200
        assert latest.json()["revision"] == 2
        assert latest.json()["ciphertext"] == newer_ciphertext
    finally:
        second_device.close()
