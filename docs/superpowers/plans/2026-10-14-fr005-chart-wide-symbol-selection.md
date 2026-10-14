# FR-005/018 chart-wide broker symbol selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the verified Broker-Symbol selector choose the actual live-read chart symbol, with account-safe MT5 candles and symbol-scoped ChartStudio state.

**Architecture:** Reuse the read-only MT5 symbol catalog as the allowlist and pass its selected symbol through the existing account-scoped candle polling path. A symbol change clears prior chart data and broker overlays before loading; stale requests are discarded. Strategy signal markers and What-if/SLTP drafts stay limited to XAUUSD until their models explicitly support other instruments.

**Tech Stack:** FastAPI, account_gateway scoped MT5 session, browser JavaScript, Playwright and pytest.

---

## Files

- `app.py`: validate the requested symbol with `chart_studio.read_api.require_symbol` inside the existing `@scoped(mt5)` gateway; return account/symbol/timeframe/source provenance and candles, EMA series, and price levels using that symbol's `digits`; track symbol in polling and title.
- `static/chart-studio-broker-panel.js`: notify ChartStudio when the verified symbol selection changes; accept broker position/deal overlays only when account, symbol, timeframe, and provenance match the current chart, and clear them on switch/error.
- `static/chart-studio-beta.js`: add exact account/symbol/timeframe keys for drawings/options/layouts and overlays, invalidate stale context on switch, expose a chart-symbol callback, and preserve the existing XAUUSD localStorage keys/data when generalizing them.
- `static/stone-chart-effects.js`: clear retained FX candles and EMA paths when a scoped update intentionally contains no candles.
- `tests/test_backend_audit.py`: verify the endpoint uses requested symbol, rejects missing symbols, preserves account scope, formats OHLC/EMA/SR values to the requested symbol's precision, and emits no non-XAU strategy signals.
- `tests/test_dashboard_frontend.py`: verify selecting a broker symbol changes the candle request and chart title; response account/symbol/timeframe/source mismatch is rejected; prior candles/indicators/markers/SR/FX clear before reload; symbol-scoped state isolates data while preserving legacy XAUUSD state; and no write request is sent.
- `scripts/smoke_chart_studio_beta.cjs`: verify chart state/layout scope isolation and symbol-matched broker marker acceptance.
- `docs/OPEN_TASKS.md`: mark only this delivered slice; retain mobile, multi-chart, native v5, demo and other instrument acceptance gaps.
- `docs/superpowers/plans/2026-10-14-fr005-chart-wide-symbol-selection.md`: this plan and its actual progress.

## Tasks

### Task 1: Backend contract
- [x] Add failing tests for an exact requested MT5 symbol, returned symbol provenance, digits-aware prices, missing-symbol refusal, and suppression of account strategy markers on non-XAU symbols.
- [x] Run those tests and confirm they fail for the expected missing contract: the endpoint ignores `symbol`, omits returned symbol provenance, and accepts unknown symbols (2 expected failures).
- [x] Implement the validated symbol read in the existing scoped route; do not call `symbol_select`, initialization outside the gateway, or any write API.
- [x] Run focused backend tests, including digits-aware candle/EMA/SR precision and invalid timeframe refusal; broker `order_send` remains untouched.

### Task 2: Browser integration and isolation
- [x] Add failing full-dashboard browser assertions for changing the selected symbol, mismatched candle-response rejection, chart clearing/title update, symbol-scoped drawings/layouts and no mutations. A delayed out-of-order candle response remains untested.
- [x] Implement symbol propagation from the verified selector through Beta to the dashboard candle poll. Use a generation key covering account, symbol and timeframe.
- [x] Broker positions/deals carry no timeframe, so capture account/symbol/timeframe when their request starts and verify the same scope is current before applying responses; candles must return and match all three.
- [x] Keep XAU-specific scenario/preview controls explicitly XAUUSD-only and suppress strategy markers for other symbols. Clear stale candles, EMAs, SR lines, chart markers, quotes, FX/celebration state, and broker overlays before a new symbol request; require account, symbol, timeframe, and read provenance to match its response.
- [x] Run dashboard and Beta Chromium smokes plus syntax and diff checks.

### Task 3: Ledger and review
- [x] Update only the evidenced partial slice in FR-004/FR-005 and AT-031/033. Keep AT-008/009/021 open; AT-018–021, demo, hardware and v5 acceptance remain open.
- [x] Request an independent review, fix findings, rerun affected checks, and confirm review closure.
- [x] Commit only the planned files with a focused message.

## Acceptance limits

This does not add multi-chart linking, all-symbol SL/TP writes, or demo acceptance. The only chart price source remains the selected verified MT5 feed. Backtesting/Strategy Tester work remains deferred.
