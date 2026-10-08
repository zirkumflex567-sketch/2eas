import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def test_pair(symbol, risk_pct=0.015, tp_mult=2.0, buffer_pts=5, spread_pts=15):
    info = mt5.symbol_info(symbol)
    rates_m15 = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 45000)
    
    df = pd.DataFrame(rates_m15)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['date'] = df.index.date
    df['hour'] = df.index.hour
    
    df['ema_trend'] = df['close'].ewm(span=800, adjust=False).mean()
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    point = info.point
    contract_size = info.trade_contract_size
    spread_val = spread_pts * point
    
    initial_balance = 10000.0
    balance = initial_balance
    trades = []
    
    for d in df['date'].unique():
        day_df = df[df['date'] == d]
        if len(day_df) < 30: continue
        
        asian_df = day_df[(day_df['hour'] >= 0) & (day_df['hour'] < 7)]
        if len(asian_df) < 10: continue
        
        asian_high = asian_df['high'].max()
        asian_low = asian_df['low'].min()
        asian_range = asian_high - asian_low
        
        if asian_range < (10 * point): continue
        
        london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 14)]
        trade_taken = False
        
        for i in range(len(london_df)):
            bar = london_df.iloc[i]
            if not trade_taken:
                trend_bull = bar['close'] > bar['ema_trend']
                trend_bear = bar['close'] < bar['ema_trend']
                
                if bar['high'] > (asian_high + buffer_pts * point) and trend_bull:
                    entry_p = asian_high + (buffer_pts * point) + spread_val
                    sl_p = asian_high - (0.5 * asian_range)
                    sl_dist = entry_p - sl_p
                    tp_p = entry_p + (tp_mult * sl_dist)
                    
                    risk_cash = balance * risk_pct
                    vol = risk_cash / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    rem_bars = day_df.loc[bar.name:]
                    exit_p = 0.0
                    for j in range(1, len(rem_bars)):
                        rb = rem_bars.iloc[j]
                        if rb['low'] <= sl_p:
                            exit_p = sl_p
                            break
                        elif rb['high'] >= tp_p:
                            exit_p = tp_p
                            break
                        if j == len(rem_bars) - 1:
                            exit_p = rb['close']
                    
                    pips = exit_p - entry_p
                    profit = pips * vol * contract_size
                    balance += profit
                    trades.append(profit)
                    trade_taken = True
                    
                elif bar['low'] < (asian_low - buffer_pts * point) and trend_bear:
                    entry_p = asian_low - (buffer_pts * point)
                    sl_p = asian_low + (0.5 * asian_range) + spread_val
                    sl_dist = sl_p - entry_p
                    tp_p = entry_p - (tp_mult * sl_dist)
                    
                    risk_cash = balance * risk_pct
                    vol = risk_cash / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    rem_bars = day_df.loc[bar.name:]
                    exit_p = 0.0
                    for j in range(1, len(rem_bars)):
                        rb = rem_bars.iloc[j]
                        if rb['high'] >= sl_p:
                            exit_p = sl_p
                            break
                        elif rb['low'] <= tp_p:
                            exit_p = tp_p
                            break
                        if j == len(rem_bars) - 1:
                            exit_p = rb['close']
                    
                    pips = entry_p - exit_p
                    profit = pips * vol * contract_size
                    balance += profit
                    trades.append(profit)
                    trade_taken = True

    tdf = pd.Series(trades)
    wins = tdf[tdf > 0]
    losses = tdf[tdf < 0]
    pf = wins.sum() / abs(losses.sum())
    wr = len(wins) / len(tdf) * 100
    ret = (balance - initial_balance) / initial_balance * 100
    print(f"{symbol:8s} | Initial: $10,000 | Final: ${balance:,.2f} | Return: {ret:+6.1f}% | Trades: {len(tdf):3d} | WR: {wr:.1f}% | PF: {pf:.2f}")

if __name__ == '__main__':
    mt5.initialize()
    print("\n--- MULTI-ASSET TEST OF THE STRATEGY ---")
    test_pair('XAUUSD', risk_pct=0.015, tp_mult=2.0, buffer_pts=5, spread_pts=30)
    test_pair('GBPUSD', risk_pct=0.015, tp_mult=2.5, buffer_pts=5, spread_pts=15)
    test_pair('EURUSD', risk_pct=0.015, tp_mult=2.5, buffer_pts=5, spread_pts=15)
    mt5.shutdown()
