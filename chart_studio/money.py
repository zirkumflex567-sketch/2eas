"""Pure scenario input validation and MT5-backed, read-only money calculations.

Never fall back from MT5 order_calc_profit to naive volume*contract_size.
No order_send, order_check, order_modify or trading mutation exists here.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


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
                         risk_budget=None, risk_percent=None):
    """Find the largest broker lot step whose MT5 gross stop loss fits budget.

    A risk percentage uses the verified account equity. The returned currency
    is the account currency; no cross-currency conversion is inferred.
    """
    if side not in ("BUY", "SELL"):
        raise PreviewError("INVALID_DIRECTION", "Nur BUY oder SELL erlaubt.")
    if (risk_budget is None) == (risk_percent is None):
        raise PreviewError("INVALID_INPUT", "Genau ein Risikobudget oder Equity-Prozent angeben.")
    entry = finite_positive(entry, "entry")
    stop = finite_positive(stop, "SL")
    tick = finite_positive(float(getattr(symbol_info, "trade_tick_size", 0) or 0), "trade_tick_size")
    if not tick_aligned(entry, tick) or not tick_aligned(stop, tick):
        raise PreviewError("INVALID_PRICE_GRID", "Entry und SL müssen auf dem Broker-Tickraster liegen.")
    if (side == "BUY" and stop >= entry) or (side == "SELL" and stop <= entry):
        raise PreviewError("INVALID_STOP_SIDE", "Der SL muss auf der Verlustseite des Einstiegs liegen.")
    currency = str(getattr(account_info, "currency", "") or "").upper()
    if not currency:
        raise PreviewError("ACCOUNT_CURRENCY_UNKNOWN", "MT5-Kontowährung nicht verfügbar.")
    if risk_percent is not None:
        percent = finite_positive(risk_percent, "riskPercent")
        if percent > 100:
            raise PreviewError("INVALID_INPUT", "Equity-Risiko muss höchstens 100 Prozent betragen.")
        equity = finite_positive(getattr(account_info, "equity", None), "equity")
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
        result = mt5.order_calc_profit(action, symbol, volume, entry, stop)
        if result is None or isinstance(result, bool) or not isinstance(result, (float, int)) or not math.isfinite(result) or result >= 0:
            raise PreviewError("BROKER_CALC_UNAVAILABLE", "MT5-Risikoberechnung nicht verfügbar.")
        return volume, -float(result)

    tolerance = max(1e-8, budget * 1e-10)
    selected = None
    previous_risk = None
    for step_count in range(max_steps + 1):
        volume, candidate_risk = loss_at(step_count)
        if previous_risk is not None and candidate_risk + max(1e-8, previous_risk * 1e-10) < previous_risk:
            raise PreviewError("BROKER_CALC_INVALID", "MT5-Risikokurve sinkt bei steigender Lotgröße.")
        previous_risk = candidate_risk
        if step_count == 0 and candidate_risk > budget + tolerance:
            raise PreviewError("RISK_BELOW_MINIMUM", "Das Risikobudget reicht nicht für die kleinste Broker-Lotgröße.")
        if candidate_risk <= budget + tolerance:
            selected = (volume, candidate_risk)
    if selected is None:
        raise PreviewError("RISK_BELOW_MINIMUM", "Das Risikobudget reicht nicht für die kleinste Broker-Lotgröße.")
    volume, actual_risk = selected
    return {
        "mode": "RISK_BUDGET" if percent is None else "EQUITY_PERCENT",
        "volumeLots": volume,
        "riskBudget": round(budget, 8),
        "riskPercent": percent,
        "grossStopRisk": round(actual_risk, 8),
        "unusedRiskBudget": round(max(0.0, budget - actual_risk), 8),
        "currency": currency,
    }


def preview_scenario(mt5, account_info, symbol_info, *, symbol, side, volume=None, entry, stop, target,
                     risk_budget=None, risk_percent=None):
    """Compute broker authoritative prospective GROSS PnL in account currency.

    Scenario is strictly NOT a broker order and is NOT a stop-modification preview.
    """
    sizing = None
    if volume is None:
        # Reject malformed geometry before making repeated broker calculation
        # calls for lot search.
        validate_plan(side=side, volume=getattr(symbol_info, "volume_min", 0),
                      entry=entry, stop=stop, target=target, info=symbol_info)
        sizing = size_for_risk_budget(mt5, account_info, symbol_info, symbol=symbol,
                                      side=side, entry=entry, stop=stop,
                                      risk_budget=risk_budget, risk_percent=risk_percent)
        volume = sizing["volumeLots"]
    elif risk_budget is not None or risk_percent is not None:
        raise PreviewError("INVALID_INPUT", "Feste Lots und Risikobudget schließen sich aus.")
    volume, entry, stop, target = validate_plan(
        side=side, volume=volume, entry=entry, stop=stop, target=target, info=symbol_info
    )
    action = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
    pnl_stop = mt5.order_calc_profit(action, symbol, volume, entry, stop)
    pnl_target = mt5.order_calc_profit(action, symbol, volume, entry, target)
    margin = mt5.order_calc_margin(action, symbol, volume, entry)
    if any(v is None or not isinstance(v, (float, int)) or not math.isfinite(v)
           for v in (pnl_stop, pnl_target, margin)):
        raise PreviewError("BROKER_CALC_UNAVAILABLE", "MT5-Preis- oder Marginberechnung nicht verfügbar.")
    if pnl_stop >= 0 or pnl_target <= 0 or margin < 0:
        raise PreviewError("BROKER_CALC_INVALID", "MT5-Berechnung hat unplausible Vorzeichen.")
    currency = str(getattr(account_info, "currency", "") or "").upper()
    if not currency:
        raise PreviewError("ACCOUNT_CURRENCY_UNKNOWN", "MT5-Kontowährung nicht verfügbar.")
    # USD only if account itself denominates USD; conversion is future work.
    usd = currency == "USD"
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
        "riskUsd": round(-float(pnl_stop),2) if usd else None,
        "rewardUsd": round(float(pnl_target),2) if usd else None,
        "riskRewardRatio": round(float(pnl_target) / -float(pnl_stop), 3),
        "margin": {"amount": round(float(margin),2), "currency": currency},
        "positionSizing": sizing or {"mode": "FIXED_LOTS", "volumeLots": volume, "currency": currency},
        "warnings": ["Schätzung ohne künftige Gebühren, Slippage oder Overnight-Gaps."],
        "serverVerified": True,
        "canExecute": False,
    }
