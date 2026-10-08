import pandas as pd
import numpy as np

excel_path = 'ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

orders = df.iloc[60:2590].copy()
orders.columns = ['open_time', 'ticket', 'symbol', 'type', 'volume', 'col5', 'price', 'sl', 'tp', 'close_time', 'col10', 'status', 'comment']
orders['open_time'] = pd.to_datetime(orders['open_time'])
orders['price'] = pd.to_numeric(orders['price'], errors='coerce')
orders['sl'] = pd.to_numeric(orders['sl'], errors='coerce')
orders['tp'] = pd.to_numeric(orders['tp'], errors='coerce')

# Filter entry orders (comment == 'XAUUSD 5 Minute')
entry_orders = orders[orders['comment'] == 'XAUUSD 5 Minute'].copy()
print(f"Total entry orders: {len(entry_orders)}")
print(entry_orders[['open_time', 'type', 'volume', 'price', 'sl', 'tp']].head(25))

# Calculate SL distance
entry_orders['sl_dist'] = abs(entry_orders['price'] - entry_orders['sl'])
print("\n--- STOP LOSS DISTANCE (USD on XAUUSD) ---")
print(entry_orders['sl_dist'].describe())
print(f"Orders with SL == 0: {(entry_orders['sl'] == 0).sum()} / {len(entry_orders)}")

# Check Take Profit
print(f"Orders with TP > 0: {(entry_orders['tp'] > 0).sum()} / {len(entry_orders)}")
