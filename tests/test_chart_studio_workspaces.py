"""Chart Studio SQLite layout storage and guarded HTTP integration; no real MT5."""
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
            dict(drawings=[example()["drawings"][0]] * 501),
        ]
        for change in tests:
            with self.subTest(change=str(change)[:60]), self.assertRaises(StoreError):
                validate_document({**example(), **change})

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
        current = {**old, "movingAverages":[cfg]}
        self.assertEqual(validate_document(current)["movingAverages"], [cfg])
        saved = self.store.put("local-owner","titan","XAUUSD","Multi",current,0)
        self.assertEqual(saved["revision"],1)
        self.assertEqual(self.store.get("local-owner","titan","XAUUSD","Multi")["document"],current)
        for bad in [
            [cfg, cfg],
            [{**cfg,"period":501}],
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
        with self.assertRaises(StoreError):
            validate_document({**old,"movingAverages":"no"})

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
