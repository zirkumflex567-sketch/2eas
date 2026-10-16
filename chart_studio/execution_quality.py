"""Deterministic read-only execution-quality calculations from recorded evidence.

No current quote, candle close, nearest-time match or reconstructed reference is
accepted as an order-time price. Entry-deal cash subtotals are kept separate from
calculated spread and slippage estimates; they are not full-position net PnL.
"""
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import re

import account_gateway as gateway
from chart_studio.broker_reads import broker_symbol

MAX_RECORDS = 10_000
MAX_QUOTE_AGE_SECONDS = 30


def _decimal(value, *, positive=False):
    if not isinstance(value, str) or len(value) > 32 or not re.fullmatch(r"-?[0-9]+(?:\.[0-9]{1,12})?", value):
        return None
    try:
        result = Decimal(value)
    except InvalidOperation:
        return None
    if not result.is_finite() or abs(result) > Decimal("1000000000000") or (positive and result <= 0):
        return None
    return result


def _time(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, OverflowError):
        return None
    if result.tzinfo is None or result.utcoffset() is None:
        return None
    return result.astimezone(timezone.utc)


def _str(value):
    return format(value.normalize(), "f")


def _attempt_reference(event, account_id, symbol):
    if not isinstance(event, dict) or event.get("type") != "DECISION" or event.get("accountId") != account_id:
        return None
    payload = event.get("payload")
    if not isinstance(payload, dict) or payload.get("symbol") != symbol or payload.get("stage") != "ORDER_ATTEMPT":
        return None
    value = payload.get("orderAttempt")
    if not isinstance(value, dict):
        return {"payload": payload, "reference": None}
    order_ticket = value.get("brokerTicket") or payload.get("brokerTicket")
    attempt_id = value.get("orderAttemptId")
    side = value.get("side")
    intended = _decimal(value.get("intendedPrice"), positive=True)
    requested = _decimal(value.get("requestedVolume"), positive=True)
    request_time = _time(value.get("requestTimeUtc"))
    quote = value.get("quoteSnapshot")
    if (not isinstance(order_ticket, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", order_ticket) or
            not isinstance(attempt_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", attempt_id) or
            side not in ("BUY", "SELL") or intended is None or requested is None or request_time is None or
            not isinstance(quote, dict)):
        return {"payload": payload, "reference": None}
    quote_time = _time(quote.get("quoteTimeUtc"))
    bid, ask = _decimal(quote.get("bid"), positive=True), _decimal(quote.get("ask"), positive=True)
    tick_size = _decimal(quote.get("tickSize"), positive=True)
    tick_value = _decimal(quote.get("tickValuePerLot"), positive=True)
    currency = quote.get("currency")
    quote_age = (request_time - quote_time).total_seconds() if quote_time else None
    if (quote.get("source") != "MT5_VERIFIED" or quote.get("canExecute") is not False or
            quote.get("symbol") != symbol or quote_time is None or quote_age is None or
            quote_age < 0 or bid is None or ask is None or ask < bid or
            tick_size is None or (quote.get("tickValuePerLot") is not None and tick_value is None) or
            (tick_value is not None and (not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3,12}", currency)))):
        return {"payload": payload, "reference": None}
    return {"payload": payload, "reference": {
        "attemptId": attempt_id, "brokerTicket": order_ticket, "side": side,
        "intendedPrice": intended, "requestedVolume": requested,
        "requestTimeUtc": request_time, "bid": bid, "ask": ask,
        "tickSize": tick_size, "tickValuePerLot": tick_value, "currency": currency,
    }}


def _deal(row, account_id, symbol):
    if not isinstance(row, dict) or row.get("type") != "LIFECYCLE" or row.get("accountId") != account_id:
        return None
    payload = row.get("payload")
    if not isinstance(payload, dict) or payload.get("symbol") != symbol or payload.get("source") != "MT5_DEAL":
        return None
    if payload.get("dealEntry") not in ("IN", "INOUT"):
        return None
    order_ticket, deal_ticket = payload.get("orderTicket"), payload.get("dealTicket")
    side = payload.get("dealSide")
    price, volume = _decimal(payload.get("price"), positive=True), _decimal(payload.get("volume"), positive=True)
    if (not isinstance(order_ticket, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", order_ticket) or
            not isinstance(deal_ticket, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", deal_ticket) or
            side not in ("BUY", "SELL") or price is None or volume is None or payload.get("dataQuality") != "OBSERVED"):
        return None
    cash = {}
    for name in ("commission", "fee", "swap", "profit"):
        value = _decimal(payload.get(name))
        cash[name] = value
    return {"orderTicket": order_ticket, "dealTicket": deal_ticket, "side": side,
            "price": price, "volume": volume, "cash": cash}


def _linear_percentile(values, percentile):
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = Decimal(len(ordered) - 1) * Decimal(str(percentile))
    lo = int(position)
    weight = position - lo
    if lo + 1 == len(ordered):
        return ordered[lo]
    return ordered[lo] + (ordered[lo + 1] - ordered[lo]) * weight


def analyze_execution_quality(decision_events, lifecycle_events, *, account_id, symbol,
                              minimum_samples=20, max_quote_age_seconds=MAX_QUOTE_AGE_SECONDS):
    """Join recorded order-attempt references to actual MT5 fills by exact IDs.

    The caller must provide already authenticated, account-scoped evidence-store
    rows. The function still rechecks account, symbol and challenge/demo policy.
    """
    spec = gateway.ACCOUNTS.get(account_id) if isinstance(account_id, str) else None
    if (spec is None or spec.get("is_demo") is not True or spec.get("challenge_protection") is True or
            not isinstance(decision_events, list) or not isinstance(lifecycle_events, list) or
            len(decision_events) > MAX_RECORDS or len(lifecycle_events) > MAX_RECORDS or
            type(minimum_samples) is not int or not 1 <= minimum_samples <= 1000 or
            type(max_quote_age_seconds) not in (int, float) or not 0 < max_quote_age_seconds <= 3600):
        raise ValueError("invalid execution-quality scope or limits")
    symbol = broker_symbol(symbol)
    attempts, attempt_by_id = [], {}
    for event in decision_events:
        value = _attempt_reference(event, account_id, symbol)
        if value is not None:
            payload = value["payload"]
            nested = payload.get("orderAttempt")
            attempt_id = (nested.get("orderAttemptId") if isinstance(nested, dict) else
                          payload.get("orderAttemptId"))
            signature = json.dumps([payload.get("symbol"), payload.get("decisionTimeUtc"), nested],
                                   sort_keys=True, separators=(",", ":"), ensure_ascii=True)
            if isinstance(attempt_id, str):
                previous = attempt_by_id.get(attempt_id)
                if previous is not None:
                    if previous["signature"] != signature:
                        previous["item"]["conflict"] = True
                        previous["item"]["reference"] = None
                    continue
            reference = value["reference"]
            if reference is not None:
                request_time = reference["requestTimeUtc"]
                quote_time = _time(value["payload"]["orderAttempt"]["quoteSnapshot"].get("quoteTimeUtc"))
                age = (request_time - quote_time).total_seconds() if quote_time else None
                if age is None or age < 0 or age > max_quote_age_seconds:
                    value["reference"] = None
            attempts.append(value)
            if isinstance(attempt_id, str):
                attempt_by_id[attempt_id] = {"signature": signature, "item": value}

    deals_by_ticket = defaultdict(dict)
    conflicts = set()
    deal_ticket_owner = {}
    for raw in lifecycle_events:
        value = _deal(raw, account_id, symbol)
        if value is None:
            continue
        ticket, deal_ticket = value["orderTicket"], value["dealTicket"]
        previous = deals_by_ticket[ticket].get(deal_ticket)
        if previous is None:
            deals_by_ticket[ticket][deal_ticket] = value
            prior_ticket = deal_ticket_owner.get(deal_ticket)
            if prior_ticket is not None and prior_ticket != ticket:
                conflicts.update((ticket, prior_ticket))
            else:
                deal_ticket_owner[deal_ticket] = ticket
        elif previous != value:
            conflicts.add(ticket)

    attempts_by_ticket = defaultdict(list)
    for item in attempts:
        ref = item["reference"]
        if ref:
            attempts_by_ticket[ref["brokerTicket"]].append(item)
    ambiguous_tickets = {ticket for ticket, rows in attempts_by_ticket.items()
                         if len({row["reference"]["attemptId"] for row in rows}) > 1}

    orders, seen_deals, slippage_samples = [], set(), []
    group_samples = defaultdict(list)
    for item in attempts:
        ref = item["reference"]
        if item.get("conflict"):
            payload = item["payload"]
            attempt_payload = payload.get("orderAttempt") or {}
            orders.append({"orderAttemptId": attempt_payload.get("orderAttemptId"),
                           "brokerTicket": attempt_payload.get("brokerTicket") or payload.get("brokerTicket"),
                           "status": "CONFLICTING_ATTEMPT_EVENT", "fillCount": 0,
                           "weightedFillPrice": None, "signedSlippagePrice": None,
                           "signedSlippageTicks": None, "spreadPrice": None,
                           "estimatedAdverseCost": None, "brokerCashCosts": None})
            continue
        if ref is None:
            order_ticket = item["payload"].get("orderAttempt", {}).get("brokerTicket")
            matched = next((rows for ticket, rows in deals_by_ticket.items()
                            if isinstance(order_ticket, str) and ticket == order_ticket), {})
            orders.append({"orderAttemptId": item["payload"].get("orderAttempt", {}).get("orderAttemptId"),
                           "brokerTicket": order_ticket if isinstance(order_ticket, str) else None,
                           "status": "REFERENCE_UNAVAILABLE" if not matched else "REFERENCE_UNAVAILABLE",
                           "fillCount": len(matched), "weightedFillPrice": None, "signedSlippagePrice": None,
                           "signedSlippageTicks": None, "spreadPrice": None, "estimatedAdverseCost": None,
                           "brokerCashCosts": None})
            continue
        ticket = ref["brokerTicket"]
        rows = list(deals_by_ticket.get(ticket, {}).values())
        if ticket in ambiguous_tickets:
            orders.append({"orderAttemptId": ref["attemptId"], "brokerTicket": ticket, "status": "AMBIGUOUS_ORDER_ATTEMPT",
                           "fillCount": 0, "weightedFillPrice": None, "signedSlippagePrice": None,
                           "signedSlippageTicks": None, "spreadPrice": None, "estimatedAdverseCost": None,
                           "brokerCashCosts": None})
            continue
        if ticket in conflicts:
            orders.append({"orderAttemptId": ref["attemptId"], "brokerTicket": ticket, "status": "HISTORY_CONFLICT",
                           "fillCount": 0, "weightedFillPrice": None, "signedSlippagePrice": None,
                           "signedSlippageTicks": None, "spreadPrice": None, "estimatedAdverseCost": None,
                           "brokerCashCosts": None})
            continue
        rows = [row for row in rows if row["side"] == ref["side"]]
        if not rows:
            orders.append({"orderAttemptId": ref["attemptId"], "brokerTicket": ticket, "status": "FILL_NOT_RECORDED",
                           "fillCount": 0, "weightedFillPrice": None, "signedSlippagePrice": None,
                           "signedSlippageTicks": None, "spreadPrice": None, "estimatedAdverseCost": None,
                           "brokerCashCosts": None})
            continue
        volume = sum((row["volume"] for row in rows), Decimal(0))
        fill = sum((row["price"] * row["volume"] for row in rows), Decimal(0)) / volume
        raw_slippage = fill - ref["intendedPrice"]
        signed_slippage = raw_slippage if ref["side"] == "BUY" else -raw_slippage
        ticks = signed_slippage / ref["tickSize"]
        spread = ref["ask"] - ref["bid"]
        estimated = None
        if ref["tickValuePerLot"] is not None:
            estimated = max(ticks, Decimal(0)) * ref["tickValuePerLot"] * volume
        cash_totals = {name: sum((row["cash"][name] for row in rows), Decimal(0))
                       if all(row["cash"][name] is not None for row in rows) else None
                       for name in ("commission", "fee", "swap", "profit")}
        entry_cash_subtotal = (sum(cash_totals.values(), Decimal(0))
                               if all(value is not None for value in cash_totals.values()) else None)
        cash = {name: _str(value) if value is not None else None for name, value in cash_totals.items()}
        cash["entryDealCashSubtotal"] = _str(entry_cash_subtotal) if entry_cash_subtotal is not None else None
        currency = ref["currency"]
        fill_status = ("OVERFILLED" if volume > ref["requestedVolume"] else
                       "AVAILABLE" if volume == ref["requestedVolume"] else "PARTIAL_FILL")
        orders.append({"orderAttemptId": ref["attemptId"], "brokerTicket": ticket, "status": fill_status,
                       "side": ref["side"], "fillCount": len(rows), "filledVolume": _str(volume),
                       "requestedVolume": _str(ref["requestedVolume"]), "weightedFillPrice": _str(fill),
                       "intendedPrice": _str(ref["intendedPrice"]), "spreadPrice": _str(spread),
                       "signedSlippagePrice": _str(signed_slippage), "signedSlippageTicks": _str(ticks),
                       "estimatedAdverseCost": ({"amount": _str(estimated), "currency": currency,
                           "source": "CALCULATED_FROM_RECORDED_TICK_VALUE"} if estimated is not None else None),
                       "brokerCashCosts": {**cash, "source": "OBSERVED_MERGED_DEAL_FIELDS",
                           "scope": "MATCHED_ENTRY_DEALS",
                           "status": "AVAILABLE" if entry_cash_subtotal is not None else "UNAVAILABLE",
                           "currency": None, "currencyStatus": "UNAVAILABLE"},
                       "latency": {"status": "UNAVAILABLE", "reason": "BROKER_ACK_TIMESTAMP_NOT_RECORDED"},
                       "reference": {"quoteTimeUtc": _time(item["payload"]["orderAttempt"]["quoteSnapshot"]["quoteTimeUtc"]).isoformat().replace("+00:00", "Z"),
                           "requestTimeUtc": ref["requestTimeUtc"].isoformat().replace("+00:00", "Z"), "source": "MT5_VERIFIED"}})
        for row in rows:
            identity = row["dealTicket"]
            if identity not in seen_deals:
                seen_deals.add(identity)
        if fill_status == "AVAILABLE":
            slippage_samples.append(signed_slippage)
            payload = item["payload"]
            attempt_payload = payload.get("orderAttempt") or {}
            group_samples[(payload.get("strategyId") or "UNKNOWN",
                           attempt_payload.get("sessionId") or "UNKNOWN",
                           attempt_payload.get("regimeId") or "UNKNOWN")].append({
                               "slippage": signed_slippage, "spread": spread,
                               "adverseCost": estimated, "currency": currency,
                               "cash": {**cash_totals, "entryDealCashSubtotal": entry_cash_subtotal}})

    percentiles = None
    if len(slippage_samples) >= minimum_samples:
        percentiles = {"p50": _str(_linear_percentile(slippage_samples, 0.5)),
                       "p95": _str(_linear_percentile(slippage_samples, 0.95)),
                       "max": _str(max(slippage_samples))}
    grouped = []
    for (strategy, session, regime), values in sorted(group_samples.items()):
        slippage_values = [value["slippage"] for value in values]
        cash_aggregates = {}
        for name in ("commission", "fee", "swap", "profit", "entryDealCashSubtotal"):
            numbers = [value["cash"][name] for value in values
                       if isinstance(value["cash"].get(name), Decimal)]
            cash_aggregates[name] = {"observedCount": len(numbers),
                                     "sum": _str(sum(numbers, Decimal(0))) if numbers else None,
                                     "currency": None}
        adverse_costs = [value["adverseCost"] for value in values if value["adverseCost"] is not None]
        cost_currencies = {value["currency"] for value in values if value["adverseCost"] is not None}
        grouped.append({"strategyId": strategy, "sessionId": session, "regimeId": regime,
                        "sampleCount": len(values),
                        "percentiles": ({"p50": _str(_linear_percentile(slippage_values, .5)),
                                         "p95": _str(_linear_percentile(slippage_values, .95)),
                                         "max": _str(max(slippage_values))}
                                        if len(values) >= minimum_samples else None),
                        "spreadPricePercentiles": ({"p50": _str(_linear_percentile([v["spread"] for v in values], .5)),
                                                     "p95": _str(_linear_percentile([v["spread"] for v in values], .95))}
                                                    if len(values) >= minimum_samples else None),
                        "estimatedAdverseCost": ({"sampleCount": len(adverse_costs),
                            "sum": _str(sum(adverse_costs, Decimal(0))),
                            "currency": next(iter(cost_currencies)) if len(cost_currencies) == 1 else None}
                            if len(adverse_costs) == len(values) and len(cost_currencies) == 1 else None),
                        "brokerCashTotals": {"scope": "MATCHED_ENTRY_DEALS", "fields": cash_aggregates,
                                             "currency": None, "currencyStatus": "UNAVAILABLE"}})
    return {"schemaVersion": 1, "account": account_id, "symbol": symbol, "canExecute": False,
            "orders": orders, "summary": {"sampleCount": len(slippage_samples),
                "matchedDealCount": len(seen_deals), "percentiles": percentiles,
                "groups": grouped,
                "spreadPlusSlippageAddedToBrokerPnl": False,
                "status": "AVAILABLE" if slippage_samples else "UNAVAILABLE"}}
