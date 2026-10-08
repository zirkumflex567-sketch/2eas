import MetaTrader5 as mt5
import pandas as pd
import numpy as np
from sklearn.tree import DecisionTreeClassifier, export_text

# 1. Fetch M15 bars
if not mt5.initialize():
    print("MT5 failed")
    exit()

rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
mt5.shutdown()

df = pd.DataFrame(rates)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)

# 2. Load original trades
trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades_2026 = trades[trades['entry_time'] >= '2026-01-01'].copy()

# Filter df for 2026
sub = df.loc['2026-01-01':].copy()

# Create target variable: 1 for BUY entry, 2 for SELL entry, 0 for None
sub['target'] = 0
for idx, r in trades_2026.iterrows():
    t = r['entry_time']
    # Round to nearest M15 bar
    t_round = t.floor('15min')
    if t_round in sub.index:
        sub.loc[t_round, 'target'] = 1 if r['type'] == 'BUY' else 2

print(f"Total bars in 2026: {len(sub)}")
print(f"Target distribution: {sub['target'].value_counts().to_dict()}")

# 3. Create rich technical features
# EMAs
sub['ema8'] = sub['close'].ewm(span=8, adjust=False).mean()
sub['ema20'] = sub['close'].ewm(span=20, adjust=False).mean()
sub['ema50'] = sub['close'].ewm(span=50, adjust=False).mean()
sub['ema200'] = sub['close'].ewm(span=200, adjust=False).mean()

# Distances
sub['dist_ema8'] = (sub['close'] - sub['ema8'])
sub['dist_ema20'] = (sub['close'] - sub['ema20'])
sub['dist_ema50'] = (sub['close'] - sub['ema50'])
sub['ema20_vs_50'] = (sub['ema20'] - sub['ema50'])

# RSI
diff = sub['close'].diff()
g = diff.clip(lower=0).rolling(14).mean()
l = (-diff.clip(upper=0)).rolling(14).mean()
sub['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))

# ATR
tr = np.maximum(sub['high'] - sub['low'], 
                np.maximum(abs(sub['high'] - sub['close'].shift(1)), 
                           abs(sub['low'] - sub['close'].shift(1))))
sub['atr14'] = tr.rolling(14).mean()

# Candle features
sub['body'] = sub['close'] - sub['open']
sub['candle_range'] = sub['high'] - sub['low']
sub['body_pct'] = (sub['body'].abs()) / (sub['candle_range'] + 1e-9)
sub['upper_wick'] = sub['high'] - np.maximum(sub['close'], sub['open'])
sub['lower_wick'] = np.minimum(sub['close'], sub['open']) - sub['low']

# Time features
sub['hour'] = sub.index.hour
sub['minute'] = sub.index.minute
sub['dayofweek'] = sub.index.dayofweek

# Lagged features (previous bar)
for col in ['dist_ema20', 'dist_ema50', 'rsi14', 'body', 'hour']:
    sub[f'{col}_prev'] = sub[col].shift(1)

sub.dropna(inplace=True)

feature_cols = [
    'dist_ema8', 'dist_ema20', 'dist_ema50', 'ema20_vs_50',
    'rsi14', 'atr14', 'body', 'candle_range', 'body_pct',
    'hour', 'minute', 'dayofweek',
    'dist_ema20_prev', 'dist_ema50_prev', 'rsi14_prev'
]

X = sub[feature_cols]
y = sub['target']

# Train interpretable decision tree for BUY (target == 1)
dt_buy = DecisionTreeClassifier(max_depth=4, class_weight='balanced', random_state=42)
dt_buy.fit(X, (y == 1).astype(int))

print("\n=== DECISION TREE RULES FOR BUY ENTRIES ===")
rules_buy = export_text(dt_buy, feature_names=feature_cols)
print(rules_buy)

# Train decision tree for SELL (target == 2)
dt_sell = DecisionTreeClassifier(max_depth=4, class_weight='balanced', random_state=42)
dt_sell.fit(X, (y == 2).astype(int))

print("\n=== DECISION TREE RULES FOR SELL ENTRIES ===")
rules_sell = export_text(dt_sell, feature_names=feature_cols)
print(rules_sell)
