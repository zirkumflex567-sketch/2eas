"""Contracts for opt-in, non-invasive Titan decision capture."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
EA = ROOT / "XAU_Titan_Pro_BasketGuard.mq5"
SPOOL = ROOT / "ChartStudioEvidenceSpool.mqh"


def _function(source: str, name: str) -> str:
    match = re.search(rf"(?m)^[A-Za-z_][\w\s*&<>]*\b{name}\s*\([^;]*?\)\s*\{{", source)
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
    assert "CS_EVIDENCE_EXPECTED_SYMBOL" in spool
    assert "_Symbol!=CS_EVIDENCE_EXPECTED_SYMBOL" in _function(spool, "CSValidateRuntimeIdentity")
    assert "ACCOUNT_TRADE_MODE_DEMO" in spool
    assert "CS_EVIDENCE_TERMINAL_HASH" in spool
    assert "CS_EVIDENCE_SOURCE_HASH" in spool


def test_ready_log_identifies_account_producer_source_and_effective_parameters():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    initialize = _function(spool, "CSInitializeEvidenceProducer")

    assert 'ChartStudio evidence recorder ready' in initialize
    assert 'CS_EVIDENCE_ACCOUNT_ID' in initialize
    assert 'CS_EVIDENCE_PRODUCER_ID' in initialize
    assert 'CS_EVIDENCE_TERMINAL_HASH' in initialize
    assert 'CS_EVIDENCE_SOURCE_HASH' in initialize
    assert 'CSParameterSetHash' in initialize


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


def test_deinit_bounded_flushes_queued_evidence_before_stopping_timer():
    ea = EA.read_text(encoding="utf-8-sig")
    deinit = _function(ea, "OnDeinit")

    assert "CSFlushEvidenceQueueOnShutdown();" in deinit
    assert deinit.index("CSFlushEvidenceQueueOnShutdown();") < deinit.index("EventKillTimer();")


def test_queue_overflow_diagnostics_preserve_event_stage_and_queue_depth():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    enqueue = _function(spool, "CSEnqueueEnvelope")
    overflow = _function(spool, "CSRecordQueueOverflow")
    flush = _function(spool, "CSFlushEvidenceQueue")

    assert "const string stage" in spool[spool.index("void CSEnqueueEnvelope"):spool.index("void CSEnqueueDecision")]
    assert "CSRecordQueueOverflow(stage)" in enqueue
    assert all(name in overflow for name in (
        'stage=="SIGNAL"', 'stage=="ENTRY_FILTER"',
        'stage=="RISK_GUARD"', 'stage=="ORDER_ATTEMPT"',
    ))
    assert "queue=%d/%d" in flush
    assert all(name in flush for name in (
        "signal=%I64u", "entryFilter=%I64u", "riskGuard=%I64u",
        "orderAttempt=%I64u", "other=%I64u",
    ))


def test_queue_overflow_is_inserted_in_fifo_before_later_events_and_persisted_by_timer():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    enqueue = _function(spool, "CSEnqueueEnvelope")
    flush = _function(spool, "CSFlushEvidenceQueue")
    queue_gap = _function(spool, "CSQueuePendingOverflowGapMarker")
    apply_gap = _function(spool, "CSApplyQueueGapMarker")

    assert "ulong CSQueueOverflowSequenceApplied=0;" in spool
    assert "bool CSQueueIsGap[CS_QUEUE_CAPACITY];" in spool
    assert "ulong CSQueueGapCounts[CS_QUEUE_CAPACITY];" in spool
    assert "CSQueueIsGap[slot]=false;" in enqueue
    assert "CSQueueGapCounts[slot]=0;" in enqueue
    assert not re.search(r"\b(FileOpen|FileWrite|FileWriteString|FileFlush|FileMove)\s*\(", enqueue)
    assert "if(CSQueueIsGap[CSQueueHead])" in flush
    assert flush.index("if(CSQueueIsGap[CSQueueHead])") < flush.index("string envelope=CSQueue[CSQueueHead];")
    assert "CSApplyQueueGapMarker(CSQueueHead)" in flush
    assert "CSQueueIsGap[CSQueueHead]=false;" in flush
    assert "CSQueueOverflowCount<=CSQueueOverflowSequenceQueued" in queue_gap
    assert "int gapSlot=(CSQueueHead+CSQueueCount)%CS_QUEUE_CAPACITY;" in queue_gap
    assert "CSQueueIsGap[gapSlot]=true;" in queue_gap
    assert "CSQueueOverflowSequenceQueued=CSQueueOverflowCount;" in queue_gap
    assert not re.search(r"\b(FileOpen|FileWrite|FileWriteString|FileFlush|FileMove)\s*\(", queue_gap)
    assert "CSQueuePendingOverflowGapMarker();" in flush
    failed_write = flush[flush.index("if(!CSWriteReadySegment(line,next))"):]
    assert failed_write.index("CSQueuePendingOverflowGapMarker();") < failed_write.index("return;")
    assert "#define CS_SHUTDOWN_FLUSH_PASSES ((CS_QUEUE_CAPACITY+1+CS_QUEUE_BATCH-1)/CS_QUEUE_BATCH)" in spool
    assert "pending>2147483647-CSSequence" in apply_gap
    assert "CSSequence+=pending;" in apply_gap
    assert "if(!CSPersistSequence())" in apply_gap
    assert "CSRecorderDisabled=true;" in apply_gap


def test_queue_overflow_callback_does_no_io_and_timer_persists_gap_exactly_once():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    enqueue = _function(spool, "CSEnqueueEnvelope")
    recover = _function(spool, "CSRecoverSequence")
    persist_sequence = _function(spool, "CSPersistSequence")
    apply_gap = _function(spool, "CSApplyQueueGapMarker")
    queue_gap = _function(spool, "CSQueuePendingOverflowGapMarker")

    assert "ulong CSQueueOverflowSequenceQueued=0;" in spool
    assert "CSQueueOverflowCount++;" in enqueue
    assert "CSRecordQueueOverflow(stage);" in enqueue
    assert "CSPersistQueueOverflowCount" not in enqueue
    assert not re.search(r"\b(?:FileOpen|FileWrite|FileWriteString|FileFlush|FileMove|GlobalVariableSet|GlobalVariableGet|GlobalVariableCheck|GlobalVariablesFlush)\s*\(", enqueue)
    assert "CSQueueOverflowSequenceQueued=CSQueueOverflowSequenceApplied;" in recover
    assert "GlobalVariable" not in spool
    assert "FileWriteLong(handle,(long)CSQueueOverflowSequenceApplied);" in persist_sequence
    assert "FileWriteLong(handle,(long)CSQueueOverflowCount);" in persist_sequence
    assert "FileSize(handle)==24" in persist_sequence
    assert "CSQueueOverflowSequenceQueued" in queue_gap
    assert "CSQueueOverflowSequenceQueued=CSQueueOverflowCount;" in queue_gap
    assert "CSQueueGapCounts[gapSlot]=CSQueueOverflowCount-CSQueueOverflowSequenceQueued;" in queue_gap
    assert "CSQueuePendingOverflowGapMarker();" in _function(spool, "CSFlushEvidenceQueue")
    assert apply_gap.index("CSQueueOverflowSequenceApplied+=pending;") < apply_gap.index("if(!CSPersistSequence())")
    assert "CSQueueOverflowSequenceApplied=previous_applied;" in apply_gap


def test_failed_segment_write_removes_its_unimportable_temporary_file():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    write = _function(spool, "CSWriteReadySegment")

    assert write.count("CSDeleteFailedTemp(temp,sequence);") == 2
    assert write.index("FileClose(handle);") < write.index("if(!complete)")
    assert "if(!complete)\n     {\n      CSLogWriteFailure(\"write\",sequence,write_error);\n      CSDeleteFailedTemp(temp,sequence);\n      return false;\n     }" in write
    assert "if(!FileMove(temp,FILE_COMMON,ready,FILE_COMMON))\n     {\n      int error=GetLastError();\n      CSLogWriteFailure(\"rename\",sequence,error);\n      CSDeleteFailedTemp(temp,sequence);\n      return false;\n     }" in write


def test_text_segment_write_validates_complete_utf8_payload_and_actual_file_size():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    write = _function(spool, "CSWriteReadySegment")

    normalized = re.sub(r"\s+", " ", write)
    assert 'string payload=line+"\\r\\n";' in normalized
    assert "uchar expected_bytes[];" in normalized
    assert "StringToCharArray(payload,expected_bytes,0,WHOLE_ARRAY,CP_UTF8)" in normalized
    assert "FileWriteString(handle,payload)" in normalized
    assert "written==(uint)(expected_count-1)" in normalized
    assert "actual_size==(ulong)written" in normalized
    assert "actual_size<=CS_SEGMENT_MAX_BYTES" in normalized
    assert "StringLen(line)+1" not in write


def test_utf8_record_length_model_rejects_truncation_and_counts_crlf():
    payload = ('{"symbol":"XAUUSD.p","note":"Münze 🚀"}' + "\r\n").encode("utf-8")
    expected_size = len(payload)

    def complete(written: int, actual_size: int, cap: int) -> bool:
        return written == expected_size and actual_size == written and actual_size <= cap

    assert complete(expected_size, expected_size, expected_size)
    assert not complete(expected_size - 1, expected_size - 1, expected_size)
    assert not complete(expected_size, expected_size - 1, expected_size)
    assert not complete(expected_size, expected_size, expected_size - 1)
    assert payload.endswith(b"\r\n")
    assert len(payload) > len(payload.decode("utf-8"))


def test_failed_segment_rename_emits_throttled_actionable_diagnostic():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    write = _function(spool, "CSWriteReadySegment")

    assert "ResetLastError();" in write
    assert re.search(r'if\(!FileMove\(temp,FILE_COMMON,ready,FILE_COMMON\)\)\s*\{\s*int error=GetLastError\(\);', write)
    assert 'CSLogWriteFailure("rename",sequence,error);' in write
    logger = _function(spool, "CSLogWriteFailure")
    assert "static ulong nextLogSequence=0;" in logger
    assert "if(sequence<nextLogSequence)" in logger
    assert 'PrintFormat("ChartStudio evidence segment write failed: stage=%s sequence=%I64u error=%d",' in logger
    assert "nextLogSequence=sequence+100;" in logger


def test_failed_temp_cleanup_is_reported_without_exposing_event_contents():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    write = _function(spool, "CSWriteReadySegment")
    cleanup = _function(spool, "CSDeleteFailedTemp")

    assert write.count("CSDeleteFailedTemp(temp,sequence);") == 2
    assert "ResetLastError();" in cleanup
    assert "if(!FileDelete(temp,FILE_COMMON))" in cleanup
    assert 'CSLogWriteFailure("cleanup",sequence,GetLastError());' in cleanup
    assert "line" not in cleanup


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
    assert decision.count("CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)") == 2
    assert "return CSUtc(seconds);" in spool
    assert re.search(r"#ifdef CS_EVIDENCE_CAPTURE_ENABLED\s+MqlTick cs_tick=\{\};.*?bool order_sent=m_trade\.Buy", decision, re.S)
    assert "SymbolInfoTick(_Symbol,cs_tick)" in decision


def test_recorder_resolves_current_broker_offset_from_server_and_gmt_clocks():
    spool = SPOOL.read_text(encoding="utf-8-sig")
    offset = _function(spool, "CSBrokerUtcOffsetSeconds")

    assert "TimeTradeServer()" in offset
    assert "TimeGMT()" in offset
    assert "broker_time-utc_time" in offset
    assert "return -1;" in offset
    assert "MathRound((double)offset/3600.0)" in offset
    assert "MathAbs((double)(offset-rounded_offset))>5.0" in offset
    assert "CSIsSupportedBrokerUtcOffsetSeconds((int)rounded_offset)" in offset
    supported = _function(spool, "CSIsSupportedBrokerUtcOffsetSeconds")
    assert "offset==7200 || offset==10800" in supported
    converter = _function(spool, "CSUtcFromBrokerMillis")
    assert "CSIsSupportedBrokerUtcOffsetSeconds(broker_utc_offset_seconds)" in converter
    order_attempt = _function(spool, "CSOrderAttemptJson")
    assert "CSIsSupportedBrokerUtcOffsetSeconds(broker_utc_offset_seconds)" in order_attempt


def test_parameter_hash_covers_every_ea_input_once():
    ea = EA.read_text(encoding="utf-8-sig")
    canonical = _function(ea, "CSParameterSetCanonical")
    inputs = re.findall(r"^\s*input\s+(?!group\b)\w+\s+(\w+)\s*=", ea, re.MULTILINE)
    hashed = re.findall(r'result\+="(\w+)=' , canonical)

    assert len(inputs) == 65
    assert len(hashed) == len(set(hashed))
    assert set(hashed) == set(inputs)
