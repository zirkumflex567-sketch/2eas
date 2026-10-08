import pandas as pd
from bs4 import BeautifulSoup

path = r'C:\Users\zirku\AppData\Roaming\MetaQuotes\Terminal\E62C655ED163FFC555DD40DBEA67E6BB\MQL5\Profiles\Tester\124124.html'
with open(path, 'r', encoding='utf-16le', errors='ignore') as f:
    text = f.read()

soup = BeautifulSoup(text, 'html.parser')
t1 = soup.find_all('table')[1]
rows = t1.find_all('tr')

trades_data = []
for r in rows[2:]:
    cols = [c.get_text(strip=True) for c in r.find_all('td')]
    if len(cols) >= 11:
        trades_data.append(cols)

print(f"Total deals/orders in 124124.html: {len(trades_data)}")
for tr in trades_data[:15]:
    print(' | '.join(tr))
