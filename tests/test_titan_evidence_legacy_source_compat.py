from pathlib import Path
import hashlib
import re
import shutil
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_titan_evidence as BUILD


def test_prepare_accepts_only_the_verified_legacy_guard_source_with_windows_newlines(tmp_path, monkeypatch):
    import account_gateway

    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    names = re.findall(r"^\s*input\s+(?:\w+)\s+(\w+)\s*=", source, re.M)
    preset = tmp_path / BUILD.EXPECTED_PRESETS["xau5m_m5"]
    preset_raw = ("\ufeff" + "\r\n".join(f"{name}=0" for name in names)).encode("utf-16-le")
    preset.write_bytes(preset_raw)
    expected_preset_hashes = dict(BUILD.EXPECTED_PRESET_SHA256)
    expected_preset_hashes["xau5m_m5"] = hashlib.sha256(preset_raw).hexdigest()
    monkeypatch.setattr(BUILD, "EXPECTED_PRESET_SHA256", expected_preset_hashes)
    terminal_root = tmp_path / "portable-terminal"
    terminal_root.mkdir()
    terminal = terminal_root / "terminal64.exe"
    terminal.touch()
    (terminal_root / "MetaEditor64.exe").touch()
    trade_include = terminal_root / "MQL5" / "Include" / "Trade" / "Trade.mqh"
    trade_include.parent.mkdir(parents=True)
    trade_include.touch()
    experts = terminal_root / "MQL5" / "Experts"
    experts.mkdir(parents=True)
    shutil.copyfile(ROOT / BUILD.SOURCE_NAME, experts / "XAU_Titan_Pro.mq5")
    (experts / "XAU_Titan_Pro.ex5").write_bytes(b"fixture-installed-binary")
    monkeypatch.setitem(account_gateway.ACCOUNTS["xau5m_m5"], "terminal", str(terminal))
    installed_source = terminal_root / "MQL5" / "Experts" / "XAU_Titan_Pro.mq5"
    source = source.replace("\r\n", "\n")
    legacy = source.replace(
        "// Legacy setfile field; challenge enforcement is bound to the verified Blueberry account.",
        "// Harter Prop-Firm Notaus aktiv (Standard: true für maximalen Kontoschutz)",
    )
    legacy, removed = re.subn(
        r"// Challenge protection is enforced only on the configured Blueberry account\.\n"
        r"// This deliberately ignores legacy setfile toggles on every other account\.\n"
        r"bool IsBlueberryChallengeAccount\(\)\n\{.*?\n\}\n",
        "",
        legacy,
        count=1,
        flags=re.S,
    )
    assert removed == 1
    legacy = legacy.replace("if(IsBlueberryChallengeAccount())", "if(InpEnablePropProtection)")
    installed_source.write_bytes(legacy.replace("\n", "\r\n").encode("utf-8"))

    output_root = ROOT / "output" / f"test-evidence-legacy-source-{tmp_path.name}"
    assert not output_root.exists()
    try:
        variant = BUILD.prepare_variant(ROOT, "xau5m_m5", output_root, preset_path=preset)
        generated = variant.source.read_text(encoding="utf-8-sig")
        assert "bool IsBlueberryChallengeAccount()" in generated
        assert "if(IsBlueberryChallengeAccount())" in generated
        assert "if(InpEnablePropProtection)" not in generated
    finally:
        resolved = output_root.resolve()
        assert resolved.is_relative_to((ROOT / "output").resolve())
        if output_root.exists():
            shutil.rmtree(output_root)
