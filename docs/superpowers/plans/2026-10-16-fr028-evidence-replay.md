# FR-028 Read-only evidence snapshot replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay frozen, hash-verified broker snapshots with only referenced, recorded lifecycle/decision events revealed as their exact UTC timestamps enter the visible as-of prefix.

**Architecture:** Extend the existing isolated browser replay with an explicit `RECORDED` snapshot mode. The browser verifies account/symbol/timeframe, `canExecute=false`, immutable market-data digest, closed-bar cutoff and event provenance before replacing current replay state. The evidence inspector fetches only referenced event records with GET and passes the verified envelopes to the replay. Live candle replay remains separate; no simulation, fills, PnL reconstruction or order route is added.

**Tech Stack:** Existing ChartStudioReplay JavaScript, ChartStudio Beta evidence inspector, Playwright Chromium contract.

---

### Task 1: Prove as-of replay contract (RED)
- [x] Add failing Chromium cases for hash/scope/provenance checks, exact event-time reveal, cursor rewind, future-event rejection and frozen historical candles.
- [x] Assert GET-only/no-write behavior.

### Task 2: Implement frozen snapshot and event timeline
- [x] Verify snapshot envelope and SHA-256 before mutating replay state; filter bars whose close exceeds snapshot `asOfUtc`.
- [x] Verify referenced `RECORDED` DECISION/LIFECYCLE event envelopes and keep exact timestamps and referenced revisions.
- [x] Render only events at or before the visible candle's close; rewind hides later events and markers.
- [x] Add a read-only replay action to snapshot evidence rows, fetching only referenced IDs with exact account scope.

### Task 3: Verify and record boundaries
- [x] Run the replay Chromium smoke and related evidence UI tests plus `git diff --check`.
- [x] Update FR-028 in `docs/OPEN_TASKS.md`; keep Strategy Tester/backtests deferred and full EA-state/indicator recomputation open.
- [x] Commit and deploy on main; verify live via the four authorized demos without touching Blueberry or sending writes.

**Verification (2026-10-16):** Replay contract and Beta Chromium UI smokes passed. Both GitHub CI workflows passed for application commit `3775843573778a76914a2f9de5f5dc9d3fe39ec9`. The guarded `/stt` runtime and htown `main` checkout were verified at that commit. Live read-only chart acceptance passed for all four authorized demos: 150 XAU M15 bars per account, 57 GET requests, zero mutations, zero browser/API failures, and no Blueberry request.
