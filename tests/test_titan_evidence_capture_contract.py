"""Contracts for opt-in, non-invasive Titan decision capture."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
EA = ROOT / "XAU_Titan_Pro_BasketGuard.mq5"
SPOOL = ROOT / "ChartStudioEvidenceSpool.mqh"


def _function(source: str, name: str) -> str:
    match = re.search(rf"\b{name}\s*\([^;]*?\)\s*\{{", source)
    assert match, f"missing {name}"
    start = match.end() - 1
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1:index]
    raise AssertionError(f"unterminated {name}")


def test_spool_is_opt_in_for_normal_builds_and_demo_identity_is_checked():
    ea = EA.read_text(encoding="utf-8-sig")
    spool = SPOOL.read_text(encoding="utf-8-sig")

    assert '#include "ChartStudioEvidenceSpool.mqh"' in ea
    assert "#ifdef CS_EVIDENCE_CAPTURE\n#define CS_EVIDENCE_CAPTURE_ENABLED" in spool
    assert "#if CS_EVIDENCE_CAPTURE" not in spool
    assert "CSValidateRuntimeIdentity" in spool
    assert "ACCOUNT_TRADE_MODE_DEMO" in spool
    assert "CS_EVIDENCE_TERMINAL_HASH" in spool
    assert "CS_EVIDENCE_SOURCE_HASH" in spool


def test_decision_capture_keeps_the_existing_signal_and_order_conditions():
    ea = EA.read_text(encoding="utf-8-sig")
    decision = _function(ea, "CheckSignalAndTrade")

    assert "bool buy_signal  = base_buy && buy_not_overextended && buy_run_ok && buy_sr_ok;" in decision
    assert "bool sell_signal = base_sell && sell_not_overextended && sell_run_ok && sell_sr_ok;" in decision
    assert decision.count("CanOpenWithinBasketRisk(") == 2
    assert decision.count('CSEnqueueDecision("RISK_GUARD"') == 2
    assert decision.count("if(!risk_allowed)") == 2
    assert decision.count("m_trade.Buy(") == 1
    assert decision.count("m_trade.Sell(") == 1
    assert "CSEnqueueDecision" in decision


def test_market_and_transaction_callbacks_enqueue_only_while_timer_flushes_disk():
    ea = EA.read_text(encoding="utf-8-sig")
    spool = SPOOL.read_text(encoding="utf-8-sig")
    for name in ("OnTick", "CheckSignalAndTrade", "OnTradeTransaction"):
        body = _function(ea, name)
        assert not re.search(r"\b(FileOpen|FileWrite|FileWriteString|FileFlush|FileMove)\s*\(", body)
    assert "void OnTimer()" in ea
    assert "CSFlushEvidenceQueue()" in _function(ea, "OnTimer")
    assert "CS_QUEUE_CAPACITY" in spool
    assert "CSQueueOverflowCount" in spool
    assert "evidence recorder queue loss" in spool
    assert "CSQueueOverflowCount>=CSQueueOverflowNextLog" in _function(spool, "CSFlushEvidenceQueue")


def test_failed_segment_write_removes_its_unimportable_temporary_file():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    write = _function(spool, "CSWriteReadySegment")

    assert write.count("FileDelete(temp,FILE_COMMON)") == 2
    assert write.index("FileClose(handle);") < write.index("if(!complete)")
    assert "if(!complete)\n     {\n      FileDelete(temp,FILE_COMMON);\n      return false;\n     }" in write
    assert "if(!FileMove(temp,FILE_COMMON,ready,FILE_COMMON))\n     {\n      FileDelete(temp,FILE_COMMON);\n      return false;\n     }" in write


def test_capture_records_strategy_features_and_closed_bar_predicates():
    ea = EA.read_text(encoding="utf-8-sig")
    decision = _function(ea, "CheckSignalAndTrade")

    for field in ("close1", "open1", "trend_ema[1]", "fast_ema[1]", "slow_ema[1]", "rsi_val[1]", "atr_val[1]", "buy_signal", "sell_signal"):
        assert field in decision
    assert 'string timeframe="M15"' in decision
    assert "dataProvenance" in SPOOL.read_text(encoding="utf-8-sig")
    assert "parameterSetHash" in SPOOL.read_text(encoding="utf-8-sig")
    assert "CS_EVIDENCE_SOURCE_HASH" in SPOOL.read_text(encoding="utf-8-sig")
    assert "subsystemId" in SPOOL.read_text(encoding="utf-8-sig")


def test_order_attempt_capture_is_post_request_opt_in_and_contains_event_time_quote():
    ea = EA.read_text(encoding="utf-8-sig")
    spool = SPOOL.read_text(encoding="utf-8-sig")
    decision = _function(ea, "CheckSignalAndTrade")

    assert decision.count('CSEnqueueDecision("ORDER_ATTEMPT"') == 4
    assert decision.count("bool order_sent=m_trade.") == 2
    assert decision.count("CSOrderAttemptJson(cs_attempt_id") == 2
    assert "request_time_utc" in spool
    assert "quoteSnapshot" in spool and "tickValuePerLot" in spool
    assert "MT5_VERIFIED" in spool and "canExecute" in spool
    assert "CSUtcFromMillis(cs_tick.time_msc)" in decision
    assert "return CSUtc(seconds);" in spool
    assert re.search(r"#ifdef CS_EVIDENCE_CAPTURE_ENABLED\s+MqlTick cs_tick=\{\};.*?bool order_sent=m_trade\.Buy", decision, re.S)
    assert "SymbolInfoTick(_Symbol,cs_tick)" in decision


def test_parameter_hash_covers_every_ea_input_once():
    ea = EA.read_text(encoding="utf-8-sig")
    canonical = _function(ea, "CSParameterSetCanonical")
    inputs = re.findall(r"^\s*input\s+(?!group\b)\w+\s+(\w+)\s*=", ea, re.MULTILINE)
    hashed = re.findall(r'result\+="(\w+)=' , canonical)

    assert len(inputs) == 65
    assert len(hashed) == len(set(hashed))
    assert set(hashed) == set(inputs)
