import pandas as pd
import numpy as np

excel_path = 'ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

trades_header_row = 2593
headers = [str(x).strip() for x in df.iloc[trades_header_row].values]
deals_raw = df.iloc[trades_header_row + 1:].copy()
deals_raw.columns = headers

print("Deals columns:", headers)
print("Deals count:", len(deals_raw))

# Filter valid deal rows
deals_raw = deals_raw.dropna(subset=['Zeit', 'Preis', 'Typ'])
deals_raw['Zeit'] = pd.to_datetime(deals_raw['Zeit'])
deals_raw['Preis'] = pd.to_numeric(deals_raw['Preis'], errors='coerce')
deals_raw['Gewinn'] = pd.to_numeric(deals_raw['Gewinn'], errors='coerce').fillna(0.0)
deals_raw['Kontostand'] = pd.to_numeric(deals_raw['Kontostand'], errors='coerce')
deals_raw['Volumen'] = pd.to_numeric(deals_raw['Volumen'], errors='coerce')

print("\n--- SAMPLE DEALS ---")
print(deals_raw[['Zeit', 'Symbol', 'Typ', 'Richtung', 'Volumen', 'Preis', 'Gewinn', 'Kontostand', 'Kommentar']].head(20))

# Group entry (in) and exit (out) deals by position/order or sequential matching
in_deals = deals_raw[deals_raw['Richtung'] == 'in'].copy()
out_deals = deals_raw[deals_raw['Richtung'] == 'out'].copy()

print(f"\nTotal 'in' deals: {len(in_deals)}")
print(f"Total 'out' deals: {len(out_deals)}")

# Also extract Orders table (rows 59 to 2590) to get the initial Stop Loss and Take Profit!
orders_raw = df.iloc[60:2590].copy()
orders_raw.columns = [str(x).strip() for x in df.iloc[59].values]
orders_raw = orders_raw.dropna(subset=['Erffnungszeit', 'Auftrag'])
orders_raw.to_csv('extracted_orders.csv', index=False)
deals_raw.to_csv('extracted_deals.csv', index=False)

print("\nOrders and Deals extracted successfully to CSV!")
