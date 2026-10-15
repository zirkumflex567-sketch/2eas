# Account-scoped chart symbol bootstrap

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Fix chart bootstrap/account switching so the dashboard requests candles, positions, and ChartStudio portfolio data for the selected account's configured broker symbol and timeframe. This covers the screenshot report where Blueberry's verified symbol is `XAUUSD.pi` but the initial chart asks for `XAUUSD` and receives 404. Preserve account isolation and the Blueberry challenge guard. No MT5 write, chart operation, preset/EA operation, or backtest.

## Implementation

- Set the main chart symbol/timeframe from the validated account catalog as part of account switch.
- Pass the account's preferred broker symbol through ChartStudio account switching so a stale previous symbol or generic `XAUUSD` preference cannot override the broker-configured symbol.
- Keep the subsequent broker-symbol selection mechanism usable; it may choose another catalog-verified symbol explicitly.
- Add a Playwright fixture with a suffixed configured symbol while an unsuffixed `XAUUSD` remains in the catalog, then verify chart title, scope label, actual candle request, and zero mutations.

## Verification

- Test first RED on symbol/scope mismatch, then GREEN after wiring both the app and broker panel.
- Run related verified-symbol and mismatch-clearing frontend regressions, ChartStudio beta Chromium smoke, full dashboard frontend suite, then the full non-backtest suite.
- Restart clean local `main` and verify `/stt` shares startup/disk revision and digest; read the configured candles endpoint. Use headless browser requests only; do not automate the desktop or any MT5 UI.

## Status

Implementation is in progress. Live browser rendering will be checked after the source is committed and the serving process is restarted. A user-visible hard refresh remains required to verify the user's own browser.
