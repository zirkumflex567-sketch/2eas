"""Regression contracts for a combined read-only journal across verified MT5 accounts.

Runs without MT5 or external dependencies:
    python -m unittest discover -s tests -p test_journal_multi_strategy_contract.py
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CombinedJournalContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = (ROOT / "app.py").read_text(encoding="utf-8")

    def test_filter_is_visible_and_includes_all_strategies(self):
        self.assertIn('id="journal-strategy-filter"', self.app)
        self.assertIn('<option value="all">', self.app)
        self.assertIn('<option value="blueberry">', self.app)
        self.assertIn('<option value="titan">', self.app)
        self.assertIn('<option value="goldm15">', self.app)
        self.assertIn("let journalFilter = deepLinkedAccount ||", self.app)
        self.assertIn("savedJournalFilter : 'all'", self.app)

    def test_journal_queries_explicit_account_not_active_order_context(self):
        self.assertIn("const wanted = mode === 'all' ? Object.keys(accounts) : [mode];", self.app)
        self.assertIn("'/api/journal_summary?account=' + encodeURIComponent(id)", self.app)
        self.assertIn("if (payload.account !== id || !Array.isArray(payload.journal))", self.app)
        self.assertIn("payload.journal.some(item => item.account !== id)", self.app)
        self.assertIn("journalRequestVersion", self.app)
        self.assertIn("const fresh = {};", self.app)

    def test_timestamp_sorting_and_accurate_scope(self):
        self.assertIn("'time_ts': int(p.time)", self.app)
        self.assertIn("'time_ts': int(d.time)", self.app)
        self.assertIn("entries.sort(key=lambda x: x['time_ts'], reverse=True)", self.app)
        self.assertIn("wanted.flatMap(id => journalEntriesByAccount[id] || [])", self.app)
        self.assertIn("(Number(b.time_ts) || 0) - (Number(a.time_ts) || 0)", self.app)
        self.assertIn("const stratBadge =", self.app)

    def test_partial_failures_are_not_hidden_or_counted_as_success(self):
        self.assertIn('id="journal-sync-status"', self.app)
        self.assertIn("journalErrors.push((accounts[result.id]?.name || result.id)", self.app)
        self.assertIn("fresh[result.id] = result.entries;", self.app)
        self.assertIn("Journal unvollständig", self.app)
        self.assertIn("journalLoadedMode !== journalFilter", self.app)

    def test_separate_refresh_does_not_override_trading_account(self):
        self.assertIn("two_eas_journal_filter", self.app)
        self.assertIn("setInterval(() => { void refreshJournal(); }, 30000)", self.app)
        self.assertNotIn("renderJournal(data.journal);", self.app)
        self.assertIn("await Promise.all([updateStatus(),loadCandles()]);", self.app)


if __name__ == "__main__":
    unittest.main()
