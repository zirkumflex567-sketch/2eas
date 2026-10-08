import pandas as pd
import numpy as np

excel_path = 'ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

# Extract orders rows 60 to 2590
orders = df.iloc[60:2590].copy()
orders.columns = [str(x).strip() for x in df.iloc[59].values]
print("Orders columns:", orders.columns.tolist())

# Inspect sample orders with SL and TP
orders_clean = orders[['Erffnungszeit', 'Auftrag', 'Symbol', 'Typ', 'Volumen', 'Preis', 'S / L', 'T / P', 'Kommentar']].dropna(subset=['Erffnungszeit', 'Auftrag']).copy()
orders_clean['Erffnungszeit'] = pd.to_datetime(orders_clean['Erffnungszeit'])
orders_clean['Preis'] = pd.to_numeric(orders_clean['Preis'], errors='coerce')
orders_clean['S / L'] = pd.to_numeric(orders_clean['S / L'], errors='coerce')
orders_clean['T / P'] = pd.to_numeric(orders_clean['T / P'], errors='coerce')

print("\n--- SAMPLE OPENING ORDERS ---")
print(orders_clean.head(25))

# Calculate SL distance in dollars/points
orders_clean['sl_dist'] = abs(orders_clean['Preis'] - orders_clean['S / L'])
print("\n--- STOP LOSS DISTANCE SUMMARY ---")
print(orders_clean['sl_dist'].describe())
