from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import install_goldm15_evidence as INSTALL


def package_fixture(tmp_path: Path) -> Path:
    package = tmp_path / "candidate"
    package.mkdir()
    files = {
        "GoldM15_EvidenceCapture.mq5": b"// account-bound source",
        "GoldM15_EvidenceCapture.ex5": b"compiled candidate",
        "ChartStudioEvidenceSpool.mqh": b"// bounded spool\r\n",
        "GoldM15_Core.mqh": b"// core",
        "GoldM15_Risk.mqh": b"// instrumented risk",
        "GoldM15_RiskCore.mqh": b"// risk core",
        "GoldM15_News.mqh": b"// news",
        "GoldM15_Reconstruction.set": (ROOT / "goldm15" / "GoldM15_Reconstruction.set").read_bytes(),
    }
    for name, content in files.items():
        (package / name).write_bytes(content)
    manifest = {
        "schemaVersion": 1,
        "accountAlias": "goldm15",
        "producerId": "goldm15_demo",
        "terminalIdentityHash": INSTALL.AccountContext.from_config("goldm15").terminal_identity_hash,
        "generatedSourceSha256": sha256(files["GoldM15_EvidenceCapture.mq5"]).hexdigest(),
        "artifactSha256": sha256(files["GoldM15_EvidenceCapture.ex5"]).hexdigest(),
        "presetName": "GoldM15_Reconstruction.set",
        "presetSha256": sha256(files["GoldM15_Reconstruction.set"]).hexdigest(),
        "spoolHelperSha256": sha256(files["ChartStudioEvidenceSpool.mqh"].replace(b"\r\n", b"\n")).hexdigest(),
        "generatedSupportingSources": {
            "goldm15/GoldM15_Core.mqh": sha256(files["GoldM15_Core.mqh"]).hexdigest(),
            "goldm15/GoldM15_Risk.mqh": sha256(files["GoldM15_Risk.mqh"]).hexdigest(),
            "goldm15/GoldM15_RiskCore.mqh": sha256(files["GoldM15_RiskCore.mqh"]).hexdigest(),
            "goldm15/GoldM15_News.mqh": sha256(files["GoldM15_News.mqh"]).hexdigest(),
        },
        "deployment": "NOT_INSTALLED",
        "compileResult": "0 errors, 0 warnings",
    }
    (package / "build-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return package


@pytest.fixture
def mt5_fixture(tmp_path: Path, monkeypatch):
    terminal_root = tmp_path / "terminal"
    data_root = terminal_root
    (data_root / "MQL5" / "Include" / "Trade").mkdir(parents=True)
    account = SimpleNamespace(login=53090070, server="ICMarketsEU-Demo")
    terminal = SimpleNamespace(path=str(terminal_root), data_path=str(data_root), connected=True)
    mt5 = SimpleNamespace(account_info=lambda: account, terminal_info=lambda: terminal,
                          order_send=lambda *_: pytest.fail("installer must never send orders"))
    spec = INSTALL.account_gateway.ACCOUNTS["goldm15"]
    monkeypatch.setitem(spec, "terminal", str(terminal_root / "terminal64.exe"))
    monkeypatch.setitem(spec, "login", account.login)
    monkeypatch.setitem(spec, "server", account.server)
    monkeypatch.setitem(spec, "is_demo", True)
    monkeypatch.setitem(spec, "challenge_protection", False)

    @contextmanager
    def session(_mt5, alias):
        assert alias == "goldm15"
        yield

    monkeypatch.setattr(INSTALL.account_gateway, "session", session)
    return mt5, terminal_root


def test_installs_verified_package_side_by_side_without_touching_active_ea(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture

    result = INSTALL.install_candidate("goldm15", package, mt5=mt5)

    expected = terminal_root / "MQL5" / "Experts" / "ChartStudioEvidence_goldm15"
    assert result.installed_directory == expected
    assert result.already_installed is False
    assert {path.name for path in expected.iterdir()} == {
        "GoldM15_EvidenceCapture.mq5", "GoldM15_EvidenceCapture.ex5",
        "ChartStudioEvidenceSpool.mqh", "GoldM15_Core.mqh", "GoldM15_Risk.mqh",
        "GoldM15_RiskCore.mqh", "GoldM15_News.mqh", "GoldM15_Reconstruction.set",
        "build-manifest.json", "install-manifest.json",
    }
    assert (expected / "GoldM15_EvidenceCapture.ex5").read_bytes() == (package / "GoldM15_EvidenceCapture.ex5").read_bytes()
    assert json.loads((expected / "install-manifest.json").read_text(encoding="utf-8"))["state"] == "INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED"
    assert not (terminal_root / "MQL5" / "Experts" / "GoldM15_Reconstruction.ex5").exists()


@pytest.mark.parametrize("alias", ["blueberry", "titan", "xau5m_m5", "unknown"])
def test_refuses_every_account_except_the_goldm15_demo(tmp_path, mt5_fixture, alias):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture

    with pytest.raises(ValueError, match="allowlisted"):
        INSTALL.install_candidate(alias, package, mt5=mt5)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_refuses_artifact_hash_mismatch_before_connecting_or_writing(tmp_path, mt5_fixture, monkeypatch):
    package = package_fixture(tmp_path)
    (package / "GoldM15_EvidenceCapture.ex5").write_bytes(b"unexpected binary")
    mt5, terminal_root = mt5_fixture
    monkeypatch.setattr(INSTALL.account_gateway, "session", lambda *_: pytest.fail("invalid package must fail before MT5 access"))

    with pytest.raises(ValueError, match="hash"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_refuses_identity_mismatch_before_creating_experts_directory(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    mt5.account_info = lambda: SimpleNamespace(login=5120620, server="BlueberryMarketsSVG-Live")

    with pytest.raises(ValueError, match="identity"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_refuses_a_terminal_path_mismatch_before_creating_experts_directory(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    mt5.terminal_info = lambda: SimpleNamespace(path=str(tmp_path / "other-terminal"),
                                                 data_path=str(terminal_root), connected=True)

    with pytest.raises(ValueError, match="terminal path"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_refuses_a_challenge_protected_account_configuration_before_connecting(tmp_path, mt5_fixture, monkeypatch):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    monkeypatch.setitem(INSTALL.account_gateway.ACCOUNTS["goldm15"], "challenge_protection", True)
    monkeypatch.setattr(INSTALL.account_gateway, "session", lambda *_: pytest.fail("protected alias must fail before MT5 access"))

    with pytest.raises(ValueError, match="non-challenge demo"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_conflicting_destination_is_never_overwritten(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    target = terminal_root / "MQL5" / "Experts" / "ChartStudioEvidence_goldm15"
    target.mkdir(parents=True)
    sentinel = target / "GoldM15_EvidenceCapture.ex5"
    sentinel.write_bytes(b"existing different installation")

    with pytest.raises(ValueError, match="conflict"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert sentinel.read_bytes() == b"existing different installation"


def test_versioned_install_keeps_prior_candidate_unchanged(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    experts = terminal_root / "MQL5" / "Experts"
    previous = experts / "ChartStudioEvidence_goldm15"
    previous.mkdir(parents=True)
    sentinel = previous / "GoldM15_EvidenceCapture.ex5"
    sentinel.write_bytes(b"previous candidate")

    result = INSTALL.install_candidate(
        "goldm15", package, mt5=mt5, install_directory="ChartStudioEvidence_goldm15_20261019"
    )

    expected = experts / "ChartStudioEvidence_goldm15_20261019"
    assert result.installed_directory == expected
    assert (expected / "GoldM15_EvidenceCapture.ex5").read_bytes() == b"compiled candidate"
    assert sentinel.read_bytes() == b"previous candidate"


@pytest.mark.parametrize("name", ["..", ".ChartStudioEvidence_goldm15.bad", "ChartStudioEvidence_goldm15/other", "other"])
def test_versioned_install_directory_is_restricted_to_safe_goldm15_names(tmp_path, mt5_fixture, name):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture

    with pytest.raises(ValueError, match="install directory"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5, install_directory=name)

    assert not (terminal_root / "MQL5" / "Experts").exists()


def test_exact_existing_installation_is_idempotent(tmp_path, mt5_fixture):
    package = package_fixture(tmp_path)
    mt5, _ = mt5_fixture

    first = INSTALL.install_candidate("goldm15", package, mt5=mt5)
    second = INSTALL.install_candidate("goldm15", package, mt5=mt5)

    assert first.already_installed is False
    assert second.already_installed is True
    assert second.installed_directory == first.installed_directory


def test_copy_failure_cleans_only_its_temporary_staging_directory(tmp_path, mt5_fixture, monkeypatch):
    package = package_fixture(tmp_path)
    mt5, terminal_root = mt5_fixture
    original_copy = INSTALL.shutil.copyfile
    calls = 0

    def fail_second_copy(source, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("fixture copy failure")
        return original_copy(source, destination)

    monkeypatch.setattr(INSTALL.shutil, "copyfile", fail_second_copy)
    with pytest.raises(OSError, match="fixture copy failure"):
        INSTALL.install_candidate("goldm15", package, mt5=mt5)

    experts = terminal_root / "MQL5" / "Experts"
    assert list(experts.iterdir()) == []
