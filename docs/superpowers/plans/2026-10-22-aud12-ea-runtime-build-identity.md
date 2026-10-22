# AUD-12 EA Runtime Build Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each instrumented Titan or GoldM15 EA log the exact source/include and effective preset hashes that its loaded instance was built with.

**Architecture:** Extend the shared MQL5 recorder initialization log with the account alias, producer ID, terminal identity hash, compiled source/include SHA-256, and validated effective parameter-set SHA-256. Keep the message behind the existing opt-in instrumentation and after identity, preset, and spool validation. Add source-contract coverage, build both EA families into isolated side-by-side artifacts, and do not attach or replace any live chart.

**Tech Stack:** MQL5, Python build scripts, pytest, MetaEditor.

---

### Task 1: Log exact instrumented runtime identity

**Files:**
- Modify: `ChartStudioEvidenceSpool.mqh`
- Test: `tests/test_titan_evidence_capture_contract.py`
- Verify: Titan and GoldM15 isolated demo build scripts
- Update: `docs/OPEN_TASKS.md`

- [x] Add a failing source-contract test requiring the successful recorder-ready log to include account alias, producer ID, terminal identity, source/include hash, and effective parameter hash.
- [x] Run the focused test and confirm it fails because the current log includes only the producer ID.
- [x] Extend the successful initialization log with those four validated identity fields; do not change strategy or queue behavior.
- [x] Run Titan/GoldM15 evidence-build regressions, existing recorder contracts, and focused Python tests (91 passed).
- [x] Compile the account-bound demo variants in isolated output directories; verify manifest source/preset hashes and 0 compiler errors/warnings.
- [x] Record the live finding: current PU-Prime producers keep redelivering one old event; old experts logs lack the new identity fields. Leave attachment and live event confirmation for a separate chart-only manual gate.
- [x] Review the diff, commit to `main`, push, deploy through guarded runtimes, and verify local plus hTown runtime identity.\n- [ ] Complete the separate chart-only manual gate: attach the updated RecordOnly candidate on a PU-Prime demo chart and confirm a fresh imported event.
