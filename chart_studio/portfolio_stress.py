"""Read-only historical joint-shock analysis for a broker portfolio and What-if."""

from datetime import datetime, timezone
import math
import numbers


SOURCE = "HISTORICAL_ALIGNED_H1_SHOCKS"
MIN_OBSERVATIONS = 60


def _positive(value):
    return (isinstance(value, numbers.Real) and not isinstance(value, bool)
            and math.isfinite(float(value)) and float(value) > 0)


def _unavailable(account, scenario_symbol, reason, currency=None):
    return {
        "state": "UNAVAILABLE",
        "reason": reason,
        "source": SOURCE,
        "account": account,
        "scenarioSymbol": scenario_symbol,
        "currency": currency,
        "canExecute": False,
    }


def _percentile(values, fraction):
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _parse_utc(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except (ValueError, OverflowError):
        return None
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        return None
    return parsed.astimezone(timezone.utc)


def historical_portfolio_stress(*, account, currency, scenario, positions, histories,
                                quotes, order_calc_profit, as_of_utc,
                                minimum_observations=MIN_OBSERVATIONS):
    """Revalue actual positions and one proposed position under aligned H1 shocks.

    The output describes an empirical historical stress distribution, not a
    forecast or probability. Every PnL is supplied by the verified MT5 account.
    """
    scenario_symbol = scenario.get("symbol") if isinstance(scenario, dict) else None
    if not isinstance(account, str) or not account or not isinstance(currency, str) or not currency:
        return _unavailable(account, scenario_symbol, "ACCOUNT_SCOPE_UNAVAILABLE")
    if not isinstance(scenario_symbol, str) or not scenario_symbol:
        return _unavailable(account, None, "SCENARIO_INVALID", currency)
    if not isinstance(positions, (list, tuple)) or not isinstance(histories, dict) or not isinstance(quotes, dict):
        return _unavailable(account, scenario_symbol, "INPUT_INVALID", currency)
    if not callable(order_calc_profit):
        return _unavailable(account, scenario_symbol, "BROKER_CALCULATION_UNAVAILABLE", currency)
    as_of = _parse_utc(as_of_utc)
    if as_of is None:
        return _unavailable(account, scenario_symbol, "AS_OF_INVALID", currency)
    if (isinstance(minimum_observations, bool) or not isinstance(minimum_observations, int)
            or minimum_observations < 1 or minimum_observations > 256):
        return _unavailable(account, scenario_symbol, "OBSERVATION_LIMIT_INVALID", currency)

    exposures = []
    for position in positions:
        if not isinstance(position, dict):
            return _unavailable(account, scenario_symbol, "POSITION_INVALID", currency)
        symbol = position.get("symbol")
        side = position.get("side")
        volume = position.get("volume")
        if (position.get("account") != account or not isinstance(symbol, str) or not symbol
                or side not in ("BUY", "SELL") or not _positive(volume)):
            return _unavailable(account, scenario_symbol, "POSITION_SCOPE_OR_VALUE_INVALID", currency)
        exposures.append({"symbol": symbol, "side": side, "volume": float(volume), "kind": "POSITION"})

    side, volume, entry = (scenario.get("side"), scenario.get("volume"), scenario.get("entry"))
    if side not in ("BUY", "SELL") or not _positive(volume) or not _positive(entry):
        return _unavailable(account, scenario_symbol, "SCENARIO_INVALID", currency)
    exposures.append({"symbol": scenario_symbol, "side": side, "volume": float(volume),
                      "kind": "WHAT_IF", "entry": float(entry)})
    symbols = sorted({item["symbol"] for item in exposures})

    aligned = {}
    for symbol in symbols:
        snapshot = histories.get(symbol)
        if (not isinstance(snapshot, dict) or snapshot.get("source") != "MT5_VERIFIED"
                or snapshot.get("account") != account or snapshot.get("symbol") != symbol
                or snapshot.get("timeframe") != "H1" or not isinstance(snapshot.get("bars"), list)):
            return _unavailable(account, scenario_symbol, "HISTORY_SCOPE_OR_SOURCE_INVALID", currency)
        closes = {}
        previous = 0
        for bar in snapshot["bars"]:
            if not isinstance(bar, dict):
                return _unavailable(account, scenario_symbol, "INVALID_HISTORICAL_SERIES", currency)
            stamp, close = bar.get("time"), bar.get("close")
            if (isinstance(stamp, bool) or not isinstance(stamp, numbers.Integral) or stamp <= previous
                    or not _positive(close)):
                return _unavailable(account, scenario_symbol, "INVALID_HISTORICAL_SERIES", currency)
            closes[int(stamp)] = float(close)
            previous = int(stamp)
        aligned[symbol] = closes

    common = set.intersection(*(set(series) for series in aligned.values()))
    stamps = sorted(common)
    if any(stamp <= 0 for stamp in stamps):
        return _unavailable(account, scenario_symbol, "INVALID_HISTORICAL_SERIES", currency)
    shocks = []
    for start, end in zip(stamps, stamps[1:]):
        if end - start != 3600:
            continue
        returns = {symbol: aligned[symbol][end] / aligned[symbol][start] - 1 for symbol in symbols}
        if any(not math.isfinite(value) or value <= -1 for value in returns.values()):
            return _unavailable(account, scenario_symbol, "INVALID_HISTORICAL_SERIES", currency)
        shocks.append((start, end, returns))
    if len(shocks) < minimum_observations:
        return _unavailable(account, scenario_symbol, "INSUFFICIENT_ALIGNED_HISTORY", currency)

    bases = {}
    for symbol in symbols:
        quote = quotes.get(symbol)
        if (not isinstance(quote, dict) or quote.get("source") != "MT5_VERIFIED"
                or quote.get("account") != account or quote.get("symbol") != symbol):
            return _unavailable(account, scenario_symbol, "QUOTE_SCOPE_MISMATCH", currency)
        if quote.get("fresh") is not True:
            return _unavailable(account, scenario_symbol, "QUOTE_NOT_FRESH", currency)
        quote_time = _parse_utc(quote.get("timeUtc"))
        if quote_time is None:
            return _unavailable(account, scenario_symbol, "QUOTE_TIME_INVALID", currency)
        if quote_time > as_of:
            return _unavailable(account, scenario_symbol, "QUOTE_AFTER_AS_OF", currency)
        bid, ask = quote.get("bid"), quote.get("ask")
        if not _positive(bid) or not _positive(ask) or float(ask) < float(bid):
            return _unavailable(account, scenario_symbol, "QUOTE_INVALID", currency)
        bases[symbol] = {"BUY": float(bid), "SELL": float(ask)}

    # Keep invalid future-history requests away from the broker repricing loop.
    # A bad as-of window should not trigger hundreds of unnecessary MT5 calls.
    if shocks[-1][1] > as_of.timestamp():
        return _unavailable(account, scenario_symbol, "HISTORY_AFTER_AS_OF", currency)

    pnls = []
    for _start, _end, returns in shocks:
        scenario_pnl = 0.0
        for exposure in exposures:
            symbol, side = exposure["symbol"], exposure["side"]
            base = exposure.get("entry", bases[symbol][side])
            projected = base * (1 + returns[symbol])
            if not math.isfinite(projected) or projected <= 0:
                return _unavailable(account, scenario_symbol, "INVALID_STRESS_PRICE", currency)
            try:
                value = order_calc_profit(side, symbol, exposure["volume"], base, projected)
            except Exception:
                value = None
            if (value is None or isinstance(value, bool) or not isinstance(value, numbers.Real)
                    or not math.isfinite(float(value))):
                return _unavailable(account, scenario_symbol, "BROKER_CALCULATION_UNAVAILABLE", currency)
            scenario_pnl += float(value)
        if not math.isfinite(scenario_pnl):
            return _unavailable(account, scenario_symbol, "BROKER_CALCULATION_UNAVAILABLE", currency)
        pnls.append(scenario_pnl)

    losses = [max(0.0, -value) for value in pnls]
    start_time = datetime.fromtimestamp(shocks[0][0], timezone.utc).isoformat().replace("+00:00", "Z")
    end_time = datetime.fromtimestamp(shocks[-1][1], timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "state": "AVAILABLE",
        "source": SOURCE,
        "method": "Aligned completed H1 simple returns applied to current verified quotes and broker-priced positions.",
        "account": account,
        "scenarioSymbol": scenario_symbol,
        "portfolioSymbols": sorted({item["symbol"] for item in exposures if item["kind"] == "POSITION"}),
        "currency": currency,
        "sampleCount": len(shocks),
        "sampleStartUtc": start_time,
        "sampleEndUtc": end_time,
        "asOfUtc": as_of_utc,
        "pnl": {"p05": round(_percentile(pnls, .05), 8),
                "p50": round(_percentile(pnls, .50), 8),
                "p95": round(_percentile(pnls, .95), 8)},
        "loss": {"p50": round(_percentile(losses, .50), 8),
                 "p95": round(_percentile(losses, .95), 8),
                 "worst": round(max(losses), 8)},
        "canExecute": False,
    }
