import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_gold_quant():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    symbol = 'XAUUSD'
    info = mt5.symbol_info(symbol)
    
    # Let's get both H1 and H4 data to build a True Multi-Timeframe System
    rates_h1 = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H1, 0, 25000)
    rates_h4 = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H4, 0, 8000)
    rates_m15 = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 30000)
    
    mt5.shutdown()
    
    print(f"Loaded: H1={len(rates_h1)}, H4={len(rates_h4)}, M15={len(rates_m15)}")
    
    df_h1 = pd.DataFrame(rates_h1)
    df_h1['time'] = pd.to_datetime(df_h1['time'], unit='s')
    df_h1.set_index('time', inplace=True)
    
    df_h4 = pd.DataFrame(rates_h4)
    df_h4['time'] = pd.to_datetime(df_h4['time'], unit='s')
    df_h4.set_index('time', inplace=True)
    
    # Calculate H4 Trend: EMA 50 and EMA 200
    df_h4['h4_ema50'] = df_h4['close'].ewm(span=50, adjust=False).mean()
    df_h4['h4_ema200'] = df_h4['close'].ewm(span=200, adjust=False).mean()
    df_h4['h4_trend'] = np.where(df_h4['close'] > df_h4['h4_ema50'], 1, np.where(df_h4['close'] < df_h4['h4_ema50'], -1, 0))
    
    # Reindex H4 trend to H1
    df_h1['h4_trend'] = df_h4['h4_trend'].reindex(df_h1.index, method='ffill')
    
    # H1 Indicators
    df_h1['ema20'] = df_h1['close'].ewm(span=20, adjust=False).mean()
    df_h1['ema50'] = df_h1['close'].ewm(span=50, adjust=False).mean()
    df_h1['ema200'] = df_h1['close'].ewm(span=200, adjust=False).mean()
    
    # ATR (14)
    tr = np.maximum(df_h1['high'] - df_h1['low'], 
                    np.maximum(abs(df_h1['high'] - df_h1['close'].shift(1)), 
                               abs(df_h1['low'] - df_h1['close'].shift(1))))
    df_h1['atr14'] = tr.rolling(14).mean()
    df_h1['atr_ma'] = df_h1['atr14'].rolling(50).mean()
    df_h1['vol_expansion'] = df_h1['atr14'] > (0.9 * df_h1['atr_ma'])
    
    # ADX (14)
    plus_dm = df_h1['high'].diff()
    minus_dm = -df_h1['low'].diff()
    plus_dm = np.where((plus_dm > minus_dm) & (plus_dm > 0), plus_dm, 0.0)
    minus_dm = np.where((minus_dm > plus_dm) & (minus_dm > 0), minus_dm, 0.0)
    
    tr_sum = tr.rolling(14).sum()
    plus_di = 100 * (pd.Series(plus_dm, index=df_h1.index).rolling(14).sum() / (tr_sum + 1e-9))
    minus_di = 100 * (pd.Series(minus_dm, index=df_h1.index).rolling(14).sum() / (tr_sum + 1e-9))
    dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di + 1e-9))
    df_h1['adx14'] = dx.rolling(14).mean()
    
    # Session Hours: London Open (7-11 UTC) and NY Open (12-17 UTC)
    df_h1['hour'] = df_h1.index.hour
    df_h1['session_active'] = (df_h1['hour'] >= 7) & (df_h1['hour'] <= 18)
    
    # Donchian 20
    df_h1['hh20'] = df_h1['high'].shift(1).rolling(20).max()
    df_h1['ll20'] = df_h1['low'].shift(1).rolling(20).min()
    
    # Price Action: Candle Body and Wick
    candle_body = (df_h1['close'] - df_h1['open']).abs()
    candle_range = df_h1['high'] - df_h1['low']
    df_h1['strong_candle'] = candle_body > (0.45 * candle_range)
    
    # Grid of parameter variations to find the most robust setup
    def simulate_enhanced(signals_buy, signals_sell, sl_atr=1.5, tp_atr=3.0, be_atr=1.2, trail_atr=2.0, use_trail=True, risk_pct=0.015):
        initial_balance = 10000.0
        balance = initial_balance
        equity_curve = [initial_balance]
        trades = []
        point = info.point
        spread = 35 * point
        contract_size = info.trade_contract_size
        
        pos = None
        
        for i in range(250, len(df_h1)):
            bar = df_h1.iloc[i]
            t = df_h1.index[i]
            
            # Position management
            if pos is not None:
                pos_type = pos['type']
                sl = pos['sl']
                tp = pos['tp']
                entry_p = pos['entry_price']
                atr_entry = pos['atr']
                
                # Check BE
                if be_atr > 0 and not pos['be_activated']:
                    if pos_type == 'BUY' and bar['high'] >= entry_p + (be_atr * atr_entry):
                        pos['sl'] = entry_p + spread # Break Even
                        pos['be_activated'] = True
                    elif pos_type == 'SELL' and bar['low'] <= entry_p - (be_atr * atr_entry):
                        pos['sl'] = entry_p - spread
                        pos['be_activated'] = True
                
                # Check Trailing Stop (only active after BE or in profit)
                if use_trail and pos['be_activated']:
                    if pos_type == 'BUY':
                        pos['peak'] = max(pos['peak'], bar['high'])
                        trail_sl = pos['peak'] - (trail_atr * bar['atr14'])
                        if trail_sl > pos['sl']:
                            pos['sl'] = trail_sl
                    elif pos_type == 'SELL':
                        pos['peak'] = min(pos['peak'], bar['low'])
                        trail_sl = pos['peak'] + (trail_atr * bar['atr14'])
                        if trail_sl < pos['sl']:
                            pos['sl'] = trail_sl
                
                # Check Exits
                closed = False
                exit_price = 0.0
                exit_reason = ""
                
                if pos_type == 'BUY':
                    if bar['low'] <= pos['sl']:
                        exit_price = pos['sl']
                        exit_reason = 'BE/SL' if pos['be_activated'] else 'SL'
                        closed = True
                    elif bar['high'] >= pos['tp']:
                        exit_price = pos['tp']
                        exit_reason = 'TP'
                        closed = True
                elif pos_type == 'SELL':
                    if bar['high'] >= pos['sl']:
                        exit_price = pos['sl']
                        exit_reason = 'BE/SL' if pos['be_activated'] else 'SL'
                        closed = True
                    elif bar['low'] <= pos['tp']:
                        exit_price = pos['tp']
                        exit_reason = 'TP'
                        closed = True
                
                if closed:
                    pips = (exit_price - entry_p) if pos_type == 'BUY' else (entry_p - exit_price)
                    pnl = pips * pos['vol'] * contract_size
                    balance += pnl
                    trades.append({
                        'type': pos_type,
                        'entry_time': pos['time'],
                        'exit_time': t,
                        'entry_price': entry_p,
                        'exit_price': exit_price,
                        'pnl': pnl,
                        'return_pct': pnl / (balance - pnl),
                        'reason': exit_reason,
                        'balance': balance
                    })
                    pos = None
            
            # New Entry
            if pos is None:
                atr = bar['atr14']
                if np.isnan(atr) or atr <= 0:
                    continue
                    
                buy = signals_buy.iloc[i]
                sell = signals_sell.iloc[i]
                
                if buy:
                    entry_p = bar['close'] + spread
                    sl_dist = sl_atr * atr
                    tp_dist = tp_atr * atr
                    sl = entry_p - sl_dist
                    tp = entry_p + tp_dist
                    
                    risk_usd = balance * risk_pct
                    vol = risk_usd / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    pos = {
                        'type': 'BUY',
                        'entry_price': entry_p,
                        'sl': sl,
                        'tp': tp,
                        'vol': vol,
                        'time': t,
                        'atr': atr,
                        'peak': entry_p,
                        'be_activated': False
                    }
                elif sell:
                    entry_p = bar['close']
                    sl_dist = sl_atr * atr
                    tp_dist = tp_atr * atr
                    sl = entry_p + sl_dist + spread
                    tp = entry_p - tp_dist
                    
                    risk_usd = balance * risk_pct
                    vol = risk_usd / (sl_dist * contract_size)
                    vol = max(0.01, min(round(vol, 2), 50.0))
                    
                    pos = {
                        'type': 'SELL',
                        'entry_price': entry_p,
                        'sl': sl,
                        'tp': tp,
                        'vol': vol,
                        'time': t,
                        'atr': atr,
                        'peak': entry_p,
                        'be_activated': False
                    }
            equity_curve.append(balance)
            
        tdf = pd.DataFrame(trades)
        if len(tdf) == 0:
            return None
            
        wins = tdf[tdf['pnl'] > 0]
        losses = tdf[tdf['pnl'] < 0]
        gp = wins['pnl'].sum() if len(wins) > 0 else 0
        gl = abs(losses['pnl'].sum()) if len(losses) > 0 else 1e-9
        pf = gp / gl
        
        eq = pd.Series(equity_curve)
        peak = eq.cummax()
        dd = (eq - peak) / peak * 100
        max_dd = abs(dd.min())
        
        ret = (balance - initial_balance) / initial_balance * 100
        wr = len(wins) / len(tdf) * 100
        
        return {
            'trades': len(tdf),
            'win_rate': round(wr, 1),
            'return_pct': round(ret, 1),
            'net_profit': round(balance - initial_balance, 2),
            'final_balance': round(balance, 2),
            'pf': round(pf, 2),
            'max_dd': round(max_dd, 1),
            'trades_df': tdf,
            'equity': eq
        }

    # Now let's test Strategy Variations:
    # -------------------------------------------------------------
    # VARIANT 1: Multi-Timeframe Institutional Trend Rider
    # H4 Trend: Close > H4 EMA50
    # H1 Trend: Close > H1 EMA200
    # ADX > 22 (Trending market regime)
    # Session: London & NY active
    # Entry: Donchian 20-bar breakout with strong candle confirmation
    # -------------------------------------------------------------
    buy_v1 = (df_h1['h4_trend'] == 1) & (df_h1['close'] > df_h1['ema200']) & \
             (df_h1['close'] > df_h1['hh20']) & (df_h1['close'].shift(1) <= df_h1['hh20'].shift(1)) & \
             (df_h1['adx14'] > 20) & df_h1['session_active'] & df_h1['strong_candle']
             
    sell_v1 = (df_h1['h4_trend'] == -1) & (df_h1['close'] < df_h1['ema200']) & \
              (df_h1['close'] < df_h1['ll20']) & (df_h1['close'].shift(1) >= df_h1['ll20'].shift(1)) & \
              (df_h1['adx14'] > 20) & df_h1['session_active'] & df_h1['strong_candle']

    print("\n--- VARIANT 1: Multi-Timeframe Trend Breakout (MTF Donchian + ADX + Session) ---")
    for tp_val in [2.5, 3.0, 4.0, 5.0]:
        res = simulate_enhanced(buy_v1, sell_v1, sl_atr=1.5, tp_atr=tp_val, be_atr=1.5, trail_atr=2.5, use_trail=True, risk_pct=0.015)
        if res:
            print(f"TP={tp_val}x ATR | Trades: {res['trades']:3d} | WinRate: {res['win_rate']:4.1f}% | Return: {res['return_pct']:+6.1f}% | Final Bal: ${res['final_balance']:,.0f} | PF: {res['pf']:4.2f} | MaxDD: {res['max_dd']:4.1f}%")

    # -------------------------------------------------------------
    # VARIANT 2: Multi-Timeframe EMA Dynamic Pullback & Re-Test
    # Uptrend: H4 Trend Bullish + H1 Close > EMA50 > EMA200
    # Entry: Pullback to EMA20 / EMA50 zone (Low <= EMA20) and bullish close above EMA20
    # -------------------------------------------------------------
    bull_pullback = (df_h1['h4_trend'] == 1) & (df_h1['ema50'] > df_h1['ema200']) & \
                    (df_h1['low'] <= df_h1['ema20']) & (df_h1['close'] > df_h1['ema20']) & \
                    (df_h1['close'] > df_h1['open']) & df_h1['session_active'] & (df_h1['adx14'] > 20)
                    
    bear_pullback = (df_h1['h4_trend'] == -1) & (df_h1['ema50'] < df_h1['ema200']) & \
                    (df_h1['high'] >= df_h1['ema20']) & (df_h1['close'] < df_h1['ema20']) & \
                    (df_h1['close'] < df_h1['open']) & df_h1['session_active'] & (df_h1['adx14'] > 20)

    print("\n--- VARIANT 2: MTF EMA Pullback & Continuation ---")
    for tp_val in [2.0, 2.5, 3.0, 3.5]:
        res = simulate_enhanced(bull_pullback, bear_pullback, sl_atr=1.5, tp_atr=tp_val, be_atr=1.2, trail_atr=2.0, use_trail=False, risk_pct=0.015)
        if res:
            print(f"TP={tp_val}x ATR | Trades: {res['trades']:3d} | WinRate: {res['win_rate']:4.1f}% | Return: {res['return_pct']:+6.1f}% | Final Bal: ${res['final_balance']:,.0f} | PF: {res['pf']:4.2f} | MaxDD: {res['max_dd']:4.1f}%")

    # -------------------------------------------------------------
    # VARIANT 3: Pure High-RR Trend Momentum (TP=4.0x, SL=1.5x, BE=1.5x)
    # Testing with No Trailing vs Trailing
    # -------------------------------------------------------------
    print("\n--- VARIANT 3: Testing Trail vs Fixed TP for Variant 1 ---")
    for use_t in [False, True]:
        for be_v in [0.0, 1.2, 1.5, 2.0]:
            res = simulate_enhanced(buy_v1, sell_v1, sl_atr=1.5, tp_atr=3.5, be_atr=be_v, trail_atr=2.5, use_trail=use_t, risk_pct=0.015)
            if res:
                print(f"Trail={str(use_t):5s} | BE={be_v}x ATR | Trades: {res['trades']:3d} | WinRate: {res['win_rate']:4.1f}% | Return: {res['return_pct']:+6.1f}% | Final Bal: ${res['final_balance']:,.0f} | PF: {res['pf']:4.2f} | MaxDD: {res['max_dd']:4.1f}%")

if __name__ == '__main__':
    run_gold_quant()
