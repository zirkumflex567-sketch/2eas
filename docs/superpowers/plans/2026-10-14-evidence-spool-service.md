# Evidence spool reader and lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import complete, account-bound MT5 spool records from a private rotating file spool without blocking the dashboard event loop or making broker calls.

**Architecture:** Add a single-process, nonblocking-locked file consumer that polls fixed producer files only when an explicit private spool-root setting is configured. It reads bounded newline-terminated records, delegates validation/idempotency to `SpoolImporter`, persists file offsets atomically, and archives a rotated segment only after its final record is durably acknowledged. FastAPI startup launches a cancellable async task that runs polling in a worker thread; shutdown awaits it. Recording remains disabled when configuration is absent or invalid.

**Tech Stack:** Python stdlib asyncio/threading/file locks, existing FastAPI, `EvidenceStore`, `SpoolImporter`, pytest.

---

## Files

- Create `chart_studio/evidence_spool_service.py`: private path validation, per-producer lock, active/rotated segment discovery, bounded reads, durable offset cursor, archive protocol, `poll_once`, and async lifecycle loop.
- Modify `chart_studio/evidence_api.py`: opt-in service construction from the installed store and private spool root, startup/shutdown hooks, health state kept internal; no append HTTP route.
- Modify `dashboard_runtime.py`: allow only the new spool-root path in the existing private environment contract; never display its value in public runtime identity.
- Add `tests/test_chart_studio_evidence_spool_service.py`: active partial line, complete import, duplicate crash replay, rotated-file archive, cross-process/second-consumer lock, unsafe root/file, out-of-order filename/sequence, disabled config, startup/shutdown, and broker-mutation absence.
- Modify `chart_studio/README.md`, `docs/OPEN_TASKS.md`, and the package-1 plan with truthful opt-in and still-open live EA identity gates.

## TDD steps

1. Test rejecting a private spool consumer without an explicitly configured, private spool root; test records and files cannot redirect account or producer scope.
2. Test active-file tail behavior: only complete lines are imported; a partial final line remains unread and completes on the next poll.
3. Test rotated segment ordering and archive after durable import; replay after crash remains idempotent through `SpoolImporter`.
4. Test nonblocking single-consumer lock, bounded records per poll, cursor revalidation, and fail-closed behavior for replacement, truncation, symlink/reparse, oversized input, or store outage. Persisted offset state must bind account/terminal/producer and exact physical file ID, expected active/ready/archive state, and offset. Rename of the same file across ready→archive is reconciled by file ID; replacement, truncation, path reuse, or an unexplained rename fail closed and never reset the cursor silently. Test crashes before/after offset persistence and archive rename.
5. Test closed-segment range consistency: first/last records equal filename bounds; records are strictly increasing; internal sequence holes increment visible gap counts; reversed or overlapping segment ranges fail closed. A hole between segments is also visible. `poll_once()` returns gap/loss diagnostics, and `app.state.evidence_spool_status` retains the latest per-producer status internally across polling; importer gap totals survive restart via its private cursor. No public status/append route is added.
6. Test startup/shutdown, absent-config disabled behavior, and reject spool/archive/cursor locations inside the checkout, any Git worktree, or a static mount. Assert importer path never calls MT5 or any trade mutation.
7. Run focused and full Python regressions, review, and commit. Do not enable the setting or claim live events without verified chart-bound EA identity.

## File protocol

- The operator pre-creates both the spool root and its `archive/` directory with private ACLs; service startup verifies them and never broadens permissions.
- Active producer file: `<producerId>.active.ndjson`, append-only; records are newline-terminated UTF-8 JSON and line sequence numbers strictly increase.
- Closed segment name: `<producerId>.<firstSequence>-<lastSequence>.ready.ndjson`; producer closes the file before rename and starts a new active file.
- A segment is archived to `archive/` only after the consumer validates the filename bounds, imports each complete record in order, confirms EOF on a newline boundary, atomically persists its offset, and rechecks physical file identity. Partial active tails are retried; partial closed segments fail closed and remain visible.

## Acceptance boundaries

The service is opt-in and does not start MT5 or write broker state. Spool and archive directories are private, pre-existing and outside all Git worktrees and static mounts; cursor state remains under the private evidence-store root. The loader does not prove who produced a same-user file; source/preset/binary identity, EA producers, fresh demo events, partial-fill/trailing evidence, inspector UI, and hardware/live acceptance remain open.

## Progress

- [x] Plan independently reviewed; segment/cursor/crash boundaries approved.
- [x] File consumer tests observed failing before implementation.
- [x] Service and lifecycle implemented; 15 spool tests and 73 spool/importer/runtime tests pass. A full-suite run had 901 passes and 270 subtests plus one lifecycle-status race; the race was fixed and a fresh full-suite rerun is in progress.
- [ ] Independent code review passed; mapped requirements remain partial until real demo evidence.
