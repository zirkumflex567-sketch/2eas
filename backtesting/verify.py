"""Free, local-only test gate for the MT5 overnight backtesting module.

Usage: python -m backtesting.verify [--config PATH]
Works without GitHub Actions, network, pytest or a broker connection.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = (
    "backtesting/__init__.py",
    "backtesting/__main__.py",
    "backtesting/runner.py",
    "backtesting/analytics.py",
    "backtesting/oos.py",
    "backtesting/html_report.py",
    "backtesting/verify.py",
    "tests/test_mt5_batch_backtesting.py",
    "tests/test_mt5_backtest_analytics.py",
)
DEFAULT_REPORT_DIR = ROOT / "output" / "mt5-backtests" / "_verification"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checks(config: Path | None = None) -> list[tuple[str, list[str]]]:
    """Every command runs against the checked-out repo; no external services."""
    commands = [
        ("syntax", [sys.executable, "-m", "compileall", "-q", "backtesting",
                    "tests/test_mt5_batch_backtesting.py", "tests/test_mt5_backtest_analytics.py"]),
        ("unit_tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests",
                        "-p", "test_mt5_*backtest*.py", "-v"]),
    ]
    if config is not None:
        commands.append(("mt5_config_dry_run",
                         [sys.executable, "-m", "backtesting", "--config", str(config), "--dry-run"]))
    return commands


def _run(command: list[str]) -> tuple[int, str]:
    completed = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, errors="replace",
                               encoding="utf-8", check=False)
    return completed.returncode, completed.stdout


def verify(output_dir: Path = DEFAULT_REPORT_DIR, config: Path | None = None) -> int:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for name, command in checks(config):
        print(f"[LOCAL CHECK] {name} ...", flush=True)
        try:
            exit_code, output = _run(command)
        except OSError as exc:
            exit_code, output = 2, f"{type(exc).__name__}: {exc}\n"
        log = output_dir / f"{name}.log"
        log.write_text(output, encoding="utf-8")
        status = "passed" if exit_code == 0 else "failed"
        results.append({"name": name, "status": status, "exit_code": exit_code,
                        "log": log.name})
        print(f"[{status.upper()}] {name} — {log}")
        if status == "failed":
            print(output[-5000:] or "No diagnostic output available.", file=sys.stderr)
            break  # fail-closed: do not run native config stage when tests fail

    status = "passed" if len(results) == len(checks(config)) and all(
        row["status"] == "passed" for row in results) else "failed"
    payload = {
        "schema": 1,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "environment": {"python": sys.version.split()[0], "platform": sys.platform},
        "source_sha256": {path: digest(ROOT / path) for path in SOURCES
                          if (ROOT / path).is_file()},
        "checks": results,
        "native_mt5_test_executed": False,
        "broker_tick_coverage_verified": False,
        "trading_approved": False,
        "note": "Local syntax and unit checks only. Native MT5 broker-demo parity remains required.",
    }
    temp = output_dir / "verification.tmp"
    target = output_dir / "verification.json"
    try:
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
                        + "\n", encoding="utf-8")
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
    print(f"Local verification: {status.upper()} — {target}")
    return 0 if status == "passed" else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="No-cost local backtesting checks with saved evidence")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--config", type=Path,
                        help="Optional MT5 JSON config: check and generate dry-run manifests only")
    args = parser.parse_args(argv)
    if args.config is not None and not args.config.is_file():
        parser.error(f"Config file does not exist: {args.config}")
    return verify(args.output_dir, args.config.resolve() if args.config else None)


if __name__ == "__main__":
    raise SystemExit(main())
