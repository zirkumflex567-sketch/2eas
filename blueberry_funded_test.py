import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_blueberry_audit():
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
    
    df['ema_trend'] = df['close'].ewm(span=800, adjust=False).mean()
    point = info.point
    contract_size = info.trade_contract_size
    spread_val = 30 * point
    
    print("\n=========================================================================")
    print("      BLUEBERRY FUNDED 2-STEP PRIME RISK & DRAWDOWN SIMULATION")
    print("      Rules: Max Daily DD = 4.0% | Max Overall DD = 10.0%")
    print("=========================================================================")
    
    # Test risk per trade: 0.5%, 0.75%, 1.0%, 1.2%
    for risk_pct in [0.005, 0.0075, 0.010, 0.0125]:
        initial_balance = 100000.0 # Standard 100k account
        balance = initial_balance
        daily_start_balance = initial_balance
        
        trades = []
        daily_results = {}
        equity_series = [initial_balance]
        
        # Max daily DD tracker
        max_daily_loss_pct = 0.0
        
        for d in df['date'].unique():
            day_df = df[df['date'] == d]
            if len(day_df) < 30: continue
            
            day_open_balance = balance
            
            asian_df = day_df[(day_df['hour'] >= 0) & (day_df['hour'] < 7)]
            if len(asian_df) < 10: continue
            
            asian_high = asian_df['high'].max()
            asian_low = asian_df['low'].min()
            asian_range = asian_high - asian_low
            
            if asian_range < (100 * point): continue
            
            london_df = day_df[(day_df['hour'] >= 7) & (day_df['hour'] <= 14)]
            trade_taken = False
            
            for i in range(len(london_df)):
                bar = london_df.iloc[i]
                if not trade_taken:
                    trend_bull = bar['close'] > bar['ema_trend']
                    trend_bear = bar['close'] < bar['ema_trend']
                    buffer = 5 * point
                    
                    if bar['high'] > (asian_high + buffer) and trend_bull:
                        entry_p = asian_high + buffer + spread_val
                        sl_p = asian_high - (0.5 * asian_range)
                        sl_dist = entry_p - sl_p
                        tp_p = entry_p + (2.0 * sl_dist)
                        
                        risk_cash = balance * risk_pct
                        vol = risk_cash / (sl_dist * contract_size)
                        vol = max(0.01, min(round(vol, 2), 100.0))
                        
                        rem_bars = day_df.loc[bar.name:]
                        exit_p = 0.0
                        exit_reason = ""
                        for j in range(1, len(rem_bars)):
                            rb = rem_bars.iloc[j]
                            if rb['low'] <= sl_p:
                                exit_p = sl_p
                                exit_reason = 'SL'
                                break
                            elif rb['high'] >= tp_p:
                                exit_p = tp_p
                                exit_reason = 'TP'
                                break
                            if j == len(rem_bars) - 1:
                                exit_p = rb['close']
                                exit_reason = 'EOD'
                        
                        pips = exit_p - entry_p
                        profit = pips * vol * contract_size
                        balance += profit
                        trade_taken = True
                        
                        trades.append({'date': d, 'profit': profit, 'balance': balance, 'reason': exit_reason})
                        
                    elif bar['low'] < (asian_low - buffer) and trend_bear:
                        entry_p = asian_low - buffer
                        sl_p = asian_low + (0.5 * asian_range) + spread_val
                        sl_dist = sl_p - entry_p
                        tp_p = entry_p - (2.0 * sl_dist)
                        
                        risk_cash = balance * risk_pct
                        vol = risk_cash / (sl_dist * contract_size)
                        vol = max(0.01, min(round(vol, 2), 100.0))
                        
                        rem_bars = day_df.loc[bar.name:]
                        exit_p = 0.0
                        exit_reason = ""
                        for j in range(1, len(rem_bars)):
                            rb = rem_bars.iloc[j]
                            if rb['high'] >= sl_p:
                                exit_p = sl_p
                                exit_reason = 'SL'
                                break
                            elif rb['low'] <= tp_p:
                                exit_p = tp_p
                                exit_reason = 'TP'
                                break
                            if j == len(rem_bars) - 1:
                                exit_p = rb['close']
                                exit_reason = 'EOD'
                                
                        pips = entry_p - exit_p
                        profit = pips * vol * contract_size
                        balance += profit
                        trade_taken = True
                        
                        trades.append({'date': d, 'profit': profit, 'balance': balance, 'reason': exit_reason})
            
            # Record daily pnl
            day_pnl = balance - day_open_balance
            day_dd_pct = (day_pnl / day_open_balance) * 100
            if day_dd_pct < 0:
                max_daily_loss_pct = max(max_daily_loss_pct, abs(day_dd_pct))
            equity_series.append(balance)
            
        tdf = pd.DataFrame(trades)
        eq_s = pd.Series(equity_series)
        peak = eq_s.cummax()
        overall_dd_pct = abs(((eq_s - peak) / peak * 100).min())
        
        wins = tdf[tdf['profit'] > 0]
        losses = tdf[tdf['profit'] < 0]
        pf = wins['profit'].sum() / abs(losses['profit'].sum()) if len(losses) > 0 else 999
        wr = len(wins) / len(tdf) * 100
        net_ret = (balance - initial_balance) / initial_balance * 100
        
        # Check Blueberry Funded Rule Compliance:
        daily_passed = max_daily_loss_pct < 4.0
        overall_passed = overall_dd_pct < 10.0
        
        status = "PASSED (SAFE)" if (daily_passed and overall_passed) else "VIOLATED"
        
        print(f"Risk: {risk_pct*100:4.2f}% | Max Daily DD: {max_daily_loss_pct:4.2f}% (Limit: 4.0%) | Max Total DD: {overall_dd_pct:4.2f}% (Limit: 10.0%) | Ret: {net_ret:+6.1f}% | PF: {pf:4.2f} | Status: {status}")

if __name__ == '__main__':
    run_blueberry_audit()
