# FR-010 individual price-level visibility

## Scope

Add account-local visibility toggles for the existing daily/weekly high, low, POC, VAH, and VAL chart levels. Keep server-computed prices authoritative, preserve the existing $35 weekly high/low autoscale guard, and keep labels in a scrollable, readable legend. No price or trade calculations change.

## Steps

- [x] Add frontend contracts for all ten level toggles, account-scoped preferences, session fallback when storage writes are unavailable, and level visibility controls.
- [x] Add daily/weekly VAH/VAL lines to the chart, wire accessible legend controls and local preference persistence, and preserve stale/account reset behavior.
- [x] Run focused frontend/theme tests (61 passed, 48 subtests), Node preference tests, Chromium smoke (including unavailable storage and keyboard focus), syntax and diff checks; independent review findings fixed and re-reviewed.
- [x] Update FR-010 and AT-022 evidence; native-v5 price-axis and real-hardware label acceptance remain open; commit the slice.

## Native v5 axis-label collision follow-up (20.10.2026)

- [x] Add a failing Chromium contract with ten tightly clustered broker market levels and clustered order Entry/SL/TP prices; prove the daily POC and protective-stop priorities, a 32 CSS-pixel gap, pane bounds, and retained line visibility/readbacks.
- [x] Keep all level and order lines visible while suppressing only colliding axis badges. Priority is protective SL, TP, Entry, daily/weekly POC, daily/weekly high/low, then value-area labels. The complete server-price legend and read-only positions panel retain the values when an axis badge is hidden.
- [x] Reflow on verified candle/price-range updates, wheel zoom, and host resize; the Chromium regression asserts layout revisions on host resize and changes the verified price range while checking pane bounds and the 32px collision margin. Avoid pointer/crosshair-triggered per-frame layouts; cancel the pending animation frame and disconnect the resize observer when the renderer is destroyed.
- [x] Verify `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build:production`, `node scripts/smoke_chart_studio_v5.cjs`, `node scripts/smoke_chart_studio_v5_preview.cjs`, and `git diff --check`. Fixture keeps v4 mounted and performs zero mutations.
- [ ] Live five-demo, production parity, physical touch/DPI, and target-hardware axis-label acceptance remain open.
