# FR-035 Deal-Linked Decision Snapshot Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach only exact, already-recorded EA decision events to the immutable chart snapshot for the MT5 deal they actually produced, including when the decision import arrives after the first snapshot.

**Architecture:** Reuse the existing `SNAPSHOT.decisionEventIds` contract and private evidence-store revision chain. Search the finite UTC interval `[deal fill - 48 hours, deal fill]` for same-symbol decisions, then fetch the latest revision for each candidate ID. Accept either (1) `BROKER_RESULT` with exact deal and position tickets, or (2) Titan's recorded `ORDER_ATTEMPT` with outcome `PASS`, the exact MT5 order ticket in both broker ticket fields, and request/ack times no later than fill. Both paths also require same verified account/terminal, symbol, timeframe, and a decision time before fill. Zero or multiple exact candidates, incomplete (`hasMore`) queries, and out-of-window decisions remain unlinked/unknown. A matching event imported after the initial snapshot creates a new snapshot revision that supersedes the prior one; prior evidence stays immutable. No inferred strategy state, browser state, broker writes, or Blueberry reads.

**Tech Stack:** Python 3.14, FastAPI read-only evidence models/store, pytest.

## Files and boundaries

- Modify `chart_studio/broker_lifecycle_capture.py` to find exact matching decision refs and append a new immutable snapshot revision only when new refs arrive.
- Modify `tests/test_chart_studio_broker_lifecycle_capture.py` for exact-match, delayed-import/revision, duplicate, and bounded-query behavior.
- Modify `tests/test_chart_studio_evidence_store.py` only if a store-level regression is needed to prove a referenced decision event is validated and linked atomically.
- Update `docs/OPEN_TASKS.md` only after tests verify the behavior; leave other FR-035 gaps and manual MT5 attachment gates open.

## Task 1: Exact event association and immutable follow-up revision

- [x] Write RED tests showing exact `BROKER_RESULT` and Titan `ORDER_ATTEMPT` tickets link, while other deals/orders, positions, symbols, timeframes, stages, and post-fill events are not.
- [x] Write a RED poller test: first deal capture creates a DATA_ONLY snapshot without a not-yet-imported decision; a later poll finds the exact event and appends revision 2 superseding revision 1; another poll is idempotent.
- [x] Write RED tests that multiple exact candidates and a bounded query reporting `hasMore` do not guess or attach an incomplete candidate set.
- [x] Run only the new tests and confirm expected assertion failures before production changes.
- [x] Implement the smallest bounded lookup using the existing store `read` API and existing snapshot references. Use string-normalized ticket equality and the snapshot's verified account/terminal context. Do not index or log raw identities.
- [x] Build revisions from the prior stored snapshot so frozen bars, deal facts, and original `asOfUtc` never change; update only revision metadata, creation time, and exact decision references.
- [x] Run focused lifecycle-capture and evidence-store tests; run the full non-backtest Python suite.
- [x] Complete code-quality review, fix findings, and update `OPEN_TASKS.md` with the exact remaining FR-035 limits.
- [ ] Commit only reviewed source/tests/docs on `main`, push, allow both CI workflows to finish, and fast-forward hTown without restarting for documentation-only or non-runtime digest changes.

## Gates and non-goals

- Do not read Blueberry, place or alter trades, attach/reload EAs, or modify any terminal/chart files.
- A decision event must already exist in the same private store and be explicitly bound to the exact filled deal/position. No event means no association.
- This does not claim original drawing layers or historical recomputation of unrecorded indicators; those remain `UNKNOWN`/open.
- No Strategy Tester or strategy backtest work.
