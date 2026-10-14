# AT-025 production Beta combined-capacity evidence plan

**Goal:** Verify that the production ChartStudio Beta can hold the AT-025 workload concurrently: 5,000 bars, 20 configurable indicator instances across overlays and panes, and 1,000 drawings.

**Scope:** Add a deterministic browser acceptance smoke and update the measured-evidence ledger. Keep hardware FPS, completed-frame latency, heap/CPU endurance and v5 production migration explicitly open.

**Contract:** One Beta Chromium fixture loads 5,000 valid bars, activates 16 configured moving-average overlays plus four independent oscillator panes, and imports/lists 1,000 drawings. The chart's three built-in EMA overlays are switched off for the exact 20-instance count.

**Files:** `scripts/smoke_chart_studio_objects.cjs`, `docs/AT025_CHROMIUM_CAPACITY_2026-10-14.md`, `docs/OPEN_TASKS.md`, this plan.

## Verification

- [x] Extend the Chromium smoke to create the exact combined workload and verify all requested counts.
- [x] Run the smoke and record the actual result without treating headless execution as hardware performance evidence.
- [x] Update the capacity evidence and requirement ledger; retain every hardware/latency/v5 gap.
- [x] Run `git diff --check`, request independent review, resolve findings, and commit only the verified files.
