import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_edge_discovery():
    if not mt5.initialize():
        print("Failed to init MT5")
        return
        
    symbols = ['EURUSD', 'XAUUSD', 'GBPUSD', 'US30']
    
    for sym in symbols:
        info = mt5.symbol_info(sym)
        if info is None:
            continue
            
        print(f"\n==========================================")
        print(f"ANALYZING EDGE FOR {sym} (point={info.point}, contract={info.trade_contract_size})")
        print(f"==========================================")
        
        rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_H1, 0, 15000)
        if rates is None or len(rates) == 0:
            continue
            
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('time', inplace=True)
        
        # Calculate Technicals
        df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
        df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
        df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
        df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
        
        # ATR 14
        tr = np.maximum(df['high'] - df['low'], 
                        np.maximum(abs(df['high'] - df['close'].shift(1)), 
                                   abs(df['low'] - df['close'].shift(1))))
        df['atr14'] = tr.rolling(14).mean()
        
        # RSI 14
        diff = df['close'].diff()
        gain = diff.clip(lower=0).rolling(14).mean()
        loss = (-diff.clip(upper=0)).rolling(14).mean()
        df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
        
        # MACD (12, 26, 9)
        ema12 = df['close'].ewm(span=12, adjust=False).mean()
        ema26 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_hist'] = df['macd'] - df['macd_signal']
        
        # SuperTrend indicator
        atr_mult = 3.0
        hl2 = (df['high'] + df['low']) / 2
        df['up_band'] = hl2 - (atr_mult * df['atr14'])
        df['dn_band'] = hl2 + (atr_mult * df['atr14'])
        
        # Test 1: Trend Alignment Pullback (Price > EMA200, EMA50 > EMA200, Pullback to EMA21, Bullish Candle)
        # Fixed R:R = 1:2 (SL = 1.5 * ATR, TP = 3.0 * ATR)
        
        def evaluate_signals(signal_series_buy, signal_series_sell, sl_mult=1.5, tp_mult=3.0, name="Signal"):
            trades = []
            spread = 20 * info.point if 'USD' in sym else 40 * info.point
            
            in_pos = False
            pos_type = None
            entry_p = 0
            sl_p = 0
            tp_p = 0
            
            for i in range(200, len(df)):
                bar = df.iloc[i]
                
                if in_pos:
                    if pos_type == 'BUY':
                        if bar['low'] <= sl_p:
                            trades.append({'profit_r': -1.0, 'type': 'BUY'})
                            in_pos = False
                        elif bar['high'] >= tp_p:
                            trades.append({'profit_r': tp_mult / sl_mult, 'type': 'BUY'})
                            in_pos = False
                    elif pos_type == 'SELL':
                        if bar['high'] >= sl_p:
                            trades.append({'profit_r': -1.0, 'type': 'SELL'})
                            in_pos = False
                        elif bar['low'] <= tp_p:
                            trades.append({'profit_r': tp_mult / sl_mult, 'type': 'SELL'})
                            in_pos = False
                
                if not in_pos:
                    atr = bar['atr14']
                    if np.isnan(atr) or atr <= 0:
                        continue
                        
                    if signal_series_buy.iloc[i]:
                        in_pos = True
                        pos_type = 'BUY'
                        entry_p = bar['close'] + spread
                        sl_p = entry_p - (sl_mult * atr)
                        tp_p = entry_p + (tp_mult * atr)
                    elif signal_series_sell.iloc[i]:
                        in_pos = True
                        pos_type = 'SELL'
                        entry_p = bar['close']
                        sl_p = entry_p + (sl_mult * atr) + spread
                        tp_p = entry_p - (tp_mult * atr)
            
            if len(trades) == 0:
                print(f"  {name}: 0 trades")
                return
                
            tdf = pd.DataFrame(trades)
            win_rate = (tdf['profit_r'] > 0).mean() * 100
            total_r = tdf['profit_r'].sum()
            pf = tdf[tdf['profit_r'] > 0]['profit_r'].sum() / abs(tdf[tdf['profit_r'] < 0]['profit_r'].sum() + 1e-9)
            print(f"  {name:35s} | Trades: {len(tdf):4d} | WinRate: {win_rate:5.1f}% | Total R: {total_r:+7.1f}R | PF: {pf:4.2f}")
            return total_r, pf
        
        # Model A: Golden Cross / Trend Follower (EMA 50 > EMA 200, MACD histogram crossing up)
        buy_a = (df['ema50'] > df['ema200']) & (df['macd_hist'] > 0) & (df['macd_hist'].shift(1) <= 0)
        sell_a = (df['ema50'] < df['ema200']) & (df['macd_hist'] < 0) & (df['macd_hist'].shift(1) >= 0)
        evaluate_signals(buy_a, sell_a, sl_mult=1.5, tp_mult=3.0, name="Model A: EMA200 + MACD Cross")
        
        # Model B: Breakout of 20-bar High/Low in Trend Direction (Donchian Trend)
        hh20 = df['high'].shift(1).rolling(20).max()
        ll20 = df['low'].shift(1).rolling(20).min()
        buy_b = (df['close'] > hh20) & (df['close'] > df['ema200']) & (df['close'].shift(1) <= hh20.shift(1))
        sell_b = (df['close'] < ll20) & (df['close'] < df['ema200']) & (df['close'].shift(1) >= ll20.shift(1))
        evaluate_signals(buy_b, sell_b, sl_mult=1.5, tp_mult=3.0, name="Model B: Donchian Trend Breakout")
        
        # Model C: Mean Reversion to Trend (Pullback to EMA 21 with RSI Oversold Rebound in Uptrend)
        buy_c = (df['close'] > df['ema200']) & (df['low'] <= df['ema21']) & (df['rsi'].shift(1) < 40) & (df['rsi'] >= 40)
        sell_c = (df['close'] < df['ema200']) & (df['high'] >= df['ema21']) & (df['rsi'].shift(1) > 60) & (df['rsi'] <= 60)
        evaluate_signals(buy_c, sell_c, sl_mult=1.5, tp_mult=2.5, name="Model C: EMA21 Pullback + RSI")
        
        # Model D: Asian Session Range Breakout (Trading London / NY Session)
        df['hour'] = df.index.hour
        # London Open momentum (8-10 GMT)
        buy_d = (df['hour'].isin([8, 9, 10])) & (df['close'] > df['high'].shift(1)) & (df['close'] > df['ema50']) & (df['ema50'] > df['ema200'])
        sell_d = (df['hour'].isin([8, 9, 10])) & (df['close'] < df['low'].shift(1)) & (df['close'] < df['ema50']) & (df['ema50'] < df['ema200'])
        evaluate_signals(buy_d, sell_d, sl_mult=1.2, tp_mult=2.5, name="Model D: London Open Momentum")
        
        # Model E: Higher Timeframe Trend + Multi-EMA Compression & Expansion Breakout
        ema9_cross_up = (df['ema9'] > df['ema21']) & (df['ema9'].shift(1) <= df['ema21'].shift(1))
        ema9_cross_dn = (df['ema9'] < df['ema21']) & (df['ema9'].shift(1) >= df['ema21'].shift(1))
        buy_e = ema9_cross_up & (df['close'] > df['ema200']) & (df['ema21'] > df['ema50'])
        sell_e = ema9_cross_dn & (df['close'] < df['ema200']) & (df['ema21'] < df['ema50'])
        evaluate_signals(buy_e, sell_e, sl_mult=1.5, tp_mult=3.0, name="Model E: EMA Ribbon Trend Alignment")
        
    mt5.shutdown()

if __name__ == '__main__':
    run_edge_discovery()
