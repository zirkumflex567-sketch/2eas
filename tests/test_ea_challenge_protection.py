from pathlib import Path
import re
import subprocess

import account_gateway


ROOT = Path(__file__).resolve().parents[1]
TRACKED_EA_SOURCES = tuple(
    ROOT / relative_path
    for relative_path in subprocess.check_output(
        ["git", "ls-files", "*.mq5"], cwd=ROOT, text=True
    ).splitlines()
    if "InpEnablePropProtection" in (ROOT / relative_path).read_text(encoding="utf-8-sig")
)


def test_every_ea_challenge_guard_is_hard_bound_to_blueberry_identity():
    blueberry = account_gateway.ACCOUNTS["blueberry"]

    assert TRACKED_EA_SOURCES, "expected tracked EA source files with a challenge-guard input"

    for path in TRACKED_EA_SOURCES:
        source = path.read_text(encoding="utf-8-sig")
        assert "bool IsBlueberryChallengeAccount()" in source, path.name
        assert f"AccountInfoInteger(ACCOUNT_LOGIN) == {blueberry['login']}" in source, path.name
        assert f'AccountInfoString(ACCOUNT_SERVER) == "{blueberry["server"]}"' in source, path.name
        assert "if(IsBlueberryChallengeAccount())" in source, path.name
        assert not re.search(r"if\s*\(\s*InpEnablePropProtection\s*\)", source), path.name
