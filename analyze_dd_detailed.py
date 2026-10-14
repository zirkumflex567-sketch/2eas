import re
from datetime import datetime
import pandas as pd

with open('current_report.csv', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Parse header info
print("=" * 70)
print("              STRATEGIETESTERBERICHT AUDIT")
print("=" * 70)

lines = text.splitlines()

header_info = {}
in_trades = False
trades_lines = []

for line in lines:
    if line.startswith('Trades,'):
        in_trades = True
        continue
    if in_trades:
        if line.strip():
            trades_lines.append(line)
    else:
        # Parse some key header fields
        if 'Ersteinlage:' in line:
            parts = [p for p in line.split(',') if p]
            header_info['Ersteinlage'] = parts
        elif 'Nettogewinn gesamt:' in line:
            parts = [p for p in line.split(',') if p]
            header_info['Gewinn_Rückgang'] = parts
        elif 'Bruttogewinn:' in line:
            parts = [p for p in line.split(',') if p]
            header_info['Max_DD'] = parts

print("Extracted Header Data:")
for k, v in header_info.items():
    print(f"  {k}: {v}")

# 2. Parse Trades
trades_data = []
header = [h.strip() for h in trades_lines[0].split(',')]
print(f"\nTrades Table Columns: {header}")

for line in trades_lines[1:]:
    parts = line.split(',')
    if len(parts) < 12:
        continue
    # Columns: Zeit,Trade,Symbol,Typ,Richtung,Volumen,Preis,Auftrag,Kommission,Swap,Gewinn,Kontostand,Kommentar
    time_str = parts[0].strip()
    trade_id = parts[1].strip()
    sym = parts[2].strip()
    order_type = parts[3].strip()
    direction = parts[4].strip()
    vol = parts[5].strip()
    price = parts[6].strip()
    order = parts[7].strip()
    comm = parts[8].strip()
    swap = parts[9].strip()
    profit = parts[10].strip()
    balance = parts[11].strip()
    comment = parts[12].strip() if len(parts) > 12 else ''

    try:
        trades_data.append({
            'time': time_str,
            'datetime': datetime.strptime(time_str, '%Y.%m.%d %H:%M:%S'),
            'trade_id': int(trade_id) if trade_id.isdigit() else 0,
            'symbol': sym,
            'type': order_type,
            'direction': direction,
            'volume': float(vol) if vol else 0.0,
            'price': float(price) if price else 0.0,
            'commission': float(comm) if comm else 0.0,
            'swap': float(swap) if swap else 0.0,
            'profit': float(profit) if profit else 0.0,
            'balance': float(balance) if balance else 0.0,
            'comment': comment
        })
    except Exception as e:
        # Summary row or unparsed
        pass

df = pd.DataFrame(trades_data)
print(f"Total deals/trades parsed: {len(df)}")

# Filter out initial deposit row
deposit_row = df[df['comment'].str.contains('balance', case=False) | (df['trade_id'] == 1)]
initial_balance = deposit_row['balance'].values[0] if len(deposit_row) > 0 else 10000.0
print(f"Initial Balance: ${initial_balance:,.2f}")

# Filter closed trades (direction == 'out')
df_out = df[df['direction'] == 'out'].copy()
df_out['net_pnl'] = df_out['profit'] + df_out['commission'] + df_out['swap']
df_out['date'] = df_out['datetime'].dt.date

print(f"Total closed trades (exits): {len(df_out)}")
print(f"Total Net PnL sum: ${df_out['net_pnl'].sum():,.2f}")
print(f"Final Balance: ${df_out['balance'].iloc[-1]:,.2f}")

# 3. Overall Max Drawdown & Lowest Balance Check
min_balance = df_out['balance'].min()
min_balance_row = df_out.loc[df_out['balance'].idxmin()]
max_balance = df_out['balance'].max()
max_balance_row = df_out.loc[df_out['balance'].idxmax()]

print("\n" + "=" * 70)
print("         KONTOSTAND & STATISCHER FLOOR (9.100 USD) PRÜFUNG")
print("=" * 70)
print(f"Niedrigster erreichter Kontostand (Closed Balance): ${min_balance:,.2f}")
print(f"  -> Aufgetreten am: {min_balance_row['time']} bei Trade #{min_balance_row['trade_id']}")
print(f"  -> Abstand zum 9.100 USD Floor: +${min_balance - 9100.0:,.2f} ÜBER DEM LIMIT")
print(f"Höchster erreichter Kontostand: ${max_balance:,.2f} am {max_balance_row['time']}")

# Check absolute drawdown from report
# In report: Rückgang Equity absolut: 342.76 => lowest intraday equity = 10000 - 342.76 = 9657.24 USD
lowest_equity_est = initial_balance - 342.76
print(f"Niedrigste jemals erreichte Floating Equity (aus Report): ${lowest_equity_est:,.2f}")
print(f"  -> Abstand zum 9.100 USD Floor: +${lowest_equity_est - 9100.0:,.2f} ÜBER DEM LIMIT")
floor_breached = min_balance < 9100.0 or lowest_equity_est < 9100.0
print(f"  -> FAZIT MAX DRAWDOWN (9.100 USD Floor): {'VERLETZT!' if floor_breached else 'ERFOLGREICH EINGEHALTEN! Kein einziger Breach.'}")

# 4. Daily Drawdown Analysis
print("\n" + "=" * 70)
print("             DAILY DRAWDOWN (4.0% LIMIT) PRÜFUNG")
print("=" * 70)

# We need to analyze day by day:
# For each day:
# Start of Day Balance (balance before any trades closed on this day)
# End of Day Balance
# Net Daily PnL
# Lowest balance reached during the day
# Max Daily Drawdown in USD and in % (both vs Start-of-Day Balance and vs $10,000 initial)

daily_records = []
all_dates = sorted(df_out['date'].unique())

running_bal = initial_balance

# Build full timeline of balance after each closed trade
for date, day_trades in df_out.groupby('date'):
    start_of_day_balance = running_bal
    day_net_pnl = day_trades['net_pnl'].sum()
    
    # Intraday balance trajectory
    balances_today = day_trades['balance'].tolist()
    min_bal_today = min(balances_today)
    
    # Daily closed drawdown
    # Drawdown from start of day:
    # If lowest balance today was below start of day balance:
    dd_usd = start_of_day_balance - min_bal_today
    dd_pct_start = (dd_usd / start_of_day_balance) * 100.0 if start_of_day_balance > 0 else 0.0
    dd_pct_initial = (dd_usd / initial_balance) * 100.0
    
    end_of_day_balance = day_trades['balance'].iloc[-1]
    running_bal = end_of_day_balance
    
    daily_records.append({
        'date': date,
        'start_balance': start_of_day_balance,
        'end_balance': end_of_day_balance,
        'net_pnl': day_net_pnl,
        'min_balance_today': min_bal_today,
        'max_daily_dd_usd': max(0.0, dd_usd),
        'max_daily_dd_pct_start': max(0.0, dd_pct_start),
        'max_daily_dd_pct_initial': max(0.0, dd_pct_initial),
        'trades_count': len(day_trades)
    })

df_daily = pd.DataFrame(daily_records)

# Sort by worst daily drawdown
worst_days_dd = df_daily.sort_values(by='max_daily_dd_usd', ascending=False)

print("Top 10 Tage mit dem höchsten Tages-Drawdown (Verlust vom Tagesanfang):")
print(f"{'Datum':<12} | {'Start Balance':<14} | {'Min Balance':<14} | {'Daily DD ($)':<14} | {'DD (% Start)':<12} | {'DD (% Init)':<12} | {'Net PnL':<10}")
print("-" * 88)

for _, r in worst_days_dd.head(10).iterrows():
    print(f"{str(r['date']):<12} | ${r['start_balance']:>12,.2f} | ${r['min_balance_today']:>12,.2f} | ${r['max_daily_dd_usd']:>12,.2f} | {r['max_daily_dd_pct_start']:>10.2f}% | {r['max_daily_dd_pct_initial']:>10.2f}% | ${r['net_pnl']:>8,.2f}")

# Check 4.0% breach
breach_start = df_daily[df_daily['max_daily_dd_pct_start'] >= 4.0]
breach_initial = df_daily[df_daily['max_daily_dd_pct_initial'] >= 4.0]
breach_usd_400 = df_daily[df_daily['max_daily_dd_usd'] >= 400.0]

print("\n" + "-" * 70)
print(f"Tage mit Tages-DD >= 4.0% (vom Tagesstart): {len(breach_start)}")
print(f"Tage mit Tages-DD >= 4.0% (vom 10k Initial): {len(breach_initial)}")
print(f"Tage mit absolutem Tagesverlust >= 400.00 USD: {len(breach_usd_400)}")

if len(breach_start) > 0:
    print("\nDETAILS DER VERLETZUNGEN (>= 4.0%):")
    for _, r in breach_start.iterrows():
        print(f"  -> {r['date']}: Start=${r['start_balance']:.2f}, Min=${r['min_balance_today']:.2f}, DD=${r['max_daily_dd_usd']:.2f} ({r['max_daily_dd_pct_start']:.2f}%)")
else:
    max_observed_dd = df_daily['max_daily_dd_pct_start'].max()
    max_observed_row = df_daily.loc[df_daily['max_daily_dd_pct_start'].idxmax()]
    print(f"\nKEINE 4.0% TAGES-DRAWDOWN VERLETZUNG GEFUNDEN!")
    print(f"Höchster beobachteter Tages-Drawdown: {max_observed_dd:.2f}% (${max_observed_row['max_daily_dd_usd']:.2f}) am {max_observed_row['date']}")
