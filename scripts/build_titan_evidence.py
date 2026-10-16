"""Build opt-in Titan evidence EAs into ignored output; never install into MT5."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


ALLOWED_ACCOUNTS = frozenset({"xau5m_m5", "titan_m5"})
EXPECTED_PRESETS = {"xau5m_m5": "puprime250.set", "titan_m5": "puprime500.set"}
EXPECTED_PRESET_SHA256 = {
    "xau5m_m5": "ff92ce8710e151cb73d304e411338c411db487bc3983f15eec541138a0aea286",
    "titan_m5": "feb3030fee155bb41e8604a67117519f97db00beac614e103180813faf697e69",
}
EA_NAME = "XAU_Titan_Pro_BasketGuard"


@dataclass(frozen=True)
class BuildVariant:
    source: Path
    manifest: Path
    compiler: Path
    include_root: Path
    log: Path


def _input_names(source_text: str) -> set[str]:
    names = re.findall(r"^\s*input\s+(?:\w+)\s+(\w+)\s*=", source_text, re.M)
    if not names or len(names) != len(set(names)):
        raise ValueError("EA input schema is empty or contains duplicate names")
    return set(names)


def _preset_input_names(path: Path) -> tuple[bytes, set[str]]:
    if not path.is_file():
        raise FileNotFoundError("account preset file not found")
    raw = path.read_bytes()
    encoding = "utf-16" if b"\0" in raw[:128] else "utf-8-sig"
    try:
        text = raw.decode(encoding)
    except UnicodeDecodeError as exc:
        raise ValueError("preset encoding is unsupported") from exc
    names = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith((";", "#")):
            continue
        name, separator, value = line.partition("=")
        if not separator:
            raise ValueError("preset contains a malformed input record")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError("preset contains an invalid input name")
        if not value.strip():
            raise ValueError("preset contains an empty value")
        names.append(name)
    if len(names) != len(set(names)):
        raise ValueError("preset contains duplicate input names")
    return raw, set(names)


def _mql_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def _is_link_or_junction(path: Path) -> bool:
    junction_check = getattr(path, "is_junction", None)
    return path.is_symlink() or (junction_check is not None and junction_check())


def _atomic_write(path: Path, content: bytes) -> None:
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, prefix=".build-", delete=False) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def prepare_variant(repo_root: Path, alias: str, output_root: Path, *, preset_path: Path) -> BuildVariant:
    """Generate an account-bound source package in output_root/alias."""
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError(f"account {alias!r} is not allowlisted for Titan evidence builds")
    if Path(preset_path).name.casefold() != EXPECTED_PRESETS[alias].casefold():
        raise ValueError(f"preset filename is not bound to account {alias!r}")
    preset_digest = hashlib.sha256(Path(preset_path).read_bytes()).hexdigest()
    if preset_digest != EXPECTED_PRESET_SHA256[alias]:
        raise ValueError(f"preset content hash is not bound to account {alias!r}")

    repo_root = repo_root.resolve()
    output_root_input = Path(output_root).absolute()
    output_root = output_root_input.resolve()
    expected_output = (repo_root / "output").resolve()
    if output_root != expected_output and expected_output not in output_root.parents:
        raise ValueError("build output must remain under repository output/")
    directory = output_root_input
    while directory == expected_output or expected_output in directory.parents:
        if directory.exists() and _is_link_or_junction(directory):
            raise ValueError("build output cannot traverse a symlink or junction")
        if directory == expected_output:
            break
        directory = directory.parent

    sys.path.insert(0, str(repo_root))
    import account_gateway
    from chart_studio.evidence_api import DEFAULT_EVIDENCE_PRODUCERS
    from chart_studio.evidence_models import AccountContext

    spec = account_gateway.ACCOUNTS[alias]
    if spec.get("is_demo") is not True:
        raise ValueError(f"account {alias!r} is not configured as a demo account")
    terminal = Path(spec["terminal"]).resolve()
    if not terminal.is_file():
        raise FileNotFoundError(f"configured terminal executable not found for {alias}")
    compiler = terminal.parent / "MetaEditor64.exe"
    include_root = terminal.parent / "MQL5"
    if not compiler.is_file():
        raise FileNotFoundError(f"portable MetaEditor not found for {alias}")
    if not (include_root / "Include" / "Trade" / "Trade.mqh").is_file():
        raise FileNotFoundError(f"portable MT5 Include tree is incomplete for {alias}")

    source_path = repo_root / f"{EA_NAME}.mq5"
    helper_path = repo_root / "ChartStudioEvidenceSpool.mqh"
    source_bytes = source_path.read_bytes()
    helper_bytes = helper_path.read_bytes()
    preset_raw, preset_names = _preset_input_names(Path(preset_path))
    source_text = source_bytes.decode("utf-8-sig")
    source_names = _input_names(source_text)
    if preset_names != source_names:
        missing = sorted(source_names - preset_names)
        unknown = sorted(preset_names - source_names)
        raise ValueError(
            "preset inputs do not match EA input schema "
            f"(missing={len(missing)}, unknown={len(unknown)})"
        )
    source_hash = hashlib.sha256(source_bytes + b"\0" + helper_bytes).hexdigest()
    ctx = AccountContext.from_config(alias)
    producer = DEFAULT_EVIDENCE_PRODUCERS[alias]
    if not producer:
        raise ValueError(f"no evidence producer configured for {alias}")

    term_root = str(terminal.parent)
    definitions = [
        "#define CS_EVIDENCE_CAPTURE",
        f"#define CS_EVIDENCE_ACCOUNT_ID {_mql_string(alias)}",
        f"#define CS_EVIDENCE_PRODUCER_ID {_mql_string(producer)}",
        f"#define CS_EVIDENCE_TERMINAL_HASH {_mql_string(ctx.terminal_identity_hash)}",
        f"#define CS_EVIDENCE_SOURCE_HASH {_mql_string(source_hash)}",
        f"#define CS_EVIDENCE_EXPECTED_LOGIN {int(spec['login'])}",
        f"#define CS_EVIDENCE_EXPECTED_SERVER {_mql_string(spec['server'])}",
        f"#define CS_EVIDENCE_EXPECTED_TERMINAL_PATH {_mql_string(term_root)}",
    ]
    insertion = "#include <Trade\\Trade.mqh>"
    if source_text.count(insertion) != 1:
        raise ValueError("expected unique standard Trade include in Titan EA")
    generated = source_text.replace(insertion, "\n".join(definitions) + "\n" + insertion, 1)

    variant_dir = output_root_input / alias
    if _is_link_or_junction(variant_dir):
        raise ValueError("build output cannot traverse a symlink or junction")
    resolved_variant_dir = variant_dir.resolve()
    if resolved_variant_dir != expected_output and expected_output not in resolved_variant_dir.parents:
        raise ValueError("build output must remain under repository output/")
    variant_dir.mkdir(parents=True, exist_ok=True)
    if _is_link_or_junction(variant_dir):
        raise ValueError("build output cannot traverse a symlink or junction")
    variant_source = variant_dir / f"{EA_NAME}.mq5"
    helper_output = variant_dir / "ChartStudioEvidenceSpool.mqh"
    manifest_path = variant_dir / "build-manifest.json"
    for output_file in (variant_source, helper_output, manifest_path):
        if output_file.is_symlink():
            raise ValueError("build output files cannot be symlinks")
    ex5 = variant_source.with_suffix(".ex5")
    log = variant_source.with_suffix(".log")
    if ex5.is_symlink() or log.is_symlink():
        raise ValueError("build output files cannot be symlinks")
    ex5.unlink(missing_ok=True)
    log.unlink(missing_ok=True)
    _atomic_write(variant_source, generated.encode("utf-8-sig"))
    _atomic_write(helper_output, helper_bytes)
    manifest = {
        "schemaVersion": 1,
        "accountAlias": alias,
        "producerId": producer,
        "terminalIdentityHash": ctx.terminal_identity_hash,
        "sourceAndIncludeSha256": source_hash,
        "generatedSourceSha256": hashlib.sha256(variant_source.read_bytes()).hexdigest(),
        "presetName": Path(preset_path).name,
        "presetSha256": hashlib.sha256(preset_raw).hexdigest(),
        "presetInputCount": len(preset_names),
        "inputSchemaSha256": hashlib.sha256("\n".join(sorted(source_names)).encode("utf-8")).hexdigest(),
        "compiler": str(compiler),
        "portableIncludeRoot": str(include_root),
        "artifact": str(ex5),
        "compileLog": str(log),
    }
    _atomic_write(manifest_path, (json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return BuildVariant(variant_source, manifest_path, compiler, include_root, log)


def compiler_command(compiler: Path, source: Path, include_root: Path, log: Path) -> list[str]:
    wrapper = Path(__file__).with_name("run_metaeditor_compile.ps1")
    return [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(wrapper),
        str(compiler),
        str(source),
        str(include_root),
    ]


def compile_variant(variant: BuildVariant) -> Path:
    artifact = variant.source.with_suffix(".ex5")
    if artifact.is_symlink() or variant.log.is_symlink():
        raise ValueError("compiler outputs cannot be symlinks")
    artifact.unlink(missing_ok=True)
    variant.log.unlink(missing_ok=True)
    command = compiler_command(variant.compiler, variant.source, variant.include_root, variant.log)
    completed = subprocess.run(command, cwd=variant.compiler.parent, timeout=180, check=False)
    if variant.log.exists():
        log_bytes = variant.log.read_bytes()
        encoding = "utf-16" if b"\0" in log_bytes[:128] else "utf-8"
        log_text = log_bytes.decode(encoding, errors="replace")
    else:
        log_text = ""
    result = re.search(r"(?m)^\s*Result:\s*(\d+)\s+errors?,\s*(\d+)\s+warnings?\b", log_text)
    if not artifact.is_file() or not result or result.group(1) != "0" or result.group(2) != "0":
        artifact.unlink(missing_ok=True)
        raise RuntimeError(
            f"MetaEditor compile failed (wrapper exit={completed.returncode}); inspect {variant.log}; "
            "no MT5 terminal installation was changed"
        )
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=sorted(ALLOWED_ACCOUNTS))
    parser.add_argument("--preset", required=True, type=Path, help="the exact preset to bind to this instrumented candidate")
    parser.add_argument("--prepare-only", action="store_true", help="generate source and manifest without compiling")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        variant = prepare_variant(root, args.account, root / "output" / "ea-evidence-builds", preset_path=args.preset)
        if args.prepare_only:
            print(f"Prepared {variant.source}; manifest {variant.manifest}")
            return 0
        artifact = compile_variant(variant)
        print(f"Compiled candidate {artifact}; manifest {variant.manifest}")
        return 0
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Recorder build refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
