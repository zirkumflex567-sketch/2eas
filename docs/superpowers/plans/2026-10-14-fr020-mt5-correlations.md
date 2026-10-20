# FR-020 aligned MT5 correlation snapshot

## Scope

Extend the read-only portfolio snapshot with a bounded, explicitly time-aligned correlation matrix from verified MT5 H1 bars. Include the proposed What-if symbol as well as currently held symbols. Use only completed bars and exact shared UTC timestamps; report `UNAVAILABLE` when there are too few symbols/bars, excessive symbols, invalid rates, or a history API failure. This is descriptive context only: do not infer hedging credit or modify the gross-additive stop-risk estimate.

## Files and contract

- `chart_studio/broker_reads.py`: fetch a bounded H1 history per distinct open-position symbol and the requested scenario symbol from start position 1; validate timestamps/positive closes; calculate Pearson correlations over aligned one-hour close-to-close returns. Cap symbols and bars; fail closed.
- `static/chart-studio-beta.js`: strictly validate and render pairwise correlations involving the selected scenario symbol. Keep scenario risk additive and state that the matrix is descriptive, not a hedge credit.
- `tests/test_chart_studio_broker_reads.py`: red/green contracts for scenario-symbol inclusion, alignment, current-bar exclusion, constant series, malformed/missing rates, caps and API absence.
- `scripts/smoke_chart_studio_beta.cjs`: render a verified pair and unavailable history through the account-scoped What-if UI.
- `docs/OPEN_TASKS.md`: update only FR-020's tested slice; demo acceptance remains open.

## Steps

1. Add failing tests with deterministic fake rates and strict UTC alignment.
2. Implement pure correlation calculation and bounded MT5 rate collection inside the existing verified account lock.
3. Validate response shapes in the UI and add a small accessible matrix to the portfolio card.
4. Run focused tests, beta Chromium smoke and `git diff --check`; review the lock/runtime budget and all unavailable paths.

## Limits

No Strategy Tester/backtest, no MT5 write operation, no deployment or EA change. MT5 history availability depends on terminal chart history and broker data; official `copy_rates_from_pos` semantics use index 0 for the current bar, so the request starts at index 1. The result does not establish causation or guarantee portfolio diversification.

## Progress

- [x] Added bounded completed-bar H1 correlations for up to 12 held/scenario symbols, exact timestamp alignment, one-hour intervals, a 60-return minimum and fail-closed history/series states. The What-if panel includes correlations to the proposed instrument, labels them descriptive and retains gross-additive risk. Verification: 144 broker-read tests and Chromium beta smoke pass; demo history remains unverified.
- [x] Live read-only verification on all five authorized demos using broker-confirmed EURUSD/EURUSD.p and the real Chart Studio UI: `titan`, `titan_m5`, `xau5m_500` rendered an H1 pair and observations; the two empty books correctly rendered `UNAVAILABLE/NO_SYMBOL_PAIRS`. Reproducible API and Chromium UI smokes pass with zero writes, browser errors, or Blueberry queries. Positive coverage is now proven on three demos; broader history/market coverage and hardware acceptance remain open.
