"""Backend performance and account isolation regression checks (no live MT5 required)."""
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd

import app


class PerformanceRegressionTests(unittest.TestCase):
    def test_vectorized_volume_profile_matches_legacy_reference(self):
        rng = np.random.default_rng(1234)
        base = rng.normal(4000, 15, 500)
        high = base + rng.uniform(.01, 6, 500)
        low = base - rng.uniform(.01, 6, 500)
        volume = rng.integers(0, 999, 500)
        frame = pd.DataFrame({'high': high, 'low': low, 'tick_volume': volume})
        for n in (8, 20, 25, 60):
            result = app.compute_volume_profile(frame, n)
            bins = np.linspace(frame.low.min(), frame.high.max(), n + 1)
            original = np.zeros(n, dtype=float)
            for _, row in frame.iterrows():
                mid = (row.high + row.low) / 2
                index = int(np.clip((mid - bins[0]) / (bins[-1] - bins[0]) * n, 0, n - 1))
                original[index] += row.tick_volume
            expected_poc = float((bins[np.argmax(original)] + bins[np.argmax(original)+1]) / 2)
            self.assertEqual(result['poc'], round(expected_poc, 2))
            self.assertEqual(result['total_volume'], int(original.sum()))

    def test_cache_is_account_scoped_and_expires(self):
        with patch.object(app, 'build_trade_journal', side_effect=lambda account,*_: [account]) as build, \
             patch.object(app.time, 'monotonic', side_effect=[100., 101., 101.5, 104.1]):
            old_cache, old_at = dict(app.JOURNAL_CACHE), dict(app.JOURNAL_CACHE_AT)
            try:
                app.JOURNAL_CACHE.clear(); app.JOURNAL_CACHE_AT.clear()
                self.assertEqual(app.get_cached_trade_journal('titan', None, None), ['titan'])
                self.assertEqual(app.get_cached_trade_journal('titan', None, None), ['titan'])
                self.assertEqual(app.get_cached_trade_journal('goldm15', None, None), ['goldm15'])
                self.assertEqual(app.get_cached_trade_journal('titan', None, None), ['titan'])
                self.assertEqual(build.call_count, 3)
            finally:
                app.JOURNAL_CACHE.clear(); app.JOURNAL_CACHE.update(old_cache)
                app.JOURNAL_CACHE_AT.clear(); app.JOURNAL_CACHE_AT.update(old_at)


if __name__ == '__main__':
    unittest.main()
