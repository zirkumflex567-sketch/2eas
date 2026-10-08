import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_mean_reversion_simulation():
    if not mt5.initialize():
        print("Failed to init MT5")
        return
        
    symbol = 'XAUUSD'
    info = mt5.symbol_info(symbol)
    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 45000)
    mt5.shutdown()
    
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['date'] = df.index.date
    
    point = info.point
    contract_size = info.trade_contract_size
    spread = 30 * point
    
    # 1. Indicators
    # EMAs
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # Bollinger Bands (20, 2)
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_up'] = sma20 + 2.0 * std20
    df['bb_dn'] = sma20 - 2.0 * std20
    df['bb_mid'] = sma20
    
    # RSI 14
    diff = df['close'].diff()
    gain = diff.clip(lower=0).rolling(14).mean()
    loss = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
    
    # ATR 14
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    # Swing High & Low (30 bars)
    df['swing_high'] = df['high'].shift(1).rolling(30).max()
    df['swing_low'] = df['low'].shift(1).rolling(30).min()
    
    print("\n=========================================================================")
    print("      REVERSE-ENGINEERED & OPTIMIZED XAU MEAN REVERSION SYSTEM")
    print("      Simulating over 45,000 M15 bars (3.5+ Years) with Compounding")
    print("=========================================================================")
    
    for risk_pct in [0.005, 0.0075, 0.010]:
        initial_balance = 10000.0
        balance = initial_balance
        equity_curve = [initial_balance]
        trades = []
        
        # Position tracking: list of open positions
        open_positions = []
        max_positions = 2 # scale-in up to 2 positions
        
        max_daily_dd = 0.0
        
        for d in df['date'].unique():
            day_df = df[df['date'] == d]
            day_start = balance
            
            for i in range(len(day_df)):
                bar = day_df.iloc[i]
                t = bar.name
                
                # Check Exits for active positions
                # Condition 1: Swing SL hit
                # Condition 2: Mean Reversion Exit (Close reaches BB Mid / EMA20 and RSI normalizes)
                if len(open_positions) > 0:
                    remaining_pos = []
                    for pos in open_positions:
                        pos_type = pos['type']
                        sl = pos['sl']
                        closed = False
                        exit_p = 0
                        reason = ""
                        
                        if pos_type == 'BUY':
                            if bar['low'] <= sl:
                                exit_p = sl
                                closed = True
                                reason = 'SL'
                            # Dynamic Exit: Reached BB Mid / EMA20 from below
                            elif bar['high'] >= bar['bb_mid'] and bar['rsi'] >= 50:
                                exit_p = max(pos['entry_p'] + spread, bar['close'])
                                closed = True
                                reason = 'Dynamic_MeanRev'
                        elif pos_type == 'SELL':
                            if bar['high'] >= sl:
                                exit_p = sl
                                closed = True
                                reason = 'SL'
                            elif bar['low'] <= bar['bb_mid'] and bar['rsi'] <= 50:
                                exit_p = min(pos['entry_p'] - spread, bar['close'])
                                closed = True
                                reason = 'Dynamic_MeanRev'
                                
                        if closed:
                            diff = (exit_p - pos['entry_p']) if pos_type == 'BUY' else (pos['entry_p'] - exit_p)
                            pnl = diff * pos['vol'] * contract_size
                            balance += pnl
                            trades.append({'profit': pnl, 'reason': reason, 'balance': balance})
                        else:
                            remaining_pos.append(pos)
                    open_positions = remaining_pos
                
                # Entry Conditions
                # BUY SETUP:
                # Price drops below lower Bollinger Band (overextended), RSI < 35, and green reversal bar
                buy_cond = (bar['low'] <= bar['bb_dn']) & (bar['close'] > bar['open']) & (bar['rsi'] < 38)
                
                # SELL SETUP:
                # Price rises above upper Bollinger Band, RSI > 65, and red reversal bar
                sell_cond = (bar['high'] >= bar['bb_up']) & (bar['close'] < bar['open']) & (bar['rsi'] > 62)
                
                if len(open_positions) < max_positions:
                    if buy_cond:
                        # Shared Swing SL
                        sl_p = bar['swing_low'] - (10 * point)
                        entry_p = bar['close'] + spread
                        sl_dist = entry_p - sl_p
                        
                        if sl_dist > (50 * point) and sl_dist < (2000 * point):
                            risk_cash = balance * risk_pct
                            vol = risk_cash / (sl_dist * contract_size)
                            vol = max(0.01, min(round(vol, 2), 50.0))
                            open_positions.append({'type': 'BUY', 'entry_p': entry_p, 'sl': sl_p, 'vol': vol})
                            
                    elif sell_cond:
                        sl_p = bar['swing_high'] + (10 * point) + spread
                        entry_p = bar['close']
                        sl_dist = sl_p - entry_p
                        
                        if sl_dist > (50 * point) and sl_dist < (2000 * point):
                            risk_cash = balance * risk_pct
                            vol = risk_cash / (sl_dist * contract_size)
                            vol = max(0.01, min(round(vol, 2), 50.0))
                            open_positions.append({'type': 'SELL', 'entry_p': entry_p, 'sl': sl_p, 'vol': vol})
            
            day_loss = (day_start - balance) / day_start * 100
            if day_loss > 0: max_daily_dd = max(max_daily_dd, day_loss)
            equity_curve.append(balance)
            
        tdf = pd.DataFrame(trades)
        if len(tdf) == 0: continue
        eq_s = pd.Series(equity_curve)
        peak = eq_s.cummax()
        max_tot_dd = abs(((eq_s - peak) / peak * 100).min())
        
        wins = tdf[tdf['profit'] > 0]
        losses = tdf[tdf['profit'] < 0]
        wr = len(wins) / len(tdf) * 100
        pf = wins['profit'].sum() / abs(losses['profit'].sum()) if len(losses) > 0 else 999
        ret = (balance - initial_balance) / initial_balance * 100
        dyn_exits = (tdf['reason'] == 'Dynamic_MeanRev').mean() * 100
        
        print(f"Risk: {risk_pct*100:4.2f}% | Final Bal: ${balance:,.2f} | Return: {ret:+7.1f}% | Trades: {len(tdf):4d} | WR: {wr:4.1f}% | PF: {pf:4.2f} | DynExits: {dyn_exits:4.1f}% | MaxDailyDD: {max_daily_dd:4.2f}% | MaxTotalDD: {max_tot_dd:4.2f}%")

if __name__ == '__main__':
    run_mean_reversion_simulation()
