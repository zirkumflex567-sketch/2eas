import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 failed")
    exit()

rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

df = pd.DataFrame(rates)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)
point = info.point
contract = info.trade_contract_size
spread = 30 * point

# Indicators
df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

# RSI 14
diff = df['close'].diff()
g = diff.clip(lower=0).rolling(14).mean()
l = (-diff.clip(upper=0)).rolling(14).mean()
df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))

# ATR 14
tr = np.maximum(df['high'] - df['low'], 
                np.maximum(abs(df['high'] - df['close'].shift(1)), 
                           abs(df['low'] - df['close'].shift(1))))
df['atr14'] = tr.rolling(14).mean()

# Swing High/Low (80 bars = 20h)
df['swing_high'] = df['high'].shift(1).rolling(80).max()
df['swing_low'] = df['low'].shift(1).rolling(80).min()

df['hour'] = df.index.hour
df['minute'] = df.index.minute

# Test on 2026
sub = df.loc['2026-01-01':].copy()

# Momentum Continuation Rules:
# BUY: Close > EMA20 and EMA20 > EMA50 and RSI > 52 and Close > Open
# SELL: Close < EMA20 and EMA20 < EMA50 and RSI < 48 and Close < Open
# Hours: 01:00 to 16:00
time_ok = (sub['hour'] >= 1) & (sub['hour'] <= 15)
buy_sig = (sub['close'] > sub['ema20']) & (sub['ema20'] > sub['ema50']) & (sub['rsi14'] > 52) & (sub['close'] > sub['open']) & time_ok
sell_sig = (sub['close'] < sub['ema20']) & (sub['ema20'] < sub['ema50']) & (sub['rsi14'] < 48) & (sub['close'] < sub['open']) & time_ok

# Exit: Close crosses EMA20 in opposite direction OR Session end at hour 17
trades = []
in_pos = 0 # 1=BUY, -1=SELL
ep = 0.0
sl_p = 0.0

opens = sub['open'].values
highs = sub['high'].values
lows = sub['low'].values
closes = sub['close'].values
ema20s = sub['ema20'].values
hours = sub['hour'].values
swing_highs = sub['swing_high'].values
swing_lows = sub['swing_low'].values
b_vals = buy_sig.values
s_vals = sell_sig.values
n = len(sub)

for i in range(1, n):
    if in_pos == 1:
        # Check SL
        if lows[i] <= sl_p:
            trades.append((sl_p - ep) * 0.01 * contract)
            in_pos = 0
        # Dynamic Exit: Close crosses below EMA20 with profit OR session close at 17:00
        elif (closes[i] < ema20s[i] and (closes[i] - ep) > 1.5) or (hours[i] >= 17 and (closes[i] - ep) > 0.5):
            trades.append((closes[i] - ep) * 0.01 * contract)
            in_pos = 0
    elif in_pos == -1:
        if highs[i] >= sl_p:
            trades.append((ep - sl_p) * 0.01 * contract)
            in_pos = 0
        elif (closes[i] > ema20s[i] and (ep - closes[i]) > 1.5) or (hours[i] >= 17 and (ep - closes[i]) > 0.5):
            trades.append((ep - closes[i]) * 0.01 * contract)
            in_pos = 0
            
    if in_pos == 0:
        if b_vals[i-1]:
            in_pos = 1
            ep = opens[i] + spread
            sl_p = swing_lows[i-1] - (1.5)
            # clamp sl between 15 and 60 USD
            if (ep - sl_p) < 15.0: sl_p = ep - 15.0
            if (ep - sl_p) > 60.0: sl_p = ep - 60.0
        elif s_vals[i-1]:
            in_pos = -1
            ep = opens[i]
            sl_p = swing_highs[i-1] + (1.5) + spread
            if (sl_p - ep) < 15.0: sl_p = ep + 15.0 + spread
            if (sl_p - ep) > 60.0: sl_p = ep + 60.0 + spread

tdf = pd.Series(trades)
wins = tdf[tdf > 0]
losses = tdf[tdf < 0]
wr = len(wins) / len(tdf) * 100
pf = wins.sum() / abs(losses.sum())
cum = tdf.cumsum()
peak = cum.cummax()
dd = abs((cum - peak).min())

print(f"\n=== SIMULATION RESULTS 2026 (REVERSED MOMENTUM MODEL) ===")
print(f"Trades     : {len(tdf)}")
print(f"Win Rate   : {wr:.2f}% ({len(wins)} wins, {len(losses)} losses)")
print(f"Net Profit : ${tdf.sum():,.2f}")
print(f"PF         : {pf:.2f}")
print(f"Max DD     : ${dd:,.2f} ({dd/10000*100:.2f}%)")
print(f"Avg Win    : ${wins.mean():.2f}")
print(f"Avg Loss   : ${losses.mean():.2f}")
