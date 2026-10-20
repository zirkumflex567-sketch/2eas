# FR-026 durable recorder queue-overflow gaps

## Goal

Ensure Titan recorder events dropped by the bounded in-memory queue become visible to the existing importer as sequence gaps, instead of appearing only as transient Expert-log counters.

## Scope and safety

- Change only the opt-in evidence spool helper and its build-contract tests.
- Never write files or perform disk I/O from `OnTick`, trade callbacks, or enqueue callbacks; apply gap accounting from the existing timer flush path.
- Preserve strategy predicates, order calls, default EA behavior, account binding, bounded queue and existing spool format.
- Do not read, change, or install files in the Blueberry terminal. Do not attach/reload any EA, send broker writes, or run a Strategy Tester/backtest.

## Implementation

1. Add a source contract test for FIFO ordering, timer-only disk writes, persistence failure, sequence limits, and shutdown draining.
2. Represent each not-yet-applied overflow delta as a FIFO marker. Add it after a timer batch, including before any return after a partial batch; later callback events therefore cannot overtake the gap. Persist the sequence skip when the marker reaches the head.
3. Allow one extra shutdown batch for a pending marker and validate generated normal/RecordOnly builds preserve the same capture contract and broker-write guards.
4. Compile the demo RecordOnly candidates in isolated output directories, run capture/importer/service regressions, obtain read-only code review, and record implementation evidence and remaining limits in `OPEN_TASKS.md`.

## Acceptance

- RED test fails against current helper.
- GREEN: targeted tests pass and the isolated MQL5 builds compile with zero errors/warnings.
- No live MT5 installation/attach, trade, Blueberry access, hardware interaction, or backtest.
- Known durability limit: a process crash before the next timer queues and drains the marker can lose the still-in-memory overflow count. The change guarantees persisted gaps after a marker is durably applied, not crash-safe overflow accounting before then.
- Main CI and deployment are performed only after the change is committed and CI succeeds; runtime chart identity and a future fresh imported event are still separate acceptance gates.

## Status

- [ ] Focused regression suite, isolated compiles, final review, CI, and release evidence.
