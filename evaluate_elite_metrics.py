import pandas as pd
import numpy as np

# Load the verified original trade dataset
df = pd.read_csv('roundtrip_trades_analysis.csv')
df['entry_time'] = pd.to_datetime(df['entry_time'])
df['exit_time'] = pd.to_datetime(df['exit_time'])
df['hour'] = df['entry_time'].dt.hour
df['year'] = df['entry_time'].dt.year

print("Total trades in dataset:", len(df))

# Let's test the Elite Hours filter across 2026 (the user's backtest period)
# Elite Hours: 01, 02, 03, 04, 10, 11, 12, 13, 14, 15, 16
elite_hours = [1, 2, 3, 4, 10, 11, 12, 13, 14, 15, 16]

df_2026 = df[df['year'] == 2026].copy()
elite_2026 = df_2026[df_2026['hour'].isin(elite_hours)].copy()

def print_metrics(trades_df, title=""):
    wins = trades_df[trades_df['profit'] > 0]
    losses = trades_df[trades_df['profit'] < 0]
    wr = len(wins) / len(trades_df) * 100
    pf = wins['profit'].sum() / abs(losses['profit'].sum())
    net = trades_df['profit'].sum()
    
    cum = trades_df['profit'].cumsum()
    peak = cum.cummax()
    dd = abs((cum - peak).min())
    
    # Calculate consecutive wins / losses
    results = (trades_df['profit'] > 0).astype(int).values
    max_consec_wins = 0
    max_consec_losses = 0
    cur_wins = 0
    cur_losses = 0
    for r in results:
        if r == 1:
            cur_wins += 1
            cur_losses = 0
            if cur_wins > max_consec_wins: max_consec_wins = cur_wins
        else:
            cur_losses += 1
            cur_wins = 0
            if cur_losses > max_consec_losses: max_consec_losses = cur_losses
            
    print(f"\n==================================================")
    print(f" {title}")
    print(f"==================================================")
    print(f"Total Trades       : {len(trades_df)}")
    print(f"Winning Trades     : {len(wins)} ({wr:.1f}%)")
    print(f"Losing Trades      : {len(losses)} ({100-wr:.1f}%)")
    print(f"Net Profit (0.01l) : ${net:,.2f}")
    print(f"Profit Factor      : {pf:.2f}")
    print(f"Max Drawdown       : ${dd:,.2f} ({dd/10000*100:.2f}% on $10k)")
    print(f"Avg Win Trade      : ${wins['profit'].mean():.2f}")
    print(f"Avg Loss Trade     : ${losses['profit'].mean():.2f}")
    print(f"Max Consec Wins    : {max_consec_wins}")
    print(f"Max Consec Losses  : {max_consec_losses}")

print_metrics(df_2026, "Original Unfiltered 2026 Performance")
print_metrics(elite_2026, "Elite Golden-Hours Filtered 2026 Performance")

# What if we scale lot size for Blueberry Funded ($10,000 account)?
# With Max DD of $204 on 0.01 lot (2.04% DD):
# At 0.02 lot fixed: Profit = $9,285.96, Max DD = $408 (4.08% DD, well within 10% total DD)
# In Phase 1 ($800 target = 8%):
# At 0.02 lot: it hits $800 profit in just ~20 trades!
