from pathlib import Path
import pytest


ROOT = Path(__file__).resolve().parents[1]
EAS = (
    ROOT / "XAU_Titan_Pro.mq5",
    ROOT / "XAU_Titan_Pro_BasketGuard.mq5",
)


@pytest.mark.parametrize("ea", EAS, ids=lambda path: path.name)
def test_drawdown_logs_use_account_neutral_label_and_chart_context(ea):
    source = ea.read_text(encoding="utf-8-sig")

    assert "BLUEBERRY RISK BREACH" not in source
    assert source.count("RISK GUARD BREACH [%s | %s | %s]") == 2
    assert source.count(
        "AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period())"
    ) >= 2
    assert "PROFIT TARGET REACHED [%s | %s | %s]" in source


@pytest.mark.parametrize("ea", EAS, ids=lambda path: path.name)
def test_risk_protection_status_labels_do_not_claim_blueberry(ea):
    source = ea.read_text(encoding="utf-8-sig")

    for line in source.splitlines():
        if "PrintFormat(" in line or "state_str =" in line:
            assert "BLUEBERRY" not in line
