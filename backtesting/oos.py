"""Out-of-sample comparison: informational only, no automatic live-trading approval."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any


def _valid(rec: dict[str, Any]) -> bool:
    m = rec.get("metrics") or {}
    return (rec.get("status") == "success"
            and all(type(m.get(k)) in (int, float) and math.isfinite(m[k])
                    for k in ("net_profit", "profit_factor", "total_trades", "equity_max_drawdown_pct")))


def compare(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A single matching IS and OOS run per strategy; reject ambiguous selections."""
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for rec in records:
        if not _valid(rec):
            continue
        sample = rec.get("sample")
        if sample not in ("in_sample", "out_of_sample"):
            continue
        grouped.setdefault(str(rec.get("strategy_id")), {}).setdefault(sample, []).append(rec)
    output = []
    for strategy, samples in sorted(grouped.items()):
        ins = samples.get("in_sample", [])
        outs = samples.get("out_of_sample", [])
        status = "incomplete"
        if len(ins) > 1 or len(outs) > 1:
            status = "ambiguous"
        elif len(ins) == 1 and len(outs) == 1:
            status = "comparable"
        comparison: dict[str, Any] = {"strategy_id": strategy, "status": status,
                                      "live_trading_approved": False}
        if status == "comparable":
            a, b = ins[0]["metrics"], outs[0]["metrics"]
            comparison.update({
                "in_sample_run": ins[0]["run_id"],
                "out_of_sample_run": outs[0]["run_id"],
                "in_sample_profit_factor": a["profit_factor"],
                "out_of_sample_profit_factor": b["profit_factor"],
                "in_sample_trades": a["total_trades"],
                "out_of_sample_trades": b["total_trades"],
                "out_of_sample_net_profit": b["net_profit"],
                "out_of_sample_max_equity_dd_pct": b["equity_max_drawdown_pct"],
                "oos_pf_over_is_pf": round(b["profit_factor"] / a["profit_factor"], 4)
                if a["profit_factor"] > 0 else None,
            })
        output.append(comparison)
    return output


def write_comparisons(folder: Path) -> None:
    """Read all successful attempts, including resumed tests from previous nights."""
    successes: list[dict[str, Any]] = []
    for path in sorted(folder.glob("*/result.json")):
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
            if entry.get("status") == "success" and (path.parent / "report.htm").is_file():
                successes.append(entry)
        except (ValueError, OSError):
            continue
    # Only newest successful run for each (strategy, sample, fingerprint).
    deduped = {}
    for entry in successes:
        key = (entry.get("strategy_id"), entry.get("sample"), entry.get("fingerprint"))
        old = deduped.get(key)
        if old is None or entry.get("finished_at", "") > old.get("finished_at", ""):
            deduped[key] = entry
    temp = folder / "oos_comparison.tmp"
    target = folder / "oos_comparison.json"
    try:
        temp.write_text(json.dumps({"comparisons": compare(list(deduped.values())),
                                    "note": "Not a real-tick quality or prop-firm compliance certificate."},
                                   indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
