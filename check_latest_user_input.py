import json

with open(r'C:\Users\zirku\.gemini\antigravity\brain\c98ddc14-d641-4466-a351-59d533463650\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i in range(len(lines)-1, max(-1, len(lines)-15), -1):
    data = json.loads(lines[i])
    if data.get('type') == 'USER_INPUT':
        print(f"User input at line {i}: media={data.get('media')}")
        content = data.get('content', '')
        print(f"Content length: {len(content)}, preview: {content[:100]}...")
        if data.get('media'):
            for m in data.get('media'):
                print(f"Media URI: {m.get('uri')}")
        break
