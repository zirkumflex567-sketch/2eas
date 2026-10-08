import pandas as pd
import numpy as np

excel_path = r'C:\Users\zirku\AppData\Roaming\MetaQuotes\Terminal\E62C655ED163FFC555DD40DBEA67E6BB\MQL5\Profiles\Tester\ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

print("--- HEADER ROWS (SETTINGS & INPUTS) ---")
for i in range(min(45, len(df))):
    row_vals = [str(x) for x in df.iloc[i].values if pd.notna(x)]
    if row_vals:
        print(f"Row {i:2d}: {' | '.join(row_vals)}")

# Find where deals/orders start
deals_start_idx = None
for i in range(len(df)):
    row_str = " ".join([str(x) for x in df.iloc[i].values if pd.notna(x)])
    if any(k in row_str.lower() for k in ['zeit', 'auftrag', 'deal', 'ticket', 'direction', 'preis', 'profit']):
        if 'zeit' in row_str.lower() and ('preis' in row_str.lower() or 'gewinn' in row_str.lower() or 'profit' in row_str.lower()):
            deals_start_idx = i
            print(f"\nFound trades header at Row {i}: {row_str}")
            break

if deals_start_idx is not None:
    # Print next 10 rows
    print("\n--- SAMPLE TRADE ROWS ---")
    for j in range(deals_start_idx, deals_start_idx + 15):
        row_vals = [str(x) for x in df.iloc[j].values if pd.notna(x)]
        print(f"Row {j:4d}: {' | '.join(row_vals)}")
