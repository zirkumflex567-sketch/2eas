# FR-003 v5 measurement and text placement

## Goal
Expose the existing native measurement and text-annotation objects in the read-only v5 preview.

## Steps
1. [x] Extend the preview contract with two-click MEASURE placement and one-click TEXT placement from a bounded text field; prove the test fails first.
2. [x] Extend adapter state and preview UI, preserving loaded-candle/positive-price validation, Escape cancellation, scoped persistence, and native drawing counts.
3. [x] Run the preview smoke, TypeScript checks/build, drawing regressions, then update FR-003 evidence.
4. [x] The implementation (`6d55666`) is in current `main`; Chart Studio and Performance/UX CI passed on the code-bearing main commit `c97e8b5` (runs `39121944142`, `39121944193`). Guarded local runtime and htown `/stt` are aligned on `718d15f3c8048cdfed7c0ec3f873bb4784e47c47`, digest `e5b032fa8e520c80a4556483747d43d1228c355a151d5d38f7994a1a91d903c4`, `restart_required=false`; htown is clean on `main`, nginx is active and `nginx -t` passes. The v5 bundle and preview script hashes match local/upstream. `scripts/smoke_live_v5_measure_text.cjs` passed against local and htown upstream on all four authorized demos: 1,001 verified XAU M15 candles each, real measurement and text placement, v4 remained mounted, GET-only, zero writes/browser errors/Blueberry requests. The production preview flag remains off. Physical hardware and touch/DPI acceptance remain deferred; backtests remain deferred.

## Constraints
Keep the preview optional and read-only, preserve the v4 production chart, and never send broker writes.
