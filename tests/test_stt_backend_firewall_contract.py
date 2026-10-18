from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "deploy" / "htown" / "stt-backend-guard.nft"
APPLY = ROOT / "deploy" / "htown" / "stt-backend-guard.sh"
UNIT = ROOT / "deploy" / "htown" / "stt-backend-guard.service"


def test_firewall_guard_is_scoped_to_non_loopback_dashboard_upstream():
    rules = RULES.read_text(encoding="utf-8")

    assert "table inet stt_backend_guard" in rules
    assert "type filter hook input" in rules
    assert "iifname != \"lo\" tcp dport 8055 counter drop" in rules
    assert "policy drop" not in rules
    assert "flush ruleset" not in rules
    assert "dport 22" not in rules


def test_firewall_guard_installs_idempotently_and_starts_before_network():
    apply = APPLY.read_text(encoding="utf-8")
    unit = UNIT.read_text(encoding="utf-8")

    assert '"$nft" --check -f "$rules"' in apply
    assert '"$nft" -f "$rules"' in apply
    assert "stt_backend_guard" in apply
    assert "Before=network-pre.target" in unit
    assert "RemainAfterExit=yes" in unit
    assert "ExecStop=/usr/sbin/nft delete table inet stt_backend_guard" in unit
