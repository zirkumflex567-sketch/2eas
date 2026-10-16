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
- [x] Verify the endpoint and inspector on the four authorized demos and deploy the exact Main revision; Blueberry remains excluded.

Current focused regression: 155 passed across MFE/MAE, lifecycle capture, evidence model and store tests; the NumPy-array compatibility regression also passes. `node --check` and `node scripts/smoke_chart_studio_beta.cjs` passed locally. On 2026-10-15, all four authorized demos returned `AVAILABLE` for OHLC and observed ticks: `titan` 28 bars / 464,781 returned ticks, `xau5m_m5` 51 / 353,839, `titan_m5` 15 / 82,275, and `xau5m_500` 36 / 236,403. A separate headless Chromium click-through rendered both OHLC and tick results in the `titan` inspector. All requests were GET; no Blueberry request or backtest occurred. Current Main/runtime commit is `ec8303c`; GitHub CI for this revision is still running.

## Verification result

Pure/API regression set at initial implementation: 148 passed. `node --check` passed for the beta UI and both smoke scripts; Chromium beta smoke passed. Live read-only GETs returned AVAILABLE on all four authorized demo accounts with 28, 51, 15 and 36 observed M15 bars respectively. No Blueberry request, MT5 mutation, or backtest. That initial Main and htown `/stt` deployment was `fbadc661`; the tick-observation extension and latest runtime identity are recorded above.


## Follow-up: independent tick evidence when OHLC bars are absent (16 Oct 2026)

The `xau5m_m5` demo had a valid, linked lifecycle and entry/exit snapshots, but its exit snapshot ended before entry, so no completed OHLC candle covered the position. Preserve `NO_COMPLETE_CANDLES` for OHLC and independently query bounded MT5 tick history only after the lifecycle and snapshot links pass validation. The endpoint may return `TICK_OBSERVED` beside OHLC `UNAVAILABLE`; tick coverage remains incomplete, `exact=false`, and `intrabarOrder=UNKNOWN`. Regression test: `test_position_mfe_mae_can_observe_ticks_when_no_complete_ohlc_candles_exist`. Focused MFE/lifecycle/spool tests: 83 passed. Live read-only demo result: 19,772 ticks on `xau5m_m5`, all four demos had tick observations, 68 GETs, no writes or Blueberry requests. This does not close partial-fill, full-position-ownership, hardware, or exact-tick acceptance.
