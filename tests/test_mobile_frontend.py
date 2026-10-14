"""Browser regression for mobile controls and compact ASCII; no MT5 requests."""
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import pytest
from playwright.sync_api import sync_playwright

from mobile_views import ASCII_HTML, MOBILE_HTML


class Pages(BaseHTTPRequestHandler):
    def do_GET(self):
        page = ASCII_HTML if urlparse(self.path).path == '/ascii' else MOBILE_HTML
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(page.encode('utf-8'))

    def log_message(self, *_):
        pass


@pytest.fixture(scope='module')
def browser_server():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Pages)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize('view', ['mobile', 'ascii'])
@pytest.mark.parametrize('width', [320, 390, 768])
def test_controlled_buttons_request_csrf_before_mutation(browser_server, view, width):
    position = dict(ticket=101, type='SELL', volume=0.1, open_price=4140.87,
                    current_price=4105.64, profit_usd=35.23, profit_pct=1.0,
                    sl_price=4200.0, sl_usd=-59.13, tp_price=0.0, tp_usd=0.0,
                    ema9=4108.57, dist_to_ema9=2.93, target_usd=28.0)
    status = dict(account=dict(id='blueberry', name='Blueberry', timeframe='M5'),
                  bid=4105.52, ask=4105.64, spread=12, trend_direction='BEARISH',
                  times=dict(german='21:24:03', bar_remaining_fmt='00:57'),
                  daily_drawdown=dict(balance=249.8, equity=433.7, loss_usd=0, pct=0, buffer_usd=None),
                  positions=[position], indicators=dict(ema9=4108.57))
    closes = [4103.4, 4104.0, 4102.7, 4101.9, 4102.8, 4104.3, 4105.0, 4103.9,
              4102.4, 4101.5, 4100.8, 4102.1, 4103.6, 4104.9, 4105.8, 4105.2]
    candle_data = []
    previous = 4102.8
    for close in closes:
        candle_data.append(dict(open=previous, close=close,
                                high=max(previous, close) + 0.8, low=min(previous, close) - 0.6))
        previous = close
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport=dict(width=width, height=844), is_mobile=True, has_touch=True)
        page = context.new_page()
        calls = []
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.accept())

        def api(route):
            req = route.request
            path = urlparse(req.url).path
            calls.append((path, req.method, req.headers))
            if path == '/api/accounts':
                route.fulfill(json=dict(accounts=[dict(id='blueberry', name='Blueberry', timeframe='M5')], default='blueberry'))
            elif path == '/api/status':
                route.fulfill(json=status)
            elif path == '/api/control_session':
                route.fulfill(json=dict(csrf_token='test-csrf', control_enabled=True))
            elif path in ('/api/modify_position', '/api/close_position'):
                route.fulfill(json=dict(success=True))
            elif path == '/api/journal_summary':
                route.fulfill(json=dict(journal=[]))
            elif path == '/api/candles':
                route.fulfill(json=dict(candles=candle_data))
            else:
                route.fulfill(status=404, json=dict(detail='unexpected API'))

        page.route('**/api/**', api)
        page.goto(f'{browser_server}/{view}')
        if view == 'ascii' and width <= 740:
            page.locator('#terminal-screen.compact .ascii-position').wait_for()
            page.locator('.ascii-plot .chart-row').first.wait_for()
            button = page.locator('#terminal-screen .ascii-position button').filter(has_text='BE +5$')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            assert page.locator('.ascii-plot .candle-body.up').count() > 0
            assert page.locator('.ascii-plot .candle-body.down').count() > 0
            plot_box = page.locator('.ascii-plot').bounding_box()
            last_candle_box = page.locator('.ascii-plot .candle-current').last.bounding_box()
            assert plot_box and last_candle_box and last_candle_box['x'] + last_candle_box['width'] <= plot_box['x'] + plot_box['width']
            if width == 390:
                assert page.locator('.candle-current').first.evaluate('(node) => getComputedStyle(node).animationName') == 'candle-live'
                page.emulate_media(reduced_motion='reduce')
                assert page.locator('.candle-current').first.evaluate('(node) => getComputedStyle(node).animationName') == 'none'
                page.emulate_media(reduced_motion='no-preference')
            market = page.locator('.ascii-card').first
            label_box = market.locator('.ascii-line span').first.bounding_box()
            panel_box = market.bounding_box()
            assert label_box and panel_box and label_box['x'] - panel_box['x'] < 40
            box = button.bounding_box()
            assert box and box['x'] >= 0 and box['x'] + box['width'] <= width
            if width == 390:
                artifact = Path(__file__).resolve().parents[1] / 'output' / 'audit-ui' / 'ascii-mobile-fixed.png'
                artifact.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(artifact), full_page=True)
        elif view == 'ascii':
            page.locator('#terminal-screen .btn').filter(has_text='BE +5$').first.wait_for()
            button = page.locator('#terminal-screen .btn').filter(has_text='BE +5$').first
        else:
            page.locator('.pos-card').wait_for()
            button = page.locator('.pos-card button').filter(has_text='BE +5$')
        button.click()
        page.wait_for_timeout(150)
        mutations = [call for call in calls if call[1] == 'POST']
        assert len(mutations) == 1
        assert mutations[0][0] == '/api/modify_position'
        assert mutations[0][2]['x-dashboard-csrf'] == 'test-csrf'
        assert any(call[0] == '/api/control_session' for call in calls)
        if view == 'ascii' and width <= 740:
            page.locator('#terminal-screen .ascii-position button').filter(has_text='SCHLIESSEN').click()
        elif view == 'mobile':
            page.locator('.pos-card button').filter(has_text='Schließen').last.click()
        else:
            page.locator('#terminal-screen .btn').filter(has_text='SCHLIESSEN').last.click()
        page.wait_for_timeout(150)
        closes = [call for call in calls if call[0] == '/api/close_position' and call[1] == 'POST']
        assert len(closes) == 1
        assert closes[0][2]['x-dashboard-csrf'] == 'test-csrf'
        assert not errors
        context.close()
        browser.close()


@pytest.mark.parametrize('view', ['mobile', 'ascii'])
def test_unapproved_mobile_access_never_posts(browser_server, view):
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport=dict(width=390, height=844))
        posted = []

        def api(route):
            path = urlparse(route.request.url).path
            if route.request.method == 'POST':
                posted.append(path)
                route.fulfill(json=dict(success=True))
            elif path == '/api/control_session':
                route.fulfill(json=dict(control_enabled=False, role='read', csrf_token='test-csrf'))
            elif path == '/api/accounts':
                route.fulfill(json=dict(accounts=[dict(id='blueberry', name='Blueberry')], default='blueberry'))
            else:
                route.fulfill(json=dict(positions=[], candles=[], journal=[]))

        page.route('**/api/**', api)
        page.goto(f'{browser_server}/{view}')
        error = page.evaluate("controlledPost('/api/modify_position', {ticket:101,sl_usd:5}).then(()=>'unexpected', e=>e.message)")
        assert 'nicht freigegeben' in error
        assert posted == []
        browser.close()


def test_ascii_editor_preserves_zero_sltp_defaults(browser_server):
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport=dict(width=390, height=844))
        page.goto(f'{browser_server}/ascii')
        html = page.evaluate("renderCompactAscii({positions:[{ticket:101,type:'BUY',volume:0.1,profit_usd:0,sl_usd:0,tp_usd:0}],daily_drawdown:{}})")
        assert 'promptEditSLTP(101, 0, 0)' in html
        browser.close()


def test_mobile_ascii_chart_uses_ohlc_bodies_wicks_and_current_candle(browser_server):
    candles = [
        dict(open=100, high=104, low=99, close=103),
        dict(open=103, high=105, low=100, close=101),
        dict(open=101, high=103, low=98, close=102),
        dict(open=102, high=106, low=101, close=105),
    ]
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport=dict(width=320, height=700))
        page.goto(f'{browser_server}/ascii')
        chart = page.evaluate('(candles) => renderMobileCandleChart(candles)', candles)
        assert 'ascii-plot' in chart
        assert 'candle-body up' in chart
        assert 'candle-body down' in chart
        assert 'candle-wick' in chart
        assert 'candle-current' in chart
        assert chart.count('chart-row') >= 8
        assert '106.0' in chart and '98.0' in chart
        assert 'KERZEN WERDEN GELADEN' in page.evaluate('renderMobileCandleChart([])')
        browser.close()
