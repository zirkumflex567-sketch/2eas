import pandas as pd
import numpy as np
import MetaTrader5 as mt5

trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

print(f"Loaded {len(trades)} trades from user backtest report.")

# Let's inspect the wins and losses
wins = trades[trades['profit'] > 0]
losses = trades[trades['profit'] < 0]

print(f"Win count: {len(wins)} ({len(wins)/len(trades)*100:.1f}%), Loss count: {len(losses)}")
print(f"Total profit: ${trades['profit'].sum():,.2f}")
print(f"Avg win: ${wins['profit'].mean():.2f}, Avg loss: ${abs(losses['profit'].mean()):.2f}")

# Look at trade duration
print("\n--- DURATION DISTRIBUTION ---")
print(trades['duration_hours'].describe())

# Look at distribution of BUY vs SELL
print("\n--- DIRECTION ---")
print(trades['type'].value_counts())

# Connect to MT5 to inspect the market state during consecutive winning clusters
if mt5.initialize():
    # Let's pull 10 winning trades and 5 losing trades and inspect the chart
    sample_wins = wins.iloc[10:20]
    for idx, w in sample_wins.iterrows():
        t = w['entry_time']
        rates = mt5.copy_rates_from_pos('XAUUSD', mt5.TIMEFRAME_M15, 0, 100) # test
        # Let's get rates around entry time
        rates_around = mt5.copy_rates_range('XAUUSD', mt5.TIMEFRAME_M15, t - pd.Timedelta(hours=24), t + pd.Timedelta(hours=24))
        if rates_around is not None and len(rates_around) > 0:
            bdf = pd.DataFrame(rates_around)
            bdf['time'] = pd.to_datetime(bdf['time'], unit='s')
            bdf.set_index('time', inplace=True)
            
            # Check price relative to 24h High/Low and EMA
            ema50 = bdf['close'].ewm(span=50).mean()
            entry_close = bdf.loc[t]['close'] if t in bdf.index else 0
            ema_val = ema50.loc[t] if t in ema50.index else 0
            rel_ema = "Above EMA50" if entry_close > ema_val else "Below EMA50"
            print(f"WIN #{w['trade_idx']} {w['type']} at {t} | Price={w['entry_price']} | Profit=${w['profit']} | {rel_ema} | Duration={w['duration_hours']}h")
    mt5.shutdown()
