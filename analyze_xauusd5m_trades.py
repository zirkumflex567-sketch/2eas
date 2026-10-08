import pandas as pd
import numpy as np

excel_path = 'ReportTester-53087839.xlsx'
df = pd.read_excel(excel_path)

trades_header_row = 2593
headers = [str(x).strip() for x in df.iloc[trades_header_row].values]
deals = df.iloc[trades_header_row + 1:].copy()
deals.columns = headers
deals = deals.dropna(subset=['Zeit', 'Preis', 'Typ'])

deals['Zeit'] = pd.to_datetime(deals['Zeit'])
deals['Preis'] = pd.to_numeric(deals['Preis'], errors='coerce')
deals['Gewinn'] = pd.to_numeric(deals['Gewinn'], errors='coerce').fillna(0.0)
deals['Kontostand'] = pd.to_numeric(deals['Kontostand'], errors='coerce')
deals['Volumen'] = pd.to_numeric(deals['Volumen'], errors='coerce')

# In MT5 Deals table: 'Auftrag' is the Order ticket, 'Trade' is the Position ID/Ticket
# Let's inspect column names
print("Columns in deals:", deals.columns.tolist())

# Pair deals by 'Auftrag' or 'Trade' or index
in_deals = deals[deals['Richtung'] == 'in'].reset_index(drop=True)
out_deals = deals[deals['Richtung'] == 'out'].reset_index(drop=True)

# Combine into round-trip trades
trades = []
for i in range(min(len(in_deals), len(out_deals))):
    din = in_deals.iloc[i]
    dout = out_deals.iloc[i]
    
    pos_type = din['Typ'].upper() # BUY or SELL
    entry_time = din['Zeit']
    exit_time = dout['Zeit']
    duration_min = (exit_time - entry_time).total_seconds() / 60.0
    duration_hours = duration_min / 60.0
    
    entry_p = din['Preis']
    exit_p = dout['Preis']
    profit = dout['Gewinn']
    pips = (exit_p - entry_p) if pos_type == 'BUY' else (entry_p - exit_p)
    
    trades.append({
        'trade_idx': i + 1,
        'type': pos_type,
        'entry_time': entry_time,
        'exit_time': exit_time,
        'duration_hours': round(duration_hours, 2),
        'entry_price': entry_p,
        'exit_price': exit_p,
        'pips': round(pips, 2),
        'profit': round(profit, 2),
        'comment': str(dout['Kommentar']),
        'is_sl_hit': 'sl' in str(dout['Kommentar']).lower(),
        'entry_hour': entry_time.hour,
        'entry_minute': entry_time.minute,
        'entry_weekday': entry_time.day_name()
    })

trades_df = pd.DataFrame(trades)
trades_df.to_csv('roundtrip_trades_analysis.csv', index=False)
print(f"Successfully processed {len(trades_df)} round-trip trades!")

print("\n--- KEY STRATEGY STATISTICS FROM REAL TRADES ---")
print(f"Total Net Profit:     ${trades_df['profit'].sum():,.2f}")
print(f"Win Rate:             {(trades_df['profit'] > 0).mean()*100:.2f}%")
print(f"Average Duration:     {trades_df['duration_hours'].mean():.2f} hours (Median: {trades_df['duration_hours'].median():.2f} hours)")
print(f"SL Hit Frequency:     {trades_df['is_sl_hit'].mean()*100:.2f}%")
print(f"Dynamic Closes:       {(~trades_df['is_sl_hit']).mean()*100:.2f}%")

print("\n--- ENTRY TIME DISTRIBUTION (HOURS) ---")
print(trades_df['entry_hour'].value_counts().sort_index())

print("\n--- ENTRY TIME DISTRIBUTION (MINUTES) ---")
print(trades_df['entry_minute'].value_counts().sort_index())

print("\n--- WEEKDAY DISTRIBUTION ---")
print(trades_df['entry_weekday'].value_counts())
