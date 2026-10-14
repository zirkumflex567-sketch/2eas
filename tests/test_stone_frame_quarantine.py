"""Browser contract for quarantining the two defective Stone frame images.

The fixture serves the production skin and assets locally; it never loads the
application, connects to a broker, or runs chart/trading scripts.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "stone-ui-assets" / "frame-quarantine"
FRAME_NAMES = ("12_chart_frame_wide", "13_volume_frame_tall")

BASELINE_FRAME_RULES = """
body.theme-stone .stone-asset-panel--chart {
  border-image: url('/static/stone-assets/ready/12_chart_frame_wide.webp') 140 170 150 170 / 25px / 0 stretch !important;
}
body.theme-stone .stone-side-volume {
  border-image: url('/static/stone-assets/ready/13_volume_frame_tall.webp') 160 130 160 130 / 21px / 0 stretch !important;
}
"""


def fixture(pale: bool, expanded: bool, baseline: bool) -> str:
    surround = "#f7f7f7" if pale else "#11151b"
    frame_rules = BASELINE_FRAME_RULES if baseline else ""
    expanded_body = "stone-chart-is-expanded" if expanded else ""
    expanded_chart = "stone-chart-expanded" if expanded else ""
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/static/stone-asset-skin.css">
<style>
*, *::before, *::after {{ box-sizing: border-box; }}
body.theme-stone {{ margin: 0; padding: 16px; background: {surround} !important; }}
body.theme-stone::before, body.theme-stone::after {{ display: none !important; }}
.fixture-shell {{ max-width: 1160px; margin: auto; }}
.stone-chart-stage {{ display: grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 12px; min-width: 0; }}
.chart-slot {{ min-width: 0; }}
#tv-chart {{ width: 100%; height: 240px; }}
#tv-chart canvas {{ width: 100%; height: 100%; display: block; }}
.stone-side-volume {{ min-width: 0; display: flex; flex-direction: column; }}
.fixture-copy {{ overflow-wrap: anywhere; margin: 12px 0 0; }}
@media (max-width: 600px) {{ .stone-chart-stage {{ grid-template-columns: minmax(0, 1fr); }} }}
{frame_rules}
</style></head>
<body class="theme-stone {expanded_body}"><main class="fixture-shell">
<section class="glass-card stone-asset-panel stone-asset-panel--chart {expanded_chart}" aria-label="Chart frame fixture">
  <div class="flex"><h1>Chart frame fixture</h1></div>
  <div class="stone-chart-stage">
    <div class="chart-slot"><div id="tv-chart"><canvas aria-label="Empty chart canvas"></canvas></div></div>
    <aside class="stone-side-volume"><strong class="stone-volume-title">Volume</strong>
      <p class="fixture-copy">A long plain-language note wraps within the side panel even in a narrow viewport.</p>
    </aside>
  </div>
  <p class="fixture-copy">A long plain-language chart note wraps within the panel and keeps the chart area readable at every viewport.</p>
</section></main></body></html>"""


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == "/":
            query = urlparse(self.path).query
            html = fixture("pale" in query, "expanded" in query, "baseline" in query)
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, format, *args):
        pass


METRICS = """() => {
  const read = selector => {
    const el = document.querySelector(selector), s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {rect: [r.x, r.y, r.width, r.height], border: [s.borderTopWidth, s.borderRightWidth,
      s.borderBottomWidth, s.borderLeftWidth], padding: [s.paddingTop, s.paddingRight,
      s.paddingBottom, s.paddingLeft], image: s.borderImageSource,
      color: s.borderTopColor, style: s.borderTopStyle, shadow: s.boxShadow,
      display: s.display, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth};
  };
  return {chart: read('.stone-asset-panel--chart'), volume: read('.stone-side-volume'),
    canvas: read('#tv-chart canvas'), pageScroll: document.documentElement.scrollWidth,
    pageWidth: document.documentElement.clientWidth};
}"""


class StoneFrameQuarantine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def render(self, width: int, pale: bool, expanded: bool, baseline: bool):
        context = self.browser.new_context(viewport={"width": width, "height": 840}, reduced_motion="reduce")
        page = context.new_page()
        requests = []
        page.on("request", lambda request: requests.append(request.url))
        flags = ["pale" if pale else "dark", "expanded" if expanded else "regular"]
        if baseline:
            flags.append("baseline")
        page.goto(self.url + "?" + "&".join(flags), wait_until="networkidle")
        return context, page, page.evaluate(METRICS), requests

    def test_opaque_frames_keep_baseline_geometry_and_never_request_rejected_images(self):
        for width, expanded in ((1400, False), (1200, False), (800, False), (360, False),
                                (1400, True), (360, True)):
            for pale in (False, True):
                with self.subTest(width=width, expanded=expanded, pale=pale):
                    base_context, _, baseline, _ = self.render(width, pale, expanded, True)
                    try:
                        context, page, final, requests = self.render(width, pale, expanded, False)
                        try:
                            for name in ("chart", "volume", "canvas"):
                                self.assertEqual(final[name]["rect"], baseline[name]["rect"], name)
                                self.assertEqual(final[name]["border"], baseline[name]["border"], name)
                                self.assertEqual(final[name]["padding"], baseline[name]["padding"], name)
                            self.assertEqual(final["chart"]["image"], "none")
                            self.assertEqual(final["volume"]["image"], "none")
                            self.assertEqual(final["chart"]["style"], "solid")
                            self.assertEqual(final["volume"]["style"], "solid")
                            self.assertIn("33, 179, 208", final["chart"]["shadow"])
                            self.assertFalse(any(any(frame in url for frame in FRAME_NAMES) for url in requests), requests)
                            self.assertLessEqual(final["pageScroll"], final["pageWidth"] + 1)
                            self.assertLessEqual(final["chart"]["scrollWidth"], final["chart"]["clientWidth"] + 1)
                            if expanded and width == 360:
                                self.assertEqual(final["volume"]["display"], "none")
                            if width == 1400:
                                self.assertNotEqual(final["volume"]["display"], "none")
                            expected_chart = "22px" if width > 900 else "14px" if width > 600 else "9px"
                            expected_volume = "17px" if width > 1360 else "10px"
                            self.assertEqual(final["chart"]["border"][0], expected_chart)
                            self.assertEqual(final["volume"]["border"][0], expected_volume)
                            expected_chart_padding = "16px" if width > 900 else "11px" if width > 600 else "10px"
                            if expanded and width == 360:
                                expected_chart_padding = "10px"
                            self.assertEqual(final["chart"]["padding"][0], expected_chart_padding)
                            page.screenshot(path=str(OUTPUT / f"{width}-{'expanded' if expanded else 'regular'}-{'pale' if pale else 'dark'}.png"),
                                            full_page=True, animations="disabled")
                        finally:
                            context.close()
                    finally:
                        base_context.close()


if __name__ == "__main__":
    unittest.main()
