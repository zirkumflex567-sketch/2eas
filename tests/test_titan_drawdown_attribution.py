from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EA = ROOT / "XAU_Titan_Pro.mq5"


def test_drawdown_logs_use_account_neutral_label_and_chart_context():
    source = EA.read_text(encoding="utf-8-sig")

    assert "BLUEBERRY RISK BREACH" not in source
    assert source.count("RISK GUARD BREACH [%s | %s | %s]") == 2
    assert source.count(
        "AccountInfoString(ACCOUNT_SERVER), _Symbol, EnumToString(Period())"
    ) == 2
