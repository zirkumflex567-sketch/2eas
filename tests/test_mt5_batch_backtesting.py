"""No broker access: stdlib tests of scheduler contracts."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backtesting.runner import ExclusiveLock, build_ini, load_config, run_batch


class MT5BatchContractTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / "a.ex5").write_bytes(b"EA")
        (self.repo / "a.set").write_text("Input=1\n")
        self.terminal = self.root / "research" / "terminal64.exe"
        self.terminal.parent.mkdir()
        self.terminal.write_bytes(b"exe")
        (self.terminal.parent / "MQL5" / "Experts").mkdir(parents=True)
        (self.terminal.parent / "MQL5" / "Profiles" / "Tester").mkdir(parents=True)
        self.config = self.root / "jobs.json"
        self.data = {"terminal": str(self.terminal), "portable": True,
                     "jobs": [{"name": "Test case", "expert": "a.ex5", "set_file": "a.set",
                               "symbol": "XAUUSD", "from": "2025.01.01", "to": "2025.12.31"}]}

    def load(self):
        self.config.write_text(json.dumps(self.data))
        return load_config(self.config, self.repo)

    def test_ini_explicit_real_ticks_no_cloud(self):
        ini = build_ini(self.load().jobs[0], "reports\\ea-batch\\x.htm")
        for field in ["Model=4", "UseCloud=0", "Optimization=0", "ShutdownTerminal=1", "Visual=0", "ExpertParameters="]:
            self.assertIn(field, ini)

    def test_dry_run_safe_and_lock_released(self):
        batch = self.load()
        summary = run_batch(batch, dry_run=True)
        self.assertEqual(summary["records"][0]["status"], "planned")
        self.assertFalse((self.terminal.parent / ".ea-backtesting.lock").exists())
        self.assertFalse((self.terminal.parent / "MQL5" / "Experts" / "EaBacktests").exists())

    def test_fails_closed_invalid_config(self):
        self.data["portable"] = False
        with self.assertRaises(ValueError):
            self.load()
        self.data["portable"] = True
        self.data["jobs"][0]["symbol"] = "XAUUSD\nModel=0"
        with self.assertRaises(ValueError):
            self.load()
        self.data["jobs"][0]["symbol"] = "XAUUSD"
        self.data["jobs"][0]["expert"] = "../a.ex5"
        with self.assertRaises(ValueError):
            self.load()

    def test_reject_duplicate_jobs(self):
        self.data["jobs"].append(dict(self.data["jobs"][0]))
        with self.assertRaises(ValueError):
            self.load()

    def test_lock_prevents_parallel(self):
        path = self.root / "lock"
        with ExclusiveLock(path):
            with self.assertRaises(RuntimeError):
                with ExclusiveLock(path):
                    pass
        self.assertFalse(path.exists())

    def test_missing_report_is_not_success(self):
        class FakeProc:
            def wait(self, timeout):
                return 0
        batch = self.load()
        with patch("backtesting.runner.sys.platform", "win32"), patch("backtesting.runner.subprocess.Popen", return_value=FakeProc()):
            summary = run_batch(batch)
        self.assertEqual(summary["records"][0]["status"], "failed")
        self.assertIn("No complete report", summary["records"][0]["error"])

    def test_retry_and_resume_after_native_report(self):
        class FakeProc:
            def wait(self, timeout):
                return 0
        batch = self.load()
        def report_writing_launch(command, **kwargs):
            ini = Path(command[1][len("/config:"):]).read_text(encoding="ascii")
            report_rel = next(line.split("=", 1)[1] for line in ini.splitlines() if line.startswith("Report="))
            report = self.terminal.parent / Path(report_rel.replace("\\", "/"))
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text("<html><table>" + "".join("<tr><td>%s</td><td>%s</td></tr>" % p for p in [("Total Net Profit", "120.50"), ("Profit Factor", "1.45"), ("Total Trades", "50"), ("Equity Drawdown Relative", "5.20%"), ("History Quality", "99.00%"), ("Profit Trades (% of total)", "31 (62.00%)")]) + "</table></html>" + " " * 220)
            return FakeProc()
        with patch("backtesting.runner.sys.platform", "win32"), patch("backtesting.runner.subprocess.Popen", side_effect=report_writing_launch):
            first = run_batch(batch)
        self.assertEqual(first["records"][0]["status"], "success")
        self.assertEqual(first["records"][0]["metrics"]["total_trades"], 50)
        self.assertTrue((batch.output / "batch_metrics.csv").exists())
        with patch("backtesting.runner.sys.platform", "win32"), patch("backtesting.runner.subprocess.Popen", side_effect=AssertionError("no second launch")):
            second = run_batch(batch)
        self.assertEqual(second["records"][0]["status"], "skipped_success")


if __name__ == "__main__":
    unittest.main()

