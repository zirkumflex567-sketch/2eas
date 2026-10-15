# Account-scoped chart symbol bootstrap

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Fix chart bootstrap/account switching so the dashboard requests candles, positions, and ChartStudio portfolio data for the selected account's configured broker symbol and timeframe. This covers the screenshot report where Blueberry's verified symbol is `XAUUSD.pi` but the initial chart asks for `XAUUSD` and receives 404. Preserve account isolation and the Blueberry challenge guard. No MT5 write, chart operation, preset/EA operation, or backtest.

## Implementation

- Set the main chart symbol/timeframe from the validated account catalog as part of account switch.
- Pass the account's preferred broker symbol through ChartStudio account switching so a stale previous symbol or generic `XAUUSD` preference cannot override the broker-configured symbol. Defer the mount-time portfolio request until this verified symbol arrives.
- Preserve `Response.ok` through `accountFetch`; candle-scope validation depends on the HTTP status as well as account/symbol/timeframe provenance.
- Keep the subsequent broker-symbol selection mechanism usable; it may choose another catalog-verified symbol explicitly.
- Add a Playwright fixture with a suffixed configured symbol while an unsuffixed `XAUUSD` remains in the catalog, then verify chart title, scope label, actual candle request, and zero mutations.

## Verification

- Test first RED on symbol/scope and empty-series assertions, then GREEN after wiring the app, response status and broker panel.
- Run related verified-symbol and mismatch-clearing frontend regressions, ChartStudio beta Chromium smoke, full dashboard frontend suite, then the full non-backtest suite.
- Restart clean local `main` and verify `/stt` shares startup/disk revision and digest; read the configured candles endpoint. Use headless browser requests only; do not automate the desktop or any MT5 UI.

## Status

Implementation completed on `main` through commits `2453a43`, `942612d`, and `1b9499c`. The red/green bootstrap test asserts two candles in the chart series and no request using the wrong portfolio symbol. The ChartStudio Chromium smoke passed, and a headless live screenshot showed 149 MT5-verified candles plus the EMA overlays with no console errors. Local 8050 and htown `/stt` upstream 8055 share revision `1b9499c` and the same startup/disk digest; the configured feeds returned 149 candles for all five accounts. User-browser hard refresh is the only remaining visual check for this package. The broader OPEN_TASKS objective remains in progress.
