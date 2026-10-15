# AUD-14: Read-only update checker

## Scope

Replace `auto_sync_github.py`'s automatic `fetch`/`stash`/`pull`, web-server termination/restart, MetaEditor compile, and EX5 fan-out with a one-shot, read-only status check for the checkout containing the script. Remove the unauthenticated `/api/git/sync` and `/api/git/webhook` routes that invoke `git pull` and return raw process output. The checker may ask Git for the advertised `origin/main` object ID with `ls-remote`; it must never mutate the repository, start/stop applications, invoke a compiler, or write into the user's root checkout. It prints whether an update is available and leaves update/review/restart decisions to the operator.

This is an AUD-14 local safety candidate. It does not migrate local starter files, rotate any credentials, change running terminals/EAs, or claim that the separate root-checkout draft has been cleaned up. Strategy Tester and backtesting are out of scope.

## Files

- `auto_sync_github.py`: safe, one-shot read-only CLI using the script's repository by default and an optional explicit `--repo` path.
- `tests/test_auto_sync_github_safety.py`: real temporary local/bare Git repositories prove remote-ahead reporting and that tracked/untracked/local branch state is preserved; static contract asserts that process-control, compile, copy, stash, fetch, and pull paths are absent.
- `tests/test_backend_audit.py`: unauthenticated GET/POST contract proves both Git-pull routes are absent and no process is invoked.
- `docs/OPEN_TASKS.md`: record exact local evidence and the remaining root-checkout / secret-rotation / operational gates.

## Verification

1. Run the new tests before implementation and observe expected failures.
2. Implement the smallest one-shot checker; re-run the focused tests and Python compilation.
3. Run the focused AUD-14 and runtime tests; inspect the diff and ensure no secret, credential URL, or root path is introduced.
4. Do not run the updater against the root checkout. No auto-update process, web server, MT5 terminal, EA, or Strategy Tester is part of verification.

## Rollback

Revert the `auto_sync_github.py` change if the status checker fails; it performs no checkout mutation, so no repository or application rollback is otherwise needed.
