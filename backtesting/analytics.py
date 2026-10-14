"""Conservative read-only extraction of native MT5 Strategy Tester summary statistics.

No equity curve, prop-firm daily loss or tick coverage is inferred from the report.
"""
from __future__ import annotations

import csv
import html
from html.parser import HTMLParser
from pathlib import Path
import re
from typing import Any

NUMBER = re.compile(r"[-−+]?\s*\d[\d \u00a0\u202f,.'\u2009]*")
PERCENT = re.compile(r"([-−+]?\s*\d[\d ,.']*)\s*%")
ALIASES = {
    "net_profit": ("total net profit", "gesamtnettogewinn", "gesamter nettogewinn"),
    "profit_factor": ("profit factor", "profitfaktor"),
    "total_trades": ("total trades", "gesamtanzahl trades", "anzahl trades gesamt", "trades insgesamt"),
    "equity_dd_relative": ("equity drawdown relative", "relativer equity drawdown",
                           "relativer rückgang des eigenkapitals", "eigenkapitalrückgang relativ"),
    "equity_dd_maximal": ("equity drawdown maximal", "maximaler equity drawdown",
                          "maximaler rückgang des eigenkapitals", "eigenkapitalrückgang maximal"),
    "history_quality": ("history quality", "historienqualität", "historie qualität"),
    "winning_trades": ("profit trades (% of total)", "profit trades", "gewinntrades (% der gesamtzahl)",
                       "gewinntrades"),
    "gross_profit": ("gross profit", "bruttogewinn"),
    "gross_loss": ("gross loss", "bruttoverlust"),
    "sharpe_ratio": ("sharpe ratio", "sharpe-ratio"),
    "initial_deposit": ("initial deposit", "anfangseinlage"),
}


class _Cells(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.cells: list[str] = []
        self.depth = 0
        self.chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in ("td", "th"):
            if self.depth == 0:
                self.chunks = []
            self.depth += 1
        elif self.depth and tag == "br":
            self.chunks.append(" ")

    def handle_data(self, data: str) -> None:
        if self.depth:
            self.chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self.depth:
            self.depth -= 1
            if self.depth == 0:
                value = " ".join(" ".join(self.chunks).split())
                if value:
                    self.cells.append(html.unescape(value))


def _decode(path: Path) -> str:
    raw = path.read_bytes()
    if len(raw) > 25_000_000:
        raise ValueError("Native report exceeds maximum supported size")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    if raw[:200].count(b"\x00") > 20:
        return raw.decode("utf-16-le")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Cannot decode MT5 report")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().strip(":：").casefold())


def _lookup(cells: list[str], aliases: tuple[str, ...]) -> str | None:
    wanted = set(aliases)
    for idx, cell in enumerate(cells):
        norm = _normalize(cell)
        if norm in wanted and idx + 1 < len(cells):
            return cells[idx + 1]
        for label in aliases:
            if norm.startswith(label + ":"):
                return cell[len(label) + 1:].strip()
    return None


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    match = NUMBER.search(value)
    if not match:
        return None
    s = match.group().replace("−", "-").replace("\u00a0", "").replace("\u202f", "")
    s = s.replace("\u2009", "").replace(" ", "").replace("'", "")
    if "," in s and "." in s:
        decimal = "," if s.rfind(",") > s.rfind(".") else "."
        thousands = "." if decimal == "," else ","
        s = s.replace(thousands, "").replace(decimal, ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _percent(value: str | None) -> float | None:
    if value is None:
        return None
    match = PERCENT.search(value)
    return _number(match.group(1)) if match else None


def parse_report(path: Path) -> dict[str, int | float | None]:
    parser = _Cells()
    parser.feed(_decode(path))
    cells = parser.cells
    if len(cells) < 12:
        raise ValueError("No native MT5 report statistics table found")
    values = {name: _lookup(cells, aliases) for name, aliases in ALIASES.items()}
    net = _number(values["net_profit"])
    pf = _number(values["profit_factor"])
    trades = _number(values["total_trades"])
    dd = _percent(values["equity_dd_relative"])
    if dd is None:
        dd = _percent(values["equity_dd_maximal"])
    if net is None or pf is None or trades is None or dd is None:
        raise ValueError("Required MT5 statistics missing (net profit, profit factor, trades, equity drawdown %)")
    if trades < 0 or not trades.is_integer() or pf < 0 or not 0 <= dd <= 100:
        raise ValueError("Invalid native MT5 statistics")
    wins = _percent(values["winning_trades"])
    quality = _percent(values["history_quality"])
    return {
        "net_profit": net, "profit_factor": pf, "total_trades": int(trades),
        "equity_max_drawdown_pct": dd, "win_rate_pct": wins, "history_quality_pct": quality,
        "gross_profit": _number(values["gross_profit"]), "gross_loss": _number(values["gross_loss"]),
        "sharpe_ratio": _number(values["sharpe_ratio"]),
        "initial_deposit_reported": _number(values["initial_deposit"]),
    }


def assess(metrics: dict[str, Any], limits: dict[str, Any] | None = None) -> dict[str, Any]:
    """Screen *summary* metrics, never claim prop-firm rule compliance."""
    limits = limits or {}
    checks: dict[str, str] = {}
    mapping = {
        "min_trades": ("total_trades", lambda a, b: a >= b),
        "min_profit_factor": ("profit_factor", lambda a, b: a >= b),
        "max_equity_drawdown_pct": ("equity_max_drawdown_pct", lambda a, b: a <= b),
        "min_history_quality_pct": ("history_quality_pct", lambda a, b: a >= b),
    }
    for key, threshold in limits.items():
        if key not in mapping:
            raise ValueError(f"Unknown summary risk limit {key}; prop daily/total limits require an equity/deal timeline")
        if type(threshold) not in (int, float) or not 0 <= threshold < 1e9:
            raise ValueError(f"Invalid threshold: {key}")
        field, predicate = mapping[key]
        value = metrics.get(field)
        checks[key] = "unknown" if value is None else ("pass" if predicate(value, threshold) else "fail")
    checks["prop_daily_loss_rule"] = "unknown"
    checks["prop_total_floor_rule"] = "unknown"
    checks["tick_coverage_broker_verified"] = "unknown"
    overall = "fail" if "fail" in checks.values() else ("review" if "unknown" in checks.values() else "pass")
    return {"screening_status": overall, "checks": checks}


def csv_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for rec in records:
        metrics = rec.get("metrics") or {}
        rows.append({
            "name": rec.get("name"), "strategy_id": rec.get("strategy_id"),
            "sample": rec.get("sample"), "run_id": rec.get("run_id"), "status": rec.get("status"),
            "screening_status": (rec.get("screening") or {}).get("screening_status", "unknown"),
            **{key: metrics.get(key) for key in ("net_profit", "profit_factor", "total_trades",
                 "equity_max_drawdown_pct", "win_rate_pct", "history_quality_pct",
                 "sharpe_ratio")},
        })
    return rows


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = csv_rows(records)
    if not rows:
        return
    import os
    temp = path.with_suffix(".tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
