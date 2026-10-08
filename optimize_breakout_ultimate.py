import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_ultimate_optimization():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
    info = mt5.symbol_info('XAUUSD')
    mt5.shutdown()
    
    if rates is None or len(rates) == 0:
        print("No rates loaded")
        return
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['date'] = df.index.date
    df['hour'] = df.index.hour
    
    point = info.point
    contract = info.trade_contract_size
    spread = 30 * point
    
    # Technical Indicators
    df['ema_trend'] = df['close'].ewm(span=800, adjust=False).mean() # H4 trend
    
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    # Candle strength
    body = (df['close'] - df['open']).abs()
    rng = df['high'] - df['low']
    df['strong_candle'] = body > (0.40 * rng)
    
    print("\n=========================================================================")
    print("      ULTIMATE BREAKOUT OPTIMIZER (XAUUSD 2023 - 2026: 3.5+ YEARS)")
    print("      Testing Partial TP (50% at 1.5R, Runner at 3.0R) vs Full TP")
    print("=========================================================================")
    
    for partial_tp in [False, True]:
        for tp_mult in [2.0, 2.5, 3.0]:
            for risk_pct in [0.005, 0.0075]:
                initial_balance = 10000.0
                balance = initial_balance
                trades = []
                equity_curve = [initial_balance]
                max_daily_dd = 0.0
                
                for d in df['date'].unique():
                    day_df = df[df['date'] == d]
                    if len(day_df) < 30: continue
                    day_start = balance
                    day_trades = 0
                    
                    # Asian range: 00:00 to 06:45
                    asian_df = day_df[(day_df['hour'] >= 0) & (day_df['hour'] < 7)]
                    if len(asian_df) < 10: continue
                    asian_h = asian_df['high'].max()
                    asian_l = asian_df['low'].min()
                    asian_rng = asian_h - asian_l
                    if asian_rng < (100 * point): continue
                    
                    # London range: 07:00 to 12:45
                    london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] < 13)]
                    london_h = london_df['high'].max() if len(london_df) > 0 else asian_h
                    london_l = london_df['low'].min() if len(london_df) > 0 else asian_l
                    london_rng = london_h - london_l
                    
                    trading_bars = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 19)]
                    pos = None
                    
                    for i in range(len(trading_bars)):
                        bar = trading_bars.iloc[i]
                        t = bar.name
                        h = bar['hour']
                        
                        # Position management
                        if pos is not None:
                            sl = pos['sl']
                            tp = pos['tp']
                            pos_type = pos['type']
                            closed = False
                            exit_p = 0
                            
                            # Partial TP check
                            if partial_tp and not pos['half_closed']:
                                if pos_type == 'BUY' and bar['high'] >= pos['tp1']:
                                    pnl_half = (pos['tp1'] - pos['ep']) * (pos['vol'] * 0.5) * contract
                                    balance += pnl_half
                                    pos['vol'] *= 0.5
                                    pos['sl'] = pos['ep'] + spread # Move to BE
                                    pos['half_closed'] = True
                                elif pos_type == 'SELL' and bar['low'] <= pos['tp1']:
                                    pnl_half = (pos['ep'] - pos['tp1']) * (pos['vol'] * 0.5) * contract
                                    balance += pnl_half
                                    pos['vol'] *= 0.5
                                    pos['sl'] = pos['ep'] - spread
                                    pos['half_closed'] = True
                            
                            # Main SL/TP
                            if pos_type == 'BUY':
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
                                pips = (exit_p - pos['ep']) if pos_type == 'BUY' else (pos['ep'] - exit_p)
                                pnl = pips * pos['vol'] * contract
                                balance += pnl
                                trades.append(pnl)
                                pos = None
                        
                        # New Entry (Max 3 trades/day, stop if day loss >= 2.5%)
                        if pos is None and day_trades < 3:
                            if ((day_start - balance) / day_start) >= 0.025:
                                continue
                                
                            buf = 0.15 * bar['atr14']
                            
                            # London Session
                            if h >= 7 and h < 13:
                                trend_bull = bar['close'] > bar['ema_trend']
                                trend_bear = bar['close'] < bar['ema_trend']
                                
                                if bar['high'] > (asian_h + buf) and trend_bull and bar['strong_candle']:
                                    ep = asian_h + buf + spread
                                    sl_p = asian_h - (0.5 * asian_rng)
                                    sl_dist = ep - sl_p
                                    tp_p = ep + (tp_mult * sl_dist)
                                    tp1_p = ep + (1.5 * sl_dist)
                                    vol = (balance * risk_pct) / (sl_dist * contract)
                                    pos = {'type': 'BUY', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'tp1': tp1_p, 'vol': max(0.01, min(round(vol, 2), 100.0)), 'half_closed': False}
                                    day_trades += 1
                                elif bar['low'] < (asian_l - buf) and trend_bear and bar['strong_candle']:
                                    ep = asian_l - buf
                                    sl_p = asian_l + (0.5 * asian_rng) + spread
                                    sl_dist = sl_p - ep
                                    tp_p = ep - (tp_mult * sl_dist)
                                    tp1_p = ep - (1.5 * sl_dist)
                                    vol = (balance * risk_pct) / (sl_dist * contract)
                                    pos = {'type': 'SELL', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'tp1': tp1_p, 'vol': max(0.01, min(round(vol, 2), 100.0)), 'half_closed': False}
                                    day_trades += 1
                                    
                            # New York Session
                            elif h >= 13 and h <= 18 and london_rng > (100 * point):
                                trend_bull = bar['close'] > bar['ema_trend']
                                trend_bear = bar['close'] < bar['ema_trend']
                                
                                if bar['high'] > (london_h + buf) and trend_bull and bar['strong_candle']:
                                    ep = london_h + buf + spread
                                    sl_p = london_h - (0.4 * london_rng)
                                    sl_dist = ep - sl_p
                                    tp_p = ep + (tp_mult * sl_dist)
                                    tp1_p = ep + (1.5 * sl_dist)
                                    vol = (balance * risk_pct) / (sl_dist * contract)
                                    pos = {'type': 'BUY', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'tp1': tp1_p, 'vol': max(0.01, min(round(vol, 2), 100.0)), 'half_closed': False}
                                    day_trades += 1
                                elif bar['low'] < (london_l - buf) and trend_bear and bar['strong_candle']:
                                    ep = london_l - buf
                                    sl_p = london_l + (0.4 * london_rng) + spread
                                    sl_dist = sl_p - ep
                                    tp_p = ep - (tp_mult * sl_dist)
                                    tp1_p = ep - (1.5 * sl_dist)
                                    vol = (balance * risk_pct) / (sl_dist * contract)
                                    pos = {'type': 'SELL', 'ep': ep, 'sl': sl_p, 'tp': tp_p, 'tp1': tp1_p, 'vol': max(0.01, min(round(vol, 2), 100.0)), 'half_closed': False}
                                    day_trades += 1
                    
                    if pos is not None:
                        last_b = trading_bars.iloc[-1]
                        pips = (last_b['close'] - pos['ep']) if pos['type'] == 'BUY' else (pos['ep'] - last_b['close'])
                        pnl = pips * pos['vol'] * contract
                        balance += pnl
                        trades.append(pnl)
                        pos = None
                        
                    day_loss = (day_start - balance) / day_start * 100
                    if day_loss > 0: max_daily_dd = max(max_daily_dd, day_loss)
                    equity_curve.append(balance)
                    
                tdf = pd.Series(trades)
                eq_s = pd.Series(equity_curve)
                peak = eq_s.cummax()
                max_tot_dd = abs(((eq_s - peak) / peak * 100).min())
                wins = tdf[tdf > 0]
                losses = tdf[tdf < 0]
                pf = wins.sum() / abs(losses.sum())
                wr = len(wins) / len(tdf) * 100
                ret = (balance - initial_balance) / initial_balance * 100
                
                print(f"PartialTP: {str(partial_tp):5s} | TP: {tp_mult}x | Risk: {risk_pct*100:4.2f}% | Ret: {ret:+8.1f}% | Final Bal: ${balance:,.0f} | PF: {pf:4.2f} | WR: {wr:4.1f}% | DayDD: {max_daily_dd:4.2f}% | TotDD: {max_tot_dd:4.2f}%")

if __name__ == '__main__':
    run_ultimate_optimization()
