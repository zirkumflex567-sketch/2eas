import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from chart_studio.execution_quality import analyze_execution_quality
from chart_studio.evidence_api import install_evidence_routes
from dashboard_security import install_control_security


def attempt(*, account="titan", symbol="XAUUSD", side="BUY", intended="100", order="91",
           requested="2", quote=None, identity="a" * 64):
    payload = {
        "orderAttemptId": "attempt-1", "brokerTicket": order, "side": side,
        "intendedPrice": intended, "requestedVolume": requested,
        "requestTimeUtc": "2026-10-16T10:00:01Z", "quoteSnapshot": quote or {
            "symbol": symbol, "bid": "99.9", "ask": "100.1", "tickSize": "0.1",
            "tickValuePerLot": "1", "currency": "USD", "quoteTimeUtc": "2026-10-16T10:00:00Z",
            "source": "MT5_VERIFIED", "canExecute": False,
        },
    }
    return {"type": "DECISION", "accountId": account, "terminalIdentityHash": identity,
            "payload": {"eventId": "event-1", "symbol": symbol, "stage": "ORDER_ATTEMPT",
                        "orderAttempt": payload}}


def deal(ticket, price, volume, *, account="titan", symbol="XAUUSD", entry="IN", side="BUY",
         commission="-0.1", fee="-0.02", swap="0", profit="0"):
    return {"type": "LIFECYCLE", "accountId": account,
            "payload": {"id": f"mt5_deal_{ticket}", "orderTicket": "91", "dealTicket": ticket,
                        "symbol": symbol, "source": "MT5_DEAL", "dataQuality": "OBSERVED", "dealEntry": entry,
                        "dealSide": side, "price": price, "volume": volume,
                        "commission": commission, "fee": fee, "swap": swap, "profit": profit}}


def test_buy_execution_uses_exact_order_match_and_separates_spread_slippage_from_cash_costs():
    result = analyze_execution_quality([attempt()], [deal("501", "100.3", "1"), deal("502", "100.2", "1"),
                                        deal("503", "101", "2", entry="OUT", commission="-99", profit="99")],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    row = result["orders"][0]
    assert row["status"] == "AVAILABLE"
    assert row["weightedFillPrice"] == "100.25"
    assert row["spreadPrice"] == "0.2"
    assert row["signedSlippagePrice"] == "0.25"
    assert row["signedSlippageTicks"] == "2.5"
    assert row["estimatedAdverseCost"] == {"amount": "5", "currency": "USD", "source": "CALCULATED_FROM_RECORDED_TICK_VALUE"}
    assert {key: row["brokerCashCosts"][key] for key in ("commission", "fee", "swap", "profit", "entryDealCashSubtotal")} == {
        "commission": "-0.2", "fee": "-0.04", "swap": "0", "profit": "0", "entryDealCashSubtotal": "-0.24"}
    assert row["brokerCashCosts"]["scope"] == "MATCHED_ENTRY_DEALS"
    assert row["brokerCashCosts"]["currency"] is None
    assert row["brokerCashCosts"]["currencyStatus"] == "UNAVAILABLE"
    assert "netPnl" not in row["brokerCashCosts"]
    assert result["summary"]["spreadPlusSlippageAddedToBrokerPnl"] is False


def test_sell_sign_is_adverse_when_fill_is_lower_and_favorable_when_higher():
    adverse = analyze_execution_quality([attempt(side="SELL")], [deal("501", "99.7", "2", side="SELL")],
                                        account_id="titan", symbol="XAUUSD", minimum_samples=1)["orders"][0]
    favorable = analyze_execution_quality([attempt(side="SELL")], [deal("501", "100.3", "2", side="SELL")],
                                          account_id="titan", symbol="XAUUSD", minimum_samples=1)["orders"][0]
    assert adverse["signedSlippagePrice"] == "0.3"
    assert favorable["signedSlippagePrice"] == "-0.3"


def test_missing_intent_or_quote_never_falls_back_to_candle_close_or_current_quote():
    missing_intent = attempt()
    missing_intent["payload"]["orderAttempt"]["orderAttemptId"] = "missing-intent"
    del missing_intent["payload"]["orderAttempt"]["intendedPrice"]
    missing_quote = attempt()
    missing_quote["payload"]["orderAttempt"]["orderAttemptId"] = "missing-quote"
    del missing_quote["payload"]["orderAttempt"]["quoteSnapshot"]
    rows = analyze_execution_quality([missing_intent, missing_quote], [deal("501", "100.3", "1")],
                                     account_id="titan", symbol="XAUUSD", minimum_samples=1)["orders"]
    assert [row["status"] for row in rows] == ["REFERENCE_UNAVAILABLE", "REFERENCE_UNAVAILABLE"]
    assert all(row["signedSlippagePrice"] is None for row in rows)


def test_quote_must_be_verified_and_no_later_than_order_attempt():
    bad_source = attempt(quote={"symbol": "XAUUSD", "bid": "99.9", "ask": "100.1", "tickSize": "0.1",
                                "quoteTimeUtc": "2026-10-16T10:00:00Z", "source": "RECONSTRUCTED", "canExecute": False})
    bad_source["payload"]["orderAttempt"]["orderAttemptId"] = "bad-source"
    future = attempt(); future["payload"]["orderAttempt"]["quoteSnapshot"]["quoteTimeUtc"] = "2026-10-16T10:00:02Z"
    future["payload"]["orderAttempt"]["orderAttemptId"] = "future-quote"
    result = analyze_execution_quality([bad_source, future], [deal("501", "100.3", "1")],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert all(row["status"] == "REFERENCE_UNAVAILABLE" for row in result["orders"])


def test_stale_quote_is_not_used_as_the_historical_order_reference():
    stale = attempt(); stale["payload"]["orderAttempt"]["quoteSnapshot"]["quoteTimeUtc"] = "2026-10-16T09:59:30Z"
    row = analyze_execution_quality([stale], [deal("501", "100.3", "1")],
                                    account_id="titan", symbol="XAUUSD", minimum_samples=1)["orders"][0]
    assert row["status"] == "REFERENCE_UNAVAILABLE"


def test_unmatched_account_symbol_or_order_is_never_joined():
    other_account = deal("601", "100.3", "1", account="xau5m_m5")
    other_symbol = deal("602", "100.3", "1", symbol="EURUSD")
    other_order = deal("603", "100.3", "1") | {"payload": {**deal("603", "100.3", "1")["payload"], "orderTicket": "92"}}
    result = analyze_execution_quality([attempt()], [other_account, other_symbol, other_order],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert result["orders"][0]["status"] == "FILL_NOT_RECORDED"
    assert result["summary"]["matchedDealCount"] == 0


def test_duplicate_deal_ids_are_not_double_counted_and_conflicting_duplicates_fail_closed():
    original = deal("501", "100.3", "1")
    result = analyze_execution_quality([attempt()], [original, original], account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert result["orders"][0]["fillCount"] == 1
    conflict = deal("501", "99", "1")
    result = analyze_execution_quality([attempt()], [original, conflict], account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert result["orders"][0]["status"] == "HISTORY_CONFLICT"


def test_duplicate_order_attempt_events_are_deduplicated_or_fail_closed_on_conflict():
    original = attempt()
    duplicate = {**original, "id": "event-replayed"}
    result = analyze_execution_quality([original, duplicate], [deal("501", "100.3", "2")],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert len(result["orders"]) == 1
    assert result["summary"]["sampleCount"] == 1
    conflicting = attempt(intended="99") | {"id": "event-conflict"}
    result = analyze_execution_quality([original, conflicting], [deal("501", "100.3", "2")],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert len(result["orders"]) == 1
    assert result["orders"][0]["status"] == "CONFLICTING_ATTEMPT_EVENT"
    assert result["summary"]["sampleCount"] == 0


def test_aggregate_percentiles_are_hidden_below_minimum_sample_count():
    attempts = [attempt(order=str(90 + n), requested="1") | {"payload": {**attempt(order=str(90 + n), requested="1")["payload"],
               "orderAttempt": {**attempt(order=str(90 + n), requested="1")["payload"]["orderAttempt"], "brokerTicket": str(90 + n), "orderAttemptId": f"attempt-{n}"}}}
               for n in range(2)]
    deals = [deal(str(500 + n), "100.3", "1") | {"payload": {**deal(str(500 + n), "100.3", "1")["payload"], "orderTicket": str(90 + n)}}
             for n in range(2)]
    result = analyze_execution_quality(attempts, deals, account_id="titan", symbol="XAUUSD", minimum_samples=5)
    assert result["summary"]["sampleCount"] == 2
    assert result["summary"]["percentiles"] is None


def test_partial_fill_is_reported_and_excluded_from_completed_sample_aggregates():
    result = analyze_execution_quality([attempt(requested="2")], [deal("501", "100.3", "1")],
                                       account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert result["orders"][0]["status"] == "PARTIAL_FILL"
    assert result["orders"][0]["weightedFillPrice"] == "100.3"
    assert result["summary"]["sampleCount"] == 0
    assert result["summary"]["percentiles"] is None


def test_overfill_is_flagged_and_exit_deals_are_not_counted_as_entry_execution():
    result = analyze_execution_quality([attempt(requested="1")],
        [deal("501", "100.3", "1", entry="OUT"), deal("502", "100.4", "1.1")],
        account_id="titan", symbol="XAUUSD", minimum_samples=1)
    assert result["orders"][0]["status"] == "OVERFILLED"
    assert result["summary"]["sampleCount"] == 0


def test_grouped_percentiles_identify_unknown_strategy_session_and_regime():
    source = attempt(order="90")
    source["payload"].update(strategyId="titan-1")
    source["payload"]["orderAttempt"].update(sessionId="london", regimeId="trend")
    source2 = attempt(order="91")
    source2["payload"].update(strategyId="titan-1")
    source2["payload"]["orderAttempt"].update(sessionId="london", regimeId="trend", orderAttemptId="attempt-2")
    rows = [deal("501", "100.3", "2") | {"payload": {**deal("501", "100.3", "2")["payload"], "orderTicket": "90"}},
            deal("502", "100.4", "2") | {"payload": {**deal("502", "100.4", "2")["payload"], "orderTicket": "91"}}]
    result = analyze_execution_quality([source, source2], rows, account_id="titan", symbol="XAUUSD", minimum_samples=2)
    group = result["summary"]["groups"][0]
    assert (group["strategyId"], group["sessionId"], group["regimeId"]) == ("titan-1", "london", "trend")
    assert group["sampleCount"] == 2
    assert group["percentiles"] is not None
    assert group["spreadPricePercentiles"] == {"p50": "0.2", "p95": "0.2"}
    assert group["estimatedAdverseCost"] == {"sampleCount": 2, "sum": "14", "currency": "USD"}
    assert group["brokerCashTotals"]["fields"]["commission"] == {"observedCount": 2, "sum": "-0.2", "currency": None}
    assert group["brokerCashTotals"]["scope"] == "MATCHED_ENTRY_DEALS"


def test_limits_and_invalid_parameters_fail_closed():
    with pytest.raises(ValueError):
        analyze_execution_quality([], [], account_id="blueberry", symbol="XAUUSD")
    with pytest.raises(ValueError):
        analyze_execution_quality([attempt()] * 10001, [], account_id="titan", symbol="XAUUSD")
    with pytest.raises(ValueError):
        analyze_execution_quality([], [], account_id="titan", symbol="XAUUSD", minimum_samples=0)


class Store:
    root = "private-test-root"

    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def gaps(self, account=None):
        return []

    def read(self, context, *, kind, **kwargs):
        self.calls.append((context.account_id, kind, kwargs))
        return {"records": self.rows.get(kind, []), "hasMore": False,
                "generation": "generation-1", "pinnedMaxSeq": 10}


def client(store):
    app = FastAPI()
    install_control_security(app)
    install_evidence_routes(app, store=store)
    return TestClient(app)


def test_execution_quality_api_is_authenticated_read_only_scoped_and_demo_only():
    store = Store({"DECISION": [attempt()], "LIFECYCLE": [deal("501", "100.3", "2")]})
    response = client(store).get("/api/chart/v1/decisions/execution-quality", params={
        "account": "titan", "symbol": "XAUUSD", "fromUtc": "2026-10-16T00:00:00Z",
        "toUtc": "2026-10-16T23:59:59Z", "minimumSamples": "1"})
    assert response.status_code == 200
    body = response.json()
    assert body["canExecute"] is False
    assert body["orders"][0]["status"] == "AVAILABLE"
    assert [call[1] for call in store.calls] == ["DECISION", "LIFECYCLE"]
    assert all(call[0] == "titan" for call in store.calls)
    assert client(store).post("/api/chart/v1/decisions/execution-quality").status_code == 405
    denied = client(store).get("/api/chart/v1/decisions/execution-quality", params={
        "account": "blueberry", "symbol": "XAUUSD", "fromUtc": "2026-10-16T00:00:00Z",
        "toUtc": "2026-10-16T23:59:59Z"})
    assert denied.status_code == 403


def test_execution_quality_api_requires_exact_bounded_query():
    store = Store({})
    response = client(store).get("/api/chart/v1/decisions/execution-quality", params={
        "account": "titan", "symbol": "XAUUSD", "fromUtc": "2026-01-01T00:00:00Z",
        "toUtc": "2026-03-01T00:00:00Z"})
    assert response.status_code == 422
    assert store.calls == []
