"""Static contract tests for the optional stone skin.

Run independently from MT5:
    python -m unittest discover -s tests -p test_stone_theme_contract.py
"""
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


class StoneThemeContractTests(unittest.TestCase):
    def test_assets_exist(self):
        for name in ("stone-cockpit.css", "stone-cockpit.js", "stone-texture.svg", "stone-preview.html"):
            with self.subTest(asset=name):
                self.assertTrue((STATIC / name).is_file())

    def test_stone_svg_is_valid_xml(self):
        tree = ET.parse(STATIC / "stone-texture.svg")
        self.assertTrue(tree.getroot().tag.endswith("svg"))

    def test_app_includes_skin_without_replacing_api(self):
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        self.assertIn('href="static/stone-cockpit.css"', app)
        self.assertIn('src="static/stone-cockpit.js"', app)
        for route in ('/api/accounts', '/api/status', '/api/candles',
                      '/api/reset_drawdown', '/api/modify_position', '/api/close_position'):
            with self.subTest(route=route):
                self.assertIn(route, app)

    def test_css_is_scoped_and_proxy_safe(self):
        css = (STATIC / "stone-cockpit.css").read_text(encoding="utf-8")
        self.assertIn("body.theme-stone .glass-card", css)
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn('url("stone-texture.svg")', css)
        self.assertNotIn('url("/static/stone-texture.svg")', css)

    def test_frontend_does_not_call_trading_endpoints(self):
        js = (STATIC / "stone-cockpit.js").read_text(encoding="utf-8")
        self.assertIn("MutationObserver", js)
        self.assertIn("two_eas_visual_theme", js)
        self.assertNotIn("fetch(", js)
        self.assertNotIn("XMLHttpRequest", js)
        self.assertNotIn("WebSocket(", js)

    def test_demo_is_explicitly_simulated(self):
        demo = (STATIC / "stone-preview.html").read_text(encoding="utf-8")
        self.assertIn("SIMULIERTE MARKTDATEN", demo)
        self.assertIn("KEINE ECHTEN ORDERS", demo)
        self.assertRegex(demo, r"<button disabled>Set</button>")
        self.assertIn('src="lightweight-charts.js"', demo)


    def test_live_chart_labels_and_glow_regression(self):
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        fx = (STATIC / "stone-chart-effects.js").read_text(encoding="utf-8")
        skin = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        self.assertNotIn('id="chart-ea-status-box"', app)
        self.assertNotIn("chart-ea-status-text", app)
        self.assertIn('id="chart-level-legend"', app)
        self.assertIn("renderChartLevelLegend(visibleLevels);", app)
        self.assertIn("level.title", app)
        self.assertIn("title:''", app)
        self.assertIn("drawEmaEffect(state,effect,now)", fx)
        self.assertIn("state.chart.timeScale().width()", fx)
        self.assertIn('plotCell.getBoundingClientRect()', fx)
        self.assertIn('cv.style.setProperty("width"', fx)
        self.assertIn("!motionPreference.matches", fx)
        self.assertIn("#chart-level-legend.stone-chart-level-legend", skin)


    def test_mythic_chart_effects_are_sparse_and_visual_only(self):
        fx = (STATIC / "stone-chart-effects.js").read_text(encoding="utf-8")
        skin = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        live = (ROOT / "app.py").read_text(encoding="utf-8")
        demo = (STATIC / "stone-preview.html").read_text(encoding="utf-8")
        # No continuously glowing EMA lines in the live or demo chart.
        self.assertIn("hideNativeGlow(instance)", fx)
        self.assertNotIn("function updateNativeGlow", fx)
        self.assertNotIn("function drawEmaHalo", fx)
        self.assertIn("scheduleNext(state, now)", fx)
        self.assertIn("random(4700, 12000)", fx)
        self.assertIn('kind: "ema-sweep"', fx)
        self.assertIn('kind: "ema-pulse"', fx)
        self.assertIn('kind: "candle"', fx)
        self.assertIn('state.effects = [effect]', fx)
        self.assertIn('canvas.style.pointerEvents = "none"', fx)
        self.assertIn('prefers-reduced-motion: reduce', fx)
        self.assertIn('ctx.clearRect(0,0,state.width,state.height)', fx)
        self.assertNotIn("fetch(", fx)
        self.assertNotIn("order_send", fx)
        self.assertIn('src="static/stone-chart-effects.js"', live)
        self.assertIn('src="stone-chart-effects.js"', demo)
        self.assertIn("animation: none !important;", skin)
        self.assertIn("stone-asset-panel--chart::after", skin)


if __name__ == "__main__":
    unittest.main()
