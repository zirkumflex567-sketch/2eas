# AUD-16 Chart FX pane geometry

## Goal

Remove the Chart FX overlay's dependency on Lightweight Charts' generated table/cell DOM. Place its canvas from the pinned production v4 chart's public time-scale and price-scale dimensions; continue mapping every market point through `timeToCoordinate` and `priceToCoordinate`.

## Files and contract

- `static/stone-chart-effects.js`: derive plot left/width from left price-scale width and time-scale width, and plot height from chart host height minus time-scale height. Fail closed on invalid geometry. Keep resize/range refresh behavior.
- `static/chart-studio-fixture.html` and `scripts/smoke_chart_studio_beta.cjs`: load the FX module in an isolated chart and compare canvas bounds to public API-derived plot bounds within one CSS pixel at 150% device scale.
- `tests/test_stone_theme_contract.py`: assert the production source contains no selectors for library-internal chart table/cell markup and uses the documented APIs.
- `chart_studio/README.md` and `docs/OPEN_TASKS.md`: mark only this code/browser slice partial; real hardware resize/scale acceptance remains open.

## Evidence sources

The bundled production chart reports Lightweight Charts 4.1.3. Official 4.1 docs expose `ITimeScaleApi.width()` and `height()` and `IPriceScaleApi.width()`. These APIs are version-matched to the bundle; no v5-only pane API is used.

## Verification

Observe the source-contract test fail first. Run the isolated Chromium chart smoke, the Stone theme Python tests and `git diff --check`. Do not use desktop automation, live/demo trades, production deployment or backtests.

## Progress

- [x] Source-contract test first failed against the table-cell selector, then passed after migration to documented v4.1 time-/price-scale measurements.
- [x] Chromium browser smoke verifies overlay bounds against time-/price-scale APIs within one CSS pixel at device scale 1.5; candle/EMA positioning remains series-coordinate based. All 11 Stone theme contract tests (10 subtests), Chromium geometry smoke at DPR 1.5 including resize/range change, JS syntax and `git diff --check` pass. Physical target-hardware resize/TF acceptance and dynamic price-axis label reflow remain open.
