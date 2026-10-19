"""Authenticated, read-only live acceptance for new-entry ticket previews.

The smoke talks only to the local dashboard on loopback. It uses the existing
private proxy identity to exercise the real trade-role route, but never calls
the ticket commit endpoint or any broker order function.
"""

import json
import math
import os
from decimal import Decimal, ROUND_FLOOR
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


DEMO_SYMBOLS = {
    "titan": "XAUUSD",
    "xau5m_m5": "XAUUSD.p",
    "titan_m5": "XAUUSD.p",
    "xau5m_500": "XAUUSD.p",
}
PREVIEW_PATH = "/api/chart/v1/trade-ticket/preview"


def _local_base_url():
    raw = os.environ.get("CHART_STUDIO_BASE_URL", "http://127.0.0.1:8056")
    parsed = urlsplit(raw)
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            or parsed.port not in (8050, 8056) or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise RuntimeError("Smoke accepts only the local HTTP dashboard on ports 8050/8056.")
    return f"http://{parsed.netloc}"


def _private_proxy_identity():
    config_path = Path.home() / ".dashboard-env.json"
    config = json.loads(config_path.read_text(encoding="utf-8-sig"))
    secret = config.get("DASHBOARD_PROXY_SECRET")
    users = json.loads(config.get("DASHBOARD_PROXY_USERS", "{}"))
    if not isinstance(secret, str) or len(secret) < 32 or not isinstance(users, dict):
        raise RuntimeError("A valid private dashboard proxy identity is required.")
    trade_users = [name for name, role in users.items()
                   if isinstance(name, str) and role == "trade"]
    if not trade_users:
        raise RuntimeError("No configured trade-role proxy identity is available.")
    return secret, sorted(trade_users)[0]


def validate_preview_response(account, symbol, http_status, result):
    """Accept a valid read-only preview or the known fail-closed margin denial."""
    if http_status == 422:
        detail = result.get("detail", {}) if isinstance(result, dict) else {}
        if (detail.get("code") != "INSUFFICIENT_FREE_MARGIN"
                or detail.get("canExecute") is not False
                or detail.get("canCommit") is not False
                or detail.get("guard") != {"state": "UNKNOWN", "source": "NONE"}):
            raise AssertionError(f"{account}: unexpected preview rejection")
        return "REJECTED_INSUFFICIENT_FREE_MARGIN"

    if http_status != 200:
        raise AssertionError(f"{account}: preview returned HTTP {http_status}")
    if (result.get("account") != account or result.get("symbol") != symbol
            or result.get("status") != "PREVIEW_ONLY"
            or result.get("canExecute") is not False
            or result.get("canCommit") is not False
            or result.get("guard") != {"state": "UNKNOWN", "source": "NONE"}
            or "previewId" in result):
        raise AssertionError(f"{account}: preview scope or write-safety contract failed")
    return "PREVIEW_ONLY"


def main():
    base = _local_base_url()
    origin = base
    secret, user = _private_proxy_identity()
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    identity_headers = {
        "Accept": "application/json",
        "Origin": origin,
        "X-Dashboard-Proxy-Secret": secret,
        "X-Dashboard-User": user,
    }

    def call(path, *, method="GET", payload=None, csrf=None):
        headers = dict(identity_headers)
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        if csrf is not None:
            headers["X-Dashboard-CSRF"] = csrf
        request = Request(base + path, data=data, headers=headers, method=method)
        try:
            with opener.open(request, timeout=15) as response:
                body = json.load(response)
                if path == PREVIEW_PATH and method == "POST":
                    return response.status, body
                if response.status != 200:
                    raise AssertionError(f"{method} {path} returned HTTP {response.status}")
                return body
        except HTTPError as error:
            if path == PREVIEW_PATH and method == "POST":
                return error.code, json.loads(error.read().decode("utf-8"))
            raise

    session = call("/api/control_session")
    assert session.get("role") == "trade" and session.get("control_enabled") is True
    csrf = session.get("csrf_token")
    assert isinstance(csrf, str) and len(csrf) >= 32

    results = []
    for account, symbol in DEMO_SYMBOLS.items():
        query = urlencode({"account": account, "symbol": symbol})
        symbol_info = call("/api/chart/v1/symbol-info?" + query)
        quote = call("/api/chart/v1/quotes?" + query)
        assert symbol_info.get("account") == account
        assert symbol_info.get("symbol") == symbol
        assert symbol_info.get("source") == "MT5_VERIFIED"
        assert symbol_info.get("canExecute") is False
        assert quote.get("account") == account and quote.get("symbol") == symbol
        assert quote.get("source") == "MT5_VERIFIED" and quote.get("canExecute") is False
        assert quote.get("freshness") == "FRESH"

        step = Decimal(symbol_info["tickSize"])
        point = Decimal(symbol_info["point"])
        stops = max(int(symbol_info["stopsLevel"]), int(symbol_info["freezeLevel"]))
        distance = max(Decimal("10"), point * stops + Decimal("5"))
        ask = Decimal(str(quote["ask"]))
        entry = ((ask - distance) / step).to_integral_value(rounding=ROUND_FLOOR) * step
        assert entry > distance
        status, result = call(
            PREVIEW_PATH,
            method="POST",
            csrf=csrf,
            payload={
                "schemaVersion": 1,
                "account": account,
                "symbol": symbol,
                "orderType": "BUY_LIMIT",
                "volumeLots": 0.01,
                "entryPrice": float(entry),
                "slPrice": float(entry - distance),
                "tpPrice": float(entry + distance),
            },
        )
        outcome = validate_preview_response(account, symbol, status, result)
        if outcome == "REJECTED_INSUFFICIENT_FREE_MARGIN":
            results.append({
                "account": account,
                "outcome": outcome,
                "authenticatedRoute": "TRADE_ROLE",
                "quote": "FRESH",
                "canExecute": False,
                "canCommit": False,
                "previewTokenIssued": False,
            })
            continue
        risk = result.get("brokerRisk", {})
        assert math.isfinite(float(risk["margin"])) and float(risk["margin"]) >= 0
        assert float(risk["pnlAtSl"]) < 0 < float(risk["pnlAtTp"])
        results.append({
            "account": account,
            "outcome": outcome,
            "authenticatedRoute": "TRADE_ROLE",
            "quote": "FRESH",
            "brokerMath": "VALID",
            "status": result["status"],
            "canExecute": False,
            "canCommit": False,
            "previewTokenIssued": False,
        })

    assert tuple(result["account"] for result in results) == tuple(DEMO_SYMBOLS)
    print(json.dumps({
        "results": results,
        "previewPosts": len(results),
        "commitEndpointCalled": False,
        "brokerWrites": 0,
        "blueberryQueried": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
