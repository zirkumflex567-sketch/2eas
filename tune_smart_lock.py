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

# Indicator calculations on M15
df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

# RSI 14
diff = df['close'].diff()
g = diff.clip(lower=0).rolling(14).mean()
l = (-diff.clip(upper=0)).rolling(14).mean()
df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))

# 80-bar Swing High/Low (20 Hours)
df['swing_high'] = df['high'].shift(1).rolling(80).max()
df['swing_low'] = df['low'].shift(1).rolling(80).min()

df['hour'] = df.index.hour
sub = df.loc['2026-01-01':].copy()

opens = sub['open'].values
highs = sub['high'].values
lows = sub['low'].values
closes = sub['close'].values
ema20s = sub['ema20'].values
ema50s = sub['ema50'].values
ema200s = sub['ema200'].values
rsi14s = sub['rsi14'].values
hours = sub['hour'].values
swing_highs = sub['swing_high'].values
swing_lows = sub['swing_low'].values
n = len(sub)

def test_smart_lock(lock_trigger=15.0, lock_amount=3.0, runner_target=30.0, spacing_bars=6):
    positions = []
    trades = []
    last_entry_bar = -99
    
    for i in range(1, n):
        # 1. Manage Active Positions
        active = []
        for p in positions:
            hit_sl = False
            if p['type'] == 'BUY':
                if lows[i] <= p['sl']:
                    trades.append((p['sl'] - p['ep']) * 0.01 * contract)
                    hit_sl = True
                elif highs[i] >= (p['ep'] + lock_trigger) and p['sl'] < (p['ep'] + lock_amount):
                    p['sl'] = p['ep'] + lock_amount
            elif p['type'] == 'SELL':
                if highs[i] >= p['sl']:
                    trades.append((p['ep'] - p['sl']) * 0.01 * contract)
                    hit_sl = True
                elif lows[i] <= (p['ep'] - lock_trigger) and p['sl'] > (p['ep'] - lock_amount):
                    p['sl'] = p['ep'] - lock_amount
                    
            if not hit_sl:
                active.append(p)
        positions = active
        
        # 2. Dynamic Basket Exits
        if len(positions) > 0:
            cur_p = closes[i]
            first_p = positions[0]
            total_p = sum((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p) for p in positions)
            avg_p = total_p / len(positions)
            
            should_close = False
            if first_p['type'] == 'BUY':
                if (cur_p < ema20s[i] and avg_p >= runner_target) or (hours[i] >= 17 and avg_p >= 5.0):
                    should_close = True
            else:
                if (cur_p > ema20s[i] and avg_p >= runner_target) or (hours[i] >= 17 and avg_p >= 5.0):
                    should_close = True
                    
            if should_close:
                for p in positions:
                    trades.append(((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p)) * 0.01 * contract)
                positions = []
                
        # 3. New Entry Check (Elite Hours)
        h = hours[i]
        elite_hour = (h >= 1 and h <= 4) or (h >= 10 and h <= 15)
        if elite_hour and len(positions) < 3 and (i - last_entry_bar) >= spacing_bars:
            prev_c = closes[i-1]
            prev_o = opens[i-1]
            prev_ema20 = ema20s[i-1]
            prev_ema50 = ema50s[i-1]
            prev_ema200 = ema200s[i-1]
            prev_rsi = rsi14s[i-1]
            
            buy_sig = (prev_c > prev_ema20) and (prev_ema20 > prev_ema50) and (prev_c > prev_ema200) and (prev_rsi >= 50.0) and (prev_c > prev_o)
            sell_sig = (prev_c < prev_ema20) and (prev_ema20 < prev_ema50) and (prev_c < prev_ema200) and (prev_rsi <= 50.0) and (prev_c < prev_o)
            
            if buy_sig:
                ep = opens[i] + spread
                sl_p = swing_lows[i-1] - 1.5
                if (ep - sl_p) < 15.0: sl_p = ep - 15.0
                if (ep - sl_p) > 50.0: sl_p = ep - 50.0
                positions.append({'type': 'BUY', 'ep': ep, 'sl': sl_p})
                last_entry_bar = i
            elif sell_sig:
                ep = opens[i]
                sl_p = swing_highs[i-1] + 1.5 + spread
                if (sl_p - ep) < 15.0: sl_p = ep + 15.0 + spread
                if (sl_p - ep) > 50.0: sl_p = ep + 50.0 + spread
                positions.append({'type': 'SELL', 'ep': ep, 'sl': sl_p})
                last_entry_bar = i
                
    tdf = pd.Series(trades)
    wins = tdf[tdf > 0]
    losses = tdf[tdf < 0]
    wr = len(wins) / len(tdf) * 100
    pf = wins.sum() / abs(losses.sum())
    cum = tdf.cumsum()
    peak = cum.cummax()
    dd = abs((cum - peak).min())
    return {
        'trades': len(tdf),
        'wr': wr,
        'pf': pf,
        'net': tdf.sum(),
        'dd': dd,
        'avg_win': wins.mean(),
        'avg_loss': losses.mean()
    }

print("\n--- TUNING SMART PROFIT LOCK & RUNNER TARGET ---")
for trig in [12.0, 15.0, 18.0]:
    for target in [20.0, 25.0, 30.0]:
        for space in [4, 6, 8]:
            res = test_smart_lock(lock_trigger=trig, lock_amount=2.5, runner_target=target, spacing_bars=space)
            if res and res['wr'] >= 68.0 and res['pf'] >= 1.2:
                print(f"Trig:${trig:4.1f} | Target:${target:4.1f} | Space:{space:2d} | Trades:{res['trades']:3d} | WR:{res['wr']:5.1f}% | Net:${res['net']:+7.2f} | PF:{res['pf']:4.2f} | MaxDD:${res['dd']:5.1f} | Win/Loss:{res['avg_win']:.1f}/{res['avg_loss']:.1f}")
