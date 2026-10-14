"""Per-Fibonacci drawing levels: persisted safely with strict workspace validation."""
import unittest

from chart_studio.workspaces import StoreError, validate_document


def document(drawing):
    return {
        "schemaVersion": 1, "drawings": [drawing],
        "options": {}, "indicators": {}, "timeframe": "M15",
    }


def fib(levels=None):
    row = {"kind": "fib", "anchors": [
        {"time": 1700000000, "price": 4100.0},
        {"time": 1700000900, "price": 4200.0},
    ]}
    if levels is not None:
        row["levels"] = levels
    return row


class FibLevelTests(unittest.TestCase):
    def test_default_document_is_backward_compatible(self):
        self.assertNotIn("levels", validate_document(document(fib()))["drawings"][0])

    def test_valid_extension_persists_exact_levels(self):
        values = [-.5, 0, .25, 1, 2.618]
        item = validate_document(document(fib(values)))["drawings"][0]
        self.assertEqual(item["levels"], values)

    def test_rejects_bad_or_malicious_levels(self):
        cases = [
            [], [0] * 17, [-10.01], [10.01], [0, .5, .5], [.7, .5],
            [False], [float("nan")], [float("inf")], ["0; alert(1)"],
            [{"svg": "<script>"}],
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(StoreError):
                validate_document(document(fib(case)))

    def test_levels_for_non_fib_are_disallowed(self):
        row = {"kind": "horizontal", "anchors": [{"time": 1700000000, "price": 4100.0}],
               "levels": [0, .5, 1]}
        with self.assertRaises(StoreError):
            validate_document(document(row))


if __name__ == "__main__":
    unittest.main()
