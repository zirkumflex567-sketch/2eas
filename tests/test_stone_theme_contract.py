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
    def test_stone_skin_uses_shared_theme_tokens_for_core_surfaces(self):
        css = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        self.assertIn(
            "@layer stone-reset, stone-tokens, stone-base, stone-theme, stone-overrides;",
            css,
        )
        token_layer = re.search(r"@layer stone-tokens\s*\{([^}]*)\}", css, re.DOTALL)
        self.assertIsNotNone(token_layer, "Shared theme tokens belong to their declared cascade layer")
        for token in (
            "--stone-color-root",
            "--stone-color-surface",
            "--stone-color-card",
            "--stone-color-text",
            "--stone-color-muted-text",
            "--stone-color-accent",
            "--stone-color-warning",
            "--stone-color-border",
        ):
            with self.subTest(token=token):
                self.assertRegex(token_layer.group(1), re.escape(token) + r"\s*:")
                self.assertIn(f"var({token})", css)

    def test_chart_studio_controls_share_one_mobile_breakpoint(self):
        css = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        narrow_queries = re.findall(
            r"@media\s*\(\s*max-width\s*:\s*(?:650|680|690)px\s*\)\s*\{([\s\S]*?)\n\}", css
        )
        selectors = (
            ".cs-beta-buttons button",
            ".cs-indicator-control",
            ".cs-server-sync-row",
            ".cs-ma-instance",
            ".cs-osc-instance",
            ".cs-object-row",
        )
        self.assertFalse(
            any(any(selector in query for selector in selectors) for query in narrow_queries),
            "Chart Studio controls must not diverge onto 650/680/690px breakpoints",
        )
        mobile_queries = re.findall(
            r"@media\s*\(\s*max-width\s*:\s*700px\s*\)\s*\{([\s\S]*?)\n\}", css
        )
        self.assertTrue(
            any(all(selector in query for selector in selectors) for query in mobile_queries),
            "All Chart Studio controls share the 700px mobile query",
        )
        for selector in selectors:
            with self.subTest(selector=selector):
                self.assertTrue(any(selector in query for query in mobile_queries))

    def test_stone_skin_has_one_reduced_motion_rule_set(self):
        css = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        blocks = re.findall(
            r"@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}",
            css,
        )
        self.assertEqual(len(blocks), 1, "Reduced-motion rules stay in one auditable media query")
        for selector in (
            ".stone-cockpit-crest",
            ".stone-ambience",
            ".stone-vapor",
            ".stone-event-toast",
            ".cs-beta-toggle",
            ".chart-legend span",
        ):
            with self.subTest(selector=selector):
                self.assertIn(selector, blocks[0])

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
        levels = (STATIC / "chart-level-visibility.js").read_text(encoding="utf-8")
        self.assertNotIn('id="chart-ea-status-box"', app)
        self.assertNotIn("chart-ea-status-text", app)
        self.assertIn('id="chart-level-legend"', app)
        self.assertIn("renderChartLevelLegend(visibleLevels);", app)
        self.assertIn("level.title", levels)
        self.assertIn("title:''", app)
        self.assertIn("drawEmaEffect(state,effect,now)", fx)
        self.assertIn("const plotWidth = Number(timeScale.width())", fx)
        self.assertIn("timeScale.height()", fx)
        self.assertIn('cv.style.setProperty("width"', fx)
        self.assertIn("!motionPreference.matches", fx)
        self.assertIn("#chart-level-legend.stone-chart-level-legend", skin)

    def test_chart_fx_uses_public_plot_geometry_apis(self):
        fx = (STATIC / "stone-chart-effects.js").read_text(encoding="utf-8")
        self.assertNotIn("table tbody tr:first-child td:first-child", fx)
        self.assertIn("timeScale.height()", fx)
        self.assertIn('state.chart.priceScale("left").width()', fx)
        self.assertIn('state.chart.priceScale("right").width()', fx)
        self.assertIn("getX(state, c.time)", fx)
        self.assertIn("getY(state.candleSeries, c.high)", fx)

    def test_daily_weekly_price_levels_have_individual_account_scoped_toggles(self):
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        levels = (STATIC / "chart-level-visibility.js").read_text(encoding="utf-8")
        self.assertIn('src="static/chart-level-visibility.js"', app)
        for key in ("daily_high", "daily_low", "daily_poc", "daily_vah", "daily_val",
                    "weekly_high", "weekly_low", "weekly_poc", "weekly_vah", "weekly_val"):
            self.assertIn(f'key:"{key}"', levels)
        self.assertIn("hasChoice(activeAccount, definition.key, localStorage)", app)
        self.assertIn("axisLabelVisible:false", app)
        self.assertIn("currentSRLevels = null", app)


    def test_mythic_chart_effects_are_sparse_and_visual_only(self):
        fx = (STATIC / "stone-chart-effects.js").read_text(encoding="utf-8")
        skin = (STATIC / "stone-asset-skin.css").read_text(encoding="utf-8")
        live = (ROOT / "app.py").read_text(encoding="utf-8")
        demo = (STATIC / "stone-preview.html").read_text(encoding="utf-8")
        # No continuously glowing EMA lines in the live or demo chart.
        self.assertIn("hideNativeGlow(instance)", fx)
        self.assertNotIn("function updateNativeGlow", fx)
        self.assertNotIn("function drawEmaHalo", fx)
        self.assertIn("scheduleNext(state,now)", fx)
        self.assertNotIn("setInterval(render, 100)", fx)
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
    def test_volume_profile_price_scale_tracking_contract(self):
        js = (STATIC / "stone-cockpit.js").read_text(encoding="utf-8")
        css = (STATIC / "stone-cockpit.css").read_text(encoding="utf-8")
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        demo = (STATIC / "stone-preview.html").read_text(encoding="utf-8")

        # stone-cockpit.js tracks price scale via priceToCoordinate and exports API
        self.assertIn("attachChart", js)
        self.assertIn("priceToCoordinate", js)
        self.assertIn("syncPositions", js)
        self.assertIn("requestSync", js)
        self.assertIn("window.StoneCockpit", js)

        # stone-cockpit.css has dynamic row coordinates and fallback
        self.assertIn(".stone-mini-volume.stone-mini-fallback", css)
        self.assertIn("position:absolute;inset:0;overflow:hidden", css.replace(" ", ""))
        self.assertIn("transform:translateY(-50%)", css.replace(" ", ""))

        # app.py attaches chart/series and binds high-res vpData
        self.assertIn("StoneCockpit?.attachChart", app)
        self.assertIn("container.__candleSeries = candleSeries", app)
        self.assertIn("container.__vpData = vp", app)
        self.assertIn("StoneCockpit?.requestSync", app)

        # stone-preview.html attaches demo chart and candle series
        self.assertIn("StoneCockpit?.attachChart", demo)

    def test_chart_position_lines_contract(self):
        app = (ROOT / "app.py").read_text(encoding="utf-8")
        self.assertIn('id="toggle-positions-btn"', app)
        self.assertIn('onclick="toggleChartPositions()"', app)
        self.assertIn('id="chart-pos-legend"', app)
        self.assertIn("function toggleChartPositions()", app)
        self.assertIn("function updateChartPositionsButtonUI()", app)
        self.assertIn("function updateChartPositionLines(positions)", app)
        self.assertIn("function removeAllPositionLines()", app)
        self.assertIn("showChartPositions", app)
        self.assertIn("pos.open_price", app)
        self.assertIn("pos.sl_price", app)
        self.assertIn("pos.tp_price", app)


if __name__ == "__main__":
    unittest.main()


