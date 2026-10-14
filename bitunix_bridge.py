"""Bitunix Trade Bridge for MT5.

Mirrors trade executions from:
1. XAUUSD 5 Minute EA ("ausm Markt", Magic 1609493055 / 1609493057)
2. Titan Pro EA ("unser EA", Magic 881122 / 881125)
to Bitunix XAUUSDT Perpetual Futures.
"""
import os
import json
import time
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from bitunix_client import BitunixClient
from account_gateway import session, ACCOUNTS

logger = logging.getLogger("bitunix_bridge")
BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "bitunix_config.json"
STATE_PATH = BASE_DIR / "bitunix_bridge_state.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "api_key": "",
    "secret_key": "",
    "base_url": "https://fapi.bitunix.com",
    "enabled": False,
    "symbol": "XAUUSDT",
    "tracked_accounts": [],
    "copy_market_ea": True,
    "copy_titan_ea": True,
    "sizing_mode": "fixed_qty",
    "fixed_qty": 0.01,
    "lot_multiplier": 1.0,
    "min_qty": 0.002,
    "max_open_positions": 5,
    "copy_sl_tp": True,
    "sync_interval_seconds": 2.0
}


def load_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.is_file():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                cfg.update(loaded)
        except Exception as e:
            logger.error("Failed to read bitunix_config.json: %s", e)
    if os.environ.get("BITUNIX_API_KEY"):
        cfg["api_key"] = os.environ["BITUNIX_API_KEY"]
    if os.environ.get("BITUNIX_SECRET_KEY"):
        cfg["secret_key"] = os.environ["BITUNIX_SECRET_KEY"]
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        logger.error("Failed to write bitunix_config.json: %s", e)


def load_state() -> Dict[str, Any]:
    if STATE_PATH.is_file():
        try:
            with open(STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error("Failed to read bitunix_bridge_state.json: %s", e)
    return {"mapped_positions": {}, "history": [], "last_sync": 0}


def save_state(state: Dict[str, Any]) -> None:
    try:
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.error("Failed to write bitunix_bridge_state.json: %s", e)


class BitunixBridge:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config if config is not None else load_config()
        self.client = self._make_client()
        self.state = load_state()
        self.failed_cooldown: Dict[str, float] = {}

    @property
    def write_gate_open(self) -> bool:
        return self.config.get("enabled") is True and os.environ.get("BITUNIX_BRIDGE_WRITE_APPROVED") == "1"

    def _make_client(self) -> BitunixClient:
        return BitunixClient(
            api_key=self.config.get("api_key", ""),
            secret_key=self.config.get("secret_key", ""),
            base_url=self.config.get("base_url", "https://fapi.bitunix.com"),
            writes_enabled=lambda: self.write_gate_open,
        )

    def reload(self) -> None:
        self.config = load_config()
        self.client = self._make_client()
        self.state = load_state()

    def is_eligible_ea(self, position) -> tuple[bool, str]:
        """Check whether position originated from Market EA or Titan EA."""
        magic = getattr(position, "magic", 0)
        comment = str(getattr(position, "comment", ""))

        is_market = magic in (1609493055, 1609493057) or ("5 Minute" in comment)
        if is_market:
            return bool(self.config.get("copy_market_ea", True)), "Market_XAU5M"

        is_titan = magic in (881122, 881125) or ("Titan" in comment)
        if is_titan:
            return bool(self.config.get("copy_titan_ea", True)), "Titan_Pro"

        # Default: if user enabled, copy all XAUUSD EA trades
        return bool(self.config.get("copy_titan_ea", True)), "Other_EA"

    def compute_qty(self, mt5_volume: float) -> float:
        """Calculate Bitunix order qty in XAU based on configured sizing mode."""
        mode = self.config.get("sizing_mode", "fixed_qty")
        min_qty = float(self.config.get("min_qty", 0.002))

        if mode == "fixed_qty":
            qty = float(self.config.get("fixed_qty", 0.01))
        elif mode == "proportional":
            multiplier = float(self.config.get("lot_multiplier", 1.0))
            qty = round(mt5_volume * multiplier, 3)
        else:
            qty = 0.01

        return max(qty, min_qty)

    @staticmethod
    def _mapping_key(account_id: str, ticket: Any) -> str:
        return f"{account_id}:{ticket}"

    @staticmethod
    def _client_order_id(account_id: str, ticket: Any) -> str:
        digest = hashlib.sha256(f"{account_id}:{ticket}".encode("utf-8")).hexdigest()[:27]
        return f"mt5_{digest}"

    def sync_once(self, mt5) -> Dict[str, Any]:
        """Performs one scan across tracked accounts and syncs new, modified or closed orders."""
        if not self.write_gate_open:
            return {"status": "write_gate_closed", "actions": []}

        actions: List[Dict[str, Any]] = []
        current_mapped = self.state.setdefault("mapped_positions", {})
        active_mt5_positions = set()
        successfully_scanned_accounts = set()

        tracked = []
        for account_id in self.config.get("tracked_accounts", []):
            account = ACCOUNTS.get(account_id)
            if account is None:
                continue
            if account.get("is_demo") is not True:
                logger.warning("Skipping non-demo Bitunix source account %s", account_id)
                continue
            tracked.append(account_id)
        # Migrate the earlier single-account key format using its stored account
        # identity. Unknown records remain untouched and are never auto-closed.
        for old_key, info in list(current_mapped.items()):
            account_id = info.get("source_account")
            ticket = info.get("ticket", old_key)
            if isinstance(account_id, str) and account_id in ACCOUNTS:
                canonical_account_id = ACCOUNTS[account_id].get("id", account_id)
                new_key = self._mapping_key(canonical_account_id, ticket)
                info["source_account"] = canonical_account_id
                info.setdefault("ticket", ticket)
                if new_key != old_key:
                    if new_key in current_mapped:
                        # Two keys for the same account/ticket are one mapping;
                        # retain the canonical record and fill any older fields.
                        canonical_info = current_mapped[new_key]
                        for field, value in info.items():
                            canonical_info.setdefault(field, value)
                        current_mapped.pop(old_key)
                    else:
                        current_mapped[new_key] = current_mapped.pop(old_key)

        for acc_id in tracked:
            try:
                with session(mt5, acc_id):
                    positions = mt5.positions_get()
                    if positions is None:
                        logger.warning("MT5 position scan returned unknown data for %s; retaining mapped trades", acc_id)
                        continue
                    account_active_tickets = set()
                    canonical_account_id = ACCOUNTS[acc_id].get("id", acc_id)

                    for p in positions:
                        sym = str(p.symbol)
                        if not sym.startswith("XAUUSD"):
                            continue

                        ticket_str = str(p.ticket)
                        account_active_tickets.add(ticket_str)
                        position_key = self._mapping_key(canonical_account_id, ticket_str)

                        eligible, ea_name = self.is_eligible_ea(p)
                        if not eligible:
                            continue

                        # Check if trade is not yet mapped to Bitunix and not in failure cooldown
                        if position_key not in current_mapped:
                            if time.time() < self.failed_cooldown.get(position_key, 0):
                                continue
                            # Verify max position limit
                            if len(current_mapped) >= self.config.get("max_open_positions", 5):
                                logger.warning("Max Bitunix positions reached (%d), skipping ticket %s", len(current_mapped), ticket_str)
                                continue

                            side = "BUY" if p.type == 0 else "SELL"
                            qty = self.compute_qty(p.volume)
                            sl_price = p.sl if (self.config.get("copy_sl_tp", True) and p.sl > 0) else None
                            tp_price = p.tp if (self.config.get("copy_sl_tp", True) and p.tp > 0) else None

                            logger.info("Opening Bitunix trade for %s (%s): %s %s XAU (SL: %s, TP: %s)",
                                        ticket_str, ea_name, side, qty, sl_price, tp_price)

                            resp = self.client.place_order(
                                symbol=self.config.get("symbol", "XAUUSDT"),
                                side=side,
                                trade_side="OPEN",
                                qty=qty,
                                order_type="MARKET",
                                sl_price=sl_price,
                                tp_price=tp_price,
                                client_id=self._client_order_id(canonical_account_id, ticket_str)
                            )

                            action_info = {
                                "action": "open",
                                "ticket": p.ticket,
                                "source_account": canonical_account_id,
                                "ea": ea_name,
                                "side": side,
                                "qty": qty,
                                "mt5_open_price": p.price_open,
                                "bitunix_response": resp
                            }
                            actions.append(action_info)

                            # Record mapping only if Bitunix accepted the order
                            if resp.get("code") == 0:
                                current_mapped[position_key] = {
                                    "ticket": p.ticket,
                                    "source_account": canonical_account_id,
                                    "ea": ea_name,
                                    "symbol": self.config.get("symbol", "XAUUSDT"),
                                    "side": side,
                                    "qty": qty,
                                    "sl_price": p.sl,
                                    "tp_price": p.tp,
                                    "mt5_open_price": p.price_open,
                                    "open_time": p.time,
                                    "synced_at": time.time(),
                                    "last_response": resp
                                }
                            else:
                                self.failed_cooldown[position_key] = time.time() + 60.0
                                logger.warning("Bitunix order rejected for ticket %s: %s (cooldown 60s)", ticket_str, resp.get("msg"))
                    active_mt5_positions.update((canonical_account_id, ticket) for ticket in account_active_tickets)
                    successfully_scanned_accounts.add(canonical_account_id)
            except Exception as e:
                logger.error("Error reading positions on %s: %s", acc_id, e)

        # Check for closed positions (previously mapped, but no longer in MT5)
        closed_tickets = [
            key for key, info in list(current_mapped.items())
            if info.get("source_account") in successfully_scanned_accounts
            and info.get("ticket") is not None
            and (info.get("source_account"), str(info["ticket"])) not in active_mt5_positions
        ]
        for mapping_key in closed_tickets:
            info = current_mapped[mapping_key]
            ticket = info.get("ticket", mapping_key)
            close_side = "SELL" if info["side"] == "BUY" else "BUY"
            logger.info("Closing Bitunix trade for closed MT5 ticket %s: %s %s XAU",
                        ticket, close_side, info["qty"])

            resp = self.client.place_order(
                symbol=info.get("symbol", "XAUUSDT"),
                side=close_side,
                trade_side="CLOSE",
                qty=info["qty"],
                order_type="MARKET",
                reduce_only=True
            )

            actions.append({
                "action": "close",
                "ticket": int(ticket),
                "source_account": info.get("source_account"),
                "ea": info.get("ea"),
                "close_side": close_side,
                "qty": info["qty"],
                "bitunix_response": resp
            })

            # Move to history
            info["closed_at"] = time.time()
            info["close_response"] = resp
            self.state.setdefault("history", []).append(info)
            # Keep history to last 50 items
            if len(self.state["history"]) > 50:
                self.state["history"] = self.state["history"][-50:]
            del current_mapped[mapping_key]

        self.state["last_sync"] = time.time()
        save_state(self.state)

        return {
            "status": "ok",
            "timestamp": time.time(),
            "active_mappings": len(current_mapped),
            "actions": actions
        }

    def get_status(self) -> Dict[str, Any]:
        """Provides status summary for dashboard and health check."""
        if not self.write_gate_open:
            return {
                "enabled": False,
                "write_gate": "CLOSED",
                "active_mapped_trades": len(self.state.get("mapped_positions", {})),
                "last_sync": self.state.get("last_sync", 0),
            }
        account_res = self.client.get_account()
        positions_res = self.client.get_pending_positions()

        usdt_bal = "0.00"
        usdt_avail = "0.00"
        if account_res.get("code") == 0 and isinstance(account_res.get("data"), list):
            for coin in account_res["data"]:
                if coin.get("marginCoin") == "USDT":
                    usdt_avail = str(coin.get("available", "0"))
                    usdt_bal = str(coin.get("transfer", usdt_avail))
                    break

        return {
            "enabled": self.write_gate_open,
            "write_gate": "OPEN",
            "symbol": self.config.get("symbol", "XAUUSDT"),
            "connected": account_res.get("code") == 0,
            "usdt_balance": usdt_bal,
            "usdt_available": usdt_avail,
            "bitunix_positions": len(positions_res),
            "active_mapped_trades": len(self.state.get("mapped_positions", {})),
            "last_sync": self.state.get("last_sync", 0),
            "tracked_accounts": self.config.get("tracked_accounts", []),
            "copy_market_ea": self.config.get("copy_market_ea", True),
            "copy_titan_ea": self.config.get("copy_titan_ea", True),
            "sizing_mode": self.config.get("sizing_mode", "fixed_qty"),
            "fixed_qty": self.config.get("fixed_qty", 0.01)
        }
