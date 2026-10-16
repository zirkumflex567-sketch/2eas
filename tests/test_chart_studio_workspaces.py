"""Chart Studio SQLite layout storage and guarded HTTP integration; no real MT5."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from chart_studio.workspaces import (
    WorkspaceStore, StoreError, RevisionConflict, WorkspaceMissing,
    validate_document,
)

def example():
    return {
        "schemaVersion": 1,
        "drawings": [
            {"kind": "horizontal", "anchors": [{"time": 1700000000, "price": 4175.50}]},
            {"kind": "fib", "anchors": [
                {"time": 1700000000, "price": 4100.0},
                {"time": 1700000900, "price": 4200.0},
            ]},
        ],
        "options": {"ema20": True, "positions": False},
        "indicators": {"rsi": {"enabled": True, "period": 14},
                       "macd": {"enabled": False, "fast": 12, "slow": 26, "signal": 9}},
        "timeframe": "M15",
    }


class SqliteLayoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "private" / "chart.db"
        self.store = WorkspaceStore(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_save_load_restart_migration_and_list(self):
        initial = self.store.put("local-owner", "titan", "XAUUSD", "Scalping", example(), 0)
        self.assertEqual(initial["revision"], 1)
        self.assertEqual(initial["document"], example())
        reopened = WorkspaceStore(self.path)
        loaded = reopened.get("local-owner", "titan", "XAUUSD", "Scalping")
        self.assertEqual(loaded["document"], example())
        self.assertEqual(reopened.list("local-owner", "titan", "XAUUSD")[0]["revision"], 1)
        self.assertEqual(self.store.path.parent.name, "private")

    def test_optimistic_updates_and_conflicts(self):
        doc = example()
        self.store.put("local-owner", "titan", "XAUUSD", "Scalping", doc, 0)
        with self.assertRaises(RevisionConflict):
            self.store.put("local-owner", "titan", "XAUUSD", "Scalping", doc, 0)
        doc["options"]["positions"] = True
        result = self.store.put("local-owner", "titan", "XAUUSD", "Scalping", doc, 1)
        self.assertEqual(result["revision"], 2)
        with self.assertRaises(RevisionConflict):
            self.store.delete("local-owner", "titan", "XAUUSD", "Scalping", 1)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Scalping")["revision"], 2)
        self.assertTrue(self.store.delete("local-owner", "titan", "XAUUSD", "Scalping", 2)["deleted"])
        with self.assertRaises(WorkspaceMissing):
            self.store.get("local-owner", "titan", "XAUUSD", "Scalping")

    def test_separate_accounts_owners_symbols(self):
        for owner, account, symbol in [
            ("local-owner", "titan", "XAUUSD"),
            ("local-owner", "goldm15", "XAUUSD"),
            ("other-owner", "titan", "XAUUSD"),
            ("local-owner", "titan", "EURUSD"),
        ]:
            self.store.put(owner, account, symbol, "London", example(), 0)
        self.assertEqual(self.store.list("local-owner", "goldm15", "XAUUSD")[0]["name"], "London")
        self.store.delete("local-owner", "titan", "XAUUSD", "London", 1)
        self.assertEqual(len(self.store.list("local-owner", "titan", "XAUUSD")), 0)
        self.assertEqual(len(self.store.list("other-owner", "titan", "XAUUSD")), 1)
        self.assertEqual(len(self.store.list("local-owner", "goldm15", "XAUUSD")), 1)
        self.assertEqual(len(self.store.list("local-owner", "titan", "EURUSD")), 1)

    def test_rejected_bad_drawing_geometry_and_nonfinite(self):
        cases = [({"kind": "unknown", "anchors": [{"time": 1, "price": 1}]}),
                 ({"kind": "horizontal", "anchors": [{"time": 1, "price": float("nan")}]}),
                 ({"kind": "horizontal", "anchors": [{"time": True, "price": 1}]}),
                 ({"kind": "horizontal", "anchors": [{"time": 1, "price": 0}]}),
                 ({"kind": "trend", "anchors": [{"time": 1, "price": 1}]}),
                 ({"kind": "horizontal", "anchors": [{"time": 1, "price": 1, "script": "alert(1)"}]})]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(StoreError):
                doc = example()
                doc["drawings"] = [case]
                validate_document(doc)

    def test_vertical_time_line_roundtrips_with_one_anchor(self):
        doc = example()
        doc["drawings"] = [{"kind": "vertical", "anchors": [
            {"time": 1700000000, "price": 4175.5}]}]
        saved = self.store.put("local-owner", "titan", "XAUUSD", "Vertical", doc, 0)
        self.assertEqual(saved["document"]["drawings"], doc["drawings"])
        for anchors in [[], doc["drawings"][0]["anchors"] * 2]:
            with self.subTest(count=len(anchors)), self.assertRaises(StoreError):
                validate_document({**doc, "drawings": [{"kind": "vertical", "anchors": anchors}]})

    def test_text_annotation_requires_bounded_label_and_roundtrips(self):
        doc = example()
        doc["drawings"] = [{"kind": "text", "anchors": [
            {"time": 1700000000, "price": 4175.5}], "label": "Setup"}]
        saved = self.store.put("local-owner", "titan", "XAUUSD", "Note", doc, 0)
        self.assertEqual(saved["document"]["drawings"], doc["drawings"])
        safe_text = "<script>alert(1)</script>"
        safe_doc = {**doc, "drawings": [{**doc["drawings"][0], "label": safe_text}]}
        self.assertEqual(validate_document(safe_doc)["drawings"][0]["label"], safe_text)
        for label in ["", "  ", "x" * 41, "bad\nline"]:
            with self.subTest(label=label), self.assertRaises(StoreError):
                validate_document({**doc, "drawings": [{**doc["drawings"][0], "label": label}]})

    def test_reject_unknown_keys_scaling_and_executables(self):
        tests = [
            dict(schemaVersion=2),
            dict(options={"clickToOrder": True}),
            dict(indicators={"evil": {"enabled": True}}),
            dict(timeframe="a script"),
            dict(drawings=[example()["drawings"][0]] * 1001),
        ]
        for change in tests:
            with self.subTest(change=str(change)[:60]), self.assertRaises(StoreError):
                validate_document({**example(), **change})

    def test_1000_drawings_roundtrip_and_1001_is_rejected_before_persistence(self):
        drawings = [{
            "id": f"capacity-{index:04d}",
            "kind": "horizontal",
            "anchors": [{"time": 1700000000 + index, "price": 4000 + index / 10}],
        } for index in range(1000)]
        doc = {**example(), "drawings": drawings}

        result = self.store.put("local-owner", "titan", "XAUUSD", "Capacity", doc, 0)
        self.assertEqual(result["revision"], 1)
        self.assertEqual(len(result["document"]["drawings"]), 1000)
        reopened = WorkspaceStore(self.path)
        loaded = reopened.get("local-owner", "titan", "XAUUSD", "Capacity")
        self.assertEqual(loaded["revision"], 1)
        self.assertEqual(loaded["document"]["drawings"], drawings)

        oversized = {**doc, "drawings": drawings + [{
            "id": "capacity-1000",
            "kind": "horizontal",
            "anchors": [{"time": 1700001000, "price": 4100}],
        }]}
        with self.assertRaises(StoreError):
            self.store.put("local-owner", "titan", "XAUUSD", "Over capacity", oversized, 0)
        with self.assertRaises(WorkspaceMissing):
            self.store.get("local-owner", "titan", "XAUUSD", "Over capacity")

    def test_near_512_kib_workspace_with_1000_custom_fibos_roundtrips(self):
        levels = [(index - 8) * 1.23456789012345 for index in range(16)]
        drawings = [{
            "id": f"x{index:031d}",
            "kind": "fib",
            "anchors": [
                {"time": 7258118400, "price": 1e15},
                {"time": 7258118399, "price": 999999999999999.0},
            ],
            "levels": levels,
            "label": "x" * 40,
            "visible": True,
            "locked": True,
        } for index in range(1000)]
        doc = {**example(), "drawings": drawings}
        encoded_bytes = len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        self.assertGreater(encoded_bytes, 500 * 1024)
        self.assertLessEqual(encoded_bytes, 512 * 1024)

        saved = self.store.put("local-owner", "titan", "XAUUSD", "Large capacity", doc, 0)
        loaded = WorkspaceStore(self.path).get("local-owner", "titan", "XAUUSD", "Large capacity")
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(loaded["revision"], 1)
        self.assertEqual(loaded["document"]["drawings"], drawings)

    def test_malicious_name_and_scope_rejected(self):
        for account, symbol, name in [
            ("other", "XAUUSD", "X"), ("titan", "XAUUSD", "../secret"),
            ("titan", "XAUUSD", " a "), ("titan", "XAUUSD", ""),
            ("titan", "XAUUSD", "x" * 65), ("titan", "../../x", "X"),
        ]:
            with self.subTest(account=account, symbol=symbol, name=name):
                with self.assertRaises(StoreError):
                    self.store.put("local-owner", account, symbol, name, example(), 0)

    def test_atomic_conflicting_writers(self):
        self.store.put("local-owner", "titan", "XAUUSD", "Shared", example(), 0)
        barrier = threading.Barrier(2)
        results = []
        lock = threading.Lock()
        def worker(n):
            doc = example()
            doc["options"]["ema20"] = bool(n)
            barrier.wait(timeout=5)
            try:
                self.store.put("local-owner", "titan", "XAUUSD", "Shared", doc, 1)
                status = "saved"
            except RevisionConflict:
                status = "conflict"
            with lock:
                results.append(status)
        threads = [threading.Thread(target=worker,args=(n,)) for n in (0,1)]
        for t in threads:t.start()
        for t in threads:t.join(timeout=10)
        self.assertCountEqual(results, ["saved","conflict"])
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Shared")["revision"], 2)

    def test_advanced_drawing_shapes_and_revisions(self):
        base = example()
        base["drawings"] = [
            {"kind": "ray", "anchors": [
                {"time": 1700000000, "price": 4100},
                {"time": 1700000900, "price": 4120}]},
            {"kind": "ruler", "anchors": [
                {"time": 1700000000, "price": 4100},
                {"time": 1700000900, "price": 4120}]},
            {"kind": "channel", "anchors": [
                {"time": 1700000000, "price": 4100},
                {"time": 1700000900, "price": 4120},
                {"time": 1700001800, "price": 4145}]},
        ]
        saved = self.store.put("local-owner", "titan", "XAUUSD", "Advanced", base, 0)
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Advanced")["document"], base)
        for broken in [
            {"kind": "channel", "anchors": base["drawings"][2]["anchors"][:2]},
            {"kind": "ruler", "anchors": base["drawings"][2]["anchors"]},
            {"kind": "ray", "anchors": [{"time": 1, "price": float("inf")}, {"time": 2, "price": 2}]},
        ]:
            with self.subTest(broken=broken["kind"]), self.assertRaises(StoreError):
                doc = example()
                doc["drawings"] = [broken]
                validate_document(doc)

    def test_multi_average_configs_backward_compatible_and_strict(self):
        cfg = {"id":"ma1","type":"EMA","period":34,"source":"hlc3",
               "color":"#68dfff","lineWidth":3,"visible":True,"label":"Trend 34"}
        old = example()
        self.assertNotIn("movingAverages", validate_document(old))
        rma = {**cfg, "type":"RMA", "period":1}
        smma = {**cfg, "type":"SMMA", "period":1000}
        shifted = {**cfg, "displayShift":-500}
        self.assertEqual(validate_document({**old,"movingAverages":[rma]})["movingAverages"],[rma])
        self.assertEqual(validate_document({**old,"movingAverages":[smma]})["movingAverages"],[smma])
        self.assertEqual(validate_document({**old,"movingAverages":[shifted]})["movingAverages"],[shifted])
        current = {**old, "movingAverages":[cfg]}
        self.assertEqual(validate_document(current)["movingAverages"], [cfg])
        saved = self.store.put("local-owner","titan","XAUUSD","Multi",current,0)
        self.assertEqual(saved["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Multi")["document"],current)
        for bad in [
            [cfg, cfg],
            [{**cfg,"period":0}],
            [{**cfg,"period":1001}],
            [{**cfg,"displayShift":501}],
            [{**cfg,"displayShift":-501}],
            [{**cfg,"displayShift":1.5}],
            [{**cfg,"period":2.2}],
            [{**cfg,"color":"red"}],
            [{**cfg,"source":"foo"}],
            [{**cfg,"visible":"true"}],
            [{**cfg,"lineWidth":5}],
            [{**cfg,"label":"x"*41}],
            [{**cfg,"onclick":"alert(1)"}],
            [{**cfg,"id":"../insecure"}],
            [cfg]*17
        ]:
            with self.subTest(case=str(bad)[:50]),self.assertRaises(StoreError):
                validate_document({**old,"movingAverages":bad})
        volume = {"enabled":True,"upColor":"#22aa66","downColor":"#dd4455"}
        document = validate_document({**old,"indicators":{"volume":volume}})
        self.assertEqual(document["indicators"]["volume"],volume)
        for bad_volume in [
            {**volume,"upColor":"red"},
            {**volume,"downColor":"url(https://bad)"},
            {**volume,"unknown":"#000000"},
        ]:
            with self.subTest(bad_volume=bad_volume),self.assertRaises(StoreError):
                validate_document({**old,"indicators":{"volume":bad_volume}})
        with self.assertRaises(StoreError):
            validate_document({**old,"movingAverages":"no"})

    def test_supertrend_settings_roundtrip_and_bounds(self):
        original = example()
        settings = {"enabled":True,"period":10,"multiplier":3.0}
        document = {**original,"indicators":{"supertrend":settings}}
        self.assertEqual(validate_document(document)["indicators"]["supertrend"],settings)
        saved = self.store.put("local-owner","titan","XAUUSD","Supertrend",document,0)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Supertrend")["document"],document)
        for invalid in [
            {**settings,"period":1},{**settings,"period":201},
            {**settings,"multiplier":0},{**settings,"multiplier":10.1},
            {**settings,"period":10.0},{**settings,"multiplier":2.55},
            {**settings,"multiplier":float("nan")},{**settings,"unknown":1},
        ]:
            with self.subTest(invalid=invalid),self.assertRaises(StoreError):
                validate_document({**original,"indicators":{"supertrend":invalid}})
        with self.assertRaises(StoreError):
            validate_document({**original,"indicators":{"rsi":{"enabled":True,"period":14,"multiplier":3}}})

    def test_donchian_settings_roundtrip_and_bounds(self):
        original = example()
        settings = {"enabled": True, "period": 20}
        document = {**original, "indicators": {"donchian": settings}}
        self.assertEqual(validate_document(document)["indicators"]["donchian"], settings)
        self.store.put("local-owner", "titan", "XAUUSD", "Donchian", document, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Donchian")["document"]["indicators"]["donchian"], settings)
        for invalid in [
            {**settings, "period": 1}, {**settings, "period": 201},
            {**settings, "period": 20.0}, {**settings, "period": True},
            {**settings, "unknown": 1},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"donchian": invalid}})

    def test_linear_regression_channel_settings_roundtrip_and_bounds(self):
        original = example()
        settings = {"enabled": True, "period": 20, "multiplier": 2.0}
        document = {**original, "indicators": {"linearRegression": settings}}
        self.assertEqual(validate_document(document)["indicators"]["linearRegression"], settings)
        self.store.put("local-owner", "titan", "XAUUSD", "Regression", document, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Regression")["document"]["indicators"]["linearRegression"], settings)
        for invalid in [
            {**settings, "period": 1}, {**settings, "period": 201},
            {**settings, "period": 20.0}, {**settings, "period": True},
            {**settings, "multiplier": 0}, {**settings, "multiplier": 10.1},
            {**settings, "multiplier": 2.55}, {**settings, "unknown": 1},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"linearRegression": invalid}})

    def test_keltner_settings_roundtrip_and_bounds(self):
        original = example()
        settings = {"enabled": True, "period": 20, "atrPeriod": 10, "multiplier": 2.0}
        document = {**original, "indicators": {"keltner": settings}}
        self.assertEqual(validate_document(document)["indicators"]["keltner"], settings)
        self.store.put("local-owner", "titan", "XAUUSD", "Keltner", document, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Keltner")["document"]["indicators"]["keltner"], settings)
        for invalid in [
            {**settings, "period": 1}, {**settings, "period": 201},
            {**settings, "atrPeriod": 1}, {**settings, "atrPeriod": 201},
            {**settings, "multiplier": 0}, {**settings, "multiplier": 10.1},
            {**settings, "multiplier": 2.05}, {**settings, "unknown": 1},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"keltner": invalid}})

    def test_atr_bands_settings_roundtrip_and_strict_bounds(self):
        original = example()
        settings = {"enabled": True, "period": 20, "atrPeriod": 14, "multiplier": 2.0}
        document = {**original, "indicators": {"atrBands": settings}}
        self.assertEqual(validate_document(document)["indicators"]["atrBands"], settings)
        saved = self.store.put("local-owner", "titan", "XAUUSD", "ATR Bands", document, 0)
        self.assertEqual(saved["document"]["indicators"]["atrBands"], settings)
        reloaded = WorkspaceStore(self.path).get("local-owner", "titan", "XAUUSD", "ATR Bands")
        self.assertEqual(reloaded["document"]["indicators"]["atrBands"], settings)
        self.assertEqual(validate_document(original), original, "Existing schema-v1 workspaces remain unchanged")
        for invalid in [
            {**settings, "period": 1}, {**settings, "period": 201},
            {**settings, "atrPeriod": 1}, {**settings, "atrPeriod": 201},
            {**settings, "multiplier": 0}, {**settings, "multiplier": 10.1},
            {**settings, "multiplier": 2.05}, {**settings, "unknown": True},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"atrBands": invalid}})

    def test_parabolic_sar_settings_roundtrip_and_bounds(self):
        original = example()
        settings = {"enabled": True, "step": 0.02, "maxStep": 0.2}
        document = {**original, "indicators": {"sar": settings}}
        self.assertEqual(validate_document(document)["indicators"]["sar"], settings)
        self.store.put("local-owner", "titan", "XAUUSD", "Parabolic SAR", document, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Parabolic SAR")["document"]["indicators"]["sar"], settings)
        for invalid in [
            {**settings, "step": 0}, {**settings, "step": 0.101},
            {**settings, "maxStep": 0.049}, {**settings, "maxStep": 0.501},
            {**settings, "step": 0.03, "maxStep": 0.02},
            {**settings, "step": 0.015}, {**settings, "unknown": 1},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"sar": invalid}})

    def test_obv_and_mfi_workspace_settings_are_scoped_and_strict(self):
        original = example()
        indicators = {"obv": {"enabled": True}, "mfi": {"enabled": True, "period": 14}}
        document = {**original, "indicators": indicators}
        self.assertEqual(validate_document(document)["indicators"], indicators)
        self.store.put("local-owner", "titan", "XAUUSD", "Volume flows", document, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Volume flows")["document"]["indicators"], indicators)
        for invalid in [
            {"enabled": True, "period": 1}, {"enabled": True, "period": 201},
            {"enabled": True, "period": 14, "multiplier": 2},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**original, "indicators": {"mfi": invalid}})
        with self.assertRaises(StoreError):
            validate_document({**original, "indicators": {"obv": {"enabled": True, "period": 14}}})

    def test_bollinger_settings_are_backward_compatible_strict_and_scoped(self):
        old = example()
        self.assertEqual(validate_document(old)["options"], old["options"])
        options = {**old["options"], "bbPeriod": 34, "bbStdDev": 1.5, "bbFill": False}
        document = {**old, "options": options}
        self.assertEqual(validate_document(document)["options"], options)
        saved = self.store.put("local-owner", "titan", "XAUUSD", "Bands", document, 0)
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Bands")["document"]["options"], options)
        for invalid in [
            {**options, "bbPeriod": True}, {**options, "bbPeriod": 1},
            {**options, "bbPeriod": 301}, {**options, "bbStdDev": 0},
            {**options, "bbStdDev": 10.1}, {**options, "bbStdDev": float("nan")},
            {**options, "bbFill": 0}, {**options, "bbUnknown": True},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**old, "options": invalid})

    def test_vwap_session_settings_validate_iana_zone_and_wall_clock(self):
        old = example()
        self.assertEqual(validate_document(old)["indicators"], old["indicators"])
        config = {"enabled": True, "timeZone": "America/New_York", "sessionStart": "09:30"}
        doc = {**old, "indicators": {**old["indicators"], "vwap": config}}
        self.assertEqual(validate_document(doc)["indicators"]["vwap"], config)
        saved = self.store.put("local-owner", "titan", "XAUUSD", "Session VWAP", doc, 0)
        self.assertEqual(self.store.get("local-owner", "titan", "XAUUSD", "Session VWAP")["document"]["indicators"]["vwap"], config)
        for invalid in [
            {**config, "timeZone": "No/Such_Zone"},
            {**config, "sessionStart": "9:30"},
            {**config, "sessionStart": "24:00"},
            {**config, "unknown": "UTC"},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(StoreError):
                validate_document({**old, "indicators": {"vwap": invalid}})

    def test_stochastic_parameters_roundtrip_and_enforce_smoothing_bounds(self):
        old = example()
        config = {"enabled": True, "period": 14, "smoothK": 2, "smoothD": 3}
        doc = validate_document({**old, "indicators": {"stochastic": config}})
        self.assertEqual(doc["indicators"]["stochastic"], config)
        self.store.put("local-owner", "titan", "XAUUSD", "Stochastic", doc, 0)
        loaded = self.store.get("local-owner", "titan", "XAUUSD", "Stochastic")["document"]
        self.assertEqual(loaded["indicators"]["stochastic"], config)
        for field, value in (("period", 201), ("smoothK", 0), ("smoothK", 101), ("smoothD", -1)):
            with self.subTest(field=field, value=value), self.assertRaises(StoreError):
                validate_document({**old, "indicators": {"stochastic": {**config, field: value}}})

    def test_chart_appearance_document_is_optional_strict_and_scoped(self):
        before = example()
        self.assertNotIn("chartAppearance", validate_document(before))
        appearance = {
            "theme": "dark", "grid": False, "crosshair": True,
            "scale": "logarithmic", "upColor": "#44ffaa",
            "downColor": "#f43f5e", "wickVisible": True,
            "borderVisible": False, "lastPriceVisible": True,
        }
        doc = {**before, "chartAppearance": appearance}
        self.assertEqual(validate_document(doc)["chartAppearance"], appearance)
        record = self.store.put("local-owner", "titan", "XAUUSD", "Style", doc, 0)
        self.assertEqual(record["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Style")["document"],doc)
        for invalid in [
            {**appearance, "theme":"external"},
            {**appearance, "scale":"invalid"},
            {**appearance, "upColor":"javascript:alert(1)"},
            {**appearance, "downColor":"red"},
            {**appearance, "grid":1},
            {**appearance, "borderVisible":"no"},
            {**appearance, "id":"script"},
        ]:
            with self.subTest(case=str(invalid)[:55]),self.assertRaises(StoreError):
                validate_document({**before,"chartAppearance":invalid})

    def test_multiple_oscillators_schema_and_revision_roundtrip(self):
        original = example()
        self.assertNotIn("oscillatorInstances", validate_document(original))
        rsi = {"id":"osc1","kind":"rsi","period":21,"visible":True,
               "color":"#E8BB72","lineWidth":2,"label":"Swing RSI"}
        macd = {"id":"osc2","kind":"macd","fast":12,"slow":26,"signal":9,
                "visible":False,"color":"#54cee9","lineWidth":3,"label":""}
        atr = {"id":"osc3","kind":"atr","period":14,"visible":True,
               "color":"#a995ff","lineWidth":2,"label":"Range"}
        adx = {"id":"osc4","kind":"adx","period":25,"visible":True,
               "color":"#63dfb6","lineWidth":1,"label":"Trend"}
        document = {**original,"oscillatorInstances":[rsi,macd,atr,adx]}
        result = validate_document(document)
        self.assertEqual(result["oscillatorInstances"],[rsi,macd,atr,adx])
        saved = self.store.put("local-owner","titan","XAUUSD","Multi-OSC",document,0)
        self.assertEqual(saved["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Multi-OSC")["document"],document)
        with self.assertRaises(WorkspaceMissing):
            self.store.get("local-owner","goldm15","XAUUSD","Multi-OSC")
        cases = [
            [rsi,rsi],[rsi]*9,[{**rsi,"period":1}],[{**rsi,"period":201}],
            [{**rsi,"visible":"yes"}],[{**rsi,"color":"red"}],
            [{**rsi,"onclick":"hack"}],[{**rsi,"id":"../bad"}],
            [{**macd,"fast":28}],[{**macd,"slow":301}],
            [{**macd,"signal":0}],[{**macd,"period":5}],
            [{**atr,"kind":"volume"}],[{**adx,"lineWidth":0}],
            [{**adx,"label":"x"*41}],
        ]
        for invalid in cases:
            with self.subTest(invalid=str(invalid)[:65]),self.assertRaises(StoreError):
                validate_document({**original,"oscillatorInstances":invalid})
        with self.assertRaises(StoreError):
            validate_document({**original,"oscillatorInstances":"not a list"})

    def test_cci_and_stochastic_instance_workspace_roundtrip_and_bounds(self):
        original = example()
        cci = {"id":"cci1","kind":"cci","period":20,"visible":True,
               "color":"#55d7ee","lineWidth":2,"label":"CCI"}
        stochastic = {"id":"stoch1","kind":"stochastic","period":14,
                      "smoothK":3,"smoothD":3,"visible":True,
                      "color":"#e9bc72","lineWidth":2,"label":"Stochastic"}
        document = {**original,"oscillatorInstances":[cci,stochastic],
                    "indicators":{"cci":{"enabled":True,"period":20}}}
        result = validate_document(document)
        self.assertEqual(result["oscillatorInstances"],[cci,stochastic])
        self.assertEqual(result["indicators"],document["indicators"])
        saved = self.store.put("local-owner","titan","XAUUSD","CCI",document,0)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","CCI")["document"],document)
        for instance in [
            {**cci,"period":1},{**cci,"period":201},{**cci,"extra":1},
            {**stochastic,"period":1},{**stochastic,"period":201},
            {**stochastic,"smoothK":0},{**stochastic,"smoothK":101},
            {**stochastic,"smoothD":0},{**stochastic,"smoothD":101},
            {**stochastic,"extra":1},
        ]:
            with self.subTest(instance=instance), self.assertRaises(StoreError):
                validate_document({**original,"oscillatorInstances":[instance]})

    def test_momentum_and_roc_instance_workspace_roundtrip_and_bounds(self):
        original = example()
        momentum = {"id":"mom1","kind":"momentum","period":10,"visible":True,
                    "color":"#55d7ee","lineWidth":2,"label":"Momentum"}
        roc = {"id":"roc1","kind":"roc","period":12,"visible":True,
               "color":"#f3c56a","lineWidth":3,"label":"ROC"}
        document = {**original,"oscillatorInstances":[momentum,roc]}
        self.assertEqual(validate_document(document)["oscillatorInstances"],[momentum,roc])
        saved = self.store.put("local-owner","titan","XAUUSD","MomentumROC",document,0)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","MomentumROC")["document"],document)
        for instance in [
            {**momentum,"period":1},{**momentum,"period":201},
            {**momentum,"period":10.0},{**momentum,"extra":1},
            {**roc,"period":0},{**roc,"period":201},{**roc,"extra":1},
        ]:
            with self.subTest(instance=instance), self.assertRaises(StoreError):
                validate_document({**original,"oscillatorInstances":[instance]})

    def test_stochrsi_instance_workspace_roundtrip_and_bounds(self):
        original = example()
        stochrsi = {"id":"srsi1","kind":"stochrsi","period":14,
                    "stochPeriod":14,"smoothK":3,"smoothD":3,
                    "visible":True,"color":"#55d7ee","lineWidth":2,
                    "label":"StochRSI"}
        document = {**original,"oscillatorInstances":[stochrsi]}
        self.assertEqual(validate_document(document)["oscillatorInstances"],[stochrsi])
        saved = self.store.put("local-owner","titan","XAUUSD","StochRSI",document,0)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","StochRSI")["document"],document)
        for invalid in [
            {**stochrsi,"period":1},{**stochrsi,"period":201},
            {**stochrsi,"stochPeriod":1},{**stochrsi,"stochPeriod":201},
            {**stochrsi,"smoothK":0},{**stochrsi,"smoothK":101},
            {**stochrsi,"smoothD":0},{**stochrsi,"smoothD":101},
            {**stochrsi,"extra":1},
        ]:
            with self.subTest(instance=invalid), self.assertRaises(StoreError):
                validate_document({**original,"oscillatorInstances":[invalid]})

    def test_chart_type_compatibility_and_strict_validation(self):
        original = example()
        self.assertNotIn("chartType", validate_document(original))
        for chart_type in ("candles","bars","line","area"):
            document = {**original,"chartType":chart_type}
            self.assertEqual(validate_document(document)["chartType"], chart_type)
        saved = self.store.put("local-owner","titan","XAUUSD","PriceStyle",
                               {**original,"chartType":"area"},0)
        self.assertEqual(saved["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","PriceStyle")["document"]["chartType"],"area")
        for value in (None,[],{},True,4,"heikinashi","javascript:alert(1)","CANDLES"):
            with self.subTest(value=value),self.assertRaises(StoreError):
                validate_document({**original,"chartType":value})

    def test_named_locked_hidden_drawing_objects_and_legacy_compatibility(self):
        older = example()
        self.assertEqual(validate_document(older), older)
        base = {"kind":"trend", "anchors":[
            {"time":1700000000,"price":4100.0},
            {"time":1700000900,"price":4120.0}
        ],"id":"trend_1","label":"London Pullback","visible":False,"locked":True}
        doc = {**older,"drawings":[base]}
        self.assertEqual(validate_document(doc)["drawings"],[base])
        saved = self.store.put("local-owner","titan","XAUUSD","Objects",doc,0)
        self.assertEqual(saved["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Objects")["document"],doc)
        with self.assertRaises(WorkspaceMissing):
            self.store.get("local-owner","goldm15","XAUUSD","Objects")
        cases = [
            [{**base,"id":"../../secret"}],
            [{**base,"id":"bad script"}],
            [base,base],
            [{**base,"label":"x"*41}],
            [{**base,"label":"evil\ncmd"}],
            [{**base,"visible":1}],
            [{**base,"locked":"false"}],
            [{**base,"onclick":"alert(1)"}]
        ]
        for case in cases:
            with self.subTest(value=str(case)[:60]),self.assertRaises(StoreError):
                validate_document({**older,"drawings":case})


class ApiAccessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = patch.dict(os.environ, {
            "CHART_STUDIO_STORAGE_ENABLED": "1",
            "CHART_STUDIO_STORAGE_TOKEN": "testing-secret-0123456789abcdefABCDEFG",
            "CHART_STUDIO_DB": str(Path(self.tmp.name) / "secure" / "workspaces.sqlite3"),
        })
        self.settings.start()
        import app
        from fastapi.testclient import TestClient
        self.server = app
        app._chart_store_at.cache_clear()
        self.client = TestClient(app.app)
        self.headers = {"Authorization": "Bearer testing-secret-0123456789abcdefABCDEFG"}

    def tearDown(self):
        self.client.close()
        self.server._chart_store_at.cache_clear()
        self.settings.stop()
        self.tmp.cleanup()

    def test_opt_in_denies_missing_and_wrong_token(self):
        base="/api/chart/v1/workspaces?account=titan"
        self.assertEqual(self.client.get(base).status_code,401)
        self.assertEqual(self.client.get(base,headers={"Authorization":"Bearer incorrect"}).status_code,401)
        with patch.dict(os.environ, {"CHART_STUDIO_STORAGE_ENABLED":"0"}):
            self.assertEqual(self.client.get(base,headers=self.headers).status_code,503)
        with patch.dict(os.environ, {"CHART_STUDIO_STORAGE_TOKEN":"short"}):
            self.assertEqual(self.client.get(base,headers=self.headers).status_code,503)

    def test_api_put_get_account_isolation_stale_conflict(self):
        payload={"account":"titan","symbol":"XAUUSD","name":"My Setup",
                 "expectedRevision":0,"document":example()}
        p=self.client.put("/api/chart/v1/workspace",json=payload,headers=self.headers)
        self.assertEqual(p.status_code,200,p.text)
        self.assertEqual(p.json()["revision"],1)
        self.assertEqual(p.headers["cache-control"],"no-store")
        mismatch=self.client.get("/api/chart/v1/workspace",params={
            "account":"goldm15","symbol":"XAUUSD","name":"My Setup"
        },headers=self.headers)
        self.assertEqual(mismatch.status_code,404)
        r=self.client.get("/api/chart/v1/workspace",params={
            "account":"titan","symbol":"XAUUSD","name":"My Setup"
        },headers=self.headers)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()["document"],example())
        stale=self.client.put("/api/chart/v1/workspace",json=payload,headers=self.headers)
        self.assertEqual(stale.status_code,409)
        payload["expectedRevision"]=1
        payload["document"]["options"]["ema20"]=False
        self.assertEqual(self.client.put("/api/chart/v1/workspace",json=payload,headers=self.headers).json()["revision"],2)
        self.assertEqual(self.client.request("DELETE","/api/chart/v1/workspace",json={
            "account":"titan","symbol":"XAUUSD","name":"My Setup","expectedRevision":1
        },headers=self.headers).status_code,409)
        self.assertEqual(self.client.request("DELETE","/api/chart/v1/workspace",json={
            "account":"titan","symbol":"XAUUSD","name":"My Setup","expectedRevision":2
        },headers=self.headers).status_code,200)

    def test_static_database_path_rejected(self):
        with patch.dict(os.environ,{
            "CHART_STUDIO_DB":str(self.server.BASE_DIR / "static" / "accident.sqlite3")
        }):
            self.assertEqual(self.client.get("/api/chart/v1/workspaces",
                params={"account":"titan"},headers=self.headers).status_code,503)
        self.assertFalse((self.server.BASE_DIR / "static" / "accident.sqlite3").exists())

if __name__ == "__main__":
    unittest.main()
