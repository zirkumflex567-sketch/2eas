# FR-005 native v5 broker position zones

## Scope

Move the verified, read-only position snapshot from price-line-only overlays to native v5 price-scale geometry. Keep each hedged ticket distinct and include the broker's `marginMode` so a netting account remains clearly distinguished. Draw the entry-to-stop loss zone and entry-to-target profit zone per ticket, and label each ticket with side, lots, P/L and swap in the broker account currency. Show USD amounts only when the backend supplies a verified conversion; never infer a conversion in the browser. Preserve account/symbol/timeframe validation, clear overlays on scope changes/read failures, and keep the renderer disconnected from all write routes.

## Test-first delivery

1. Extend the Chromium adapter contract with multiple hedged tickets, a netting-mode snapshot, account-currency labels, verified USD values, unavailable conversion, missing stops/targets, invalid numeric values, and exact ticket preservation. Confirm it fails against the price-line-only adapter.
2. Add read-model coverage for USD account-currency conversion and non-USD conversion unavailable when the FX quote is missing or stale; confirm no broker write is called.
3. Implement the native position-zone primitive and immutable readback model. Keep legacy line-count behavior while reporting position/ticket and zone counts separately.
4. Pass account currency, margin mode, lots, P/L, swap, and optional verified USD conversion through the v5 preview bridge. Clear all data atomically on invalid snapshots and scope changes.
5. Build the production bundle, run the v5 adapter/preview and broker-read tests, then review the tracked diff. No EA or broker mutation is part of acceptance.

## Acceptance boundary

Local Chromium and broker-contract tests do not complete real-device or full MT5 chart acceptance. Broker conversions remain unavailable for foreign currencies unless the live MT5 snapshot contains a fresh, verified direct/inverse quote. The production v5 cutover remains gated by the broader v5 parity plan.
