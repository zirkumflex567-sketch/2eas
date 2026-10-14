import json

with open(r'C:\Users\zirku\.gemini\antigravity\brain\c98ddc14-d641-4466-a351-59d533463650\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        c = str(data.get('content', ''))
        if '9100' in c:
            print(f"Line {i} has '9100'! Type: {data.get('type')}, Len: {len(c)}")
            print(f"Preview: {c[:200]}...")
