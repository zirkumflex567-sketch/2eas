# Broker-symbol-scoped position stop draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Allow the existing read-only position SL/TP draft and broker preview on any exact, currently verified chart symbol, including broker gold symbols `XAUUSD.pi` and `XAUUSD.p`.

**Architecture:** Use the broker panel's verified symbol catalog and the selected position snapshot as the only source of symbol identity. Carry that exact symbol through symbol-info, chart draft scope, and preview request/response validation; retain the current ticket/revision binding and fail-closed no-commit contract. No account, symbol, EA, or trade mutation is added.

**Tech Stack:** Browser JavaScript, existing FastAPI `preview-stop` and `symbol-info` read paths, Playwright Chromium smoke, pytest.

---

## Scope and files

- `static/chart-studio-broker-panel.js`: remove the hard-coded XAUUSD draft gate; require current symbol catalog verification and exact row scope; use the captured symbol for metadata, overlay, preview request, and response validation.
- `scripts/smoke_chart_studio_beta.cjs`: add real UI contracts for `XAUUSD.pi` and `XAUUSD.p`, exact metadata/preview symbol propagation, and no write route.
- `tests/test_chart_studio_position_preview.py`: prove a broker-calculated preview on an exact suffixed gold symbol calls MT5 profit calculation with that symbol and stays read-only.
- `docs/OPEN_TASKS.md`, `chart_studio/README.md`: record the implemented exact-symbol behavior while retaining live-guard, demo, and hardware acceptance gates.

## Execution tasks

1. Add browser and backend regressions first; run them and confirm the UI fails specifically because of the hard-coded symbol restriction while the broker route proves it already supports exact symbols.
2. Implement exact-symbol propagation guarded by the active verified symbol and position row; reject symbol changes and stale responses.
3. Run the relevant position-preview backend suite, complete Beta Chromium smoke, JS syntax checks, and `git diff --check`.
4. Update the ledger and README with actual evidence and remaining acceptance gates.

## Acceptance boundaries

The preview remains authenticated, revision-bound, quote-fresh, and broker-calculated. Responses must retain `guard UNKNOWN`, `canExecute=false`, and `canCommit=false`. The change cannot call `order_send`, `order_check`, or any mutation route. Runtime chart identity, actual demo, target hardware, and write-release gates remain separate.

## Progress

- [x] Browser RED reproduced on `XAUUSD.pi`; backend proof confirms exact `XAUUSD.p` is broker-calculated read-only.
- [x] Exact-symbol implementation in the broker panel and Beta draft-scope validator.
- [x] Focused regressions pass: 69 position-preview tests, full Beta Chromium smoke, and broker-panel/Beta JS syntax checks.
- [x] Requirement ledger and README updated; demo, target hardware, and live guard remain explicitly open.
