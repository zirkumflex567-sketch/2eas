# FR-008: Crosshair data window slice

## Goal

Show the hovered or pinned chart bar's timestamp and OHLC values from the loaded
primary chart series, with an explicit `Chart-Feed` source label. This is a
read-only beta slice; it does not claim the complete FR-008 indicator/spread
data window or native v5 sidebar.

## Plan

1. Add a Chromium contract for empty state, hover values, source label, pinning,
   and clearing the pin with Escape.
2. Add a compact accessible data-window panel to ChartStudioBeta and subscribe
   to Lightweight Charts crosshair events. Read only the primary candle
   series data supplied by the chart event; reject missing/non-finite OHLC.
3. Keep the displayed bar fixed after pinning; the accessible pin button or
   Escape clears the pinned bar and returns to hover behavior. Account/timeframe
   changes clear it.
4. Add verified Bid/Ask spread only after the existing quote route returns
   matching account/symbol, `MT5_VERIFIED`, `canExecute=false`, finite prices,
   UTC timestamp and freshness. Show freshness and broker age explicitly as of
   retrieval; invalid/error responses clear the quote display.
5. Run Chromium smoke, JS syntax checks, focused ChartStudio Python tests, and
   independent review. Keep FR-008 partial until indicator values and
   full v5/hardware acceptance are implemented.

## Progress

- [x] Browser contract failed before implementation because the data window did not exist.
- [x] Crosshair OHLC/time and accessible pin interaction work with explicit source.
- [x] Verified quote bid/ask spread, time and freshness render; bad provenance clears it.
- [x] Chromium smoke, Chart Studio foundation Python tests, syntax/diff checks pass for the quote extension.
- [ ] Independent review passes for the quote extension.
