"""Isolated, stdlib-only automation of the native MT5 real-tick Strategy Tester.

Never attaches EAs to live charts, calls trade APIs, or rewrites MQL5 strategy rules.
Use a separate initialized /portable terminal on a Windows VPS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TIMEFRAMES = frozenset(("M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30",
                       "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1"))
SAFE_FIELD = re.compile(r"^[A-Za-z0-9_.#+-]{1,64}$")
SAFE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,79}$")
DATE = re.compile(r"^\d{4}\.\d{2}\.\d{2}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def valid_date(value: Any, label: str) -> str:
    if not isinstance(value, str) or not DATE.fullmatch(value):
        raise ValueError(f"{label} must use YYYY.MM.DD")
    datetime.strptime(value, "%Y.%m.%d")
    return value


def clean(value: Any, label: str, pattern: re.Pattern[str] = SAFE_FIELD) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise ValueError(f"{label}: missing or unsafe value")
    return value


def source_file(path: Any, root: Path, suffix: str) -> Path:
    if not isinstance(path, str) or not path or any(c in path for c in "\r\n\0"):
        raise ValueError("Invalid source file path")
    candidate = (root / path).resolve()
    if (not candidate.is_relative_to(root.resolve()) or candidate.suffix.lower() != suffix
            or not candidate.is_file() or not candidate.stat().st_size):
        raise ValueError(f"Required repository file not found: {path}")
    clean(candidate.stem, "EA/set basename")
    return candidate


@dataclass(frozen=True)
class Job:
    name: str
    expert: Path
    preset: Path | None
    symbol: str
    period: str
    start: str
    end: str
    deposit: int | float
    leverage: int
    currency: str
    execution_mode: int
    login: int | None
    fingerprint: str
    run_id: str
    expert_hash: str
    preset_hash: str | None
    strategy_id: str
    sample: str


@dataclass(frozen=True)
class Batch:
    terminal: Path
    output: Path
    timeout_seconds: int
    broker_label: str
    jobs: tuple[Job, ...]
    screening_limits: dict[str, float]


def load_config(path: Path, root: Path = PROJECT_ROOT) -> Batch:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("portable") is not True:
        raise ValueError("Config object with portable=true is required")
    terminal = Path(data.get("terminal", "")).expanduser()
    if not terminal.is_absolute() or terminal.name.lower() != "terminal64.exe" or not terminal.is_file():
        raise ValueError("Use the absolute path of a dedicated terminal64.exe")
    terminal = terminal.resolve()
    if terminal.is_relative_to(root.resolve()) or "program files" in str(terminal.parent).lower():
        raise ValueError("Tester must be isolated outside repository and Program Files")
    if not (terminal.parent / "MQL5" / "Experts").is_dir() or not (terminal.parent / "MQL5" / "Profiles" / "Tester").is_dir():
        raise ValueError("First initialize dedicated /portable MT5; MQL5/Experts and MQL5/Profiles/Tester required")
    output_path = data.get("output_dir", "output/mt5-backtests")
    if not isinstance(output_path, str) or not output_path:
        raise ValueError("Invalid output_dir")
    output = Path(output_path)
    if not output.is_absolute():
        output = root / output
    output = output.resolve()
    if output.is_relative_to(terminal.parent):
        raise ValueError("Report output must not be inside terminal installation")
    timeout = data.get("timeout_seconds", 14400)
    if type(timeout) is not int or not 30 <= timeout <= 172800:
        raise ValueError("timeout_seconds must be between 30 and 172800")
    broker = clean(data.get("broker_label", "unverified"), "broker label", SAFE_NAME)
    raw_jobs = data.get("jobs")
    if not isinstance(raw_jobs, list) or not 1 <= len(raw_jobs) <= 100:
        raise ValueError("Supply between 1 and 100 jobs")
    limits = data.get('screening_limits', {})
    if not isinstance(limits, dict):
        raise ValueError('screening_limits must be an object')
    from .analytics import assess
    assess({}, limits)
    jobs = []
    for entry in raw_jobs:
        if not isinstance(entry, dict):
            raise ValueError("Each job must be a JSON object")
        name = clean(entry.get("name"), "name", SAFE_NAME)
        strategy_id = clean(entry.get('strategy_id', name), 'strategy_id', SAFE_NAME)
        sample = clean(entry.get('sample', 'full'), 'sample')
        if sample not in ('full', 'in_sample', 'out_of_sample'):
            raise ValueError('sample must be full, in_sample or out_of_sample')
        expert = source_file(entry.get("expert"), root, ".ex5")
        preset = source_file(entry["set_file"], root, ".set") if entry.get("set_file") else None
        symbol = clean(entry.get("symbol"), "symbol")
        period = clean(entry.get("period", "M15"), "period")
        if period not in TIMEFRAMES:
            raise ValueError(f"Invalid period: {period}")
        start, end = valid_date(entry.get("from"), "from"), valid_date(entry.get("to"), "to")
        if start >= end:
            raise ValueError("from must precede to")
        deposit = entry.get("deposit", 10000)
        leverage = entry.get("leverage", 100)
        execution = entry.get("execution_mode_ms", 0)
        login = entry.get("login")
        currency = clean(entry.get("currency", "USD"), "currency")
        if len(currency) != 3 or not currency.isalpha():
            raise ValueError("currency must have 3 letters")
        if (isinstance(deposit, bool) or not isinstance(deposit, (float, int))
                or not math.isfinite(deposit) or not 1 <= deposit <= 1_000_000_000):
            raise ValueError("deposit must be finite and between 1 and 1e9")
        if type(leverage) is not int or not 1 <= leverage <= 5000:
            raise ValueError("leverage must be between 1 and 5000")
        if type(execution) is not int or not 0 <= execution <= 600000:
            raise ValueError("execution_mode_ms must be 0..600000")
        if login is not None and (type(login) is not int or login <= 0):
            raise ValueError("login must be a positive integer")
        expert_hash = sha256(expert)
        preset_hash = sha256(preset) if preset else None
        spec = dict(name=name, expert=str(expert.relative_to(root)), expert_sha256=expert_hash,
                    preset=str(preset.relative_to(root)) if preset else None, preset_sha256=preset_hash,
                    symbol=symbol, period=period, start=start, end=end, deposit=deposit,
                    leverage=leverage, currency=currency, execution=execution, login=login,
                    terminal=str(terminal), broker=broker, model=4, strategy_id=strategy_id, sample=sample)
        fingerprint = hashlib.sha256(json.dumps(spec, sort_keys=True).encode("utf-8")).hexdigest()
        slug = re.sub(r"[^a-z0-9-]", "-", name.lower()).strip("-")[:45]
        jobs.append(Job(name, expert, preset, symbol, period, start, end, deposit, leverage,
                        currency, execution, login, fingerprint, f"{slug}-{fingerprint[:12]}",
                        expert_hash, preset_hash, strategy_id, sample))
    if len({x.run_id for x in jobs}) != len(jobs):
        raise ValueError("Duplicate jobs")
    return Batch(terminal, output, timeout, broker, tuple(jobs), limits)


def build_ini(job: Job, report_relative: str) -> str:
    expert_relative = f"EaBacktests\\{job.expert.stem}-{job.expert_hash[:12]}"
    lines = ["[Tester]", f"Expert={expert_relative}"]
    if job.preset:
        lines.append(f"ExpertParameters=EaBacktests_{job.preset_hash[:12]}.set")
    lines += [f"Symbol={job.symbol}", f"Period={job.period}", "Model=4", "Optimization=0",
              "ForwardMode=0", f"FromDate={job.start}", f"ToDate={job.end}",
              f"Deposit={job.deposit}", f"Currency={job.currency}", f"Leverage=1:{job.leverage}",
              f"ExecutionMode={job.execution_mode}", "UseCloud=0", "Visual=0",
              f"Report={report_relative}", "ReplaceReport=1", "ShutdownTerminal=1"]
    if job.login:
        lines.append(f"Login={job.login}")
    return "\r\n".join(lines) + "\r\n"


def staged_copy(source: Path, dest: Path, checksum: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and sha256(dest) == checksum:
        return
    if dest.exists():
        raise RuntimeError(f"Refusing to overwrite a different existing file: {dest}")
    shutil.copy2(source, dest)
    if sha256(dest) != checksum:
        raise RuntimeError(f"Staged binary/preset checksum mismatch: {dest}")


class ExclusiveLock:
    def __init__(self, path: Path):
        self.path = path

    def __enter__(self):
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            raise RuntimeError(f"Tester lock already exists: {self.path}; check running terminal before removing") from exc
        with os.fdopen(fd, "w") as fh:
            fh.write(f"pid={os.getpid()} started={utc_now()}\n")
        return self

    def __exit__(self, *exc):
        self.path.unlink(missing_ok=True)


def run_batch(batch: Batch, *, dry_run: bool = False, force: bool = False) -> dict[str, Any]:
    if not dry_run and sys.platform != "win32":
        raise RuntimeError("Real MT5 execution needs Windows. Use --dry-run for offline verification.")
    batch.output.mkdir(parents=True, exist_ok=True)
    records = []
    with ExclusiveLock(batch.terminal.parent / ".ea-backtesting.lock"):
        for job in batch.jobs:
            target = batch.output / job.run_id
            previous = target / "result.json"
            if not force:
                successful_attempt = None
                for attempt in [target, *sorted(batch.output.glob(job.run_id + "-retry-*"))]:
                    result_file = attempt / "result.json"
                    if result_file.is_file():
                        old = json.loads(result_file.read_text(encoding="utf-8"))
                        if (old.get("status") == "success" and old.get("fingerprint") == job.fingerprint
                                and (attempt / "report.htm").is_file()):
                            successful_attempt = attempt.name
                            break
                if successful_attempt:
                    records.append(dict(name=job.name, run_id=successful_attempt, status="skipped_success"))
                    continue
            if target.exists() and (force or previous.exists()):
                target = batch.output / (job.run_id + "-retry-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
            target.mkdir(parents=True, exist_ok=True)
            report_name = target.name + ".htm"
            report_relative = f"reports\\ea-batch\\{report_name}"
            expected_report = batch.terminal.parent / "reports" / "ea-batch" / report_name
            ini_path = target / "test.ini"
            ini_path.write_bytes(build_ini(job, report_relative).encode("ascii"))
            result = dict(name=job.name, strategy_id=job.strategy_id, sample=job.sample,
                          run_id=target.name, fingerprint=job.fingerprint,
                          status="planned" if dry_run else "running", started_at=utc_now(),
                          requested_tick_mode="MT5 Model=4, broker real ticks", tick_coverage_verified=False,
                          broker_label_unverified=batch.broker_label, symbol=job.symbol, timeframe=job.period,
                          from_date=job.start, to_date=job.end, expert_sha256=job.expert_hash,
                          preset_sha256=job.preset_hash, report_path=None,
                          note="Check native report and tester journal for broker, model, data coverage, EA errors.")
            atomic_json(target / "result.json", result)
            if dry_run:
                records.append(dict(name=job.name, run_id=target.name, status="planned"))
                continue
            started = time.monotonic()
            try:
                expert_dest = (batch.terminal.parent / "MQL5" / "Experts" / "EaBacktests"
                               / f"{job.expert.stem}-{job.expert_hash[:12]}.ex5")
                staged_copy(job.expert, expert_dest, job.expert_hash)
                if job.preset:
                    preset_dest = (batch.terminal.parent / "MQL5" / "Profiles" / "Tester"
                                   / f"EaBacktests_{job.preset_hash[:12]}.set")
                    staged_copy(job.preset, preset_dest, job.preset_hash)
                expected_report.parent.mkdir(parents=True, exist_ok=True)
                if expected_report.exists():
                    raise RuntimeError(f"Refusing to reuse old MT5 report: {expected_report}")
                proc = subprocess.Popen([str(batch.terminal), f"/config:{ini_path}", "/portable"],
                                        cwd=str(batch.terminal.parent), stdin=subprocess.DEVNULL,
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    exit_code = proc.wait(timeout=batch.timeout_seconds)
                except subprocess.TimeoutExpired as exc:
                    proc.kill()
                    proc.wait()
                    raise RuntimeError(f"MT5 timeout after {batch.timeout_seconds} seconds") from exc
                if exit_code != 0:
                    raise RuntimeError(f"MT5 exited with code {exit_code}")
                if not expected_report.is_file() or expected_report.stat().st_size < 200:
                    raise RuntimeError("No complete report; tester may be open, EA failed, or broker data unavailable")
                archive = target / "report.htm"
                shutil.copy2(expected_report, archive)
                from .analytics import parse_report, assess
                metrics = parse_report(archive)
                result.update(status="success", report_path=str(archive), report_sha256=sha256(archive),
                              metrics=metrics, screening=assess(metrics, batch.screening_limits))
            except Exception as exc:
                result.update(status="failed", error=f"{type(exc).__name__}: {exc}")
            finally:
                result["finished_at"] = utc_now()
                result["duration_seconds"] = round(time.monotonic() - started, 3)
                atomic_json(target / "result.json", result)
            record = dict(name=job.name, strategy_id=job.strategy_id, sample=job.sample,
                          run_id=target.name, status=result["status"])
            if result['status'] == 'success':
                record['metrics'] = result['metrics']
                record['screening'] = result['screening']
            if "error" in result:
                record["error"] = result["error"]
            records.append(record)
        summary = dict(generated_at=utc_now(), dry_run=dry_run, records=records,
                       total=len(records), failed=sum(r["status"] == "failed" for r in records))
        from .analytics import write_csv
        write_csv(batch.output / 'batch_metrics.csv', records)
        atomic_json(batch.output / "batch_summary.json", summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Overnight native MT5 batch backtesting, real broker ticks")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true", help="Generate configuration without launching MT5")
    parser.add_argument("--force", action="store_true", help="Run completed tests again in new attempt folders")
    args = parser.parse_args(argv)
    try:
        batch = load_config(args.config)
        result = run_batch(batch, dry_run=args.dry_run, force=args.force)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    for item in result["records"]:
        print(f"{item['status']:16} {item['name']} ({item['run_id']})")
        if "error" in item:
            print(f"    {item['error']}")
    print(f"Summary: {batch.output / 'batch_summary.json'}")
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
