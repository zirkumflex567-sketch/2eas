import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 Init Failed")
    exit()

symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY']

for sym in symbols:
    info = mt5.symbol_info(sym)
    if info is None:
        continue
    rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M15, 0, 30000)
    if rates is None or len(rates) == 0:
        continue
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['hour'] = df.index.hour
    
    point = info.point
    contract = info.trade_contract_size
    spread = 30 * point if 'XAU' in sym else (12 * point if 'JPY' in sym else 15 * point)
    
    # Indicators
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_mid'] = sma20
    df['bb_up'] = sma20 + 2.0 * std20
    df['bb_dn'] = sma20 - 2.0 * std20
    df['bb_up_25'] = sma20 + 2.5 * std20
    df['bb_dn_25'] = sma20 - 2.5 * std20
    
    diff = df['close'].diff()
    gain = diff.clip(lower=0).rolling(14).mean()
    loss = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
    
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    # 40-bar swing high / low
    df['swing_high'] = df['high'].shift(1).rolling(40).max()
    df['swing_low'] = df['low'].shift(1).rolling(40).min()
    
    # STRATEGY A: Asian Range Liquidity Sweep (Fade false breakout during London Open)
    # Range formed between 00:00 and 07:00. London open 08:00 - 11:00.
    # If price sweeps Asian High and closes back inside -> SELL targeting Asian Mid/Low.
    # If price sweeps Asian Low and closes back inside -> BUY targeting Asian Mid/High.
    
    # STRATEGY B: Trend-Following Pullback to EMA20 with Reversal Confirmation
    # Uptrend: Close > EMA200. Low touches EMA20 or dips below, then Close > Open.
    # TP: 1.0x ATR, SL: 1.5x ATR.
    
    # STRATEGY C: Mean Reversion on BB Overextension during Quiet Sessions (18:00 - 06:00)
    # Price touches BB 2.0, closes back inside. TP: BB Mid. SL: 1.5x ATR.
    
    print(f"\n=======================================================")
    print(f" TESTING HIGH WIN RATE SETUPS ON: {sym}")
    print(f"=======================================================")
    
    # Fast simulation engine
    opens = df['open'].values
    highs = df['high'].values
    lows = df['low'].values
    closes = df['close'].values
    n = len(df)
    
    def test_setup(buy_sigs, sell_sigs, tp_mode, sl_mult, name=""):
        trades = []
        in_pos = 0
        ep = 0.0
        sl_p = 0.0
        tp_p = 0.0
        
        b_sig = buy_sigs.values
        s_sig = sell_sigs.values
        atrs = df['atr14'].values
        bb_mids = df['bb_mid'].values
        
        for i in range(1, n):
            atr = atrs[i]
            if np.isnan(atr) or atr <= 0: continue
            
            if in_pos == 1:
                # Dynamic TP to BB Mid or fixed
                target = bb_mids[i] if tp_mode == 'BBMID' else tp_p
                if lows[i] <= sl_p:
                    trades.append((sl_p - ep) * 0.01 * contract)
                    in_pos = 0
                elif highs[i] >= target:
                    trades.append((target - ep) * 0.01 * contract)
                    in_pos = 0
            elif in_pos == -1:
                target = bb_mids[i] if tp_mode == 'BBMID' else tp_p
                if highs[i] >= sl_p:
                    trades.append((ep - sl_p) * 0.01 * contract)
                    in_pos = 0
                elif lows[i] <= target:
                    trades.append((ep - target) * 0.01 * contract)
                    in_pos = 0
                    
            if in_pos == 0:
                sl_dist = sl_mult * atr
                if b_sig[i-1]:
                    in_pos = 1
                    ep = opens[i] + spread
                    sl_p = ep - sl_dist
                    tp_p = ep + (tp_mode if isinstance(tp_mode, (int, float)) else 1.0) * atr
                elif s_sig[i-1]:
                    in_pos = -1
                    ep = opens[i]
                    sl_p = ep + sl_dist + spread
                    tp_p = ep - (tp_mode if isinstance(tp_mode, (int, float)) else 1.0) * atr
                    
        if len(trades) > 30:
            trades = np.array(trades)
            wins = trades[trades > 0]
            losses = trades[trades < 0]
            wr = len(wins) / len(trades) * 100
            pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 and losses.sum() != 0 else 999.0
            cum = np.cumsum(trades)
            peak = np.maximum.accumulate(cum)
            dd = np.max(peak - cum)
            
            if wr >= 70.0 and pf >= 1.2:
                print(f"[{name}] Trades:{len(trades):4d} | WR:{wr:5.1f}% | Net:${trades.sum():+,.2f} | PF:{pf:4.2f} | MaxDD:${dd:4.1f}")
                
    # Test 1: Trend Pullback to EMA20 / EMA50
    uptrend = (df['close'] > df['ema200']) & (df['ema50'] > df['ema200'])
    downtrend = (df['close'] < df['ema200']) & (df['ema50'] < df['ema200'])
    buy_trend_pb = uptrend & (df['low'] <= df['ema20']) & (df['close'] > df['ema20']) & (df['rsi'] < 45)
    sell_trend_pb = downtrend & (df['high'] >= df['ema20']) & (df['close'] < df['ema20']) & (df['rsi'] > 55)
    
    for tp in [0.6, 0.8, 1.0, 1.2]:
        for sl in [1.5, 2.0, 2.5]:
            test_setup(buy_trend_pb, sell_trend_pb, tp, sl, name=f"TrendPB TP:{tp}ATR SL:{sl}ATR")
            
    # Test 2: Night / Asian Range Mean Reversion (19:00 to 07:00)
    night_hours = (df['hour'] >= 19) | (df['hour'] <= 6)
    buy_night = night_hours & (df['low'] <= df['bb_dn']) & (df['close'] > df['bb_dn']) & (df['rsi'] < 35)
    sell_night = night_hours & (df['high'] >= df['bb_up']) & (df['close'] < df['bb_up']) & (df['rsi'] > 65)
    
    for tp in [0.5, 0.8, 1.0, 'BBMID']:
        for sl in [1.5, 2.0, 2.5]:
            test_setup(buy_night, sell_night, tp, sl, name=f"NightFade TP:{tp} SL:{sl}ATR")

mt5.shutdown()
