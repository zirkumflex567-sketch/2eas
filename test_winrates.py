import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 init failed")
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

print(f"Loaded {len(df)} M15 bars from {df.index[0]} to {df.index[-1]}")

# Technical Indicators
df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

# Bollinger Bands
sma20 = df['close'].rolling(20).mean()
std20 = df['close'].rolling(20).std()
df['bb_up_20'] = sma20 + 2.0 * std20
df['bb_dn_20'] = sma20 - 2.0 * std20
df['bb_up_25'] = sma20 + 2.5 * std20
df['bb_dn_25'] = sma20 - 2.5 * std20

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

# Check how many signals exist
b1 = (df['low'] <= df['bb_dn_25']) & (df['rsi'] < 30)
s1 = (df['high'] >= df['bb_up_25']) & (df['rsi'] > 70)
print(f"BB 2.5 + RSI: buy signals={b1.sum()}, sell signals={s1.sum()}")

b2 = (df['close'] > df['ema200']) & (df['rsi'] < 35)
s2 = (df['close'] < df['ema200']) & (df['rsi'] > 65)
print(f"Trend dip: buy signals={b2.sum()}, sell signals={s2.sum()}")

# What about the original Bridzik XAUUSD 5 minute EA?
# Let's inspect its win rate and properties!
import os
if os.path.exists('roundtrip_trades_analysis.csv'):
    orig_df = pd.read_csv('roundtrip_trades_analysis.csv')
    orig_wins = orig_df[orig_df['profit'] > 0]
    print(f"Original EA Total Trades: {len(orig_df)}, Wins: {len(orig_wins)}, WinRate: {len(orig_wins)/len(orig_df)*100:.1f}%, Profit: ${orig_df['profit'].sum():,.2f}")
