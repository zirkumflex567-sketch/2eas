import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def test_london_breakout():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    symbols = ['XAUUSD', 'GBPUSD', 'EURUSD']
    
    for sym in symbols:
        info = mt5.symbol_info(sym)
        if info is None:
            continue
            
        print(f"\n=======================================================")
        print(f"       LONDON BREAKOUT SYSTEM TEST: {sym}")
        print(f"=======================================================")
        
        rates_m15 = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M15, 0, 40000)
        if rates_m15 is None or len(rates_m15) == 0:
            continue
            
        df = pd.DataFrame(rates_m15)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('time', inplace=True)
        
        # Calculate daily trend and ATR on M15
        df['date'] = df.index.date
        df['hour'] = df.index.hour
        df['minute'] = df.index.minute
        
        # ATR 14 on M15
        tr = np.maximum(df['high'] - df['low'], 
                        np.maximum(abs(df['high'] - df['close'].shift(1)), 
                                   abs(df['low'] - df['close'].shift(1))))
        df['atr14'] = tr.rolling(14).mean()
        
        # EMA 200 on M15
        df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
        df['ema800'] = df['close'].ewm(span=800, adjust=False).mean() # ~H4 EMA200
        
        point = info.point
        contract_size = info.trade_contract_size
        spread_val = 15 * point if 'USD' in sym and sym != 'XAUUSD' else 35 * point
        
        # Group by date to find Asian Range: hours 0 to 6 (broker time)
        # London entry: hours 7 to 11
        # Close by end of day or session (hour 18)
        
        unique_dates = df['date'].unique()
        
        for tp_mult in [1.5, 2.0, 2.5, 3.0]:
            for buffer_pts in [0, 5, 10]:
                trades = []
                
                for d in unique_dates:
                    day_df = df[df['date'] == d]
                    if len(day_df) < 30:
                        continue
                        
                    # Asian session: 00:00 to 06:45
                    asian_df = day_df[(day_df['hour'] >= 0) & (day_df['hour'] < 7)]
                    if len(asian_df) < 10:
                        continue
                        
                    asian_high = asian_df['high'].max()
                    asian_low = asian_df['low'].min()
                    asian_range = asian_high - asian_low
                    
                    if asian_range <= 5 * point:
                        continue
                        
                    buffer = buffer_pts * point
                    # London trading window: 07:00 to 13:00
                    london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 14)]
                    
                    trade_taken = False
                    
                    for i in range(len(london_df)):
                        bar = london_df.iloc[i]
                        
                        if not trade_taken:
                            # Trend filter: H4 equivalent EMA800
                            trend_bull = bar['close'] > bar['ema800']
                            trend_bear = bar['close'] < bar['ema800']
                            
                            # Buy Breakout
                            if bar['high'] > (asian_high + buffer) and trend_bull:
                                entry_p = asian_high + buffer + spread_val
                                sl_p = asian_high - (0.5 * asian_range) # stop at half asian range
                                sl_dist = entry_p - sl_p
                                tp_p = entry_p + (tp_mult * sl_dist)
                                
                                # Evaluate trade for remainder of day
                                rem_bars = day_df.loc[bar.name:]
                                outcome_r = 0.0
                                for j in range(1, len(rem_bars)):
                                    rb = rem_bars.iloc[j]
                                    if rb['low'] <= sl_p:
                                        outcome_r = -1.0
                                        break
                                    elif rb['high'] >= tp_p:
                                        outcome_r = tp_mult
                                        break
                                    # End of day close
                                    if j == len(rem_bars) - 1:
                                        pips = rb['close'] - entry_p
                                        outcome_r = pips / sl_dist if sl_dist > 0 else 0
                                
                                trades.append({'r': outcome_r, 'type': 'BUY'})
                                trade_taken = True
                                
                            # Sell Breakout
                            elif bar['low'] < (asian_low - buffer) and trend_bear:
                                entry_p = asian_low - buffer
                                sl_p = asian_low + (0.5 * asian_range) + spread_val
                                sl_dist = sl_p - entry_p
                                tp_p = entry_p - (tp_mult * sl_dist)
                                
                                rem_bars = day_df.loc[bar.name:]
                                outcome_r = 0.0
                                for j in range(1, len(rem_bars)):
                                    rb = rem_bars.iloc[j]
                                    if rb['high'] >= sl_p:
                                        outcome_r = -1.0
                                        break
                                    elif rb['low'] <= tp_p:
                                        outcome_r = tp_mult
                                        break
                                    if j == len(rem_bars) - 1:
                                        pips = entry_p - rb['close']
                                        outcome_r = pips / sl_dist if sl_dist > 0 else 0
                                
                                trades.append({'r': outcome_r, 'type': 'SELL'})
                                trade_taken = True
                
                if len(trades) > 30:
                    tdf = pd.DataFrame(trades)
                    wr = (tdf['r'] > 0).mean() * 100
                    tot_r = tdf['r'].sum()
                    pf = tdf[tdf['r'] > 0]['r'].sum() / abs(tdf[tdf['r'] < 0]['r'].sum() + 1e-9)
                    if tot_r > 15:
                        print(f"  TP={tp_mult}x | Buf={buffer_pts:2d} | Trades: {len(tdf):3d} | WR: {wr:4.1f}% | Total R: {tot_r:+6.1f}R | PF: {pf:4.2f}")

    mt5.shutdown()

if __name__ == '__main__':
    test_london_breakout()
