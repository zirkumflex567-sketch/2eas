"""Release contracts for the isolated Titan basket-risk variant."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
EA = ROOT / "XAU_Titan_Pro_BasketGuard.mq5"
SET = ROOT / "XAU_Titan_Pro_BasketGuard_Optimize.set"


def source():
    return EA.read_text(encoding="utf-8-sig")


def test_variant_is_separate_and_uses_distinct_magic():
    ea = source()
    assert "#property version     \"7.20\"" in ea
    assert re.search(r"InpMagicNumber\s*=\s*881142", ea)
    assert "XAU_Titan_Pro_BasketGuard" in ea


def test_variant_preserves_installed_weekend_protection():
    ea = source()
    assert "InpCloseWeekendFriday" in ea
    assert "InpBlockFridayLateEntries" in ea
    assert "WEEKEND PROTECTION EXIT" in ea


def test_entry_risk_gate_uses_broker_profit_calculation_and_fails_closed():
    ea = source()
    assert "bool CanOpenWithinBasketRisk(" in ea
    assert "OrderCalcProfit(" in ea
    assert "BasketRiskAtStops(" in ea
    assert ea.count("bool risk_allowed = CanOpenWithinBasketRisk(") == 2
    assert ea.count("if(!risk_allowed)") == 2
    assert "if(existing_sl <= 0.0)" in ea
    assert "if(candidate_sl <= 0.0)" in ea


def test_managed_exits_cover_loss_reversal_profit_and_reentry():
    ea = source()
    for item in (
        "InpBasketMaxLossUSD",
        "InpUseTrendInvalidationExit",
        "InpTrendBreakConfirmBars",
        "InpTrendBreakATRBuffer",
        "InpUseBasketProfitTrail",
        "InpBasketTrailStartUSD",
        "InpBasketTrailGivebackUSD",
        "InpPyramidLockTriggerUSD",
        "InpPyramidLockProfitUSD",
        "InpGuardCooldownBars",
        "m_wait_for_signal_reset",
        "m_last_guard_exit_time",
        "CloseAllPositionsForMagic()",
    ):
        assert item in ea
    assert "m_trade.ResultRetcode()" in ea


def test_guard_state_survives_ea_restart():
    ea = source()
    assert "string BasketStateKey(" in ea
    assert "GlobalVariableGet(" in ea
    assert "GlobalVariableSet(" in ea
    assert "GlobalVariableDel(" in ea
    assert "BasketTicketSum(" in ea
    assert "MQLInfoInteger(MQL_TESTER)" in ea


def test_optimizer_set_has_usable_ranges_and_new_magic():
    lines = SET.read_text(encoding="utf-8-sig").splitlines()
    settings = dict(line.split("=", 1) for line in lines if "=" in line and not line.startswith(";"))
    assert settings["InpMagicNumber"] == "881142"
    for key in (
        "InpBasketMaxRiskUSD",
        "InpBasketMaxLossUSD",
        "InpTrendBreakConfirmBars",
        "InpTrendBreakATRBuffer",
        "InpBasketTrailStartUSD",
        "InpBasketTrailGivebackUSD",
        "InpPyramidLockTriggerUSD",
        "InpPyramidLockProfitUSD",
        "InpGuardCooldownBars",
    ):
        default, start, step, stop, optimize = settings[key].split("||")
        assert float(step) > 0
        assert float(start) <= float(default) <= float(stop)
        assert optimize == "Y"
