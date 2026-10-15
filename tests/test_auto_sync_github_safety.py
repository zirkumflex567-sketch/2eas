import subprocess
from pathlib import Path


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def test_update_check_only_reports_remote_main_and_preserves_local_checkout(tmp_path):
    source = Path(__file__).resolve().parents[1] / "auto_sync_github.py"
    text = source.read_text(encoding="utf-8")
    assert "def inspect_update" in text, "one-shot read-only update inspection is missing"
    for forbidden in (
        '"fetch"', '"pull"', '"stash"', "taskkill", "metaeditor64.exe",
        "shutil.copy", "Start-Process", "while True",
    ):
        assert forbidden not in text, f"automatic mutation path remains: {forbidden}"

    remote = tmp_path / "origin.git"
    local = tmp_path / "local"
    producer = tmp_path / "producer"
    remote.mkdir()
    _git(tmp_path, "init", "--bare", str(remote))
    _git(tmp_path, "init", "-b", "main", str(local))
    _git(local, "config", "user.name", "Test")
    _git(local, "config", "user.email", "test@example.invalid")
    (local / "tracked.txt").write_text("base\n", encoding="utf-8")
    _git(local, "add", "tracked.txt")
    _git(local, "commit", "-m", "base")
    _git(local, "remote", "add", "origin", str(remote))
    _git(local, "push", "-u", "origin", "main")
    _git(remote, "symbolic-ref", "HEAD", "refs/heads/main")

    from auto_sync_github import inspect_update

    initial = inspect_update(local)
    assert initial["branch"] == "main"
    assert initial["head"] == initial["remote_main"]
    assert initial["update_available"] is False

    _git(tmp_path, "clone", str(remote), str(producer))
    _git(producer, "config", "user.name", "Test")
    _git(producer, "config", "user.email", "test@example.invalid")
    (producer / "tracked.txt").write_text("remote update\n", encoding="utf-8")
    _git(producer, "commit", "-am", "remote update")
    _git(producer, "push", "origin", "main")

    (local / "tracked.txt").write_text("local edit\n", encoding="utf-8")
    (local / "untracked.txt").write_text("keep me\n", encoding="utf-8")
    before_head = _git(local, "rev-parse", "HEAD")
    before_status = _git(local, "status", "--porcelain")
    state = inspect_update(local)

    assert state["update_available"] is True
    assert state["head"] == before_head
    assert state["remote_main"] != before_head
    assert state["dirty"] is True
    assert _git(local, "status", "--porcelain") == before_status
    assert (local / "tracked.txt").read_text(encoding="utf-8") == "local edit\n"
    assert (local / "untracked.txt").read_text(encoding="utf-8") == "keep me\n"
