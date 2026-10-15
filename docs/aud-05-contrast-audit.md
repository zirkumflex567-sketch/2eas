# AUD-05 contrast audit — 15 October 2026

## Result

The broker-free Chromium frontend suite passed **57 tests and 38 subtests in 269.13 seconds**. The scoped Axe `color-contrast` run found no violations in the dark, light, or Stone theme. Axe still reports 168 incomplete targets (6 dark, 3 light, 159 Stone); incomplete is not counted as a pass.

| Theme | Incomplete | Pixel measured | Unresolved | Non-text | Lowest measured ratio | Below 4.5:1 |
|---|---:|---:|---:|---:|---:|---:|
| Dark | 6 | 6 | 0 | 0 | 4.512:1 | 0 |
| Light | 3 | 3 | 0 | 0 | 4.512:1 | 0 |
| Stone | 159 | 146 | 8 | 5 | 4.600:1 | 0 |

The Stone journal-filter label, journal strategy badge, session label, live-position badge, and panel title now have measured ratios of 12.834:1, 8.665:1, 16.850:1, 8.433:1, and 16.617:1 respectively after adding solid dark backings where required. The lowest measured Stone text is a closed-trade timestamp at 4.600:1. The pixel audit uses the stricter project threshold of 4.5:1 for every text size.

## Measurement method

The test captures the target as rendered, with text fill hidden, and with magenta and green sentinel fills. It estimates glyph coverage from both sentinel images, reconstructs the original foreground at antialiased pixels, and compares it with the paired rendered background for each text fragment. It records per-target minima and rejects reconstructed pixels that do not match the computed foreground within tolerance. The regression tests cover currentColor pseudo backgrounds, high- and low-contrast gradients, a foreground-colored background strip, and synthetic 50% antialias coverage. Targets with unsupported paint effects, unstable geometry, or insufficient measurable glyph coverage remain unresolved.

The exact generated inventory is written to the ignored local file `output/audit-ui/axe-incomplete-pixel.json`; the source test is `tests/test_dashboard_frontend.py::DashboardFrontendTests::test_nonchart_contrast_all_themes`.

## Remaining acceptance

Eight Stone targets remain unresolved and keep AUD-05 partial:

- Four targets are within filtered/blended/transformed account-tab or crest content.
- Two targets changed geometry while their text fill was hidden (`#dd-pct` and a nested status label).
- Two targets produced no measurable glyph coverage (`#vp-summary-badge` and `#journal-total-pnl`).

The five `non-text` classifications are not asserted as text contrast passes. Human keyboard, screen-reader, touch, zoom/DPI, and target-hardware acceptance remain outstanding. This browser-only audit does not close those gates.

## Verification

- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py` — 57 passed, 38 subtests passed in 269.13 seconds.
- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py -k nonchart_contrast_all_themes` — 1 passed, 3 theme subtests passed.
- `C:\Python314\python.exe -m pytest -q tests/test_dashboard_frontend.py -k "paired_pixel_probe or contrast_text_fill_probe"` — 3 passed.
