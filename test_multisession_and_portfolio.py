import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def test_multisession_and_portfolio():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    symbols = ['XAUUSD', 'GBPUSD', 'EURUSD']
    data = {}
    
    for sym in symbols:
        info = mt5.symbol_info(sym)
        rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M15, 0, 35000)
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('time', inplace=True)
        df['date'] = df.index.date
        df['hour'] = df.index.hour
        df['minute'] = df.index.minute
        
        # H4 trend proxy
        df['ema_trend'] = df['close'].ewm(span=800, adjust=False).mean()
        
        # ATR 14
        tr = np.maximum(df['high'] - df['low'], 
                        np.maximum(abs(df['high'] - df['close'].shift(1)), 
                                   abs(df['low'] - df['close'].shift(1))))
        df['atr14'] = tr.rolling(14).mean()
        
        data[sym] = {
            'df': df,
            'info': info,
            'point': info.point,
            'contract': info.trade_contract_size,
            'spread': 30 * info.point if sym == 'XAUUSD' else 15 * info.point
        }
    mt5.shutdown()
    
    print("\n=========================================================================")
    print("      APPROACH 1: DUAL-SESSION TRADING (LONDON + NEW YORK SESSIONS)")
    print("      Allows up to 2-3 High-Probability Trades Per Day on XAUUSD")
    print("=========================================================================")
    
    xdf = data['XAUUSD']['df']
    xinfo = data['XAUUSD']['info']
    xpt = data['XAUUSD']['point']
    xspread = data['XAUUSD']['spread']
    
    for max_daily_trades in [2, 3]:
        for risk_pct in [0.005, 0.0075]:
            balance = 100000.0
            initial = balance
            trades = []
            eq = [balance]
            max_daily_dd = 0.0
            
            for d in xdf['date'].unique():
                day_df = xdf[xdf['date'] == d]
                if len(day_df) < 30: continue
                
                day_start = balance
                day_trades_count = 0
                
                # Asian Box: 00:00 - 06:45
                asian_df = day_df[(day_df['hour'] >= 0) & (day_df['hour'] < 7)]
                if len(asian_df) < 10: continue
                asian_high = asian_df['high'].max()
                asian_low = asian_df['low'].min()
                asian_range = asian_high - asian_low
                if asian_range < (100 * xpt): continue
                
                # London Range: 07:00 - 12:45
                london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] < 13)]
                london_high = london_df['high'].max() if len(london_df) > 0 else asian_high
                london_low = london_df['low'].min() if len(london_df) > 0 else asian_low
                london_range = london_high - london_low
                
                # Window 1: London Session (07:00 - 13:00) -> Asian Breakout
                # Window 2: New York Session (13:00 - 18:00) -> London Range Breakout / Trend Continuation
                
                trading_bars = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 18)]
                pos = None
                
                for i in range(len(trading_bars)):
                    bar = trading_bars.iloc[i]
                    t = bar.name
                    h = bar['hour']
                    
                    # Manage active trade
                    if pos is not None:
                        closed = False
                        exit_p = 0
                        if pos['type'] == 'BUY':
                            if bar['low'] <= pos['sl']:
                                exit_p = pos['sl']
                                closed = True
                            elif bar['high'] >= pos['tp']:
                                exit_p = pos['tp']
                                closed = True
                        else:
                            if bar['high'] >= pos['sl']:
                                exit_p = pos['sl']
                                closed = True
                            elif bar['low'] <= pos['tp']:
                                exit_p = pos['tp']
                                closed = True
                                
                        if closed:
                            diff = (exit_p - pos['ep']) if pos['type'] == 'BUY' else (pos['ep'] - exit_p)
                            pnl = diff * pos['vol'] * 100.0
                            balance += pnl
                            trades.append(pnl)
                            pos = None
                    
                    # New Entry if under max daily trades
                    if pos is None and day_trades_count < max_daily_trades:
                        # Stop if day loss hits 2.5%
                        if ((day_start - balance) / day_start) >= 0.025:
                            continue
                            
                        # Session 1: London Breakout of Asian Range
                        if h >= 7 and h < 13:
                            trend_bull = bar['close'] > bar['ema_trend']
                            trend_bear = bar['close'] < bar['ema_trend']
                            buf = 5 * xpt
                            
                            if bar['high'] > (asian_high + buf) and trend_bull:
                                ep = asian_high + buf + xspread
                                sl_p = asian_high - (0.5 * asian_range)
                                sl_dist = ep - sl_p
                                tp_p = ep + (2.0 * sl_dist)
                                vol = (balance * risk_pct) / (sl_dist * 100.0)
                                pos = {'type': 'BUY', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'vol': max(0.01, min(round(vol, 2), 100.0))}
                                day_trades_count += 1
                            elif bar['low'] < (asian_low - buf) and trend_bear:
                                ep = asian_low - buf
                                sl_p = asian_low + (0.5 * asian_range) + xspread
                                sl_dist = sl_p - ep
                                tp_p = ep - (2.0 * sl_dist)
                                vol = (balance * risk_pct) / (sl_dist * 100.0)
                                pos = {'type': 'SELL', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'vol': max(0.01, min(round(vol, 2), 100.0))}
                                day_trades_count += 1
                                
                        # Session 2: New York Breakout of London Range (13:00 to 18:00)
                        elif h >= 13 and h <= 17 and london_range > (100 * xpt):
                            trend_bull = bar['close'] > bar['ema_trend']
                            trend_bear = bar['close'] < bar['ema_trend']
                            buf = 5 * xpt
                            
                            if bar['high'] > (london_high + buf) and trend_bull:
                                ep = london_high + buf + xspread
                                sl_p = london_high - (0.4 * london_range)
                                sl_dist = ep - sl_p
                                tp_p = ep + (2.0 * sl_dist)
                                vol = (balance * risk_pct) / (sl_dist * 100.0)
                                pos = {'type': 'BUY', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'vol': max(0.01, min(round(vol, 2), 100.0))}
                                day_trades_count += 1
                            elif bar['low'] < (london_low - buf) and trend_bear:
                                ep = london_low - buf
                                sl_p = london_low + (0.4 * london_range) + xspread
                                sl_dist = sl_p - ep
                                tp_p = ep - (2.0 * sl_dist)
                                vol = (balance * risk_pct) / (sl_dist * 100.0)
                                pos = {'type': 'SELL', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'vol': max(0.01, min(round(vol, 2), 100.0))}
                                day_trades_count += 1
                
                # EOD Close
                if pos is not None:
                    last_b = trading_bars.iloc[-1]
                    diff = (last_b['close'] - pos['ep']) if pos['type'] == 'BUY' else (pos['ep'] - last_b['close'])
                    balance += diff * pos['vol'] * 100.0
                    trades.append(diff * pos['vol'] * 100.0)
                    pos = None
                    
                day_loss = (day_start - balance) / day_start * 100
                if day_loss > 0: max_daily_dd = max(max_daily_dd, day_loss)
                eq.append(balance)
                
            tdf = pd.Series(trades)
            eq_s = pd.Series(eq)
            peak = eq_s.cummax()
            max_tot = abs(((eq_s - peak) / peak * 100).min())
            ret = (balance - initial) / initial * 100
            wins = tdf[tdf > 0]
            losses = tdf[tdf < 0]
            pf = wins.sum() / abs(losses.sum())
            wr = len(wins) / len(tdf) * 100
            
            print(f"MaxTrades/Day: {max_daily_trades} | Risk: {risk_pct*100:4.2f}% | Total Trades: {len(tdf):3d} | WR: {wr:4.1f}% | Return: {ret:+7.1f}% | PF: {pf:4.2f} | MaxDayDD: {max_daily_dd:4.2f}% | MaxTotDD: {max_tot:4.2f}%")

if __name__ == '__main__':
    test_multisession_and_portfolio()
