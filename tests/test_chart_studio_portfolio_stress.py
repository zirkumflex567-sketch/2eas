from datetime import datetime, timezone

from chart_studio.portfolio_stress import historical_portfolio_stress


ACCOUNT = "titan"


def bars(symbol, prices):
    return {
        "source": "MT5_VERIFIED",
        "account": ACCOUNT,
        "symbol": symbol,
        "timeframe": "H1",
        "bars": [
            {"time": 1_792_400_000 + index * 3600, "close": price}
            for index, price in enumerate(prices)
        ],
    }


def quote(symbol, bid, ask):
    return {
        "source": "MT5_VERIFIED",
        "account": ACCOUNT,
        "symbol": symbol,
        "bid": bid,
        "ask": ask,
        "fresh": True,
        "timeUtc": datetime(2026, 10, 22, tzinfo=timezone.utc).isoformat(),
    }


def test_historical_joint_shocks_revalue_existing_and_proposed_positions_together():
    prices_a = [100 + index for index in range(62)]
    prices_b = [200 + index * 2 for index in range(62)]
    calls = []

    def calc_profit(side, symbol, volume, opened, closed):
        calls.append((side, symbol, volume, opened, closed))
        direction = 1 if side == "BUY" else -1
        return direction * (closed - opened) * volume * 100

    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[{"account": ACCOUNT, "symbol": "EURUSD", "side": "SELL", "volume": 0.2}],
        histories={"EURUSD": bars("EURUSD", prices_a), "XAUUSD": bars("XAUUSD", prices_b)},
        quotes={"EURUSD": quote("EURUSD", 199.99, 200.01),
                "XAUUSD": quote("XAUUSD", 99.99, 100.01)},
        order_calc_profit=calc_profit,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "AVAILABLE"
    assert result["source"] == "HISTORICAL_ALIGNED_H1_SHOCKS"
    assert result["scenarioSymbol"] == "XAUUSD"
    assert result["portfolioSymbols"] == ["EURUSD"]
    assert result["currency"] == "USD"
    assert result["sampleCount"] == 61
    assert result["canExecute"] is False
    assert result["loss"]["worst"] > 0
    assert len(calls) == result["sampleCount"] * 2
    assert {call[1] for call in calls} == {"EURUSD", "XAUUSD"}


def test_historical_joint_shocks_fail_closed_for_scope_mismatch():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[{"account": ACCOUNT, "symbol": "EURUSD", "side": "SELL", "volume": 0.2}],
        histories={"EURUSD": bars("EURUSD", [100 + i for i in range(62)]),
                   "XAUUSD": bars("XAUUSD", [200 + 2 * i for i in range(62)])},
        quotes={"EURUSD": quote("EURUSD", 199.99, 200.01) | {"account": "titan_m5"},
                "XAUUSD": quote("XAUUSD", 99.99, 100.01)},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "QUOTE_SCOPE_MISMATCH"
    assert result["canExecute"] is False
    assert "loss" not in result


def test_historical_joint_shocks_fail_closed_when_common_history_is_short():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[{"account": ACCOUNT, "symbol": "EURUSD", "side": "SELL", "volume": 0.2}],
        histories={"EURUSD": bars("EURUSD", [100 + i for i in range(62)]),
                   "XAUUSD": bars("XAUUSD", [200 + 2 * i for i in range(10)])},
        quotes={"EURUSD": quote("EURUSD", 199.99, 200.01),
                "XAUUSD": quote("XAUUSD", 99.99, 100.01)},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "INSUFFICIENT_ALIGNED_HISTORY"
    assert result["canExecute"] is False


def test_historical_joint_shocks_fail_closed_for_stale_required_quote():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[],
        histories={"XAUUSD": bars("XAUUSD", [100 + i for i in range(62)])},
        quotes={"XAUUSD": quote("XAUUSD", 99.99, 100.01) | {"fresh": False}},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "QUOTE_NOT_FRESH"
    assert "pnl" not in result


def test_historical_joint_shocks_require_fresh_quote_timestamp_within_asof():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[],
        histories={"XAUUSD": bars("XAUUSD", [100 + i for i in range(62)])},
        quotes={"XAUUSD": quote("XAUUSD", 99.99, 100.01) | {"timeUtc": "2026-10-22T00:00:01Z"}},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "QUOTE_AFTER_AS_OF"
    assert "loss" not in result


def test_historical_joint_shocks_rejects_missing_quote_timestamp():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[],
        histories={"XAUUSD": bars("XAUUSD", [100 + i for i in range(62)])},
        quotes={"XAUUSD": quote("XAUUSD", 99.99, 100.01) | {"timeUtc": None}},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "QUOTE_TIME_INVALID"


def test_historical_joint_shocks_fail_closed_if_broker_repricing_fails():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[],
        histories={"XAUUSD": bars("XAUUSD", [100 + i for i in range(62)])},
        quotes={"XAUUSD": quote("XAUUSD", 99.99, 100.01)},
        order_calc_profit=lambda *args: None,
        as_of_utc="2026-10-22T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "BROKER_CALCULATION_UNAVAILABLE"
    assert "loss" not in result


def test_historical_joint_shocks_rejects_invalid_asof_timestamp():
    result = historical_portfolio_stress(
        account=ACCOUNT,
        currency="USD",
        scenario={"symbol": "XAUUSD", "side": "BUY", "volume": 0.1, "entry": 100},
        positions=[],
        histories={"XAUUSD": bars("XAUUSD", [100 + i for i in range(62)])},
        quotes={"XAUUSD": quote("XAUUSD", 99.99, 100.01)},
        order_calc_profit=lambda *args: 0,
        as_of_utc="2026-99-99T00:00:00Z",
    )

    assert result["state"] == "UNAVAILABLE"
    assert result["reason"] == "AS_OF_INVALID"

\n