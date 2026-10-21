# FR-026 durable recorder queue-overflow gaps

## Goal

Ensure Titan recorder events dropped by the bounded in-memory queue become visible to the existing importer as sequence gaps, instead of appearing only as transient Expert-log counters.

## Scope and safety

- Change only the opt-in evidence spool helper and its build-contract tests.
- Never write files or perform disk I/O from `OnTick`, trade callbacks, or enqueue callbacks; apply gap accounting from the existing timer flush path.
- Preserve strategy predicates, order calls, default EA behavior, account binding, bounded queue and existing spool format.
- Do not read, change, or install files in the Blueberry terminal. Do not attach/reload any EA, send broker writes, or run a Strategy Tester/backtest. After the user later explicitly authorized all other demo accounts, the two freshly compiled RecordOnly EX5/preset pairs were copied side-by-side into only the account-bound PU Prime demo terminals; existing files and running charts/EAs were left untouched.

## Implementation

1. Add a source contract test for FIFO ordering, timer-only disk writes, persistence failure, sequence limits, and shutdown draining.
2. Represent each not-yet-applied overflow delta as a FIFO marker. Add it after a timer batch, including before any return after a partial batch; later callback events therefore cannot overtake the gap. Persist the sequence skip when the marker reaches the head.
3. Allow one extra shutdown batch for a pending marker and validate generated normal/RecordOnly builds preserve the same capture contract and broker-write guards.
4. Compile the demo RecordOnly candidates in isolated output directories, run capture/importer/service regressions, obtain read-only code review, and record implementation evidence and remaining limits in `OPEN_TASKS.md`.

## Acceptance

- RED test fails against current helper.
- GREEN: targeted tests pass and the isolated MQL5 builds compile with zero errors/warnings.
- No EA attach/reload, trade, Blueberry access, hardware interaction, or backtest. The later user-authorized side-by-side file copy is recorded separately below; it did not activate the EA.
- Known durability limit: a process crash before the next timer queues and drains the marker can lose the still-in-memory overflow count. The change guarantees persisted gaps after a marker is durably applied, not crash-safe overflow accounting before then.
- Main CI and deployment are performed only after the change is committed and CI succeeds; runtime chart identity and a future fresh imported event are still separate acceptance gates.

## Status

- [x] RED/GREEN source-contract regression: overflow is counted in memory only; enqueue/callback code performs no file or terminal-global-variable I/O.
- [x] Timer flush inserts the cumulative overflow delta as an ordered FIFO marker and persists the sequence skip before removing it; sequence-limit and persistence failures disable capture fail-closed. Shutdown has one extra bounded batch for the marker.
- [x] Focused regression suites: **108 passed** across Titan/GoldM15 builders, spool contracts/importer, and spool service. The shared helper pin in the isolated GoldM15 builder was updated to the reviewed helper digest after its existing build-package regression caught the mismatch.
- [x] Fresh isolated MetaEditor builds: Titan RecordOnly `xau5m_m5` and `titan_m5`, plus GoldM15 normal and RecordOnly, all **0 errors / 0 warnings**. Manifests match the current helper/source and alias-bound presets. Artifacts remain under ignored `output/`; no MT5 installation was changed.
- [x] Source review confirmed no terminal global-variable persistence remains in the helper and callback paths only enqueue/count in memory. The documented loss boundary is retained: a crash before the next timer persists the marker can lose that still-pending overflow delta.
- [x] Commit/push `8702cc8`; Main CI passed: Chart Studio `39548013744`, Performance/UX `39548013771`. Local Main ports 8050/8056 and hTown `/stt` now report revision `3f933d7d9b40aad07e7b565abecef9e62439f4a6`, identical digest `c6dada20c5bd7f9068b9014148a691307fbb98a81a526b3181b3fa21643ef9a1`, `applicationCodeDirty=false`, and `restart_required=false`.
- [x] Following the user's explicit non-Blueberry demo authorization, recompiled and hash-verified Titan RecordOnly EX5/set pairs and installed them under new side-by-side paths in `xau5m_m5` and `titan_m5`; no existing file, active EA, or chart was replaced/reloaded.
- [ ] Live EA attach, imported DecisionEvent, hardware, order-write, and backtest gates remain separate. User forbids computer-use, so chart attachment and Experts-tab confirmation remain manual.
