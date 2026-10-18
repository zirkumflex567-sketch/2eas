from pathlib import Path
import re

import account_gateway


ROOT = Path(__file__).resolve().parents[1]
TITAN_SOURCES = tuple(sorted(
    path for path in ROOT.glob("XAU_Titan_*.mq5")
    if "InpEnablePropProtection" in path.read_text(encoding="utf-8-sig")
))


def test_titan_challenge_protection_is_hard_bound_to_blueberry_identity():
    blueberry = account_gateway.ACCOUNTS["blueberry"]

    for path in TITAN_SOURCES:
        source = path.read_text(encoding="utf-8-sig")
        assert "bool IsBlueberryChallengeAccount()" in source, path.name
        assert f"AccountInfoInteger(ACCOUNT_LOGIN) == {blueberry['login']}" in source, path.name
        assert f'AccountInfoString(ACCOUNT_SERVER) == "{blueberry["server"]}"' in source, path.name
        assert "if(IsBlueberryChallengeAccount())" in source, path.name
        assert not re.search(r"if\s*\(\s*InpEnablePropProtection\s*\)", source), path.name
