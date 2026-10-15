"""Read-only checker for updates advertised by origin/main.

This tool never fetches or checks out code, changes local files, restarts a
service, invokes MetaEditor, or copies an EA. Review and apply updates manually.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


BASE_DIR = Path(__file__).resolve().parent


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
        shell=False,
    )
    if result.returncode != 0:
        # Do not print Git's raw errors: a misconfigured remote can contain
        # credentials in its URL.
        raise RuntimeError(f"git {args[0]} failed (exit {result.returncode})")
    return result.stdout.strip()


def inspect_update(repo: Path = BASE_DIR) -> dict[str, str | bool]:
    """Read local checkout metadata and advertised origin/main without writes."""
    repo = Path(repo).resolve()
    root = Path(_git(repo, "rev-parse", "--show-toplevel")).resolve()
    branch = _git(root, "branch", "--show-current") or "(detached)"
    head = _git(root, "rev-parse", "HEAD")
    dirty = bool(_git(root, "status", "--porcelain"))
    advertised = _git(root, "ls-remote", "--heads", "origin", "refs/heads/main")
    refs = [line.split() for line in advertised.splitlines() if line.split()]
    remote_main = next((parts[0] for parts in refs if len(parts) > 1 and parts[1] == "refs/heads/main"), "")
    if len(remote_main) != 40:
        raise RuntimeError("origin/main did not advertise a valid commit")
    return {
        "repository": str(root),
        "branch": branch,
        "head": head,
        "remote_main": remote_main,
        "dirty": dirty,
        "update_available": head != remote_main,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only check for origin/main updates")
    parser.add_argument("--repo", type=Path, default=BASE_DIR, help="Git checkout to inspect")
    args = parser.parse_args(argv)
    try:
        state = inspect_update(args.repo)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print(f"Update-Status nicht verfügbar: {exc}", file=sys.stderr)
        return 2

    print(f"Checkout: {state['repository']}")
    print(f"Branch: {state['branch']} · HEAD {str(state['head'])[:12]}")
    print(f"origin/main: {str(state['remote_main'])[:12]}")
    print(f"Lokale Änderungen: {'ja' if state['dirty'] else 'nein'}")
    if state["update_available"]:
        print("Update vorhanden; erst prüfen und anschließend manuell integrieren.")
    else:
        print("Checkout entspricht origin/main.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
