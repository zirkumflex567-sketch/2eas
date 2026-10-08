import pandas as pd
import numpy as np

tdf = pd.read_csv('trade_history_xauusd.csv')
tdf['pnl_r'] = np.where(tdf['profit'] > 0, 2.0, -1.0) # 2R win, -1R loss

# At 0.75% risk per trade:
# 1 win = +1.50%
# 1 loss = -0.75%
# Target Phase 1 = +8% (needs ~5.33 R net profit)
# Target Phase 2 = +5% (needs ~3.33 R net profit)

# Let's test sliding windows across all trades
phase1_target_r = 8.0 / 0.75 # 10.67 R
phase2_target_r = 5.0 / 0.75 # 6.67 R
max_dd_r = 10.0 / 0.75       # 13.33 R

print(f"Target Phase 1 (8%): needs {phase1_target_r:.1f} R")
print(f"Target Phase 2 (5%): needs {phase2_target_r:.1f} R")
print(f"Max DD Limit (10%):  {max_dd_r:.1f} R")

# Rolling windows
pass_counts_p1 = 0
fail_counts_p1 = 0
days_to_pass_p1 = []

for start_idx in range(len(tdf) - 60):
    cum_r = 0.0
    peak_r = 0.0
    passed = False
    failed = False
    
    for step in range(len(tdf) - start_idx):
        r = tdf['pnl_r'].iloc[start_idx + step]
        cum_r += r
        peak_r = max(peak_r, cum_r)
        dd_r = peak_r - cum_r
        
        if dd_r >= max_dd_r:
            failed = True
            break
            
        if cum_r >= phase1_target_r:
            passed = True
            days_to_pass_p1.append(step + 1)
            break
            
    if passed:
        pass_counts_p1 += 1
    elif failed:
        fail_counts_p1 += 1

print(f"\nPhase 1 Rolling Simulations: Passed={pass_counts_p1}, Failed={fail_counts_p1}")
if len(days_to_pass_p1) > 0:
    print(f"Average Trades to pass Phase 1: {np.mean(days_to_pass_p1):.1f} trades (~{np.mean(days_to_pass_p1):.1f} trading days)")
    print(f"Median Trades to pass Phase 1:  {np.median(days_to_pass_p1):.1f} trades")
