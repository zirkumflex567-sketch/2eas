# AUD-16 automatic price-axis label reflow

## Goal

Prove that the Stone Chart FX canvas follows the pinned Lightweight Charts v4 plot when real price data widens axis labels, without reading generated library DOM.

## Scope

- Extend the isolated Chart Studio Chromium smoke with a large-price update that increases the public right price-scale width.
- Update the same candle/EMA data through the existing `StoneChartFX.update` path and assert the overlay canvas matches public time-/price-scale geometry within one CSS pixel.
- Restore fixture data before the remaining Chart Studio checks.
- Update the AUD-16 plan and `OPEN_TASKS.md` only after the regression passes. Physical hardware and Windows DPI acceptance remain open.

## Verification

Run the new Chromium regression first and observe its result. Then run `node scripts/smoke_chart_studio_beta.cjs`, `python -m pytest -q tests/test_stone_theme_contract.py`, and `git diff --check`. Do not use desktop automation, live/demo trades, production deployment, or backtests during this slice.

## Progress

- [x] Add and execute the automatic label-growth regression before changing production code.
- [x] The regression confirms the existing `StoneChartFX.update` event path follows the expanded public price scale; no production-code change was needed.
- [x] `node scripts/smoke_chart_studio_beta.cjs` passes, including actual price-label growth; `tests/test_stone_theme_contract.py` passes (12 tests, 10 subtests), JavaScript syntax and `git diff --check` pass. Physical hardware, Windows 150% DPI, and real target-device resize/timeframe acceptance remain open.
