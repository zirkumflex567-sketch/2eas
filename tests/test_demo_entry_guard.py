from types import SimpleNamespace

import account_gateway
from chart_studio.demo_entry_guard import DemoEntryGuard


class FakeMT5:
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TYPE_BUY_STOP = 4
    ORDER_TYPE_SELL_STOP = 5
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1

    def __init__(self):
        self.profit_calls = []
        self.margin_calls = []

    def order_calc_profit(self, side, symbol, volume, entry, close):
        self.profit_calls.append((side, symbol, volume, entry, close))
        direction = 1 if side == self.ORDER_TYPE_BUY else -1
        return (close - entry) * direction * volume * 100

    def order_calc_margin(self, side, symbol, volume, entry):
        self.margin_calls.append((side, symbol, volume, entry))
        return 20


def setup_guard(monkeypatch, account="titan", **changes):
    spec = {
        "id": account,
        "symbol": "XAUUSD" if account == "titan" else "XAUUSD.p",
        "login": 123456,
        "server": "Broker-Demo",
        "terminal": r"C:\demo\terminal64.exe",
        "is_demo": True,
        "challenge_protection": False,
    }
    spec.update(changes)
    monkeypatch.setitem(account_gateway.ACCOUNTS, account, dict(spec))
    mt5 = FakeMT5()
    guard = DemoEntryGuard(mt5)
    account_info = SimpleNamespace(currency="USD", equity=1000, margin_free=500)
    order = {
        "symbol": spec["symbol"],
        "type": mt5.ORDER_TYPE_BUY_LIMIT,
        "volume": 0.01,
        "price": 4144.0,
        "sl": 4143.0,
        "tp": 4145.0,
    }
    return guard, spec, account_info, order, mt5


def test_allows_only_small_protected_pending_orders_on_verified_demo_accounts(monkeypatch):
    guard, spec, account_info, order, _ = setup_guard(monkeypatch)

    result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )

    assert result == {
        "state": "ALLOW", "source": "NON_CHALLENGE_DEMO_ENTRY_POLICY",
        "hardLock": False, "code": "DEMO_ENTRY_WITHIN_LIMITS",
    }


def test_challenge_protected_blueberry_is_denied_before_broker_risk_calculation(monkeypatch):
    guard, spec, account_info, order, mt5 = setup_guard(
        monkeypatch, account="blueberry", symbol="XAUUSD",
        challenge_protection=True,
    )
    order["symbol"] = "XAUUSD"

    result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol="XAUUSD", order=order,
    )

    assert result["state"] == "BLOCK"
    assert result["hardLock"] is True
    assert mt5.profit_calls == []
    assert mt5.margin_calls == []


def test_blocks_order_over_fixed_lot_cap_and_stop_risk_limit(monkeypatch):
    guard, spec, account_info, order, _ = setup_guard(monkeypatch)
    order["volume"] = 0.02
    lot_result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )
    order["volume"] = 0.01
    order["sl"] = 4138.0
    risk_result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )

    assert lot_result["state"] == "BLOCK"
    assert risk_result["state"] == "BLOCK"


def test_blocks_mismatched_identity_unknown_currency_and_insufficient_margin(monkeypatch):
    guard, spec, account_info, order, _ = setup_guard(monkeypatch)
    mismatched = dict(spec, login=spec["login"] + 1)
    mismatch_result = guard.evaluate(
        spec=mismatched, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )
    account_info.currency = "EUR"
    currency_result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )
    account_info.currency = "USD"
    account_info.margin_free = 30
    margin_result = guard.evaluate(
        spec=spec, accountInfo=account_info, action="NEW_PENDING_ENTRY",
        riskIncreasing=True, symbol=spec["symbol"], order=order,
    )

    assert mismatch_result["state"] == "BLOCK"
    assert currency_result["state"] == "BLOCK"
    assert margin_result["state"] == "BLOCK"
