from pathlib import Path
import hashlib
import json
import re
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
        broker_utc_offset_seconds=10800,
    )

    assert '#define CS_EVIDENCE_CAPTURE' in generated
    assert '#define CS_EVIDENCE_ACCOUNT_ID "goldm15"' in generated
    assert '#define CS_EVIDENCE_STRATEGY_ID "goldm15_reconstruction"' in generated
    assert '#define CS_EVIDENCE_STRATEGY_VERSION "1.22"' in generated
    assert "CS_EVIDENCE_EXPECTED_LOGIN 53090070" in generated
    assert "CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS 10800" in generated
    assert 'CSEnqueueDecision("SIGNAL",cs_outcome,cs_bar,cs_features,cs_predicates);' in generated
    assert 'CSEnqueueDecision(cs_has_position ? "EXIT_SIGNAL" : "SIGNAL"' not in generated
    assert 'CSFeature("exit_candidate"' in generated
    assert 'CSPredicate("exit_candidate"' in generated
    assert 'CSFeature("fast_rsi"' in generated
    assert 'CSPredicate("buy_fast_rsi"' in generated
    assert 'CSPredicate("sell_trend_rsi"' in generated
    assert 'CSOrderAttemptJson(cs_attempt_id' in generated
    assert 'CSUtcFromBrokerMillis(tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)' in generated
    assert 'tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS' in generated
    assert 'CSEnqueueDecision("ORDER_ATTEMPT"' in generated
    assert 'SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT)' in generated
    assert 'CSFeature("requested_lots"' in generated
    assert 'cs_tick_size>0.0 &&\n         cs_retcode>0' in generated
    assert "signal_timeframe!=PERIOD_M15" in generated
    assert "CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH" in generated
    assert generated.count("trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)") == 1
    assert generated.count("trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)") == 1
    assert generated.count("GoldPullbackSignal(") == source.count("GoldPullbackSignal(")
    assert generated.index("CSFlushEvidenceQueue();") > generated.index("void OnTimer()")
    assert generated.index("CSFlushEvidenceQueue();") < generated.index("risk_guard.Service(trade,MagicBase);", generated.index("void OnTimer()"))


def test_goldm15_record_only_variant_suppresses_every_trade_write_but_keeps_capture():
    source = (ROOT / "goldm15" / "GoldM15_Reconstruction.mq5").read_text(encoding="utf-8-sig")
    risk = (ROOT / "goldm15" / "GoldM15_Risk.mqh").read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_source(
        source,
        account_alias="goldm15",
        producer="goldm15_demo_recordonly",
        terminal_hash="a" * 64,
        source_hash="b" * 64,
        expected_parameter_hash="c" * 64,
        login=53090070,
        server="ICMarketsEU-Demo",
        terminal_path=r"C:\demo\terminal64.exe",
        broker_utc_offset_seconds=10800,
        record_only=True,
    )
    generated_risk = BUILD._instrument_risk_helper(risk, record_only=True)

    assert '#define CS_EVIDENCE_RECORD_ONLY' in generated
    for operation in (
        "trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)",
        "trade.Sell(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)",
        "trade.PositionClose(ticket)",
        "closer.OrderDelete(ticket)",
        "closer.PositionClose(ticket)",
    ):
        assert operation not in generated + generated_risk
    assert 'CSSuppressBrokerWrite("OrderDelete")' in generated_risk
    assert 'CSSuppressBrokerWrite("PositionClose")' in generated_risk
    assert 'CSSuppressBrokerWrite(side==1 ? "Buy" : "Sell")' in generated
    assert "RECORD-ONLY: suppressed broker write operation=%s reason=RECORD_ONLY_SUPPRESSED" in generated
    assert 'CS_EVIDENCE_PRODUCER_ID "goldm15_demo_recordonly"' in generated
    assert 'CSEnqueueDecision("SIGNAL",cs_outcome,cs_bar,cs_features,cs_predicates);' in generated
    assert 'RECORD_ONLY_SUPPRESSED' in generated + generated_risk


def test_goldm15_deinit_flushes_before_timer_and_risk_guard_shutdown():
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
        broker_utc_offset_seconds=10800,
    )
    deinit = re.search(r"void OnDeinit\(const int reason\)\s*\{(.*?)^\}", generated, re.S | re.M)

    assert deinit, "generated GoldM15 EA must retain its deinitialization handler"
    body = deinit.group(1)
    assert "CSFlushEvidenceQueueOnShutdown();" in body
    assert body.index("CSFlushEvidenceQueueOnShutdown();") < body.index("EventKillTimer();")
    assert body.index("CSFlushEvidenceQueueOnShutdown();") < body.index("risk_guard.Shutdown();")


def test_goldm15_candidate_correlates_partial_deals_and_owned_position_changes():
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
        broker_utc_offset_seconds=10800,
    )

    assert "CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,iTime(_Symbol,signal_timeframe,1));" in generated
    match = re.search(r"void OnTradeTransaction\([^)]*\)\s*\{(.*?)^  \}", generated, re.S | re.M)
    assert match, "generated GoldM15 EA must observe broker deal and position transactions"
    handler = match.group(1)

    assert "TRADE_TRANSACTION_DEAL_ADD" in handler
    assert "CSFindOrderAttempt(trans.order" in handler
    assert 'CSEnqueueDecision("BROKER_RESULT","PASS"' in handler
    assert "trans.deal,trans.position" in handler
    assert 'CSFeature("deal_volume"' in handler
    assert 'CSFeature("deal_price"' in handler
    assert "PositionSelectByTicket(trans.position)" in handler
    assert "PositionGetDouble(POSITION_VOLUME)" in handler
    assert "PositionGetDouble(POSITION_SL)" in handler
    assert "PositionGetDouble(POSITION_TP)" in handler
    assert "CSRegisterPosition(trans.position,cs_attempt_id,cs_signal_bar," in handler
    assert "TRADE_TRANSACTION_POSITION" in handler
    assert "CSFindPosition(trans.position" in handler
    assert 'CSFeature("sl_before"' in handler and 'CSFeature("sl_after"' in handler
    assert 'CSFeature("volume_before"' in handler and 'CSFeature("volume_after"' in handler
    assert "CSRegisterPosition(trans.position,cs_attempt_id" in handler
    assert not re.search(r"\b(trade\.(?:Buy|Sell|PositionModify|PositionClose)|OrderSend|HistoryDealGet|FileOpen|FileWrite|FileFlush|Sleep)\s*\(", handler)


def test_goldm15_candidate_records_strategy_close_attempt_without_changing_close_call():
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
        broker_utc_offset_seconds=10800,
    )

    close_call = "bool closed=trade.PositionClose(ticket);"
    assert generated.count(close_call) == source.count(close_call) == 1
    close_start = generated.rfind("if(ticket>0)", 0, generated.index(close_call))
    close_end = generated.index("// Keep close intent", generated.index(close_call))
    close_path = generated[close_start:close_end]
    assert "CSOrderAttemptJson(cs_close_attempt_id" in close_path
    assert 'CSEnqueueDecision("ORDER_ATTEMPT",cs_close_outcome' in close_path
    assert "cs_close_side" in close_path and "cs_close_price" in close_path
    assert "cs_close_volume" in close_path
    assert 'if(cs_close_position_known && cs_close_side!="")' in close_path
    assert 'CSFeature("position_ticket"' not in close_path
    assert "cs_close_ticket,cs_close_attempt_id" in close_path
    assert "cs_close_request_time,0,ticket" in close_path
    assert "CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS" in close_path


def test_goldm15_candidate_records_risk_guard_liquidations_with_reason_and_order_link():
    risk = (ROOT / "goldm15" / "GoldM15_Risk.mqh").read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_risk_helper(risk)
    source = (ROOT / "goldm15" / "GoldM15_Reconstruction.mq5").read_text(encoding="utf-8-sig")
    candidate = BUILD._instrument_source(
        source,
        account_alias="goldm15",
        producer="goldm15_demo",
        terminal_hash="a" * 64,
        source_hash="b" * 64,
        expected_parameter_hash="c" * 64,
        login=53090070,
        server="ICMarketsEU-Demo",
        terminal_path=r"C:\demo\terminal64.exe",
        broker_utc_offset_seconds=10800,
    )

    assert "void GoldLiquidate(CTrade &closer,long magic,bool all,const string reason)" in generated
    assert "GoldLiquidate(closer,magic,all_scope,cs_reason)" in generated
    for trigger in (
        '"HARD_LOCK"', '"DAILY_DRAWDOWN"', '"ROLLOVER"',
        '"BASELINE_UNKNOWN"', '"PERSISTENCE_FAILURE"', '"HOLIDAY_OR_GUARD"',
    ):
        assert trigger in generated
    assert "CSCaptureGoldRiskCloseAttempt(reason,ticket,cs_position_type,cs_volume," in generated
    assert "CSRegisterOrderAttempt(order_ticket,attempt_id,bar_time)" in candidate
    assert 'CSEnqueueDecision("ORDER_ATTEMPT",outcome,bar_time' in candidate
    assert 'position_type==POSITION_TYPE_SELL ? "BUY" : ""' in candidate
    assert 'quote_ok && side!=""' in candidate
    assert "symbol!=_Symbol" in candidate
    assert '#define CS_EVIDENCE_CAPTURE' in candidate
    assert candidate.index('#define CS_EVIDENCE_CAPTURE') < candidate.index('#include "GoldM15_Risk.mqh"')
    assert "#else\n         if(!closer.PositionClose(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat" in generated
    assert generated.count("GoldCancelOrders(closer,magic,all,reason);") == 1
    assert "CSCaptureGoldRiskCloseAttempt" not in risk


def test_goldm15_candidate_records_pending_order_cancel_attempts_without_fill_correlation():
    risk = (ROOT / "goldm15" / "GoldM15_Risk.mqh").read_text(encoding="utf-8-sig")
    generated = BUILD._instrument_risk_helper(risk)

    assert "void GoldCancelOrders(CTrade &closer,long magic,bool all,const string reason)" in generated
    assert "GoldCancelOrders(closer,magic,all,reason);" in generated
    assert 'GoldCancelOrders(closer,magic,all_scope,"NEWS_ENTRY_VETO")' in generated
    assert "bool cs_cancelled=closer.OrderDelete(ticket);" in generated
    assert "uint cs_cancel_retcode=closer.ResultRetcode();" in generated
    assert 'CSEnqueueDecision("ORDER_ATTEMPT",cs_cancel_outcome' in generated
    assert 'CSPredicate("pending_order_cancel"' in generated
    assert "CSFeature(\"pending_order_price\"" in generated
    assert "CSFeature(\"pending_order_volume\"" in generated
    assert 'cs_cancel_id,ticket,cs_request_time' in generated
    assert "CSRegisterOrderAttempt" not in generated
    assert "#else\n         if(!closer.OrderDelete(ticket) || !GoldAcceptedResult(closer.ResultRetcode())) PrintFormat" in generated


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
            broker_utc_offset_seconds=10800,
        )


def test_goldm15_candidate_refuses_changed_order_submission_anchor():
    source = (ROOT / "goldm15" / "GoldM15_Reconstruction.mq5").read_text(encoding="utf-8-sig")
    changed = source.replace("trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment)",
                             "trade.Buy(lots,_Symbol,0.0,NormalizeDouble(stop,_Digits),0.0,comment); // changed")
    with pytest.raises(ValueError, match="unique GoldM15 market-order submission"):
        BUILD._instrument_source(
            changed,
            account_alias="goldm15",
            producer="goldm15_demo",
            terminal_hash="a" * 64,
            source_hash="b" * 64,
            expected_parameter_hash="c" * 64,
            login=53090070,
            server="ICMarketsEU-Demo",
            terminal_path=r"C:\demo\terminal64.exe",
            broker_utc_offset_seconds=10800,
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
        generated_risk = package / "GoldM15_Risk.mqh"
        assert "CSCaptureGoldRiskCloseAttempt(reason,ticket" in generated_risk.read_text(encoding="utf-8-sig")
        assert manifest["generatedSupportingSources"][BUILD.HELPERS[1].as_posix()] == hashlib.sha256(
            generated_risk.read_bytes()
        ).hexdigest()
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
