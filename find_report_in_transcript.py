import json

full_path = r'C:\Users\zirku\.gemini\antigravity\brain\c98ddc14-d641-4466-a351-59d533463650\.system_generated\logs\transcript_full.jsonl'
with open(full_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines in transcript_full: {len(lines)}")
for i, line in enumerate(lines):
    data = json.loads(line)
    c = str(data.get('content', ''))
    if 'Strategietesterbericht' in c:
        print(f"Index {i}: type={data.get('type')}, source={data.get('source')}, len={len(c)}")
        # Check where Strategietesterbericht is
        idx = c.find('Strategietesterbericht')
        print(f"  idx={idx}, snippet={c[idx:idx+150]}...")
