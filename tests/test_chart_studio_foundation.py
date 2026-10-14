"""Unit & regression contracts for the read-only Chart Studio foundation."""
import unittest
from pathlib import Path
from types import SimpleNamespace
from chart_studio.money import PreviewError, preview_scenario, size_for_risk_budget

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
    def test_risk_budget_sizing_uses_broker_profit_and_rounds_down_to_lot_step(self):
        mt5=MT5Fake()
        sized=size_for_risk_budget(mt5,SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
                                   symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_budget=100)
        self.assertEqual(sized["volumeLots"],.1)
        self.assertEqual(sized["riskBudget"],100)
        self.assertEqual(sized["grossStopRisk"],100)
        self.assertEqual(sized["currency"],"USD")
        self.assertGreater(len(mt5.calls),0)
        self.assertTrue(all(call[0]=="profit" for call in mt5.calls))

    def test_risk_budget_sizing_includes_fee_and_adverse_slippage_assumptions(self):
        sized=size_for_risk_budget(MT5Fake(),SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
            symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_budget=100,
            fees_per_lot=3,slippage_ticks=2)
        self.assertEqual(sized["volumeLots"],.09)
        self.assertAlmostEqual(sized["grossStopRisk"],90.18)
        self.assertAlmostEqual(sized["estimatedFees"],.27)
        self.assertAlmostEqual(sized["estimatedTotalStopRisk"],90.45)

    def test_risk_sizing_fails_closed_on_non_monotonic_broker_curve(self):
        class NonMonotonicMT5(MT5Fake):
            def order_calc_profit(self, action, symbol, volume, entry, close):
                self.calls.append(("profit", action, symbol))
                loss = volume * 1000
                if abs(volume - .03) < 1e-8:
                    loss = 1
                return -loss
        with self.assertRaises(PreviewError) as ctx:
            size_for_risk_budget(NonMonotonicMT5(),SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
                                 symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_budget=101)
        self.assertEqual(ctx.exception.code,"BROKER_CALC_INVALID")

    def test_risk_sizing_step_cap_accepts_boundary_and_rejects_above_without_mt5_calls(self):
        class CountingMT5(MT5Fake):
            def order_calc_profit(self, action, symbol, volume, entry, close):
                self.calls.append(("profit", action, symbol))
                return -volume
        account=SimpleNamespace(equity=10000,currency="USD")
        boundary=SimpleNamespace(trade_tick_size=.01,volume_min=.01,volume_max=100.01,volume_step=.01)
        mt5=CountingMT5()
        sized=size_for_risk_budget(mt5,account,boundary,symbol="XAUUSD",side="BUY",
                                   entry=4100,stop=4090,risk_budget=101)
        self.assertEqual(sized["volumeLots"],100.01)
        self.assertEqual(len(mt5.calls),10001)

        too_wide=SimpleNamespace(trade_tick_size=.01,volume_min=.01,volume_max=100.02,volume_step=.01)
        mt5=CountingMT5()
        with self.assertRaises(PreviewError) as ctx:
            size_for_risk_budget(mt5,account,too_wide,symbol="XAUUSD",side="BUY",
                                 entry=4100,stop=4090,risk_budget=101)
        self.assertEqual(ctx.exception.code,"SIZING_RANGE_TOO_LARGE")
        self.assertEqual(mt5.calls,[])

    def test_risk_sizing_rejects_invalid_percent_and_unknown_currency(self):
        for percent in (0, -1, 101, float("nan"), float("inf")):
            with self.subTest(percent=percent),self.assertRaises(PreviewError):
                size_for_risk_budget(MT5Fake(),SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
                                     symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_percent=percent)
        with self.assertRaises(PreviewError) as ctx:
            size_for_risk_budget(MT5Fake(),SimpleNamespace(equity=10000,currency=""),SYMBOL,
                                 symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_budget=101)
        self.assertEqual(ctx.exception.code,"ACCOUNT_CURRENCY_UNKNOWN")

    def test_risk_percent_sizing_requires_equity_and_respects_sell_direction(self):
        sized=size_for_risk_budget(MT5Fake(),SimpleNamespace(equity=10000,currency="EUR"),SYMBOL,
                                   symbol="XAUUSD",side="SELL",entry=4100,stop=4110,risk_percent=.5)
        self.assertEqual(sized["volumeLots"],.05)
        self.assertEqual(sized["riskBudget"],50)
        self.assertEqual(sized["riskPercent"],.5)
        self.assertEqual(sized["currency"],"EUR")

    def test_risk_sizing_rejects_budget_below_minimum_and_missing_broker_values(self):
        for kwargs in ({"risk_budget":1},{"risk_percent":.5}):
            account=SimpleNamespace(currency="USD",equity=100 if "risk_percent" in kwargs else 0)
            with self.subTest(kwargs=kwargs),self.assertRaises(PreviewError):
                size_for_risk_budget(MT5Fake(),account,SYMBOL,symbol="XAUUSD",side="BUY",
                                     entry=4100,stop=4090,**kwargs)
        with self.assertRaises(PreviewError):
            size_for_risk_budget(MT5Fake(missing=True),SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
                                 symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_budget=101)
        with self.assertRaises(PreviewError):
            size_for_risk_budget(MT5Fake(),SimpleNamespace(equity=0,currency="USD"),SYMBOL,
                                 symbol="XAUUSD",side="BUY",entry=4100,stop=4090,risk_percent=.5)

    def test_invalid_target_is_rejected_before_risk_sizing_calls_mt5(self):
        mt5=MT5Fake()
        with self.assertRaises(PreviewError):
            preview_scenario(mt5,SimpleNamespace(equity=10000,currency="USD"),SYMBOL,
                             symbol="XAUUSD",side="BUY",entry=4100,stop=4090,target=4080,
                             risk_budget=100)
        self.assertEqual(mt5.calls,[])

    def test_preview_request_accepts_exactly_one_lot_sizing_mode(self):
        from pydantic import ValidationError
        from app import ChartScenarioPreviewRequest
        base=dict(account="titan",symbol="XAUUSD",side="BUY",entryPrice=4100,slPrice=4090,tpPrice=4120)
        self.assertEqual(ChartScenarioPreviewRequest(**base,volumeLots=.1).volumeLots,.1)
        self.assertEqual(ChartScenarioPreviewRequest(**base,riskBudget=100).riskBudget,100)
        self.assertEqual(ChartScenarioPreviewRequest(**base,riskPercent=.5).riskPercent,.5)
        for sizing in ({},{"volumeLots":.1,"riskBudget":100},{"riskBudget":100,"riskPercent":.5}):
            with self.subTest(sizing=sizing),self.assertRaises(ValidationError):
                ChartScenarioPreviewRequest(**base,**sizing)
        for sizing in ({"volumeLots":True},{"riskBudget":True},{"riskPercent":True}):
            with self.subTest(sizing=sizing),self.assertRaises(ValidationError):
                ChartScenarioPreviewRequest(**base,**sizing)

    def test_preview_request_validates_cost_assumptions(self):
        from pydantic import ValidationError
        from app import ChartScenarioPreviewRequest
        base=dict(account="titan",symbol="XAUUSD",side="BUY",volumeLots=.1,entryPrice=4100,slPrice=4090,tpPrice=4120)
        self.assertEqual(ChartScenarioPreviewRequest(**base,feesPerLot=3.5,slippageTicks=4).slippageTicks,4)
        for invalid in ({"feesPerLot":True},{"feesPerLot":-1},{"feesPerLot":10001},
                        {"slippageTicks":True},{"slippageTicks":1.5},{"slippageTicks":1001}):
            with self.subTest(invalid=invalid),self.assertRaises(ValidationError):
                ChartScenarioPreviewRequest(**base,**invalid)

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

    def test_buy_cost_assumptions_show_gross_and_net_estimates(self):
        r=result(fees_per_lot=3,slippage_ticks=2)
        self.assertAlmostEqual(r["pnlAtSl"]["amount"],-100)
        self.assertAlmostEqual(r["pnlAtTp"]["amount"],200)
        self.assertAlmostEqual(r["netEstimate"]["pnlAtSl"]["amount"],-100.5)
        self.assertAlmostEqual(r["netEstimate"]["pnlAtTp"]["amount"],199.5)
        self.assertAlmostEqual(r["netEstimate"]["riskRewardRatio"],1.985)
        self.assertEqual(r["estimatedCosts"]["source"],"USER_ASSUMPTION")

    def test_sell_slippage_is_adverse_and_fees_are_subtracted_once(self):
        r=result(side="SELL",fees_per_lot=2,slippage_ticks=3)
        self.assertAlmostEqual(r["netEstimate"]["pnlAtSl"]["amount"],-100.5)
        self.assertAlmostEqual(r["netEstimate"]["pnlAtTp"]["amount"],199.5)

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
