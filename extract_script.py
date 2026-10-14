import json

with open(r'C:\Users\zirku\.gemini\antigravity\brain\c98ddc14-d641-4466-a351-59d533463650\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    data = json.loads(l)
    c = str(data.get('content', ''))
    if 'XAUUSD.pi' in c and 'Strategietesterbericht' in c:
        print(f"Found on line {i}! Length: {len(c)}")
        idx = c.find('Strategietesterbericht')
        with open('extracted_user_report.csv', 'w', encoding='utf-8') as out:
            out.write(c[idx:])
        print("Successfully extracted to extracted_user_report.csv!")
        break
