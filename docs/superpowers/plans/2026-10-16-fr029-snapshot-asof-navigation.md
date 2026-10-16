# FR-029 Snapshot-to-MTF as-of navigation plan

> **For agentic workers:** use this plan task-by-task; keep the Strategy Tester and backtests deferred.

**Goal:** Let a user open a recorded trade snapshot and calculate the existing read-only five-frame MTF context at that snapshot's UTC fill time.

**Architecture:** Add a small action to recorded snapshot cards that validates current account/symbol scope and calls the mounted MTF panel with the snapshot `asOfUtc`. The panel issues the existing five bounded `/api/candles` GETs, calculates only bars closed at that exact timestamp, and labels the historical cut-off. No new endpoint, inference, or broker mutation is introduced.

### Task 1: Prove behavior (RED)
- [x] Add Chromium coverage for snapshot navigation, exact UTC as-of, all five frame reads, same-account/symbol checks, future-bar exclusion, and GET-only behavior.

### Task 2: Implement the historical MTF action
- [x] Add a recorded-snapshot action and reject stale account/symbol scope.
- [x] Add exact-as-of refresh to the mounted MTF panel, retaining its normal strict source and cancellation checks.
- [x] Expose the narrow action through ChartStudioBeta; do not expose mutable panel internals.

- [x] Run MTF contract, Beta Chromium smoke, and `git diff --check`.
- [x] Update FR-029 to distinguish snapshot navigation from remaining Decision import, EA-specific rules, authoritative coverage, full AT-041/042, and hardware acceptance.
- [x] Commit/push main, update htown and the guarded runtime, and verify read-only across authorized demo accounts with Blueberry excluded.

**Live acceptance (2026-10-16):** `node scripts/smoke_live_snapshot_history.cjs` passed for `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`. Each snapshot requested exactly D1/H4/H1/M15/M5 for its own account and XAUUSD symbol at the snapshot UTC cutoff; the test observed no writes and made no Blueberry request. It also checked that every displayed source candle time was no later than the recorded fill. The feeds returned `UNKNOWN · DATA_GAP`; missing history is not promoted to a valid confluence result. The current `main` revision was pulled to htown and the guarded local dashboard runtime restarted with matching source revision/digest and `restart_required=false`. CI for the feature commit is still running.
