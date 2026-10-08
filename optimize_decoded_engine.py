import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 init failed")
    exit()

rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 50000)
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
df['minute'] = df.index.minute

# Let's run a full simulation across 2026 (same period user is testing: Jan 1 2026 to Oct 2026)
sub = df.loc['2026-01-01':].copy()

def simulate_system(min_profit_usd=2.0, exit_session_hour=16, rsi_buy_thresh=52, rsi_sell_thresh=48, max_pos=3):
    opens = sub['open'].values
    highs = sub['high'].values
    lows = sub['low'].values
    closes = sub['close'].values
    ema20s = sub['ema20'].values
    ema50s = sub['ema50'].values
    rsi14s = sub['rsi14'].values
    hours = sub['hour'].values
    minutes = sub['minute'].values
    swing_highs = sub['swing_high'].values
    swing_lows = sub['swing_low'].values
    n = len(sub)
    
    positions = [] # list of active positions: dict(type, ep, sl, bar_idx)
    trades = []
    last_entry_bar = -99
    
    for i in range(1, n):
        # 1. Manage Active Positions
        active_pos = []
        basket_closed = False
        basket_pnl = 0.0
        
        # Check SL on all positions first
        for p in positions:
            sl_hit = False
            if p['type'] == 'BUY' and lows[i] <= p['sl']:
                sl_hit = True
                pnl = (p['sl'] - p['ep']) * 0.01 * contract
                trades.append(pnl)
            elif p['type'] == 'SELL' and highs[i] >= p['sl']:
                sl_hit = True
                pnl = (p['ep'] - p['sl']) * 0.01 * contract
                trades.append(pnl)
                
            if not sl_hit:
                active_pos.append(p)
                
        positions = active_pos
        
        # Check dynamic basket exit if we have open positions
        if len(positions) > 0:
            first_p = positions[0]
            cur_p = closes[i]
            
            # Check total basket profit
            total_profit_pts = 0.0
            for p in positions:
                diff = (cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p)
                total_profit_pts += diff
            avg_profit_usd = (total_profit_pts / len(positions))
            
            # Dynamic Exit Conditions:
            # 1) Price crosses back over EMA20 with profit
            # 2) Session closing (hour >= exit_session_hour and profit >= 0.5)
            # 3) RSI exhaustion (RSI < 45 for BUY, RSI > 55 for SELL with profit)
            close_basket = False
            if first_p['type'] == 'BUY':
                if (cur_p < ema20s[i] and avg_profit_usd >= min_profit_usd):
                    close_basket = True
                elif (hours[i] >= exit_session_hour and avg_profit_usd >= 0.5):
                    close_basket = True
                elif (rsi14s[i] <= 45 and avg_profit_usd >= min_profit_usd):
                    close_basket = True
            else: # SELL
                if (cur_p > ema20s[i] and avg_profit_usd >= min_profit_usd):
                    close_basket = True
                elif (hours[i] >= exit_session_hour and avg_profit_usd >= 0.5):
                    close_basket = True
                elif (rsi14s[i] >= 55 and avg_profit_usd >= min_profit_usd):
                    close_basket = True
                    
            if close_basket:
                for p in positions:
                    pnl = ((cur_p - p['ep']) if p['type'] == 'BUY' else (p['ep'] - cur_p)) * 0.01 * contract
                    trades.append(pnl)
                positions = []
                
        # 2. Check for New Entries
        # Allow entries during: Asian (1 to 4) and Day (9 to 15)
        h = hours[i]
        valid_time = ((h >= 1 and h <= 4) or (h >= 9 and h <= 15))
        
        if valid_time and len(positions) < max_pos and (i - last_entry_bar) >= 3:
            prev_c = closes[i-1]
            prev_o = opens[i-1]
            prev_ema20 = ema20s[i-1]
            prev_ema50 = ema50s[i-1]
            prev_rsi = rsi14s[i-1]
            
            buy_cond = (prev_c > prev_ema20) and (prev_ema20 > prev_ema50) and (prev_rsi >= rsi_buy_thresh) and (prev_c > prev_o)
            sell_cond = (prev_c < prev_ema20) and (prev_ema20 < prev_ema50) and (prev_rsi <= rsi_sell_thresh) and (prev_c < prev_o)
            
            if buy_cond:
                ep = opens[i] + spread
                sl_p = swing_lows[i-1] - 1.5
                if (ep - sl_p) < 15.0: sl_p = ep - 15.0
                if (ep - sl_p) > 60.0: sl_p = ep - 60.0
                positions.append({'type': 'BUY', 'ep': ep, 'sl': sl_p, 'bar_idx': i})
                last_entry_bar = i
            elif sell_cond:
                ep = opens[i]
                sl_p = swing_highs[i-1] + 1.5 + spread
                if (sl_p - ep) < 15.0: sl_p = ep + 15.0 + spread
                if (sl_p - ep) > 60.0: sl_p = ep + 60.0 + spread
                positions.append({'type': 'SELL', 'ep': ep, 'sl': sl_p, 'bar_idx': i})
                last_entry_bar = i
                
    tdf = pd.Series(trades)
    if len(tdf) == 0: return None
    wins = tdf[tdf > 0]
    losses = tdf[tdf < 0]
    wr = len(wins) / len(tdf) * 100
    pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 and losses.sum() != 0 else 999.0
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

print("\n--- OPTIMIZING PARAMETERS FOR HIGH WIN RATE & PROFIT ---")
for min_p in [1.5, 2.0, 3.0]:
    for exit_h in [15, 16, 17]:
        for rsi_thresh in [50, 52, 55]:
            res = simulate_system(min_profit_usd=min_p, exit_session_hour=exit_h, rsi_buy_thresh=rsi_thresh, rsi_sell_thresh=100-rsi_thresh)
            if res and res['wr'] >= 70.0 and res['pf'] >= 1.5:
                print(f"MinProfit:${min_p} | ExitHour:{exit_h} | RSI:{rsi_thresh} | Trades:{res['trades']:3d} | WR:{res['wr']:5.1f}% | Net:${res['profit']:+7.2f} | PF:{res['pf']:4.2f} | MaxDD:${res['max_dd']:5.1f}")
