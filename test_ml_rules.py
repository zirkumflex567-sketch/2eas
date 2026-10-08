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

# Indicator calculations on M15
df['ema8'] = df['close'].ewm(span=8, adjust=False).mean()
df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

# RSI 14
diff = df['close'].diff()
g = diff.clip(lower=0).rolling(14).mean()
l = (-diff.clip(upper=0)).rolling(14).mean()
df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))

# 80-bar Swing High/Low (20 Hours)
df['swing_high'] = df['high'].shift(1).rolling(80).max()
df['swing_low'] = df['low'].shift(1).rolling(80).min()

df['hour'] = df.index.hour

# 2026 simulation
sub = df.loc['2026-01-01':].copy()

# Features
sub['ema_spread'] = sub['ema20'] - sub['ema50']
sub['dist_ema20'] = sub['close'] - sub['ema20']

# Signals:
# BUY: ema_spread > 5.0 and dist_ema20 > -3.0 and hour >= 1 and hour <= 16
# SELL: ema_spread < -5.0 and dist_ema20 < 3.0 and hour >= 1 and hour <= 16

opens = sub['open'].values
highs = sub['high'].values
lows = sub['low'].values
closes = sub['close'].values
ema20s = sub['ema20'].values
hours = sub['hour'].values
swing_highs = sub['swing_high'].values
swing_lows = sub['swing_low'].values
ema_spreads = sub['ema_spread'].values
dist_ema20s = sub['dist_ema20'].values

n = len(sub)

for min_profit in [1.5, 2.0, 2.5, 3.0]:
    for threshold in [4.0, 6.0, 8.0]:
        positions = []
        trades = []
        last_entry_bar = -99
        
        for i in range(1, n):
            # Manage SL
            active = []
            for p in positions:
                hit_sl = False
                if p['type'] == 'BUY' and lows[i] <= p['sl']:
                    trades.append((p['sl'] - p['ep']) * 0.01 * contract)
                    hit_sl = True
                elif p['type'] == 'SELL' and highs[i] >= p['sl']:
                    trades.append((p['ep'] - p['sl']) * 0.01 * contract)
                    hit_sl = True
                if not hit_sl:
                    active.append(p)
            positions = active
            
            # Manage Dynamic Exits
            if len(positions) > 0:
                cur_p = closes[i]
                first_p = positions[0]
                total_p = sum((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p) for p in positions)
                avg_p = total_p / len(positions)
                
                # Dynamic close
                should_close = False
                if first_p['type'] == 'BUY':
                    if (cur_p < ema20s[i] and avg_p >= min_profit) or (hours[i] >= 17 and avg_p >= 0.5):
                        should_close = True
                else:
                    if (cur_p > ema20s[i] and avg_p >= min_profit) or (hours[i] >= 17 and avg_p >= 0.5):
                        should_close = True
                        
                if should_close:
                    for p in positions:
                        trades.append(((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p)) * 0.01 * contract)
                    positions = []
                    
            # Check Entries
            h = hours[i]
            if (h >= 1 and h <= 16) and len(positions) < 3 and (i - last_entry_bar) >= 3:
                prev_spread = ema_spreads[i-1]
                prev_dist = dist_ema20s[i-1]
                
                if prev_spread > threshold and prev_dist > -3.0:
                    ep = opens[i] + spread
                    sl_p = swing_lows[i-1] - 1.5
                    if (ep - sl_p) < 15.0: sl_p = ep - 15.0
                    if (ep - sl_p) > 60.0: sl_p = ep - 60.0
                    positions.append({'type': 'BUY', 'ep': ep, 'sl': sl_p})
                    last_entry_bar = i
                elif prev_spread < -threshold and prev_dist < 3.0:
                    ep = opens[i]
                    sl_p = swing_highs[i-1] + 1.5 + spread
                    if (sl_p - ep) < 15.0: sl_p = ep + 15.0 + spread
                    if (sl_p - ep) > 60.0: sl_p = ep + 60.0 + spread
                    positions.append({'type': 'SELL', 'ep': ep, 'sl': sl_p})
                    last_entry_bar = i
                    
        tdf = pd.Series(trades)
        if len(tdf) > 50:
            wins = tdf[tdf > 0]
            losses = tdf[tdf < 0]
            wr = len(wins) / len(tdf) * 100
            pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 999.0
            cum = tdf.cumsum()
            peak = cum.cummax()
            dd = abs((cum - peak).min())
            print(f"SpreadThresh: {threshold:.1f} | MinProf: ${min_profit} | Trades: {len(tdf):3d} | WR: {wr:5.1f}% | Net: ${tdf.sum():+7.2f} | PF: {pf:4.2f} | DD: ${dd:5.1f}")
