# SQLite workspace 1,000-drawing capacity plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align SQLite workspace validation and persistence with the already verified 1,000-native-drawing contract.

**Architecture:** Keep the existing strict schema-v1 validator and SQLite store. Raise the shared workspace drawing-count bound to 1,000 and the UTF-8 document bound to 512 KiB, matching the private v5 capacity envelope. Prove both a 1,000/1,001 count boundary and a near-limit document containing 1,000 fully configured Fibo drawings roundtrip through SQLite. Leave the production-v4 UI migration and target-hardware acceptance open.

**Tech Stack:** Python 3, unittest, SQLite workspace store.

---

### Task 1: SQLite capacity parity

**Files:**
- Modify: `tests/test_chart_studio_workspaces.py`
- Modify: `chart_studio/workspaces.py`
- Modify: `docs/OPEN_TASKS.md`
- Modify: this plan

- [x] Write a failing boundary test proving schema validation accepts and SQLite roundtrips 1,000 drawings but rejects 1,001.
- [x] Run the focused test and verify it fails only at the old 500-drawing cap.
- [x] Write a failing near-limit test proving 1,000 valid Fibonacci drawings with 32-character IDs, 40-character labels, 16 custom levels and maximum-price/near-maximum-time anchors fit the 512-KiB document budget and survive SQLite reload.
- [x] Run the focused test and verify it fails at the old 128-KiB document cap.
- [x] Raise the drawing cap to 1,000 and the UTF-8 document cap to 512 KiB; update the task ledger while preserving v4/hardware gaps.
- [x] Run the focused test, full workspace tests, relevant ChartStudio regression tests, and `git diff --check`.
- [x] Request independent review, fix findings, and commit only the verified source, test, plan, and ledger files.
