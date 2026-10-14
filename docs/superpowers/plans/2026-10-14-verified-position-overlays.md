# Verified broker position overlays implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Draw open-position entry/SL/TP zones from the current account's verified MT5 position snapshot, with correct side, hedging/netting mode and account-currency context.

**Architecture:** `ChartStudioBrokerPanel` is the only source for this chart overlay. It sends a positions envelope to `ChartStudioBeta` only after checking account, XAUUSD symbol, `MT5_VERIFIED`, and `canExecute=false`. The chart validates ticket, revision, side and finite positive prices, then renders every returned position separately. Labels use actual broker profit and swap with the verified account currency; there is no USD conversion or contract-size estimate. Refresh start, errors, account changes and invalid provenance clear the overlay. Pending orders remain separate and are not drawn as positions.

**Tech Stack:** Existing verified `/api/chart/v1/positions` route, ChartStudio beta canvas overlay, Chromium smoke.

## Files

- Modify `static/chart-studio-broker-panel.js` to pass the validated response envelope to the chart and clear it on read errors or scope changes.
- Modify `static/chart-studio-beta.js` to validate/store verified position rows and render side/ticket/open price/SL/TP zones plus broker P/L, swap, currency and margin-mode label.
- Modify `scripts/smoke_chart_studio_beta.cjs` to prove verified-only overlays, hedging/netting label, multi-position separation, non-USD currency preservation, stale/error clearing and no broker writes.
- Update `chart_studio/README.md` and `docs/OPEN_TASKS.md` with implemented scope and remaining native v5/hardware/USD-conversion acceptance.

## TDD steps

1. Add browser contracts for the absence of approximate status-derived overlays and strict `MT5_VERIFIED` account/symbol/scope validation; observe failure before implementation.
2. Pass the successful broker positions envelope to the chart, preserving each ticket and revision. Clear chart data before an in-flight refresh and on any read/provenance error.
3. Draw each verified BUY/SELL entry separately with its SL/TP zones. Label real broker P/L and swap in the envelope currency, and map only known margin modes (`NETTING`, `EXCHANGE`, `HEDGING`); unknown values remain unavailable. Never label a value USD unless the verified currency is USD.
4. Test empty/multiple positions, malformed rows, wrong-account response, non-USD currency, hedging and netting modes, refresh/error clearing, account isolation and the no-write boundary.
5. Run Chromium smoke and broker-read/chart regressions; independently review the change and keep FR-005/AT-010 partial until live scope and target presentation acceptance are proven.

## Acceptance boundaries

Only the existing fixed XAUUSD broker-read scope is covered. No position lifecycle reconstruction, cross-symbol USD conversion, trading controls or broker writes are added. Full symbol selection, Lightweight Charts v5 parity and target hardware/theme/DPI acceptance remain open.

## Progress

- [x] Browser contract observed failing before implementation (the state API had no verified-position snapshot).
- [x] Only verified broker snapshot drives the overlay; malformed scope clears it.
- [x] Zones and labels carry broker side, ticket, Lots, P/L, swap, currency, source and margin-mode context.
- [x] Chromium beta smoke and 201 broker-read/position-preview Python regressions pass; stale account responses cannot replace the current snapshot.
- [x] Independent review has no findings after fixing row-level account/source/canExecute validation; hardware/v5/FX acceptance remains outside this package.
