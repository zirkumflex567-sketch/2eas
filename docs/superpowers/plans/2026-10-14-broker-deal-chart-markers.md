# Broker deal markers on the chart implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Plot only verified MT5 execution deals from the currently selected account on the ChartStudio beta chart, so a broker deal can be located at its recorded fill time and price.

**Architecture:** The broker read panel retains only deals from an explicitly validated `MT5_VERIFIED`, `canExecute=false`, current-account/current-symbol response. It passes a bounded page of validated execution records to a small public method on `ChartStudioBeta`. It retains exact `fillTime.utcEpochMs` provenance and converts milliseconds to UTC epoch seconds only for chart-coordinate lookup. The chart renders read-only markers in its existing canvas overlay at the exact broker fill time and price; account changes clear them. It never snaps fills to neighboring bars. Deals with no exact time-axis coordinate, including fills outside loaded candles or between available bars, stay in the broker table and increment a visible unplotted-marker count. Marker labels include both broker side and entry type (`BUY IN`, `SELL OUT`, `BUY INOUT`, etc.). No position lifecycle is inferred from multiple deals and marker events are never submitted as trades. Marker scope remains the current broker panel page/date/filter, not a claim of complete historical coverage.

**Tech Stack:** Existing FastAPI deal-read endpoint, browser JavaScript, ChartStudio beta canvas overlay, Playwright smoke.

## Files

- Modify `static/chart-studio-broker-panel.js` to validate and publish the current response’s executed deal markers and clear them on scope change/error.
- Modify `static/chart-studio-beta.js` to store account-scoped read-only markers, render them at their exact UTC fill timestamp and broker price, and clear on account change.
- Modify `scripts/smoke_chart_studio_beta.cjs` to assert exact fill-time/price rendering data, account isolation, exclusion of omitted/non-execution records, failed/stale response clearing, and zero broker writes.
- Update `chart_studio/README.md`, `docs/OPEN_TASKS.md`, and this plan with coverage limits and acceptance status.

## TDD steps

1. Add browser contracts proving marker delivery is absent before the API exists, then specify exact validated broker-deal input and current account scope.
2. Implement strict boundary validation: response account/symbol/provenance, executed BUY/SELL deal, explicit IN/OUT/INOUT/OUT_BY, finite positive price, and valid millisecond UTC timestamp. Preserve milliseconds while testing that chart coordinate lookup receives UTC seconds. Omitted categories and unknown status never become chart markers.
3. Render exact-coordinate markers without mutating chart series or broker state. Skip and visibly count null/out-of-range/unrepresented time coordinates; never snap to another candle. Include side and entry type in marker labels. Clear on account switch and failed/invalid history responses; ignore late responses using existing generation token.
4. Run beta browser smoke plus broker-read and chart regression suites; independent review; fix findings.
5. Update the ledger as partial only. Full position reconstruction, all-history completeness, hardware/DPI, and live/demo acceptance remain open.

## Acceptance boundaries

Markers represent individual broker fills, not EA signal/setup markers or reconstructed positions. `INOUT` and `OUT_BY` remain labeled exactly as broker deal entries; partial fills remain separate deals. Only the currently loaded broker page/range is shown. No synthetic candles, fills, lifecycle links, or MT5 writes are introduced.

## Progress

- [x] Plan independently reviewed.
- [x] Browser contract observed failing before implementation.
- [x] Markers implemented and tested across account/error races.
- [x] Independent code review passed; FR-004/AT-049 remain partial until full lifecycle/history acceptance.
