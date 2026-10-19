"""Read-only live acceptance for the new-entry pending-order preview."""

import sys
import json
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path
from types import SimpleNamespace

import MetaTrader5 as mt5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import account_gateway as gateway
from app import _trade_ticket_preview_service, _trade_ticket_previews


DEMO_ACCOUNTS = ("titan", "xau5m_m5", "titan_m5", "xau5m_500")


def main():
    # This smoke validates the real broker read/calculation path only. Make an
    # accidental order-send call fail before attaching to any terminal.
    original_order_send = mt5.order_send

    def blocked_order_send(*_args, **_kwargs):
        raise AssertionError("order_send is forbidden in preview acceptance")

    mt5.order_send = blocked_order_send
    results = []
    try:
        for alias in DEMO_ACCOUNTS:
            config = gateway.ACCOUNTS[alias]
            symbol = config["symbol"]
            with gateway.session(mt5, alias) as spec:
                gateway.verify_identity(mt5, spec)
                info = mt5.symbol_info(symbol)
                tick = mt5.symbol_info_tick(symbol)
                assert info and tick and tick.bid > 0 and tick.ask >= tick.bid
                assert info.trade_tick_size > 0

                step = Decimal(str(info.trade_tick_size))
                point = Decimal(str(info.point))
                stops = max(
                    int(info.trade_stops_level or 0),
                    int(info.trade_freeze_level or 0),
                )
                distance = max(Decimal("10"), point * stops + Decimal("5"))
                ask = Decimal(str(tick.ask))
                entry = ((ask - distance) / step).to_integral_value(
                    rounding=ROUND_FLOOR
                ) * step
                assert entry > distance
                request = SimpleNamespace(
                    account=alias,
                    symbol=symbol,
                    orderType="BUY_LIMIT",
                    volumeLots=0.01,
                    entryPrice=float(entry),
                    slPrice=float(entry - distance),
                    tpPrice=float(entry + distance),
                )
                result = _trade_ticket_preview_service.preview(
                    request,
                    ("local-readonly-smoke", "demo-operator", "trade"),
                    "127.0.0.1",
                )
                assert result["account"] == alias
                assert result["symbol"] == symbol
                assert result["status"] == "PREVIEW_ONLY"
                assert result["canExecute"] is False
                assert result["canCommit"] is False
                assert result["guard"] == {"state": "UNKNOWN", "source": "NONE"}
                assert "previewId" not in result
                assert result["brokerRisk"]["margin"] >= 0
                assert result["brokerRisk"]["pnlAtSl"] < 0
                assert result["brokerRisk"]["pnlAtTp"] > 0
                results.append(
                    {
                        "account": alias,
                        "outcome": "PASSED",
                        "quote": "FRESH",
                        "brokerMath": "VALID",
                        "status": result["status"],
                        "canExecute": False,
                        "canCommit": False,
                        "orderSend": "BLOCKED",
                    }
                )

        assert tuple(item["account"] for item in results) == DEMO_ACCOUNTS
        assert not _trade_ticket_previews.items, "Preview-only guard issued a commit token"
    finally:
        mt5.order_send = original_order_send
        mt5.shutdown()

    print(
        json.dumps(
            {
                "results": results,
                "brokerWrites": 0,
                "blueberryQueried": False,
                "commitTokensIssued": len(_trade_ticket_previews.items),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
