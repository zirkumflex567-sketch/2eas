from pathlib import Path
import shutil
import sys
import hashlib
import json
import re

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_titan_evidence as BUILD


def _compatible_preset(tmp_path, alias="xau5m_m5"):
    source = (ROOT / f"{BUILD.EA_NAME}.mq5").read_text(encoding="utf-8-sig")
    names = re.findall(r"^\s*input\s+(?:\w+)\s+(\w+)\s*=", source, re.M)
    path = tmp_path / BUILD.EXPECTED_PRESETS[alias]
    raw = ("\ufeff" + "\r\n".join(f"{name}=0" for name in names)).encode("utf-16-le")
    path.write_bytes(raw)
    BUILD.EXPECTED_PRESET_SHA256[alias] = hashlib.sha256(raw).hexdigest()
    return path


@pytest.fixture(autouse=True)
def configured_demo_terminal_fixtures(tmp_path, monkeypatch):
    """Keep build-contract tests independent of locally installed MT5 terminals."""
    monkeypatch.setattr(BUILD, "EXPECTED_PRESET_SHA256", dict(BUILD.EXPECTED_PRESET_SHA256))
    import account_gateway

    for alias in BUILD.ALLOWED_ACCOUNTS:
        terminal_root = tmp_path / alias
        terminal_root.mkdir()
        terminal = terminal_root / "terminal64.exe"
        terminal.touch()
        (terminal_root / "MetaEditor64.exe").touch()
        trade_include = terminal_root / "MQL5" / "Include" / "Trade" / "Trade.mqh"
        trade_include.parent.mkdir(parents=True)
        trade_include.touch()
        monkeypatch.setitem(account_gateway.ACCOUNTS[alias], "terminal", str(terminal))


@pytest.mark.parametrize("alias", ["xau5m_m5", "titan_m5"])
def test_prepare_creates_identity_bound_capture_variant_only_under_output(tmp_path, alias):
    target = ROOT / "output" / "test-evidence-build" / alias
    shutil.rmtree(target, ignore_errors=True)
    try:
        preset = _compatible_preset(tmp_path, alias)
        result = BUILD.prepare_variant(ROOT, alias, target.parent, preset_path=preset)

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
        manifest = json.loads(result.manifest.read_text(encoding="utf-8"))
        assert manifest["presetSha256"] == hashlib.sha256(preset.read_bytes()).hexdigest()
        assert manifest["presetName"] == preset.name
        assert manifest["presetInputCount"] == 65
        assert result.source.with_suffix(".ex5").parent == target
        assert not result.source.with_suffix(".ex5").exists()
    finally:
        shutil.rmtree(target.parent, ignore_errors=True)


@pytest.mark.parametrize("alias", ["blueberry", "titan", "xau5m_500", "goldm15", "unknown"])
def test_prepare_rejects_non_instrumentable_accounts(tmp_path, alias):
    with pytest.raises(ValueError, match="not allowlisted"):
        BUILD.prepare_variant(ROOT, alias, ROOT / "output" / "test-evidence-build", preset_path=_compatible_preset(tmp_path))


def test_prepare_rejects_account_that_is_not_configured_as_demo(monkeypatch, tmp_path):
    import account_gateway

    original = account_gateway.ACCOUNTS["titan_m5"]["is_demo"]
    monkeypatch.setitem(account_gateway.ACCOUNTS["titan_m5"], "is_demo", False)
    with pytest.raises(ValueError, match="demo account"):
        BUILD.prepare_variant(ROOT, "titan_m5", ROOT / "output" / "test-evidence-build", preset_path=_compatible_preset(tmp_path, "titan_m5"))
    monkeypatch.setitem(account_gateway.ACCOUNTS["titan_m5"], "is_demo", original)


def test_prepare_rejects_symlinked_alias_output(monkeypatch, tmp_path):
    alias_output = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    alias_output.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(BUILD, "_is_link_or_junction", lambda path: path == alias_output)
    with pytest.raises(ValueError, match="symlink or junction"):
        BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent, preset_path=_compatible_preset(tmp_path))


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
        BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent, preset_path=_compatible_preset(tmp_path))
        for outside, original in external_files:
            assert outside.read_bytes() == original
    finally:
        shutil.rmtree(alias_output.parent, ignore_errors=True)


def test_prepare_clears_stale_compile_outputs_before_writing_source(monkeypatch, tmp_path):
    alias_output = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    alias_output.mkdir(parents=True, exist_ok=True)
    artifact = alias_output / "XAU_Titan_Pro_BasketGuard.ex5"
    log = alias_output / "XAU_Titan_Pro_BasketGuard.log"
    artifact.write_bytes(b"stale")
    log.write_bytes(b"stale success log")
    monkeypatch.setattr(BUILD, "_atomic_write", lambda *args: (_ for _ in ()).throw(OSError("simulated write failure")))
    try:
        with pytest.raises(OSError, match="simulated write failure"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", alias_output.parent, preset_path=_compatible_preset(tmp_path))
        assert not artifact.exists()
        assert not log.exists()
    finally:
        shutil.rmtree(alias_output.parent, ignore_errors=True)


@pytest.mark.parametrize("mismatch", ["missing", "unknown", "duplicate"])
def test_prepare_refuses_incompatible_preset_inputs_before_writing_variant(tmp_path, mismatch):
    source = (ROOT / f"{BUILD.EA_NAME}.mq5").read_text(encoding="utf-8-sig")
    names = re.findall(r"^\s*input\s+(?:\w+)\s+(\w+)\s*=", source, re.M)
    preset = tmp_path / BUILD.EXPECTED_PRESETS["xau5m_m5"]
    if mismatch == "missing":
        names = names[:-1]
    elif mismatch == "unknown":
        names = [*names, "InpUnrecognized"]
    else:
        names = [*names, names[0]]
    raw = ("\ufeff" + "\r\n".join(f"{name}=0" for name in names)).encode("utf-16-le")
    preset.write_bytes(raw)
    BUILD.EXPECTED_PRESET_SHA256["xau5m_m5"] = hashlib.sha256(raw).hexdigest()
    target = ROOT / "output" / "test-evidence-build-incompatible"
    shutil.rmtree(target, ignore_errors=True)
    try:
        message = "duplicate input names" if mismatch == "duplicate" else "preset inputs do not match"
        with pytest.raises(ValueError, match=message):
            BUILD.prepare_variant(ROOT, "xau5m_m5", target, preset_path=preset)
        assert not target.exists()
    finally:
        shutil.rmtree(target, ignore_errors=True)


def test_prepare_refuses_another_accounts_preset_before_writing_variant(tmp_path):
    other_account_preset = _compatible_preset(tmp_path, "titan_m5")
    target = ROOT / "output" / "test-evidence-build-wrong-account-preset"
    shutil.rmtree(target, ignore_errors=True)
    try:
        with pytest.raises(ValueError, match="not bound to account"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", target, preset_path=other_account_preset)
        assert not target.exists()
    finally:
        shutil.rmtree(target, ignore_errors=True)


def test_prepare_refuses_empty_preset_value_before_writing_variant(tmp_path):
    preset = _compatible_preset(tmp_path)
    raw = preset.read_text(encoding="utf-16")
    name = re.findall(r"^\ufeff?([A-Za-z_]\w*)=", raw, re.M)[0]
    preset.write_text(raw.replace(f"{name}=0", f"{name}=", 1), encoding="utf-16")
    BUILD.EXPECTED_PRESET_SHA256["xau5m_m5"] = hashlib.sha256(preset.read_bytes()).hexdigest()
    target = ROOT / "output" / "test-evidence-build-empty-value"
    shutil.rmtree(target, ignore_errors=True)
    try:
        with pytest.raises(ValueError, match="empty value"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", target, preset_path=preset)
        assert not target.exists()
    finally:
        shutil.rmtree(target, ignore_errors=True)


def test_prepare_refuses_malformed_preset_record_before_writing_variant(tmp_path):
    preset = _compatible_preset(tmp_path)
    with preset.open("ab") as stream:
        stream.write("\r\nnot-a-key-value-record\r\n".encode("utf-16-le"))
    BUILD.EXPECTED_PRESET_SHA256["xau5m_m5"] = hashlib.sha256(preset.read_bytes()).hexdigest()
    target = ROOT / "output" / "test-evidence-build-malformed-record"
    shutil.rmtree(target, ignore_errors=True)
    try:
        with pytest.raises(ValueError, match="malformed input record"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", target, preset_path=preset)
        # A content mutation cannot borrow the account's expected digest.
        assert not target.exists()
    finally:
        shutil.rmtree(target, ignore_errors=True)


def test_prepare_refuses_another_preset_renamed_to_account_filename(tmp_path):
    preset = _compatible_preset(tmp_path, "titan_m5")
    renamed = tmp_path / BUILD.EXPECTED_PRESETS["xau5m_m5"]
    preset.replace(renamed)
    target = ROOT / "output" / "test-evidence-build-renamed-preset"
    shutil.rmtree(target, ignore_errors=True)
    try:
        with pytest.raises(ValueError, match="content hash is not bound"):
            BUILD.prepare_variant(ROOT, "xau5m_m5", target, preset_path=renamed)
        assert not target.exists()
    finally:
        shutil.rmtree(target, ignore_errors=True)


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


def test_cli_reports_incompatible_preset_as_a_refusal_without_traceback(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["build_titan_evidence.py", "xau5m_m5", "--preset", "demo.set"])
    monkeypatch.setattr(BUILD, "prepare_variant", lambda *args, **kwargs: (_ for _ in ()).throw(
        ValueError("preset inputs do not match EA input schema (missing=15, unknown=0)")))

    assert BUILD.main() == 2

    output = capsys.readouterr()
    assert "preset inputs do not match EA input schema" in output.err
    assert "Traceback" not in output.err
