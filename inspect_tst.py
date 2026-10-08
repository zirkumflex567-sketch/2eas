import glob, os, struct

cache_dir = r'C:\Users\zirku\AppData\Roaming\MetaQuotes\Terminal\E62C655ED163FFC555DD40DBEA67E6BB\Tester\cache'
tst_files = glob.glob(os.path.join(cache_dir, '*.tst'))
tst_files.sort(key=os.path.getmtime, reverse=True)

for f in tst_files[:12]:
    name = os.path.basename(f)
    size = os.path.getsize(f)
    mtime = os.path.getmtime(f)
    with open(f, 'rb') as fp:
        buf = fp.read()
    
    # In MT5 tst files, strings like net profit or deal profits are stored.
    # Let's search for the header or extract text/doubles
    print(f"\n--- {name[:45]} (size={size}) ---")
    # Search for any embedded string
    import re
    strs = re.findall(b'[\x20-\x7e]{4,}', buf)
    found_inputs = [s.decode('ascii', errors='ignore') for s in strs if b'=' in s or b'Inp' in s]
    if len(found_inputs) > 0:
        print("  Inputs sample:", found_inputs[:5])
