"""Deterministic FR-032 regime contract tests."""
from datetime import datetime, timezone

import pytest

import chart_studio.regimes as regime_model
from chart_studio.regimes import classify_regime


def candles(count=220, *, start=1_790_000_000, step=900, trend=0.15):
    rows = []
    price = 4000.0
    for index in range(count):
        # A deterministic oscillation keeps the series non-degenerate while
        # preserving a clear, reproducible directional component.
        price += trend + ((index % 7) - 3) * 0.025
        rows.append({
            'time': start + index * step,
            'open': price - 0.1,
            'high': price + 0.8 + (index % 3) * 0.02,
            'low': price - 0.8 - (index % 2) * 0.03,
            'close': price,
        })
    return rows


def as_of_after(rows, step=900):
    return datetime.fromtimestamp(rows[-1]['time'] + step, timezone.utc).isoformat()


def test_snapshot_is_stable_explained_and_confidence_is_data_quality_only():
    rows = candles()
    snapshot = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=as_of_after(rows))

    assert snapshot == classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=as_of_after(rows))
    assert snapshot['frame'] == {'symbol': 'XAUUSD', 'timeframe': 'M15'}
    assert snapshot['revision']
    assert snapshot['features']['atr14'] > 0
    assert snapshot['features']['adx14'] >= 0
    assert snapshot['features']['ema20SlopeAtr5'] > 0
    assert snapshot['features']['realizedVol20'] > 0
    assert snapshot['features']['bollingerWidth20'] > 0
    assert snapshot['features']['structure20'] in {'BREAKOUT_UP', 'BREAKOUT_DOWN', 'INSIDE_RANGE'}
    assert snapshot['thresholds']['trend']['entryAdx'] == 25
    assert snapshot['priorityRules']
    assert 0 <= snapshot['confidence']['score'] <= 1
    assert 'probability' not in snapshot['confidence']['meaning'].lower()
    assert snapshot['regimeTags']['eventRisk'] == 'UNKNOWN'
    assert snapshot['regimeTags']['newsRisk'] == 'UNKNOWN'


def test_future_bars_are_excluded_at_as_of_cutoff():
    rows = candles()
    cutoff = datetime.fromtimestamp(rows[-1]['time'], timezone.utc).isoformat()

    snapshot = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=cutoff)

    assert snapshot['barCount'] == len(rows) - 1
    assert snapshot['asOfUtc'] == cutoff


def test_as_of_change_recomputes_snapshot_without_future_bars():
    rows = candles()
    early_cutoff = datetime.fromtimestamp(rows[-6]['time'] + 900, timezone.utc).isoformat()
    late_cutoff = as_of_after(rows)

    early = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=early_cutoff)
    late = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=late_cutoff)

    assert early['barCount'] == len(rows) - 5
    assert late['barCount'] == len(rows)
    assert early['asOfUtc'] != late['asOfUtc']


def test_insufficient_history_is_unknown_with_zero_confidence():
    rows = candles(30)

    snapshot = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=as_of_after(rows))

    assert snapshot['regimeTags']['trend'] == 'UNKNOWN'
    assert snapshot['regimeTags']['volatility'] == 'UNKNOWN'
    assert snapshot['confidence']['score'] == 0
    assert 'INSUFFICIENT_HISTORY' in snapshot['qualityFlags']


def test_trend_and_volatility_are_independent_and_volatility_uses_hysteresis():
    def series(spike_bars):
        rows = []
        price = 4000.0
        for index in range(260):
            amplitude = .025 if index < 260-spike_bars else .7
            price += .3 + (((index*7) % 13) - 6) * amplitude
            rows.append({'time':1_790_000_000+index*900, 'open':price-.1,
                         'high':price+.8+amplitude, 'low':price-.8-amplitude,
                         'close':price})
        return rows

    one_spike = series(1)
    sustained_spike = series(20)
    one = classify_regime(one_spike, symbol='XAUUSD', timeframe='M15',
                          as_of_utc=as_of_after(one_spike))
    sustained = classify_regime(sustained_spike, symbol='XAUUSD', timeframe='M15',
                                as_of_utc=as_of_after(sustained_spike))

    assert one['regimeTags']['volatility'] == 'NORMAL'
    assert sustained['regimeTags']['volatility'] == 'HIGH'
    assert sustained['regimeTags']['trend'] == 'UP'


def test_nonqualifying_exit_bar_resets_opposite_direction_streak():
    assert hasattr(regime_model, '_update_trend_state')
    state = ('UP', 0, 0, None, 0)
    opposite = {'adx14':30.0, 'ema20SlopeAtr5':-.3,
                'ema20Ema50SeparationAtr':.2}
    exit_bar = {'adx14':19.0, 'ema20SlopeAtr5':-.3,
                'ema20Ema50SeparationAtr':.2}

    state = regime_model._update_trend_state(*state, opposite)
    assert state[3:] == ('DOWN', 1)
    state = regime_model._update_trend_state(*state, exit_bar)
    assert state[3:] == (None, 0)
    state = regime_model._update_trend_state(*state, opposite)
    state = regime_model._update_trend_state(*state, opposite)
    assert state[0] == 'UP'
    state = regime_model._update_trend_state(*state, opposite)
    assert state[0] == 'DOWN'


@pytest.mark.parametrize('change', [
    {'high': 3990.0},
    {'close': float('nan')},
    {'time': 0},
])
def test_malformed_candle_data_makes_dimensions_unknown(change):
    rows = candles()
    rows[100] = {**rows[100], **change}

    snapshot = classify_regime(rows, symbol='XAUUSD', timeframe='M15', as_of_utc=as_of_after(rows))

    assert snapshot['regimeTags']['trend'] == 'UNKNOWN'
    assert snapshot['regimeTags']['volatility'] == 'UNKNOWN'
    assert 'INVALID_CANDLES' in snapshot['qualityFlags']
