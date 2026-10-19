from pathlib import Path
import hashlib
import json
import re
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_titan_basketguard_evidence as BUILD


SOURCE = ROOT / "XAU_Titan_Pro_BasketGuard.mq5"


def _source_inputs(text):
    return re.findall(r"^\s*input\s+(\w+)\s+(\w+)\s*=\s*([^;]+);", text, re.M)


def _function_body(text, name):
    match = re.search(rf"\b{name}\s*\([^;]*?\)\s*\{{", text)
    assert match, f"missing function {name}"
    start = match.end() - 1
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise AssertionError(f"unterminated function {name}")


def test_effective_preset_expands_only_missing_keys_from_current_ea_defaults(tmp_path):
    source = SOURCE.read_text(encoding="utf-8-sig")
    declared = _source_inputs(source)
    values = {name: default.strip().strip('"') for _kind, name, default in declared}
    omitted = {name for _kind, name, _default in declared[-3:]}
    preset = tmp_path / "puprime250.set"
    preset.write_text("\n".join(f"{key}={value}" for key, value in values.items() if key not in omitted))

    effective = BUILD._effective_preset(source, preset)

    assert set(effective) == {name for _kind, name, _default in declared}
    assert {key: effective[key] for key in omitted} == {key: values[key] for key in omitted}


def test_effective_preset_rejects_unknown_and_duplicate_inputs(tmp_path):
    source = SOURCE.read_text(encoding="utf-8-sig")
    preset = tmp_path / "puprime250.set"
    preset.write_text("InpUnknown=1\n")
    with pytest.raises(ValueError, match="unknown"):
        BUILD._effective_preset(source, preset)
    preset.write_text("InpFixedLot=0\nInpFixedLot=1\n")
    with pytest.raises(ValueError, match="duplicate"):
        BUILD._effective_preset(source, preset)


def test_capture_variant_binds_demo_identity_and_full_effective_parameter_hash():
    source = SOURCE.read_text(encoding="utf-8-sig")
    inputs = _source_inputs(source)
    values = {name: default.strip().strip('"') for _kind, name, default in inputs}
    expected = BUILD._expected_parameter_hash(source, values)

    generated = BUILD._instrument_source(
        source,
        "xau5m_m5",
        "titan_puprime250",
        "a" * 64,
        "b" * 64,
        expected,
        700194619,
        "PUPrime-Demo",
        r"C:\demo\terminal",
        10800,
    )

    assert '#define CS_EVIDENCE_CAPTURE' in generated
    assert '#define CS_EVIDENCE_ACCOUNT_ID "xau5m_m5"' in generated
    assert '#define CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH' in generated
    assert "CSParameterSetHash!=CS_EVIDENCE_EXPECTED_PARAMETER_SET_HASH" in generated
    assert "CSInitializeEvidenceProducer()" in generated
    deinit = _function_body(generated, "OnDeinit")
    assert deinit.index("CSFlushEvidenceQueueOnShutdown();") < deinit.index("EventKillTimer();")
    assert "IsBlueberryChallengeAccount()" in generated
    assert "if(IsBlueberryChallengeAccount())" in generated
    for marker in (
        "bool order_sent=m_trade.Buy(",
        "bool order_sent=m_trade.Sell(",
        "CanOpenWithinBasketRisk(",
        "m_trade.PositionClose(ticket)",
    ):
        assert marker in generated
    assert generated.count("bool order_sent=m_trade.Buy(") == source.count("m_trade.Buy(")
    assert generated.count("bool order_sent=m_trade.Sell(") == source.count("m_trade.Sell(")
    assert generated.count("CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)") == 2


def test_capture_variant_correlates_real_deal_adds_to_accepted_order_attempts():
    source = SOURCE.read_text(encoding="utf-8-sig")
    values = {name: default.strip().strip('"') for _kind, name, default in _source_inputs(source)}
    generated = BUILD._instrument_source(
        source, "titan_m5", "titan_puprime500", "a" * 64, "b" * 64,
        BUILD._expected_parameter_hash(source, values, "titan_m5"), 700184986,
        "PUPrime-Demo", r"C:\demo\terminal", 10800,
    )

    assert "CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,rates[0].time);" in generated
    assert "CSFindOrderAttempt(trans.order,cs_attempt_id,cs_signal_bar)" in generated
    assert "trans.type!=TRADE_TRANSACTION_DEAL_ADD" in generated
    assert "trans.deal,trans.position" in generated
    assert 'CSEnqueueDecision("BROKER_RESULT","PASS"' in generated
    assert "HistoryDealSelect" not in generated
    assert "OrderSend(" not in generated
    instrumented_body = _function_body(generated, "CheckSignalAndTrade")
    instrumented_body = instrumented_body.replace(
        "if(entry_accepted && cs_order_ticket>0)\n               CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,rates[0].time);\n", ""
    )
    assert instrumented_body == _function_body(source, "CheckSignalAndTrade")


def test_demo_parameter_hash_ignores_legacy_global_protection_toggle():
    source = SOURCE.read_text(encoding="utf-8-sig")
    values = {name: default.strip().strip('"') for _kind, name, default in _source_inputs(source)}
    values["InpEnablePropProtection"] = "true"
    expected = BUILD._expected_parameter_hash(source, values, "titan_m5")
    values["InpEnablePropProtection"] = "false"
    assert expected == BUILD._expected_parameter_hash(source, values, "titan_m5")


def test_capture_build_preserves_strategy_and_broker_write_functions_byte_for_byte():
    source = SOURCE.read_text(encoding="utf-8-sig")
    values = {name: default.strip().strip('"') for _kind, name, default in _source_inputs(source)}
    generated = BUILD._instrument_source(
        source, "titan_m5", "titan_puprime500", "a" * 64, "b" * 64,
        BUILD._expected_parameter_hash(source, values, "titan_m5"), 700184986,
        "PUPrime-Demo", r"C:\demo\terminal", 10800,
    )
    for function in ("CheckSignalAndTrade", "OnTick", "CanOpenWithinBasketRisk", "CloseAllPositionsForMagic"):
        generated_body = _function_body(generated, function).replace(
            "if(entry_accepted && cs_order_ticket>0)\n               CSRegisterOrderAttempt(cs_order_ticket,cs_attempt_id,rates[0].time);\n", ""
        )
        assert generated_body == _function_body(source, function)


def test_manifest_records_source_preset_and_effective_schema_hashes(tmp_path):
    source = SOURCE.read_text(encoding="utf-8-sig")
    preset = tmp_path / "puprime250.set"
    declared = _source_inputs(source)
    values = {name: default.strip().strip('"') for _kind, name, default in declared}
    preset.write_text("\n".join(f"{key}={value}" for key, value in values.items()))

    manifest = BUILD._manifest(source, SOURCE.read_bytes(), "xau5m_m5", preset, values, "a" * 64, "b" * 64)

    assert manifest["accountAlias"] == "xau5m_m5"
    assert manifest["sourceSha256"] == hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert manifest["effectiveInputCount"] == len(declared)
    assert manifest["effectiveParameterSetHash"] == BUILD._expected_parameter_hash(source, values)
    assert manifest["presetSha256"] == hashlib.sha256(preset.read_bytes()).hexdigest()


def _known_installed_predecessor(source):
    predecessor = source.replace("bool IsBlueberryChallengeAccount();\n", "", 1)
    main_input = next(line for line in predecessor.splitlines(keepends=True)
                      if re.match(r"\s*input\s+bool\s+InpEnablePropProtection\s*=", line))
    predecessor = predecessor.replace(
        main_input,
        'input bool     InpEnablePropProtection    = true;        // Harter Prop-Firm Notaus aktiv\n',
        1,
    )
    predecessor = predecessor.replace(
        '   result+="InpEnablePropProtection="+(IsBlueberryChallengeAccount() ? "1" : "0")+"\\n";\n',
        '   result+="InpEnablePropProtection="+(InpEnablePropProtection ? "1" : "0")+"\\n";\n',
        1,
    )
    function = BUILD._function_definition(source, "IsBlueberryChallengeAccount")
    predecessor = predecessor.replace(
        "\n// Challenge protection belongs only to the explicitly configured Blueberry account.\n"
        + function + "\n",
        "",
        1,
    )
    predecessor = predecessor.replace(
        '   PrintFormat("Blueberry challenge protection binding: %s",\n'
        '               IsBlueberryChallengeAccount() ? "ACTIVE" : "disabled for non-Blueberry account");\n',
        "",
        1,
    )
    predecessor = predecessor.replace("   if(IsBlueberryChallengeAccount())\n", "   if(InpEnablePropProtection)\n", 1)
    predecessor = predecessor.replace(
        "CSUtcFromBrokerMillis(cs_tick.time_msc,CS_EVIDENCE_BROKER_UTC_OFFSET_SECONDS)",
        "CSUtcFromMillis(cs_tick.time_msc)",
    )
    definitions = "#define CS_EVIDENCE_CAPTURE\n" + "".join(
        f'#define CS_EVIDENCE_{name} "fixture"\n'
        for name in ("ACCOUNT_ID", "PRODUCER_ID", "TERMINAL_HASH", "SOURCE_HASH",
                     "EXPECTED_LOGIN", "EXPECTED_SERVER", "EXPECTED_TERMINAL_PATH")
    )
    return predecessor.replace("#include <Trade\\Trade.mqh>\n", definitions + "#include <Trade\\Trade.mqh>\n", 1)


def test_installed_source_parity_allows_only_reviewed_capture_and_challenge_deltas():
    source = SOURCE.read_text(encoding="utf-8-sig")
    BUILD._assert_reviewed_semantic_parity(_known_installed_predecessor(source), source)
    drifted = _known_installed_predecessor(source).replace("bool buy_signal  =", "bool buy_signal =", 1)
    with pytest.raises(ValueError, match="differs from main"):
        BUILD._assert_reviewed_semantic_parity(drifted, source)
