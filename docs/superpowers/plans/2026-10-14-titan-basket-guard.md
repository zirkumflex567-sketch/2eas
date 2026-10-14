# Titan Basket Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separately compiled Titan Pro EA and optimizable setfile that limit the combined risk of correlated entries while allowing normal pullbacks and profitable runners.

**Architecture:** Copy the current Titan Pro into a new source file. Add basket-level entry risk checks, staged SL protection, confirmed M15 trend invalidation, hard basket loss, profit giveback, and re-entry cooldown. Preserve the original files and use a separate magic number so the experimental EA cannot manage the currently open trades.

**Tech Stack:** MQL5, MetaEditor64, pytest static contract checks, MT5 Strategy Tester when feasible.

---

### Task 1: Baseline and tests

**Files:**
- Create: `tests/test_titan_basket_guard_contract.py`

- [x] Record original source and binary hashes and confirm clean worktree.
- [x] Write failing tests for the new source, distinct magic, risk gate, exit checks, persistence, and setfile optimization ranges.
- [x] Run tests and confirm they fail because the new files are absent.

### Task 2: Separate EA and risk gate

**Files:**
- Create: `XAU_Titan_Pro_BasketGuard.mq5`

- [x] Copy source to a new file through `apply_patch` and change version, comment and default magic.
- [x] Add basket risk calculation at SL using `OrderCalcProfit`, with no entry if risk cannot be calculated.
- [x] Verify the proposed position's risk is within the basket budget immediately before each send attempt.

### Task 3: Managed exits

**Files:**
- Modify: `XAU_Titan_Pro_BasketGuard.mq5`

- [x] Add individual profit lock after a configurable profit threshold.
- [x] Add confirmed closed-bar M15 reversal exit and hard combined floating-loss exit.
- [x] Add basket peak-profit giveback exit with a configurable activation threshold.
- [x] Add a configurable cooldown and signal-reset gate after managed exits.
- [x] Check close/modify trade retcodes so failed orders are not logged as successful.

### Task 4: Optimizer profile and verification

**Files:**
- Create: `XAU_Titan_Pro_BasketGuard_Optimize.set`

- [x] Add valid MetaTrader optimization ranges around risk and exit parameters.
- [x] Run pytest contracts.
- [x] Compile the new MQ5 using MetaEditor and confirm 0 errors and 0 warnings.
- [x] Review all new files and verify original source and binary hashes unchanged.

Compilation and contract checks do not establish trading performance. The optimizer ranges are hypotheses to evaluate with realistic ticks and forward testing; no live account received this experimental EA.
