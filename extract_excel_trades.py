import pandas as pd
import numpy as np

excel_path = r'C:\Users\zirku\AppData\Roaming\MetaQuotes\Terminal\E62C655ED163FFC555DD40DBEA67E6BB\MQL5\Profiles\Tester\ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

# Find header row
header_row_idx = None
for i in range(len(df)):
    row_vals = [str(x).strip().lower() for x in df.iloc[i].values if pd.notna(x)]
    if any('eröffnungszeit' in x or 'zeit' in x for x in row_vals) and any('typ' in x for x in row_vals) and any('volumen' in x for x in row_vals):
        header_row_idx = i
        break

print(f"Header row found at: {header_row_idx}")
raw_headers = [str(x).strip() for x in df.iloc[header_row_idx].values]
trades_df = df.iloc[header_row_idx + 1:].copy()
trades_df.columns = raw_headers

# Drop completely empty rows
trades_df = trades_df.dropna(how='all')
print("Columns:", trades_df.columns.tolist())
print(f"Total rows: {len(trades_df)}")
print(trades_df.head(15))

# Save cleaned CSV for fast analysis
trades_df.to_csv('xauusd_5m_raw_trades.csv', index=False)
