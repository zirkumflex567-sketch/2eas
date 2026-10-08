import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_high_winrate_discovery():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
    info = mt5.symbol_info('XAUUSD')
    mt5.shutdown()
    
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['date'] = df.index.date
    df['hour'] = df.index.hour
    
    point = info.point
    contract = info.trade_contract_size
    spread = 30 * point
    
    # Technical Indicators
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # Bollinger Bands (20, 2.5 std - extreme bands!)
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_up_25'] = sma20 + 2.5 * std20
    df['bb_dn_25'] = sma20 - 2.5 * std20
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
    
    # Swing High & Low (last 40 bars)
    df['swing_high'] = df['high'].shift(1).rolling(40).max()
    df['swing_low'] = df['low'].shift(1).rolling(40).min()
    
    print("\n=========================================================================")
    print("      HIGH WIN RATE STRATEGY DISCOVERY (GOAL: 75% - 85%+ WIN RATE)")
    print("      Testing Extreme Mean Reversion, Deep Pullbacks & Liquidity Sweeps")
    print("=========================================================================")
    
    # MODEL 1: Deep Trend Pullback Bounce (Buy deep oversold in uptrend, Sell deep overbought in downtrend)
    # Entry: Macro trend up (Close > EMA200), RSI < 30 (extreme dip), Rejection wick
    # Exit: Quick TP at EMA20 / BB Mid (+15 to +35 pips) vs Structural Swing SL
    
    def simulate_model(buy_signals, sell_signals, tp_pips_list, sl_multiplier_list, name="Model"):
        print(f"\n--- Testing {name} ---")
        for tp_pips in tp_pips_list:
            for sl_mult in sl_multiplier_list:
                trades = []
                pos = None
                initial_balance = 10000.0
                balance = initial_balance
                eq = [initial_balance]
                
                for i in range(100, len(df)):
                    bar = df.iloc[i]
                    t = bar.name
                    
                    if pos is not None:
                        pos_type = pos['type']
                        sl = pos['sl']
                        tp = pos['tp']
                        closed = False
                        exit_p = 0
                        
                        if pos_type == 'BUY':
                            if bar['low'] <= sl:
                                exit_p = sl
                                closed = True
                            elif bar['high'] >= tp:
                                exit_p = tp
                                closed = True
                        else:
                            if bar['high'] >= sl:
                                exit_p = sl
                                closed = True
                            elif bar['low'] <= tp:
                                exit_p = tp
                                closed = True
                                
                        if closed:
                            diff = (exit_p - pos['ep']) if pos_type == 'BUY' else (pos['ep'] - exit_p)
                            pnl = diff * 0.01 * contract # fixed 0.01 lot for clean comparison
                            balance += pnl
                            trades.append(pnl)
                            pos = None
                    
                    if pos is None:
                        atr = bar['atr14']
                        if np.isnan(atr) or atr <= 0: continue
                        
                        buy = buy_signals.iloc[i]
                        sell = sell_signals.iloc[i]
                        
                        tp_dist = tp_pips * 10 * point
                        sl_dist = sl_mult * atr
                        
                        if buy:
                            ep = bar['close'] + spread
                            sl_p = ep - sl_dist
                            tp_p = ep + tp_dist
                            pos = {'type': 'BUY', 'ep': ep, 'sl': sl_p, 'tp': tp_p}
                        elif sell:
                            ep = bar['close']
                            sl_p = ep + sl_dist + spread
                            tp_p = ep - tp_dist
                            pos = {'type': 'SELL', 'ep': ep, 'sl': sl_p, 'tp': tp_p}
                    eq.append(balance)
                    
                tdf = pd.Series(trades)
                if len(tdf) > 50:
                    wins = tdf[tdf > 0]
                    losses = tdf[tdf < 0]
                    wr = len(wins) / len(tdf) * 100
                    pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 999
                    eq_s = pd.Series(eq)
                    peak = eq_s.cummax()
                    max_dd = abs(((eq_s - peak) / peak * 100).min())
                    
                    if wr >= 70.0 and pf >= 1.2:
                        print(f"TP: {tp_pips:2d} pips | SL: {sl_mult:.1f}x ATR | Trades: {len(tdf):4d} | WIN RATE: {wr:5.1f}% | Net: ${tdf.sum():+,.2f} | PF: {pf:4.2f} | MaxDD: {max_dd:4.1f}%")

    # Setup 1: Extreme Bollinger (2.5 std) + RSI Extreme Reversal
    # Overextension beyond 2.5 standard deviations almost always snaps back!
    buy_extreme_bb = (df['low'] <= df['bb_dn_25']) & (df['rsi'] < 30) & (df['close'] > df['open'])
    sell_extreme_bb = (df['high'] >= df['bb_up_25']) & (df['rsi'] > 70) & (df['close'] < df['open'])
    simulate_model(buy_extreme_bb, sell_extreme_bb, [15, 20, 25, 30], [2.0, 2.5, 3.0, 3.5], name="Model 1: Extreme 2.5 StdDev BB + RSI Exhaustion")

    # Setup 2: Macro Trend Deep Pullback Sniper
    # In Macro Uptrend (Price > EMA200), buy only when RSI < 32 and candle turns green
    # In Macro Downtrend (Price < EMA200), sell only when RSI > 68 and candle turns red
    uptrend = df['close'] > df['ema200']
    downtrend = df['close'] < df['ema200']
    buy_dip = uptrend & (df['rsi'] < 32) & (df['close'] > df['open'])
    sell_rally = downtrend & (df['rsi'] > 68) & (df['close'] < df['open'])
    simulate_model(buy_dip, sell_rally, [15, 20, 25, 30], [1.8, 2.2, 2.5, 3.0], name="Model 2: Macro Trend Deep Pullback Sniper")

    # Setup 3: Liquidity Sweep & Reversal (Turtle Soup / Liquidity Grab)
    # Price pokes below the 40-bar swing low, but closes back ABOVE the swing low (Failed Breakdown)
    # Price pokes above the 40-bar swing high, but closes back BELOW the swing high (Failed Breakout)
    prev_swing_low = df['swing_low'].shift(1)
    prev_swing_high = df['swing_high'].shift(1)
    bull_sweep = (df['low'] < prev_swing_low) & (df['close'] > prev_swing_low) & (df['close'] > df['open'])
    bear_sweep = (df['high'] > prev_swing_high) & (df['close'] < prev_swing_high) & (df['close'] < df['open'])
    simulate_model(bull_sweep, bear_sweep, [15, 20, 25, 30], [1.5, 2.0, 2.5], name="Model 3: Liquidity Sweep / Fakeout Reversal")

if __name__ == '__main__':
    run_high_winrate_discovery()
