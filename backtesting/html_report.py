"""Small offline report, intentionally no network, JavaScript, or live broker controls."""
from __future__ import annotations

import html
import json
import os
from pathlib import Path


def _cell(value: object) -> str:
    return html.escape("—" if value is None else str(value), quote=True)


def render(folder: Path) -> None:
    runs = []
    for file in sorted(folder.glob("*/result.json")):
        try:
            row = json.loads(file.read_text(encoding="utf-8"))
            if row.get("status") in ("success", "failed"):
                runs.append(row)
        except (ValueError, OSError):
            continue
    oos_path = folder / "oos_comparison.json"
    oos = json.loads(oos_path.read_text(encoding="utf-8"))["comparisons"] if oos_path.is_file() else []
    columns = [("name", "Name"), ("sample", "Sample"), ("status", "Result"),
               ("net_profit", "Net PnL"), ("profit_factor", "Profit Factor"),
               ("total_trades", "Trades"), ("win_rate_pct", "Win %"),
               ("equity_max_drawdown_pct", "Equity DD %"),
               ("history_quality_pct", "History %")]
    headers = "".join(f"<th>{_cell(label)}</th>" for _, label in columns)
    body = []
    for row in runs:
        metrics = row.get("metrics") or {}
        vals = {**row, **metrics}
        tds = "".join(f"<td>{_cell(vals.get(field))}</td>" for field, _ in columns)
        body.append("<tr>" + tds + "</tr>")
    compare_body = []
    for row in oos:
        compare_body.append("<tr>" + "".join(f"<td>{_cell(row.get(f))}</td>"
                            for f in ("strategy_id", "status", "in_sample_profit_factor",
                                      "out_of_sample_profit_factor", "out_of_sample_max_equity_dd_pct")) + "</tr>")
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>EA Backtest Research</title><style>
body{font:15px system-ui,sans-serif;margin:2rem auto;max-width:1200px;padding:0 1rem;color:#18212b;background:#f8fafc}
table{border-collapse:collapse;min-width:680px;width:100%;background:white}
th,td{border-bottom:1px solid #d8dee5;padding:.7rem;text-align:left}
th{background:#e9eff5;position:sticky;top:0}
.wrapper{overflow-x:auto} p{line-height:1.6} .notice{border-left:4px solid #56677b;padding:.5rem 1rem}
</style></head><body><h1>EA Backtest Research</h1>
<p class="notice">Research only. HTML reports alone do not confirm broker tick coverage,
EA initialization, commission accuracy, prop-firm compliance or live readiness.
Check every native MT5 report and journal. Report data can include sensitive account metadata;
do not publish this file.</p>
<h2>Batch runs</h2><div class="wrapper"><table><thead><tr>""" + headers + """</tr></thead><tbody>""" + (
        "".join(body) or "<tr><td>No results yet</td></tr>") + """</tbody></table></div>
<h2>Out-of-sample comparisons</h2><div class="wrapper"><table><thead><tr>
<th>Strategy</th><th>Pair status</th><th>IS profit factor</th>
<th>OOS profit factor</th><th>OOS equity DD %</th></tr></thead><tbody>""" + (
        "".join(compare_body) or "<tr><td>No IS/OOS pairs yet</td></tr>") + """</tbody></table></div>
<p>Missing metrics and risk checks are unknown, never passed automatically.</p>
</body></html>"""
    tmp, target = folder / "index.html.tmp", folder / "index.html"
    try:
        tmp.write_text(page, encoding="utf-8")
        os.replace(tmp, target)
    finally:
        tmp.unlink(missing_ok=True)
