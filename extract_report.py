import json

full_path = r'C:\Users\zirku\.gemini\antigravity\brain\c98ddc14-d641-4466-a351-59d533463650\.system_generated\logs\transcript_full.jsonl'
with open(full_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        data = json.loads(line)
        content = str(data.get('content', ''))
        t = data.get('type')
        s = data.get('source')
        print(f"Step {i}: type={t}, source={s}, len={len(content)}")
        if 'Strategietesterbericht' in content:
            print(f"Found Strategietesterbericht in step {i}!")
            idx = content.find('Strategietesterbericht')
            with open('current_report.csv', 'w', encoding='utf-8') as out:
                out.write(content[idx:])
            print("Extracted to current_report.csv!")
