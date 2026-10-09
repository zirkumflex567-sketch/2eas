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
