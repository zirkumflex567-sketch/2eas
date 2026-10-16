from pathlib import Path

import account_gateway


ROOT = Path(__file__).resolve().parents[1]
GUARD_EAS = (
    ROOT / "BlueberryGuardian.mq5",
    ROOT / "ChallengeGuardian.mq5",
)


def test_dedicated_challenge_guardians_refuse_non_blueberry_accounts():
    blueberry = account_gateway.ACCOUNTS["blueberry"]

    for ea in GUARD_EAS:
        source = ea.read_text(encoding="utf-8-sig")
        assert "bool IsBlueberryChallengeAccount()" in source
        assert f"AccountInfoInteger(ACCOUNT_LOGIN) == {blueberry['login']}" in source
        assert f'AccountInfoString(ACCOUNT_SERVER) == "{blueberry["server"]}"' in source
        assert "if(!IsBlueberryChallengeAccount())" in source
        assert "Blueberry-only guard: refusing non-Blueberry account." in source

        on_init = source.split("int OnInit()", 1)[1].split("void OnDeinit", 1)[0]
        assert on_init.index("if(!IsBlueberryChallengeAccount())") < on_init.index("return INIT_FAILED;")
