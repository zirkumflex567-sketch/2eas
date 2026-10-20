"""Install a verified GoldM15 recorder candidate beside the active EA."""

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
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import account_gateway
from chart_studio.evidence_models import AccountContext
from build_goldm15_evidence import EA_NAME, RECORD_ONLY_EA_NAME, EXPECTED_HASHES, HELPERS, PRESET_NAME

ALLOWED_ACCOUNT = "goldm15"
TARGET_DIRECTORY = "ChartStudioEvidence_goldm15"
INSTALL_STATE = "INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED"
SPOOL_NAME = "ChartStudioEvidenceSpool.mqh"
MANIFEST_NAME = "build-manifest.json"
INSTALL_MANIFEST_NAME = "install-manifest.json"


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


def _source_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


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
    manifest_path = package / MANIFEST_NAME
    if not manifest_path.is_file() or _is_reparse(manifest_path):
        raise ValueError("candidate manifest is missing or linked")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate candidate manifest key")
            result[key] = value
        return result

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"), object_pairs_hook=unique)
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError) as exc:
        raise ValueError("candidate manifest is invalid") from exc
    if not isinstance(manifest, dict):
        raise ValueError("candidate manifest is invalid")
    return manifest


def _candidate_files(package: Path, manifest: dict) -> dict[str, Path]:
    if manifest.get("schemaVersion") != 1 or manifest.get("accountAlias") != ALLOWED_ACCOUNT:
        raise ValueError("candidate is not bound to the allowlisted GoldM15 account")
    record_only = manifest.get("recordOnly")
    if type(record_only) is not bool:
        raise ValueError("candidate record-only mode is invalid")
    expected_producer = "goldm15_demo_recordonly" if record_only else "goldm15_demo"
    if manifest.get("producerId") != expected_producer:
        raise ValueError("candidate producer identity is invalid")
    if manifest.get("deployment") not in ("NOT_INSTALLED", INSTALL_STATE):
        raise ValueError("candidate deployment state is invalid")
    if manifest.get("compileResult") != "0 errors, 0 warnings":
        raise ValueError("candidate lacks a clean compiler result")
    if manifest.get("presetName") != PRESET_NAME or manifest.get("presetSha256") != EXPECTED_HASHES[
        "goldm15/GoldM15_Reconstruction.set"
    ]:
        raise ValueError("candidate preset does not match the pinned GoldM15 preset")
    for key in ("terminalIdentityHash", "generatedSourceSha256", "artifactSha256", "spoolHelperSha256"):
        value = manifest.get(key)
        if not isinstance(value, str) or len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise ValueError(f"candidate {key} is invalid")

    ea_name = RECORD_ONLY_EA_NAME if record_only else EA_NAME
    files = {
        f"{ea_name}.mq5": ("generatedSourceSha256", None),
        f"{ea_name}.ex5": ("artifactSha256", None),
        SPOOL_NAME: ("spoolHelperSha256", None),
        MANIFEST_NAME: (None, None),
    }
    generated_support = manifest.get("generatedSupportingSources")
    if not isinstance(generated_support, dict) or set(generated_support) != {path.as_posix() for path in HELPERS}:
        raise ValueError("candidate supporting-source inventory is incomplete")
    for relative in HELPERS:
        expected_hash = generated_support.get(relative.as_posix())
        if not isinstance(expected_hash, str) or len(expected_hash) != 64:
            raise ValueError("candidate supporting-source hash is invalid")
        files[relative.name] = (None, expected_hash)

    preset = ROOT / "goldm15" / PRESET_NAME
    files[PRESET_NAME] = (None, EXPECTED_HASHES["goldm15/GoldM15_Reconstruction.set"])
    resolved_files: dict[str, Path] = {}
    for name, (manifest_key, expected_hash) in files.items():
        source = preset if name == PRESET_NAME else package / name
        if not source.is_file() or _is_reparse(source):
            raise ValueError(f"candidate file {name} is missing or linked")
        if manifest_key is not None:
            expected_hash = manifest[manifest_key]
        actual_hash = _source_digest(source) if name == SPOOL_NAME else _sha256(source)
        if expected_hash is not None and actual_hash != expected_hash:
            raise ValueError(f"candidate file hash mismatch: {name}")
        resolved_files[name] = source
    return resolved_files


def _validate_live_terminal(mt5, spec: dict) -> Path:
    info, terminal = mt5.account_info(), mt5.terminal_info()
    if (not info or info.login != spec["login"] or info.server != spec["server"] or
            not terminal or not getattr(terminal, "connected", False)):
        raise ValueError("live GoldM15 demo identity is not verified")
    expected_root = Path(spec["terminal"]).parent.resolve()
    actual_root = Path(getattr(terminal, "path", "")).resolve()
    data_root = Path(getattr(terminal, "data_path", "")).resolve()
    if (os.path.normcase(str(expected_root)) != os.path.normcase(str(actual_root)) or
            (spec.get("portable") is True and os.path.normcase(str(expected_root)) != os.path.normcase(str(data_root)))):
        raise ValueError("live terminal path does not match the configured GoldM15 demo")
    return data_root


def _installation_matches(target: Path, files: dict[str, Path], artifact_hash: str) -> bool:
    if _is_reparse(target) or not target.is_dir():
        return False
    install_manifest = target / INSTALL_MANIFEST_NAME
    if not install_manifest.is_file() or _is_reparse(install_manifest):
        return False
    try:
        installed = json.loads(install_manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return False
    if (installed.get("accountAlias") != ALLOWED_ACCOUNT or installed.get("state") != INSTALL_STATE or
            installed.get("artifactSha256") != artifact_hash):
        return False
    if {entry.name for entry in target.iterdir()} != {*files.keys(), INSTALL_MANIFEST_NAME}:
        return False
    return all(
        not _is_reparse(target / name) and (target / name).is_file() and _sha256(target / name) == _sha256(source)
        for name, source in files.items()
    )


def _cleanup_staging(experts: Path, staging: Path) -> None:
    if not staging.exists():
        return
    if (_is_reparse(staging) or staging.parent.resolve() != experts.resolve() or
            re.fullmatch(r"\.ChartStudioEvidence_goldm15(?:_[A-Za-z0-9-]{1,32})?\.[A-Za-z0-9_-]+", staging.name) is None):
        raise RuntimeError("refusing unsafe staging cleanup")
    shutil.rmtree(staging)


def install_candidate(alias: str, package_path: Path, *, mt5=None,
                      install_directory: str | None = None) -> InstallResult:
    if alias != ALLOWED_ACCOUNT:
        raise ValueError("account is not allowlisted for GoldM15 recorder installation")
    if install_directory is None:
        install_directory = TARGET_DIRECTORY
    if (not isinstance(install_directory, str) or
            re.fullmatch(r"ChartStudioEvidence_goldm15(?:_[A-Za-z0-9-]{1,32})?", install_directory) is None):
        raise ValueError("install directory must use the managed GoldM15 evidence name")
    spec = account_gateway.ACCOUNTS.get(alias)
    if (not spec or spec.get("is_demo") is not True or spec.get("challenge_protection") is not False):
        raise ValueError("configured non-challenge demo account required")

    raw_package = Path(package_path).absolute()
    if _is_reparse(raw_package):
        raise ValueError("candidate package directory is missing or linked")
    package = raw_package.resolve()
    if not package.is_dir() or _is_reparse(package):
        raise ValueError("candidate package directory is missing or linked")
    manifest = _read_manifest(package)
    if manifest.get("recordOnly") is True and install_directory == TARGET_DIRECTORY:
        artifact_hint = manifest.get("artifactSha256", "")
        if not isinstance(artifact_hint, str) or re.fullmatch(r"[0-9a-f]{64}", artifact_hint) is None:
            raise ValueError("record-only candidate artifact hash is invalid")
        install_directory = f"ChartStudioEvidence_goldm15_recordonly_{artifact_hint[:8]}"
    files = _candidate_files(package, manifest)
    context = AccountContext.from_config(alias)
    if manifest["terminalIdentityHash"] != context.terminal_identity_hash:
        raise ValueError("candidate terminal identity differs from configured GoldM15 demo")
    artifact_hash = manifest["artifactSha256"]

    if mt5 is None:
        try:
            import MetaTrader5 as mt5_module
        except ImportError as exc:
            raise RuntimeError("MetaTrader5 package is unavailable") from exc
        mt5 = mt5_module

    with account_gateway.session(mt5, alias):
        data_root = _validate_live_terminal(mt5, spec)

    experts = data_root / "MQL5" / "Experts"
    if any(_is_reparse(path) for path in (data_root / "MQL5", experts)):
        raise ValueError("terminal Experts path cannot contain links or junctions")
    target = experts / install_directory
    if target.exists():
        if _installation_matches(target, files, artifact_hash):
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
        install_manifest = {
            "schemaVersion": 1,
            "accountAlias": ALLOWED_ACCOUNT,
            "producerId": manifest["producerId"],
            "state": INSTALL_STATE,
            "artifactSha256": artifact_hash,
            "sourceSha256": manifest["generatedSourceSha256"],
            "presetSha256": manifest["presetSha256"],
            "installedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        (staging / INSTALL_MANIFEST_NAME).write_text(json.dumps(install_manifest, sort_keys=True) + "\n", encoding="utf-8")
        for name, source in files.items():
            if _sha256(staging / name) != _sha256(source):
                raise OSError(f"staged artifact verification failed: {name}")
        if _is_reparse(staging) or staging.parent.resolve() != experts.resolve():
            raise ValueError("staging directory escaped terminal Experts")
        os.rename(staging, target)
        staging_owned = False
        if not _installation_matches(target, files, artifact_hash):
            raise OSError("installed package verification failed")
    finally:
        if staging_owned:
            _cleanup_staging(experts, staging)
    return InstallResult(target, False, artifact_hash)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("account", choices=[ALLOWED_ACCOUNT])
    parser.add_argument("--package", type=Path, default=ROOT / "output" / "goldm15-evidence" / ALLOWED_ACCOUNT)
    parser.add_argument("--install-directory", default=TARGET_DIRECTORY)
    args = parser.parse_args()
    try:
        result = install_candidate(args.account, args.package, install_directory=args.install_directory)
    except Exception as exc:
        print(f"Refused: {type(exc).__name__}", file=sys.stderr)
        return 2
    state = "already installed" if result.already_installed else "installed side-by-side; not attached"
    print(f"GoldM15 evidence candidate {state}; SHA-256 {result.artifact_sha256}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
