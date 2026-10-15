# FR-004/005/006 Canonical broker read-model wiring

## Goal
Make the ChartStudio broker UI consume the actual camelCase API models emitted by `chart_studio.broker_reads`, so verified MT5 positions, pending orders, chart overlays and stop-preview drafts work with live responses.

## Contract
- The backend JSON contract is authoritative (`priceOpen`, `priceCurrent`, `volumeCurrent`, `priceStoplimit`, `quoteTimeUtc`, etc.). UI code must not depend on the older snake_case browser-fixture shape.
- Validate account, exact broker symbol, `MT5_VERIFIED`, `canExecute: false`, ticket/revision, prices, quantities, enums, currency and timeframe before retaining broker rows.
- Render position and pending-order values using canonical fields; enable a stop-preview draft only for a fully valid verified position.
- Invalidate all retained rows when account, symbol or timeframe changes, and fail closed on any malformed row or read error.
- No broker mutation route, order send, EA/terminal modification, or Strategy Tester/backtest.

## Verification
- Change Chromium API fixtures to match the real response shape and assert the displayed position/order prices and amounts, verified position overlay state, and scope invalidation.
- Run the broker-read model tests and ChartStudio Chromium smoke, plus JavaScript/Python syntax and diff checks.
- Update FR-004/005/006 ledger wording only to match behavior proven by those tests.

## Steps
1. [x] Make the browser smoke serve only canonical broker fields and assert the live UI behavior; observe a failure.
2. [x] Update the broker panel and Beta overlay consumers to the canonical schema with strict fail-closed checks.
3. [x] Run focused verification and record exact evidence and remaining demo acceptance gates.
