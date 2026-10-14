"""Bitunix Futures API Client with Double-SHA256 Signature Authentication.

Provides high-level methods for querying accounts, positions, and placing /
closing orders on Bitunix USDT-M Perpetual Futures (including XAUUSDT).
"""
import time
import uuid
import hashlib
import json
import logging
from typing import Optional, Dict, Any, List, Callable, Union
from urllib.parse import urlencode
import requests

logger = logging.getLogger("bitunix_client")

class BitunixClient:
    """Client for Bitunix Futures (fapi.bitunix.com) OpenAPI."""

    def __init__(
        self,
        api_key: str,
        secret_key: str,
        base_url: str = "https://fapi.bitunix.com",
        timeout: float = 8.0,
        writes_enabled: Union[bool, Callable[[], bool]] = False,
    ):
        self.api_key = api_key.strip()
        self.secret_key = secret_key.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._writes_enabled = writes_enabled

    def _write_gate_open(self) -> bool:
        gate = self._writes_enabled
        return bool(gate() if callable(gate) else gate)

    @staticmethod
    def _sha256_hex(val: str) -> str:
        return hashlib.sha256(val.encode("utf-8")).hexdigest()

    def _generate_signature(self, nonce: str, timestamp: str, query_params: str = "", body: str = "") -> str:
        """Bitunix double SHA-256 signature algorithm:
        1. digest = SHA256(nonce + timestamp + apiKey + queryParams + body)
        2. sign   = SHA256(digest + secretKey)
        """
        digest_input = f"{nonce}{timestamp}{self.api_key}{query_params}{body}"
        digest = self._sha256_hex(digest_input)
        sign_input = f"{digest}{self.secret_key}"
        return self._sha256_hex(sign_input)

    def request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Send an authenticated HTTP request to Bitunix Futures API."""
        if method.upper() != "GET" and not self._write_gate_open():
            logger.warning("Blocked Bitunix %s %s: write gate is closed", method, endpoint)
            return {"code": -403, "msg": "Bitunix write gate is closed", "data": None}
        url = f"{self.base_url}{endpoint}"
        nonce = uuid.uuid4().hex
        timestamp = str(int(time.time() * 1000))

        # Bitunix expects query string sorted / urlencoded for GET
        query_string = urlencode(params) if params else ""
        body_string = json.dumps(payload, separators=(',', ':')) if payload else ""

        signature = self._generate_signature(
            nonce=nonce,
            timestamp=timestamp,
            query_params=query_string,
            body=body_string
        )

        headers = {
            "api-key": self.api_key,
            "sign": signature,
            "timestamp": timestamp,
            "nonce": nonce,
            "Content-Type": "application/json"
        }

        full_url = f"{url}?{query_string}" if query_string and method.upper() == "GET" else url

        try:
            if method.upper() == "GET":
                resp = requests.get(full_url, headers=headers, timeout=self.timeout)
            elif method.upper() == "POST":
                resp = requests.post(full_url, headers=headers, data=body_string, timeout=self.timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            resp.raise_for_status()
            data = resp.json()
            return data
        except requests.RequestException as exc:
            logger.error("Bitunix request error on %s %s: %s", method, endpoint, exc)
            return {"code": -1, "msg": str(exc), "data": None}

    def get_account(self) -> Dict[str, Any]:
        """Fetch futures account balances and margin info."""
        return self.request("GET", "/api/v1/futures/account")

    def get_pending_positions(self) -> List[Dict[str, Any]]:
        """Fetch all currently open futures positions."""
        res = self.request("GET", "/api/v1/futures/position/get_pending_positions")
        if res.get("code") == 0 and isinstance(res.get("data"), list):
            return res["data"]
        return []

    def get_trading_pairs(self) -> List[Dict[str, Any]]:
        """Fetch public trading pair specifications (min volume, tick size, etc.)."""
        try:
            resp = requests.get(f"{self.base_url}/api/v1/futures/market/trading_pairs", timeout=self.timeout)
            data = resp.json()
            if data.get("code") == 0 and isinstance(data.get("data"), list):
                return data["data"]
            return []
        except Exception as exc:
            logger.error("Failed to fetch trading pairs: %s", exc)
            return []

    def place_order(
        self,
        symbol: str = "XAUUSDT",
        side: str = "BUY",           # BUY or SELL
        trade_side: str = "OPEN",    # OPEN or CLOSE
        qty: float = 0.01,
        order_type: str = "MARKET",  # MARKET or LIMIT
        price: Optional[float] = None,
        sl_price: Optional[float] = None,
        tp_price: Optional[float] = None,
        client_id: Optional[str] = None,
        position_id: Optional[str] = None,
        reduce_only: bool = False
    ) -> Dict[str, Any]:
        """Place a futures order on Bitunix.

        In Hedge Mode:
          - Open Long:  side="BUY",  trade_side="OPEN"
          - Open Short: side="SELL", trade_side="OPEN"
          - Close Long: side="SELL", trade_side="CLOSE"
          - Close Short: side="BUY",  trade_side="CLOSE"
        """
        payload: Dict[str, Any] = {
            "symbol": symbol.upper(),
            "qty": str(qty),
            "side": side.upper(),
            "tradeSide": trade_side.upper(),
            "orderType": order_type.upper(),
            "effect": "GTC"
        }

        if price is not None and order_type.upper() == "LIMIT":
            payload["price"] = str(round(price, 2))

        if client_id:
            payload["clientId"] = str(client_id)[:32]

        if position_id:
            payload["positionId"] = str(position_id)

        if reduce_only:
            payload["reduceOnly"] = True

        if sl_price is not None and sl_price > 0:
            payload["slPrice"] = str(round(sl_price, 2))
            payload["slStopType"] = "LAST_PRICE"
            payload["slOrderType"] = "MARKET"

        if tp_price is not None and tp_price > 0:
            payload["tpPrice"] = str(round(tp_price, 2))
            payload["tpStopType"] = "LAST_PRICE"
            payload["tpOrderType"] = "MARKET"

        return self.request("POST", "/api/v1/futures/trade/place_order", payload=payload)

    def close_all_positions(self, symbol: str = "XAUUSDT") -> Dict[str, Any]:
        """Close all open positions for the given symbol."""
        payload = {"symbol": symbol.upper()} if symbol else {}
        return self.request("POST", "/api/v1/futures/trade/close_all_position", payload=payload)
