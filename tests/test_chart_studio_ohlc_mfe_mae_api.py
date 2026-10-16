from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from chart_studio import evidence_models
from chart_studio.evidence_api import install_evidence_routes
from dashboard_security import install_control_security


def _deal(ticket, kind, time, side, price):
    return {"type": "LIFECYCLE", "id": f"mt5_deal_{ticket}", "provenance": "RECORDED",
            "payload": {"accountId": "titan", "positionIdentifier": "9001", "dealTicket": ticket,
                        "dealEntry": kind, "dealSide": side, "price": price, "asOfUtc": time}}


def _snapshot(kind, ticket, time, bars):
    digest = sha256(evidence_models.canonical_bytes(bars)).hexdigest()
    return {"type": "SNAPSHOT", "id": f"snap_{kind.lower()}_{ticket}", "provenance": "RECORDED",
            "payload": {"accountId": "titan", "positionIdentifier": "9001", "dealTicket": ticket,
                        "captureType": kind, "asOfUtc": time,
                        "chartView": {"symbol": "XAUUSD", "timeframe": "M15"},
                        "lifecycleEventIds": [{"type": "LIFECYCLE", "id": f"mt5_deal_{ticket}"}],
                        "marketData": {"source": "MT5_COMPLETED_BARS", "bars": bars, "sha256": digest}}}


def _fixture_store():
    entry_time, exit_time = "2026-10-14T10:00:00Z", "2026-10-14T10:45:00Z"
    bars = []
    for minute, high, low, opening, close in ((0, "102", "99", "100", "101"),
                                               (15, "105", "100", "101", "104"),
                                               (30, "104", "98", "104", "100")):
        bars.append({"timeUtc": f"2026-10-14T10:{minute:02}:00Z", "open": opening,
                     "high": high, "low": low, "close": close,
                     "tickVolume": 100, "spread": 2, "realVolume": 0})
    return {
        "LIFECYCLE": [_deal("5001", "IN", entry_time, "BUY", "101"),
                      _deal("5002", "OUT", exit_time, "SELL", "100")],
        "SNAPSHOT": [_snapshot("ENTRY", "5001", entry_time, bars[:1]),
                     _snapshot("EXIT", "5002", exit_time, bars)],
    }


class Store:
    root = Path("private-test-root")

    def __init__(self, *, has_more=False, fail=False):
        self.records = _fixture_store()
        self.has_more = has_more
        self.fail = fail
        self.calls = []

    def gaps(self, _account=None):
        return []

    def read(self, context, *, kind, filters=None, limit=200, **kwargs):
        self.calls.append((context.account_id, kind, filters, limit, kwargs))
        if self.fail:
            from chart_studio.evidence_store import StoreUnavailable
            raise StoreUnavailable()
        return {"records": self.records[kind], "hasMore": self.has_more}


def _client(store, mt5=None):
    app = FastAPI()
    install_control_security(app)
    install_evidence_routes(app, store=store, mt5=mt5)
    return TestClient(app)


class TickMT5:
    COPY_TICKS_INFO = 1

    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def copy_ticks_range(self, symbol, start, stop, flags):
        self.calls.append((symbol, start, stop, flags))
        return self.rows


def test_position_mfe_mae_get_is_authenticated_account_scoped_and_read_only():
    store = Store()
    client = _client(store)

    unauthenticated_app = FastAPI()
    install_evidence_routes(unauthenticated_app, store=Store())
    denied = TestClient(unauthenticated_app).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                                params={"account": "titan"})
    assert denied.status_code == 403
    result = client.get("/api/chart/v1/lifecycle/positions/9001/mfe-mae", params={"account": "titan"})

    assert result.status_code == 200
    assert result.json()["canExecute"] is False
    assert result.json()["result"]["quality"] == "OHLC_ESTIMATE"
    assert result.json()["result"]["mfePriceDistance"] == "4"
    assert [call[1] for call in store.calls] == ["LIFECYCLE", "SNAPSHOT"]
    assert all(call[0] == "titan" and call[2] == {"position_id": "9001"} and call[3] == 201 for call in store.calls)
    assert client.post("/api/chart/v1/lifecycle/positions/9001/mfe-mae", params={"account": "titan"}).status_code == 405


def test_position_mfe_mae_denies_challenge_and_unknown_accounts():
    store = Store()
    client = _client(store)

    challenge = client.get("/api/chart/v1/lifecycle/positions/9001/mfe-mae", params={"account": "blueberry"})
    unknown = client.get("/api/chart/v1/lifecycle/positions/9001/mfe-mae", params={"account": "missing"})

    assert challenge.status_code == 403
    assert unknown.status_code == 400
    assert store.calls == []


def test_position_mfe_mae_fails_closed_on_history_limit_or_store_error():
    limited = _client(Store(has_more=True)).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                                params={"account": "titan"})
    failed = _client(Store(fail=True)).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                           params={"account": "titan"})

    assert limited.status_code == 200
    assert limited.json()["result"] == {"status": "UNAVAILABLE", "reason": "POSITION_HISTORY_LIMIT"}
    assert failed.status_code == 503


def test_position_mfe_mae_adds_scoped_observed_mt5_ticks(monkeypatch):
    entry_ms = int(datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc).timestamp() * 1000)
    rows = [
        {"time_msc": entry_ms + 1, "bid": 103.0, "ask": 103.1},
        {"time_msc": entry_ms + 2, "bid": 99.0, "ask": 99.1},
    ]
    mt5 = TickMT5(rows)

    @contextmanager
    def verified_demo_session(_mt5, account):
        assert account == "titan"
        yield evidence_models.gateway.ACCOUNTS[account]

    monkeypatch.setattr(evidence_models.gateway, "traced_session", verified_demo_session)
    response = _client(Store(), mt5).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                        params={"account": "titan"})

    assert response.status_code == 200
    result = response.json()["result"]["tickObservation"]
    assert result["status"] == "AVAILABLE"
    assert result["quality"] == "TICK_OBSERVED"
    assert result["coverage"] == "MT5_RETURNED_TICKS_ONLY"
    assert result["exact"] is False
    assert (result["mfePriceDistance"], result["maePriceDistance"]) == ("2", "2")
    assert mt5.calls[0][0] == "XAUUSD"
    assert mt5.calls[0][3] == mt5.COPY_TICKS_INFO
    assert mt5.calls[0][1].tzinfo is timezone.utc and mt5.calls[0][2].tzinfo is timezone.utc


def test_position_mfe_mae_can_observe_ticks_when_no_complete_ohlc_candles_exist(monkeypatch):
    store = Store()
    # Retain valid, deal-linked snapshots but provide no candle fully inside the position.
    outside = [{"timeUtc": "2026-10-14T09:45:00Z", "open": "100", "high": "102",
                "low": "99", "close": "101", "tickVolume": 100, "spread": 2, "realVolume": 0}]
    for snapshot in store.records["SNAPSHOT"]:
        snapshot["payload"]["marketData"] = {
            "source": "MT5_COMPLETED_BARS", "bars": outside,
            "sha256": sha256(evidence_models.canonical_bytes(outside)).hexdigest(),
        }

    entry_ms = int(datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc).timestamp() * 1000)
    rows = [
        {"time_msc": entry_ms + 1, "bid": 103.0, "ask": 103.1},
        {"time_msc": entry_ms + 2, "bid": 99.0, "ask": 99.1},
    ]
    mt5 = TickMT5(rows)

    @contextmanager
    def verified_demo_session(_mt5, account):
        assert account == "titan"
        yield evidence_models.gateway.ACCOUNTS[account]

    monkeypatch.setattr(evidence_models.gateway, "traced_session", verified_demo_session)
    response = _client(store, mt5).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                      params={"account": "titan"})

    assert response.status_code == 200
    body = response.json()["result"]
    assert body["status"] == "UNAVAILABLE"
    assert body["reason"] == "NO_COMPLETE_CANDLES"
    assert body["tickObservation"]["status"] == "AVAILABLE"
    assert body["tickObservation"]["quality"] == "TICK_OBSERVED"
    assert body["tickObservation"]["exact"] is False
    assert body["tickObservation"]["intrabarOrder"] == "UNKNOWN"
    assert mt5.calls[0][0] == "XAUUSD"


def test_position_mfe_mae_does_not_fetch_ticks_for_challenge_account():
    mt5 = TickMT5([])
    response = _client(Store(), mt5).get("/api/chart/v1/lifecycle/positions/9001/mfe-mae",
                                        params={"account": "blueberry"})

    assert response.status_code == 403
    assert mt5.calls == []
