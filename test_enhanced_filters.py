import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 failed")
    exit()

rates_m15 = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
rates_h1  = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_H1, 0, 15000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

point = info.point
contract = info.trade_contract_size
spread = 30 * point

# Prepare M15
df = pd.DataFrame(rates_m15)
df['time'] = pd.to_datetime(df['time'], unit='s')
df.set_index('time', inplace=True)

# EMAs on M15
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

# ADX (14)
# Plus/Minus DM
plus_dm = df['high'].diff()
minus_dm = -df['low'].diff()
plus_dm = np.where((plus_dm > minus_dm) & (plus_dm > 0), plus_dm, 0.0)
minus_dm = np.where((minus_dm > plus_dm) & (minus_dm > 0), minus_dm, 0.0)
plus_di = 100 * (pd.Series(plus_dm, index=df.index).rolling(14).mean() / df['atr14'])
minus_di = 100 * (pd.Series(minus_dm, index=df.index).rolling(14).mean() / df['atr14'])
dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di + 1e-9))
df['adx14'] = dx.rolling(14).mean()

# H1 Macro Trend (Resampled/Mapped)
df_h1 = pd.DataFrame(rates_h1)
df_h1['time'] = pd.to_datetime(df_h1['time'], unit='s')
df_h1.set_index('time', inplace=True)
df_h1['h1_ema50'] = df_h1['close'].ewm(span=50, adjust=False).mean()
df_h1['h1_ema200'] = df_h1['close'].ewm(span=200, adjust=False).mean()

# Join H1 trend onto M15
df = df.join(df_h1[['h1_ema50', 'h1_ema200']].shift(1)).ffill()

# 80-bar Swing High/Low (20 Hours)
df['swing_high'] = df['high'].shift(1).rolling(80).max()
df['swing_low'] = df['low'].shift(1).rolling(80).min()
df['hour'] = df.index.hour

# 2026 slice
sub = df.loc['2026-01-01':].copy()
print(f"Loaded {len(sub)} M15 bars for 2026")

opens = sub['open'].values
highs = sub['high'].values
lows = sub['low'].values
closes = sub['close'].values
ema20s = sub['ema20'].values
ema50s = sub['ema50'].values
ema200s = sub['ema200'].values
h1_ema50s = sub['h1_ema50'].values
h1_ema200s = sub['h1_ema200'].values
rsi14s = sub['rsi14'].values
adx14s = sub['adx14'].values
hours = sub['hour'].values
swing_highs = sub['swing_high'].values
swing_lows = sub['swing_low'].values
n = len(sub)

def test_enhanced_system(use_h1_filter=True, adx_min=20.0, use_profit_lock=True, min_profit=25.0):
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
                # Profit Lock: if trade reaches +$18 USD, move SL to entry + $3 USD
                elif use_profit_lock and highs[i] >= (p['ep'] + 18.0) and p['sl'] < (p['ep'] + 3.0):
                    p['sl'] = p['ep'] + 3.0
            elif p['type'] == 'SELL':
                if highs[i] >= p['sl']:
                    trades.append((p['ep'] - p['sl']) * 0.01 * contract)
                    hit_sl = True
                elif use_profit_lock and lows[i] <= (p['ep'] - 18.0) and p['sl'] > (p['ep'] - 3.0):
                    p['sl'] = p['ep'] - 3.0
                    
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
                # Exit when price crosses below EMA20 with profit OR session end >= 17:00 with profit
                if (cur_p < ema20s[i] and avg_p >= min_profit) or (hours[i] >= 17 and avg_p >= 5.0):
                    should_close = True
            else:
                if (cur_p > ema20s[i] and avg_p >= min_profit) or (hours[i] >= 17 and avg_p >= 5.0):
                    should_close = True
                    
            if should_close:
                for p in positions:
                    trades.append(((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p)) * 0.01 * contract)
                positions = []
                
        # 3. New Entry Check
        h = hours[i]
        elite_hour = (h >= 1 and h <= 4) or (h >= 10 and h <= 15)
        if elite_hour and len(positions) < 3 and (i - last_entry_bar) >= 5:
            prev_c = closes[i-1]
            prev_o = opens[i-1]
            prev_ema20 = ema20s[i-1]
            prev_ema50 = ema50s[i-1]
            prev_ema200 = ema200s[i-1]
            prev_rsi = rsi14s[i-1]
            prev_adx = adx14s[i-1]
            prev_h1_ema50 = h1_ema50s[i-1]
            
            # Trend conditions
            adx_ok = np.isnan(prev_adx) or (prev_adx >= adx_min)
            
            # Confluence BUY
            buy_sig = (prev_c > prev_ema20) and (prev_ema20 > prev_ema50) and (prev_c > prev_ema200) and (prev_rsi >= 50.0) and (prev_c > prev_o) and adx_ok
            if use_h1_filter:
                buy_sig = buy_sig and (prev_c > prev_h1_ema50)
                
            # Confluence SELL
            sell_sig = (prev_c < prev_ema20) and (prev_ema20 < prev_ema50) and (prev_c < prev_ema200) and (prev_rsi <= 50.0) and (prev_c < prev_o) and adx_ok
            if use_h1_filter:
                sell_sig = sell_sig and (prev_c < prev_h1_ema50)
                
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
    if len(tdf) == 0: return None
    wins = tdf[tdf > 0]
    losses = tdf[tdf < 0]
    wr = len(wins) / len(tdf) * 100
    pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 999.0
    cum = tdf.cumsum()
    peak = cum.cummax()
    dd = abs((cum - peak).min())
    
    return {
        'trades': len(tdf),
        'wr': wr,
        'pf': pf,
        'profit': tdf.sum(),
        'max_dd': dd,
        'avg_win': wins.mean() if len(wins) > 0 else 0,
        'avg_loss': losses.mean() if len(losses) > 0 else 0
    }

print("\n--- EXPERIMENTING WITH INSTITUTIONAL FILTERS ---")
for h1 in [True, False]:
    for adx in [0.0, 18.0, 22.0]:
        for plock in [True, False]:
            res = test_enhanced_system(use_h1_filter=h1, adx_min=adx, use_profit_lock=plock, min_profit=25.0)
            if res:
                print(f"H1:{str(h1):5s} | ADX:{adx:4.1f} | PLock:{str(plock):5s} | Trades:{res['trades']:3d} | WR:{res['wr']:5.1f}% | Net:${res['profit']:+7.2f} | PF:{res['pf']:4.2f} | MaxDD:${res['max_dd']:5.1f} | Win/Loss:{res['avg_win']:.1f}/{res['avg_loss']:.1f}")
