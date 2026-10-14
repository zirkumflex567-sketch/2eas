"""Package and validate the completed read-only audit artifacts."""
import json
import hashlib
import subprocess
import zipfile
from pathlib import Path
from datetime import datetime
from pypdf import PdfReader
OUT=Path(__file__).resolve().parent
D=json.loads((OUT/'verification.json').read_text(encoding='utf-8'))
files=['app.py','account_gateway.py','goldm15_dashboard.py','drawdown_config.json','static/stone-asset-skin.css','static/stone-cockpit.js']
D['source_unchanged_normalized_line_endings']={f:Path(f).read_bytes().replace(b'\r\n',b'\n')==subprocess.check_output(['git','show','HEAD:'+f]).replace(b'\r\n',b'\n') for f in files}
D['pdf_visual_review']='All 17 pages rasterized; contact sheet and page 1 reviewed: no visible table truncation or text/image overlap. Narrow mobile screenshots are small in PDF; HTML links preserve original resolution.'
D['final_time']=datetime.now().astimezone().isoformat(timespec='seconds')
D['screenshots']=len(list((OUT/'screenshots').glob('*.png')))
D['tracked_diff']=subprocess.check_output(['git','diff','--name-only'],text=True).strip()
D['status']=subprocess.check_output(['git','status','--short'],text=True)
assert not D['tracked_diff'] and all(D['source_unchanged_normalized_line_endings'].values())
assert D['findings']==20 and D['visual_states']==18 and D['screenshots']==75
assert D['browser_pass']+D['browser_fail']==D['browser_checks']==39
pdf=PdfReader(OUT/'report.pdf');assert len(pdf.pages)==17
(OUT/'verification.json').write_text(json.dumps(D,indent=2,ensure_ascii=False),encoding='utf-8')
archive=OUT.parent/'dashboard-audit-2026-10-09.zip'
selected=[f for f in OUT.rglob('*') if f.is_file() and '__pycache__' not in f.parts]
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in selected:z.write(f,Path(OUT.name)/f.relative_to(OUT))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(selected)
print(json.dumps({'archive':str(archive),'archive_bytes':archive.stat().st_size,'archive_files':len(selected),'pdf':str(OUT/'report.pdf'),'pdf_pages':len(pdf.pages),'html':str(OUT/'report.html'),'source_unchanged':all(D['source_unchanged_normalized_line_endings'].values()),'screenshots':D['screenshots'],'findings':D['findings'],'zip_integrity':'passed'},ensure_ascii=False,indent=2))
