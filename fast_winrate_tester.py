import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 initialization failed")
    exit()

# Fetch M5 data (60,000 bars covers approx 1 year of M5)
rates_m5 = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M5, 0, 70000)
rates_m15 = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 35000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

point = info.point
contract = info.trade_contract_size
spread = 30 * point

print(f"Data fetched: {len(rates_m5)} M5 bars, {len(rates_m15)} M15 bars")

def run_fast_backtest(df, entries_buy, entries_sell, tp_pips, sl_pips):
    opens = df['open'].values
    highs = df['high'].values
    lows = df['low'].values
    closes = df['close'].values
    n = len(df)
    
    tp_dist = tp_pips * 10 * point
    sl_dist = sl_pips * 10 * point
    
    trades = []
    in_pos = 0 # 1=buy, -1=sell, 0=none
    entry_p = 0.0
    sl_p = 0.0
    tp_p = 0.0
    
    buy_signals = entries_buy.values
    sell_signals = entries_sell.values
    
    for i in range(1, n):
        # Check current position against bar i
        if in_pos == 1:
            if lows[i] <= sl_p:
                trades.append((sl_p - entry_p) * 0.01 * contract)
                in_pos = 0
            elif highs[i] >= tp_p:
                trades.append((tp_p - entry_p) * 0.01 * contract)
                in_pos = 0
        elif in_pos == -1:
            if highs[i] >= sl_p:
                trades.append((entry_p - sl_p) * 0.01 * contract)
                in_pos = 0
            elif lows[i] <= tp_p:
                trades.append((entry_p - tp_p) * 0.01 * contract)
                in_pos = 0
                
        # If flat, check signal on bar i-1 (executed at bar i open)
        if in_pos == 0:
            if buy_signals[i-1]:
                in_pos = 1
                entry_p = opens[i] + spread
                sl_p = entry_p - sl_dist
                tp_p = entry_p + tp_dist
            elif sell_signals[i-1]:
                in_pos = -1
                entry_p = opens[i]
                sl_p = entry_p + sl_dist + spread
                tp_p = entry_p - tp_dist
                
    if len(trades) < 30:
        return None
        
    trades = np.array(trades)
    wins = trades[trades > 0]
    losses = trades[trades < 0]
    wr = len(wins) / len(trades) * 100
    pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 and losses.sum() != 0 else 999.0
    net = trades.sum()
    
    # Drawdown
    cum = np.cumsum(trades)
    peak = np.maximum.accumulate(cum)
    dd = np.max(peak - cum)
    
    return {
        'trades': len(trades),
        'wr': wr,
        'pf': pf,
        'net': net,
        'dd': dd,
        'avg_win': wins.mean() if len(wins) > 0 else 0,
        'avg_loss': losses.mean() if len(losses) > 0 else 0
    }

# Let's test on M5 dataframe
df = pd.DataFrame(rates_m5)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)
df['hour'] = df.index.hour

# Indicators
df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

# RSI 14
diff = df['close'].diff()
gain = diff.clip(lower=0).rolling(14).mean()
loss = (-diff.clip(upper=0)).rolling(14).mean()
df['rsi14'] = 100 - (100 / (1 + gain / (loss + 1e-9)))

# RSI 7 (faster momentum oscillator)
gain7 = diff.clip(lower=0).rolling(7).mean()
loss7 = (-diff.clip(upper=0)).rolling(7).mean()
df['rsi7'] = 100 - (100 / (1 + gain7 / (loss7 + 1e-9)))

# Bollinger Bands 20
sma20 = df['close'].rolling(20).mean()
std20 = df['close'].rolling(20).std()
df['bb_mid'] = sma20
df['bb_up_20'] = sma20 + 2.0 * std20
df['bb_dn_20'] = sma20 - 2.0 * std20
df['bb_up_25'] = sma20 + 2.5 * std20
df['bb_dn_25'] = sma20 - 2.5 * std20

# ATR 14
tr = np.maximum(df['high'] - df['low'], 
                np.maximum(abs(df['high'] - df['close'].shift(1)), 
                           abs(df['low'] - df['close'].shift(1))))
df['atr14'] = tr.rolling(14).mean()

print("\n--- Testing M5 Extreme Mean Reversion (Overextension Exhaustion) ---")
# When price pierces BB 2.5 or 2.0 and RSI7 is extreme (<15 or >85)
for bb_type in ['20', '25']:
    bb_up = df['bb_up_' + bb_type]
    bb_dn = df['bb_dn_' + bb_type]
    
    for rsi_thresh in [20, 25, 30]:
        buy_sig = (df['low'] <= bb_dn) & (df['rsi7'] < rsi_thresh) & (df['close'] > df['open'])
        sell_sig = (df['high'] >= bb_up) & (df['rsi7'] > (100 - rsi_thresh)) & (df['close'] < df['open'])
        
        for tp in [15, 20, 25, 30]:
            for sl in [30, 45, 60, 80]:
                res = run_fast_backtest(df, buy_sig, sell_sig, tp, sl)
                if res and res['wr'] >= 75.0 and res['pf'] >= 1.5:
                    print(f"[BB{bb_type} RSI<{rsi_thresh}] TP:{tp:2d}p | SL:{sl:2d}p | Trades:{res['trades']:4d} | WR:{res['wr']:5.1f}% | Net:${res['net']:+,.2f} | PF:{res['pf']:4.2f} | MaxDD:${res['dd']:4.1f}")

print("\n--- Testing Trend-Pullback Scalper (Trend + RSI Exhaustion) ---")
# Macro trend on EMA200
uptrend = df['close'] > df['ema200']
downtrend = df['close'] < df['ema200']

for rsi_thresh in [25, 30, 35]:
    buy_sig = uptrend & (df['rsi7'] < rsi_thresh) & (df['close'] > df['open'])
    sell_sig = downtrend & (df['rsi7'] > (100 - rsi_thresh)) & (df['close'] < df['open'])
    
    for tp in [15, 20, 25, 30]:
        for sl in [30, 40, 50, 60]:
            res = run_fast_backtest(df, buy_sig, sell_sig, tp, sl)
            if res and res['wr'] >= 75.0 and res['pf'] >= 1.5:
                print(f"[Trend RSI<{rsi_thresh}] TP:{tp:2d}p | SL:{sl:2d}p | Trades:{res['trades']:4d} | WR:{res['wr']:5.1f}% | Net:${res['net']:+,.2f} | PF:{res['pf']:4.2f} | MaxDD:${res['dd']:4.1f}")
