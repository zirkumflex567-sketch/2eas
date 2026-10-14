import json
import tempfile
import unittest
from pathlib import Path

from backtesting.analytics import parse_report, assess
from backtesting.html_report import render
from backtesting.oos import compare, write_comparisons


def report(text):
    return "<html><table>" + "".join("<tr><td>{}</td><td>{}</td></tr>".format(a,b) for a,b in text) + "</table></html>"


class AnalyticsTests(unittest.TestCase):
    def test_extract_native_metrics_and_conservative_checks(self):
        with tempfile.TemporaryDirectory() as p:
            path = Path(p) / "native.htm"
            path.write_text(report([
                ("Total Net Profit", "1 234,56"), ("Profit Factor", "1,78"),
                ("Total Trades", "78"), ("Equity Drawdown Relative", "5,2%"),
                ("Profit Trades (% of total)", "41 (52.56%)"),
                ("History Quality", "99,9%"),
            ]), encoding="utf-8")
            m = parse_report(path)
            self.assertEqual(m["net_profit"], 1234.56)
            self.assertEqual(m["total_trades"], 78)
            self.assertAlmostEqual(m["profit_factor"], 1.78)
            screening = assess(m, {"min_trades": 50, "max_equity_drawdown_pct": 10,
                                    "min_history_quality_pct": 95})
            self.assertEqual(screening["checks"]["min_trades"], "pass")
            self.assertEqual(screening["checks"]["prop_daily_loss_rule"], "unknown")
            self.assertEqual(screening["screening_status"], "review")

    def test_missing_native_statistics_fail_closed(self):
        with tempfile.TemporaryDirectory() as p:
            path = Path(p) / "native.htm"
            path.write_text("<html><body>successful!</body></html>")
            with self.assertRaises(ValueError):
                parse_report(path)

    def test_invalid_limits_rejected(self):
        with self.assertRaises(ValueError):
            assess({}, {"max_daily_prop_loss": 350})
        self.assertEqual(assess({}, {"min_history_quality_pct": 99})
                         ["checks"]["min_history_quality_pct"], "unknown")

    def test_oos_only_valid_complete_pair(self):
        m = {"net_profit": 100, "profit_factor": 2.0,
             "total_trades": 100, "equity_max_drawdown_pct": 6.0}
        a = {"name": "IS", "run_id": "run1", "strategy_id": "Titan-A",
             "sample": "in_sample", "status": "success", "metrics": m}
        b = {"name": "OOS", "run_id": "run2", "strategy_id": "Titan-A",
             "sample": "out_of_sample", "status": "success", "metrics": dict(m, profit_factor=1.1)}
        comparison = compare([a, b])
        self.assertEqual(comparison[0]["status"], "comparable")
        self.assertEqual(comparison[0]["oos_pf_over_is_pf"], 0.55)
        self.assertFalse(comparison[0]["live_trading_approved"])
        self.assertEqual(compare([a, a, b])[0]["status"], "ambiguous")

    def test_offline_html_escapes_broker_names(self):
        with tempfile.TemporaryDirectory() as p:
            folder = Path(p)
            run = folder / "run"
            run.mkdir()
            (run / "result.json").write_text(json.dumps({
                "name": "<script>alert(1)</script>", "status": "failed", "sample": "full"}))
            write_comparisons(folder)
            render(folder)
            data = (folder / "index.html").read_text(encoding="utf-8")
            self.assertIn("&lt;script&gt;", data)
            self.assertNotIn("<script>alert(1)</script>", data)


if __name__ == "__main__":
    unittest.main()
