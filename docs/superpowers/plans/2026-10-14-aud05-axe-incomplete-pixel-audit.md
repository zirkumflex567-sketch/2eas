# AUD-05 pixel checks for Axe contrast-incomplete text

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace scoped Axe `color-contrast` incomplete results with evidence-backed `measured`, `non-text`, or `unresolved` classifications across dark, light, and Stone themes. Never count unsupported text as a pass.

**Architecture:** Extend the existing broker-free Playwright fixture in `tests/test_dashboard_frontend.py`. Freeze each theme after fonts load and with reduced motion, no hover, caret, selection, or blinking decoration. Inventory all Axe-incomplete nodes in the scoped regions. `Range.getClientRects()` fragments are eligible only when their source is ordinary DOM text; generated pseudo text, SVG/canvas, text whose own opacity or any ancestor's opacity makes their combined opacity less than 1, and text affected by filter, blend, backdrop-filter, stroke, or unsupported alpha/gradient foreground are recorded as unresolved. For eligible fragments, collect computed foreground and sample the actual rendered background from paired screenshots. A text-fill-hidden screenshot preserves the background; two additional opaque sentinel fills (magenta and green) provide a glyph-coverage mask, so a foreground-colored background pixel cannot disappear from the mask. Keep computed `color`, opacity, paint order, pseudo styles, layout, shadows/decorations, and backgrounds intact. Use the sentinel difference to exclude unchanged shadows/decorations and exact opaque foreground matching to exclude antialiased edge pixels. Add regression fixtures for `background: currentColor`, visible pseudo text, opacity (expected unresolved), an ordinary known-color gradient, and a gradient strip identical to the foreground. Compute a minimum per fragment and per distinct background region, never an average. Treat 4.5:1 as the project's deliberately stricter target for all text (WCAG permits 3:1 for qualifying large text); label it accordingly. Any unsupported case stays unresolved and keeps AUD-05 open.

**Tech Stack:** Python unittest/pytest, Playwright Chromium, axe-core, Pillow.

---

## Files

- Modify `tests/test_dashboard_frontend.py`: extract scoped Axe-incomplete nodes for all themes, pixel-probe only supported rendered text/background pairs, report all other cases as unresolved with a reason, and assert the project's 4.5:1 target per fragment and background region.
- Modify `static/dashboard-accessibility.css` only if the new test demonstrates a real contrast failure.
- Modify `docs/OPEN_TASKS.md` and the AUD-05 report only after current measured results exist; keep hardware, assistive-technology, and touch acceptance open.

## TDD steps

1. Add tests for the glyph-only hiding method and known-color calculations; verify the fixture preserves a `currentColor` pseudo background and reports pseudo text as unsupported.
2. Inventory the real Axe-incomplete targets for all themes, with a reason for each non-text or unresolved classification.
3. Measure eligible fragments only when foreground alpha/opacity and background-region sampling are supported. Require enough interior glyph pixels; save target, computed foreground, source fragments, region minima, and unresolved reason in ignored `output/audit-ui/axe-incomplete-pixel.json`.
4. If a supported contrast assertion fails, adjust the smallest applicable accessibility token, keeping chart styles outside scope, then rerun to demonstrate RED→GREEN.
5. Run `python -m pytest -q tests/test_dashboard_frontend.py -k "contrast or keyboard or zoom"`, the complete `tests/test_dashboard_frontend.py`, and `git diff --check`. No Computer Use, broker API, MT5, or trade mutation.

## Acceptance boundary

Passing screenshots close only the automated contrast-incomplete cases represented in the fixture. Human screen-reader/keyboard, touch, target-device zoom/DPI, and hardware visual acceptance remain open until separately observed; Chromium does not stand in for those gates.
