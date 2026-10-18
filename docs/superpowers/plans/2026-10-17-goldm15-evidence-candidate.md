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
- [x] Record source/build evidence in the ledger without claiming live captures. The first isolated package stayed uninstalled; after the user's explicit authorization to use every non-Blueberry demo, a fresh verified candidate was later copied into a new side-by-side Experts folder without replacing, attaching, or reloading the existing EA.

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
- [x] Compile the Titan `titan_m5` variant against its configured 500-dollar demo terminal/source/preset and place it under a separate `ChartStudioEvidence-titan_m5` Experts directory; the existing EA/chart was not replaced or reloaded.
- [x] Freshly compile and install the GoldM15 evidence candidate side-by-side in the explicitly allowed `goldm15` demo without touching the existing EA/chart. Verify manifest/EX5 SHA-256 and copied package bytes; do not attach until current chart/preset identity and a fresh quote are verified.
- [x] Extend the isolated candidate with a bounded in-memory order-ticket/position correlation ring. Accepted CTrade order tickets link each observed `TRADE_TRANSACTION_DEAL_ADD` (including separate partial fills) to its exact attempt/deal/position IDs; later SL/TP/volume changes are queued only for positions first observed from those linked deals. Handler code reads broker position fields and enqueues records; disk flush remains on the existing timer. Ordinary source and Buy/Sell expressions remain unchanged. The shared spool pin now matches the reviewed current-main helper after commit `4c3f8f5` added deal/position ticket fields.
- [x] Focused GoldM15/Titan builder and capture regressions: 47 passed. Refreshed isolated GoldM15 EX5 compiled with MetaEditor 6230 (0 errors, 0 warnings; artifact `b7a5ac28290dd0ecd9d35c78f3e9dcc16a8676786f8095cf94571d82d6a5f4f2`; manifest remains `NOT_INSTALLED`). No installation, chart attach/reload, demo trade, or backtest occurred.
- [x] Instrument the existing strategy `PositionClose(ticket)` call observationally: record its actual closing side, bid/ask intended price, live position volume, broker-time quote provenance, result/retcode and position ticket, then correlate any accepted order's deal transaction by the returned order ticket. The strategy call, close-intent reset logic and risk guard remain unchanged; unknown position fields stay absent instead of becoming zero-valued features. Expanded regressions: 230 builder/model/spool/store/lifecycle tests passed. MetaEditor 6230 compiled the refreshed isolated candidate (0 errors, 0 warnings; EX5 SHA-256 `721b2f67713e7b77e68d669cd5b35acd33dfd535ee75618dbda4a413b2a05268`; `NOT_INSTALLED`). No attach/reload, demo trade, or backtest occurred.
- [ ] Attach a candidate only after current chart identity is verified, then obtain and import fresh decision/order-attempt evidence. Titan remains `IDLE/NOT_RECORDED`; GoldM15 is `INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED`. The current Gold quote is stale. No funded account or Strategy Tester.
