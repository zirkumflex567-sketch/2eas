import MetaTrader5 as mt5
import pandas as pd
import numpy as np

# Load the roundtrip trades
trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

if not mt5.initialize():
    print("MT5 failed")
    exit()

# Fetch M15 bars covering the full period: 2023 to 2026
rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 95000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

df = pd.DataFrame(rates)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)

print(f"Total M15 bars: {len(df)} from {df.index[0]} to {df.index[-1]}")
print(f"Total original trades: {len(trades)} from {trades['entry_time'].min()} to {trades['entry_time'].max()}")

# Calculate candidate indicators on M15
# 1. EMAs
df['ema8'] = df['close'].ewm(span=8, adjust=False).mean()
df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
df['ema100'] = df['close'].ewm(span=100, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

# 2. Bollinger Bands 20, 2.0
sma20 = df['close'].rolling(20).mean()
std20 = df['close'].rolling(20).std()
df['bb_mid'] = sma20
df['bb_up'] = sma20 + 2.0 * std20
df['bb_dn'] = sma20 - 2.0 * std20
df['bb_pct'] = (df['close'] - df['bb_dn']) / (df['bb_up'] - df['bb_dn'] + 1e-9)

# 3. RSIs
for p in [7, 14, 21]:
    diff = df['close'].diff()
    g = diff.clip(lower=0).rolling(p).mean()
    l = (-diff.clip(upper=0)).rolling(p).mean()
    df[f'rsi{p}'] = 100 - (100 / (1 + g / (l + 1e-9)))

# 4. ATR
tr = np.maximum(df['high'] - df['low'], 
                np.maximum(abs(df['high'] - df['close'].shift(1)), 
                           abs(df['low'] - df['close'].shift(1))))
df['atr14'] = tr.rolling(14).mean()

# 5. Stochastic (14, 3)
low14 = df['low'].rolling(14).min()
high14 = df['high'].rolling(14).max()
df['stoch_k'] = 100 * ((df['close'] - low14) / (high14 - low14 + 1e-9))
df['stoch_d'] = df['stoch_k'].rolling(3).mean()

# 6. CCI 20
tp_price = (df['high'] + df['low'] + df['close']) / 3
sma_tp = tp_price.rolling(20).mean()
mad = (tp_price - sma_tp).abs().rolling(20).mean()
df['cci20'] = (tp_price - sma_tp) / (0.015 * mad + 1e-9)

# 7. MACD (12, 26, 9)
ema12 = df['close'].ewm(span=12, adjust=False).mean()
ema26 = df['close'].ewm(span=26, adjust=False).mean()
df['macd'] = ema12 - ema26
df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()

# Match each trade entry to the preceding M15 closed bar
matched = []
for idx, tr in trades.iterrows():
    entry_t = tr['entry_time']
    # Find exact or previous bar
    prev_bars = df[df.index <= entry_t]
    if len(prev_bars) > 0:
        bar = prev_bars.iloc[-1]
        matched.append({
            'trade_idx': tr['trade_idx'],
            'type': tr['type'],
            'entry_time': entry_t,
            'bar_time': bar.name,
            'profit': tr['profit'],
            'duration_hours': tr['duration_hours'],
            'rsi7': bar['rsi7'],
            'rsi14': bar['rsi14'],
            'rsi21': bar['rsi21'],
            'stoch_k': bar['stoch_k'],
            'stoch_d': bar['stoch_d'],
            'cci20': bar['cci20'],
            'bb_pct': bar['bb_pct'],
            'close_vs_ema20': (bar['close'] - bar['bb_mid']) / bar['atr14'],
            'close_vs_ema50': (bar['close'] - bar['ema50']) / bar['atr14'],
            'close_vs_ema200': (bar['close'] - bar['ema200']) / bar['atr14'],
            'hour': entry_t.hour,
            'is_sl': tr['is_sl_hit']
        })

mdf = pd.DataFrame(matched)
print(f"Successfully matched {len(mdf)} trade entries to M15 technical state!")

# Analyze BUY entries
buys = mdf[mdf['type'] == 'BUY']
sells = mdf[mdf['type'] == 'SELL']

print("\n=== BUY ENTRIES TECHNICAL STATE (Average, Min, Max, Quantiles) ===")
print("RSI 14       :", f"Mean={buys['rsi14'].mean():.1f}, Median={buys['rsi14'].median():.1f}, 25%={buys['rsi14'].quantile(0.25):.1f}, 75%={buys['rsi14'].quantile(0.75):.1f}")
print("RSI 7        :", f"Mean={buys['rsi7'].mean():.1f}, Median={buys['rsi7'].median():.1f}")
print("Stoch K      :", f"Mean={buys['stoch_k'].mean():.1f}, Median={buys['stoch_k'].median():.1f}")
print("BB % (0=Dn,1=Up):", f"Mean={buys['bb_pct'].mean():.2f}, Median={buys['bb_pct'].median():.2f}")
print("CCI 20       :", f"Mean={buys['cci20'].mean():.1f}, Median={buys['cci20'].median():.1f}")
print("Close vs EMA50 (ATR units):", f"Mean={buys['close_vs_ema50'].mean():.2f}, Median={buys['close_vs_ema50'].median():.2f}")
print("Close vs EMA200 (ATR units):", f"Mean={buys['close_vs_ema200'].mean():.2f}, Median={buys['close_vs_ema200'].median():.2f}")

print("\n=== SELL ENTRIES TECHNICAL STATE ===")
print("RSI 14       :", f"Mean={sells['rsi14'].mean():.1f}, Median={sells['rsi14'].median():.1f}, 25%={sells['rsi14'].quantile(0.25):.1f}, 75%={sells['rsi14'].quantile(0.75):.1f}")
print("RSI 7        :", f"Mean={sells['rsi7'].mean():.1f}, Median={sells['rsi7'].median():.1f}")
print("Stoch K      :", f"Mean={sells['stoch_k'].mean():.1f}, Median={sells['stoch_k'].median():.1f}")
print("BB % (0=Dn,1=Up):", f"Mean={sells['bb_pct'].mean():.2f}, Median={sells['bb_pct'].median():.2f}")
print("CCI 20       :", f"Mean={sells['cci20'].mean():.1f}, Median={sells['cci20'].median():.1f}")
print("Close vs EMA50 (ATR units):", f"Mean={sells['close_vs_ema50'].mean():.2f}, Median={sells['close_vs_ema50'].median():.2f}")
print("Close vs EMA200 (ATR units):", f"Mean={sells['close_vs_ema200'].mean():.2f}, Median={sells['close_vs_ema200'].median():.2f}")
