import MetaTrader5 as mt5
import pandas as pd
import numpy as np
import json

def run_portfolio_simulation():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    symbol = 'XAUUSD'
    info = mt5.symbol_info(symbol)
    rates_m15 = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 45000)
    mt5.shutdown()
    
    df = pd.DataFrame(rates_m15)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    
    df['date'] = df.index.date
    df['hour'] = df.index.hour
    df['minute'] = df.index.minute
    
    # H4 Trend proxy (800 periods of M15 = 200 hours = 50 H4 bars)
    df['ema_trend'] = df['close'].ewm(span=800, adjust=False).mean()
    
    # ATR 14
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    point = info.point
    contract_size = info.trade_contract_size
    spread_val = 30 * point
    
    initial_balance = 10000.0
    risk_pct = 0.015 # 1.5% risk per trade
    tp_mult = 2.0
    buffer = 5 * point
    
    balance = initial_balance
    equity_curve = [{'time': str(df.index[0]), 'balance': balance, 'equity': balance}]
    trades = []
    
    unique_dates = df['date'].unique()
    
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
        
        # Filter: Asian range must be reasonable (e.g. at least 15 pips / points and not exceeding 4x ATR)
        atr_curr = day_df['atr14'].iloc[0]
        if asian_range < (100 * point) or (not np.isnan(atr_curr) and asian_range > 8 * atr_curr):
            continue
            
        # London window: 07:00 to 14:00
        london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 14)]
        trade_taken = False
        
        for i in range(len(london_df)):
            bar = london_df.iloc[i]
            t = bar.name
            
            if not trade_taken:
                trend_bull = bar['close'] > bar['ema_trend']
                trend_bear = bar['close'] < bar['ema_trend']
                
                # BUY SETUP
                if bar['high'] > (asian_high + buffer) and trend_bull:
                    entry_p = asian_high + buffer + spread_val
                    sl_p = asian_high - (0.5 * asian_range)
                    sl_dist = entry_p - sl_p
                    tp_p = entry_p + (tp_mult * sl_dist)
                    
                    risk_cash = balance * risk_pct
                    vol = risk_cash / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    # Track trade outcome
                    rem_bars = day_df.loc[bar.name:]
                    exit_p = 0.0
                    exit_reason = ""
                    exit_t = t
                    
                    for j in range(1, len(rem_bars)):
                        rb = rem_bars.iloc[j]
                        if rb['low'] <= sl_p:
                            exit_p = sl_p
                            exit_reason = 'SL'
                            exit_t = rb.name
                            break
                        elif rb['high'] >= tp_p:
                            exit_p = tp_p
                            exit_reason = 'TP'
                            exit_t = rb.name
                            break
                        if j == len(rem_bars) - 1:
                            exit_p = rb['close']
                            exit_reason = 'EOD'
                            exit_t = rb.name
                    
                    pips = exit_p - entry_p
                    profit = pips * vol * contract_size
                    balance += profit
                    
                    trades.append({
                        'date': str(d),
                        'time': str(t),
                        'exit_time': str(exit_t),
                        'type': 'BUY',
                        'entry_p': round(entry_p, 2),
                        'sl_p': round(sl_p, 2),
                        'tp_p': round(tp_p, 2),
                        'exit_p': round(exit_p, 2),
                        'volume': vol,
                        'profit': round(profit, 2),
                        'balance': round(balance, 2),
                        'reason': exit_reason
                    })
                    equity_curve.append({'time': str(exit_t), 'balance': round(balance, 2), 'equity': round(balance, 2)})
                    trade_taken = True
                    
                # SELL SETUP
                elif bar['low'] < (asian_low - buffer) and trend_bear:
                    entry_p = asian_low - buffer
                    sl_p = asian_low + (0.5 * asian_range) + spread_val
                    sl_dist = sl_p - entry_p
                    tp_p = entry_p - (tp_mult * sl_dist)
                    
                    risk_cash = balance * risk_pct
                    vol = risk_cash / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    rem_bars = day_df.loc[bar.name:]
                    exit_p = 0.0
                    exit_reason = ""
                    exit_t = t
                    
                    for j in range(1, len(rem_bars)):
                        rb = rem_bars.iloc[j]
                        if rb['high'] >= sl_p:
                            exit_p = sl_p
                            exit_reason = 'SL'
                            exit_t = rb.name
                            break
                        elif rb['low'] <= tp_p:
                            exit_p = tp_p
                            exit_reason = 'TP'
                            exit_t = rb.name
                            break
                        if j == len(rem_bars) - 1:
                            exit_p = rb['close']
                            exit_reason = 'EOD'
                            exit_t = rb.name
                    
                    pips = entry_p - exit_p
                    profit = pips * vol * contract_size
                    balance += profit
                    
                    trades.append({
                        'date': str(d),
                        'time': str(t),
                        'exit_time': str(exit_t),
                        'type': 'SELL',
                        'entry_p': round(entry_p, 2),
                        'sl_p': round(sl_p, 2),
                        'tp_p': round(tp_p, 2),
                        'exit_p': round(exit_p, 2),
                        'volume': vol,
                        'profit': round(profit, 2),
                        'balance': round(balance, 2),
                        'reason': exit_reason
                    })
                    equity_curve.append({'time': str(exit_t), 'balance': round(balance, 2), 'equity': round(balance, 2)})
                    trade_taken = True
    
    tdf = pd.DataFrame(trades)
    eq_df = pd.DataFrame(equity_curve)
    
    wins = tdf[tdf['profit'] > 0]
    losses = tdf[tdf['profit'] < 0]
    wr = len(wins) / len(tdf) * 100
    gp = wins['profit'].sum()
    gl = abs(losses['profit'].sum())
    pf = gp / gl if gl > 0 else 999.0
    
    peak = eq_df['balance'].cummax()
    dd = (eq_df['balance'] - peak) / peak * 100
    max_dd = abs(dd.min())
    total_return = (balance - initial_balance) / initial_balance * 100
    
    print("\n=======================================================")
    print("      FINAL BACKTEST PERFORMANCE REPORT (XAUUSD)")
    print("=======================================================")
    print(f"Initial Balance:    ${initial_balance:,.2f}")
    print(f"Final Balance:      ${balance:,.2f}")
    print(f"Net Profit:         ${balance - initial_balance:+,.2f} ({total_return:+.1f}%)")
    print(f"Total Trades:       {len(tdf)}")
    print(f"Winning Trades:     {len(wins)} ({wr:.1f}%)")
    print(f"Losing Trades:      {len(losses)} ({100-wr:.1f}%)")
    print(f"Profit Factor:      {pf:.2f}")
    print(f"Max Drawdown:       {max_dd:.1f}%")
    print(f"Average Win:        ${wins['profit'].mean():,.2f}")
    print(f"Average Loss:       ${abs(losses['profit'].mean()):,.2f}")
    print(f"Risk-Reward Ratio:  1 : {wins['profit'].mean() / abs(losses['profit'].mean()):.2f}")
    print("=======================================================\n")
    
    tdf.to_csv('trade_history_xauusd.csv', index=False)
    eq_df.to_csv('equity_curve_xauusd.csv', index=False)
    
    # Let's save a summary JSON
    summary = {
        'initial_balance': initial_balance,
        'final_balance': round(balance, 2),
        'net_profit': round(balance - initial_balance, 2),
        'total_return_pct': round(total_return, 1),
        'trades': len(tdf),
        'win_rate': round(wr, 1),
        'profit_factor': round(pf, 2),
        'max_drawdown_pct': round(max_dd, 1),
        'avg_win': round(wins['profit'].mean(), 2),
        'avg_loss': round(abs(losses['profit'].mean()), 2)
    }
    with open('performance_summary.json', 'w') as f:
        json.dump(summary, f, indent=2)

if __name__ == '__main__':
    run_portfolio_simulation()
