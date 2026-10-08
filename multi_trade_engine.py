import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_multi_trade_test():
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
    
    # Technical Indicators on M15
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # ATR 14
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    df['atr_ma'] = df['atr14'].rolling(50).mean()
    
    # RSI 14
    diff = df['close'].diff()
    gain = diff.clip(lower=0).rolling(14).mean()
    loss = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
    
    # Active Trading Hours: Frankfurt Open to late NY (07:00 to 20:00 UTC)
    df['trading_hours'] = (df['hour'] >= 7) & (df['hour'] <= 19)
    
    # Donchian 15
    df['hh15'] = df['high'].shift(1).rolling(15).max()
    df['ll15'] = df['low'].shift(1).rolling(15).min()
    
    # Candle patterns
    candle_body = (df['close'] - df['open']).abs()
    candle_range = df['high'] - df['low']
    bull_candle = (df['close'] > df['open']) & (candle_body > 0.4 * candle_range)
    bear_candle = (df['close'] < df['open']) & (candle_body > 0.4 * candle_range)
    
    # -------------------------------------------------------------
    # SIGNALS: Multi-Setup Strategy
    # 1. Trend Breakout: Close > 15-bar High in uptrend
    # 2. Trend Pullback Rejection: In strong trend, price dips into EMA20/50 and closes strongly back in trend
    # -------------------------------------------------------------
    uptrend = (df['close'] > df['ema200']) & (df['ema50'] > df['ema200'])
    downtrend = (df['close'] < df['ema200']) & (df['ema50'] < df['ema200'])
    
    # Setup 1: High Breakout
    buy_breakout = uptrend & (df['close'] > df['hh15']) & (df['close'].shift(1) <= df['hh15'].shift(1)) & bull_candle & df['trading_hours']
    sell_breakout = downtrend & (df['close'] < df['ll15']) & (df['close'].shift(1) >= df['ll15'].shift(1)) & bear_candle & df['trading_hours']
    
    # Setup 2: EMA Pullback Re-test
    pullback_buy = uptrend & (df['low'] <= df['ema20']) & (df['close'] > df['ema20']) & bull_candle & (df['rsi'] > 45) & (df['rsi'] < 65) & df['trading_hours']
    pullback_sell = downtrend & (df['high'] >= df['ema20']) & (df['close'] < df['ema20']) & bear_candle & (df['rsi'] < 55) & (df['rsi'] > 35) & df['trading_hours']
    
    buy_all = buy_breakout | pullback_buy
    sell_all = sell_breakout | pullback_sell
    
    point = info.point
    contract_size = info.trade_contract_size
    spread = 30 * point
    
    print("\n=========================================================================")
    print("      MULTI-TRADE INTRADAY STRATEGY TEST (BLUEBERRY RULES)")
    print("      Daily Max DD Limit = 4.0% | Overall Max DD Limit = 10.0%")
    print("=========================================================================")
    
    # Test different Max Trades Per Day: 3, 5, 8, Unlimited
    # and different Risk per Trade: 0.35%, 0.50%, 0.65%
    for max_daily_trades in [2, 3, 5, 10]:
        for risk_pct in [0.004, 0.005, 0.006, 0.0075]:
            initial_balance = 100000.0
            balance = initial_balance
            equity_curve = [initial_balance]
            trades = []
            
            # Hard Daily Loss circuit breaker for Blueberry (halt at 2.5% daily loss)
            daily_loss_limit_pct = 2.5
            
            max_daily_dd = 0.0
            total_days = len(df['date'].unique())
            
            pos = None
            
            for d in df['date'].unique():
                day_df = df[df['date'] == d]
                day_start_balance = balance
                day_trades_count = 0
                day_halted = False
                
                for i in range(len(day_df)):
                    bar = day_df.iloc[i]
                    t = bar.name
                    
                    # Check active position
                    if pos is not None:
                        sl = pos['sl']
                        tp = pos['tp']
                        pos_type = pos['type']
                        closed = False
                        exit_p = 0.0
                        
                        if pos_type == 'BUY':
                            if bar['low'] <= sl:
                                exit_p = sl
                                closed = True
                            elif bar['high'] >= tp:
                                exit_p = tp
                                closed = True
                        elif pos_type == 'SELL':
                            if bar['high'] >= sl:
                                exit_p = sl
                                closed = True
                            elif bar['low'] <= tp:
                                exit_p = tp
                                closed = True
                                
                        if closed:
                            pips = (exit_p - pos['entry_p']) if pos_type == 'BUY' else (pos['entry_p'] - exit_p)
                            profit = pips * pos['vol'] * contract_size
                            balance += profit
                            trades.append({'date': d, 'profit': profit, 'balance': balance})
                            pos = None
                            
                            # Check Daily Loss Breaker
                            daily_loss_pct = ((day_start_balance - balance) / day_start_balance) * 100
                            if daily_loss_pct >= daily_loss_limit_pct:
                                day_halted = True
                    
                    # New Trade Entry
                    if pos is None and not day_halted and day_trades_count < max_daily_trades:
                        atr = bar['atr14']
                        if np.isnan(atr) or atr <= 0: continue
                        
                        buy_sig = buy_all.loc[t]
                        sell_sig = sell_all.loc[t]
                        
                        if buy_sig:
                            entry_p = bar['close'] + spread
                            sl_dist = 1.3 * atr
                            tp_dist = 2.6 * atr # 1:2 RRR
                            sl = entry_p - sl_dist
                            tp = entry_p + tp_dist
                            
                            risk_cash = balance * risk_pct
                            vol = risk_cash / (sl_dist * contract_size)
                            vol = max(0.01, min(round(vol, 2), 100.0))
                            
                            pos = {'type': 'BUY', 'entry_p': entry_p, 'sl': sl, 'tp': tp, 'vol': vol}
                            day_trades_count += 1
                            
                        elif sell_sig:
                            entry_p = bar['close']
                            sl_dist = 1.3 * atr
                            tp_dist = 2.6 * atr
                            sl = entry_p + sl_dist + spread
                            tp = entry_p - tp_dist
                            
                            risk_cash = balance * risk_pct
                            vol = risk_cash / (sl_dist * contract_size)
                            vol = max(0.01, min(round(vol, 2), 100.0))
                            
                            pos = {'type': 'SELL', 'entry_p': entry_p, 'sl': sl, 'tp': tp, 'vol': vol}
                            day_trades_count += 1
                
                # Close at EOD if still open
                if pos is not None:
                    last_bar = day_df.iloc[-1]
                    pips = (last_bar['close'] - pos['entry_p']) if pos['type'] == 'BUY' else (pos['entry_p'] - last_bar['close'])
                    profit = pips * pos['vol'] * contract_size
                    balance += profit
                    trades.append({'date': d, 'profit': profit, 'balance': balance})
                    pos = None
                
                # Check day stats
                day_loss = (day_start_balance - balance) / day_start_balance * 100
                if day_loss > 0:
                    max_daily_dd = max(max_daily_dd, day_loss)
                equity_curve.append(balance)
            
            tdf = pd.DataFrame(trades)
            if len(tdf) == 0: continue
            
            eq_s = pd.Series(equity_curve)
            peak = eq_s.cummax()
            max_tot_dd = abs(((eq_s - peak) / peak * 100).min())
            
            wins = tdf[tdf['profit'] > 0]
            losses = tdf[tdf['profit'] < 0]
            pf = wins['profit'].sum() / abs(losses['profit'].sum()) if len(losses) > 0 else 999
            wr = len(wins) / len(tdf) * 100
            ret = (balance - initial_balance) / initial_balance * 100
            trades_per_day = len(tdf) / total_days
            
            status = "PASSED" if (max_daily_dd < 4.0 and max_tot_dd < 10.0) else "VIOLATED"
            
            if status == "PASSED" and ret > 50.0:
                print(f"MaxTrades/Day: {max_daily_trades:2d} | Risk: {risk_pct*100:4.2f}% | Total Trades: {len(tdf):4d} ({trades_per_day:.1f}/day) | Return: {ret:+7.1f}% | PF: {pf:4.2f} | MaxDayDD: {max_daily_dd:4.2f}% | MaxTotDD: {max_tot_dd:4.2f}% | {status}")

if __name__ == '__main__':
    run_multi_trade_test()
