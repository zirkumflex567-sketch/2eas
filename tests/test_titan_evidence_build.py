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
    source = (ROOT / "XAU_Titan_Pro_EvidenceBase.mq5").read_text(encoding="utf-8-sig")
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
        experts = terminal_root / "MQL5" / "Experts"
        experts.mkdir(parents=True)
        shutil.copyfile(ROOT / BUILD.SOURCE_NAME, experts / "XAU_Titan_Pro.mq5")
        (experts / "XAU_Titan_Pro.ex5").write_bytes(b"fixture-installed-binary")
        monkeypatch.setitem(account_gateway.ACCOUNTS[alias], "terminal", str(terminal))


def test_titan_candidate_uses_explicit_broker_offset_for_quote_utc_and_provenance():
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source, "xau5m_m5", "titan_test", "a" * 64, "b" * 64, "c" * 64,
        53090070, "ICMarketsEU-Demo", r"C:\demo\terminal64.exe", 10800,
    )
    assert "#define CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS 10800" in generated
    assert "CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)" in generated
    assert "cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS" in generated


def test_titan_deinit_flushes_bounded_recorder_queue_before_killing_timer():
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source, "xau5m_m5", "titan_test", "a" * 64, "b" * 64, "c" * 64,
        700194619, "PUPrime-Demo", r"C:\\demo\\terminal64.exe", 10800,
    )
    deinit = re.search(r"void OnDeinit\(const int reason\)\s*\{(.*?)^\}", generated, re.S | re.M)

    assert deinit, "generated EA must retain its deinitialization handler"
    body = deinit.group(1)
    assert "CSFlushEvidenceQueueOnShutdown();" in body
    assert body.index("CSFlushEvidenceQueueOnShutdown();") < body.index("EventKillTimer();")
    helper = (ROOT / "ChartStudioEvidenceSpool.mqh").read_text()
    assert "#define CS_SHUTDOWN_FLUSH_PASSES ((CS_QUEUE_CAPACITY+1+CS_QUEUE_BATCH-1)/CS_QUEUE_BATCH)" in helper
    drain = re.search(r"void CSFlushEvidenceQueueOnShutdown\(\)\s*\{(.*?)^  \}", helper, re.S | re.M)
    assert drain, "shared spool must provide a bounded shutdown drain"
    assert "pass<CS_SHUTDOWN_FLUSH_PASSES" in drain.group(1)
    assert "CSQueueCount>=before" in drain.group(1)
    assert "CSRecorderDisabled" in drain.group(1)


def test_titan_candidate_correlates_real_deal_transactions_to_order_attempts():
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source, "titan_m5", "titan_test", "a" * 64, "b" * 64, "c" * 64,
        700184986, "PUPrime-Demo", r"C:\\demo\\terminal64.exe", 10800,
    )
    match = re.search(r"void OnTradeTransaction\([^)]*\)\s*\{(.*?)^  \}", generated, re.S | re.M)
    assert match, "generated EA must have an observable trade-transaction handler"
    handler = match.group(1)

    assert "TRADE_TRANSACTION_DEAL_ADD" in handler
    assert "CSFindOrderAttempt(trans.order" in handler
    assert 'CSEnqueueDecision("BROKER_RESULT"' in handler
    assert "trans.deal,trans.position" in handler
    assert 'CSFeature("deal_ticket"' not in handler
    assert 'CSFeature("position_ticket"' not in handler
    for observed in ("trans.deal", "trans.order", "trans.position", "trans.volume", "trans.price", "trans.deal_type", "trans.type", "trans.price_sl", "trans.price_tp"):
        assert observed in handler
    assert "datetime cs_observed_utc=TimeGMT();" in handler
    assert "CSUtc(cs_observed_utc)" in handler
    assert "time_msc" not in handler
    assert "CSRegisterOrderAttempt(" in generated
    assert "HistoryDealGet" not in handler
    assert not re.search(r"\b(FileOpen|FileWrite|FileWriteString|FileFlush|FileMove|Sleep)\s*\(", handler)


def test_titan_candidate_observes_owned_position_stop_changes_without_trade_side_effects():
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source, "titan_m5", "titan_test", "a" * 64, "b" * 64, "c" * 64,
        700184986, "PUPrime-Demo", r"C:\\demo\\terminal64.exe", 10800,
    )
    match = re.search(r"void OnTradeTransaction\([^)]*\)\s*\{(.*?)^  \}", generated, re.S | re.M)
    assert match, "generated EA must observe position transactions"
    handler = match.group(1)

    assert "TRADE_TRANSACTION_POSITION" in handler
    assert "CSFindPosition(trans.position" in handler
    assert "sl_before" in handler and "sl_after" in handler
    assert "tp_before" in handler and "tp_after" in handler
    assert "CSEnqueueDecision(\"BROKER_RESULT\"" in handler
    assert "CSSeedOpenPositionSnapshots();" in generated
    assert "CSRegisterPosition(" in generated
    assert not re.search(r"\b(m_trade\.(?:Buy|Sell|PositionModify|PositionClose)|OrderSend|FileOpen|FileWrite|FileFlush)\s*\(", handler)


def test_titan_candidate_records_each_risk_close_attempt_without_changing_guard_flow():
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source, "titan_m5", "titan_test", "a" * 64, "b" * 64, "c" * 64,
        700184986, "PUPrime-Demo", r"C:\\demo\\terminal64.exe", 10800,
    )

    for reason in (
        "DAILY_DRAWDOWN", "TOTAL_DRAWDOWN", "PROFIT_TARGET",
        "WEEKEND_FRIDAY", "WEEKEND", "DYNAMIC_RUNNER",
    ):
        assert f'CloseAllPositionsForMagic("{reason}")' in generated
    assert generated.count("CloseAllPositionsForMagic(\"DYNAMIC_RUNNER\")") == 1
    assert "void CloseAllPositionsForMagic(const string cs_reason)" in generated
    assert "CSOrderAttemptJson(cs_attempt_id,cs_close_side" in generated
    assert 'CSEnqueueDecision("ORDER_ATTEMPT",cs_close_outcome' in generated
    assert 'CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,cs_close_bar_time)' in generated
    assert generated.count("m_trade.PositionClose(m_position.Ticket());") == 1
    assert "#else\n            m_trade.PositionClose(m_position.Ticket());\n#endif" in generated
    assert "bool cs_close_sent=m_trade.PositionClose(ticket);" in generated
    assert 'cs_close_sent ? "PASS" : "BLOCK"' in generated
    assert 'CSPredicate("risk_guard_close",cs_close_sent ? "1" : "0"' in generated
    assert 'cs_position_type==POSITION_TYPE_SELL ? "BUY" : ""' in generated
    assert 'cs_close_side!=""' in generated
    assert "TRADE_ACTION" not in generated


@pytest.mark.parametrize("alias", ["xau5m_m5", "titan_m5"])
def test_prepare_creates_identity_bound_capture_variant_only_under_output(tmp_path, alias):
    target = ROOT / "output" / "test-evidence-build" / alias
    shutil.rmtree(target, ignore_errors=True)
    try:
        preset = _compatible_preset(tmp_path, alias)
        result = BUILD.prepare_variant(ROOT, alias, target.parent, preset_path=preset)

        source = result.source.read_text(encoding="utf-8-sig")
        assert result.source.parent == target
        assert result.source.name == "XAU_Titan_Pro_EvidenceCapture.mq5"
        assert '#define CS_EVIDENCE_CAPTURE' in source
        assert f'#define CS_EVIDENCE_ACCOUNT_ID "{alias}"' in source
        assert "CS_EVIDENCE_EXPECTED_LOGIN" in source
        assert "CS_EVIDENCE_EXPECTED_SERVER" in source
        assert "CS_EVIDENCE_EXPECTED_TERMINAL_PATH" in source
        assert "#define CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS 0" in source
        assert "CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)" in source
        assert "cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS" in source
        assert (result.source.parent / "ChartStudioEvidenceSpool.mqh").is_file()
        assert result.manifest.is_file()
        manifest = json.loads(result.manifest.read_text(encoding="utf-8"))
        assert manifest["presetSha256"] == hashlib.sha256(preset.read_bytes()).hexdigest()
        assert manifest["presetName"] == preset.name
        assert manifest["presetInputCount"] == 50
        assert manifest["sourceSha256"] == BUILD.EXPECTED_SOURCE_SHA256
        assert "bool IsBlueberryChallengeAccount()" in source
        assert "if(IsBlueberryChallengeAccount())" in source
        assert "if(InpEnablePropProtection)" not in source
        assert manifest["expectedParameterSetHash"] == BUILD._expected_parameter_hash(
            (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig"),
            BUILD._preset_input_names(preset)[1],
        )
        assert manifest["expectedParameterSetHash"] in source
        assert manifest["installedBinarySha256"] == hashlib.sha256(b"fixture-installed-binary").hexdigest()
        assert len(re.findall(r"^\s*input\s+(?:\w+)\s+\w+\s*=", source, re.M)) == 50
        assert source.count("m_trade.Buy(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment)") == 1
        assert source.count("m_trade.Sell(lot_size, _Symbol, entry_price, sl_price, tp_price, InpTradeComment)") == 1
        assert 'CSEnqueueDecision("SIGNAL"' in source
        assert source.count("CSOrderAttemptJson(cs_attempt_id") == 3
        assert source.count("bool cs_order_sent=m_trade.") == 2
        assert source.count('CSEnqueueDecision("ORDER_ATTEMPT"') == 5
        assert source.count("if(cs_order_sent)") == 2
        for observed_field in (
            "SymbolInfoTick(_Symbol,cs_tick)",
            "CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)",
            "SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE)",
            "SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE)",
            "SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT)",
            "m_trade.ResultRetcode()",
            "m_trade.ResultOrder()",
            "CSUtc(cs_ack_utc)",
            "cs_request_time",
        ):
            assert observed_field in source
        assert "entry_accepted" not in source
        assert "BLUEBERRY RISK BREACH" not in source
        assert source.count("RISK GUARD BREACH [%s | %s | %s]") == 2
        assert "AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period())" in source
        assert "BLUEBERRY GOAL REACHED!" not in source
        assert "PROFIT TARGET REACHED [%s | %s | %s]" in source
        assert "BLUEBERRY TARGET ERREICHT" not in source
        assert result.source.with_suffix(".ex5").parent == target
        assert not result.source.with_suffix(".ex5").exists()
    finally:
        shutil.rmtree(target.parent, ignore_errors=True)


def test_prepare_records_every_closed_bar_entry_filter_without_changing_trade_gates(tmp_path):
    target = ROOT / "output" / "test-evidence-build" / "xau5m_m5"
    shutil.rmtree(target.parent, ignore_errors=True)
    try:
        preset = _compatible_preset(tmp_path)
        result = BUILD.prepare_variant(ROOT, "xau5m_m5", target.parent, preset_path=preset)
        source = result.source.read_text(encoding="utf-8-sig")

        assert source.count('CSEnqueueDecision("ENTRY_FILTER"') == 4
        for reason in (
            "LOCKOUT_DAILY_DRAWDOWN",
            "LOCKOUT_TOTAL_DRAWDOWN",
            "LOCKOUT_PROFIT_TARGET",
            "OUTSIDE_TRADING_WINDOW",
            "MAX_OPEN_POSITIONS",
            "MIN_BARS_BETWEEN_ENTRIES",
        ):
            assert f'"{reason}"' in source
        assert "if(is_new_m15_bar && IsWithinTradingWindow(dt))" in source
        assert "if(open_count < InpMaxOpenPositions)" in source
        assert "current_m15_time > m_last_entry_time + (InpMinBarsBetweenEntries * PeriodSeconds(m_calc_timeframe))" in source
        assert source.count("CheckSignalAndTrade();") == 1
        assert source.count("CSEnqueueDecision(\"SIGNAL\"") == 1
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
    artifact = alias_output / "XAU_Titan_Pro_EvidenceCapture.ex5"
    log = alias_output / "XAU_Titan_Pro_EvidenceCapture.log"
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
    source = (ROOT / BUILD.SOURCE_NAME).read_text(encoding="utf-8-sig")
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


def test_recorder_base_matches_installed_titan_source_and_setfile_schema():
    source_path = ROOT / "XAU_Titan_Pro_EvidenceBase.mq5"
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == BUILD.EXPECTED_SOURCE_SHA256
    source_names = BUILD._input_names(source_path.read_text(encoding="utf-8-sig"))
    assert len(source_names) == 50


def test_prepare_refuses_terminal_source_drift_before_writing_variant(tmp_path):
    import account_gateway

    preset = _compatible_preset(tmp_path)
    terminal_root = Path(account_gateway.ACCOUNTS["xau5m_m5"]["terminal"]).parent
    installed_source = terminal_root / "MQL5" / "Experts" / "XAU_Titan_Pro.mq5"
    installed_source.write_bytes(installed_source.read_bytes() + b"// drift\n")
    target = ROOT / "output" / "test-evidence-build-source-drift"
    shutil.rmtree(target, ignore_errors=True)
    try:
        with pytest.raises(ValueError, match="installed Titan source does not match"):
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


def test_compile_candidate_attests_artifact_hash_and_clean_compile_result(tmp_path, monkeypatch):
    source = tmp_path / "variant.mq5"
    source.write_text("// candidate", encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps({"accountAlias": "titan_m5"}), encoding="utf-8")
    artifact = source.with_suffix(".ex5")
    artifact.write_bytes(b"known compiled artifact")
    variant = BUILD.BuildVariant(source, manifest_path, tmp_path / "MetaEditor64.exe", tmp_path / "MQL5", tmp_path / "compile.log")
    monkeypatch.setattr(BUILD, "compile_variant", lambda _variant: artifact)

    assert BUILD.compile_candidate(variant) == artifact

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["artifactSha256"] == hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert manifest["compileResult"] == "0 errors, 0 warnings"
    assert manifest["accountAlias"] == "titan_m5"


def test_cli_reports_incompatible_preset_as_a_refusal_without_traceback(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["build_titan_evidence.py", "xau5m_m5", "--preset", "demo.set"])
    monkeypatch.setattr(BUILD, "prepare_variant", lambda *args, **kwargs: (_ for _ in ()).throw(
        ValueError("preset inputs do not match EA input schema (missing=15, unknown=0)")))

    assert BUILD.main() == 2

    output = capsys.readouterr()
    assert "preset inputs do not match EA input schema" in output.err
    assert "Traceback" not in output.err
