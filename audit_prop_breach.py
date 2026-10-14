import openpyxl
import pandas as pd
import numpy as np

file_path = r'C:\Users\zirku\Downloads\ReportTester-53087839.xlsx'
wb = openpyxl.load_workbook(file_path, data_only=True)
ws = wb['Sheet1']

deals = []
for r in range(6600, ws.max_row + 1):
    time_val = ws.cell(r, 1).value
    if not time_val:
        break
    deals.append({
        'time': str(time_val),
        'trade_id': ws.cell(r, 2).value,
        'symbol': ws.cell(r, 3).value,
        'type': str(ws.cell(r, 4).value).lower(),
        'direction': str(ws.cell(r, 5).value).lower(),
        'volume': float(ws.cell(r, 6).value or 0),
        'price': float(ws.cell(r, 7).value or 0),
        'order_id': ws.cell(r, 8).value,
        'commission': float(ws.cell(r, 9).value or 0),
        'swap': float(ws.cell(r, 10).value or 0),
        'profit': float(ws.cell(r, 11).value or 0),
        'balance': float(ws.cell(r, 12).value) if ws.cell(r, 12).value is not None else None,
        'comment': str(ws.cell(r, 13).value or '')
    })

df = pd.DataFrame(deals)
df['datetime'] = pd.to_datetime(df['time'], format='%Y.%m.%d %H:%M:%S', errors='coerce')
df['date'] = df['datetime'].dt.strftime('%Y-%m-%d')

# Track active positions over time
open_positions = 0
max_open_pos = 0
max_open_pos_time = None
open_volume = 0.0
max_open_volume = 0.0

timeline = []

for idx, row in df.iterrows():
    direction = row['direction']
    vol = row['volume']
    if direction == 'in':
        open_positions += 1
        open_volume += vol
    elif direction == 'out':
        open_positions -= 1
        open_volume = max(0.0, open_volume - vol)
        
    if open_positions > max_open_pos:
        max_open_pos = open_positions
        max_open_pos_time = row['time']
    if open_volume > max_open_volume:
        max_open_volume = open_volume

print(f"Max Concurrent Open Positions: {max_open_pos} (at {max_open_pos_time})")
print(f"Max Concurrent Open Lot Volume: {max_open_volume:.2f} Lots")

# Analyze Day 11 (2026-01-16) and first breach date
# Daily drawdown evaluation with exact prop firm rules:
# Rule 1: Blueberry Funded Daily Limit = 4.0% of day start balance (or initial balance depending on rule)
# In Blueberry: Daily loss limit is 4% of previous day's closing equity/balance (e.g. $400 on $10k).
# Let's find the FIRST day the account breaches:
initial_deposit = 10000.0
breaches_3_5 = []
breaches_4_0 = []

for date, day_deals in df.groupby('date'):
    day_outs = day_deals[day_deals['direction'] == 'out']
    if len(day_outs) == 0:
        continue
    # Balance at start of this day:
    first_deal_idx = day_deals.index[0]
    # find last balance before this day
    prev_deals = df.loc[:first_deal_idx-1]
    prev_balances = prev_deals['balance'].dropna()
    start_bal = prev_balances.iloc[-1] if len(prev_balances) > 0 else initial_deposit
    
    # Track lowest balance reached during the day
    day_balances = day_deals['balance'].dropna()
    min_bal = day_balances.min() if len(day_balances) > 0 else start_bal
    
    # Realized loss relative to start of day
    max_day_loss = start_bal - min_bal
    dd_pct_start = (max_day_loss / start_bal) * 100.0
    dd_pct_init = (max_day_loss / initial_deposit) * 100.0
    
    if dd_pct_start >= 3.5 or dd_pct_init >= 3.5:
        breaches_3_5.append((date, start_bal, min_bal, max_day_loss, dd_pct_start, dd_pct_init))
    if dd_pct_start >= 4.0 or dd_pct_init >= 4.0:
        breaches_4_0.append((date, start_bal, min_bal, max_day_loss, dd_pct_start, dd_pct_init))

print(f"\n--- PROP FIRM BREACH AUDIT ---")
print(f"First 5 breaches of 4.0% Daily DD Limit:")
for b in breaches_4_0[:5]:
    print(f"Date: {b[0]} | Start Bal: ${b[1]:.2f} | Low Bal: ${b[2]:.2f} | Loss: ${b[3]:.2f} | DD from Start: {b[4]:.2f}% | DD from Initial: {b[5]:.2f}%")

print(f"\nTotal Days breaching 4.0% Daily DD: {len(breaches_4_0)} days!")
print(f"Total Days breaching 3.5% Daily DD: {len(breaches_3_5)} days!")
