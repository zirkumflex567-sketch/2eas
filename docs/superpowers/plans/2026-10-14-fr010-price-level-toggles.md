# FR-010 individual price-level visibility

## Scope

Add account-local visibility toggles for the existing daily/weekly high, low, POC, VAH, and VAL chart levels. Keep server-computed prices authoritative, preserve the existing $35 weekly high/low autoscale guard, and keep labels in a scrollable, readable legend. No price or trade calculations change.

## Steps

- [x] Add frontend contracts for all ten level toggles, account-scoped preferences, session fallback when storage writes are unavailable, and level visibility controls.
- [x] Add daily/weekly VAH/VAL lines to the chart, wire accessible legend controls and local preference persistence, and preserve stale/account reset behavior.
- [x] Run focused frontend/theme tests (61 passed, 48 subtests), Node preference tests, Chromium smoke (including unavailable storage and keyboard focus), syntax and diff checks; independent review findings fixed and re-reviewed.
- [x] Update FR-010 and AT-022 evidence; native-v5 price-axis and real-hardware label acceptance remain open; commit the slice.
