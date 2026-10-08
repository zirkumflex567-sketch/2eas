import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_comprehensive_lab():
    if not mt5.initialize():
        print("MT5 initialization failed")
        return
        
    symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'US30']
    
    for sym in symbols:
        info = mt5.symbol_info(sym)
        if info is None:
            continue
            
        print(f"\n=======================================================")
        print(f"       COMPREHENSIVE OPTIMIZATION FOR {sym}")
        print(f"=======================================================")
        
        rates_h1 = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_H1, 0, 25000)
        rates_m15 = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M15, 0, 30000)
        
        if rates_h1 is None or rates_m15 is None:
            continue
            
        df_h1 = pd.DataFrame(rates_h1)
        df_h1['time'] = pd.to_datetime(df_h1['time'], unit='s')
        df_h1.set_index('time', inplace=True)
        
        df_m15 = pd.DataFrame(rates_m15)
        df_m15['time'] = pd.to_datetime(df_m15['time'], unit='s')
        df_m15.set_index('time', inplace=True)
        
        point = info.point
        contract_size = info.trade_contract_size
        spread_val = 15 * point if 'USD' in sym and sym != 'XAUUSD' else 35 * point
        
        # -----------------------------------------------------------------
        # TEST 1: Asian Session Mean Reversion on M15 (EURUSD & GBPUSD)
        # Low volatility hours: 21:00 to 06:00 UTC
        # -----------------------------------------------------------------
        if sym in ['EURUSD', 'GBPUSD']:
            df = df_m15.copy()
            df['hour'] = df.index.hour
            asian_hours = (df['hour'] >= 21) | (df['hour'] <= 5)
            
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
            
            # Entry: Buy at lower BB when RSI < 30 and green candle
            buy_mr = asian_hours & (df['low'] <= df['bb_dn']) & (df['close'] > df['open']) & (df['rsi'] < 35)
            sell_mr = asian_hours & (df['high'] >= df['bb_up']) & (df['close'] < df['open']) & (df['rsi'] > 65)
            
            # Backtest MR
            for tp_r in [1.0, 1.5, 2.0]:
                for sl_r in [1.0, 1.5, 2.0]:
                    trades = []
                    in_pos = False
                    pos_type = None
                    sl_p = 0
                    tp_p = 0
                    
                    for i in range(50, len(df)):
                        b = df.iloc[i]
                        if in_pos:
                            if pos_type == 'BUY':
                                if b['low'] <= sl_p:
                                    trades.append({'r': -1.0})
                                    in_pos = False
                                elif b['high'] >= tp_p:
                                    trades.append({'r': tp_r / sl_r})
                                    in_pos = False
                            elif pos_type == 'SELL':
                                if b['high'] >= sl_p:
                                    trades.append({'r': -1.0})
                                    in_pos = False
                                elif b['low'] <= tp_p:
                                    trades.append({'r': tp_r / sl_r})
                                    in_pos = False
                        
                        if not in_pos:
                            atr = b['atr14']
                            if np.isnan(atr) or atr <= 0: continue
                            if buy_mr.iloc[i]:
                                in_pos = True
                                pos_type = 'BUY'
                                ep = b['close'] + spread_val
                                sl_p = ep - (sl_r * atr)
                                tp_p = ep + (tp_r * atr)
                            elif sell_mr.iloc[i]:
                                in_pos = True
                                pos_type = 'SELL'
                                ep = b['close']
                                sl_p = ep + (sl_r * atr) + spread_val
                                tp_p = ep - (tp_r * atr)
                    
                    if len(trades) > 50:
                        tdf = pd.DataFrame(trades)
                        wr = (tdf['r'] > 0).mean() * 100
                        tot_r = tdf['r'].sum()
                        pf = tdf[tdf['r'] > 0]['r'].sum() / abs(tdf[tdf['r'] < 0]['r'].sum() + 1e-9)
                        if tot_r > 15:
                            print(f"  [M15 Asian MR] TP={tp_r}x, SL={sl_r}x | Trades: {len(tdf)} | WR: {wr:.1f}% | Total R: {tot_r:+.1f}R | PF: {pf:.2f}")

        # -----------------------------------------------------------------
        # TEST 2: High-Momentum London & NY Range Breakout (Gold & US30)
        # -----------------------------------------------------------------
        df = df_h1.copy()
        df['hour'] = df.index.hour
        
        # ATR 14
        tr = np.maximum(df['high'] - df['low'], 
                        np.maximum(abs(df['high'] - df['close'].shift(1)), 
                                   abs(df['low'] - df['close'].shift(1))))
        df['atr14'] = tr.rolling(14).mean()
        df['atr50'] = df['atr14'].rolling(50).mean()
        
        # EMAs
        df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
        df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
        df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
        
        # Higher Trend filter
        df['trend_up'] = (df['close'] > df['ema200']) & (df['ema50'] > df['ema200'])
        df['trend_down'] = (df['close'] < df['ema200']) & (df['ema50'] < df['ema200'])
        
        # Test Donchian lookback periods: 10, 20, 30, 40, 55
        for period in [10, 20, 30, 50]:
            hh = df['high'].shift(1).rolling(period).max()
            ll = df['low'].shift(1).rolling(period).min()
            
            # Session filter: London + NY (8 to 17)
            session = (df['hour'] >= 8) & (df['hour'] <= 17)
            
            # Volatility expansion: ATR14 > ATR50
            vol_ok = df['atr14'] >= (0.95 * df['atr50'])
            
            buy_bk = df['trend_up'] & (df['close'] > hh) & (df['close'].shift(1) <= hh.shift(1)) & session & vol_ok
            sell_bk = df['trend_down'] & (df['close'] < ll) & (df['close'].shift(1) >= ll.shift(1)) & session & vol_ok
            
            for sl_mult in [1.2, 1.5]:
                for tp_mult in [2.5, 3.0, 3.5, 4.0]:
                    trades = []
                    in_pos = False
                    pos_type = None
                    sl_p = 0
                    tp_p = 0
                    
                    for i in range(250, len(df)):
                        b = df.iloc[i]
                        if in_pos:
                            if pos_type == 'BUY':
                                if b['low'] <= sl_p:
                                    trades.append({'r': -1.0})
                                    in_pos = False
                                elif b['high'] >= tp_p:
                                    trades.append({'r': tp_mult / sl_mult})
                                    in_pos = False
                            elif pos_type == 'SELL':
                                if b['high'] >= sl_p:
                                    trades.append({'r': -1.0})
                                    in_pos = False
                                elif b['low'] <= tp_p:
                                    trades.append({'r': tp_mult / sl_mult})
                                    in_pos = False
                        
                        if not in_pos:
                            atr = b['atr14']
                            if np.isnan(atr) or atr <= 0: continue
                            if buy_bk.iloc[i]:
                                in_pos = True
                                pos_type = 'BUY'
                                ep = b['close'] + spread_val
                                sl_p = ep - (sl_mult * atr)
                                tp_p = ep + (tp_mult * atr)
                            elif sell_bk.iloc[i]:
                                in_pos = True
                                pos_type = 'SELL'
                                ep = b['close']
                                sl_p = ep + (sl_mult * atr) + spread_val
                                tp_p = ep - (tp_mult * atr)
                    
                    if len(trades) > 50:
                        tdf = pd.DataFrame(trades)
                        wr = (tdf['r'] > 0).mean() * 100
                        tot_r = tdf['r'].sum()
                        pf = tdf[tdf['r'] > 0]['r'].sum() / abs(tdf[tdf['r'] < 0]['r'].sum() + 1e-9)
                        if tot_r > 30.0 and pf > 1.15:
                            print(f"  [H1 Trend Breakout] Period={period:2d}, SL={sl_mult}x, TP={tp_mult}x | Trades: {len(tdf):3d} | WR: {wr:4.1f}% | Total R: {tot_r:+6.1f}R | PF: {pf:4.2f}")

    mt5.shutdown()

if __name__ == '__main__':
    run_comprehensive_lab()
