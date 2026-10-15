"""Conservative price-distance estimates from recorded MT5 OHLC only."""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from hashlib import sha256

from chart_studio import evidence_models


def _unavailable(reason):
    return {"status": "UNAVAILABLE", "reason": reason}


def _decimal(value):
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError("invalid decimal")
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("invalid decimal") from exc
    if not result.is_finite():
        raise ValueError("invalid decimal")
    return result


def _plain(value):
    return format(value.normalize(), "f") if value else "0"


def _as_utc(value):
    return datetime.fromisoformat(evidence_models.utc_timestamp(value).replace("Z", "+00:00"))


def _snapshot_bars(record):
    payload = record["payload"]
    market = payload.get("marketData")
    if not isinstance(market, dict) or market.get("source") != "MT5_COMPLETED_BARS":
        raise ValueError("missing bar evidence")
    bars = market.get("bars")
    if not isinstance(bars, list) or not 1 <= len(bars) <= 150:
        raise ValueError("bar count")
    digest = sha256(evidence_models.canonical_bytes(bars)).hexdigest()
    if market.get("sha256") != digest:
        raise ValueError("bar digest")
    stamps = []
    for bar in bars:
        _as_utc(bar["timeUtc"])
        low, high = _decimal(bar["low"]), _decimal(bar["high"])
        opening, close = _decimal(bar["open"]), _decimal(bar["close"])
        if not low <= opening <= high or not low <= close <= high:
            raise ValueError("bar range")
        stamps.append((evidence_models.utc_microseconds(bar["timeUtc"]), bar))
    if any(right[0] <= left[0] for left, right in zip(stamps, stamps[1:])):
        raise ValueError("bar order")
    return bars


def estimate_ohlc_mfe_mae(position_identifier, lifecycle_records, snapshot_records):
    """Estimate observed price-distance excursions for a simple closed position.

    This deliberately returns observed-bar extrema, never currency PnL or an
    exact tick result. Unsupported lifecycle shapes fail closed.
    """
    if not isinstance(position_identifier, str) or not position_identifier.isdigit():
        return _unavailable("INVALID_POSITION_ID")
    if not isinstance(lifecycle_records, list) or not isinstance(snapshot_records, list):
        return _unavailable("INVALID_EVIDENCE")

    def matching(records):
        selected = []
        for record in records:
            if not isinstance(record, dict) or not isinstance(record.get("payload"), dict):
                return None
            payload = record["payload"]
            if payload.get("positionIdentifier") == position_identifier:
                selected.append(record)
        return selected

    deals = matching(lifecycle_records)
    snaps = matching(snapshot_records)
    if deals is None or snaps is None:
        return _unavailable("INVALID_EVIDENCE")
    if not deals or not snaps:
        return _unavailable("SNAPSHOT_MISSING")

    try:
        accounts = {r["payload"]["accountId"] for r in deals + snaps}
        if len(accounts) != 1:
            return _unavailable("POSITION_SCOPE_MISMATCH")
        if any(r.get("provenance") != "RECORDED" for r in deals + snaps):
            return _unavailable("INVALID_EVIDENCE")
        entries = [r for r in deals if r["payload"].get("dealEntry") == "IN"]
        exits = [r for r in deals if r["payload"].get("dealEntry") in ("OUT", "OUT_BY")]
        other = [r for r in deals if r not in entries and r not in exits]
        if len(entries) != 1 or len(exits) != 1 or other:
            return _unavailable("MULTI_LEG_POSITION_UNSUPPORTED")
        entry, exit_ = entries[0]["payload"], exits[0]["payload"]
        if entry["accountId"] != exit_["accountId"]:
            return _unavailable("POSITION_SCOPE_MISMATCH")
        entry_time, exit_time = _as_utc(entry["asOfUtc"]), _as_utc(exit_["asOfUtc"])
        if exit_time <= entry_time:
            return _unavailable("INVALID_EVIDENCE")
        side = entry.get("dealSide")
        if side not in ("BUY", "SELL"):
            return _unavailable("POSITION_SIDE_UNKNOWN")
        entry_price = _decimal(entry["price"])
        entry_ticket, exit_ticket = str(entry["dealTicket"]), str(exit_["dealTicket"])

        entry_snaps = [r for r in snaps if r["payload"].get("captureType") == "ENTRY"]
        exit_snaps = [r for r in snaps if r["payload"].get("captureType") == "EXIT"]
        if len(entry_snaps) != 1 or len(exit_snaps) != 1:
            return _unavailable("MULTI_LEG_POSITION_UNSUPPORTED")
        entry_snap, exit_snap = entry_snaps[0]["payload"], exit_snaps[0]["payload"]
        for payload, ticket, expected_type in ((entry_snap, entry_ticket, "ENTRY"),
                                               (exit_snap, exit_ticket, "EXIT")):
            refs = payload.get("lifecycleEventIds")
            if (payload.get("captureType") != expected_type or payload.get("dealTicket") != ticket or
                    payload.get("accountId") != entry["accountId"] or
                    payload.get("asOfUtc") != (entry["asOfUtc"] if expected_type == "ENTRY" else exit_["asOfUtc"]) or
                    not isinstance(refs, list) or
                    not any(ref.get("type") == "LIFECYCLE" and ref.get("id") == "mt5_deal_" + ticket
                            for ref in refs if isinstance(ref, dict))):
                return _unavailable("SNAPSHOT_LINK_MISMATCH")
        timeframe = entry_snap.get("chartView", {}).get("timeframe")
        if timeframe != exit_snap.get("chartView", {}).get("timeframe"):
            return _unavailable("TIMEFRAME_MISMATCH")
        bars = _snapshot_bars(exit_snaps[0])
        _snapshot_bars(entry_snaps[0])
        if entry_snap.get("chartView", {}).get("symbol") != exit_snap.get("chartView", {}).get("symbol"):
            return _unavailable("SYMBOL_MISMATCH")
        period_us = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800,
                     "H1": 3600, "H4": 14400, "D1": 86400, "W1": 604800}.get(timeframe)
        if not period_us:
            return _unavailable("TIMEFRAME_UNSUPPORTED")
        entry_us = evidence_models.utc_microseconds(entry["asOfUtc"])
        exit_us = evidence_models.utc_microseconds(exit_["asOfUtc"])
        full_bars = []
        for bar in bars:
            opened_us = evidence_models.utc_microseconds(bar["timeUtc"])
            closed_us = evidence_models.market_bar_close_microseconds(bar["timeUtc"], timeframe)
            if opened_us >= entry_us and closed_us <= exit_us:
                full_bars.append(bar)
        if not full_bars:
            return _unavailable("NO_COMPLETE_CANDLES")

        favorable = []
        adverse = []
        for bar in full_bars:
            high, low = _decimal(bar["high"]), _decimal(bar["low"])
            if side == "BUY":
                favorable.append(high - entry_price)
                adverse.append(entry_price - low)
            else:
                favorable.append(entry_price - low)
                adverse.append(high - entry_price)
        result = {
            "status": "AVAILABLE", "reason": None,
            "quality": "OHLC_ESTIMATE", "coverage": "OBSERVED_BARS_ONLY",
            "source": "MT5_COMPLETED_BARS", "positionIdentifier": position_identifier,
            "entryDealTicket": entry_ticket, "exitDealTicket": exit_ticket,
            "entryTimeUtc": entry["asOfUtc"], "exitTimeUtc": exit_["asOfUtc"],
            "timeframe": timeframe, "barsUsed": len(full_bars),
            "observedFromUtc": full_bars[0]["timeUtc"], "observedToUtc": full_bars[-1]["timeUtc"],
            "mfePriceDistance": _plain(max(Decimal(0), *favorable)),
            "maePriceDistance": _plain(max(Decimal(0), *adverse)),
            "intrabarOrder": "UNKNOWN",
        }
        return result
    except (KeyError, TypeError, ValueError, InvalidOperation, OverflowError):
        return _unavailable("INVALID_SNAPSHOT_EVIDENCE")
