import pandas as pd
import numpy as np

trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

t2026 = trades[trades['entry_time'] >= '2026-01-01'].copy()
wins2026 = t2026[t2026['profit'] > 0]
loss2026 = t2026[t2026['profit'] < 0]

print("--- 2026 ORIGINAL TRADES METRICS ---")
print(f"Total trades: {len(t2026)}")
print(f"Wins: {len(wins2026)} ({len(wins2026)/len(t2026)*100:.1f}%)")
print(f"Losses: {len(loss2026)} ({len(loss2026)/len(t2026)*100:.1f}%)")
print(f"Gross profit: ${wins2026['profit'].sum():,.2f}")
print(f"Gross loss:   ${abs(loss2026['profit'].sum()):,.2f}")
print(f"Net profit:   ${t2026['profit'].sum():,.2f}")
print(f"Profit Factor: {wins2026['profit'].sum() / abs(loss2026['profit'].sum()):.2f}")

print("\n--- WIN PROFIT DISTRIBUTION (PIPS / USD ON 0.01 LOT) ---")
print(wins2026['pips'].describe())

print("\n--- LOSS DISTRIBUTION (PIPS / USD ON 0.01 LOT) ---")
print(loss2026['pips'].describe())

print("\n--- TOP EXIT REASONS ---")
print(t2026['comment'].value_counts())
