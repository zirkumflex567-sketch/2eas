"""Process-crash recovery for the dashboard/EA drawdown reset pair."""
import json
import os
import base64
import hashlib
from pathlib import Path

import pytest
from fastapi import HTTPException

import app
import account_gateway as gateway
import dd_persistence


def test_load_recovers_prior_pair_after_process_crash_between_replaces(tmp_path, monkeypatch):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    previous = {
        "manual_reset_active": False,
        "reset_balance": 10000.0,
        "reset_timestamp": None,
        "reset_date": None,
    }
    proposed = {
        "manual_reset_active": True,
        "reset_balance": 9900.0,
        "reset_timestamp": 1791547200,
        "reset_date": "2026-10-09",
    }
    for target in (local, common):
        target.write_text(json.dumps(previous), encoding="utf-8")

    monkeypatch.setattr(app, "BASE_DIR", tmp_path)
    monkeypatch.setattr(app, "COMMON_FILES_DIR", str(common_dir))
    monkeypatch.setattr(app, "config_path", lambda _directory: local)
    monkeypatch.setattr(app, "writes_titan_reset", lambda: True)
    selected = gateway._selected.set("titan")
    real_replace = os.replace

    class SimulatedProcessCrash(BaseException):
        pass

    def crash_after_local_replace(source, destination):
        real_replace(source, destination)
        if Path(destination) == local:
            raise SimulatedProcessCrash()

    try:
        monkeypatch.setattr(dd_persistence.os, "replace", crash_after_local_replace)
        with pytest.raises(SimulatedProcessCrash):
            dd_persistence.save(proposed, [local, common])

        assert json.loads(local.read_text(encoding="utf-8")) == proposed
        assert json.loads(common.read_text(encoding="utf-8")) == previous

        monkeypatch.setattr(dd_persistence.os, "replace", real_replace)
        assert app.load_dd_config() == previous
        assert json.loads(local.read_text(encoding="utf-8")) == previous
        assert json.loads(common.read_text(encoding="utf-8")) == previous
    finally:
        gateway._selected.reset(selected)


def test_interrupted_rollback_is_repeatable_on_the_next_load(tmp_path, monkeypatch):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    previous = {"manual_reset_active": False, "reset_balance": 10000.0,
                "reset_timestamp": None, "reset_date": None}
    proposed = {"manual_reset_active": True, "reset_balance": 9900.0,
                "reset_timestamp": 1791547200, "reset_date": "2026-10-09"}
    for target in (local, common):
        target.write_text(json.dumps(previous), encoding="utf-8")
    monkeypatch.setattr(app, "BASE_DIR", tmp_path)
    monkeypatch.setattr(app, "COMMON_FILES_DIR", str(common_dir))
    monkeypatch.setattr(app, "config_path", lambda _directory: local)
    monkeypatch.setattr(app, "writes_titan_reset", lambda: True)
    selected = gateway._selected.set("titan")
    replace = os.replace

    class SimulatedProcessCrash(BaseException):
        pass

    try:
        def interrupt_commit(source, destination):
            replace(source, destination)
            if Path(destination) == local:
                raise SimulatedProcessCrash()

        monkeypatch.setattr(dd_persistence.os, "replace", interrupt_commit)
        with pytest.raises(SimulatedProcessCrash):
            dd_persistence.save(proposed, [local, common])

        def interrupt_rollback(source, destination):
            replace(source, destination)
            if Path(destination) == local:
                raise SimulatedProcessCrash()

        monkeypatch.setattr(dd_persistence.os, "replace", interrupt_rollback)
        with pytest.raises(SimulatedProcessCrash):
            app.load_dd_config()
        journal = dd_persistence._journal_path([local, common])
        assert journal.exists()

        monkeypatch.setattr(dd_persistence.os, "replace", replace)
        assert app.load_dd_config() == previous
        assert json.loads(local.read_text(encoding="utf-8")) == previous
        assert json.loads(common.read_text(encoding="utf-8")) == previous
        assert not journal.exists()
    finally:
        gateway._selected.reset(selected)


def test_corrupt_or_cross_target_journal_fails_closed_without_writes(tmp_path, monkeypatch):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    old = {"manual_reset_active": False, "reset_balance": 10000.0,
           "reset_timestamp": None, "reset_date": None}
    for target in (local, common):
        target.write_text(json.dumps(old), encoding="utf-8")
    monkeypatch.setattr(app, "BASE_DIR", tmp_path)
    monkeypatch.setattr(app, "COMMON_FILES_DIR", str(common_dir))
    monkeypatch.setattr(app, "config_path", lambda _directory: local)
    monkeypatch.setattr(app, "writes_titan_reset", lambda: True)
    selected = gateway._selected.set("titan")
    journal = dd_persistence._journal_path([local, common])
    try:
        old_bytes = local.read_bytes()
        old_digest = hashlib.sha256(old_bytes).hexdigest()
        common_bytes = common.read_bytes()
        snapshots = [
            {"path": str(target), "exists": True,
             "data": base64.b64encode(data).decode("ascii"),
             "sha256": old_digest if target == local else hashlib.sha256(data).hexdigest()}
            for target, data in ((local, old_bytes), (common, common_bytes))
        ]
        invalid_manifests = [
            "{",
            json.dumps({"schemaVersion": 1, "phase": "PREPARED", "paths": [str(local)],
                        "before": [], "after": []}),
            json.dumps({"schemaVersion": 1, "phase": "PREPARED",
                        "paths": [str(local), str(common)], "before": snapshots,
                        "after": [dict(row, sha256="0" * 64) for row in snapshots]}),
        ]
        for content in invalid_manifests:
            journal.write_text(content, encoding="utf-8")
            with pytest.raises(HTTPException) as exc:
                app.load_dd_config()
            assert exc.value.status_code == 503
            assert json.loads(local.read_text(encoding="utf-8")) == old
            assert json.loads(common.read_text(encoding="utf-8")) == old
    finally:
        gateway._selected.reset(selected)


def test_successful_reset_pair_cleans_private_journal(tmp_path):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    config = {"manual_reset_active": True, "reset_balance": 9900.0,
              "reset_timestamp": 1791547200, "reset_date": "2026-10-09"}

    assert dd_persistence.save(config, [local, common]) == config
    assert dd_persistence.load(local) == config
    assert dd_persistence.load(common) == config
    assert not dd_persistence._journal_path([local, common]).exists()


def test_crash_after_commit_marker_preserves_new_pair_and_cleans_journal(tmp_path, monkeypatch):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    previous = {"manual_reset_active": False, "reset_balance": 10000.0,
                "reset_timestamp": None, "reset_date": None}
    proposed = {"manual_reset_active": True, "reset_balance": 9900.0,
                "reset_timestamp": 1791547200, "reset_date": "2026-10-09"}
    for target in (local, common):
        target.write_text(json.dumps(previous), encoding="utf-8")
    selected = gateway._selected.set("titan")
    journal = dd_persistence._journal_path([local, common])
    replace = os.replace

    class SimulatedProcessCrash(BaseException):
        pass

    try:
        def crash_after_commit_marker(source, destination):
            replace(source, destination)
            if Path(destination) == journal and b'"COMMITTED"' in journal.read_bytes():
                raise SimulatedProcessCrash()

        monkeypatch.setattr(dd_persistence.os, "replace", crash_after_commit_marker)
        with pytest.raises(SimulatedProcessCrash):
            dd_persistence.save(proposed, [local, common])
        assert json.loads(local.read_text(encoding="utf-8")) == proposed
        assert json.loads(common.read_text(encoding="utf-8")) == proposed

        monkeypatch.setattr(dd_persistence.os, "replace", replace)
        assert dd_persistence.recover([local, common]) is True
        assert json.loads(local.read_text(encoding="utf-8")) == proposed
        assert json.loads(common.read_text(encoding="utf-8")) == proposed
        assert not journal.exists()
    finally:
        gateway._selected.reset(selected)

def test_invalid_committed_snapshot_fails_before_any_target_write(tmp_path):
    local = tmp_path / "drawdown_config.json"
    common_dir = tmp_path / "common"
    common_dir.mkdir()
    common = common_dir / "titan_dd_reset.json"
    old = json.dumps({"manual_reset_active": False, "reset_balance": 10000.0,
                      "reset_timestamp": None, "reset_date": None}).encode()
    for target in (local, common):
        target.write_bytes(old)
    targets = [local, common]
    invalid = b'{"manual_reset_active":true,"reset_balance":0,"reset_timestamp":1,"reset_date":"2026-10-09"}'
    def snapshot(target, data):
        return {"path": str(target), "exists": True,
                "data": base64.b64encode(data).decode(),
                "sha256": hashlib.sha256(data).hexdigest()}
    journal = dd_persistence._journal_path(targets)
    journal.write_text(json.dumps({
        "schemaVersion": 1, "phase": "COMMITTED",
        "paths": [str(path.resolve()) for path in targets],
        "before": [snapshot(path.resolve(), old) for path in targets],
        "after": [snapshot(path.resolve(), invalid) for path in targets],
    }), encoding="utf-8")

    with pytest.raises(ValueError):
        dd_persistence.recover(targets)
    assert [path.read_bytes() for path in targets] == [old, old]
