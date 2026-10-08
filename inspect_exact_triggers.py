import MetaTrader5 as mt5
import pandas as pd
import numpy as np

# Load trades
trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

if not mt5.initialize():
    print("MT5 failed")
    exit()

rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 95000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

df = pd.DataFrame(rates)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)

point = info.point
contract = info.trade_contract_size
spread = 30 * point

# Let's inspect the exact triggers:
# What makes a trade open at 07:15 or 12:30 or 14:30?
# Let's inspect 10 consecutive trades from 2026!
trades_2026 = trades[trades['entry_time'] >= '2026-01-01'].copy()
print(f"Total 2026 trades: {len(trades_2026)}")

# Calculate key indicators
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

# 20-bar Swing High / Low
df['swing_high'] = df['high'].shift(1).rolling(80).max()
df['swing_low'] = df['low'].shift(1).rolling(80).min()

# Let's print the first 15 trades of 2026 with their indicator values
print("\n--- FIRST 15 TRADES OF 2026 ---")
for i in range(15):
    tr_row = trades_2026.iloc[i]
    t = tr_row['entry_time']
    b = df.loc[t] if t in df.index else df[df.index <= t].iloc[-1]
    print(f"#{tr_row['trade_idx']} {tr_row['type']:4s} | {t} | P={tr_row['entry_price']} | RSI={b['rsi14']:.1f} | Close={b['close']} | EMA20={b['ema20']:.1f} | EMA50={b['ema50']:.1f} | Profit=${tr_row['profit']:+6.2f} | Comment: {tr_row['comment']}")
