"""Contracts for presentation-only MT5 celebrations and EMA display."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"

class CelebrationContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = (ROOT / "app.py").read_text(encoding="utf8")
        cls.engine = (STATIC / "stone-chart-effects.js").read_text(encoding="utf8")
        cls.ui = (STATIC / "stone-celebrations.js").read_text(encoding="utf8")
        cls.skin = (STATIC / "stone-asset-skin.css").read_text(encoding="utf8")

    def test_genuine_mt5_fills_only(self):
        self.assertIn('observeTrades(data.account.id,data.journal,data.positions)', self.app)
        self.assertIn('observeTrades(result.id,result.entries)', self.app)
        self.assertIn("if(!acc.initialized)continue", self.ui)
        self.assertIn("if(acc.keys.has(k))continue", self.ui)
        self.assertIn('kind==="CLOSED"&&net>0&&settings.profit', self.ui)
        self.assertIn('kind==="OPEN"&&settings.trade', self.ui)
        # Realized net now includes allocated entry commission/fees, not exit-only costs.
        # Numeric accounting is exercised by test_backend_audit partial-close fixtures.
        self.assertIn("'profit_usd': row['net_profit_usd']", self.app)
        self.assertIn('journal_accounting.close_accounting(', self.app)
        self.assertIn('Math.abs(Date.now()/1000-ts)>900', self.ui)

    def test_toolbar_and_manual_demo_controls(self):
        for mode in ("off","mystic","chaos","ritual"):
            self.assertIn('data-fx-mode="'+mode+'"', self.ui)
        for t in ("trade","profit","chaos"):
            self.assertIn('data-fx-test="'+t+'"', self.ui)
        self.assertIn("settings.expanded", self.ui)
        self.assertIn("aria-expanded", self.ui)
        self.assertIn('demo?"DEMO · "', self.ui)
        self.assertIn('two_eas_ritual_settings_v1', self.ui)
        self.assertIn('stone-fx-panel[hidden]', self.skin)
        self.assertIn('StoneCelebration?.applyChartSettings()', self.app)

    def test_real_time_ema_values_and_motion_support(self):
        self.assertIn("StoneCelebration?.updateEMAs(", self.app)
        for ema in ("ema20","ema50","ema200"):
            self.assertIn("last(data."+ema+")", self.app)
        self.assertIn("StoneCelebration?.clearEMAs()", self.app)
        self.assertIn('fx-onema', self.ui)
        self.assertIn("motion.matches", self.ui)
        self.assertIn('prefers-reduced-motion:reduce', self.skin)
        self.assertIn("window.StoneChartFX?.trigger(kind,settings.strength)", self.ui)

    def test_no_order_or_execution_calls(self):
        self.assertNotIn("fetch(", self.ui)
        self.assertNotIn("order_send", self.ui)
        self.assertNotIn("TRADE_ACTION", self.ui)
        self.assertIn("pointer-events:none !important", self.skin)
        self.assertIn("state.effects = []; // a confirmed event", self.engine)
        self.assertIn("hideNativeGlow(instance)", self.engine)

if __name__ == "__main__":
    unittest.main()
