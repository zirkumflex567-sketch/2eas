# AUD-05 contrast audit — 15 October 2026

## Follow-up — 17 October 2026

The updated broker-free Chromium frontend suite passed **77 tests and 41 subtests in 233.73 seconds**. The latest scoped Axe run found zero `color-contrast` violations and 170 incomplete targets (6 dark, 3 light, 161 Stone). The updated pixel audit measured 5/6 dark, 2/3 light, and 152/161 Stone targets; it classified one dark, one light, and six Stone targets as non-text, leaving zero unresolved in dark/light and three unresolved in Stone. Lowest measured ratios were 7.563:1 (dark), 10.355:1 (light), and 5.483:1 (Stone). No measured text fell below the project threshold of 4.5:1.

The selected Stone account tab previously put the account name over a bright section of its selected border image; the pixel probe measured only **1.01:1**. The selected-tab name now has the same solid, dark label backing as the other account labels. The account-tab drop-shadow filter was removed; the selected state keeps its existing box-shadow. The current audit measures the selected Titan name at 16.850:1, its connection badge at 10.743:1, and the account subtitle at 11.920:1. Decorative crest text already carries `aria-hidden="true"`; the audit now correctly classifies that content as non-text instead of trying to measure it as accessible text.

An additional local live-dashboard read-only smoke selected the Stone theme on the explicit `titan` deep link. The real DOM reported the same Titan-name ratio (16.850:1), `filter:none`, and the existing selected-state box-shadow. It generated 17 API GETs, zero mutations, zero browser errors, and zero Blueberry requests. The screenshot is `output/audit-ui/titan-selected-account-label-after.png`; this is a local pre-deployment check, not htown acceptance.

Three Stone targets remain unresolved because the pixel probe has insufficient glyph coverage: `#vp-tab-daily`, `#vp-tab-weekly`, and `#vp-summary-badge`. Their styles and visible text were inspected, but no contrast pass is claimed for these targets. Human keyboard, screen-reader, touch, zoom/DPI, and target-hardware acceptance remain open.

Verification on 17 October:

- `C:\Python314\python.exe -m pytest tests/test_dashboard_frontend.py -q` — 77 passed, 41 subtests passed in 233.73 seconds.
- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py -k nonchart_contrast_all_themes` — 1 passed, 3 theme subtests passed in 89.26 seconds.
- Targeted active-account/ARIA-hidden probe tests — 2 passed, 3 subtests passed.

## Result

The corrected broker-free Chromium frontend suite passed **59 tests and 38 subtests in 282.99 seconds**. The corrected probe now masks both `color` and `-webkit-text-fill-color` in its hidden and sentinel captures, avoiding a false low-contrast result when a row combines a muted label with a green PnL value. The targeted mixed-color Stone value measures 11.09:1. The scoped Axe `color-contrast` run found no violations in the dark, light, or Stone theme. Axe still reports 168 incomplete targets (6 dark, 3 light, 159 Stone); incomplete is not counted as a pass.

| Theme | Incomplete | Pixel measured | Unresolved | Non-text | Lowest measured ratio | Below 4.5:1 |
|---|---:|---:|---:|---:|---:|---:|
| Dark | 6 | 6 | 0 | 0 | 4.512:1 | 0 |
| Light | 3 | 3 | 0 | 0 | 4.512:1 | 0 |
| Stone | 159 | 147 | 7 | 5 | 6.460:1 | 0 |

The Stone journal-filter label, journal strategy badge, session label, live-position badge, and panel title now have measured ratios of 12.834:1, 8.665:1, 16.850:1, 8.433:1, and 16.617:1 respectively after adding solid dark backings where required. The lowest measured Stone text is the purple status badge at 6.460:1. The pixel audit uses the stricter project threshold of 4.5:1 for every text size.

## Measurement method

The test captures the target as rendered, with text fill hidden, and with magenta and green sentinel fills. It estimates glyph coverage from both sentinel images, reconstructs the original foreground at antialiased pixels, and compares it with the paired rendered background for each text fragment. It records per-target minima and rejects reconstructed pixels that do not match the computed foreground within tolerance. The regression tests cover currentColor pseudo backgrounds, high- and low-contrast gradients, a foreground-colored background strip, and synthetic 50% antialias coverage. Targets with unsupported paint effects, unstable geometry, or insufficient measurable glyph coverage remain unresolved.

The exact generated inventory is written to the ignored local file `output/audit-ui/axe-incomplete-pixel.json`; the source test is `tests/test_dashboard_frontend.py::DashboardFrontendTests::test_nonchart_contrast_all_themes`.

## Remaining acceptance

Seven Stone targets remain unresolved and keep AUD-05 partial:

- Four targets involve filtered, blended, or transformed account-tab/crest content.
- Two targets changed geometry while their text fill was hidden.
- One target produced no reliable measurable glyph coverage.

The five `non-text` classifications are not asserted as text contrast passes. Human keyboard, screen-reader, touch, zoom/DPI, and target-hardware acceptance remain outstanding. This browser-only audit does not close those gates.

## Verification

- `C:\Python314\python.exe -m pytest tests/test_dashboard_frontend.py -q` — 59 passed, 38 subtests passed in 282.99 seconds.
- `C:\Python314\python.exe -m pytest -vv -x tests/test_dashboard_frontend.py -k nonchart_contrast_all_themes` — 1 passed, 3 theme subtests passed.
- `C:\Python314\python.exe -m pytest -q tests/test_dashboard_frontend.py -k "paired_pixel_probe or contrast_text_fill_probe"` — 3 passed.
