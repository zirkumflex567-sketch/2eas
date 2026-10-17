from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRESET_DIR = ROOT / "presets" / "chart-studio-calendar-bridge"
ALIASES = ("titan", "xau5m_m5", "titan_m5", "xau5m_500")


def test_calendar_bridge_has_one_exact_preset_for_each_authorized_demo():
    paths = sorted(PRESET_DIR.glob("*.set"))
    assert [path.stem for path in paths] == sorted(ALIASES)

    for alias in ALIASES:
        path = PRESET_DIR / f"{alias}.set"
        values = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith(";"):
                continue
            key, separator, value = line.partition("=")
            assert separator, f"{path.name}: malformed setting {line!r}"
            assert key not in values, f"{path.name}: duplicate setting {key}"
            values[key] = value

        assert values == {"InpAccountAlias": alias, "InpRefreshSeconds": "60"}


def test_bridge_source_keeps_the_calendar_preset_allowlist_demo_only():
    source = (ROOT / "ChartStudioCalendarBridge.mq5").read_text(encoding="utf-8")
    for alias in ALIASES:
        assert f'account_alias=="{alias}"' in source
    assert 'account_alias=="blueberry"' not in source
    assert "OrderSend(" not in source
    assert ".Buy(" not in source
    assert ".Sell(" not in source


def test_bridge_json_escape_encodes_every_json_control_character():
    source = (ROOT / "ChartStudioCalendarBridge.mq5").read_text(encoding="utf-8")
    escape = source.split("string JsonEscape(", 1)[1].split("\nstring ServerStamp(", 1)[0]
    assert "StringGetCharacter(value,i)" in escape
    assert 'character<0x20' in escape
    assert 'StringFormat("\\\\u%04X",(int)character)' in escape
    assert 'ShortToString(character)' in escape
