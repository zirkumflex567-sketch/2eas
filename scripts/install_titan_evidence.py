"""Install verified Titan RecordOnly recorder candidates beside active demo EAs."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "output"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import account_gateway
from chart_studio.evidence_models import AccountContext
from build_titan_basketguard_evidence import (
    ALLOWED_ACCOUNTS, EXPECTED_PRESETS, EXPECTED_PRESET_SHA256,
    EXPECTED_SYMBOLS,
    SOURCE_NAME as TITAN_SOURCE_NAME, EA_NAME,
)

SPOOL_NAME = "ChartStudioEvidenceSpool.mqh"
MANIFEST_NAME = "build-manifest.json"
INSTALL_MANIFEST_NAME = "install-manifest.json"
INSTALL_STATE = "INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED"
RECORD_ONLY_SUFFIX = "_RecordOnly"


class InstallResult:
    def __init__(self, installed_directory: Path, already_installed: bool, artifact_sha256: str):
        self.installed_directory = installed_directory
        self.already_installed = already_installed
        self.artifact_sha256 = artifact_sha256


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    if callable(is_junction) and is_junction():
        return True
    try:
        attributes = path.lstat().st_file_attributes
    except (AttributeError, FileNotFoundError, OSError):
        return False
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _read_manifest(package: Path) -> dict:
    path = package / MANIFEST_NAME
    if not path.is_file() or _is_reparse(path):
        raise ValueError("candidate manifest is missing or linked")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate manifest key")
            result[key] = value
        return result

    try:
        manifest = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique)
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError) as exc:
        raise ValueError("candidate manifest is invalid") from exc
    if not isinstance(manifest, dict):
        raise ValueError("candidate manifest is invalid")
    return manifest


def _candidate_files(alias: str, package: Path, preset_path: Path) -> tuple[dict[str, Path], dict]:
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError("account is not allowlisted for Titan recorder installation")
    raw_package = Path(package).absolute()
    if _is_reparse(raw_package):
        raise ValueError("candidate package is linked")
    package = raw_package.resolve()
    if not package.is_dir() or _is_reparse(package):
        raise ValueError("candidate package is missing or linked")
    expected_package = (OUTPUT_ROOT / "titan-basketguard-evidence" / alias / "record-only").resolve()
    if package != expected_package:
        raise ValueError("candidate package must come from its managed build directory")
    for parent in (raw_package, *raw_package.parents):
        if parent.exists() and _is_reparse(parent):
            raise ValueError("candidate package path cannot traverse links or junctions")
    manifest = _read_manifest(package)
    expected_producer = f"titan_{'puprime250' if alias == 'xau5m_m5' else 'puprime500'}_recordonly"
    if (manifest.get("schemaVersion") != 1 or manifest.get("accountAlias") != alias or
            manifest.get("expectedSymbol") != EXPECTED_SYMBOLS[alias] or
            manifest.get("producerId") != expected_producer):
        raise ValueError("candidate account, symbol, or producer binding is invalid")
    if manifest.get("recordOnly") is not True:
        raise ValueError("candidate is not record-only")
    if manifest.get("compileResult") != "0 errors, 0 warnings":
        raise ValueError("candidate lacks a clean compiler result")
    expected_context = AccountContext.from_config(alias)
    if manifest.get("terminalIdentityHash") != expected_context.terminal_identity_hash:
        raise ValueError("candidate terminal identity differs from configured demo")
    preset_name = EXPECTED_PRESETS[alias]
    if (manifest.get("presetName") != preset_name or
            manifest.get("presetSha256") != EXPECTED_PRESET_SHA256[alias]):
        raise ValueError("candidate preset does not match the pinned account preset")
    for key in ("generatedSourceSha256", "artifactSha256", "sourceAndIncludeSha256"):
        value = manifest.get(key)
        if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
            raise ValueError(f"candidate {key} is invalid")
    preset = Path(preset_path).absolute()
    if _is_reparse(preset) or not preset.is_file() or preset.name != preset_name:
        raise ValueError("account preset is missing, linked, or has the wrong name")
    if _sha256(preset) != EXPECTED_PRESET_SHA256[alias]:
        raise ValueError("account preset hash does not match the pinned demo preset")
    source_name = f"{EA_NAME}{RECORD_ONLY_SUFFIX}.mq5"
    artifact_name = f"{EA_NAME}{RECORD_ONLY_SUFFIX}.ex5"
    helper = package / SPOOL_NAME
    if not helper.is_file() or _is_reparse(helper):
        raise ValueError("candidate recorder helper is missing or linked")
    expected_helper = ROOT / SPOOL_NAME
    if not expected_helper.is_file() or helper.read_bytes() != expected_helper.read_bytes():
        raise ValueError("candidate recorder helper differs from the reviewed main source")
    if manifest.get("sourceSha256") != hashlib.sha256((ROOT / TITAN_SOURCE_NAME).read_bytes()).hexdigest():
        raise ValueError("candidate base source differs from the reviewed Titan source")
    expected_composite = hashlib.sha256(
        (ROOT / TITAN_SOURCE_NAME).read_bytes() + b"\0" + expected_helper.read_bytes()
    ).hexdigest()
    if manifest.get("sourceAndIncludeSha256") != expected_composite:
        raise ValueError("candidate source/include binding differs from main")
    files = {
        source_name: ("generatedSourceSha256", False),
        artifact_name: ("artifactSha256", False),
        SPOOL_NAME: ("spoolHelperSha256", True),
        MANIFEST_NAME: (None, False),
        preset_name: (None, False),
    }
    resolved = {}
    for name, (manifest_key, normalized) in files.items():
        source = preset if name == preset_name else package / name
        if not source.is_file() or _is_reparse(source):
            raise ValueError(f"candidate file {name} is missing or linked")
        actual = _sha256(source)
        expected = manifest.get(manifest_key) if manifest_key else (
            EXPECTED_PRESET_SHA256[alias] if name == preset_name else None)
        if normalized:
            actual = hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
        if expected is not None and actual != expected:
            raise ValueError(f"candidate file hash mismatch: {name}")
        resolved[name] = source
    return resolved, manifest


def _installation_matches(target: Path, files: dict[str, Path], artifact_hash: str, alias: str) -> bool:
    if _is_reparse(target) or not target.is_dir():
        return False
    marker = target / INSTALL_MANIFEST_NAME
    if not marker.is_file() or _is_reparse(marker):
        return False
    try:
        installed = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return False
    if (installed.get("accountAlias") != alias or installed.get("state") != INSTALL_STATE or
            installed.get("artifactSha256") != artifact_hash):
        return False
    if {entry.name for entry in target.iterdir()} != {*files, INSTALL_MANIFEST_NAME}:
        return False
    return all(not _is_reparse(target / name) and (target / name).is_file() and
               _sha256(target / name) == _sha256(source) for name, source in files.items())


def _cleanup_staging(experts: Path, staging: Path) -> None:
    if not staging.exists():
        return
    if (_is_reparse(staging) or staging.parent.resolve() != experts.resolve() or
            re.fullmatch(r"\.ChartStudioEvidence_(?:xau5m_m5|titan_m5)_recordonly_[0-9a-f]{8}\.[A-Za-z0-9_-]+", staging.name) is None):
        raise RuntimeError("refusing unsafe staging cleanup")
    shutil.rmtree(staging)


def install_candidate(alias: str, package_path: Path, preset_path: Path, *, mt5=None) -> InstallResult:
    if alias not in ALLOWED_ACCOUNTS:
        raise ValueError("account is not allowlisted for Titan recorder installation")
    spec = account_gateway.ACCOUNTS.get(alias)
    if not spec or spec.get("is_demo") is not True or spec.get("challenge_protection") is not False:
        raise ValueError("configured non-challenge demo account required")
    files, manifest = _candidate_files(alias, package_path, preset_path)
    artifact_hash = manifest["artifactSha256"]
    install_directory = f"ChartStudioEvidence_{alias}_recordonly_{artifact_hash[:8]}"
    if mt5 is None:
        try:
            import MetaTrader5 as mt5_module
        except ImportError as exc:
            raise RuntimeError("MetaTrader5 package is unavailable") from exc
        mt5 = mt5_module

    with account_gateway.session(mt5, alias):
        account_gateway.verify_identity(mt5, spec)
        terminal = mt5.terminal_info()
        expected_terminal = Path(spec["terminal"]).parent.resolve()
        actual_terminal = Path(getattr(terminal, "path", "")).resolve()
        data_root = Path(getattr(terminal, "data_path", "")).resolve()
        if (os.path.normcase(str(expected_terminal)) != os.path.normcase(str(actual_terminal)) or
                (spec.get("portable") is True and os.path.normcase(str(expected_terminal)) != os.path.normcase(str(data_root)))):
            raise ValueError("live terminal path does not match the configured demo")

    experts = data_root / "MQL5" / "Experts"
    if any(_is_reparse(path) for path in (data_root / "MQL5", experts)):
        raise ValueError("terminal Experts path cannot contain links or junctions")
    target = experts / install_directory
    if target.exists():
        if _installation_matches(target, files, artifact_hash, alias):
            return InstallResult(target, True, artifact_hash)
        raise ValueError("conflicting side-by-side installation already exists")
    experts.mkdir(parents=True, exist_ok=True)
    if _is_reparse(experts):
        raise ValueError("terminal Experts path cannot be a link or junction")
    staging = Path(tempfile.mkdtemp(prefix=f".{install_directory}.", dir=experts))
    staging_owned = True
    try:
        for name, source in files.items():
            shutil.copyfile(source, staging / name)
        (staging / INSTALL_MANIFEST_NAME).write_text(json.dumps({
            "schemaVersion": 1, "accountAlias": alias,
            "producerId": manifest["producerId"], "state": INSTALL_STATE,
            "artifactSha256": artifact_hash,
            "sourceSha256": manifest["generatedSourceSha256"],
            "presetSha256": manifest["presetSha256"],
            "installedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }, sort_keys=True) + "\n", encoding="utf-8")
        if any(_sha256(staging / name) != _sha256(source) for name, source in files.items()):
            raise OSError("staged candidate verification failed")
        if _is_reparse(staging) or staging.parent.resolve() != experts.resolve():
            raise ValueError("staging directory escaped terminal Experts")
        os.rename(staging, target)
        staging_owned = False
        if not _installation_matches(target, files, artifact_hash, alias):
            raise OSError("installed candidate verification failed")
    finally:
        if staging_owned:
            _cleanup_staging(experts, staging)
    return InstallResult(target, False, artifact_hash)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=sorted(ALLOWED_ACCOUNTS))
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--preset", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = install_candidate(args.account, args.package, args.preset)
    except Exception as exc:
        print(f"Refused: {type(exc).__name__}", file=sys.stderr)
        return 2
    state = "already installed" if result.already_installed else "installed side-by-side; not attached"
    print(f"Titan RecordOnly candidate {state}; SHA-256 {result.artifact_sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
