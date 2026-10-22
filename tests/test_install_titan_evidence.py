import hashlib
import json
from contextlib import contextmanager
from pathlib import Path
import shutil

import pytest

import account_gateway
from scripts import install_titan_evidence as installer
from chart_studio.evidence_models import AccountContext


def candidate(tmp_path: Path, alias="titan_m5") -> Path:
    package = installer.OUTPUT_ROOT / "titan-basketguard-evidence" / alias / "record-only"
    package.mkdir(parents=True)
    preset_name = installer.EXPECTED_PRESETS[alias]
    preset = tmp_path / preset_name
    preset.write_bytes(b"preset")
    source_name = f"{installer.EA_NAME}_RecordOnly.mq5"
    files = {
        source_name: b"mq5 source",
        f"{installer.EA_NAME}_RecordOnly.ex5": b"compiled ea",
        installer.SPOOL_NAME: (installer.ROOT / installer.SPOOL_NAME).read_bytes(),
        installer.MANIFEST_NAME: b"{}\n",
    }
    for name, data in files.items():
        (package / name).write_bytes(data)
    context = AccountContext.from_config(alias)
    manifest = {
        "schemaVersion": 1,
        "accountAlias": alias,
        "expectedSymbol": installer.EXPECTED_SYMBOLS[alias],
        "producerId": f"titan_{'puprime250' if alias == 'xau5m_m5' else 'puprime500'}_recordonly",
        "recordOnly": True,
        "terminalIdentityHash": context.terminal_identity_hash,
        "presetName": preset_name,
        "presetSha256": installer.EXPECTED_PRESET_SHA256[alias],
        "sourceSha256": hashlib.sha256((installer.ROOT / installer.TITAN_SOURCE_NAME).read_bytes()).hexdigest(),
        "sourceAndIncludeSha256": hashlib.sha256(
            (installer.ROOT / installer.TITAN_SOURCE_NAME).read_bytes() + b"\0" + files[installer.SPOOL_NAME]
        ).hexdigest(),
        "generatedSourceSha256": hashlib.sha256(files[source_name]).hexdigest(),
        "artifactSha256": hashlib.sha256(files[f"{installer.EA_NAME}_RecordOnly.ex5"]).hexdigest(),
        "compileResult": "0 errors, 0 warnings",
    }
    (package / installer.MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
    (package / preset_name).write_bytes(b"preset")
    return package


def test_installs_verified_recordonly_package_side_by_side_without_replacing_existing_ea(tmp_path, monkeypatch):
    monkeypatch.setitem(installer.EXPECTED_PRESET_SHA256, "titan_m5", hashlib.sha256(b"preset").hexdigest())
    monkeypatch.setattr(installer, "OUTPUT_ROOT", tmp_path / "output")
    alias = "titan_m5"
    spec = dict(account_gateway.ACCOUNTS[alias])
    fake_terminal_root = tmp_path / "fake-terminal"
    fake_terminal_root.mkdir()
    spec["terminal"] = str(fake_terminal_root / "terminal64.exe")
    monkeypatch.setitem(account_gateway.ACCOUNTS, alias, spec)
    package = candidate(tmp_path)
    data_root = fake_terminal_root
    (data_root / "MQL5" / "Experts").mkdir(parents=True)
    existing = data_root / "MQL5" / "Experts" / "XAU_Titan_Pro_BasketGuard.ex5"
    existing.write_bytes(b"active ea stays intact")

    @contextmanager
    def demo_session(_mt5, selected):
        assert selected == alias
        yield spec

    class Terminal:
        data_path = str(data_root)
        path = str(Path(spec["terminal"]).parent)
        connected = True

    class AccountInfo:
        login = spec["login"]
        server = spec["server"]

    class FakeMt5:
        @staticmethod
        def account_info():
            return AccountInfo()

        @staticmethod
        def terminal_info():
            return Terminal()

    monkeypatch.setattr(installer.account_gateway, "session", demo_session)
    result = installer.install_candidate(alias, package, tmp_path / installer.EXPECTED_PRESETS[alias], mt5=FakeMt5())

    assert result.installed_directory.name == f"ChartStudioEvidence_{alias}_recordonly_{result.artifact_sha256[:8]}"
    assert (result.installed_directory / "puprime500.set").read_bytes() == b"preset"
    assert existing.read_bytes() == b"active ea stays intact"
    assert result.already_installed is False


def test_refuses_non_allowlisted_or_non_recordonly_candidates(tmp_path, monkeypatch):
    monkeypatch.setitem(installer.EXPECTED_PRESET_SHA256, "titan_m5", hashlib.sha256(b"preset").hexdigest())
    monkeypatch.setattr(installer, "OUTPUT_ROOT", tmp_path / "output")
    package = candidate(tmp_path)
    with pytest.raises(ValueError, match="allowlisted"):
        installer.install_candidate("blueberry", package, tmp_path / installer.EXPECTED_PRESETS["titan_m5"], mt5=object())

    manifest_path = package / installer.MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["recordOnly"] = False
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="record-only"):
        installer.install_candidate("titan_m5", package, tmp_path / installer.EXPECTED_PRESETS["titan_m5"], mt5=object())


def test_refuses_candidate_outside_managed_build_directory(tmp_path, monkeypatch):
    monkeypatch.setitem(installer.EXPECTED_PRESET_SHA256, "titan_m5", hashlib.sha256(b"preset").hexdigest())
    monkeypatch.setattr(installer, "OUTPUT_ROOT", tmp_path / "output")
    package = candidate(tmp_path)
    unmanaged = tmp_path / "unmanaged"
    shutil.copytree(package, unmanaged)

    with pytest.raises(ValueError, match="managed build directory"):
        installer._candidate_files("titan_m5", unmanaged, tmp_path / "puprime500.set")
