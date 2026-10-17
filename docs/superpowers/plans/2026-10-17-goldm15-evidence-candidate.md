# GoldM15 Evidence Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, demo-identity-bound GoldM15 variant that records evaluated signal decisions and observational order-attempt results without changing the strategy's rules or trade submission expressions.

**Architecture:** A Python builder verifies a configured demo account, pinned checked-in source/include hashes, an explicitly supplied preset, and an isolated output path. It adds the shared bounded MQL5 spool to a generated copy, records already-computed closed-bar RSI signal values and outcomes, observes the existing order request/result, and flushes only on the existing timer. Quote UTC is derived from the account's configured broker offset while raw broker epoch and offset are retained as provenance. The ordinary source remains recorder-off; generated files stay under ignored `output/` and are never installed or attached by this package.

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

### Task 2: Order-attempt and broker-clock evidence

**Files:**
- Modify: `ChartStudioEvidenceSpool.mqh`
- Modify: `chart_studio/evidence_models.py`
- Modify: `scripts/build_goldm15_evidence.py`
- Modify: `scripts/build_titan_evidence.py`
- Modify: recorder contract tests

- [x] Add a failing schema test for explicit raw broker epoch/offset consistency and quote-before-request ordering.
- [x] Normalize GoldM15 and Titan candidate quote times from the configured broker offset and serialize raw broker time provenance.
- [x] Capture the existing GoldM15 buy/sell request's intended values and returned broker result without changing its conditions or request expressions.
- [x] Run the focused recorder/model regression (128 passed) and compile a fresh isolated GoldM15 candidate with MetaEditor 6230 (0 errors, 0 warnings; artifact remains under ignored `output/`).
- [ ] Install/attach on an authorized demo only after current chart identity is verified, then obtain and import fresh decision/order-attempt evidence. No funded account or Strategy Tester.
