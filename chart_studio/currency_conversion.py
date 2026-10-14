"""Read-only MT5 currency conversion with explicit quote provenance."""
from __future__ import annotations

from datetime import datetime, timezone
import math


def convert_amounts_to_usd(mt5, amounts, currency, *, now_ms=None, max_age_ms=5000,
                           future_skew_ms=500) -> dict:
    """Convert signed money amounts from one fresh selected MT5 FX quote.

    Positive amounts are assets converted at the executable bid; negative amounts
    are liabilities converted at the ask. Only direct/inverse pairs are accepted.
    """
    if not isinstance(amounts, dict) or not amounts:
        return {"state":"UNAVAILABLE", "reason":"INVALID_AMOUNTS", "amountsUsd":{}, "source":"NONE"}
    if any(not isinstance(key,str) or not key or isinstance(value,bool) or
           not isinstance(value,(int,float)) or not math.isfinite(value) for key,value in amounts.items()):
        return {"state":"UNAVAILABLE", "reason":"INVALID_AMOUNT", "amountsUsd":{}, "source":"NONE"}
    code = str(currency or "").upper()
    if len(code) != 3 or not code.isalpha():
        return {"state":"UNAVAILABLE", "reason":"INVALID_CURRENCY", "amountsUsd":{}, "source":"NONE"}
    if code == "USD":
        return {"state":"AVAILABLE", "amountsUsd":{k:round(float(v),2) for k,v in amounts.items()},
                "currency":"USD", "source":"ACCOUNT_CURRENCY"}
    if (isinstance(max_age_ms, bool) or not isinstance(max_age_ms, int) or max_age_ms < 0 or
            isinstance(future_skew_ms, bool) or not isinstance(future_skew_ms, int) or future_skew_ms < 0):
        return {"state":"UNAVAILABLE", "reason":"INVALID_FRESHNESS_POLICY", "amountsUsd":{}, "source":"NONE"}
    try:
        now = float(now_ms) if now_ms is not None else datetime.now(timezone.utc).timestamp() * 1000
        rows = mt5.symbols_get()
    except Exception:
        return {"state":"UNAVAILABLE", "reason":"FX_SYMBOLS_UNAVAILABLE", "amountsUsd":{}, "source":"NONE"}
    if not isinstance(now, (int, float)) or not math.isfinite(now) or not rows:
        return {"state":"UNAVAILABLE", "reason":"FX_SYMBOLS_UNAVAILABLE", "amountsUsd":{}, "source":"NONE"}
    candidates = {}
    for row in rows:
        name = getattr(row, "name", None)
        base = str(getattr(row, "currency_base", "") or "").upper()
        quote = str(getattr(row, "currency_profit", "") or "").upper()
        selected = getattr(row, "visible", False) is True or getattr(row, "select", False) is True
        if isinstance(name, str) and name and selected and ((base == code and quote == "USD") or
                                                              (base == "USD" and quote == code)):
            candidates[name] = ("DIRECT" if base == code else "INVERSE")
    if not candidates:
        return {"state":"UNAVAILABLE", "reason":"NO_FX_SYMBOL", "amountsUsd":{}, "source":"NONE"}
    if len(candidates) != 1:
        return {"state":"UNAVAILABLE", "reason":"AMBIGUOUS_FX_SYMBOL", "amountsUsd":{}, "source":"NONE"}
    name, direction = next(iter(candidates.items()))
    try:
        tick = mt5.symbol_info_tick(name)
        bid, ask = getattr(tick, "bid", None), getattr(tick, "ask", None)
        raw_time = getattr(tick, "time_msc", None)
        if raw_time is None:
            raw_seconds = getattr(tick, "time", None)
            raw_time = raw_seconds * 1000 if isinstance(raw_seconds, (int, float)) else None
        quote_ms = int(raw_time)
    except Exception:
        return {"state":"UNAVAILABLE", "reason":"FX_QUOTE_UNAVAILABLE", "amountsUsd":{}, "source":"NONE"}
    if (isinstance(bid, bool) or not isinstance(bid, (int, float)) or not math.isfinite(bid) or bid <= 0 or
            isinstance(ask, bool) or not isinstance(ask, (int, float)) or not math.isfinite(ask) or ask < bid or
            quote_ms <= 0):
        return {"state":"UNAVAILABLE", "reason":"INVALID_FX_QUOTE", "amountsUsd":{}, "source":"NONE"}
    age = now - quote_ms
    if age < -future_skew_ms:
        return {"state":"UNAVAILABLE", "reason":"FUTURE_FX_QUOTE", "amountsUsd":{}, "source":"NONE"}
    if age > max_age_ms:
        return {"state":"UNAVAILABLE", "reason":"STALE_FX_QUOTE", "amountsUsd":{}, "source":"NONE"}
    converted, sides = {}, {}
    for key, amount in amounts.items():
        if direction == "DIRECT":
            side = "BID" if amount >= 0 else "ASK"
            value = float(amount) * (bid if amount >= 0 else ask)
        else:
            side = "ASK" if amount >= 0 else "BID"
            value = float(amount) / (ask if amount >= 0 else bid)
        converted[key], sides[key] = round(value, 2), side
    return {"state": "AVAILABLE", "amountsUsd": converted,
            "currency": "USD", "source": "MT5_FX_QUOTE", "symbol": name,
            "conversionSides": sides, "quoteTimeUtc": datetime.fromtimestamp(
                quote_ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "ageMs": max(0, int(age)), "direction": direction}


def convert_amount_to_usd(mt5, amount, currency, *, now_ms=None, max_age_ms=5000,
                          future_skew_ms=500) -> dict:
    batch = convert_amounts_to_usd(mt5,{"value":amount},currency,now_ms=now_ms,
                                   max_age_ms=max_age_ms,future_skew_ms=future_skew_ms)
    return {**batch,"amountUsd":batch.get("amountsUsd",{}).get("value"),
            "conversionSide":batch.get("conversionSides",{}).get("value")}
