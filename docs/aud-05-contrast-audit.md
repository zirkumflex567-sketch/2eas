# AUD-05 contrast audit — 15 October 2026

## Result

The broker-free Chromium frontend suite passed **57 tests and 38 subtests in 308.27 seconds**. The scoped Axe `color-contrast` run found no violations in the dark, light, or Stone theme. Axe still reports 168 incomplete targets (6 dark, 3 light, 159 Stone); incomplete is not counted as a pass.

| Theme | Incomplete | Pixel measured | Unresolved | Non-text | Lowest measured ratio | Below 4.5:1 |
|---|---:|---:|---:|---:|---:|---:|
| Dark | 6 | 6 | 0 | 0 | 4.512:1 | 0 |
| Light | 3 | 3 | 0 | 0 | 4.512:1 | 0 |
| Stone | 159 | 147 | 7 | 5 | 5.730:1 | 0 |

The Stone journal-filter label was measured at 12.834:1 after adding a solid dark backing. The pixel audit uses the stricter project threshold of 4.5:1 for every text size.

## Measurement method

The test captures the target as rendered, with text fill hidden, and with magenta and green sentinel fills. It estimates glyph coverage from both sentinel images, reconstructs the original foreground at antialiased pixels, and compares it with the paired rendered background for each text fragment. It records per-target minima and rejects reconstructed pixels that do not match the computed foreground within tolerance. The regression tests cover currentColor pseudo backgrounds, high- and low-contrast gradients, a foreground-colored background strip, and synthetic 50% antialias coverage. Targets with unsupported paint effects, unstable geometry, or insufficient measurable glyph coverage remain unresolved.

The exact generated inventory is written to the ignored local file `output/audit-ui/axe-incomplete-pixel.json`; the source test is `tests/test_dashboard_frontend.py::DashboardFrontendTests::test_nonchart_contrast_all_themes`.

## Remaining acceptance

Seven Stone targets remain unresolved and keep AUD-05 partial:

- Four targets are within filtered/blended/transformed account-tab or crest content.
- Two targets produced no measurable glyph coverage (`#vp-summary-badge` and `.text-center.py-1\.5:nth-child(2)`).
- One target changed geometry while its text fill was hidden (`#time-german`).

The five `non-text` classifications are not asserted as text contrast passes. Human keyboard, screen-reader, touch, zoom/DPI, and target-hardware acceptance remain outstanding. This browser-only audit does not close those gates.

## Verification

- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py` — 57 passed, 38 subtests passed.
- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py -k nonchart_contrast_all_themes` — 1 passed, 3 theme subtests passed.
- `C:\Python314\python.exe -m pytest -q tests/test_dashboard_frontend.py -k "paired_pixel_probe or contrast_text_fill_probe"` — 3 passed.
