#!/usr/bin/env python3
"""Check independent ProfitLab .set profiles and identical baseline keys (stdlib only)."""
from pathlib import Path
import re, sys
folder=Path(__file__).resolve().parent
profiles=sorted(folder.glob("*.set"))
assert len(profiles)==17, f"Expected 17 presets, found {len(profiles)}"
def values(path):
    out={}
    for line in path.read_text(encoding="utf8").splitlines():
        line=line.strip()
        if not line or line.startswith(";"):continue
        if "||" in line:raise AssertionError(f"Optimization flags in {path.name}")
        k,sep,v=line.partition("=")
        assert sep and k not in out and re.fullmatch(r"Inp\w+",k),path.name
        out[k]=v
    return out
data={p.name:values(p) for p in profiles}
base=data["00_CONTROL_V720_EQUIVALENT.set"]
for name,vals in data.items():
    assert set(vals)==set(base),f"{name}: missing/extra keys"
    if name!="00_CONTROL_V720_EQUIVALENT.set":
        delta={k:v for k,v in vals.items() if base[k]!=v}
        assert delta,f"{name}: no actual change"
        print(name,delta)
print("VALID",len(profiles),"unique profiles:",len({tuple(sorted(x.items())) for x in data.values()}))
