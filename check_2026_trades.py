import pandas as pd

trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

# Filter 2026
trades_2026 = trades[trades['entry_time'] >= '2026-01-01'].copy()
print(f"Original EA trades in 2026: {len(trades_2026)}")
print(f"Original Net Profit in 2026: ${trades_2026['profit'].sum():,.2f}")
print(f"Original Win Rate in 2026: {(trades_2026['profit'] > 0).mean()*100:.1f}%")

# Let's inspect the first 25 trades of 2026 in the original EA!
print("\n--- ORIGINAL EA TRADES IN EARLY 2026 ---")
print(trades_2026[['trade_idx', 'type', 'entry_time', 'exit_time', 'duration_hours', 'entry_price', 'exit_price', 'pips', 'profit', 'comment']].head(25))
