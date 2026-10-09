"""Configuration gates keep research scripts out of test discovery."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class ReproducibleDashboardTests(unittest.TestCase):
    def test_pytest_only_collects_broker_isolated_suite(self):
        config=ROOT/'pytest.ini'
        self.assertTrue(config.exists(), 'pytest testpaths config absent')
        self.assertIn('testpaths = tests',config.read_text(encoding='utf-8'))

    def test_runtime_dependencies_are_pinned(self):
        config=ROOT/'requirements-dashboard.txt'
        self.assertTrue(config.exists(), 'runtime lock absent')
        rows=[r.strip() for r in config.read_text().splitlines() if r.strip() and not r.startswith('#')]
        self.assertGreaterEqual(len(rows),8)
        self.assertTrue(all('==' in r for r in rows))

if __name__=='__main__':unittest.main()
