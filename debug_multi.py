import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_debug():
    if not mt5.initialize():
        return
    info = mt5.symbol_info('XAUUSD')
    rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 20000)
    mt5.shutdown()
    
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['date'] = df.index.date
    df['hour'] = df.index.hour
    
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    # Donchian 20
    df['hh20'] = df['high'].shift(1).rolling(20).max()
    df['ll20'] = df['low'].shift(1).rolling(20).min()
    
    df['session'] = (df['hour'] >= 7) & (df['hour'] <= 18)
    
    uptrend = (df['close'] > df['ema200']) & (df['ema50'] > df['ema200'])
    downtrend = (df['close'] < df['ema200']) & (df['ema50'] < df['ema200'])
    
    # Breakout of 20-bar high/low (Turtle Momentum)
    buy_sig = uptrend & (df['close'] > df['hh20']) & (df['close'].shift(1) <= df['hh20'].shift(1)) & df['session']
    sell_sig = downtrend & (df['close'] < df['ll20']) & (df['close'].shift(1) >= df['ll20'].shift(1)) & df['session']
    
    print(f"Total bars: {len(df)}, Buy signals: {buy_sig.sum()}, Sell signals: {sell_sig.sum()}")
    
    # Let's test with max 3 trades per day, max 5 trades per day, unlimited trades per day
    for max_trades_day in [2, 3, 5, 99]:
        for risk in [0.005, 0.0075, 0.01]:
            # Simulate
            balance = 100000.0
            initial = balance
            trades = []
            eq = [balance]
            max_day_dd = 0.0
            
            for d in df['date'].unique():
                day_df = df[df['date'] == d]
                day_start = balance
                day_cnt = 0
                pos = None
                
                for i in range(len(day_df)):
                    b = day_df.iloc[i]
                    t = b.name
                    
                    if pos is not None:
                        closed = False
                        exit_p = 0
                        if pos['type'] == 'BUY':
                            if b['low'] <= pos['sl']:
                                exit_p = pos['sl']
                                closed = True
                            elif b['high'] >= pos['tp']:
                                exit_p = pos['tp']
                                closed = True
                        else:
                            if b['high'] >= pos['sl']:
                                exit_p = pos['sl']
                                closed = True
                            elif b['low'] <= pos['tp']:
                                exit_p = pos['tp']
                                closed = True
                        
                        if closed:
                            diff = (exit_p - pos['ep']) if pos['type'] == 'BUY' else (pos['ep'] - exit_p)
                            pnl = diff * pos['vol'] * 100.0
                            balance += pnl
                            trades.append(pnl)
                            pos = None
                    
                    if pos is None and day_cnt < max_trades_day:
                        atr = b['atr14']
                        if np.isnan(atr) or atr <= 0: continue
                        
                        # Stop if daily loss exceeds 2.5%
                        if ((day_start - balance) / day_start) >= 0.025:
                            continue
                            
                        if buy_sig.loc[t]:
                            ep = b['close'] + 0.30
                            sl_dist = 1.3 * atr
                            tp_dist = 2.6 * atr # 1:2 RRR
                            sl = ep - sl_dist
                            tp = ep + tp_dist
                            vol = (balance * risk) / (sl_dist * 100.0)
                            pos = {'type': 'BUY', 'ep': ep, 'sl': sl, 'tp': tp, 'vol': max(0.01, round(vol, 2))}
                            day_cnt += 1
                        elif sell_sig.loc[t]:
                            ep = b['close']
                            sl_dist = 1.3 * atr
                            tp_dist = 2.6 * atr
                            sl = ep + sl_dist + 0.30
                            tp = ep - tp_dist
                            vol = (balance * risk) / (sl_dist * 100.0)
                            pos = {'type': 'SELL', 'ep': ep, 'sl': sl, 'tp': tp, 'vol': max(0.01, round(vol, 2))}
                            day_cnt += 1
                
                # Close at EOD
                if pos is not None:
                    b_last = day_df.iloc[-1]
                    diff = (b_last['close'] - pos['ep']) if pos['type'] == 'BUY' else (pos['ep'] - b_last['close'])
                    balance += diff * pos['vol'] * 100.0
                    trades.append(diff * pos['vol'] * 100.0)
                    pos = None
                    
                day_loss = (day_start - balance) / day_start * 100
                if day_loss > 0:
                    max_day_dd = max(max_day_dd, day_loss)
                eq.append(balance)
                
            tdf = pd.Series(trades)
            if len(tdf) == 0: continue
            eq_s = pd.Series(eq)
            peak = eq_s.cummax()
            max_tot = abs(((eq_s - peak) / peak * 100).min())
            ret = (balance - initial) / initial * 100
            wins = tdf[tdf > 0]
            losses = tdf[tdf < 0]
            pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 999
            wr = len(wins) / len(tdf) * 100
            
            print(f"MaxTrades: {max_trades_day:2d} | Risk: {risk*100:4.2f}% | Trades: {len(tdf):3d} | WR: {wr:4.1f}% | Ret: {ret:+6.1f}% | PF: {pf:4.2f} | DayDD: {max_day_dd:4.2f}% | TotDD: {max_tot:4.2f}%")

if __name__ == '__main__':
    run_debug()
