# FR-027 MT5 USD conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show USD-equivalent What-if risk/reward for non-USD accounts only when a unique, fresh, account-session MT5 FX quote supports a directionally correct conversion.

**Architecture:** Add a small pure conversion module that discovers FX pairs from broker currency metadata, filters to selected symbols, checks quote validity/freshness, and applies Bid/Ask conversion according to whether the amount is an asset or liability. `preview_scenario` will preserve broker PnL in account currency and attach conversion provenance; missing, ambiguous, stale, or invalid data will leave USD amounts unavailable.

**Tech Stack:** Python, MetaTrader5 read APIs, pytest.

---

## Scope and gates

- Covers FR-027 and AT-039 locally; account-currency PnL stays authoritative from `order_calc_profit`.
- Uses only `symbols_get`, symbol metadata, and `symbol_info_tick`; never selects symbols, writes orders, starts a terminal, or uses Strategy Tester.
- Requires one unique selected FX instrument whose metadata bridges account currency and USD. Ambiguous aliases fail closed.
- Quote time must be within 5 seconds of local UTC with at most 500 ms future skew; results disclose symbol, side, and quote timestamp.
- Live two-demo verification remains a separate required acceptance gate.

## Files

- Create `chart_studio/currency_conversion.py` for pure MT5 FX discovery and conversion.
- Modify `chart_studio/money.py` to attach converted risk/reward to the existing read-only scenario result.
- Test `tests/test_chart_studio_foundation.py` with deterministic fake metadata/ticks and explicit missing/stale/ambiguous cases.
- Update `docs/OPEN_TASKS.md` only with verified partial evidence; demo acceptance remains open.

## Steps

- [x] Add contract tests for direct/inverse pair direction, freshness, invalid amounts, ambiguity, and no USD conversion when the bridge is unavailable.
- [x] Run focused tests and observe the expected missing-module/API failure.
- [x] Implement bounded selected-symbol metadata discovery and signed amount conversion with explicit provenance; batch SL/TP using one quote snapshot.
- [x] Integrate without changing the existing account-currency PnL or `canExecute=false` contract; disclose conversion in the What-if result.
- [x] Run focused tests, full Python suite (`924 passed, 305 subtests`), beta Chromium UI smoke, Python/JS syntax checks, and `git diff --check`; inspect source and confirm the conversion path has no MT5 mutation calls.
- [x] Update FR-027/AT-039 with local contract evidence and explicit remaining two-demo/hardware/release gates.
- [ ] Commit only the feature, tests, plan, and ledger; leave generated visual artifacts unstaged.
