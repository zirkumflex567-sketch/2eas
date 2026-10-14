"""Validate all BasketGuard v7.20 set snapshots with no third-party dependencies."""
from __future__ import annotations
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INPUT_RE = re.compile(r"^\s*input\s+(?:double|int|ulong|bool|string)\s+(Inp\w+)\s*=", re.M)
PARAM_RE = re.compile(r"^(Inp\w+)=(.*)$")


def parse(path: Path) -> dict[str, str]:
    params = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("Inp"):
            m = PARAM_RE.fullmatch(line)
            if not m:
                raise ValueError(f"{path}: malformed line {line!r}")
            key, value = m.groups()
            if key in params or not value or "||" in value:
                raise ValueError(f"{path}: duplicate/empty/optimization field {key}")
            params[key] = value
    return params


def main() -> None:
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    src = (ROOT / manifest["source_ea"]).read_text(encoding="utf-8-sig")
    source_keys = INPUT_RE.findall(src)
    if len(source_keys) != 65 or len(set(source_keys)) != 65:
        raise ValueError("Expected 65 distinct inputs in this v7.20 EA source")
    tests = manifest["tests"]
    if len(tests) != 40 or len({t["id"] for t in tests}) != 40:
        raise ValueError("Missing or duplicate test variants")
    baseline = parse(HERE / tests[0]["file"])
    if set(baseline) != set(source_keys):
        raise ValueError("Reference inputs do not match EA source")
    expected_files = set()
    for test in tests:
        path = HERE / test["file"]
        expected_files.add(path.name)
        p = parse(path)
        if set(p) != set(source_keys):
            raise ValueError(f"{path}: missing or unexpected inputs")
        diff = {k:v for k,v in p.items() if v != baseline[k]}
        if diff != test["changes"]:
            raise ValueError(f"{path}: actual inputs deviate from declared hypothesis: {diff}")
        if p["InpMagicNumber"] != baseline["InpMagicNumber"]:
            raise ValueError(f"{path}: unexpected magic change")
    actual_files = {p.name for p in (HERE / "sets").glob("*.set")}
    if actual_files != expected_files:
        raise ValueError(f"Set inventory mismatch; unexpected={actual_files-expected_files}; missing={expected_files-actual_files}")
    print(f"OK: {len(tests)} v7.20 sets, exactly {len(source_keys)} source-defined inputs each; every delta verified.")


if __name__ == "__main__":
    main()
