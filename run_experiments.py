import MetaTrader5 as mt5
import pandas as pd
import numpy as np
from backtest_engine import get_data, calculate_indicators, simulate_strategy, analyze_performance

def run_tests():
    symbols = ['EURUSD', 'XAUUSD']
    timeframes = [
        ('H1', mt5.TIMEFRAME_H1, 20000),
        ('M15', mt5.TIMEFRAME_M15, 25000)
    ]
    
    results = []
    
    for sym in symbols:
        spread_pts = 15 if sym == 'EURUSD' else 35
        for tf_name, tf_const, n_bars in timeframes:
            print(f"\n=======================================================")
            print(f"Testing {sym} on {tf_name} ({n_bars} bars)...")
            try:
                raw_df, sym_info = get_data(sym, tf_const, n_bars)
            except Exception as e:
                print(f"Error loading {sym} {tf_name}: {e}")
                continue
                
            df = calculate_indicators(raw_df)
            
            # -----------------------------------------------------------------
            # STRATEGY 1: Trend Pullback (EMA Ribbon + RSI bounce + ATR Trail)
            # -----------------------------------------------------------------
            sig1 = pd.DataFrame(index=df.index)
            # Trend: Price > EMA200, EMA50 > EMA200
            uptrend = (df['close'] > df['ema200']) & (df['ema50'] > df['ema200'])
            downtrend = (df['close'] < df['ema200']) & (df['ema50'] < df['ema200'])
            
            # Pullback condition: Low touched near EMA50 or EMA20, RSI was < 45 and crosses up
            rsi_prev = df['rsi14'].shift(1)
            rsi_curr = df['rsi14']
            
            # Buy signal: in uptrend, RSI dips below 45 and rises back above 45, close > ema20
            buy1 = uptrend & (rsi_prev < 45) & (rsi_curr >= 45) & (df['close'] > df['open'])
            sell1 = downtrend & (rsi_prev > 55) & (rsi_curr <= 55) & (df['close'] < df['open'])
            
            sig1['buy_signal'] = buy1
            sig1['sell_signal'] = sell1
            sig1['sl_dist'] = 1.5 * df['atr14']
            sig1['tp_dist'] = 3.0 * df['atr14']
            sig1['be_mult'] = 1.2
            sig1['trail_mult'] = 2.0
            
            trades1, eq1 = simulate_strategy(df, sig1, sym_info, spread_points=spread_pts, risk_pct=0.015)
            m1 = analyze_performance(trades1, eq1)
            results.append({'Strategy': 'Trend-Pullback (RSI+EMA)', 'Symbol': sym, 'TF': tf_name, **m1})
            print(f"  [1] Trend-Pullback: Trades={m1['trades']}, WinRate={m1['win_rate']}%, Return={m1['return_pct']}%, PF={m1['profit_factor']}, MaxDD={m1['max_dd_pct']}%, Sharpe={m1['sharpe']}")
            
            # -----------------------------------------------------------------
            # STRATEGY 2: Donchian Volatility Expansion (Turtle Pro + Vol Filter)
            # -----------------------------------------------------------------
            sig2 = pd.DataFrame(index=df.index)
            # Donchian 20 breakout with EMA200 filter
            atr_ma = df['atr14'].rolling(50).mean()
            vol_expansion = df['atr14'] > atr_ma
            
            high20_prev = df['high'].shift(1).rolling(20).max()
            low20_prev = df['low'].shift(1).rolling(20).min()
            
            buy2 = (df['close'] > high20_prev) & (df['close'] > df['ema200']) & vol_expansion
            sell2 = (df['close'] < low20_prev) & (df['close'] < df['ema200']) & vol_expansion
            
            sig2['buy_signal'] = buy2
            sig2['sell_signal'] = sell2
            sig2['sl_dist'] = 1.5 * df['atr14']
            sig2['tp_dist'] = 3.5 * df['atr14']
            sig2['be_mult'] = 1.2
            sig2['trail_mult'] = 2.0
            
            trades2, eq2 = simulate_strategy(df, sig2, sym_info, spread_points=spread_pts, risk_pct=0.015)
            m2 = analyze_performance(trades2, eq2)
            results.append({'Strategy': 'Donchian Breakout + ATR Filter', 'Symbol': sym, 'TF': tf_name, **m2})
            print(f"  [2] Donchian Breakout: Trades={m2['trades']}, WinRate={m2['win_rate']}%, Return={m2['return_pct']}%, PF={m2['profit_factor']}, MaxDD={m2['max_dd_pct']}%, Sharpe={m2['sharpe']}")
            
            # -----------------------------------------------------------------
            # STRATEGY 3: Session Breakout (London/NY Open Momentum)
            # -----------------------------------------------------------------
            sig3 = pd.DataFrame(index=df.index)
            hours = df.index.hour
            # Trade window: London opening (8 to 11 server time)
            in_window = (hours >= 8) & (hours <= 11)
            
            # Momentum surge: bar range > 1.3 * ATR, close near extreme
            candle_range = df['high'] - df['low']
            body_range = (df['close'] - df['open']).abs()
            is_bull_impulse = (df['close'] > df['open']) & (candle_range > 1.3 * df['atr14']) & (body_range > 0.6 * candle_range)
            is_bear_impulse = (df['close'] < df['open']) & (candle_range > 1.3 * df['atr14']) & (body_range > 0.6 * candle_range)
            
            buy3 = in_window & is_bull_impulse & (df['close'] > df['ema200'])
            sell3 = in_window & is_bear_impulse & (df['close'] < df['ema200'])
            
            sig3['buy_signal'] = buy3
            sig3['sell_signal'] = sell3
            sig3['sl_dist'] = 1.2 * df['atr14']
            sig3['tp_dist'] = 2.5 * df['atr14']
            sig3['be_mult'] = 1.0
            sig3['trail_mult'] = 1.8
            
            trades3, eq3 = simulate_strategy(df, sig3, sym_info, spread_points=spread_pts, risk_pct=0.015)
            m3 = analyze_performance(trades3, eq3)
            results.append({'Strategy': 'Session Momentum Impulse', 'Symbol': sym, 'TF': tf_name, **m3})
            print(f"  [3] Session Momentum: Trades={m3['trades']}, WinRate={m3['win_rate']}%, Return={m3['return_pct']}%, PF={m3['profit_factor']}, MaxDD={m3['max_dd_pct']}%, Sharpe={m3['sharpe']}")
            
    summary_df = pd.DataFrame(results)
    summary_df.to_csv('backtest_summary.csv', index=False)
    print("\n\nAll results saved to backtest_summary.csv")

if __name__ == '__main__':
    run_tests()
