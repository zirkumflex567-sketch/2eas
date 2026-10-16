# FR-031 Execution Quality: Verified Fill, Spread and Cost Evidence

**Goal:** Add a read-only, provenance-backed view of execution quality from stored EA order attempts, MT5 quotes and broker lifecycle deals. Missing references remain unavailable; actual broker cash costs stay separate from calculated spread/slippage estimates.

**Scope and gates:** No order APIs, terminal mutations, Strategy Tester or backtests. Blueberry is excluded from demo reads. Marketplace EAs without source must remain `UNAVAILABLE` where intent/quote evidence is absent. P1 live UI remains behind the existing read-only evidence authorization; this work does not enable broker writes.

## Vertical slice

1. Add a pure Python analyzer for validated order-attempt events, quote snapshots and lifecycle deals. Match only by exact account, symbol and broker order ticket / stable `orderAttemptId`; never match by nearest timestamp or price.
2. Require event-time quote and intended price to calculate spread and signed adverse slippage. Use the broker deal's BUY/SELL transaction side for sign direction. Group partial fills by order ticket and calculate volume-weighted fill; calculate monetary slippage only when verified tick value/contract data is present.
3. Sum commission, fee, swap and broker profit once from matched entry deal rows, labeled `MATCHED_ENTRY_DEALS`; this is not full-position net PnL because exit deal cash is outside this execution view. Do not add spread/slippage estimates into the cash subtotal. Report latency unavailable unless a distinct broker acknowledgment timestamp is recorded.
4. Add a read-only, account-scoped API that joins recorded order attempts and deals from the evidence store and emits per-order rows plus sample-gated aggregates. Challenge-account access remains excluded from demo analytics; absent historical quote/intent data is explicitly unavailable.
5. Add a Chart Studio read-only inspector view with per-order evidence and sample counts. Keep mismatched account/symbol/tickets, partial history and absent quotes as `UNKNOWN`/`UNAVAILABLE`.
6. Instrument supported source EAs only after contract tests prove telemetry is observational and failure-isolated. No binary is installed or chart EA reloaded as part of this slice; Marketplace EX5 remains unsupported for intent telemetry.

## Acceptance

- Tests cover BUY and SELL adverse/favorable signs, spread exactly once, partial-fill VWAP, cash cost separation, exact stable-ID matches, duplicate fees, stale/missing quote, absent intended price, cross-account mismatch, malformed revisions and minimum sample gates.
- API returns `canExecute=false`; there are no non-GET execution-quality requests or trade mutations.
- Four authorized non-Blueberry demo feeds can be read without using live quotes as historical intended-price references.
- All existing evidence contracts, Python tests (with the local optional spool variable unset), beta Chromium smoke, syntax checks and CI are run. Hardware and any EA reattachment remain separately gated.
