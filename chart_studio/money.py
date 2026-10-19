"""Pure scenario input validation and MT5-backed, read-only money calculations.

Never fall back from MT5 order_calc_profit to naive volume*contract_size.
No order_send, order_check, order_modify or trading mutation exists here.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from .currency_conversion import convert_amounts_to_usd


class PreviewError(ValueError):
    def __init__(self, code: str, description: str):
        self.code = code
        super().__init__(description)


# Covers XAUUSD's currently verified 0.01..100.00 / 0.01 volume grid
# (9,999 steps on both configured demo terminals) while keeping work bounded.
MAX_SIZING_STEPS = 10_000


def finite_positive(value, label):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise PreviewError("INVALID_INPUT", f"{label}: Zahlenwert erwartet.")
    if not math.isfinite(value) or value <= 0:
        raise PreviewError("INVALID_INPUT", f"{label}: endlicher Wert > 0 erforderlich.")
    return float(value)


def cost_assumptions(fees_per_lot, slippage_ticks):
    if isinstance(fees_per_lot, bool) or not isinstance(fees_per_lot, (int, float)) or not math.isfinite(fees_per_lot) or not 0 <= fees_per_lot <= 10_000:
        raise PreviewError("INVALID_COST_ASSUMPTION", "Roundtrip-Gebühren pro Lot müssen zwischen 0 und 10000 liegen.")
    if isinstance(slippage_ticks, bool) or not isinstance(slippage_ticks, int) or not 0 <= slippage_ticks <= 1000:
        raise PreviewError("INVALID_COST_ASSUMPTION", "Slippage muss 0–1000 ganze Ticks betragen.")
    return float(fees_per_lot), slippage_ticks


def drawdown_projection(*, currency, daily_drawdown, scenario_risk, quote_time_utc):
    """Project an assumed stop loss against the dashboard's current DD model.

    This is a display estimate only. It is never an EA guard or trade permission.
    """
    guard = {"state": "UNKNOWN", "source": "NONE"}
    def unavailable(reason):
        return {"state": "UNAVAILABLE", "reason": reason, "currency": currency or None,
                "source": "NONE", "quoteTimeUtc": None, "eaGuard": guard}
    if str(currency or "").upper() != "USD":
        return unavailable("Kontowährung ist nicht USD; keine FX-Umrechnung verfügbar.")
    if not isinstance(daily_drawdown, dict) or not isinstance(quote_time_utc, str) or not quote_time_utc.strip():
        return unavailable("Frische Tages-DD-Daten oder Quotezeit fehlen.")
    if not isinstance(scenario_risk, (int, float)) or isinstance(scenario_risk, bool) or not math.isfinite(scenario_risk) or scenario_risk <= 0:
        return unavailable("Szenario-Stopprisiko ist nicht verfügbar.")
    values = (daily_drawdown.get("loss_usd"), daily_drawdown.get("limit_pct"), daily_drawdown.get("daily_ref"))
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
        return unavailable("Tagesverlust oder DD-Grenze ist unbekannt.")
    current_loss, limit_pct, daily_ref = map(float, values)
    if current_loss < 0 or not 0 < limit_pct <= 100 or daily_ref <= 0:
        return unavailable("Tages-DD-Daten sind ungültig.")
    daily_limit = daily_ref * limit_pct / 100
    projected_loss = current_loss + float(scenario_risk)
    remaining = daily_limit - projected_loss
    return {"state": "AVAILABLE", "source": "DASHBOARD_DD_ESTIMATE", "currency": "USD",
            "quoteTimeUtc": quote_time_utc, "currentLoss": round(current_loss, 2),
            "dailyLimit": round(daily_limit, 2), "scenarioStopRisk": round(float(scenario_risk), 2),
            "projectedLoss": round(projected_loss, 2), "remainingToLimit": round(remaining, 2),
            "wouldExceedLimit": remaining < 0, "eaGuard": guard}


def tick_aligned(value, tick_size):
    # Use integer distance, not textual digits or rounded percentage.
    ticks = round(value / tick_size)
    return abs(value - ticks * tick_size) <= max(1e-8, tick_size * 1e-6)


def validate_plan(*, side, volume, entry, stop, target, info):
    if side not in ("BUY", "SELL"):
        raise PreviewError("INVALID_DIRECTION", "Nur BUY oder SELL erlaubt.")
    volume = finite_positive(volume, "lots")
    entry = finite_positive(entry, "entry")
    stop = finite_positive(stop, "SL")
    target = finite_positive(target, "TP")
    tick = finite_positive(float(getattr(info, "trade_tick_size", 0) or 0), "trade_tick_size")
    min_lot = finite_positive(float(getattr(info, "volume_min", 0) or 0), "volume_min")
    max_lot = finite_positive(float(getattr(info, "volume_max", 0) or 0), "volume_max")
    lot_step = finite_positive(float(getattr(info, "volume_step", 0) or 0), "volume_step")
    if not min_lot - 1e-8 <= volume <= max_lot + 1e-8:
        raise PreviewError("INVALID_LOTS", "Lotgröße außerhalb der Brokergrenzen.")
    step_count = round((volume - min_lot) / lot_step)
    if abs((min_lot + step_count * lot_step) - volume) > max(1e-8, lot_step*1e-6):
        raise PreviewError("INVALID_LOTS", "Lotgröße entspricht nicht dem Lot-Step.")
    for val in (entry, stop, target):
        if not tick_aligned(val, tick):
            raise PreviewError("INVALID_PRICE_GRID", "Entry, SL und TP müssen auf dem Broker-Tickraster liegen.")
    if side == "BUY" and not (stop < entry < target):
        raise PreviewError("INVALID_STOP_SIDE", "BUY benötigt SL < Einstieg < TP.")
    if side == "SELL" and not (target < entry < stop):
        raise PreviewError("INVALID_STOP_SIDE", "SELL benötigt TP < Einstieg < SL.")
    return volume, entry, stop, target


def size_for_risk_budget(mt5, account_info, symbol_info, *, symbol, side, entry, stop,
                         risk_budget=None, risk_percent=None, fees_per_lot=0,
                         slippage_ticks=0):
    """Find the largest broker lot step whose assumed stop risk fits budget.

    A risk percentage uses the verified account equity. The returned currency
    is the account currency; no cross-currency conversion is inferred.
    """
    if side not in ("BUY", "SELL"):
        raise PreviewError("INVALID_DIRECTION", "Nur BUY oder SELL erlaubt.")
    fees_per_lot, slippage_ticks = cost_assumptions(fees_per_lot, slippage_ticks)
    if (risk_budget is None) == (risk_percent is None):
        raise PreviewError("INVALID_INPUT", "Genau ein Risikobudget oder Equity-Prozent angeben.")
    entry = finite_positive(entry, "entry")
    stop = finite_positive(stop, "SL")
    tick = finite_positive(float(getattr(symbol_info, "trade_tick_size", 0) or 0), "trade_tick_size")
    if not tick_aligned(entry, tick) or not tick_aligned(stop, tick):
        raise PreviewError("INVALID_PRICE_GRID", "Entry und SL müssen auf dem Broker-Tickraster liegen.")
    if (side == "BUY" and stop >= entry) or (side == "SELL" and stop <= entry):
        raise PreviewError("INVALID_STOP_SIDE", "Der SL muss auf der Verlustseite des Einstiegs liegen.")
    adverse_stop = stop - slippage_ticks * tick * (1 if side == "BUY" else -1)
    if (side == "BUY" and adverse_stop >= entry) or (side == "SELL" and adverse_stop <= entry):
        raise PreviewError("SLIPPAGE_ASSUMPTION_TOO_LARGE", "Slippageannahme überschreitet die Stopdistanz.")
    currency = str(getattr(account_info, "currency", "") or "").upper()
    if not currency:
        raise PreviewError("ACCOUNT_CURRENCY_UNKNOWN", "MT5-Kontowährung nicht verfügbar.")
    equity_basis = None
    if risk_percent is not None:
        percent = finite_positive(risk_percent, "riskPercent")
        if percent > 100:
            raise PreviewError("INVALID_INPUT", "Equity-Risiko muss höchstens 100 Prozent betragen.")
        equity = finite_positive(getattr(account_info, "equity", None), "equity")
        equity_basis = equity
        budget = equity * percent / 100
    else:
        percent = None
        budget = finite_positive(risk_budget, "riskBudget")

    minimum = finite_positive(float(getattr(symbol_info, "volume_min", 0) or 0), "volume_min")
    maximum = finite_positive(float(getattr(symbol_info, "volume_max", 0) or 0), "volume_max")
    step = finite_positive(float(getattr(symbol_info, "volume_step", 0) or 0), "volume_step")
    if maximum < minimum:
        raise PreviewError("BROKER_CALC_INVALID", "MT5-Lotgrenzen sind ungültig.")
    max_steps = math.floor((maximum - minimum) / step + 1e-9)
    if max_steps > MAX_SIZING_STEPS:
        raise PreviewError("SIZING_RANGE_TOO_LARGE", "Der Broker-Lotbereich ist für eine sichere Prüfung zu groß.")
    action = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL

    def loss_at(step_count):
        volume = round(minimum + step_count * step, 10)
        result = mt5.order_calc_profit(action, symbol, volume, entry, adverse_stop)
        if result is None or isinstance(result, bool) or not isinstance(result, (float, int)) or not math.isfinite(result) or result >= 0:
            raise PreviewError("BROKER_CALC_UNAVAILABLE", "MT5-Risikoberechnung nicht verfügbar.")
        gross_risk = -float(result)
        estimated_fees = fees_per_lot * volume
        return volume, gross_risk, estimated_fees, gross_risk + estimated_fees

    tolerance = max(1e-8, budget * 1e-10)
    selected = None
    previous_risk = None
    for step_count in range(max_steps + 1):
        volume, gross_risk, estimated_fees, candidate_risk = loss_at(step_count)
        if previous_risk is not None and candidate_risk + max(1e-8, previous_risk * 1e-10) < previous_risk:
            raise PreviewError("BROKER_CALC_INVALID", "MT5-Risikokurve sinkt bei steigender Lotgröße.")
        previous_risk = candidate_risk
        if step_count == 0 and candidate_risk > budget + tolerance:
            raise PreviewError("RISK_BELOW_MINIMUM", "Das Risikobudget reicht nicht für die kleinste Broker-Lotgröße.")
        if candidate_risk <= budget + tolerance:
            selected = (volume, gross_risk, estimated_fees, candidate_risk)
    if selected is None:
        raise PreviewError("RISK_BELOW_MINIMUM", "Das Risikobudget reicht nicht für die kleinste Broker-Lotgröße.")
    volume, gross_risk, estimated_fees, actual_risk = selected
    return {
        "mode": "RISK_BUDGET" if percent is None else "EQUITY_PERCENT",
        "volumeLots": volume,
        "riskBudget": round(budget, 8),
        "riskPercent": percent,
        "equityBasis": round(equity_basis, 8) if equity_basis is not None else None,
        "grossStopRisk": round(gross_risk, 8),
        "estimatedFees": round(estimated_fees, 8),
        "estimatedTotalStopRisk": round(actual_risk, 8),
        "assumedSlippageTicks": slippage_ticks,
        "unusedRiskBudget": round(max(0.0, budget - actual_risk), 8),
        "currency": currency,
    }


def preview_scenario(mt5, account_info, symbol_info, *, symbol, side, volume=None, entry, stop, target,
                     risk_budget=None, risk_percent=None, fees_per_lot=0,
                     slippage_ticks=0, now_ms=None):
    """Compute broker authoritative prospective GROSS PnL in account currency.

    Scenario is strictly NOT a broker order and is NOT a stop-modification preview.
    """
    fees_per_lot, slippage_ticks = cost_assumptions(fees_per_lot, slippage_ticks)
    sizing = None
    if volume is None:
        # Reject malformed geometry before making repeated broker calculation
        # calls for lot search.
        validate_plan(side=side, volume=getattr(symbol_info, "volume_min", 0),
                      entry=entry, stop=stop, target=target, info=symbol_info)
        sizing = size_for_risk_budget(mt5, account_info, symbol_info, symbol=symbol,
                                      side=side, entry=entry, stop=stop,
                                      risk_budget=risk_budget, risk_percent=risk_percent,
                                      fees_per_lot=fees_per_lot, slippage_ticks=slippage_ticks)
        volume = sizing["volumeLots"]
    elif risk_budget is not None or risk_percent is not None:
        raise PreviewError("INVALID_INPUT", "Feste Lots und Risikobudget schließen sich aus.")
    volume, entry, stop, target = validate_plan(
        side=side, volume=volume, entry=entry, stop=stop, target=target, info=symbol_info
    )
    action = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
    pnl_stop = mt5.order_calc_profit(action, symbol, volume, entry, stop)
    pnl_target = mt5.order_calc_profit(action, symbol, volume, entry, target)
    tick = finite_positive(float(getattr(symbol_info, "trade_tick_size", 0) or 0), "trade_tick_size")
    adverse_sign = 1 if side == "BUY" else -1
    slipped_stop = stop - slippage_ticks * tick * adverse_sign
    slipped_target = target - slippage_ticks * tick * adverse_sign
    slipped_stop_pnl = pnl_stop if not slippage_ticks else mt5.order_calc_profit(action, symbol, volume, entry, slipped_stop)
    slipped_target_pnl = pnl_target if not slippage_ticks else mt5.order_calc_profit(action, symbol, volume, entry, slipped_target)
    margin = mt5.order_calc_margin(action, symbol, volume, entry)
    if any(v is None or isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v)
           for v in (pnl_stop, pnl_target, slipped_stop_pnl, slipped_target_pnl, margin)):
        raise PreviewError("BROKER_CALC_UNAVAILABLE", "MT5-Preis- oder Marginberechnung nicht verfügbar.")
    if pnl_stop >= 0 or pnl_target <= 0 or margin < 0:
        raise PreviewError("BROKER_CALC_INVALID", "MT5-Berechnung hat unplausible Vorzeichen.")
    currency = str(getattr(account_info, "currency", "") or "").upper()
    if not currency:
        raise PreviewError("ACCOUNT_CURRENCY_UNKNOWN", "MT5-Kontowährung nicht verfügbar.")
    free_margin = getattr(account_info, "margin_free", None)
    valid_free_margin = (isinstance(free_margin, (int, float)) and not isinstance(free_margin, bool)
                         and math.isfinite(free_margin) and free_margin >= 0)
    margin_assessment = {
        "state": ("WITHIN_FREE_MARGIN" if valid_free_margin and margin <= free_margin else
                  "EXCEEDS_FREE_MARGIN" if valid_free_margin else "UNAVAILABLE"),
        "required": round(float(margin), 2),
        "free": round(float(free_margin), 2) if valid_free_margin else None,
        "estimatedFreeAfter": round(float(free_margin) - float(margin), 2) if valid_free_margin else None,
        "currency": currency,
        "source": "MT5_ACCOUNT_INFO" if valid_free_margin else "NONE",
        "note": "Snapshot-Schätzung; order_calc_margin berücksichtigt bestehende Positionen und Pending Orders nicht.",
    }
    usd_conversion = convert_amounts_to_usd(mt5, {"stop":float(pnl_stop),"target":float(pnl_target)},
                                            currency, now_ms=now_ms)
    usd_available = usd_conversion["state"] == "AVAILABLE"
    stop_usd = usd_conversion.get("amountsUsd",{}).get("stop")
    target_usd = usd_conversion.get("amountsUsd",{}).get("target")
    assumed_fees = fees_per_lot * volume
    net_stop = float(slipped_stop_pnl) - assumed_fees
    net_target = float(slipped_target_pnl) - assumed_fees
    net_ratio = round(net_target / -net_stop, 3) if net_stop < 0 < net_target else None
    return {
        "mode": "READ_ONLY_DRAFT",
        "symbol": symbol,
        "side": side,
        "volumeLots": volume,
        "entryPrice": entry,
        "slPrice": stop,
        "tpPrice": target,
        "pnlAtSl": {"amount": round(float(pnl_stop), 2), "currency": currency,
                    "kind": "brokerEstimatedGross"},
        "pnlAtTp": {"amount": round(float(pnl_target), 2), "currency": currency,
                    "kind": "brokerEstimatedGross"},
        "riskUsd": round(-stop_usd,2) if usd_available else None,
        "rewardUsd": round(target_usd,2) if usd_available else None,
        "usdConversion": {"state":"AVAILABLE", "source":usd_conversion["source"],
                           "symbol":usd_conversion.get("symbol"), "quoteTimeUtc":usd_conversion.get("quoteTimeUtc"),
                           "conversionSides":usd_conversion.get("conversionSides",{})}
                          if usd_available else {"state":"UNAVAILABLE",
                                                 "reason":usd_conversion.get("reason"),"source":"NONE"},
        "riskRewardRatio": round(float(pnl_target) / -float(pnl_stop), 3),
        "margin": {"amount": round(float(margin),2), "currency": currency},
        "marginAssessment": margin_assessment,
        "positionSizing": sizing or {"mode": "FIXED_LOTS", "volumeLots": volume, "currency": currency},
        "estimatedCosts": {
            "source": "USER_ASSUMPTION", "currency": currency,
            "feesPerLot": round(fees_per_lot, 8), "feesTotal": round(assumed_fees, 2),
            "slippageTicks": slippage_ticks,
            "slippageAtStop": round(float(pnl_stop) - float(slipped_stop_pnl), 2),
            "slippageAtTarget": round(float(pnl_target) - float(slipped_target_pnl), 2),
        },
        "netEstimate": {
            "kind": "userAssumptionsEstimate",
            "pnlAtSl": {"amount": round(net_stop, 2), "currency": currency},
            "pnlAtTp": {"amount": round(net_target, 2), "currency": currency},
            "riskRewardRatio": net_ratio,
        },
        "warnings": ["Netto ist eine User-Annahme; tatsächliche Gebühren, Ausführung, Swap und Overnight-Gaps können abweichen."],
        "serverVerified": True,
        "canExecute": False,
    }
