"""Exercise the real host-injected Ed25519 trust path on demo accounts only.

The ephemeral private key exists only in this process. This makes read-only POST
requests to the caller-supplied-bars preview endpoint; it never contacts MT5.
"""
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from chart_studio.indicator_extensions import export_signed_package


BASE_URL = os.environ.get("CHART_STUDIO_INDICATOR_BASE_URL", "http://127.0.0.1:8056").rstrip("/")
KEY_ID = "runtime-demo-acceptance"
ACCOUNTS = (
    ("titan", "XAUUSD"),
    ("xau5m_m5", "XAUUSD.p"),
    ("titan_m5", "XAUUSD.p"),
    ("xau5m_500", "XAUUSD.p"),
)


def main():
    private_der = sys.stdin.buffer.read(4096)
    if not private_der:
        raise RuntimeError("provide a one-use DER private key through stdin")
    private = serialization.load_der_private_key(private_der, password=None)
    if not isinstance(private, Ed25519PrivateKey):
        raise RuntimeError("stdin key is not Ed25519")
    manifest = {
        "id": "runtime-trust-check",
        "version": "1.0.0",
        "name": "Runtime trust check",
        "parameters": [],
        "expression": {"source": "close"},
    }
    package = export_signed_package(manifest, key_id=KEY_ID, private_key=private).decode("utf-8")
    results = []
    for account, symbol in ACCOUNTS:
        bars = [
            {"time": 1_800_000_000 + index * 900, "open": 4000 + index,
             "high": 4002 + index, "low": 3999 + index, "close": 4001 + index}
            for index in range(3)
        ]
        body = json.dumps({
            "account": account,
            "symbol": symbol,
            "timeframe": "M15",
            "package": package,
            "parameters": {},
            "bars": bars,
        }, separators=(",", ":")).encode("utf-8")
        request = Request(
            BASE_URL + "/api/chart/v1/indicator-extensions/preview",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                if response.headers.get("cache-control") != "no-store":
                    raise RuntimeError("preview response is cacheable")
                result = json.load(response)
        except HTTPError as error:
            try:
                code = json.load(error).get("detail", {}).get("code", "HTTP_ERROR")
            except Exception:
                code = "HTTP_ERROR"
            raise RuntimeError(f"{account}: preview rejected ({code})") from None
        if (result.get("account") != account or result.get("symbol") != symbol or
                result.get("timeframe") != "M15" or result.get("source") != "CALLER_SUPPLIED_BARS" or
                result.get("canExecute") is not False or
                result.get("series") != [{"time": bar["time"], "value": float(bar["close"])} for bar in bars]):
            raise RuntimeError(f"{account}: preview result failed scope or value checks")
        results.append(account)
    print(json.dumps({"accepted": results, "mutations": 0, "brokerCalls": 0,
                      "privateKeyPersisted": False}, separators=(",", ":")))


if __name__ == "__main__":
    main()
