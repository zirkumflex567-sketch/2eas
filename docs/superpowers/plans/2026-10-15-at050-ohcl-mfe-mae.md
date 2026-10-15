# Read-only OHLC MFE/MAE estimates

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Advance FR-033 / AT-050 without a backtest by reporting favorable/adverse price excursion only where a verified demo position has exactly one broker `IN`, one broker `OUT`/`OUT_BY`, and linked immutable entry/exit snapshots with valid MT5 completed bars. Results are always labeled `OHLC_ESTIMATE` / `OBSERVED_BARS_ONLY`; no account-currency PnL, tick-exact claim, or inferred intrabar order is produced. Multiple legs, unbounded store history, invalid links, no complete interior candle, and store failures remain unavailable.

## Implementation

1. Add pure RED/GREEN tests for long/short direction, entry/exit boundary exclusion, `asOf`/hash/link integrity, one-entry/one-exit requirements, duplicates, partial/missing data, and unavailable states.
2. Implement a pure read-model function that computes price deltas from only full OHLC bars inside the broker fill interval. Return unavailable rather than estimate across unsupported legs or missing evidence.
3. Add an authenticated, account-scoped GET beneath the lifecycle evidence routes. Reuse EvidenceStore integrity validation and bounded position filters; no new append/write route or MT5 call.
4. Test authentication, unknown/funded account, scope isolation, no mutating HTTP methods, history limits, and store errors.
5. Add an inspector affordance with source, bar count, broker interval and explicit OHLC-estimate/coverage labels; test no writes and stale-account isolation.
6. Verify on the four authorized demo accounts read-only, update FR-033/AT-050 only to observed coverage, run CI, and deploy clean Main through the guarded local/hTown runtime. Blueberry and backtesting remain excluded.

## Acceptance

- Exact broker deal and immutable snapshot IDs remain the only provenance.
- Entry/exit edge candles are excluded unless they are fully within the position lifetime; completed broker candles only.
- MFE/MAE are price-distance estimates, never currency PnL, and make no claim about tick-level extrema or intrabar sequence.
- Any unsupported trade lifecycle or ambiguous coverage is `UNAVAILABLE` with a stable reason code.
- Only authenticated GET reads are added; no MT5 call or trade mutation is allowed.
