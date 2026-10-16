"""Pure, deterministic market-regime snapshots for completed MT5 candles."""
from datetime import datetime, timezone
from copy import deepcopy
import math
import statistics


MODEL_REVISION = 'market-regime-v1'
FRAME_SECONDS = {'M1': 60, 'M5': 300, 'M15': 900, 'M30': 1800,
                 'H1': 3600, 'H4': 14400, 'D1': 86400}
MAX_BARS = 500
MIN_BARS = 160
FEATURE_NAMES = ('atr14', 'adx14', 'ema20SlopeAtr5', 'ema20Ema50SeparationAtr',
                 'realizedVol20', 'bollingerWidth20')

THRESHOLDS = {
    'lookback': {'atr': 14, 'adx': 14, 'emaFast': 20, 'emaSlow': 50, 'structure': 20,
                 'emaSlopeBars': 5, 'volatility': 20, 'bollinger': 20,
                 'volatilityBaselineBars': 100},
    'trend': {'entryAdx': 25.0, 'entrySlopeAtr': 0.20, 'entrySeparationAtr': 0.10,
              'exitAdx': 20.0, 'exitSlopeAtr': 0.10, 'entryBars': 3, 'exitBars': 2},
    'volatility': {'highEntryRatio': 1.50, 'highExitRatio': 1.25,
                   'lowEntryRatio': 0.67, 'lowExitRatio': 0.80,
                   'entryBars': 3, 'exitBars': 2},
}

PRIORITY_RULES = [
    'Invalid candles or missing warm-up make trend and volatility UNKNOWN.',
    'Trend and volatility are independent dimensions and may be active together.',
    'The 20-bar structure state describes a close outside the prior 20-bar range and never overrides trend or volatility.',
    'Trend is UP or DOWN only after three qualifying closed bars; inactive trend is RANGING only below ADX 20, otherwise TRANSITION.',
    'Volatility is independently HIGH, LOW, or NORMAL after its hysteresis.',
    'Event risk and news risk remain UNKNOWN until a verified calendar is available; missing events do not mean no risk.',
]


def _as_epoch(value):
    if not isinstance(value, str):
        raise ValueError('asOfUtc must be an ISO UTC timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError('asOfUtc must be UTC')
    return parsed.timestamp(), parsed.astimezone(timezone.utc).isoformat()


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('invalid candle number')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('invalid candle number')
    return value


def _prepare(rows, frame, cutoff):
    if frame not in FRAME_SECONDS or not isinstance(rows, (list, tuple)):
        raise ValueError('invalid frame or candles')
    if len(rows) > MAX_BARS:
        raise ValueError('too many candles')
    selected = []
    previous = None
    for row in rows:
        try:
            stamp = row['time']
            if isinstance(stamp, bool) or not isinstance(stamp, int) or stamp <= 0:
                raise ValueError('invalid timestamp')
            if previous is not None and stamp <= previous:
                raise ValueError('unordered timestamps')
            previous = stamp
            # Exclude the live/incomplete bar before validating its prices.
            if stamp + FRAME_SECONDS[frame] > cutoff:
                continue
            candle = {key: _number(row[key]) for key in ('open', 'high', 'low', 'close')}
            if min(candle.values()) <= 0 or candle['high'] < max(candle['open'], candle['close']) or candle['low'] > min(candle['open'], candle['close']) or candle['high'] <= candle['low']:
                raise ValueError('inconsistent OHLC')
            selected.append({'time': stamp, **candle})
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError('invalid candle series') from exc
    return selected


def _wilder(values, period):
    result = [None] * len(values)
    if len(values) < period:
        return result
    smoothed = math.fsum(values[:period]) / period
    result[period - 1] = smoothed
    for index in range(period, len(values)):
        smoothed = (smoothed * (period - 1) + values[index]) / period
        result[index] = smoothed
    return result


def _features(rows):
    count = len(rows)
    highs = [row['high'] for row in rows]
    lows = [row['low'] for row in rows]
    closes = [row['close'] for row in rows]
    true_ranges, plus_dm, minus_dm = [], [], []
    for index in range(1, count):
        up, down = highs[index] - highs[index-1], lows[index-1] - lows[index]
        true_ranges.append(max(highs[index] - lows[index], abs(highs[index] - closes[index-1]), abs(lows[index] - closes[index-1])))
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
    atr = [None] + _wilder(true_ranges, 14)
    smoothed_plus, smoothed_minus = _wilder(plus_dm, 14), _wilder(minus_dm, 14)
    dx = [None] * count
    for index in range(1, count):
        tr = atr[index]
        p, m = smoothed_plus[index-1], smoothed_minus[index-1]
        if tr is not None and tr > 0 and p is not None and m is not None:
            plus_di, minus_di = 100*p/tr, 100*m/tr
            dx[index] = 100*abs(plus_di-minus_di)/(plus_di+minus_di) if plus_di+minus_di else 0.0
    valid_dx = [v for v in dx if v is not None]
    adx_values = _wilder(valid_dx, 14)
    adx = [None] * count
    j = 0
    for index, value in enumerate(dx):
        if value is not None:
            adx[index] = adx_values[j]
            j += 1
    ema20, ema50 = [], []
    for period, output in ((20, ema20), (50, ema50)):
        alpha = 2/(period+1)
        current = closes[0]
        for close in closes:
            current += alpha*(close-current)
            output.append(current)
    returns = [None] + [math.log(closes[i]/closes[i-1]) for i in range(1, count)]
    result = []
    for index in range(count):
        realized = width = None
        if index >= 20:
            window = returns[index-19:index+1]
            if all(value is not None for value in window):
                realized = statistics.pstdev(window)
        if index >= 19:
            window = closes[index-19:index+1]
            mean = math.fsum(window)/20
            width = 4*statistics.pstdev(window)/mean if mean else None
        slope = separation = None
        if index >= 5 and atr[index] and atr[index] > 0:
            slope = (ema20[index]-ema20[index-5])/atr[index]
            separation = abs(ema20[index]-ema50[index])/atr[index]
        structure = None
        if index >= 20:
            prior_high, prior_low = max(highs[index-20:index]), min(lows[index-20:index])
            structure = ('BREAKOUT_UP' if closes[index] > prior_high else
                         'BREAKOUT_DOWN' if closes[index] < prior_low else 'INSIDE_RANGE')
        result.append({'atr14': atr[index], 'adx14': adx[index],
                       'ema20SlopeAtr5': slope, 'ema20Ema50SeparationAtr': separation,
                       'realizedVol20': realized, 'bollingerWidth20': width,
                       'structure20': structure})
    return result


def _unknown(*, symbol, timeframe, as_of, bar_count, flag):
    return {'asOfUtc': as_of, 'frame': {'symbol': symbol, 'timeframe': timeframe},
            'features': {**{name: None for name in FEATURE_NAMES}, 'structure20': 'UNKNOWN'},
            'thresholds': deepcopy(THRESHOLDS), 'revision': MODEL_REVISION,
            'regimeTags': {'trend': 'UNKNOWN', 'volatility': 'UNKNOWN',
                           'eventRisk': 'UNKNOWN', 'newsRisk': 'UNKNOWN'},
            'priorityRules': list(PRIORITY_RULES),
            'confidence': {'score': 0.0, 'meaning': 'Datenqualität und Regelabdeckung, keine Wahrscheinlichkeit.'},
            'qualityFlags': [flag, 'CALENDAR_UNAVAILABLE'], 'barCount': bar_count}


def _update_trend_state(trend, entry_streak, exit_streak,
                        direction_candidate, direction_streak, feature):
    rules = THRESHOLDS['trend']
    slope = abs(feature['ema20SlopeAtr5'])
    qualifies = (feature['adx14'] >= rules['entryAdx'] and
                 slope >= rules['entrySlopeAtr'] and
                 feature['ema20Ema50SeparationAtr'] >= rules['entrySeparationAtr'])
    if trend is None:
        entry_streak = entry_streak + 1 if qualifies else 0
        if entry_streak >= rules['entryBars']:
            trend = 'UP' if feature['ema20SlopeAtr5'] > 0 else 'DOWN'
            entry_streak, exit_streak = 0, 0
        return trend, entry_streak, exit_streak, None, 0

    should_exit = (feature['adx14'] < rules['exitAdx'] or
                   slope < rules['exitSlopeAtr'])
    exit_streak = exit_streak + 1 if should_exit else 0
    if should_exit:
        # A nonqualifying bar breaks an opposite-direction entry sequence.
        direction_candidate, direction_streak = None, 0
    if exit_streak >= rules['exitBars']:
        return None, 0, 0, None, 0
    if not should_exit:
        direction = 'UP' if feature['ema20SlopeAtr5'] > 0 else 'DOWN'
        if direction == trend:
            direction_candidate, direction_streak = None, 0
        elif qualifies:
            if direction_candidate == direction:
                direction_streak += 1
            else:
                direction_candidate, direction_streak = direction, 1
            if direction_streak >= rules['entryBars']:
                trend = direction
                direction_candidate, direction_streak = None, 0
        else:
            direction_candidate, direction_streak = None, 0
    return trend, entry_streak, exit_streak, direction_candidate, direction_streak


def classify_regime(rows, *, symbol, timeframe, as_of_utc):
    """Classify completed bars only. This function has no broker or storage effects."""
    cutoff, as_of = _as_epoch(as_of_utc)
    try:
        bars = _prepare(rows, timeframe, cutoff)
    except ValueError:
        return _unknown(symbol=symbol, timeframe=timeframe, as_of=as_of,
                        bar_count=0, flag='INVALID_CANDLES')
    if len(bars) < MIN_BARS:
        return _unknown(symbol=symbol, timeframe=timeframe, as_of=as_of,
                        bar_count=len(bars), flag='INSUFFICIENT_HISTORY')
    series = _features(bars)
    # The final 100 preceding realized-vol values form an as-of-only baseline.
    states_trend, states_vol = [], []
    trend, trend_entry, trend_exit = None, 0, 0
    trend_direction_candidate, trend_direction_streak = None, 0
    volatility, vol_candidate, vol_streak, vol_exit = None, None, 0, 0
    final_ratio = None
    for index, feature in enumerate(series):
        required = [feature[name] for name in FEATURE_NAMES]
        if any(value is None or not math.isfinite(value) for value in required):
            states_trend.append(None); states_vol.append(None); continue
        if index < 100:
            states_trend.append(None); states_vol.append(None); continue
        baseline_values = [item['realizedVol20'] for item in series[max(0,index-100):index]
                           if item['realizedVol20'] is not None]
        if len(baseline_values) < 100 or statistics.median(baseline_values) <= 0:
            states_trend.append(None); states_vol.append(None); continue
        ratio = feature['realizedVol20']/statistics.median(baseline_values)
        final_ratio = ratio
        (trend, trend_entry, trend_exit, trend_direction_candidate,
         trend_direction_streak) = _update_trend_state(
             trend, trend_entry, trend_exit, trend_direction_candidate,
             trend_direction_streak, feature)
        states_trend.append(trend or ('RANGING' if feature['adx14'] < 20 else 'TRANSITION'))
        target = 'HIGH' if ratio >= 1.50 else ('LOW' if ratio <= .67 else 'NORMAL')
        if volatility in ('HIGH', 'LOW'):
            exits = ratio < 1.25 if volatility == 'HIGH' else ratio > .80
            vol_exit = vol_exit + 1 if exits else 0
            if vol_exit >= 2:
                volatility = None; vol_candidate = None; vol_streak = 0; vol_exit = 0
            elif not exits:
                vol_exit = 0
        elif volatility == 'NORMAL':
            exits = target != 'NORMAL'
            vol_exit = vol_exit + 1 if exits else 0
            if vol_exit >= 2:
                volatility = None; vol_exit = 0
            elif not exits:
                vol_exit = 0
        if volatility is None:
            if target == vol_candidate:
                vol_streak += 1
            else:
                vol_candidate, vol_streak = target, 1
            if vol_streak >= 3:
                volatility = target
        states_vol.append(volatility or 'NORMAL')
    last = series[-1]
    if any(last[name] is None for name in FEATURE_NAMES) or states_trend[-1] is None or states_vol[-1] is None:
        return _unknown(symbol=symbol, timeframe=timeframe, as_of=as_of,
                        bar_count=len(bars), flag='INSUFFICIENT_WARMUP')
    return {'asOfUtc': as_of, 'frame': {'symbol': symbol, 'timeframe': timeframe},
            'features': {**{key: round(last[key], 10) for key in FEATURE_NAMES},
                         'structure20': last['structure20'] or 'UNKNOWN'},
            'volatilityBaselineRatio': round(final_ratio, 10) if final_ratio is not None else None,
            'thresholds': deepcopy(THRESHOLDS), 'revision': MODEL_REVISION,
            'regimeTags': {'trend': states_trend[-1], 'volatility': states_vol[-1],
                           'eventRisk': 'UNKNOWN', 'newsRisk': 'UNKNOWN'},
            'priorityRules': list(PRIORITY_RULES),
            'confidence': {'score': 1.0, 'meaning': 'Datenqualität und Regelabdeckung, keine Wahrscheinlichkeit.'},
            'qualityFlags': ['CALENDAR_UNAVAILABLE'], 'barCount': len(bars)}
