from pathlib import Path
import re

import account_gateway

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "EMAGPT_GoldGuard_M5.mq5"


def _function_body(source, name):
    match = re.search(rf"\b{name}\s*\([^)]*\)\s*\{{", source)
    assert match, f"missing {name}"
    start = match.end()
    depth = 1
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start:index]
    raise AssertionError(f"unterminated {name}")


def test_goldguard_is_bound_to_known_non_blueberry_demo_identities():
    source = SOURCE.read_text(encoding="utf-8-sig")
    guard = _function_body(source, "IsPermittedDemoAccount")
    demos = {key: value for key, value in account_gateway.ACCOUNTS.items()
             if key != "blueberry" and value["id"] == key}

    assert "ACCOUNT_TRADE_MODE_DEMO" in guard
    assert "ACCOUNT_TRADE_MODE" in guard
    assert "ACCOUNT_LOGIN" in guard
    assert "ACCOUNT_SERVER" in guard
    for account in demos.values():
        assert str(account["login"]) in guard
        assert account["server"] in guard
    blueberry = account_gateway.ACCOUNTS["blueberry"]
    assert str(blueberry["login"]) not in guard
    assert blueberry["server"] not in guard


def test_goldguard_rejects_unauthorized_accounts_before_any_initialization_side_effect():
    source = SOURCE.read_text(encoding="utf-8-sig")
    on_init = _function_body(source, "OnInit")
    rejection = re.search(r"if\s*\(\s*!IsPermittedDemoAccount\(\)\s*\).*?return\s+INIT_FAILED\s*;", on_init, re.S)

    assert rejection, "OnInit must fail closed when account identity is not an approved demo"
    first_side_effects = [index for token in (
        "GlobalVariableDel(", "GlobalVariableSet(", "iMA(", "iATR(", "iADX(",
        "iVolumes(", "VisualInit(", "EventSetTimer(", "trade.SetExpertMagicNumber(",
    ) if (index := on_init.find(token)) >= 0]
    assert first_side_effects, "expected initialization work to remain guarded"
    assert rejection.start() < min(first_side_effects)


def test_goldguard_hud_marks_unavailable_profit_calculations_instead_of_assuming_zero():
    source = SOURCE.read_text(encoding="utf-8-sig")
    markers = _function_body(source, "VisualPositionZones")

    assert "riskKnown" in markers and "rewardKnown" in markers
    assert re.search(r"riskKnown\s*=\s*sl\s*>\s*0\s*&&\s*OrderCalcProfit", markers)
    assert re.search(r"rewardKnown\s*=\s*tp\s*>\s*0\s*&&\s*OrderCalcProfit", markers)
    assert "SL n/a" in markers and "TP n/a" in markers


def test_goldguard_reference_balance_matches_each_allowlisted_demo():
    source = SOURCE.read_text(encoding="utf-8-sig")
    reference_balance = _function_body(source, "ExpectedReferenceBalanceForAccount")
    demos = {key: value for key, value in account_gateway.ACCOUNTS.items()
             if key != "blueberry" and value["id"] == key}

    for account in demos.values():
        expected = account["initial_balance"]
        login = account["login"]
        server = account["server"]
        assert re.search(
            rf"login\s*==\s*{login}\s*&&\s*server\s*==\s*\"{re.escape(server)}\"\s*\)\s*return\s+{expected:g}(?:\.0+)?\s*;",
            reference_balance,
        ), f"GoldGuard reference balance does not match {account['id']}"


def test_goldguard_rejects_mismatched_reference_balance_before_state_changes():
    source = SOURCE.read_text(encoding="utf-8-sig")
    on_init = _function_body(source, "OnInit")
    mismatch = re.search(
        r"double\s+expectedReferenceBalance\s*=\s*ExpectedReferenceBalanceForAccount\(\)\s*;\s*if\s*\(\s*expectedReferenceBalance\s*<=\s*0\s*\|\|\s*MathAbs\(InpReferenceBalance\s*-\s*expectedReferenceBalance\)\s*>\s*0\.01\s*\).*?return\s+INIT_PARAMETERS_INCORRECT\s*;",
        on_init,
        re.S,
    )

    assert mismatch, "a wrong reference balance must fail closed rather than trip the static floor on a small demo"
    first_side_effects = [index for token in (
        "GlobalVariableDel(", "GlobalVariableSet(", "iMA(", "iATR(", "iADX(",
        "iVolumes(", "VisualInit(", "EventSetTimer(", "trade.SetExpertMagicNumber(",
    ) if (index := on_init.find(token)) >= 0]
    assert first_side_effects and mismatch.start() < min(first_side_effects)


def test_goldguard_rejects_emergency_buffer_that_exceeds_the_tightest_loss_allowance():
    source = SOURCE.read_text(encoding="utf-8-sig")
    on_init = _function_body(source, "OnInit")
    buffer_guard = re.search(
        r"if\s*\(\s*InpEmergencyBufferUSD\s*>=\s*expectedReferenceBalance\s*\*\s*MathMin\(InpDailyGuardPct\s*,\s*InpStaticGuardPct\)\s*/\s*100(?:\.0)?\s*\).*?return\s+INIT_PARAMETERS_INCORRECT\s*;",
        on_init,
        re.S,
    )

    assert buffer_guard, "the emergency reserve must fit below both the daily and static drawdown budgets"
    first_side_effects = [index for token in (
        "GlobalVariableDel(", "GlobalVariableSet(", "iMA(", "iATR(", "iADX(",
        "iVolumes(", "VisualInit(", "EventSetTimer(", "trade.SetExpertMagicNumber(",
    ) if (index := on_init.find(token)) >= 0]
    assert first_side_effects and buffer_guard.start() < min(first_side_effects)


def test_guarded_release_has_distinct_ea_version():
    source = SOURCE.read_text(encoding="utf-8-sig")
    assert '#property version "1.12"' in source
