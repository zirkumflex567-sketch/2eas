# GoldM15 Evidence Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, demo-identity-bound GoldM15 variant that records evaluated signal decisions without changing the strategy's rules or placing orders.

**Architecture:** A Python builder verifies a configured demo account, pinned checked-in source/include hashes, an explicitly supplied preset, and an isolated output path. It adds the shared bounded MQL5 spool to a generated copy, records already-computed closed-bar RSI signal values and outcomes, and flushes only on the existing timer. The ordinary source remains recorder-off; generated files stay under ignored `output/` and are never installed or attached by this package.

**Tech Stack:** Python, pytest, MQL5, MetaEditor 6230.

---

### Task 1: Transformation contract

**Files:**
- Create: `scripts/build_goldm15_evidence.py`
- Create: `tests/test_goldm15_evidence_build.py`
- Modify: `docs/OPEN_TASKS.md`

- [x] Write tests proving opt-in demo identity, parameter hash binding, decision capture from actual calculated RSI values, timer-only spool flush, preservation of signal/order expressions, and candidate output confinement.
- [x] Run focused tests and confirm they fail because the builder is absent.
- [x] Implement a deterministic source transformer and isolated output builder, reusing the established spool contract.
- [x] Compile the generated source with MetaEditor 6230 and inspect the generated diff against the original for unchanged trade gates and calls.
- [x] Record only source/build evidence in the ledger. Do not install, attach, trade, use Strategy Tester, or claim live captures.
