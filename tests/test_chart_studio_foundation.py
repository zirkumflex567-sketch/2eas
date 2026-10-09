"""Unit & regression contracts for the read-only Chart Studio foundation."""
import unittest
from pathlib import Path
from types import SimpleNamespace
from chart_studio.money import PreviewError, preview_scenario

ROOT=Path(__file__).resolve().parents[1]

class MT5Fake:
    ORDER_TYPE_BUY=1
    ORDER_TYPE_SELL=2
    def __init__(self,missing=False):
        self.calls=[]
        self.missing=missing
    def order_calc_profit(self,action,symbol,volume,entry,close):
        self.calls.append(("profit",action,symbol))
        if self.missing:return None
        return (close-entry)*volume*100*(1 if action==1 else -1)
    def order_calc_margin(self,action,symbol,volume,entry):
        self.calls.append(("margin",action,symbol))
        if self.missing:return None
        return volume*1234

SYMBOL=SimpleNamespace(trade_tick_size=.01,volume_min=.01,volume_max=5,volume_step=.01)
def result(side="BUY",currency="USD",mt5=None,**k):
    d=dict(symbol="XAUUSD",side=side,volume=.1,entry=4100.0,
           stop=4090.0 if side=="BUY" else 4110.0,
           target=4120.0 if side=="BUY" else 4080.0)
    d.update(k)
    return preview_scenario(mt5 or MT5Fake(),SimpleNamespace(currency=currency),SYMBOL,**d)

class ChartStudioFoundationTests(unittest.TestCase):
    def test_buy_rr_and_margin(self):
        mt5=MT5Fake()
        r=result(mt5=mt5)
        self.assertAlmostEqual(r["riskUsd"],100)
        self.assertAlmostEqual(r["rewardUsd"],200)
        self.assertAlmostEqual(r["riskRewardRatio"],2)
        self.assertAlmostEqual(r["margin"]["amount"],123.4)
        self.assertEqual(r["mode"],"READ_ONLY_DRAFT")
        self.assertFalse(r["canExecute"])
        self.assertEqual([x[0] for x in mt5.calls],["profit","profit","margin"])
    def test_sell_pnl(self):
        r=result(side="SELL")
        self.assertAlmostEqual(r["pnlAtSl"]["amount"],-100)
        self.assertAlmostEqual(r["pnlAtTp"]["amount"],200)
    def test_non_usd_no_invented_conversion(self):
        r=result(currency="EUR")
        self.assertIsNone(r["riskUsd"])
        self.assertIsNone(r["rewardUsd"])
        self.assertEqual(r["pnlAtTp"]["currency"],"EUR")
    def test_invalid_inputs(self):
        for kw in ({"side":"HOLD"},{"entry":4100.001},{"stop":4120.0},
                   {"volume":.015},{"target":-1},{"entry":float("nan")}):
            with self.subTest(kw=kw),self.assertRaises(PreviewError):
                result(**kw)
    def test_mt5_none_does_not_fall_back(self):
        with self.assertRaises(PreviewError) as c:
            result(mt5=MT5Fake(missing=True))
        self.assertEqual(c.exception.code,"BROKER_CALC_UNAVAILABLE")
    def test_read_only_source(self):
        core=(ROOT/"chart_studio"/"money.py").read_text(encoding="utf-8")
        self.assertNotIn("order_send(",core)
        self.assertNotIn("TRADE_ACTION",core)
        app=(ROOT/"app.py").read_text(encoding="utf-8")
        self.assertIn("api_chart_preview(req: ChartScenarioPreviewRequest, account: str)",app)
        self.assertIn("if req.account != account:",app)
        self.assertIn("ChartStudioBeta?.mount",app)
        self.assertIn("ChartStudioBeta?.updatePositions",app)
        self.assertIn("ChartStudioBeta?.updateCandles",app)
        self.assertIn("acc = verify_identity(mt5, selected())",app)
        self.assertIn('result["tickSize"] = float(sym.trade_tick_size)',app)
        ui=(ROOT/"static"/"chart-studio-beta.js").read_text(encoding="utf-8")
        self.assertIn('data-cmd="drag-plan"',ui)
        self.assertIn("scenarioGeneration++",ui)
        self.assertIn("validScenario(next)",ui)
        self.assertNotIn("/api/modify_position",ui)
        self.assertNotIn("/api/close_position",ui)

if __name__=="__main__":unittest.main()
