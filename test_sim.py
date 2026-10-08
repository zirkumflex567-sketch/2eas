
import openpyxl, datetime

wb = openpyxl.load_workbook(r'C:\Users\zirku\Downloads\check05.xlsx', data_only=True)
ws = wb.active

deals = []
start_r = 100
for r in range(100, 2500):
    if ws.cell(r, 1).value == 'Zeit' and ws.cell(r, 4).value == 'Typ':
        start_r = r + 1
        break

for r in range(start_r, ws.max_row + 1):
    val_type = ws.cell(r, 4).value
    val_dir = ws.cell(r, 5).value
    if val_dir == 'out' and val_type in ['buy', 'sell']:
        time_str = ws.cell(r, 1).value
        vol = float(ws.cell(r, 6).value or 0.0)
        profit = float(ws.cell(r, 11).value or 0.0)
        comm = float(ws.cell(r, 9).value or 0.0)
        swap = float(ws.cell(r, 10).value or 0.0)
        net = profit + comm + swap
        try:
            dt = datetime.datetime.strptime(str(time_str).strip(), '%Y.%m.%d %H:%M:%S')
        except Exception:
            continue
        deals.append({'time': dt, 'hour': dt.hour, 'weekday': dt.weekday(), 'net': net, 'vol': vol})

orig_win = sum(d['net'] for d in deals if d['net'] > 0)
orig_loss = sum(d['net'] for d in deals if d['net'] <= 0)
orig_net = orig_win + orig_loss

print('ORIGINAL:')
print('  Gross Win:  ', round(orig_win, 2))
print('  Gross Loss: ', round(orig_loss, 2))
print('  Net Profit: ', round(orig_net, 2))
print('  Profit Factor:', round(abs(orig_win/orig_loss), 2))

# SIM 1: Filter 15-17
s1 = [d for d in deals if not (15 <= d['hour'] <= 17)]
w1 = sum(d['net'] for d in s1 if d['net'] > 0)
l1 = sum(d['net'] for d in s1 if d['net'] <= 0)
print('SIM 1 (News Filter 15-17 Uhr aktiv):')
print('  Gross Win:  ', round(w1, 2))
print('  Gross Loss: ', round(l1, 2))
print('  Net Profit: ', round(w1+l1, 2), f'(+ {round((w1+l1)-orig_net, 2)} $ MEHR!)')
print('  Profit Factor:', round(abs(w1/l1), 2))

# SIM 2: Cap max loss at -60$
s2 = [max(d['net'], -60.0) if d['net'] <= 0 else d['net'] for d in deals]
w2 = sum(x for x in s2 if x > 0)
l2 = sum(x for x in s2 if x <= 0)
print('SIM 2 (SL Cap bei 60$):')
print('  Gross Win:  ', round(w2, 2))
print('  Gross Loss: ', round(l2, 2))
print('  Net Profit: ', round(w2+l2, 2), f'(+ {round((w2+l2)-orig_net, 2)} $ MEHR!)')
print('  Profit Factor:', round(abs(w2/l2), 2))

# SIM 3: Combined
s3 = [max(d['net'], -60.0) if d['net'] <= 0 else d['net'] for d in deals if not (15 <= d['hour'] <= 17)]
w3 = sum(x for x in s3 if x > 0)
l3 = sum(x for x in s3 if x <= 0)
print('SIM 3 (Kombination aus beidem):')
print('  Gross Win:  ', round(w3, 2))
print('  Gross Loss: ', round(l3, 2))
print('  Net Profit: ', round(w3+l3, 2), f'(+ {round((w3+l3)-orig_net, 2)} $ MEHR!)')
print('  Profit Factor:', round(abs(w3/l3), 2))
