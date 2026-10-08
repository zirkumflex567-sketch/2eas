import MetaTrader5 as mt5
import pandas as pd
import numpy as np

if not mt5.initialize():
    print("MT5 init failed")
    exit()

# Fetch M5 and M15 bars
rates_m5 = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M5, 0, 75000)
rates_m15 = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 45000)
info = mt5.symbol_info('XAUUSD')
mt5.shutdown()

point = info.point
contract = info.trade_contract_size
spread = 30 * point # 30 points = $0.30 spread on Gold

def prepare_df(rates):
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    df['hour'] = df.index.hour
    df['minute'] = df.index.minute
    
    # EMAs
    df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # RSI
    diff = df['close'].diff()
    gain = diff.clip(lower=0).rolling(14).mean()
    loss = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
    
    # ATR
    tr = np.maximum(df['high'] - df['low'], 
                    np.maximum(abs(df['high'] - df['close'].shift(1)), 
                               abs(df['low'] - df['close'].shift(1))))
    df['atr14'] = tr.rolling(14).mean()
    
    # Bollinger Bands 20, 2.0 and 2.5
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_mid'] = sma20
    df['bb_up_20'] = sma20 + 2.0 * std20
    df['bb_dn_20'] = sma20 - 2.0 * std20
    df['bb_up_25'] = sma20 + 2.5 * std20
    df['bb_dn_25'] = sma20 - 2.5 * std20
    
    # Stochastic (14, 3, 3)
    low_min = df['low'].rolling(14).min()
    high_max = df['high'].rolling(14).max()
    df['stoch_k'] = 100 * ((df['close'] - low_min) / (high_max - low_min + 1e-9))
    df['stoch_d'] = df['stoch_k'].rolling(3).mean()
    
    return df

df_m5 = prepare_df(rates_m5)
df_m15 = prepare_df(rates_m15)

print(f"M5 bars: {len(df_m5)} from {df_m5.index[0]} to {df_m5.index[-1]}")
print(f"M15 bars: {len(df_m15)} from {df_m15.index[0]} to {df_m15.index[-1]}")

def backtest_engine(df, buy_signals, sell_signals, tp_pips=25, sl_pips=50, max_hold_bars=100, dynamic_exit=True):
    trades = []
    in_trade = False
    entry_price = 0
    trade_type = None
    entry_bar = 0
    sl_price = 0
    tp_price = 0
    
    tp_pts = tp_pips * 10 * point
    sl_pts = sl_pips * 10 * point
    
    # Filter 2026 only for direct comparison with user's test period (2026.01.01 - 2026.10.06)
    sub = df.loc['2026-01-01':]
    buy_sig = buy_signals.loc['2026-01-01':]
    sell_sig = sell_signals.loc['2026-01-01':]
    
    for i in range(1, len(sub)):
        bar = sub.iloc[i]
        prev_bar = sub.iloc[i-1]
        
        if in_trade:
            bars_held = i - entry_bar
            closed = False
            exit_p = 0
            
            if trade_type == 'BUY':
                if bar['low'] <= sl_price:
                    exit_p = sl_price
                    closed = True
                elif bar['high'] >= tp_price:
                    exit_p = tp_price
                    closed = True
                elif dynamic_exit and (bar['rsi'] > 75 or (bar['close'] < bar['ema21'] and bars_held > 10)):
                    exit_p = bar['close']
                    closed = True
                elif bars_held >= max_hold_bars:
                    exit_p = bar['close']
                    closed = True
                    
                if closed:
                    pnl = (exit_p - entry_price) * 0.01 * contract
                    trades.append({'pnl': pnl, 'type': 'BUY', 'bars': bars_held, 'win': pnl > 0})
                    in_trade = False
            else: # SELL
                if bar['high'] >= sl_price:
                    exit_p = sl_price
                    closed = True
                elif bar['low'] <= tp_price:
                    exit_p = tp_price
                    closed = True
                elif dynamic_exit and (bar['rsi'] < 25 or (bar['close'] > bar['ema21'] and bars_held > 10)):
                    exit_p = bar['close']
                    closed = True
                elif bars_held >= max_hold_bars:
                    exit_p = bar['close']
                    closed = True
                    
                if closed:
                    pnl = (entry_price - exit_p) * 0.01 * contract
                    trades.append({'pnl': pnl, 'type': 'SELL', 'bars': bars_held, 'win': pnl > 0})
                    in_trade = False
                    
        if not in_trade:
            # Check signals at previous bar close
            if buy_sig.iloc[i-1]:
                in_trade = True
                trade_type = 'BUY'
                entry_price = bar['open'] + spread
                sl_price = entry_price - sl_pts
                tp_price = entry_price + tp_pts
                entry_bar = i
            elif sell_sig.iloc[i-1]:
                in_trade = True
                trade_type = 'SELL'
                entry_price = bar['open']
                sl_price = entry_price + sl_pts + spread
                tp_price = entry_price - tp_pts
                entry_bar = i
                
    if len(trades) < 20:
        return None
    tdf = pd.DataFrame(trades)
    wr = tdf['win'].mean() * 100
    profit = tdf['pnl'].sum()
    wins = tdf[tdf['pnl'] > 0]['pnl']
    losses = tdf[tdf['pnl'] < 0]['pnl']
    pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 and losses.sum() != 0 else 999.0
    
    cum = tdf['pnl'].cumsum()
    peak = cum.cummax()
    dd = abs((cum - peak).min())
    
    return {
        'trades': len(tdf),
        'win_rate': wr,
        'pf': pf,
        'profit': profit,
        'max_dd': dd,
        'avg_win': wins.mean() if len(wins) > 0 else 0,
        'avg_loss': losses.mean() if len(losses) > 0 else 0
    }

print("\n--- SYSTEMATIC HIGH WIN-RATE SEARCH (2026 XAUUSD) ---")

# Let's test various high-probability setups:
# 1. Asian Session / London Open Range Mean Reversion
# 2. Bollinger Band Bounce with Trend Filter
# 3. Pullback to 50 EMA in Trend Direction
# 4. Multi-Timeframe Confluence Reversals

# Test 1: Trend-Aligned Deep Pullback (on M15)
# In uptrend (EMA50 > EMA200), price dips below EMA21 and RSI < 40 or Stoch < 20, then candle turns green
for tf_name, cur_df in [('M15', df_m15), ('M5', df_m5)]:
    uptrend = (cur_df['ema50'] > cur_df['ema200']) & (cur_df['close'] > cur_df['ema200'])
    downtrend = (cur_df['ema50'] < cur_df['ema200']) & (cur_df['close'] < cur_df['ema200'])
    
    # Entry signals
    buy_pb = uptrend & (cur_df['close'] < cur_df['ema21']) & (cur_df['stoch_k'] < 25) & (cur_df['close'] > cur_df['open'])
    sell_pb = downtrend & (cur_df['close'] > cur_df['ema21']) & (cur_df['stoch_k'] > 75) & (cur_df['close'] < cur_df['open'])
    
    # Only trade during London & NY (hours 8 to 21)
    session_filter = (cur_df['hour'] >= 8) & (cur_df['hour'] <= 20)
    buy_pb &= session_filter
    sell_pb &= session_filter
    
    for tp in [20, 30, 40, 50]:
        for sl in [40, 60, 80, 100]:
            res = backtest_engine(cur_df, buy_pb, sell_pb, tp_pips=tp, sl_pips=sl, dynamic_exit=False)
            if res and res['win_rate'] >= 72.0 and res['pf'] >= 1.5:
                print(f"[{tf_name} TrendPB] TP:{tp}p | SL:{sl}p | Trades:{res['trades']} | WR:{res['win_rate']:.1f}% | Net:${res['profit']:+,.2f} | PF:{res['pf']:.2f} | MaxDD:${res['max_dd']:.2f}")

# Test 2: Extreme Mean Reversion (Bollinger Band Overextension 2.0 / 2.5 std)
for tf_name, cur_df in [('M15', df_m15), ('M5', df_m5)]:
    session_filter = (cur_df['hour'] >= 1) & (cur_df['hour'] <= 22)
    buy_bb = (cur_df['low'] <= cur_df['bb_dn_20']) & (cur_df['rsi'] < 30) & (cur_df['close'] > cur_df['open']) & session_filter
    sell_bb = (cur_df['high'] >= cur_df['bb_up_20']) & (cur_df['rsi'] > 70) & (cur_df['close'] < cur_df['open']) & session_filter
    
    for tp in [15, 20, 25, 30]:
        for sl in [35, 50, 70, 90]:
            res = backtest_engine(cur_df, buy_bb, sell_bb, tp_pips=tp, sl_pips=sl, dynamic_exit=False)
            if res and res['win_rate'] >= 72.0 and res['pf'] >= 1.5:
                print(f"[{tf_name} BB-Reversal] TP:{tp}p | SL:{sl}p | Trades:{res['trades']} | WR:{res['win_rate']:.1f}% | Net:${res['profit']:+,.2f} | PF:{res['pf']:.2f} | MaxDD:${res['max_dd']:.2f}")
