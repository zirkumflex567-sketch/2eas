# AUD-09: recover interrupted drawdown reset pair

## Goal

Make the dashboard's local drawdown configuration and Titan's shared MT5 reset file recover to one consistent pre-reset state after a process interruption between replacements. This is persistence recovery only: it must not claim that Titan acknowledged or applied the reset. Strategy Tester, backtests and live/demo reset calls are excluded.

## Current behavior and scope

`dd_persistence.save` stages both files and replaces them one at a time. It rolls back ordinary exceptions, but a process exit after the first replacement leaves two different states. `app.load_dd_config` currently reads only the selected local file and does not recover the pair.

Files: `dd_persistence.py`, `app.py`, focused tests in `tests/test_backend_audit.py`, `.gitignore`, this plan and the AUD-09 ledger entry in `docs/OPEN_TASKS.md`.

## Design

Before replacing any target, atomically persist a bounded schema-v1 recovery journal beside the selected local config. It binds the ordered target paths and stores their exact prior bytes (or an explicit missing marker), with SHA-256 checksums. If a later replacement/readback fails or the process exits before the transaction is finalized, the next load/save validates the journal against the caller's trusted target list and restores every target to its prior state. Recovery itself remains repeatable if interrupted. Remove the journal only after every target is restored or every target has been committed and validated. Reject malformed, oversized, checksum-mismatched, or cross-target journals without writing any target.

The journal and all staging files stay private/local and ignored by Git. All target data is staged and flushed before replacement. Recovery records only file-write success; it never represents an EA heartbeat or acknowledgment. The guarantee covers process termination between file operations and repeatable recovery on the next app read/write; it does not claim power-loss durability beyond the host filesystem's atomic-replace/fsync guarantees.

## Test-first tasks

1. [x] Add a deterministic interruption test that raises a `BaseException` after the first target replacement, proves the files differ before recovery, calls the app's normal drawdown-load path, and verifies both return to the exact old state. The test failed first because load returned the half-committed new local file.
2. [x] Add rejection/retry coverage for corrupt journal JSON, wrong target set, checksum mismatch, interruption during recovery, and successful commit cleanup. Each test exercises isolated temp files.
3. [x] Implement bounded journal creation, strict checksum/target validation and idempotent rollback recovery; invoke recovery before drawdown loads and saves.
4. [x] Preserve ordinary failure/readback behavior and add no MT5 calls, order routes, or EA code paths.
5. [ ] Run the full non-backtest Python suite and independent review before committing to main. Focused reset persistence regressions pass; broader audit tests exposed pre-existing mixed-owner journal and stale Marketplace assertions that need separate treatment.

## Acceptance boundary

An injected process interruption must be recovered before the dashboard returns a drawdown state. Invalid recovery metadata must fail closed with HTTP 503 and leave broker APIs untouched. The Titan's actual observation/acknowledgment of the restored or committed shared file remains unverified until an independent EA heartbeat/runtime-identity channel exists.
