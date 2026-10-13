"""Cold Chromium checks on actual HTML/CSS, broker-free static UI fixture.
No app import, API responses, chart script execution or trading operations.
Run directly: python tests/test_stone_ui_assets_browser.py
"""
import ast
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading
import unittest
from urllib.parse import urlparse

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/stone-ui-assets'


def fixture(optimized, nonchart_only):
    tree = ast.parse((ROOT/'app.py').read_text(encoding='utf-8'))
    html = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'HTML_CONTENT' for t in n.targets))
    html = re.sub(r'<script\b.*?</script>', '', html, flags=re.S)
    # Real application now includes the layer. Remove it only for the explicit
    # unoptimized baseline; append only if exercising an older HTML fixture.
    if not optimized:
        html = re.sub(r'<link[^>]+href="static/stone-ui-assets.css"[^>]*>', '', html)
    elif 'href="static/stone-ui-assets.css"' not in html:
        html = html.replace('</head>', '<link rel="stylesheet" href="static/stone-ui-assets.css"></head>')
    html = html.replace('</body>', '<script src="static/stone-cockpit.js"></script></body>')
    return html


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/':
            body = fixture('optimized' in parsed.query, 'nonchart' in parsed.query).encode()
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
        elif parsed.path.startswith('/api/'):
            self.send_error(403, 'APIs forbidden in static renderer')
        else:
            super().do_GET()
    def do_POST(self):
        self.send_error(405)
    def log_message(self, format, *args):
        pass


SETUP = """() => {
  document.querySelector('#account-switcher').innerHTML =
    '<button class="account-tab" aria-pressed="true"><strong>STATIC UI FIXTURE</strong><small>No account connection</small></button><button class="account-tab" aria-pressed="false">Inactive account</button>';
  document.querySelector('#gold-details').classList.remove('hidden');
  document.querySelector('#dd-reset-button').disabled = false;
  document.querySelector('#sell-bar').style.width='100%';
  document.querySelector('#buy-bar').style.width='40%';
  document.querySelector('#matrix-tbody').innerHTML = Array.from({length:5}, (_,i) =>
    `<tr class="stone-target-row stone-target-row--${i}"><td>Static condition ${i+1}</td><td>CHECK</td><td>CHECK</td><td>Not live</td></tr>`).join('');
  document.querySelector('#positions-list').innerHTML='<label>STATIC VALUE <input type="number" value="10"></label><button>Decoration only</button>';
  const modal=document.querySelector('#dd-reset-modal');
  modal.classList.remove('hidden'); modal.classList.remove('fixed');
  modal.style.position='relative';
  document.querySelectorAll('button').forEach(e=>e.removeAttribute('onclick'));
}"""

READ_LAYERS = """() => {
 const rows=[];
 for (const el of [document.body,...document.querySelectorAll('body *')]) {
  for (const pseudo of [null,'::before','::after']) {
   const s=getComputedStyle(el,pseudo);
   rows.push({tag:el.tagName,id:el.id,classes:String(el.className),pseudo,
    bg:s.backgroundImage,border:s.borderImageSource,slice:s.borderImageSlice});
  }
 }
 return rows;
}"""

READ_PROTECTED = """() => [...document.querySelectorAll('.stone-asset-panel--chart, .stone-asset-panel--chart *, .stone-asset-panel--volume, .stone-asset-panel--volume *')].map(el =>
 [null,'::before','::after'].map(p=>{
 const s=getComputedStyle(el,p);return Array.from(s).sort().map(k=>[k,s.getPropertyValue(k)]);
 }));"""


class BrowserBudget(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.server = ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}/'
        cls.metrics=[]
    @classmethod
    def tearDownClass(cls):
        (OUTPUT/'browser-measurements.json').write_text(json.dumps(cls.metrics,indent=2))
        cls.browser.close(); cls.pw.stop()
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def load(self, optimized=True, width=390, nonchart=False):
        context=self.browser.new_context(viewport={'width':width,'height':844},
                     device_scale_factor=2,reduced_motion='reduce')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        if nonchart:
            html=page.evaluate('''html=>{const doc=new DOMParser().parseFromString(html,'text/html');
              for(const id of ['tv-chart','vp-histogram-container']) doc.getElementById(id)?.closest('.glass-card')?.remove();
              return '<!DOCTYPE html>'+doc.documentElement.outerHTML;}''',fixture(optimized,True))
            page.route(self.url+'?*',lambda route:route.fulfill(content_type='text/html',body=html))
        page.goto(self.url+('?optimized' if optimized else '?baseline')+('&nonchart' if nonchart else ''),wait_until='networkidle')
        page.evaluate(SETUP)
        # SETUP reveals hidden panels and creates decorated rows/controls, which
        # can start new CSS image requests after navigation has already settled.
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(300)
        self.assertEqual(errors,[])
        self.assertEqual(page.locator('body.theme-stone').count(),1)
        return context,page

    def test_nonchart_only_cold_requests_never_fetch_ready_files(self):
        for width in (390,768):
            with self.subTest(width=width):
                baseline_context,baseline=self.load(optimized=False,width=width,nonchart=True)
                try:
                    resources=baseline.evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('stone-assets/')).map(r=>({url:r.name,encoded:r.encodedBodySize,transfer:r.transferSize}))")
                    unique={r['url']:r['encoded'] for r in resources}
                    # Responsive paint/lazy loading can legitimately omit an
                    # offscreen original. Check completed transfer sizes against
                    # actual files; the historical 19,665,638-byte full baseline
                    # is evidence, not a viewport-independent browser contract.
                    self.assertGreater(sum(unique.values()),3*1024*1024)
                    for url, encoded in unique.items():
                        path = ROOT / urlparse(url).path.lstrip('/')
                        self.assertTrue(path.is_relative_to(ROOT / 'static/stone-assets'))
                        self.assertEqual(encoded,path.stat().st_size,url)
                    self.metrics.append(dict(width=width,nonchart=True,baseline=True,resources=resources,
                                             encoded_unique_bytes=sum(unique.values())))
                finally:
                    baseline_context.close()
                context,page=self.load(width=width,nonchart=True)
                try:
                    layers=page.evaluate(READ_LAYERS)
                    remaining=[r for r in layers if '/ready/' in r['bg'] or '/ready/' in r['border']]
                    self.assertEqual(remaining,[], 'Old URLs still win on nonchart/pseudo layers')
                    resources=page.evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('stone-assets/')).map(r=>({url:r.name,encoded:r.encodedBodySize,transfer:r.transferSize}))")
                    originals=[r for r in resources if '/ready/' in r['url']]
                    self.assertEqual(originals,[], 'Cold Nonchart requests must not include originals')
                    unique={r['url']:r['encoded'] for r in resources}
                    self.assertLessEqual(sum(unique.values()),3*1024*1024)
                    self.assertGreater(len(unique),0)
                    self.metrics.append(dict(width=width,nonchart=True,resources=resources,
                                             encoded_unique_bytes=sum(unique.values())))
                    page.screenshot(path=str(OUTPUT/f'{width}-nonchart-optimized.png'),full_page=True,animations='disabled')
                finally:
                    context.close()

    def test_chart_volume_styles_unchanged_and_portrait_render_difference_bounded(self):
        for width in (390,768):
            contexts=[]
            try:
                a,old=self.load(optimized=False,width=width); contexts.append(a)
                b,new=self.load(optimized=True,width=width); contexts.append(b)
                self.assertEqual(old.evaluate(READ_PROTECTED),new.evaluate(READ_PROTECTED),'No chart/volume computed-style changes')
                for selector in ('nav.stone-asset-nav','header.stone-asset-header','.stone-asset-panel--diagnostic','.stone-asset-panel--matrix'):
                    label=re.sub(r'[^a-zA-Z0-9]+','-',selector)
                    before=OUTPUT/f'{width}-{label}-before.png'
                    after=OUTPUT/f'{width}-{label}-after.png'
                    old.locator(selector).screenshot(path=str(before),animations='disabled')
                    new.locator(selector).screenshot(path=str(after),animations='disabled')
                    with Image.open(before) as x, Image.open(after) as y:
                        self.assertEqual(x.size,y.size)
                        rms=ImageStat.Stat(ImageChops.difference(x.convert('RGB'),y.convert('RGB'))).rms
                        self.assertLessEqual(max(rms),6.0,(width,selector,rms))
                        self.metrics.append(dict(width=width,selector=selector,screenshot_rgb_rms=rms))
                resources=new.evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('stone-assets/')).map(r=>({url:r.name,encoded:r.encodedBodySize,transfer:r.transferSize}))")
                self.metrics.append(dict(width=width,nonchart=False,resources=resources))
            finally:
                for context in contexts: context.close()


if __name__=='__main__':
    unittest.main(verbosity=2)
