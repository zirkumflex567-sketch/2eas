#!/usr/bin/env python3
"""Risk-contract tests, not a MetaEditor compile or broker real-tick backtest."""
from pathlib import Path
import unittest
import re
HERE=Path(__file__).resolve().parents[1]
CORE=(HERE/"TitanChallengeGuard.mqh").read_text(encoding="utf-8")
EA=(HERE/"XAU_Titan_Pro.mq5").read_text(encoding="utf-8")

def static_floor(initial,pct):
    return initial*(1-pct/100)

def daily_floor(day_start,initial,pct):
    return day_start-initial*pct/100

def permitted(equity,safe_floor,existing,proposed,cap=150):
    return equity>safe_floor and existing>=0 and proposed>0 and existing+proposed<=cap and equity-existing-proposed>safe_floor

def server_day(seconds,hour=0,minute=0):
    offset=hour*3600+minute*60
    return ((seconds-offset)//86400)*86400+offset

class TitanChallengeContract(unittest.TestCase):
    def test_static_usd_9200_after_account_growth(self):
        self.assertEqual(static_floor(10000,8),9200)
        self.assertEqual(static_floor(10000,8),9200)

    def test_daily_loss_is_fixed_350_even_if_account_16000(self):
        self.assertEqual(daily_floor(16000,10000,3.5),15650)
        self.assertEqual(daily_floor(10000,10000,3.5),9650)

    def test_daily_reference_uses_higher_balance_or_equity(self):
        self.assertEqual(daily_floor(max(10500,10400),10000,3.5),10150)
        self.assertEqual(daily_floor(max(11000,11400),10000,3.5),11050)

    def test_large_peak_drawdown_not_inherently_forbidden(self):
        # If the protected day's reset was at 10k, a previous 16k peak is NOT a trailing limit.
        self.assertTrue(permitted(10050,9685,60,35))
        self.assertTrue(10050<16000*.90)

    def test_available_risk_is_limited_by_current_equity_floor(self):
        self.assertFalse(permitted(9750,9685,30,40))
        self.assertTrue(permitted(9750,9685,15,25))

    def test_portfolio_stop_budget_cannot_overbook(self):
        self.assertFalse(permitted(12000,11615,130,25))
        self.assertTrue(permitted(12000,11615,100,40))

    def test_reset_crosses_midnight_with_server_offset(self):
        self.assertEqual(server_day(86400+3*3600,21),21*3600)
        self.assertEqual(server_day(86400+22*3600,21),86400+21*3600)

    def test_mql_guards_have_exact_account_reference_and_cost_adjusted_sl(self):
        for clause in [
            "reference-initial*percent/100.0",
            "initial*(1.0-percent/100.0)",
            "MathMax(static_floor,daily_floor)+safety",
            "bool MustFlatten(){return hard_lock || day_lock;}",
            "TITAN.RISK.%I64d",
            "GlobalVariablesFlush();",
            "day_ref=valid?MathMax(balance,equity):0",
            "Save()",
        ]:
            self.assertIn(clause,CORE)

    def test_mql_trading_requires_challenge_math(self):
        for clause in [
            '#include "TitanChallengeGuard.mqh"',
            "if(!TitanSafetyCheck(true))",
            "TitanNoExternalOrdersOrPositions()",
            "TitanOpenPortfolioStopRisk()",
            "TitanSyntheticMarginUsed()",
            "TitanRiskAllowed(",
            "OrderCalcProfit(kind,_Symbol,1.0,entry,stop,oneLotPnL)",
            "return 0;",
            "if(!EventSetTimer(1))",
            "InpOriginalAccountUSD!=10000.0",
            "InpMaxDailyDrawdownPercent>3.5",
            "InpMaxTotalDrawdownPercent>8.0",
            "InpRequireBrokerNewsGuard",
        ]:
            self.assertIn(clause,EA)

    def test_mql_profit_filters_opt_in(self):
        self.assertIn("InpUseM15VolumeConfirm     = false",EA)
        self.assertIn("InpUseEMA50SlopeConfirm   = false",EA)
        self.assertIn("InpProfitSelectivePyramiding= false",EA)
        self.assertIn("InpUseTrendRunnerATRStop   = false",EA)

    def test_delimiters_seem_balanced_static_only(self):
        def strip(text):
            # Strip quoted URLs BEFORE the //-comment pass; otherwise
            # a quoted https:// destroys the remainder of the source.
            text=re.sub(r'"(?:\\.|[^"\\])*"',"",text)
            text=re.sub(r"/\*[\s\S]*?\*/","",text)
            text=re.sub(r"//[^\n]*","",text)
            return text
        for c in [EA,CORE]:
            z=strip(c)
            self.assertEqual(z.count("{"),z.count("}"))
            self.assertEqual(z.count("("),z.count(")"))

if __name__=="__main__":
    unittest.main()
