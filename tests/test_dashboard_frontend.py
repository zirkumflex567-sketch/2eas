"""Real HTML_CONTENT + real local assets, broker-free Playwright regression suite.

Run: C:/Python314/python.exe -m pytest tests/test_dashboard_frontend.py -q
Every API including mutations is intercepted. No app import, MT5 or real API.
"""
import ast
import copy
import json
import os
import threading
import time
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output' / 'audit-ui'
ACCOUNTS = {
    'titan': dict(id='titan', name='Marketplace XAUUSD 5 minute', login=53087839, server='FAKE-DEMO', version='fixture', capacity=3),
    'goldm15': dict(id='goldm15', name='GoldM15 Reconstruction', login=53090070, server='FAKE-DEMO', version='fixture', capacity=2),
}
POSITION = dict(ticket=101, type='BUY', volume=.1, open_price=4000., current_price=4010., profit_usd=100., profit_pct=1., sl_usd=-30., tp_usd=0.)

def status(account):
    payload = dict(account=ACCOUNTS[account], bid=4010., ask=4010.2, spread=20,
        source_fresh=True, quote_time_epoch=time.time(), quote_age_seconds=0.,
        times=dict(server='12:00:00', german='11:00:00', bar_remaining_fmt='14:59'),
        daily_drawdown=dict(pct=1., loss_usd=100., buffer_usd=250., balance=10000., equity=9900., manual_active=False),
        positions=[copy.deepcopy(POSITION)], trend_name='Aufwärts', trend_direction='BULLISH',
        trend_diagnosis='Fixture · keine Handelsfreigabe', in_window=True, sell_readiness=50, buy_readiness=50,
        sell_met_count=1, buy_met_count=1, rule_count=2, rules_matrix=[dict(name='Trend-Regel', short_met=False, long_met=True,
        short_note='EMA20 kleiner EMA50', long_note='EMA20 größer EMA50', live_value='4010.00')], journal=[])
    vp = dict(poc=4000., vah=4010., val=3990., high=4020., low=3980., histogram=[dict(price=4000., vol_pct=80, is_poc=True, in_va=True),dict(price=3990.,vol_pct=50,is_poc=False,in_va=True)])
    payload.update(daily_vp=vp,weekly_vp=vp)
    if account == 'goldm15':
        payload.update(ea_guard=dict(baseline_verified=True,hard_lock=False,daily_lock=False,baseline=10000.,daily_buffer_usd=250.,daily_protected_buffer_usd=200.,hard_protected_floor_usd=9700.,hard_buffer_usd=300.,note='Fixture · Tagesbasis bestätigt, kein EA-Heartbeat'),
            exit_goals=[dict(slot=1,short_note='RSI Ausstiegsziel',short_value=3.,short_met=False,long_note='RSI Ausstiegsziel',long_value=2.,long_met=True)])
    return payload

def journal(account):
    return dict(account=account, journal=[dict(account=account, ticket=201 if account=='titan' else 202,
        status='CLOSED', type='BUY', volume=.1, open_price=4000., close_price=4010., current_price=4010.,
        profit_usd=100., net_profit_usd=95., points=10., time_ts=100, time_de='11:00', time_server='12:00',
        why_triggered='Fixture-Begründung', profit_goal='Fixture-Ziel', sl_price=3990., tp_price=0.)])

def measure_glyph_contrast(foreground, visible_png, hidden_png, rectangles=None, coverage_pngs=None, tolerance=1):
    """Measure visible text against paired background pixels, including antialiased coverage."""
    import io
    from PIL import Image
    visible = Image.open(io.BytesIO(visible_png)).convert('RGB')
    hidden = Image.open(io.BytesIO(hidden_png)).convert('RGB')
    if visible.size != hidden.size:
        raise ValueError('visible and hidden screenshots have different dimensions')
    coverage_images = [Image.open(io.BytesIO(png)).convert('RGB') for png in (coverage_pngs or [])]
    if any(mask.size != visible.size for mask in coverage_images):
        raise ValueError('glyph-mask and visible screenshots have different dimensions')
    def luminance(rgb):
        channels = [value / 255 for value in rgb]
        linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
        return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))
    foreground_luminance = luminance(foreground)
    visible_pixels = visible.get_flattened_data() if hasattr(visible, 'get_flattened_data') else visible.getdata()
    hidden_pixels = hidden.get_flattened_data() if hasattr(hidden, 'get_flattened_data') else hidden.getdata()
    coverage_pixels = [mask.get_flattened_data() if hasattr(mask, 'get_flattened_data') else mask.getdata()
                       for mask in coverage_images]
    if rectangles is None:
        rectangles = [(0, 0, visible.width, visible.height)]
    results = []
    for left, top, right, bottom in rectangles:
        ratios = []
        samples = []
        x0, y0 = max(0, int(left)), max(0, int(top))
        x1, y1 = min(visible.width, int(right + .999)), min(visible.height, int(bottom + .999))
        for y in range(y0, y1):
            for x in range(x0, x1):
                index = y * visible.width + x
                pixel, background = visible_pixels[index], hidden_pixels[index]
                coverage = None
                if len(coverage_pixels) >= 2:
                    sentinel_colors = ((255, 0, 255), (0, 255, 0))
                    estimates = []
                    for mask, sentinel in zip(coverage_pixels[:2], sentinel_colors):
                        for observed, base, source in zip(mask[index], background, sentinel):
                            denominator = source - base
                            if denominator:
                                estimate = (observed - base) / denominator
                                if 0 <= estimate <= 1.05:
                                    estimates.append(estimate)
                    if estimates:
                        coverage = sorted(estimates)[len(estimates) // 2]
                else:
                    glyph_covered = any(mask[index] != background for mask in coverage_pixels) if coverage_pixels else pixel != background
                    if glyph_covered and all(abs(channel - expected) <= tolerance for channel, expected in zip(pixel, foreground)):
                        coverage = 1.0
                if coverage is not None and coverage >= .2:
                    recovered = [base + (observed - base) / coverage
                                 for observed, base in zip(pixel, background)]
                    if all(abs(channel - expected) <= max(tolerance, 4) for channel, expected in zip(recovered, foreground)):
                        background_luminance = luminance(background)
                        ratio = ((max(foreground_luminance, background_luminance) + .05) /
                                 (min(foreground_luminance, background_luminance) + .05))
                        ratios.append(ratio)
                        samples.append((ratio, x, y, pixel, background, coverage, recovered))
        worst = min(samples) if samples else None
        results.append({'measured_glyph_pixels': len(ratios), 'minimum_ratio': min(ratios) if ratios else None,
                        'worst_sample': worst})
    return results

def probe_incomplete_text_target(page, selector, threshold=4.5):
    """Conservatively pixel-probe one unique DOM target; unsupported styles stay unresolved."""
    import re
    from playwright.sync_api import Error as PlaywrightError
    locator = page.locator(selector)
    count = locator.count()
    if count != 1:
        return {'classification': 'unresolved', 'reason': f'target matched {count} elements'}
    try:
        locator.evaluate('el=>el.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})')
        page.mouse.move(0, 0)
        info = locator.evaluate('''el => {
          const unsupported = new Set();
          const elements = [el, ...el.querySelectorAll('*')];
          const pseudos = elements.flatMap(node => ['::before','::after'].map(pseudo => getComputedStyle(node,pseudo).content));
          if (pseudos.some(content => !['none','normal','""',''].includes(content))) unsupported.add('generated pseudo content');
          const textNodes = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent.trim()) continue;
            const parent = node.parentElement;
            const style = getComputedStyle(parent);
            const chain = [];
            for (let current = parent; current; current = current.parentElement) chain.push(getComputedStyle(current));
            if (chain.reduce((value, item) => value * Number(item.opacity || 1), 1) < .999999) unsupported.add('element/ancestor opacity');
            if (chain.some(item => item.filter !== 'none' || item.backdropFilter !== 'none' || item.mixBlendMode !== 'normal' || item.transform !== 'none')) unsupported.add('filter/blend/transform effect');
            if (style.webkitTextStrokeWidth && style.webkitTextStrokeWidth !== '0px') unsupported.add('text stroke');
            const range = document.createRange(); range.selectNodeContents(node);
            const rects = [...range.getClientRects()].map(rect => ({left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}));
            textNodes.push({color:style.webkitTextFillColor || style.color, rects});
          }
          return {unsupported:[...unsupported],textNodes,rect:el.getBoundingClientRect().toJSON()};
        }''')
        if not info['textNodes']:
            return {'classification': 'non-text', 'reason': 'no rendered ordinary DOM text node'}
        if info['unsupported']:
            return {'classification': 'unresolved', 'reason': '; '.join(info['unsupported'])}
        parsed = []
        for text_node in info['textNodes']:
            match = re.fullmatch(r'rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)', text_node['color'])
            if not match or (match.group(4) is not None and float(match.group(4)) < .999999):
                return {'classification': 'unresolved', 'reason': f'unsupported foreground color: {text_node["color"]}'}
            rectangles = [(r['left']-info['rect']['left'], r['top']-info['rect']['top'],
                           r['right']-info['rect']['left'], r['bottom']-info['rect']['top']) for r in text_node['rects']]
            if not rectangles:
                return {'classification': 'non-text', 'reason': 'DOM text has no rendered fragments'}
            parsed.append((tuple(round(float(match.group(i))) for i in (1,2,3)), rectangles))
        visible_box = locator.bounding_box()
        if not visible_box:
            return {'classification': 'non-text', 'reason': 'target has no visible bounding box'}
        original_attr = locator.get_attribute('data-codex-contrast-probe')
        visible = locator.screenshot(animations='disabled', caret='hide', scale='css')
        page.evaluate('''() => {
          document.activeElement?.blur(); window.getSelection()?.removeAllRanges();
          const style=document.createElement('style'); style.dataset.codexContrastProbeStyle='1';
          style.textContent='[data-codex-contrast-probe="1"],[data-codex-contrast-probe="1"] *{-webkit-text-fill-color:transparent!important}';
          document.head.append(style);
        }''')
        locator.evaluate("el=>el.setAttribute('data-codex-contrast-probe','1')")
        try:
            hidden = locator.screenshot(animations='disabled', caret='hide', scale='css')
            hidden_box = locator.bounding_box()
            page.evaluate('''() => document.querySelector('style[data-codex-contrast-probe-style]').textContent=
              '[data-codex-contrast-probe="1"],[data-codex-contrast-probe="1"] *{-webkit-text-fill-color:rgb(255,0,255)!important}' ''')
            sentinel_magenta = locator.screenshot(animations='disabled', caret='hide', scale='css')
            page.evaluate('''() => document.querySelector('style[data-codex-contrast-probe-style]').textContent=
              '[data-codex-contrast-probe="1"],[data-codex-contrast-probe="1"] *{-webkit-text-fill-color:rgb(0,255,0)!important}' ''')
            sentinel_green = locator.screenshot(animations='disabled', caret='hide', scale='css')
        finally:
            locator.evaluate('''(el,hadValue) => {
              if(hadValue===null)el.removeAttribute('data-codex-contrast-probe');
              else el.setAttribute('data-codex-contrast-probe',hadValue);
            }''', original_attr)
            page.locator('style[data-codex-contrast-probe-style]').evaluate('el=>el.remove()')
        if not hidden_box or any(abs(visible_box[key]-hidden_box[key]) > .1 for key in ('x','y','width','height')):
            return {'classification': 'unresolved', 'reason': 'text hiding changed target geometry'}
        from PIL import Image
        import io
        size = Image.open(io.BytesIO(visible)).size
        coverage_sizes = [Image.open(io.BytesIO(png)).size for png in (sentinel_magenta, sentinel_green)]
        if any(mask_size != size for mask_size in coverage_sizes):
            return {'classification': 'unresolved',
                    'reason': 'contrast-probe screenshots changed dimensions during capture'}
        scale_x, scale_y = size[0] / visible_box['width'], size[1] / visible_box['height']
        if not (.5 <= scale_x <= 4 and .5 <= scale_y <= 4):
            return {'classification': 'unresolved', 'reason': 'screenshot has unsupported pixel scale'}
        measurements = []
        for foreground, rectangles in parsed:
            for rect in rectangles:
                scaled_rect = (rect[0]*scale_x, rect[1]*scale_y, rect[2]*scale_x, rect[3]*scale_y)
                result = measure_glyph_contrast(foreground, visible, hidden, [scaled_rect],
                    coverage_pngs=[sentinel_magenta, sentinel_green])[0]
                if not result['measured_glyph_pixels']:
                    return {'classification': 'unresolved', 'reason': 'no measurable glyph coverage found'}
                measurements.append(result)
        minimum = min(item['minimum_ratio'] for item in measurements)
        return {'classification': 'measured', 'foregroundColors': [list(color) for color, _ in parsed],
                'fragments': len(measurements),
                'measuredGlyphPixels': sum(item['measured_glyph_pixels'] for item in measurements),
                'minimumRatio': minimum, 'worstSample': min(measurements, key=lambda item:item['minimum_ratio'])['worst_sample'],
                'threshold': threshold,
                'result': 'pass' if minimum >= threshold else 'fail'}
    except PlaywrightError as exc:
        return {'classification': 'unresolved', 'reason': f'browser probe failed: {str(exc).splitlines()[0]}'}

class FixtureHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == '/':
            tree = ast.parse((ROOT / 'app.py').read_text(encoding='utf-8'))
            html = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'HTML_CONTENT' for t in n.targets))
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
            self.wfile.write(html.encode('utf-8'))
        elif urlparse(self.path).path.startswith('/api/'):
            self.send_error(500, 'UNINTERCEPTED API: fail closed')
        else:
            super().do_GET()
    def do_POST(self):
        self.send_error(405, 'No backend mutations in fixture server')
    def log_message(self, *_):
        pass

class DashboardFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(FixtureHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
    def setUp(self):
        self.context = self.browser.new_context(viewport=dict(width=1200, height=900), reduced_motion='reduce')
        self.page = self.context.new_page()
        self.errors = []; self.mutations = []; self.requests = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.trace_enabled = os.environ.get('AUDIT_UI_TRACE') == '1'
        if self.trace_enabled:
            self.context.tracing.start(screenshots=True, snapshots=True, sources=False)
        self.page.on('dialog', lambda dialog: dialog.dismiss())
        self.account_failures = 0; self.journal_fail = False; self.status_fail = False
        self.candle_fail = False
        self.candle_rows = []
        self.candle_mismatch_symbol = None
        self.marketplace_mode = False
        self.page.route('**/api/**', self.api)
    def tearDown(self):
        if self.trace_enabled:
            self.context.tracing.stop(path=str(OUTPUT/(self._testMethodName+'.zip')))
        (OUTPUT/(self._testMethodName+'.network.json')).write_text(json.dumps(dict(requests=self.requests,mutations=self.mutations,errors=self.errors),ensure_ascii=False,indent=2),encoding='utf-8')
        self.context.close()
    def api(self, route):
        request = route.request; parsed = urlparse(request.url); self.requests.append(request.url)
        account = parse_qs(parsed.query).get('account', ['titan'])[0]
        if request.method not in ('GET', 'HEAD'):
            self.mutations.append(dict(url=request.url, body=request.post_data, headers=request.headers))
            route.fulfill(json=dict(success=True, message='INTERCEPTED · NOT SENT TO MT5')); return
        if parsed.path == '/api/accounts':
            if self.account_failures:
                self.account_failures -= 1; route.fulfill(status=503, json=dict(detail='fixture bootstrap failure')); return
            route.fulfill(json=dict(accounts=list(ACCOUNTS.values()), default='titan', csrf_token='fixture-csrf')); return
        if parsed.path == '/api/control_session':
            route.fulfill(json=dict(csrf_token='fixture-control-csrf', control_enabled=True)); return
        if parsed.path == '/api/status':
            payload = status(account)
            if account == 'titan' and self.marketplace_mode:
                payload.update(analysis_mode='INDICATORS_ONLY', signal_mode='INDICATORS_ONLY',
                    trend_name='Nur klassische Indikatoren', trend_direction=None,
                    trend_diagnosis='EA-Strategie unbekannt · EMA/RSI sind reine Marktindikatoren',
                    sell_readiness=None, buy_readiness=None, sell_met_count=0, buy_met_count=0,
                    rule_count=0, rules_matrix=[])
                payload['account']['analysis_mode'] = 'INDICATORS_ONLY'
            route.fulfill(status=503 if self.status_fail else 200, json=dict(detail='fixture status failure') if self.status_fail else payload); return
        if parsed.path == '/api/journal_summary':
            route.fulfill(status=503 if self.journal_fail else 200, json=dict(detail='fixture journal failure') if self.journal_fail else journal(account)); return
        if parsed.path == '/api/candles':
            query=parse_qs(parsed.query); symbol=query.get('symbol',['XAUUSD'])[0]; tf=query.get('tf',['M15'])[0]
            payload=dict(account=ACCOUNTS[account],accountId=account,symbol=symbol,timeframe=tf,source='MT5_VERIFIED',canExecute=False,candles=copy.deepcopy(self.candle_rows),ema20=[],ema50=[],ema200=[],markers=[],sr_levels={})
            if symbol == self.candle_mismatch_symbol: payload['symbol']='GBPUSD'
            route.fulfill(status=503 if self.candle_fail else 200, json=dict(detail='fixture candle failure') if self.candle_fail else payload); return
        if parsed.path == '/api/chart/v1/symbols':
            query=parse_qs(parsed.query).get('q',[''])[0].casefold()
            symbols=[dict(account=account,symbol=symbol,source='MT5_VERIFIED',canExecute=False) for symbol in ('XAUUSD','EURUSD') if query in symbol.casefold()]
            route.fulfill(json=dict(account=account,source='MT5_VERIFIED',canExecute=False,symbols=symbols,limit=200,truncated=False)); return
        if parsed.path == '/api/chart/v1/positions':
            symbol=parse_qs(parsed.query).get('symbol',['XAUUSD'])[0]
            route.fulfill(json=dict(account=account,symbol=symbol,source='MT5_VERIFIED',canExecute=False,currency='USD',marginMode=2,positions=[],orders=[])); return
        route.fulfill(status=404, json=dict(detail='unexpected fixture API'))
    def load(self):
        self.page.goto(self.url)
        expect(self.page.locator('#account-connection')).to_contain_text('LIVE', timeout=10000)
    def test_marketplace_account_shows_indicators_without_strategy_readiness(self):
        self.marketplace_mode = True
        self.load()
        expect(self.page.locator('#short-missing-text')).to_contain_text('EA-Strategie unbekannt')
        expect(self.page.locator('#sell-pct')).to_have_text('Nicht verfügbar')
        expect(self.page.locator('#buy-pct')).to_have_text('Nicht verfügbar')
        expect(self.page.locator('#matrix-tbody')).to_contain_text('Keine Signalrekonstruktion')
        self.assertEqual(self.errors, [])
        self.assertEqual(self.mutations, [])
    def test_dialog_keyboard_focus_escape_returns_to_trigger(self):
        self.load()
        trigger = self.page.locator('#dd-reset-button'); trigger.click()
        modal = self.page.locator('#dd-reset-modal')
        expect(modal).to_have_attribute('role', 'dialog')
        expect(modal).to_have_attribute('aria-modal', 'true')
        expect(self.page.locator('#dd-reset-input')).to_be_focused()
        self.page.keyboard.press('Shift+Tab')
        self.assertTrue(self.page.evaluate("document.activeElement.closest('#dd-reset-modal') !== null"))
        self.page.keyboard.press('Escape')
        expect(modal).to_be_hidden(); expect(trigger).to_be_focused()
        self.assertEqual(self.mutations, [])
        self.assertEqual(self.errors, [])

    def test_verified_broker_symbol_changes_chart_candle_feed(self):
        self.load()
        self.page.locator('#cs-beta-toggle').click()
        self.page.locator('.cs-broker-read-panel > summary').click()
        selector=self.page.locator('#cs-broker-symbol')
        expect(selector).to_have_value('XAUUSD',timeout=10000)
        selector.select_option('EURUSD')
        expect(self.page.locator('#chart-title-text')).to_have_text('EURUSD M15 Chart',timeout=10000)
        expect(self.page.locator('#account-detail')).to_contain_text('EURUSD / M15')
        candle_urls=[url for url in self.requests if '/api/candles?' in url]
        self.assertTrue(any(parse_qs(urlparse(url).query).get('symbol')==['EURUSD'] for url in candle_urls),candle_urls)
        self.assertEqual(self.page.evaluate('ChartStudioBeta.getState().symbol'),'EURUSD')
        self.page.locator('#cs-broker-symbol-search').fill('XAUUSD')
        self.page.locator('#cs-broker-symbol-search-button').click()
        expect(selector).to_have_value('EURUSD',timeout=10000)
        expect(self.page.locator('#chart-title-text')).to_have_text('EURUSD M15 Chart')
        self.page.locator('#tf-btn-M5').click()
        expect(self.page.locator('#chart-title-text')).to_have_text('EURUSD M5 Chart',timeout=10000)
        expect(self.page.locator('#account-detail')).to_contain_text('EURUSD / M5')
        self.assertEqual(self.mutations,[])
    def test_mismatched_symbol_candle_response_is_rejected_after_old_feed_clears(self):
        self.candle_rows=[
            dict(time=1791918000,open=4000.,high=4002.,low=3998.,close=4001.,tick_volume=10,real_volume=0),
            dict(time=1791918900,open=4001.,high=4003.,low=3999.,close=4002.,tick_volume=11,real_volume=0),
        ]
        self.candle_mismatch_symbol='EURUSD'
        self.load()
        self.page.evaluate("""() => {
          const rows=[
            {time:1791918000,open:4000,high:4002,low:3998,close:4001},
            {time:1791918900,open:4001,high:4003,low:3999,close:4002}
          ];
          const series=document.querySelector('#tv-chart').__candleSeries;
          series.setData(rows);
          const original=series.setData.bind(series);
          window.__candleSetDataLengths=[];
          series.setData=items=>{window.__candleSetDataLengths.push(items.length);return original(items)};
        }""")
        self.page.locator('#cs-beta-toggle').click()
        self.page.locator('.cs-broker-read-panel > summary').click()
        self.page.locator('#cs-broker-symbol').select_option('EURUSD')
        expect(self.page.locator('#chart-title-text')).to_have_text('EURUSD M15 Chart',timeout=10000)
        self.page.wait_for_function("window.__candleSetDataLengths.length >= 1",timeout=10000)
        self.assertTrue(self.page.evaluate('window.__candleSetDataLengths.length > 0 && window.__candleSetDataLengths.every(size => size === 0)'),
            "The prior feed is cleared and mismatched response candles are never applied")
        self.assertEqual(self.page.evaluate('ChartStudioBeta.getState().symbol'),'EURUSD')
        self.assertEqual(self.mutations,[])
        self.assertEqual(self.errors,[])
    def test_reset_invalid_baseline_never_posts(self):
        self.load(); self.page.locator('#dd-reset-button').click()
        self.page.locator('#dd-reset-input').fill('-100')
        self.page.evaluate('executeDrawdownReset()')
        self.page.wait_for_timeout(150)
        self.assertEqual(self.mutations, [])
        expect(self.page.locator('#dd-reset-error')).to_contain_text('positiv')
        expect(self.page.locator('#dd-reset-input')).to_have_attribute('aria-invalid', 'true')
        self.assertEqual(self.errors, [])
    def test_mutation_obtains_same_origin_control_session(self):
        self.load()
        self.page.evaluate("accountFetch('/api/modify_position', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:101,sl_usd:-30,tp_usd:0})})")
        self.assertEqual(len(self.mutations), 1)
        self.assertEqual(self.mutations[0]['headers'].get('x-dashboard-csrf'), 'fixture-control-csrf')
        self.assertTrue(any('/api/control_session' in request for request in self.requests))
    def test_hung_status_expires_without_losing_last_good(self):
        self.load()
        self.page.evaluate("""() => {
          const realFetch = window.fetch;
          window.fetch = (url, options) => {
            if (String(url).includes('/api/status')) {
              window.hungStatusStarted = true;
              return new Promise(() => {});
            }
            return realFetch(url, options);
          };
          void updateStatus();
        }""")
        self.page.wait_for_function('window.hungStatusStarted === true')
        expect(self.page.locator('#account-connection')).to_contain_text('STALE', timeout=7500)
        self.assertIsNone(self.page.evaluate('statusBusy'))
        expect(self.page.locator('#live-bid')).to_have_text('4010.00')
        expect(self.page.locator('#dd-reset-button')).to_be_disabled()
        self.assertTrue(self.page.evaluate("[...document.querySelectorAll('#positions-list button')].every(b=>b.disabled)"))
        result = self.page.evaluate("accountFetch('/api/close_position', {method:'POST'}).then(()=>false,()=>true)")
        self.assertTrue(result); self.assertEqual(self.mutations, [])
    def test_bootstrap_recovers_complete_features_without_reload(self):
        self.account_failures = 1; self.load()
        self.assertEqual(self.page.evaluate('Object.keys(accounts).sort()'), ['goldm15', 'titan'])
        expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        self.assertEqual(self.errors, [])
    def test_journal_failure_keeps_last_good_but_total_unknown(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.journal_fail = True; self.page.evaluate('refreshJournal()')
        expect(self.page.locator('#journal-total-pnl')).to_have_text('Gesamt: — (unvollständig)')
        expect(self.page.locator('#journal-list')).to_contain_text('$4000.00')
        expect(self.page.locator('#journal-sync-status')).to_contain_text('unvollständig')
        self.journal_fail = False; self.page.evaluate('refreshJournal()')
        expect(self.page.locator('#journal-total-pnl')).not_to_contain_text('unvollständig')
    def test_position_ticket_draft_focus_survives_structure_and_account_switch(self):
        self.load(); field = self.page.locator('#sl-input-101'); field.fill('-37.00')
        self.page.evaluate("window.originalInput = document.getElementById('sl-input-101')")
        self.page.evaluate("renderPositions([...currentData.positions,{...currentData.positions[0],ticket:102}])")
        expect(field).to_have_value('-37.00'); expect(field).to_be_focused()
        self.assertTrue(self.page.evaluate("originalInput === document.getElementById('sl-input-101')"))
        self.page.evaluate("renderPositions([{...currentData.positions[0],ticket:102},{...currentData.positions[0],volume:0.05}])")
        expect(field).to_have_value('-37.00'); expect(field).to_be_focused()
        expect(self.page.locator('[data-position-ticket="101"]')).to_contain_text('0.05 Lot')
        self.page.evaluate('renderPositions(currentData.positions)')
        expect(field).to_have_value('-37.00'); expect(field).to_be_focused()
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        expect(field).to_have_value('-30.00')
        self.page.locator('[data-account="titan"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53087839')
        expect(field).to_have_value('-37.00')
        expect(self.page.locator('[data-position-ticket="101"]')).to_contain_text('Entwurf')
    def test_position_fields_have_ticket_unit_labels_and_explicit_actions(self):
        self.load()
        expect(self.page.get_by_label('SL Ziel-P/L in USD · Marketplace XAUUSD 5 minute · Ticket 101')).to_have_value('-30.00')
        expect(self.page.get_by_label('TP Ziel-P/L in USD · Marketplace XAUUSD 5 minute · Ticket 101')).to_have_value('0.00')
        expect(self.page.locator('[data-position-ticket="101"]')).to_contain_text('Kein fixer TP')
        expect(self.page.get_by_role('button', name='SL und TP an MT5 senden · Ticket 101')).to_have_count(1)
        expect(self.page.get_by_role('button', name='SL sofort +5 USD')).to_have_count(1)
    def test_header_reflow_and_matrix_keyboard_scroll_all_themes(self):
        self.load()
        for theme in ['dark', 'light', 'stone']:
            self.page.locator('.stone-theme-dock [data-mode="'+theme+'"]').click()
            for width in [320, 390, 768]:
                with self.subTest(theme=theme, width=width):
                    self.page.set_viewport_size(dict(width=width, height=900))
                    bounds = self.page.evaluate("""() => [...document.querySelectorAll('header button,header #bar-countdown,header #dd-buffer,header #time-server,header #time-german')].map(el=>({id:el.id||el.textContent,r:el.getBoundingClientRect().right,l:el.getBoundingClientRect().left}))""")
                    self.assertTrue(all(b['r']<=width and b['l']>=0 for b in bounds), bounds)
                    self.assertGreaterEqual(self.page.locator('#bar-countdown').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)'), 20)
                    scroll = self.page.locator('#matrix-scroll')
                    expect(scroll).to_have_attribute('tabindex', '0')
                    expect(self.page.locator('#matrix-scroll-hint')).to_contain_text('horizontal')
                    scroll.focus(); self.page.keyboard.press('End')
                    self.assertTrue(scroll.evaluate('el=>el.scrollLeft >= el.scrollWidth-el.clientWidth-2'))
                    scroll.evaluate('el=>el.scrollLeft=0')
                    self.page.locator('header').screenshot(path=str(OUTPUT/f'{theme}-{width}-header.png'))
                    self.page.locator('#matrix-scroll').screenshot(path=str(OUTPUT/f'{theme}-{width}-matrix.png'))
                    self.page.locator('#matrix-scroll').evaluate('el=>el.scrollLeft=el.scrollWidth')
                    self.page.locator('#matrix-scroll').screenshot(path=str(OUTPUT/f'{theme}-{width}-matrix-end.png'))
                    scroll.evaluate('el=>el.scrollLeft=0')
                    self.assertEqual(self.page.locator('#sl-input-101').evaluate('el=>el.getBoundingClientRect().width >= 110 && el.getBoundingClientRect().height >= 44'), True)
        self.assertEqual(self.errors, [])
    def test_diagnostic_theme_classes_survive_ten_updates(self):
        self.load()
        for _ in range(10): self.page.evaluate('updateStatus()')
        expect(self.page.locator('#diagnose-card')).to_have_class(__import__('re').compile(r'.*stone-asset-panel--diagnostic.*'))
        expect(self.page.locator('#diagnose-card')).to_have_class(__import__('re').compile(r'.*dashboard-panel.*'))
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        expect(self.page.locator('#diagnose-card')).to_have_class(__import__('re').compile(r'.*stone-asset-panel--diagnostic.*'))
    def test_nonchart_contrast_all_themes(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.evaluate('''async () => {
          await document.fonts.ready; document.activeElement?.blur(); window.getSelection()?.removeAllRanges();
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
          document.body.classList.add('stone-fx-off');
          const style=document.createElement('style');style.dataset.axeVisualFreeze='1';
          style.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
          document.head.append(style);
        }''')
        self.page.add_script_tag(path=str(ROOT/'tests/vendor/axe.min.js'))
        reports = {}
        pixel_audit = {}
        for theme in ['dark', 'light', 'stone']:
            self.page.locator('.stone-theme-dock [data-mode="'+theme+'"]').click()
            self.page.locator('#matrix-scroll').evaluate('el=>el.scrollLeft=el.scrollWidth')
            self.page.locator('#journal-list details').evaluate_all('elements=>elements.forEach(el=>el.open=true)')
            reports[theme] = self.page.evaluate('''async () => {
              const result = await axe.run({include:[['nav[aria-label="Konto und Strategie"]'],['header'],['.dashboard-panel']]}, {runOnly:['color-contrast']});
              return {violations:result.violations,incomplete:result.incomplete};
            }''')
            pixel_audit[theme] = [
                dict(rule=check.get('id'), target=node.get('target', []),
                     classification='unresolved',
                     reasons=[item.get('message', '') for item in node.get('any', []) + node.get('all', []) + node.get('none', [])])
                for check in reports[theme]['incomplete'] for node in check.get('nodes', [])]
            for item in pixel_audit[theme]:
                targets = item['target']
                if len(targets) != 1:
                    item['probe'] = {'classification':'unresolved','reason':'Axe target has multiple selector steps'}
                    continue
                item['probe'] = probe_incomplete_text_target(self.page, targets[0])
                item['classification'] = item['probe']['classification']
            self.assertEqual(self.page.locator('[data-codex-contrast-probe="1"]').count(), 0,
                             'pixel probe leaked its temporary target attribute')
            self.assertEqual(self.page.locator('style[data-codex-contrast-probe-style]').count(), 0,
                             'pixel probe leaked its temporary stylesheet')
            self.page.locator('#journal-list').screenshot(path=str(OUTPUT/f'{theme}-journal.png'))
        (OUTPUT/'contrast.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
        audit_path = OUTPUT/'axe-incomplete-pixel.json'
        pixel_audit_summary = {theme:dict(total=len(items),
            measured=sum(item['classification']=='measured' for item in items),
            unresolved=sum(item['classification']=='unresolved' for item in items),
            non_text=sum(item['classification']=='non-text' for item in items))
            for theme,items in pixel_audit.items()}
        audit_path.write_text(json.dumps(dict(projectThreshold=4.5, method='paired sentinel antialias-reconstructed glyph probe',
            measurementStatus='per-target; unsupported cases remain unresolved', summary=pixel_audit_summary,
            themes=pixel_audit),
            ensure_ascii=False, indent=2), encoding='utf-8')
        for theme, report in reports.items():
            with self.subTest(theme=theme):
                self.assertEqual([n['target'] for v in report['violations'] for n in v['nodes']], [])
                self.assertEqual(len(pixel_audit[theme]), sum(len(v.get('nodes', [])) for v in report['incomplete']))
                failed_measurements = [item for item in pixel_audit[theme]
                    if item.get('probe', {}).get('result') == 'fail']
                self.assertEqual(failed_measurements, [], f'project 4.5:1 threshold failures: {failed_measurements}')
    def test_contrast_text_fill_probe_preserves_currentcolor_pseudo_background(self):
        self.load()
        self.page.set_content('<!doctype html><html><body style="margin:0;background:#fff"></body></html>')
        self.page.evaluate('''() => {
          const fixture = document.createElement('div');
          fixture.id = 'contrast-probe-fixture';
          fixture.innerHTML = '<span id="contrast-probe-text">visible text</span>';
          fixture.style.cssText = 'position:fixed;left:10px;top:10px;color:rgb(230, 180, 20);background:rgb(20, 24, 30);padding:8px';
          const style = document.createElement('style');
          style.textContent = '#contrast-probe-text::before{content:"pseudo label";display:inline-block;background:currentColor;color:rgb(20,24,30);padding:2px}';
          document.head.append(style); document.body.append(fixture);
        }''')
        before = self.page.locator('#contrast-probe-text').evaluate('''el => ({
          color:getComputedStyle(el).color,
          pseudoColor:getComputedStyle(el,'::before').color,
          pseudoBackground:getComputedStyle(el,'::before').backgroundColor,
          pseudoContent:getComputedStyle(el,'::before').content
        })''')
        self.page.locator('#contrast-probe-text').evaluate("el=>el.style.setProperty('-webkit-text-fill-color','transparent','important')")
        after = self.page.locator('#contrast-probe-text').evaluate('''el => ({
          color:getComputedStyle(el).color,
          pseudoColor:getComputedStyle(el,'::before').color,
          pseudoBackground:getComputedStyle(el,'::before').backgroundColor,
          pseudoContent:getComputedStyle(el,'::before').content
        })''')
        self.assertEqual(after, before)
        self.assertEqual(after['color'], 'rgb(230, 180, 20)')
        self.assertEqual(after['pseudoBackground'], after['pseudoColor'])
        self.assertIn('pseudo label', after['pseudoContent'])
        self.page.evaluate('''() => {
          const target=document.createElement('div');target.id='contrast-probe-cleanup-fixture';
          target.textContent='opaque text';target.style.cssText='position:fixed;left:10px;top:80px;width:160px;padding:2px;font:24px Arial;color:#000;background:#fff;text-shadow:none!important;filter:none!important';
          document.body.append(target);
        }''')
        result = probe_incomplete_text_target(self.page, '#contrast-probe-cleanup-fixture')
        self.assertEqual(result['classification'], 'measured', result)
        self.assertEqual(result['result'], 'pass', result)
        self.assertEqual(self.page.locator('[data-codex-contrast-probe="1"]').count(), 0)
        self.assertEqual(self.page.locator('style[data-codex-contrast-probe-style]').count(), 0)
        self.assertEqual(self.mutations, [])
    def test_paired_pixel_probe_measures_known_gradient_contrast(self):
        import re
        self.load()
        self.page.evaluate('''() => {
          const fixture = document.createElement('div'); fixture.id = 'contrast-pixel-fixture';
          fixture.style.cssText = 'position:fixed;left:10px;top:10px;display:grid;gap:8px;z-index:2147483647';
          fixture.innerHTML = '<span id="contrast-high" style="display:inline-block;padding:4px;font:40px Arial;color:rgb(0,0,0);background:linear-gradient(90deg,rgb(255,255,255),rgb(238,238,238))">HIGH</span>' +
            '<span id="contrast-low" style="display:inline-block;padding:4px;font:40px Arial;color:rgb(119,119,119);background:rgb(136,136,136)">LOW</span>' +
            '<span id="contrast-equal" style="display:inline-block;padding:4px;font:40px Arial;color:rgb(0,0,0);background:linear-gradient(90deg,rgb(255,255,255) 0 12px,rgb(0,0,0) 12px 30px,rgb(255,255,255) 30px 100%)">HIGH</span>';
          document.body.append(fixture);
        }''')
        for selector, should_pass in [('#contrast-high', True), ('#contrast-low', False)]:
            element = self.page.locator(selector)
            foreground = [int(value) for value in re.findall(r'[\d.]+', element.evaluate('el=>getComputedStyle(el).color'))[:3]]
            visible = element.screenshot()
            element.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','transparent','important')")
            hidden = element.screenshot()
            element.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','rgb(255,0,255)','important')")
            mask_magenta = element.screenshot()
            element.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','rgb(0,255,0)','important')")
            mask_green = element.screenshot()
            element.evaluate("el=>el.style.removeProperty('-webkit-text-fill-color')")
            result = measure_glyph_contrast(foreground, visible, hidden,
                coverage_pngs=[mask_magenta, mask_green])[0]
            self.assertGreater(result['measured_glyph_pixels'], 0, (selector, result))
            self.assertEqual(result['minimum_ratio'] >= 4.5, should_pass, (selector, result))
        equal = self.page.locator('#contrast-equal')
        foreground = [0, 0, 0]
        visible = equal.screenshot()
        equal.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','transparent','important')")
        hidden = equal.screenshot()
        equal.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','rgb(255,0,255)','important')")
        mask_magenta = equal.screenshot()
        equal.evaluate("el=>el.style.setProperty('-webkit-text-fill-color','rgb(0,255,0)','important')")
        mask_green = equal.screenshot()
        equal.evaluate("el=>el.style.removeProperty('-webkit-text-fill-color')")
        result = measure_glyph_contrast(foreground, visible, hidden,
            coverage_pngs=[mask_magenta, mask_green])[0]
        self.assertEqual(result['minimum_ratio'], 1.0, ('foreground-matching background strip was omitted', result))
        self.assertEqual(self.mutations, [])
    def test_paired_pixel_probe_recovers_antialiased_glyph_coverage(self):
        from PIL import Image
        import io
        def png(rgb):
            image = Image.new('RGB', (1, 1), rgb)
            result = io.BytesIO(); image.save(result, format='PNG'); return result.getvalue()
        background = (0, 0, 0)
        foreground = (140, 140, 140)
        # Each sentinel is alpha-composited over black at 50% glyph coverage.
        visible = png((70, 70, 70))
        hidden = png(background)
        magenta = png((128, 0, 128))
        green = png((0, 128, 0))
        result = measure_glyph_contrast(foreground, visible, hidden,
            coverage_pngs=[magenta, green])[0]
        self.assertGreater(result['measured_glyph_pixels'], 0, result)
        self.assertAlmostEqual(result['minimum_ratio'], 6.25, delta=.05, msg=str(result))
    def test_journal_keyed_rows_and_expanded_details_survive_poll(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.evaluate("window.firstJournalRow = document.querySelector('[data-journal-key]'); window.rowChanges = 0; new MutationObserver(ms=>{window.rowChanges += ms.length}).observe(document.getElementById('journal-list'),{childList:true})")
        self.page.evaluate('refreshJournal()')
        self.assertEqual(self.page.evaluate('rowChanges'), 0)
        row = self.page.locator('[data-journal-key="titan:201:CLOSED"]')
        row.locator('summary').click()
        expect(row.locator('details')).to_have_attribute('open', '')
        self.page.evaluate("journalEntriesByAccount.titan[0].profit_usd = 110; renderJournal()")
        self.assertTrue(self.page.evaluate("firstJournalRow === document.querySelector('[data-journal-key]')"))
        expect(row.locator('details')).to_have_attribute('open', '')
        expect(row).to_contain_text('+$110.00')
        expect(row).to_contain_text('Fixture-Begründung')
    def test_nonchart_motion_respects_reduced_off_and_visibility(self):
        self.load()
        dot = self.page.locator('header .animate-pulse')
        self.assertEqual(dot.evaluate('el=>getComputedStyle(el).animationName'), 'none')
        self.page.emulate_media(reduced_motion='no-preference')
        self.page.get_by_label('Nicht-Chart-Dekoration').select_option('full')
        # This tests IntersectionObserver/motion, not pointer actionability.
        # Native scrolling works while decoration/layout is still animating.
        self.page.locator('header').evaluate("el=>el.scrollIntoView({block:'start',behavior:'instant'})")
        expect(self.page.locator('header')).to_have_attribute('data-ui-visible', 'true')
        self.assertNotEqual(dot.evaluate('el=>getComputedStyle(el).animationName'), 'none')
        self.page.get_by_label('Nicht-Chart-Dekoration').select_option('off')
        self.assertEqual(dot.evaluate('el=>getComputedStyle(el).animationName'), 'none')
        self.page.get_by_label('Nicht-Chart-Dekoration').select_option('full')
        self.page.locator('#journal-list').evaluate("el=>el.scrollIntoView({block:'start',behavior:'instant'})")
        expect(self.page.locator('header')).to_have_attribute('data-ui-visible', 'false')
        self.assertEqual(dot.evaluate('el=>getComputedStyle(el).animationPlayState'), 'paused')
        self.assertEqual(self.errors, [])
        self.assertEqual(self.mutations, [])
    def test_stale_status_recovery_is_automatic(self):
        self.load(); self.status_fail = True; self.page.evaluate('updateStatus()')
        expect(self.page.locator('#account-connection')).to_contain_text('STALE')
        expect(self.page.locator('#sl-input-101')).to_have_value('-30.00')
        expect(self.page.locator('#dd-reset-button')).to_be_disabled()
        self.status_fail = False
        expect(self.page.locator('#account-connection')).to_contain_text('LIVE', timeout=5000)
        expect(self.page.locator('#dd-reset-button')).to_be_enabled()
    def test_independent_candle_failure_does_not_clear_account(self):
        self.load(); self.candle_fail = True; self.page.evaluate('loadCandles()')
        expect(self.page.locator('#account-connection')).to_contain_text('LIVE')
        expect(self.page.locator('#live-bid')).to_have_text('4010.00')
        expect(self.page.locator('#dd-reset-button')).to_be_enabled()
    def test_hidden_nonchart_polls_pause_then_refresh(self):
        self.load()
        self.page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))")
        self.requests.clear(); self.page.wait_for_timeout(3200)
        self.assertFalse(any('/api/status' in url or '/api/journal_summary' in url for url in self.requests))
        self.page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
        expect(self.page.locator('#account-connection')).to_contain_text('LIVE')
        self.assertTrue(any('/api/status' in url for url in self.requests))
    def test_initial_journal_failure_is_unknown_not_zero(self):
        self.journal_fail = True; self.load()
        expect(self.page.locator('#journal-total-pnl')).to_have_text('Gesamt: — (unvollständig)')
        expect(self.page.locator('#journal-count-badge')).to_contain_text('—')
    def test_late_old_account_response_cannot_overwrite_new_account(self):
        self.load()
        self.page.evaluate('''() => {
          const original = window.fetch;
          window.fetch = (url, options) => String(url).includes('/api/status') && String(url).includes('account=titan')
            ? new Promise(resolve => {window.lateResponse=()=>resolve({ok:true,status:200,json:async()=>({...currentData,account:{...accounts.titan},bid:9999})})}) : original(url,options);
          void updateStatus();
        }''')
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        self.page.evaluate('lateResponse()'); self.page.wait_for_timeout(100)
        expect(self.page.locator('#live-bid')).to_have_text('4010.00')
        self.assertEqual(self.page.evaluate('currentData.account.id'), 'goldm15')
    def test_empty_position_list_announces_lost_unsent_draft(self):
        self.load(); self.page.locator('#sl-input-101').fill('-37.00')
        self.page.evaluate('renderPositions([])')
        expect(self.page.locator('#position-edit-status')).to_contain_text('Entwurf')
        self.assertFalse(self.page.evaluate("positionDrafts.has('titan:sl-input-101')"))
    def test_loaded_journal_has_no_loading_text_nodes(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        expect(self.page.locator('#journal-list')).not_to_contain_text('werden für')
    def test_position_invalid_numeric_draft_never_posts(self):
        self.load(); self.page.locator('#sl-input-101').fill('')
        self.page.evaluate('applySLTP(101)')
        self.assertEqual(self.mutations, [])
        expect(self.page.locator('#position-edit-status')).to_contain_text('Zahl')
    def test_texture_contrast_probe_on_actual_pixels(self):
        import io
        from PIL import Image
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        reports = []
        for theme in ['dark','light','stone']:
            self.page.locator('.stone-theme-dock [data-mode="'+theme+'"]').click()
            for selector in ['#live-bid','#live-ask','#dd-pct','#dd-buffer','#bar-countdown','#time-server','#time-german','#journal-list strong.text-white']:
                elements = self.page.locator(selector)
                for i in range(elements.count()):
                    element = elements.nth(i); element.scroll_into_view_if_needed()
                    color = element.evaluate('el=>getComputedStyle(el).color')
                    rgb = [int(float(n)) for n in __import__('re').findall(r'[\d.]+',color)[:3]]
                    element.evaluate("el=>{el.dataset.savedStyle=el.getAttribute('style')||''; el.style.setProperty('color','transparent','important'); el.style.setProperty('text-shadow','none','important')}")
                    image = Image.open(io.BytesIO(element.screenshot())).convert('RGB')
                    element.evaluate("el=>{el.setAttribute('style',el.dataset.savedStyle);delete el.dataset.savedStyle}")
                    def lum(pixel):
                        values = [c/255 for c in pixel]
                        values = [c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in values]
                        return sum(c*w for c,w in zip(values,[.2126,.7152,.0722]))
                    foreground = lum(rgb)
                    pixels = image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()
                    ratios = [(max(foreground,lum(pixel))+.05)/(min(foreground,lum(pixel))+.05) for pixel in pixels]
                    minimum = min(ratios)
                    reports.append(dict(theme=theme,selector=selector,index=i,minimum=minimum))
                    self.assertGreaterEqual(minimum,4.5,(theme,selector,minimum))
        (OUTPUT/'texture-contrast.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
    def test_position_send_does_not_clear_newer_draft(self):
        self.load()
        self.page.locator('#sl-input-101').fill('-37.00')
        self.page.evaluate('''() => {
          const original = window.fetch;
          window.fetch = (url, options) => String(url).includes('/api/modify_position')
            ? new Promise(resolve=>{window.finishSend=()=>resolve({ok:true,status:200,json:async()=>({success:true})})}) : original(url,options);
          void applySLTP(101);
        }''')
        self.page.wait_for_function('typeof window.finishSend === "function"')
        self.page.locator('#sl-input-101').fill('-42.00')
        self.page.evaluate('finishSend()'); self.page.wait_for_timeout(150)
        expect(self.page.locator('#sl-input-101')).to_have_value('-42.00')
        self.assertTrue(self.page.evaluate("positionDrafts.get('titan:sl-input-101') === '-42.00'"))
    def test_successful_send_clears_only_sent_draft_indicator(self):
        self.load(); self.page.locator('#sl-input-101').fill('-37.00')
        self.page.evaluate('applySLTP(101)')
        expect(self.page.locator('[data-position-ticket="101"] [data-draft-note]')).to_be_hidden()
        self.assertFalse(self.page.evaluate("positionDrafts.has('titan:sl-input-101')"))
    def test_nonchart_progress_and_status_indicators_keep_semantic_colors(self):
        self.load()
        self.assertNotEqual(self.page.locator('#buy-bar').evaluate('el=>getComputedStyle(el).backgroundColor'), self.page.locator('#sell-bar').evaluate('el=>getComputedStyle(el).backgroundColor'))
        self.assertNotEqual(self.page.locator('#dd-dot').evaluate('el=>getComputedStyle(el).backgroundColor'), self.page.locator('#dd-badge').evaluate('el=>getComputedStyle(el).backgroundColor'))
    def test_hung_optional_feature_does_not_block_bootstrap_completion(self):
        self.context.add_init_script('''const nativeFetch=window.fetch; window.fetch=(url,options)=>String(url).includes('/api/candles')?new Promise(()=>{}):nativeFetch(url,options);''')
        self.load()
        self.page.wait_for_function('bootstrapBusy === false', timeout=7000)
        self.status_fail = True
        expect(self.page.locator('#account-connection')).to_contain_text('STALE', timeout=5000)
    def test_dialog_reflow_and_keyboard_trap_at_320(self):
        self.load(); self.page.set_viewport_size(dict(width=320,height=640))
        self.page.locator('#dd-reset-button').click()
        self.page.keyboard.press('Shift+Tab')
        for _ in range(16):
            self.page.keyboard.press('Tab')
            self.assertTrue(self.page.evaluate("document.activeElement.closest('#dd-reset-modal') !== null"))
        bounds = self.page.locator('#dd-reset-modal').evaluate("el=>[...el.querySelectorAll('button,input')].map(c=>({left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right}))")
        self.assertTrue(all(0<=b['left'] and b['right']<=320 for b in bounds),bounds)
        self.page.locator('#dd-reset-modal').screenshot(path=str(OUTPUT/'modal-320.png'))
        self.page.keyboard.press('Escape')
        expect(self.page.locator('#dd-reset-button')).to_be_focused()
    def test_modal_initial_heading_and_primary_action_are_in_view(self):
        self.load(); self.page.set_viewport_size(dict(width=320,height=640))
        self.page.locator('#dd-reset-button').click()
        bounds = self.page.evaluate("[...document.querySelectorAll('#dd-reset-title,#dd-reset-modal button,#dd-reset-input')].map(el=>({id:el.id,text:el.textContent,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}))")
        self.assertTrue(all(16<=b['top'] and b['bottom']<=624 for b in bounds),bounds)
    def test_gold_optional_cards_contrast_all_themes(self):
        self.load(); self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#guard-status')).to_have_text('TAGESBASIS BESTÄTIGT')
        self.page.add_script_tag(path=str(ROOT/'tests/vendor/axe.min.js'))
        reports = {}
        for theme in ['dark','light','stone']:
            self.page.locator('.stone-theme-dock [data-mode="'+theme+'"]').click()
            reports[theme] = self.page.evaluate('''async()=>{const r=await axe.run({include:[['#gold-details'],['#vp-summary-badge'],['#vp-histogram-container']]},{runOnly:['color-contrast']});return {violations:r.violations,incomplete:r.incomplete}}''')
            self.page.locator('#gold-details').screenshot(path=str(OUTPUT/f'gold-{theme}-guard.png'))
        (OUTPUT/'gold-contrast.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
        self.assertEqual({theme:[n['target'] for v in r['violations'] for n in v['nodes']] for theme,r in reports.items()},dict(dark=[],light=[],stone=[]))
    def test_mobile_nonchart_controls_and_long_labels_are_not_clipped(self):
        self.load(); self.page.set_viewport_size(dict(width=320,height=900))
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        bounds = self.page.evaluate("""() => [...document.querySelectorAll('nav button,header button,header h1,header select,#positions-list input,#positions-list button,#journal-strategy-filter,#journal-list summary')].map(el=>({text:el.id||el.textContent,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))""")
        self.assertTrue(all(0<=b['left'] and b['right']<=320 for b in bounds),bounds)
        self.page.locator('#positions-list').screenshot(path=str(OUTPUT/'gold-320-positions.png'))
        self.page.locator('#journal-list').screenshot(path=str(OUTPUT/'gold-320-journal.png'))
    def test_position_entry_price_refresh_preserves_input_identity(self):
        self.load()
        field = self.page.locator('#sl-input-101'); field.fill('-37.00')
        self.page.evaluate("window.entryInput = document.getElementById('sl-input-101')")
        payload = status('titan'); payload['positions'][0]['open_price'] = 4005.
        self.page.route('**/api/status*', lambda route: route.fulfill(json=payload))
        self.page.evaluate('updateStatus()')
        expect(self.page.locator('[data-position-ticket="101"]')).to_contain_text('#101 @ $4005.00')
        expect(self.page.locator('[data-position-entry]')).to_have_text('#101 @ $4005.00')
        expect(field).to_have_value('-37.00'); expect(field).to_be_focused()
        self.assertTrue(self.page.evaluate("entryInput === document.getElementById('sl-input-101')"))
        self.assertEqual(self.errors, [])
    def test_control_session_disabled_blocks_mutations(self):
        self.load()
        self.page.route('**/api/control_session', lambda route: route.fulfill(json=dict(control_enabled=False,csrf_token='disabled')))
        result = self.page.evaluate("accountFetch('/api/close_position',{method:'POST'}).then(()=>'',error=>error.message)")
        self.assertIn('gesperrt',result); self.assertEqual(self.mutations,[])
    def test_control_session_403_does_not_retry_mutation(self):
        self.load()
        self.page.route('**/api/close_position*', lambda route: route.fulfill(status=403,json=dict(detail='fixture forbidden')))
        result = self.page.evaluate("accountFetch('/api/close_position',{method:'POST'}).then(()=>'',error=>error.message)")
        self.assertEqual(result,'fixture forbidden')
        self.assertIsNone(self.page.evaluate('controlSessionPromise'))
    def test_unknown_risk_values_render_unknown_not_zero(self):
        self.load()
        self.page.route('**/api/status*', lambda route: route.fulfill(json={**status('titan'),'daily_drawdown':dict(pct=None,loss_usd=None,buffer_usd=None,balance=10000.,equity=9900.,manual_active=False)}))
        self.page.evaluate('updateStatus()')
        expect(self.page.locator('#dd-pct')).to_have_text('unbekannt')
        expect(self.page.locator('#dd-buffer')).to_have_text('unbekannt')
        self.assertTrue(self.page.evaluate("accountFetch('/api/close_position',{method:'POST'}).then(()=>false,()=>true)"))
        self.assertEqual(self.mutations,[])
        self.assertEqual(self.errors,[])
    def test_accounts_reply_cannot_publish_mismatched_identity(self):
        self.load()
        self.page.route('**/api/status*', lambda route: route.fulfill(json=status('goldm15')))
        self.page.evaluate('updateStatus()')
        expect(self.page.locator('#account-connection')).to_contain_text('STALE')
        self.assertEqual(self.page.evaluate('currentData.account.id'),'titan')
        expect(self.page.locator('#dd-reset-button')).to_be_disabled()
    def test_journal_partial_failure_retains_both_sources_and_calculates_total(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.route('**/api/journal_summary?account=goldm15',lambda route:route.fulfill(status=503,json=dict(detail='partial source failure')))
        self.page.evaluate('refreshJournal()')
        expect(self.page.locator('#journal-total-pnl')).to_have_text('Gesamt: +$200.00')
        expect(self.page.locator('[data-journal-key]')).to_have_count(2)
    def test_header_reflow_equivalent_200_percent_text_zoom(self):
        self.load(); self.page.set_viewport_size(dict(width=768,height=900))
        self.page.locator('html').evaluate("el=>el.style.fontSize='32px'")
        bounds=self.page.evaluate("[...document.querySelectorAll('header button,header #bar-countdown,header #dd-buffer,header select')].map(el=>el.getBoundingClientRect().right)")
        self.assertTrue(all(right<=768 for right in bounds),bounds)
    def test_deadline_includes_hung_json_body(self):
        self.load()
        self.page.evaluate('''() => {const original=window.fetch; window.fetch=(url,options)=>String(url).includes('/api/status')?Promise.resolve({ok:true,status:200,json:()=>new Promise(()=>{})}):original(url,options);void updateStatus()}''')
        expect(self.page.locator('#account-connection')).to_contain_text('STALE',timeout=7000)
        self.assertIsNone(self.page.evaluate('statusBusy'))
    def test_optional_initialization_failure_keeps_nonchart_features_alive(self):
        self.context.add_init_script("window.addEventListener('DOMContentLoaded',()=>{window.initChart=()=>{throw new Error('fixture chart initialization failure')}})")
        self.load()
        expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.assertEqual(self.errors,[])
    def test_quick_actions_publish_draft_before_delayed_send_and_poll(self):
        self.load()
        for action, side, value in [('quickBE(101)', 'sl', '5.00'), ('quickSL(101,-50)', 'sl', '-50.00'), ('quickTP(101,100)', 'tp', '100.00')]:
            with self.subTest(action=action):
                field = self.page.locator('#'+side+'-input-101'); field.fill('-37.00' if side=='sl' else '37.00')
                self.page.evaluate('''() => {
                  window.nativeQuickFetch ||= window.fetch;
                  window.fetch = (url, options) => String(url).includes('/api/modify_position')
                    ? new Promise(resolve=>{window.finishQuick=success=>resolve({ok:true,status:200,json:async()=>({success})})}) : window.nativeQuickFetch(url,options);
                  window.quickEvents=0;
                  document.getElementById('positions-list').oninput=()=>window.quickEvents++;
                }''')
                self.page.evaluate('void '+action)
                self.page.wait_for_function('typeof window.finishQuick === "function"')
                self.assertEqual(self.page.evaluate("positionDrafts.get(activeAccount+':'+"+json.dumps(side+'-input-101')+")"),value)
                self.assertEqual(self.page.evaluate('quickEvents'),1)
                self.page.evaluate('updateStatus()'); expect(field).to_have_value(value)
                self.page.evaluate('finishQuick(false)'); self.page.wait_for_timeout(50)
                self.page.evaluate('updateStatus()'); expect(field).to_have_value(value)
                self.page.evaluate('delete window.finishQuick; void '+action)
                self.page.wait_for_function('typeof window.finishQuick === "function"')
                field.fill('-42.00' if side=='sl' else '142.00')
                self.page.evaluate('finishQuick(true)'); self.page.wait_for_timeout(50)
                self.page.evaluate('updateStatus()')
                expect(field).to_have_value('-42.00' if side=='sl' else '142.00')
        self.assertEqual(self.errors, [])
    def test_journal_unknown_direction_is_not_sell(self):
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.evaluate("journalEntriesByAccount.titan[0].type=null; renderJournal()")
        row = self.page.locator('[data-journal-key="titan:201:CLOSED"]')
        expect(row).to_contain_text('UNBEKANNT'); expect(row).not_to_contain_text('SELL')
        self.assertEqual(self.errors, [])
    def test_api_text_is_literal_and_never_executes_html(self):
        attack = '<img src=x onerror="window.apiInjected=(window.apiInjected||0)+1"> & \' "'
        self.load(); expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        for field in ['why_triggered','profit_goal','time_de','time_server']:
            with self.subTest(field=field):
                payload = journal('titan'); payload['journal'][0][field] = attack
                self.page.route('**/api/journal_summary?account=titan', lambda route, request=None, *, p=payload: route.fulfill(json=p))
                self.page.evaluate('refreshJournal()'); self.page.wait_for_timeout(80)
                self.assertEqual(self.page.evaluate('window.apiInjected || 0'),0)
                expect(self.page.locator('[data-journal-key="titan:201:CLOSED"]')).to_contain_text(attack)
                expect(self.page.locator('#journal-list img')).to_have_count(0)
        for field in ['name','short_note','long_note','current_val']:
            with self.subTest(field=field):
                payload = status('titan'); payload['rules_matrix'][0][field] = attack
                self.page.route('**/api/status*', lambda route, request=None, *, p=payload: route.fulfill(json=p))
                self.page.evaluate('updateStatus()')
                self.assertEqual(self.page.evaluate('window.apiInjected || 0'),0)
                expect(self.page.locator('#matrix-tbody')).to_contain_text(attack)
                expect(self.page.locator('#matrix-tbody img')).to_have_count(0)
        payload = status('titan'); payload['trend_diagnosis'] = attack
        self.page.route('**/api/status*',lambda route: route.fulfill(json=payload)); self.page.evaluate('updateStatus()')
        expect(self.page.locator('#short-missing-text')).to_contain_text(attack)
        expect(self.page.locator('#short-missing-text img')).to_have_count(0)
        self.page.evaluate('(attack)=>{accounts.titan.name=attack;renderPositions([{...currentData.positions[0],ticket:102}])}',attack)
        expect(self.page.locator('#sl-input-102')).to_have_attribute('aria-label','SL Ziel-P/L in USD · '+attack+' · Ticket 102')
        expect(self.page.locator('#positions-list img')).to_have_count(0)
        payload = status('goldm15'); payload['exit_goals'][0].update(short_note=attack,long_note=attack)
        self.page.evaluate('(payload)=>renderGoldDetails(payload)',payload)
        expect(self.page.locator('#exit-goals')).to_contain_text(attack)
        expect(self.page.locator('#exit-goals img')).to_have_count(0)
        self.assertEqual(self.page.evaluate('window.apiInjected || 0'),0)
        self.assertEqual(self.errors, [])
    def test_permanent_bootstrap_503_keeps_unknown_nonchart_view_before_chart(self):
        self.page.route('**/api/accounts', lambda route: route.fulfill(status=503,json=dict(detail='permanent offline')))
        self.context.add_init_script("window.addEventListener('DOMContentLoaded',()=>{window.earlyClearChartUnset = typeof candleSeries === 'undefined'; clearAccountView()})")
        self.page.goto(self.url)
        expect(self.page.locator('#account-connection')).to_contain_text('OFFLINE')
        self.assertTrue(self.page.evaluate('earlyClearChartUnset'))
        self.page.wait_for_timeout(1200)
        for id in ['dd-pct','dd-usd','dd-buffer','dd-matrix-detail','acc-matrix-bal','pos-matrix-count','pos-count-badge','sell-pct','buy-pct','matrix-time']:
            with self.subTest(id=id):
                expect(self.page.locator('#'+id)).to_have_text('—')
        expect(self.page.locator('#positions-list')).to_contain_text('unbekannt')
        expect(self.page.locator('#positions-list')).not_to_contain_text('keine offenen')
        expect(self.page.locator('#matrix-tbody')).to_contain_text('unbekannt')
        expect(self.page.locator('#dd-reset-button')).to_be_disabled()
        self.assertFalse(self.page.evaluate('accountActionsReady()'))
        self.assertEqual(self.errors, []); self.assertEqual(self.mutations, [])
    def test_permanent_bootstrap_503_initial_view_never_claims_zero(self):
        self.page.route('**/api/accounts', lambda route: route.fulfill(status=503,json=dict(detail='permanent offline')))
        self.page.goto(self.url)
        expect(self.page.locator('#account-connection')).to_contain_text('OFFLINE')
        expect(self.page.locator('#pos-count-badge')).to_have_text('—')
        expect(self.page.locator('#pos-matrix-count')).to_have_text('—')
        expect(self.page.locator('#dd-matrix-detail')).to_have_text('—')
        expect(self.page.locator('#positions-list')).to_contain_text('unbekannt')
        expect(self.page.locator('#matrix-tbody')).to_contain_text('unbekannt')
        self.assertEqual(self.errors, [])
    def test_open_reset_modal_refreshes_readonly_values_without_touching_baseline(self):
        self.load(); self.page.locator('#dd-reset-button').click()
        field = self.page.locator('#dd-reset-input'); field.fill('12345.67')
        self.page.evaluate('window.resetInput = document.getElementById("dd-reset-input")')
        payload = status('titan'); payload['daily_drawdown'].update(balance=9000.,equity=8600.,pct=4.,loss_usd=400.,manual_active=True,reset_time_str='12:34',reset_balance=11000.)
        self.page.route('**/api/status*',lambda route: route.fulfill(json=payload)); self.page.evaluate('updateStatus()')
        expect(self.page.locator('#modal-current-bal')).to_have_text('$9000.00')
        expect(self.page.locator('#modal-current-dd')).to_have_text('4.00% (-$400.00)')
        expect(self.page.locator('#modal-reset-status-row')).to_be_visible()
        expect(self.page.locator('#modal-reset-status-text')).to_have_text('Aktiv seit 12:34 @ $11000.00')
        expect(field).to_have_value('12345.67'); expect(field).to_be_focused()
        self.assertTrue(self.page.evaluate('resetInput === document.getElementById("dd-reset-input")'))
        payload['daily_drawdown'].update(pct=None,loss_usd=None,balance=None)
        self.page.evaluate('updateStatus()')
        expect(self.page.locator('#modal-current-dd')).to_have_text('unbekannt')
        expect(self.page.locator('#modal-current-bal')).to_have_text('unbekannt')
        expect(field).to_have_value('12345.67')
        expect(self.page.locator('#dd-reset-modal [onclick="executeDrawdownReset()"]')).to_be_disabled()
        self.assertEqual(self.errors, [])
    def test_source_freshness_blocks_actions_despite_successful_http_polls(self):
        self.load()
        for metadata in [dict(source_fresh=False), dict(quote_age_seconds=31.), dict(quote_time_epoch=time.time()-31), dict(quote_time_epoch=time.time()+10,quote_age_seconds=-10.), dict(quote_time_epoch=None)]:
            with self.subTest(metadata=metadata):
                payload = status('titan'); payload.update(metadata)
                self.page.route('**/api/status*',lambda route, request=None, *, p=payload: route.fulfill(json=p))
                self.page.evaluate('updateStatus()'); self.page.evaluate('updateStatus()')
                expect(self.page.locator('#account-connection')).to_contain_text('STALE')
                expect(self.page.locator('#dd-reset-button')).to_be_disabled()
                self.assertTrue(self.page.evaluate("[...document.querySelectorAll('#positions-list button')].every(button=>button.disabled)"))
                self.assertFalse(self.page.evaluate('accountActionsReady()'))
                self.assertTrue(self.page.evaluate("accountFetch('/api/close_position',{method:'POST'}).then(()=>false,()=>true)"))
                self.page.route('**/api/status*',lambda route: route.fulfill(json=status('titan')))
                self.page.evaluate('updateStatus()')
                expect(self.page.locator('#account-connection')).to_contain_text('LIVE')
        self.assertEqual(self.mutations,[]); self.assertEqual(self.errors,[])
    def test_repeated_receipt_cannot_rejuvenate_same_quote_epoch(self):
        self.load()
        payload = status('titan')
        self.page.route('**/api/status*',lambda route:route.fulfill(json=payload)); self.page.evaluate('updateStatus()')
        self.page.evaluate('Date.now=()=>'+str(int((payload['quote_time_epoch']+31)*1000)))
        self.page.evaluate('updateStatus()'); self.page.evaluate('updateStatus()')
        expect(self.page.locator('#account-connection')).to_contain_text('STALE')
        self.assertFalse(self.page.evaluate('accountActionsReady()'))
        self.assertEqual(self.mutations,[]); self.assertEqual(self.errors,[])
    def test_gold_unverified_baseline_keeps_known_risk_manual_actions_not_ea_claim(self):
        self.load(); self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        payload = status('goldm15'); payload['ea_guard']['baseline_verified'] = False
        self.page.route('**/api/status*',lambda route:route.fulfill(json=payload)); self.page.evaluate('updateStatus()')
        expect(self.page.locator('#guard-status')).to_have_text('SCHUTZSTATUS UNBEKANNT')
        expect(self.page.locator('#guard-note')).to_contain_text('EA-Heartbeat unbekannt')
        expect(self.page.locator('#guard-note')).to_contain_text('Quellfrische ist keine EA-Bestätigung')
        expect(self.page.locator('#dd-reset-button')).to_be_enabled()
        self.assertTrue(self.page.evaluate('accountActionsReady()'))
        self.page.locator('#dd-reset-button').click()
        expect(self.page.locator('#reset-description')).to_contain_text('ausschließlich die Dashboard-Anzeige')
        self.assertEqual(self.mutations,[]); self.assertEqual(self.errors,[])
    def test_source_metadata_absent_legacy_payload_remains_compatible(self):
        self.load(); payload = status('titan')
        for key in ['source_fresh','quote_time_epoch','quote_age_seconds']: payload.pop(key)
        self.page.route('**/api/status*',lambda route:route.fulfill(json=payload)); self.page.evaluate('updateStatus()')
        expect(self.page.locator('#account-connection')).to_contain_text('LIVE')
        self.assertTrue(self.page.evaluate('accountActionsReady()'))
    def test_journal_recording_label_stays_explicitly_dated(self):
        self.load()
        expect(self.page.locator('#journal-recording-start')).to_contain_text('08.10.2026 23:00 UTC')
        expect(self.page.locator('#journal-recording-start')).to_contain_text('Offene Positionen unabhängig vom Einstiegstag')
        expect(self.page.locator('#journal-recording-start')).not_to_contain_text('Heute')
        expect(self.page.locator('#journal-recording-start')).not_to_contain_text('20:00')
    def test_storage_denied_does_not_break_bootstrap(self):
        self.context.add_init_script("Object.defineProperty(window, 'localStorage', {get(){throw new DOMException('Blocked', 'SecurityError')}})")
        self.load()
        expect(self.page.locator('#journal-count-badge')).to_contain_text('2 Trades')
        self.page.locator('[data-account="goldm15"]').click()
        expect(self.page.locator('#account-connection')).to_contain_text('53090070')
        self.assertEqual(self.errors, [])
