# FR-026 recovery of closed temporary evidence records

## Goal

Recover complete one-record `.tmp.ndjson` files left behind when a producer cannot finish its rename, without treating an actively written or malformed file as evidence. This unblocks the configured local importer while preserving sequence gaps and store idempotency.

## Boundaries

- Only configured demo producers are eligible; the existing protected-account rejection remains authoritative.
- Require identical file identity, size and modification time across two metadata scans, then require exactly one bounded, newline-terminated record whose embedded sequence matches its filename.
- Import through the existing `SpoolImporter`; archive only after durable append/duplicate acknowledgement and revalidation of the same file bytes/identity.
- Process at most five temporary records per producer poll (and no more than the configured general budget), keep ordering by producer sequence, and leave malformed, changing, incomplete, or unarchivable files in place with an explicit failure state.
- Do not inspect, move, delete or import any live spool during implementation tests. The existing demo spool remains a separate operational acceptance step.

## Test-first sequence

1. Add synthetic service tests for initial non-import, stable sequential recovery, bounded polling, partial files, sequence mismatch, and append/archive restart idempotency.
2. Observe the stable recovery test fail because `.tmp.ndjson` is currently status-only.
3. Implement metadata stability tracking and bounded, idempotent import/archive using the existing account/producer locks.
4. Run focused spool/service/API tests and the full relevant test workflow; verify a read-only live status afterwards.
5. Update the evidence plan and task ledger without claiming a live recorder event until the deployed service actually imports one.

## Verification

Synthetic tests use isolated private roots and never connect to MT5. No Strategy Tester/backtest or broker mutation is part of this slice.
