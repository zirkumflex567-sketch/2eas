# AT-026 chart-feed failure visibility

## Goal

Make an independent chart-candle failure visible in the chart while preserving a fresh account/risk snapshot and any already-rendered candles. An empty but valid candle response must also explain why no chart data is shown.

## Scope and safety

- Modify only the dashboard chart UI and its broker-free frontend fixture.
- Render backend error details through `textContent`; do not interpret HTML.
- Keep the overlay non-interactive so chart gestures continue to work.
- Do not clear account status, disable valid account controls, change MT5 behavior, or send broker mutations for a candle-only failure.
- Do not touch MT5 terminals, EAs, presets, deployment, hardware checks, or Strategy Tester/backtests.

## Steps

1. Add a Playwright regression proving an HTTP 503 candle response is visible, account/risk data and loaded candles remain intact, and a later successful response clears the warning.
2. Run the test and observe the expected failure before implementation.
3. Add an accessible, chart-scoped loading/error/empty state and preserve the API's safe error detail.
4. Re-run the focused test and relevant chart frontend regression tests; verify there are no browser errors or mutation requests.
5. Update `OPEN_TASKS.md` with the evidence while keeping real-feed/demo acceptance open.

## Verification result

Implemented in `app.py` with broker-free coverage in `tests/test_dashboard_frontend.py`. The regression failed first because no chart status element existed; after the implementation, the focused chart/candle subset passed (16 tests, 13 subtests), then the four direct candle-failure/scope regressions passed (4 tests). The checks confirmed HTTP 503 details remain literal text, the warning is accessible and non-interactive, fresh account/risk data and existing candles survive, empty history is explained, retries clear the warning, and no mutation request occurs. Python compilation, inline dashboard JavaScript syntax, and `git diff --check` pass. Real MT5 outage, public `/stt`, demo, and hardware acceptance remain open.
