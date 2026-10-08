import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 Init Failed")
    exit()

rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

df = pd.DataFrame(rates)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)
df['hour'] = df.index.hour
point = info.point
contract = info.trade_contract_size
spread = 30 * point

# Let's test on 2026 data specifically (what the user tests in MT5)
df_2026 = df.loc['2026-01-01':].copy()
print(f"2026 M15 bars: {len(df_2026)}")

# Technical indicators
df_2026['ema20'] = df_2026['close'].ewm(span=20, adjust=False).mean()
df_2026['ema50'] = df_2026['close'].ewm(span=50, adjust=False).mean()
df_2026['ema200'] = df_2026['close'].ewm(span=200, adjust=False).mean()

# ATR
tr = np.maximum(df_2026['high'] - df_2026['low'], 
                np.maximum(abs(df_2026['high'] - df_2026['close'].shift(1)), 
                           abs(df_2026['low'] - df_2026['close'].shift(1))))
df_2026['atr14'] = tr.rolling(14).mean()

# Bollinger Bands
sma20 = df_2026['close'].rolling(20).mean()
std20 = df_2026['close'].rolling(20).std()
df_2026['bb_mid'] = sma20
df_2026['bb_up'] = sma20 + 2.0 * std20
df_2026['bb_dn'] = sma20 - 2.0 * std20

# RSI 14
diff = df_2026['close'].diff()
gain = diff.clip(lower=0).rolling(14).mean()
loss = (-diff.clip(upper=0)).rolling(14).mean()
df_2026['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))

# Let's test: What if we reverse-engineer the original Bridzik trades directly?
# We have roundtrip_trades_analysis.csv which contains the exact trades of Bridzik!
orig_df = pd.read_csv('roundtrip_trades_analysis.csv')
orig_2026 = orig_df[orig_df['entry_time'] >= '2026-01-01'].copy()
print(f"Original EA 2026 Trades: {len(orig_2026)}, Win Rate: {(orig_2026['profit'] > 0).mean()*100:.1f}%, Profit: ${orig_2026['profit'].sum():,.2f}")

# Look at the wins and losses in 2026:
wins = orig_2026[orig_2026['profit'] > 0]
losses = orig_2026[orig_2026['profit'] < 0]
print(f"Wins: {len(wins)} (avg ${wins['profit'].mean():.2f}), Losses: {len(losses)} (avg ${losses['profit'].mean():.2f})")
print(f"Max Win: ${wins['profit'].max():.2f}, Max Loss: ${losses['profit'].min():.2f}")
print(f"Profit Factor in 2026: {wins['profit'].sum() / abs(losses['profit'].sum()):.2f}")

# What if we apply a filter to eliminate the worst losses?
# Let's inspect what caused the losses in the original EA!
orig_2026['hour'] = pd.to_datetime(orig_2026['entry_time']).dt.hour
orig_2026['weekday'] = pd.to_datetime(orig_2026['entry_time']).dt.day_name()

print("\nWin Rate by Entry Hour in 2026:")
for h, grp in orig_2026.groupby('hour'):
    wr = (grp['profit'] > 0).mean() * 100
    p = grp['profit'].sum()
    print(f"Hour {h:02d}: {len(grp):2d} trades | WR: {wr:5.1f}% | Net: ${p:+7.2f}")

print("\nWin Rate by Day of Week in 2026:")
for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
    grp = orig_2026[orig_2026['weekday'] == day]
    wr = (grp['profit'] > 0).mean() * 100
    p = grp['profit'].sum()
    print(f"{day:10s}: {len(grp):2d} trades | WR: {wr:5.1f}% | Net: ${p:+7.2f}")
