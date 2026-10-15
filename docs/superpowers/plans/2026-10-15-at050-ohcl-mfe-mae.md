# Read-only OHLC MFE/MAE estimates

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Advance FR-033 / AT-050 without a backtest by reporting favorable/adverse price excursion only where a verified demo position has exactly one broker `IN`, one broker `OUT`/`OUT_BY`, and linked immutable entry/exit snapshots with valid MT5 completed bars. Results are always labeled `OHLC_ESTIMATE` / `OBSERVED_BARS_ONLY`; no account-currency PnL, tick-exact claim, or inferred intrabar order is produced. Multiple legs, unbounded store history, invalid links, no complete interior candle, and store failures remain unavailable.

## Implementation

1. [x] Add pure RED/GREEN tests for long/short direction, entry/exit boundary exclusion, `asOf`/hash/link integrity, one-entry/one-exit requirements, duplicates, partial/missing data, and unavailable states.
2. [x] Implement a pure read-model function that computes price deltas from only full OHLC bars inside the broker fill interval. Return unavailable rather than estimate across unsupported legs or missing evidence.
3. [x] Add an authenticated, account-scoped GET beneath the lifecycle evidence routes. Reuse EvidenceStore integrity validation and bounded position filters; no new append/write route or MT5 call.
4. [x] Test authentication, unknown/funded account, scope isolation, no mutating HTTP methods, history limits, and store errors.
5. [x] Add an inspector affordance with source, bar count, broker interval and explicit OHLC-estimate/coverage labels; test no writes and stale-account isolation.
6. [x] Verify four authorized demo accounts read-only, update FR-033/AT-050 to observed coverage, and deploy clean Main through the guarded local/hTown runtime. GitHub CI and independent hardware acceptance remain open. Blueberry and backtesting remain excluded.

## Acceptance

- Exact broker deal and immutable snapshot IDs remain the only provenance.
- Entry/exit edge candles are excluded unless they are fully within the position lifetime; completed broker candles only.
- MFE/MAE are price-distance estimates, never currency PnL, and make no claim about tick-level extrema or intrabar sequence.
- Any unsupported trade lifecycle or ambiguous coverage is `UNAVAILABLE` with a stable reason code.
- Only authenticated GET reads are added; no MT5 call or trade mutation is allowed.

## Tick observation extension

The authenticated inspector may additionally request `COPY_TICKS_INFO` from the already-configured, verified demo terminal for the exact lifecycle interval (maximum seven days, 1,000,000 rows). Use UTC datetimes. Compare long positions against returned Bid quotes and short positions against returned Ask quotes. Fill-millisecond edges are excluded because same-millisecond ordering is ambiguous. Label output `TICK_OBSERVED`, `MT5_RETURNED_TICKS_ONLY`, and `exact=false`: terminal history does not attest that every market tick was delivered. Keep the OHLC estimate independent and visible if tick history is unavailable. No history reconstruction is called exact.

- [x] Add TDD coverage for long/short executable quote sides, fill-edge exclusion, malformed order/quotes, request scope, and funded-account denial.
- [x] Implement bounded read-only MT5 tick retrieval and a separate observed-tick result while preserving the OHLC estimate.
- [x] Add explicit UI labels that distinguish observed terminal ticks from complete/tick-exact data.
- [ ] Verify the endpoint on the four authorized demos and deploy the exact Main revision; Blueberry remains excluded.

Current focused regression: 153 passed across MFE/MAE, lifecycle capture, evidence model and store tests. `node --check` and `node scripts/smoke_chart_studio_beta.cjs` passed. Live tick availability and resulting Main deployment are pending.

## Verification result

Pure/API regression set: 148 passed. `node --check` passed for the beta UI and both smoke scripts; Chromium beta smoke passed. Live read-only GETs returned AVAILABLE on all four authorized demo accounts with 28, 51, 15 and 36 observed M15 bars respectively. No Blueberry request, MT5 mutation, or backtest. Main and the htown `/stt` upstream are on `fbadc661`; local and SSH runtime identities agree and report clean source with no restart required.
