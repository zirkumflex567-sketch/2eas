import ast
import os
from pathlib import Path
from types import SimpleNamespace
from contextlib import contextmanager
from unittest.mock import MagicMock
from unittest.mock import patch

from bitunix_bridge import BitunixBridge, DEFAULT_CONFIG
from bitunix_client import BitunixClient


ROOT = Path(__file__).resolve().parents[1]


def test_default_configuration_is_disabled_and_excludes_funded_account():
    assert DEFAULT_CONFIG["enabled"] is False
    assert "blueberry" not in DEFAULT_CONFIG["tracked_accounts"]


def test_client_rejects_order_and_close_before_network_by_default():
    client = BitunixClient(api_key="key", secret_key="secret")
    with patch("bitunix_client.requests.post") as post:
        opened = client.place_order(side="BUY", trade_side="OPEN", qty=0.01)
        closed = client.close_all_positions()
    assert opened["code"] == -403
    assert closed["code"] == -403
    post.assert_not_called()


def test_configured_bridge_does_not_scan_or_write_without_process_release_gate(monkeypatch):
    monkeypatch.delenv("BITUNIX_BRIDGE_WRITE_APPROVED", raising=False)
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True})
    with patch("bitunix_bridge.session", side_effect=AssertionError("MT5 session must not start")) as session:
        result = bridge.sync_once(object())
    assert result["status"] == "write_gate_closed"
    session.assert_not_called()


def test_client_rechecks_process_gate_at_request_time(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True})
    monkeypatch.delenv("BITUNIX_BRIDGE_WRITE_APPROVED")
    with patch("bitunix_client.requests.post") as post:
        result = bridge.client.place_order(side="BUY", trade_side="OPEN", qty=0.01)
    assert result["code"] == -403
    post.assert_not_called()


def test_status_does_not_fetch_remote_balances_while_write_gate_is_closed():
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True})
    with patch.object(bridge.client, "get_account") as get_account, \
            patch.object(bridge.client, "get_pending_positions") as get_positions:
        result = bridge.get_status()
    assert result["enabled"] is False
    assert result["write_gate"] == "CLOSED"
    assert "usdt_balance" not in result
    get_account.assert_not_called()
    get_positions.assert_not_called()


def test_bitunix_status_rejects_read_only_identity():
    import app
    request = SimpleNamespace(state=SimpleNamespace(control_identity=("proxy", "reader", "read")))
    with patch.object(app.bitunix_bridge_instance, "get_status") as get_status:
        try:
            app.bitunix_status(request)
        except app.HTTPException as exc:
            assert exc.status_code == 403
        else:
            raise AssertionError("read-only identity must not access private Bitunix status")
    get_status.assert_not_called()


def test_failed_or_unknown_mt5_scan_never_closes_mapped_exchange_trade(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["xau5m_m5"]})
    bridge.state = {"mapped_positions": {"77": {
        "ticket": 77, "source_account": "xau5m_m5", "symbol": "XAUUSDT",
        "side": "BUY", "qty": 0.01,
    }}, "history": [], "last_sync": 0}

    @contextmanager
    def fake_session(_mt5, _account):
        yield {}

    for failure_mode in ("unknown_positions", "positions_exception", "session_exception", "partial_iteration"):
        mt5 = MagicMock()
        if failure_mode == "positions_exception":
            mt5.positions_get.side_effect = RuntimeError("MT5 read failed")
        elif failure_mode == "partial_iteration":
            def partial_positions():
                yield SimpleNamespace(symbol="EURUSD", ticket=1)
                raise RuntimeError("MT5 scan interrupted")
            mt5.positions_get.return_value = partial_positions()
        else:
            mt5.positions_get.return_value = None
        session_patch = patch("bitunix_bridge.session", side_effect=RuntimeError("MT5 session failed")) \
            if failure_mode == "session_exception" else patch("bitunix_bridge.session", fake_session)
        with session_patch, patch("bitunix_bridge.save_state"), \
                patch.object(bridge.client, "place_order") as place_order:
            bridge.sync_once(mt5)
        place_order.assert_not_called()
        assert "xau5m_m5:77" in bridge.state["mapped_positions"]


def test_successful_empty_mt5_scan_reconciles_closed_trade(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["xau5m_m5"]})
    bridge.state = {"mapped_positions": {"77": {
        "ticket": 77, "source_account": "xau5m_m5", "symbol": "XAUUSDT",
        "side": "BUY", "qty": 0.01,
    }}, "history": [], "last_sync": 0}

    @contextmanager
    def fake_session(_mt5, _account):
        yield {}

    mt5 = MagicMock()
    mt5.positions_get.return_value = ()
    with patch("bitunix_bridge.session", fake_session), patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order", return_value={"code": 0}) as place_order:
        bridge.sync_once(mt5)
    place_order.assert_called_once()
    assert place_order.call_args.kwargs["trade_side"] == "CLOSE"
    assert "77" not in bridge.state["mapped_positions"]


def test_empty_tracked_accounts_never_reconcile_existing_mappings(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True, "tracked_accounts": []})
    bridge.state = {"mapped_positions": {"77": {
        "ticket": 77, "source_account": "xau5m_m5", "symbol": "XAUUSDT",
        "side": "BUY", "qty": 0.01,
    }}, "history": [], "last_sync": 0}
    with patch("bitunix_bridge.session") as session, patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order") as place_order:
        bridge.sync_once(MagicMock())
    session.assert_not_called()
    place_order.assert_not_called()
    assert "xau5m_m5:77" in bridge.state["mapped_positions"]


def test_funded_account_is_rejected_even_when_explicitly_configured(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={**DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["blueberry"]})
    bridge.state = {"mapped_positions": {}, "history": [], "last_sync": 0}
    with patch("bitunix_bridge.session") as session, patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order") as place_order:
        result = bridge.sync_once(MagicMock())
    assert result["status"] == "ok"
    session.assert_not_called()
    place_order.assert_not_called()


def test_same_mt5_ticket_on_two_accounts_maps_and_opens_independently(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={
        **DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["xau5m_m5", "titan"]
    })
    active_account = [None]

    @contextmanager
    def fake_session(_mt5, account):
        active_account[0] = account
        yield {}

    position = SimpleNamespace(
        symbol="XAUUSD", ticket=77, magic=1609493055, comment="XAUUSD 5 Minute",
        type=0, volume=0.01, sl=0, tp=0, price_open=4000, time=1,
    )
    mt5 = MagicMock()
    mt5.positions_get.side_effect = lambda: [position]
    with patch("bitunix_bridge.session", fake_session), patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order", return_value={"code": 0}) as place_order:
        bridge.sync_once(mt5)
    assert len(bridge.state["mapped_positions"]) == 2
    assert {entry["source_account"] for entry in bridge.state["mapped_positions"].values()} == {"xau5m_m5", "titan"}
    client_ids = [call.kwargs["client_id"] for call in place_order.call_args_list]
    assert len(client_ids) == 2
    assert len(set(client_ids)) == 2


def test_closed_ticket_reconciles_only_for_its_source_account(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={
        **DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["xau5m_m5", "titan"]
    })
    bridge.state = {"mapped_positions": {
        "xau5m_m5:77": {"ticket": 77, "source_account": "xau5m_m5", "symbol": "XAUUSDT", "side": "BUY", "qty": 0.01},
        "titan:77": {"ticket": 77, "source_account": "titan", "symbol": "XAUUSDT", "side": "SELL", "qty": 0.02},
    }, "history": [], "last_sync": 0}
    active_account = [None]

    @contextmanager
    def fake_session(_mt5, account):
        active_account[0] = account
        yield {}

    position = SimpleNamespace(symbol="XAUUSD", ticket=77)
    mt5 = MagicMock()
    mt5.positions_get.side_effect = lambda: [] if active_account[0] == "xau5m_m5" else [position]
    with patch("bitunix_bridge.session", fake_session), patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order", return_value={"code": 0}) as place_order:
        bridge.sync_once(mt5)
    assert place_order.call_count == 1
    assert place_order.call_args.kwargs["trade_side"] == "CLOSE"
    assert place_order.call_args.kwargs["side"] == "SELL"
    assert "xau5m_m5:77" not in bridge.state["mapped_positions"]
    assert "titan:77" in bridge.state["mapped_positions"]


def test_legacy_account_alias_mapping_migrates_and_reconciles(monkeypatch):
    monkeypatch.setenv("BITUNIX_BRIDGE_WRITE_APPROVED", "1")
    bridge = BitunixBridge(config={
        **DEFAULT_CONFIG, "enabled": True, "tracked_accounts": ["titan_500_2"]
    })
    bridge.state = {"mapped_positions": {"77": {
        "ticket": 77, "source_account": "titan_500_2", "symbol": "XAUUSDT",
        "side": "BUY", "qty": 0.01,
    }}, "history": [], "last_sync": 0}

    @contextmanager
    def fake_session(_mt5, _account):
        yield {}

    mt5 = MagicMock()
    mt5.positions_get.return_value = []
    with patch("bitunix_bridge.session", fake_session), patch("bitunix_bridge.save_state"), \
            patch.object(bridge.client, "place_order", return_value={"code": 0}) as place_order:
        bridge.sync_once(mt5)
    place_order.assert_called_once()
    assert place_order.call_args.kwargs["trade_side"] == "CLOSE"
    assert bridge.state["mapped_positions"] == {}
    assert bridge.state["history"][0]["source_account"] == "xau5m_500"


def test_app_source_has_no_import_time_worker_or_browser_toggle():
    source = (ROOT / "app.py").read_text(encoding="utf-8")
    tree = ast.parse(source)

    def module_execution(node):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            for decorator in getattr(node, "decorator_list", []):
                yield from module_execution(decorator)
            return
        yield node
        for child in ast.iter_child_nodes(node):
            yield from module_execution(child)

    worker_starts = [node for node in module_execution(tree)
                     if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                     and node.func.attr == "start" and isinstance(node.func.value, ast.Name)
                     and node.func.value.id.startswith("_bitunix_")]
    assert worker_starts == []
    assert not any(isinstance(node, ast.FunctionDef) and node.name == "bitunix_toggle"
                   for node in tree.body)
    assert '"/api/bitunix/toggle"' not in source
