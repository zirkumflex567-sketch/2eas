"""Read-only diagnostics for the deployed GoldM15 v1.21 preset, M15 close shift 1."""
import json
import math
import struct
from pathlib import Path

import numpy as np

EA_ROOT = Path(r'C:\Users\zirku\Documents\goldm5')
PRESET = EA_ROOT / '.mt5-demo' / 'MQL5' / 'Presets' / 'GoldM15_Demo_Guarded.set'
GUARD_FILE = Path.home() / 'AppData/Roaming/MetaQuotes/Terminal/Common/Files/GoldM15Risk_573369822.state'


def parameters():
    """The released/deployed preset is configuration, not proof of runtime properties."""
    raw = PRESET.read_bytes()
    text = raw.decode('utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')
    result = {}
    for line in text.splitlines():
        if '=' in line and not line.lstrip().startswith(';'):
            key, value = line.split('=', 1)
            value = value.split('||')[0]
            try:
                result[key] = float(value)
            except ValueError:
                result[key] = value
    return result


def wilder_rsi(closes, period):
    closes = np.asarray(closes, dtype=float)
    output = np.full(len(closes), np.nan)
    if len(closes) <= period:
        return output
    diff = np.diff(closes)
    gain = np.maximum(diff, 0)
    loss = np.maximum(-diff, 0)
    avg_gain, avg_loss = gain[:period].mean(), loss[:period].mean()
    def value(g, l):
        return (100 - 100 / (1 + g/l)) if l else (100. if g else 50.)
    output[period] = value(avg_gain, avg_loss)
    for i in range(period + 1, len(closes)):
        avg_gain = (avg_gain * (period - 1) + gain[i-1]) / period
        avg_loss = (avg_loss * (period - 1) + loss[i-1]) / period
        output[i] = value(avg_gain, avg_loss)
    return output


def metrics(closes, params=None):
    params = params or parameters()
    closed = np.asarray(closes, dtype=float)[:-1]
    if len(closed) < 100:
        raise ValueError('Zu wenig abgeschlossene M15-Kerzen.')
    slots, matrix, exits = [], [], []
    cache = {}
    def rsi(period):
        period = int(period)
        if period not in cache:
            cache[period] = float(wilder_rsi(closed, period)[-1])
        return cache[period]
    for index in range(1, 4):
        p = lambda field: params[f'S{index}_{field}']
        fast, buy_slow, sell_slow = rsi(p('FastRSI')), rsi(p('BuyTrendRSI')), rsi(p('SellTrendRSI'))
        buy_trend = buy_slow >= p('BuyTrend')
        sell_trend = sell_slow <= p('SellTrend')
        buy_pull = fast <= p('BuyEntry')
        sell_pull = fast >= p('SellEntry')
        buy_period, sell_period = int(p('BuyMomentumPeriod')), int(p('SellMomentumPeriod'))
        buy_roc = float(100 * (closed[-1] / closed[-1-buy_period] - 1))
        sell_roc = float(100 * (closed[-1] / closed[-1-sell_period] - 1))
        slot = dict(slot=index, fast_rsi=fast, buy_rsi=buy_slow, sell_rsi=sell_slow,
                    buy_signal=bool(buy_trend and buy_pull), sell_signal=bool(sell_trend and sell_pull and not (buy_trend and buy_pull)),
                    buy_period=buy_period, sell_period=sell_period, buy_target=p('BuyMomentumThreshold'), sell_target=p('SellMomentumThreshold'),
                    buy_roc=buy_roc, sell_roc=sell_roc)
        slots.append(slot)
        matrix.extend([
            dict(id=f's{index}_trend', name=f'S{index} · RSI-Trend', current_val=f"L {buy_slow:.1f} / S {sell_slow:.1f}",
                 long_met=bool(buy_trend), short_met=bool(sell_trend), long_note=f"RSI{int(p('BuyTrendRSI'))} ≥ {p('BuyTrend'):g}", short_note=f"RSI{int(p('SellTrendRSI'))} ≤ {p('SellTrend'):g}"),
            dict(id=f's{index}_pullback', name=f'S{index} · RSI-Pullback', current_val=f"RSI{int(p('FastRSI'))} {fast:.1f}",
                 long_met=bool(buy_pull), short_met=bool(sell_pull), long_note=f"≤ {p('BuyEntry'):g}", short_note=f"≥ {p('SellEntry'):g}"),
        ])
        exits.append(dict(slot=index, long_met=buy_roc+1e-10 >= p('BuyMomentumThreshold'), short_met=sell_roc-1e-10 <= -p('SellMomentumThreshold'),
                          long_note=f"ROC {buy_period} ≥ +{p('BuyMomentumThreshold'):g}%", short_note=f"ROC {sell_period} ≤ −{p('SellMomentumThreshold'):g}%",
                          long_value=buy_roc, short_value=sell_roc))
    buy_count = sum(r['long_met'] for r in matrix)
    sell_count = sum(r['short_met'] for r in matrix)
    buy_signals = [s['slot'] for s in slots if s['buy_signal']]
    sell_signals = [s['slot'] for s in slots if s['sell_signal']]
    diagnosis = f"M15-Schluss · Long-Signale: {buy_signals or 'keine'} · Short-Signale: {sell_signals or 'keine'}. Einstieg zusätzlich von Slot-Belegung und EA-Schutzfiltern abhängig."
    return dict(slots=slots, rules_matrix=matrix, exit_goals=exits, rule_count=len(matrix), buy_met_count=buy_count,
                sell_met_count=sell_count, buy_readiness=round(100*buy_count/len(matrix)), sell_readiness=round(100*sell_count/len(matrix)),
                trend_name='RSI-PULLBACK · 3 SYSTEME', trend_direction='BULLISH' if buy_count>=sell_count else 'BEARISH',
                trend_diagnosis=diagnosis, short_missing=diagnosis, active_focus='M15 SCHLUSSSIGNAL')


def read_guard(path, server_timestamp, equity, params=None, balance=None):
    params = params or parameters()
    initial, minimum = params['InitialBalanceUSD'], params['MinimumAccountUSD']
    limit = initial * params['DailyLossPercent'] / 100
    value = min(equity, balance) if balance is not None else equity
    result = dict(baseline_verified=False, baseline=None, daily_buffer_usd=None, daily_protected_buffer_usd=None,
                  daily_limit_usd=limit, hard_floor_usd=minimum, hard_protected_floor_usd=minimum+params['HardReserveUSD'],
                  hard_buffer_usd=value-minimum-params['HardReserveUSD'], hard_lock=None, daily_lock=None,
                  note='EA-Baseline nicht verfügbar; Schutzstatus unbekannt. Dashboard-Reset verändert keine EA-Sperre.')
    try:
        version, day, base, known, hard, daily, reset_hour = struct.unpack('<iqdiiii', Path(path).read_bytes())
        current_day = int((server_timestamp-reset_hour*3600)//86400)*86400+reset_hour*3600
        state_valid = version==121 and known in (0,1) and hard in (0,1) and daily in (0,1) and 0<=reset_hour<=23 and reset_hour==int(params['RiskResetHourServer']) and math.isfinite(base)
        valid = state_valid and known==1 and day==current_day and base>0
        result.update(baseline_verified=valid)
        if state_valid:
            result.update(hard_lock=bool(hard), daily_lock=bool(daily) if day==current_day else None)
        if valid:
            result.update(baseline=base, daily_buffer_usd=value-(base-limit),
                          daily_protected_buffer_usd=value-(base-limit+params['DailyReserveUSD']),
                          note='EA-Baseline bestätigt · fixe $350 Tagesgrenze, $75 Tagesreserve, $100 Gesamtreserve. Dashboard-Reset ändert nur die Anzeige.')
    except (OSError, ValueError, struct.error):
        pass
    return result
