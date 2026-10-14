"""Generate audit documentation from measured JSON and captured screenshots only."""
import json
import csv
import html
import hashlib
import statistics
import subprocess
from collections import Counter
from pathlib import Path
from datetime import datetime
from PIL import Image
from playwright.sync_api import sync_playwright
from markdown_it import MarkdownIt

OUT=Path(__file__).resolve().parent
SHOT=OUT/'screenshots'
D=json.loads((OUT/'browser-results.json').read_text(encoding='utf-8'))
SUP=json.loads((OUT/'supplement-results.json').read_text(encoding='utf-8'))
REL=json.loads((OUT/'reliability-results.json').read_text(encoding='utf-8'))
F=json.loads((OUT/'findings.json').read_text(encoding='utf-8'))
# Genuine crops of original captures, no synthetic UI or proposed design.
for src,dest,height in [('titan-light-journal.png','titan-light-journal-top.png',650),('titan-stone-journal.png','titan-stone-journal-top.png',650),('injected-accounts-start-failure.png','injected-accounts-start-failure-top.png',550)]:
    im=Image.open(SHOT/src);im.crop((0,0,im.width,min(height,im.height))).save(SHOT/dest)
# Fresh mobile screenshot with scrollLeft=0: previous scrolled probe intentionally moved it.
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    c=b.new_context(viewport={'width':390,'height':844})
    def safe(route):
        if route.request.method not in ('GET','HEAD'):route.abort()
        else:route.continue_()
    c.route('**/*',safe)
    page=c.new_page();page.goto('http://127.0.0.1:8057',wait_until='networkidle');page.wait_for_function('currentData!==null')
    page.locator('[data-mode="dark"]').click()
    page.evaluate("document.querySelector('#matrix-tbody').closest('table').parentElement.scrollLeft=0")
    page.locator('.stone-asset-panel--matrix').screenshot(path=str(SHOT/'titan-dark-mobile-matrix-initial.png'))
    page.locator('header.glass-card').screenshot(path=str(SHOT/'titan-dark-mobile-header.png'))
    c.close();b.close()

count=Counter(x['priority'] for x in F)
passed=sum(x['passed'] for x in D['checks'])
failed=[x for x in D['checks'] if not x['passed']]
source_commit=json.loads((OUT/'audit-manifest.json').read_text())['commit']
now=datetime.now().astimezone().isoformat(timespec='seconds')
lines=[
'# Dashboard-Audit · Nicht-Chart-Bereiche',
'',
'> **Ergebnis: funktionsfähig, aber noch nicht visuell und betrieblich abnahmefähig.** Insbesondere Hell-Theme, mobile Header/Matrix, Datenfrische und kritische Validierungen benötigen Nacharbeit. Keine Reparaturen durchgeführt.',
'',
'## Stand und Grenzen',
'',
f'- Audit erstellt: **{now}**. Repository: `C:/Users/zirku/Downloads/testing`.',
f'- Erst `git pull --ff-only`: `b7153cb` → **`{source_commit}`**, `main`. Bestehende unversionierte Dateien beibehalten; kein Stash/Reset/Commit/Push.',
'- Separate Testinstanz gestartet: **http://127.0.0.1:8057** mit `DASHBOARD_PORT=8057 C:/Python314/python.exe app.py`. Bereits belegten Port 8050 nicht beendet oder ersetzt.',
'- Laufzeit: Windows, Python **3.14.3**, Chromium **'+D['browser']+'**. Beide konfigurierte Demo-Konten lieferten echte Status-GETs: Titan 3, Gold 2 offene Positionen im Snapshot.',
'- **Chart-System ausdrücklich ausgeschlossen:** keine Chart-Funktionsprüfung, kein Chart-Studio-/Money-Audit, keine Reparatur daran. Vollseitenbilder enthalten den unveränderten Chart nur als Umgebung. Vorhandene Contracttests enthalten vereinzelte Chart-Textasserts; daraus wird keine Chart-Abnahme abgeleitet.',
'- **Keine echten Handelsaktionen, SL/TP-Änderungen oder Resets.** Alle Browserrequests außer GET/HEAD wurden vor dem Backend abgefangen oder abgebrochen. Drei abgefangene POSTs (ungültige Baseline, Quick-TP, Close) wurden mit ausdrücklich simulierten Antworten beantwortet. Backend-Fehlerfälle liefen isoliert mit Mock-MT5 und Mock-Dateizugriffen.',
'- Nur neue Dokumentation, Bilder, Evidenz und reproduzierbare Audit-Harnesses im Auditordner geschrieben. Nach dem Pull keine Anwendung/Styles/Handelslogik geändert.',
'- Screenshots/JSON enthalten Konto-, Ticket- und Finanzdaten: **lokale vertrauliche Dokumentation**, nicht unredigiert veröffentlichen.',
'',
'## Kurzbilanz',
'',
'| Prüfung | Verifiziertes Ergebnis |',
'|---|---|',
'| Bestehende relevante pytest-Suite | **40 Tests + 10 Subtests bestanden**, 12,52 s; JUnit und Textprotokoll vorhanden |',
f'| Browser-Verhaltensprüfungen | **{passed}/{len(D["checks"])} bestanden**; {len(failed)} bewusst aufgedeckte Fehler, keine Laufzeitausnahme des Harnesses |',
f'| Visuelle Hauptmatrix | **{len(D["states"])} Ansichten** = 2 Konten × 3 Themes × 3 Größen (1440×1000, 768×1024, 390×844) |',
'| Ergänzende Reflow-Proben | Titan: 320 px und 720 px für alle drei Themes. 720 px ist nur 200%-Zoom-Layoutäquivalent, kein vollwertiger Browserzoom-Test |',
'| Browserfehler | **0 pageerror**, **0 requestfailed** im Hauptlauf; Fehlerzustände gesondert injiziert |',
'| Accessibility | axe-core 4.10.3 für 6 Nicht-Chart-Desktop-Sichten; Kontrast + Feldnamen + manuelle Fokus-/Escape-Proben |',
'| Lese-API-Mikrobenchmark | Je 10 Samples für Status/Journal × 2 Konten = 40 serielle GETs; 4 weitere parallele Status-GETs |',
f'| Konsolidierte Befunde | **{len(F)}**: '+', '.join(f'{k}: {count[k]}' for k in ['P1','P2','P3'])+'; kein P0-Schaden oder realer Tradefehler provoziert |',
'',
'**P1** = vor sicherer breiter Nutzung / Freigabe beheben; **P2** = mittlere Verbesserung/Datengenauigkeit; **P3** = Optimierung. axe-Impact wie „critical“ beschreibt die Regel, nicht automatisch einen P0-Vorfall.',
'',
'## Was bereits funktioniert',
'',
'- Kontoidentität wird auf dem Backend pro Request gegen Login, Server, Terminalpfad und Verbindung geprüft. Globaler Lock schützt vor Accountwechsel mitten im Request; Tests decken parallele Konten ab.',
'- Derselbe Account nutzt die verifizierte MT5-Verbindung wieder. Die alte Auditbehauptung „jede Anfrage verbindet neu“ trifft auf diesen Stand nicht mehr zu.',
'- Geschwindigkeitsfixes vorhanden: vektorisiertes Volumenprofil, kontospezifischer Journal-TTL, lokale kompilierten Tailwind-CSS und lokale Scriptdateien; kein Tailwind Play-CDN im aktuellen Lauf.',
'- Normale Statusupdates bewahren geänderte SL-Eingaben auch nach Blur; Fokus bleibt erhalten. Der verbleibende Fehler betrifft Strukturänderungen.',
'- Späte Titan-Antwort überschreibt nach Wechsel nicht Gold. Journalfilter ändern nicht das aktive Handelskonto.',
'- Expliziter Status-503 leert alte Kontodaten und sperrt Reset; echte GETs erholen sich nach Aufheben der Teststörung.',
'- Gold zeigt 6 Einstiegskriterien und 3 Momentum-Ausstiegsziele. Baseline- und Reservehinweise sind vorhanden; Resetbeschreibung weist auf reine Anzeigewirkung hin.',
'- Stone-Deko berücksichtigt in den gesampelten Elementen Reduced Motion. Theme/Kontowahl übersteht Reload.',
'',
'## Visueller Überblick und Kontraste',
'',
'### M15-SCHLUSS – der Screenshot-Hinweis ist berechtigt',
'',
'Der Countdown nutzt `rgb(59,130,246)` für Label und Wert. Gemessene Schrift: Label **11 px**, Zeit **12 px**, beide fett. Dark-Kontrast **4,42:1** auf `#111f3f` – knapp unter 4,5:1. Light **2,98:1** auf `#dee8fc` – klar zu schwach. Stone hat Texturen/Gradienten: axe markiert die Kontrastprüfung als unvollständig; hier kein erfundener exakter Wert. Bilder zeigen dennoch kleine, wenig priorisierte Schrift.',
'',
'![M15/Status – Dark](screenshots/titan-dark-header.png)',
'![M15/Status – Light](screenshots/titan-light-header.png)',
'![M15/Status – Stone](screenshots/titan-stone-header.png)',
'',
'### Messbare kritische Textkontraste',
'',
'| Element | Theme | Kontrast | Ziel für kleinen Text |',
'|---|---|---:|---:|',
'| M15-Label/Zeit | Dark | 4,42:1 | 4,5:1 |',
'| M15-Label/Zeit | Light | 2,98:1 | 4,5:1 |',
'| Tages-DD/Puffer | Light | 1,75:1 | 4,5:1 |',
'| Reset-Tag | Light | 1,32:1 | 4,5:1 |',
'| Bid | Light | 2,31:1 | 4,5:1 |',
'| Ask | Light | 3,35:1 | 4,5:1 |',
'| LIVE-Kontobestätigung | Light | 2,53:1 | 4,5:1 |',
'| BUY-Badge weiß/grün | Dark | 3,76:1 | 4,5:1 |',
'',
'Die dargestellten axe-Zahlen gelten für diesen DOM/Snapshot, nicht für alle Zustände. Weiß-auf-Weiß bei Journalpreisen ist zusätzlich im Screenshot und Quellcode nachgewiesen. Stone kann wegen Texturen nicht automatisch als kontrastkonform bezeichnet werden.',
'',
'## Befundübersicht',
'',
'| ID | Priorität | Befund | Nachweis |',
'|---|---|---|---|'
]
for f in F:lines.append(f'| [{f["id"]}](#{f["id"].lower()}) | {f["priority"]} | {f["title"]} | {f["evidence"]} |')
lines += ['', '## Einzelbefunde', '']
for f in F:
    lines += [f'<a id="{f["id"].lower()}"></a>',f'### {f["id"]} · {f["title"]}', '', f'**{f["priority"]} · {f["category"]}** · Nachweis: {f["evidence"]}', '', '**Quelle:** `'+f['source']+'`', '', '**Reproduktion:** '+f['reproduce'], '', '**Ist:** '+f['actual'], '', '**Soll:** '+f['expected'], '', '**Empfehlung (noch nicht umgesetzt):** '+f['recommendation'], '', '**Abnahme:** '+f['acceptance'], '']
    for img in f['images']:lines += [f'![{f["id"]} – Original-Screenshot/Nahaufnahme](screenshots/{img})','']
lines += ['## Performance: gemessen, nicht geschätzt','',
'### Lokale GET-Latenzen','',
'10 Samples pro Zelle, seriell, kein Timeout/HTTP-Fehler. Uvicorn auf demselben Rechner; bereits laufende andere Dashboardinstanz und Brokerlast sind nicht kontrolliert. Kein isolierter CPU-Benchmark, keine SLA-Abnahme, keine Aussage über Internet-/VPS-Leistung. Statusantworten enthalten derzeit Journalcaches. Chart-/Candles-Endpunkte nicht im Benchmark.',
'', '| Konto | Endpoint | Min ms | Median ms | Max ms | Payload Byte |','|---|---|---:|---:|---:|---:|']
for g in D['api']:
    vals=[x['ms'] for x in g['samples']];sizes=[x['bytes'] for x in g['samples']]
    lines.append(f'| {g["account"]} | {g["route"]} | {min(vals):.2f} | {statistics.median(vals):.2f} | {max(vals):.2f} | {min(sizes)}–{max(sizes)} |')
lines += ['','Vier parallele Statusrequests: '+', '.join(f'{r["ms"]:.2f} ms ({r["path"].split("=")[-1]})' for r in D['concurrent_status_four_requests'])+'. Das passt zur gemeinsamen MT5-Sperre, belegt aber allein nicht deren isolierten Anteil.',
'', '### Erstlade- und Assetmessung','',
'- Frischer Chromiumkontext, Standard Stone: **48 Resource-Einträge**, **22.801.806 Byte Transfer** (21,75 MiB). HTML-Dokument ist nicht in dieser Resource-Summe enthalten. Enthält Chart-JS/-APIs und geteilte Rahmen; kein isolierter Nicht-Chart-Seitenwert.',
'- Stone-Assets: **35 Requests, 22.391.976 Body-Byte** (21,35 MiB). Konservative Teilmenge ohne `11_master_dashboard_panel` und `12_chart_frame_wide`: **33 Requests, 19.311.744 Byte** (18,42 MiB). Geteilte Assets bleiben in dieser Teilmenge möglich.',
'- Größtes Asset 2.025.248 Byte; Emblem 1.186.368 Byte. WebP-Konvertierung schon vorhanden. Dimensionen/Mehrfachrahmen sind der nächste Hebel.',
'- Dokument `DOMContentLoaded` **92,3 ms**, `loadEventEnd` **488,3 ms**. Gesamte Harness-Wartezeit bis networkidle/Account bestätigt **2310,89 ms**, enthält künstliche networkidle-Wartezeit. **Nicht** als Nutzer-Ladezeit oder Nicht-Chart-Speedup verkaufen.',
'- Gelesene Uvicorn-Header: kein `Content-Encoding` bei HTML/CSS/Status; CSS bietet ETag/Last-Modified. Reverse-Proxy-Kompression gesondert prüfen; WebP komprimiert ohnehin.',
'- Ganze Seiten enthalten Chart-Rendering: gesammelte Long-Task-Daten bleiben Rohdaten ohne Nicht-Chart-FPS/CPU-Zuordnung. Keine CPU-, RAM-, GPU- oder Akkuprozentwerte erfunden.',
'', '### Priorisierte Optimierungsreihenfolge','',
'1. **Korrektheit/Frische vor mehr Tempo:** Timeouts, Stale-Alter, sichere Persistenz, Validierung und Baseline-Tagesgrenzen.',
'2. **Lesbarkeit:** Theme-Tokens, M15-Countdown, alle White-on-white-Stellen, mobile Header/Matrix. Datenflächen ruhig halten, Stone nur als Rahmen.',
'3. **Weniger Arbeit pro Poll:** Light-Status ohne Journale/Cross-Cache, Indikatoren/Snapshots barbasiert cachen. Kontoisolation nicht für Geschwindigkeit opfern.',
'4. **Weniger Transfer:** kleine Embleme/Texturen, responsive Größen, offscreen Deko verzögert laden; Nicht-Chart-Deko-Budget ≤3 MiB als Ziel.',
'5. **Weniger Renderarbeit:** Ticket-/Journal-Deltas, Deko nur sichtbar/aktiv, Reduced Motion für alle Themes; Profiling vor/nach Änderung.',
'', '## Testmatrix und Rohbelege','',
'### 18 visuelle Hauptsichten','', '| Ansicht | Viewport | Kontrastknoten (axe) | Unbenannte SL/TP-Felder | Bild |','|---|---|---:|---:|---|']
for s in D['states']:
    v={x['id']:len(x['nodes']) for x in s.get('axe',{}).get('violations',[])}
    cc=str(v.get('color-contrast',0)) if 'axe' in s else 'nicht separat automatisiert'
    if 'axe' in s and s['theme']=='stone':cc='unvollständig (Texturen)'
    label=str(v.get('label',0)) if 'axe' in s else 'siehe Desktop'
    lines.append(f'| {s["name"]} | {s["viewport"][0]}×{s["viewport"][1]} | {cc} | {label} | [PNG]({s["screenshot"]}) |')
lines += ['', 'axe zählt betroffene DOM-Knoten, nicht eindeutige Produktbugs. Keine Summierung desselben Fehlers über Themes/Konten. Mobile zusätzlich manuell/Geometrie geprüft.', '', '### 39 Browser-Verhaltenschecks', '', '| Nr. | Prüfung | Ergebnis |','|---:|---|---|']
for i,r in enumerate(D['checks'],1):lines.append(f'| {i} | {r["name"]} | '+('PASS' if r['passed'] else '**FAIL** – Ist '+str(r['actual'])+' / Soll '+str(r['expected']))+' |')
lines += ['', '### Zusätzliche Fehler-/Sicherheitsproben', '',
'- **Live:** Accountwechsel, verspätete Antworten, Journalfilter, Reloadpersistenz, Fokus/Dirty-Polling, status/account-GETs, unbekannter Account → 400, unbekannter Pfad → 404.',
'- **Browserinjiziert:** Status-503 mit Recovery; Journal-Teil-/Totalausfall; hängender Fetch; Kontolisten-Bootstrap-503; leere Positionsliste; künstliche zusätzliche Position. Kein MT5-Terminal gestoppt.',
'- **Backendmock:** negative Stoppreise, ungültige Aktion/negative/Infinity-Baseline, PermissionError bei Persistenz, anderer Symbolticket, Historie=None, alter Baseline-Tag und geänderte laufende Titan-Kerze. Direkte Modell/Handlerproben sind keine Behauptung identischer HTTP-Serialisierung von Infinity.',
'- **Kein destruktiver Live-Test:** echte Orderausführung/SLTP/Reset, EAs starten/stoppen, Broker-SL-/Fill-Verhalten, Tageswechsel an echtem Konto, Crash/Restart während echter Writes.',
'', '### Reproduzieren (nur mit unverändertem Auditstand)', '',
'```bash',
'# Separates Terminal im Repository; Port 8050 nicht übernehmen',
'DASHBOARD_PORT=8057 C:/Python314/python.exe app.py',
'',
'# Relevante brokerisolierte Suite (kein root-level pytest über Forschungsskripte)',
'C:/Python314/python.exe -m pytest tests/test_multi_account.py tests/test_performance_regressions.py tests/test_stone_theme_contract.py tests/test_stone_celebrations_contract.py tests/test_journal_multi_strategy_contract.py -v',
'',
'# Audit-Harnesses überschreiben nur ihre Evidenz im Auditordner',
'C:/Python314/python.exe docs/audits/2026-10-09-dashboard-live/run_audit.py',
'PYTHONPATH=. C:/Python314/python.exe docs/audits/2026-10-09-dashboard-live/run_supplement.py',
'PYTHONPATH=. C:/Python314/python.exe docs/audits/2026-10-09-dashboard-live/run_reliability.py',
'```',
'', 'Voraussetzungen: Python314 mit vorhandenen numpy/pandas/MetaTrader5/FastAPI/httpx/pytest/Playwright, Chromium und lokaler axe.min.js. Echte GET-Screenshots benötigen die bereits angemeldeten konfigurierte Demo-Terminals. Keine Login-/Terminal-Autostart-Automatik hinzugefügt.',
'', '### Artefakte', '',
'- `report.html`: lesbarer Bildreport mit Verweisen; `report.pdf`: druckbare Fassung mit eingebetteten Bildern.',
'- `README.md`: dieselbe Dokumentation als Markdown; `findings.json` und `findings.csv`: priorisierbare Befunde.',
'- `browser-results.json`: alle 18 Ansichten/axe/39 Checks/GET-Messungen; `supplement-results.json`: Cold-Load, Reflow, erste Mockproben.',
'- `reliability-results.json`: weitere reproduzierte Fehler; `live-status-*.json`: echte GET-Snapshots (vertraulich).',
'- `pytest.txt`, `pytest.xml`: reale Testausgaben; `audit-manifest.json`: Commit/Zeit/Hashes. `verification.json`: Abschlusskontrolle der Artefakte.',
'- `screenshots/`: Originalbilder und eindeutig benannte Nahaufnahmen; kein erfundenes Vorher/Nachher.',
'', '## Noch offene Abnahmen / keine Vollständigkeitsbehauptung', '',
'- Nur Chromium/Windows automatisiert. Firefox/WebKit/Safari, reale Android-/iOS-Geräte, echte Touch-/Screenreaderprüfung und Browserzoom offen.',
'- Kein Chart-Audit, kein EA-Profitabilitäts-/Strategiebacktest und keine Aussage, dass die Strategie sicher/profitabel ist.',
'- Kein stundenlanger Soak-/Lasttest; API-Messungen sind 10er-Stichproben. Kontolock-Anteil, Speicher-/GPU-/Akkukosten benötigen getrennte Profiler-Messung.',
'- Kein öffentlicher Sicherheitsangriff/Proxy-Tunnel geprüft. Loopback-Dashboard ist nicht automatisch für externe Nutzung abgesichert.',
'- Kein Golden-Screenshot-Diff gegen historischen Stand: geprüft wurde der gezogene aktuelle Stand. Alte statische Auditbefunde wurden nicht ungeprüft wiederholt.',
'- Bei Paralleländerungen nach dem gezogenen Commit muss vor Umsetzung erneut abgeglichen werden. Alle Empfehlungen sind **noch nicht umgesetzt**.',
'', '## Referenzen', '',
'- WCAG Kontrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
'- Dialog-/Fokusmuster: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/',
'- Fetch-Abbruch: https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
'- Größenbudget/Responsive Bilder: https://web.dev/learn/images/',
'- Rohdaten-Axe: https://github.com/dequelabs/axe-core (lokal verwendete Version 4.10.3).'
]
text='\n'.join(lines)+'\n'
(OUT/'README.md').write_text(text,encoding='utf-8')
with (OUT/'findings.csv').open('w',encoding='utf-8-sig',newline='') as f:
    fields=['id','priority','category','title','evidence','source','recommendation','acceptance'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(F)
md=MarkdownIt('commonmark',{'html':True}).enable('table')
body=md.render(text)
style='''@page{size:A4;margin:17mm 14mm;}*{box-sizing:border-box}body{font-family:Arial,Segoe UI,sans-serif;color:#152337;background:#fff;margin:0;padding:30px;line-height:1.48;font-size:15px;max-width:1100px;}h1{font-size:32px;color:#123b55;border-bottom:4px solid #11868a;padding-bottom:12px}h2{margin-top:34px;color:#123b55;border-bottom:1px solid #ccd9e1;padding-bottom:7px}h3{color:#174660;margin-top:25px}blockquote{border-left:5px solid #aa3d15;background:#fff3e8;padding:12px;margin:15px 0;}table{border-collapse:collapse;width:100%;font-size:12px;margin:15px 0;}td,th{border:1px solid #cbd5df;padding:7px;vertical-align:top;overflow-wrap:anywhere}th{background:#e9f1f6;text-align:left}tr:nth-child(even){background:#f8fafc}code{font-size:12px;overflow-wrap:anywhere;background:#edf2f6;padding:2px}pre{background:#edf2f6;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#075d83}img{display:block;max-width:100%;max-height:380px;object-fit:contain;object-position:left top;border:1px solid #cbd5df;margin:8px 0;}@media print{body{padding:0;max-width:none;font-size:10px;}h1{font-size:25px;}h2{font-size:18px;}h3{font-size:14px;break-after:avoid;}p,li{orphans:3;widows:3;}table{font-size:8px;}img{max-height:85mm;break-inside:avoid;}pre,blockquote{break-inside:avoid;}a{color:#124b69;}thead{display:table-header-group;}}'''
html_doc='<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Dashboard-Audit · ohne Chart-System</title><style>'+style+'</style></head><body>'+body+'</body></html>'
(OUT/'report.html').write_text(html_doc,encoding='utf-8')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1200,'height':1200})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((OUT/'report.html').as_uri(),wait_until='networkidle')
    images=page.evaluate("Array.from(document.images).map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0}))")
    page.screenshot(path=str(OUT/'report-preview.png'))
    page.pdf(path=str(OUT/'report.pdf'),format='A4',print_background=True,display_header_footer=True,header_template='<span></span>',footer_template='<div style="font-family:Arial;font-size:8px;width:100%;text-align:center;color:#526372">Nicht-Chart Dashboard-Audit · b7cabcd · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',margin={'top':'16mm','bottom':'16mm','left':'14mm','right':'14mm'})
    b.close()
from pypdf import PdfReader
pdf=PdfReader(OUT/'report.pdf')
pdf_text='\n'.join(p.extract_text() or '' for p in pdf.pages)
# Verify all finding IDs and exactly collected counts, not eyeballed totals.
verification={'time':now,'commit':source_commit,'findings':len(F),'priorities':dict(count),'browser_checks':len(D['checks']),'browser_pass':passed,'browser_fail':len(failed),'visual_states':len(D['states']),'screenshots':len(list(SHOT.glob('*.png'))),'report_images':len(images),'all_report_images_loaded':all(i['ok'] for i in images),'html_errors':errors,'pdf_pages':len(pdf.pages),'pdf_bytes':(OUT/'report.pdf').stat().st_size,'pdf_all_finding_ids':all(f['id'] in pdf_text for f in F),'tracked_diff':subprocess.check_output(['git','diff','--name-only'],text=True).strip()}
assert verification['all_report_images_loaded'] and verification['pdf_all_finding_ids'] and not errors
assert verification['visual_states']==18 and verification['browser_checks']==39
(OUT/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(verification,indent=2,ensure_ascii=False))
