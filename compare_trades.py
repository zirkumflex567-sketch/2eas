import openpyxl, os
from datetime import datetime

p_market = r'C:\Users\zirku\Downloads\mt5_strategy_research\rev\500eurotest.xlsx'
p_titan  = r'C:\Users\zirku\Downloads\mt5_strategy_research\rev\500er\500acc ohne schutz.xlsx'

def extract_trades_list(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    trades_r = None
    for r in range(1, ws.max_row+1):
        if ws.cell(row=r, column=1).value in ['Trades', 'Deals', 'Geschäfte']:
            trades_r = r
            break
    trades = []
    current_positions = {}
    for r in range(trades_r+2, ws.max_row+1):
        c1 = ws.cell(row=r, column=1).value
        if not c1 or not str(c1).startswith('2026'):
            continue
        order = ws.cell(row=r, column=8).value
        entry_dir = ws.cell(row=r, column=5).value
        typ = ws.cell(row=r, column=4).value
        vol = float(ws.cell(row=r, column=6).value or 0)
        price = float(ws.cell(row=r, column=7).value or 0)
        profit = float(ws.cell(row=r, column=11).value or 0)
        comm = float(ws.cell(row=r, column=9).value or 0)
        swap = float(ws.cell(row=r, column=10).value or 0)
        comment = str(ws.cell(row=r, column=13).value or '')
        time_str = str(c1)
        
        if entry_dir == 'in':
            current_positions[order] = {
                'in_time': time_str,
                'typ': typ,
                'vol': vol,
                'in_price': price,
                'comm': comm
            }
        elif entry_dir == 'out':
            if order in current_positions:
                pos = current_positions.pop(order)
                pos['out_time'] = time_str
                pos['out_price'] = price
                pos['profit'] = profit + comm + swap + pos['comm']
                pos['comment'] = comment
                trades.append(pos)
    return trades

t_m = extract_trades_list(p_market)
t_t = extract_trades_list(p_titan)

print(f'Total closed positions in Market EA: {len(t_m)}')
print(f'Total closed positions in Titan Pro: {len(t_t)}')

# Compare first 20 entries of Market EA
print('\n=== First 15 trades of Market EA (500eurotest) ===')
for i, t in enumerate(t_m[:15]):
    print('%2d: %s -> %s | %-4s | In: %7.2f Out: %7.2f | PnL: %6.2f | %s' % 
          (i+1, t['in_time'], t['out_time'], t['typ'], t['in_price'], t['out_price'], t['profit'], t['comment']))

print('\n=== First 15 trades of Titan Pro (500acc) ===')
for i, t in enumerate(t_t[:15]):
    print('%2d: %s -> %s | %-4s | In: %7.2f Out: %7.2f | PnL: %6.2f | %s' % 
          (i+1, t['in_time'], t['out_time'], t['typ'], t['in_price'], t['out_price'], t['profit'], t['comment']))
