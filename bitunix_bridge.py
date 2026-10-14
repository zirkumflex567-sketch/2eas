"""Bitunix Trade Bridge for MT5.

Mirrors trade executions from:
1. XAUUSD 5 Minute EA ("ausm Markt", Magic 1609493055 / 1609493057)
2. Titan Pro EA ("unser EA", Magic 881122 / 881125)
to Bitunix XAUUSDT Perpetual Futures.
"""
import os
import json
import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from bitunix_client import BitunixClient
from account_gateway import session, ACCOUNTS, terminal_running

logger = logging.getLogger("bitunix_bridge")
BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "bitunix_config.json"
STATE_PATH = BASE_DIR / "bitunix_bridge_state.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "api_key": "",
    "secret_key": "",
    "base_url": "https://fapi.bitunix.com",
    "enabled": True,
    "symbol": "XAUUSDT",
    "tracked_accounts": ["xau5m_m5", "blueberry", "titan"],
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
        self.config = config or load_config()
        self.client = BitunixClient(
            api_key=self.config.get("api_key", ""),
            secret_key=self.config.get("secret_key", ""),
            base_url=self.config.get("base_url", "https://fapi.bitunix.com")
        )
        self.state = load_state()
        self.failed_cooldown: Dict[str, float] = {}

    def reload(self) -> None:
        self.config = load_config()
        self.client = BitunixClient(
            api_key=self.config.get("api_key", ""),
            secret_key=self.config.get("secret_key", ""),
            base_url=self.config.get("base_url", "https://fapi.bitunix.com")
        )
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

    def sync_once(self, mt5) -> Dict[str, Any]:
        """Performs one scan across tracked accounts and syncs new, modified or closed orders."""
        if not self.config.get("enabled", True):
            return {"status": "disabled", "actions": []}

        actions: List[Dict[str, Any]] = []
        current_mapped = self.state.setdefault("mapped_positions", {})
        active_mt5_tickets = set()

        tracked = [a for a in self.config.get("tracked_accounts", []) if a in ACCOUNTS]

        for acc_id in tracked:
            spec = ACCOUNTS[acc_id]
            if not terminal_running(spec["terminal"]):
                continue

            try:
                with session(mt5, acc_id):
                    positions = mt5.positions_get()
                    active_account_tickets = set()

                    if positions:
                        for p in positions:
                            sym = str(p.symbol)
                            if not sym.startswith("XAUUSD"):
                                continue

                            ticket_str = str(p.ticket)
                            active_account_tickets.add(ticket_str)

                            eligible, ea_name = self.is_eligible_ea(p)
                            if not eligible:
                                continue

                            # Check if trade is not yet mapped to Bitunix and not in failure cooldown
                            if ticket_str not in current_mapped:
                                if time.time() < self.failed_cooldown.get(ticket_str, 0):
                                    continue
                                if time.time() < getattr(self, "balance_cooldown", 0):
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
                                    client_id=f"mt5_{ticket_str}"
                                )

                                action_info = {
                                    "action": "open",
                                    "ticket": p.ticket,
                                    "source_account": acc_id,
                                    "ea": ea_name,
                                    "side": side,
                                    "qty": qty,
                                    "mt5_open_price": p.price_open,
                                    "bitunix_response": resp
                                }
                                actions.append(action_info)

                                if resp.get("code") == 0:
                                    current_mapped[ticket_str] = {
                                        "ticket": p.ticket,
                                        "source_account": acc_id,
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
                                    if resp.get("code") == 20003:
                                        self.balance_cooldown = time.time() + 60.0
                                    self.failed_cooldown[ticket_str] = time.time() + 60.0
                                    logger.warning("Bitunix order rejected for ticket %s: %s (cooldown 60s)", ticket_str, resp.get("msg"))

                    # Safely check for closed positions strictly belonging to this scanned account
                    for t_str in list(current_mapped.keys()):
                        info = current_mapped[t_str]
                        if info.get("source_account") == acc_id and t_str not in active_account_tickets:
                            close_side = "SELL" if info["side"] == "BUY" else "BUY"
                            logger.info("Closing Bitunix trade for closed MT5 ticket %s: %s %s XAU",
                                        t_str, close_side, info["qty"])

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
                                "ticket": int(t_str),
                                "source_account": acc_id,
                                "ea": info.get("ea"),
                                "close_side": close_side,
                                "qty": info["qty"],
                                "bitunix_response": resp
                            })

                            info["closed_at"] = time.time()
                            info["close_response"] = resp
                            self.state.setdefault("history", []).append(info)
                            if len(self.state["history"]) > 50:
                                self.state["history"] = self.state["history"][-50:]
                            del current_mapped[t_str]

            except Exception as e:
                logger.error("Error reading positions on %s: %s", acc_id, e)

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
            "enabled": bool(self.config.get("enabled", True)),
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
