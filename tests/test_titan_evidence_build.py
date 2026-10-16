from pathlib import Path
import shutil
import sys

import pytest

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_titan_evidence as BUILD


@pytest.mark.parametrize("alias", ["xau5m_m5", "titan_m5"])
def test_prepare_creates_identity_bound_capture_variant_only_under_output(tmp_path, alias):
    target = ROOT / "output" / "test-evidence-build" / alias
    shutil.rmtree(target, ignore_errors=True)
    try:
        result = BUILD.prepare_variant(ROOT, alias, target.parent)

        source = result.source.read_text(encoding="utf-8-sig")
        assert result.source.parent == target
        assert result.source.name == "XAU_Titan_Pro_BasketGuard.mq5"
        assert '#define CS_EVIDENCE_CAPTURE' in source
        assert f'#define CS_EVIDENCE_ACCOUNT_ID "{alias}"' in source
        assert "CS_EVIDENCE_EXPECTED_LOGIN" in source
        assert "CS_EVIDENCE_EXPECTED_SERVER" in source
        assert "CS_EVIDENCE_EXPECTED_TERMINAL_PATH" in source
        assert (result.source.parent / "ChartStudioEvidenceSpool.mqh").is_file()
        assert result.manifest.is_file()
        assert result.source.with_suffix(".ex5").parent == target
        assert not result.source.with_suffix(".ex5").exists()
    finally:
        shutil.rmtree(target.parent, ignore_errors=True)


@pytest.mark.parametrize("alias", ["blueberry", "titan", "xau5m_500", "goldm15", "unknown"])
def test_prepare_rejects_non_instrumentable_accounts(tmp_path, alias):
    with pytest.raises(ValueError, match="not allowlisted"):
        BUILD.prepare_variant(ROOT, alias, ROOT / "output" / "test-evidence-build")


def test_prepare_rejects_account_that_is_not_configured_as_demo(monkeypatch, tmp_path):
    import account_gateway

    original = account_gateway.ACCOUNTS["titan_m5"]["is_demo"]
    monkeypatch.setitem(account_gateway.ACCOUNTS["titan_m5"], "is_demo", False)
    with pytest.raises(ValueError, match="demo account"):
        BUILD.prepare_variant(ROOT, "titan_m5", ROOT / "output" / "test-evidence-build")
    monkeypatch.setitem(account_gateway.ACCOUNTS["titan_m5"], "is_demo", original)


def test_prepare_rejects_symlinked_alias_output(monkeypatch):
    alias_output = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    alias_output.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(BUILD, "_is_link_or_junction", lambda path: path == alias_output)
    with pytest.raises(ValueError, match="symlink or junction"):
        BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent)


def test_prepare_atomically_replaces_hardlinked_generated_files(tmp_path):
    alias_output = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    alias_output.mkdir(parents=True, exist_ok=True)
    external_files = []
    try:
        for name, content in (
            ("XAU_Titan_Pro_BasketGuard.mq5", b"outside source"),
            ("ChartStudioEvidenceSpool.mqh", b"outside include"),
            ("build-manifest.json", b"outside manifest"),
        ):
            outside = tmp_path / name
            outside.write_bytes(content)
            external_files.append((outside, content))
            (alias_output / name).hardlink_to(outside)
    except OSError as exc:
        shutil.rmtree(alias_output.parent, ignore_errors=True)
        pytest.skip(f"hardlinks unavailable: {exc}")

    try:
        BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent)
        for outside, original in external_files:
            assert outside.read_bytes() == original
    finally:
        shutil.rmtree(alias_output.parent, ignore_errors=True)


def test_prepare_clears_stale_compile_outputs_before_writing_source(monkeypatch):
    alias_output = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    alias_output.mkdir(parents=True, exist_ok=True)
    artifact = alias_output / "XAU_Titan_Pro_BasketGuard.ex5"
    log = alias_output / "XAU_Titan_Pro_BasketGuard.log"
    artifact.write_bytes(b"stale")
    log.write_bytes(b"stale success log")
    monkeypatch.setattr(BUILD, "_atomic_write", lambda *args: (_ for _ in ()).throw(OSError("simulated write failure")))
    try:
        with pytest.raises(OSError, match="simulated write failure"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent)
        assert not artifact.exists()
        assert not log.exists()
    finally:
        shutil.rmtree(alias_output.parent, ignore_errors=True)


def test_compile_command_uses_terminal_portable_include_tree_and_never_installs(tmp_path):
    metaeditor = tmp_path / "MetaEditor64.exe"
    source = tmp_path / "output" / "variant.mq5"
    include = tmp_path / "terminal" / "MQL5"
    log = tmp_path / "output" / "compile.log"

    command = BUILD.compiler_command(metaeditor, source, include, log)

    assert command[0] == "powershell.exe"
    assert str(metaeditor) in command
    assert str(source) in command
    assert str(include) in command
    wrapper = (ROOT / "scripts" / "run_metaeditor_compile.ps1").read_text(encoding="utf-8")
    assert "Start-Process" in wrapper and "-WindowStyle Hidden" in wrapper
    assert "/portable" not in wrapper
    assert all("\\MQL5\\Experts" not in part for part in command)


def test_compile_accepts_only_a_fresh_artifact_with_zero_error_log(tmp_path, monkeypatch):
    source = tmp_path / "output" / "variant.mq5"
    source.parent.mkdir()
    source.write_text("// candidate", encoding="utf-8")
    artifact = source.with_suffix(".ex5")
    log = source.with_suffix(".log")
    variant = BUILD.BuildVariant(source, source.parent / "manifest.json", tmp_path / "MetaEditor64.exe", tmp_path / "MQL5", log)
    def successful_compile(*args, **kwargs):
        artifact.write_bytes(b"fresh compiled")
        log.write_text("Result: 0 errors, 0 warnings", encoding="utf-8")
        return type("Process", (), {"returncode": 1})()
    monkeypatch.setattr(BUILD.subprocess, "run", successful_compile)

    assert BUILD.compile_variant(variant) == artifact
    assert artifact.read_bytes() == b"fresh compiled"

    def failed_compile(*args, **kwargs):
        artifact.write_bytes(b"stale compiled")
        log.write_text("Result: 10 errors, 0 warnings", encoding="utf-8")
        return type("Process", (), {"returncode": 0})()
    monkeypatch.setattr(BUILD.subprocess, "run", failed_compile)
    with pytest.raises(RuntimeError, match="compile failed"):
        BUILD.compile_variant(variant)
    assert not artifact.exists()
