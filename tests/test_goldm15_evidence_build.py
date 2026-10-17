from pathlib import Path
import hashlib
import json
import shutil
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_goldm15_evidence as BUILD


def test_goldm15_candidate_captures_computed_signal_values_without_changing_trade_calls():
    source = (ROOT / "goldm15" / "GoldM15_Reconstruction.mq5").read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source,
        account_alias="goldm15",
        producer="goldm15_demo",
        terminal_hash="a" * 64,
        source_hash="b" * 64,
        expected_parameter_hash="c" * 64,
        login=53090070,
        server="ICMarketsEU-Demo",
        terminal_path=r"C:\demo\terminal64.exe",
    )

    assert '#define CS_EVIDENCE_CAPTURE' in generated
    assert '#define CS_EVIDENCE_ACCOUNT_ID "goldm15"' in generated
    assert '#define CS_EVIDENCE_STRATEGY_ID "goldm15_reconstruction"' in generated
    assert '#define CS_EVIDENCE_STRATEGY_VERSION "1.22"' in generated
    assert "CS_EVIDENCE_EXPECTED_LOGIN 53090070" in generated
    assert 'CSEnqueueDecision(cs_has_position ? "EXIT_SIGNAL" : "SIGNAL"' in generated
    assert 'CSFeature("fast_rsi"' in generated
    assert 'CSPredicate("buy_fast_rsi"' in generated
    assert 'CSPredicate("sell_trend_rsi"' in generated
    assert "signal_timeframe!=PERIOD_M15" in generated
    assert "CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH" in generated
    assert generated.count("trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)") == 1
    assert generated.count("trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)") == 1
    assert generated.count("GoldPullbackSignal(") == source.count("GoldPullbackSignal(")
    assert generated.index("CSFlushEvidenceQueue();") > generated.index("void OnTimer()")
    assert generated.index("CSFlushEvidenceQueue();") < generated.index("risk_guard.Service(trade,MagicBase);", generated.index("void OnTimer()"))


def test_goldm15_candidate_refuses_unexpected_source_anchors():
    source = (ROOT / "goldm15" / "GoldM15_Reconstruction.mq5").read_text(encoding="utf-8-sig")
    with pytest.raises(ValueError, match="unique"):
        BUILD._instrument_source(
            source.replace("#include \"GoldM15_Risk.mqh\"", "#include \"GoldM15_Risk.mqh\"\n" * 2),
            account_alias="goldm15",
            producer="goldm15_demo",
            terminal_hash="a" * 64,
            source_hash="b" * 64,
            expected_parameter_hash="c" * 64,
            login=53090070,
            server="ICMarketsEU-Demo",
            terminal_path=r"C:\demo\terminal64.exe",
        )


def test_shared_spool_defaults_to_titan_but_allows_explicit_strategy_identity():
    helper = (ROOT / "ChartStudioEvidenceSpool.mqh").read_text(encoding="utf-8-sig")
    assert '#define CS_EVIDENCE_STRATEGY_ID "xau_titan_pro_basket_guard"' in helper
    assert '#define CS_EVIDENCE_STRATEGY_VERSION "7_20"' in helper
    assert 'CSJsonQuote(CS_EVIDENCE_STRATEGY_ID)' in helper
    assert 'CSJsonQuote(CS_EVIDENCE_STRATEGY_VERSION)' in helper


def test_mql_hash_is_stable_across_windows_and_unix_line_endings():
    expected = hashlib.sha256(b"line one\nline two\n").hexdigest()
    assert BUILD._source_digest(b"line one\nline two\n") == expected
    assert BUILD._source_digest(b"line one\r\nline two\r\n") == expected


@pytest.mark.parametrize("alias", ["blueberry", "titan", "xau5m_m5", "unknown"])
def test_goldm15_builder_rejects_other_account_aliases(alias, tmp_path):
    with pytest.raises(ValueError, match="not allowlisted"):
        BUILD.prepare_variant(ROOT, alias, tmp_path / "output", preset_path=tmp_path / "candidate.set")


def test_prepare_variant_writes_complete_package_only_below_ignored_output(tmp_path, monkeypatch):
    terminal_root = tmp_path / "demo-terminal"
    include_file = terminal_root / "MQL5" / "Include" / "Trade" / "Trade.mqh"
    include_file.parent.mkdir(parents=True)
    include_file.write_text("", encoding="utf-8")
    (terminal_root / "MetaEditor64.exe").write_bytes(b"compiler fixture")
    (terminal_root / "terminal64.exe").write_bytes(b"terminal fixture")
    monkeypatch.setitem(BUILD.account_gateway.ACCOUNTS["goldm15"], "terminal", str(terminal_root / "terminal64.exe"))

    output_root = ROOT / "output" / "test_goldm15_builder"
    package = output_root / "goldm15-evidence" / "goldm15"
    shutil.rmtree(output_root, ignore_errors=True)
    try:
        result = BUILD.prepare_variant(
            ROOT,
            "goldm15",
            output_root,
            preset_path=ROOT / "goldm15" / "GoldM15_Reconstruction.set",
        )
        manifest = json.loads(result.manifest.read_text(encoding="utf-8"))
        assert package == result.source.parent
        assert manifest["deployment"] == "NOT_INSTALLED"
        assert manifest["presetInputCount"] == 71
        assert manifest["spoolHelperSha256"] == BUILD.EXPECTED_HASHES["ChartStudioEvidenceSpool.mqh"]
        assert (package / "ChartStudioEvidenceSpool.mqh").is_file()
        assert all((package / path.name).is_file() for path in BUILD.HELPERS)
        assert result.source.with_suffix(".ex5").exists() is False
    finally:
        shutil.rmtree(output_root, ignore_errors=True)


def test_compile_candidate_records_compiled_binary_hash(tmp_path, monkeypatch):
    source = tmp_path / "candidate.mq5"
    manifest_path = tmp_path / "build-manifest.json"
    artifact = tmp_path / "candidate.ex5"
    source.write_text("// candidate", encoding="utf-8")
    manifest_path.write_text('{"deployment":"NOT_INSTALLED"}', encoding="utf-8")
    variant = BUILD.BuildVariant(source, manifest_path, tmp_path / "MetaEditor64.exe", tmp_path / "MQL5", tmp_path / "candidate.log")
    artifact_bytes = b"compiled EX5 candidate"

    def compile_fixture(_variant):
        artifact.write_bytes(artifact_bytes)
        return artifact

    monkeypatch.setattr(BUILD, "compile_variant", compile_fixture)
    assert BUILD.compile_candidate(variant) == artifact
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["artifactSha256"] == hashlib.sha256(artifact_bytes).hexdigest()
    assert manifest["compileResult"] == "0 errors, 0 warnings"
    assert manifest["deployment"] == "NOT_INSTALLED"
