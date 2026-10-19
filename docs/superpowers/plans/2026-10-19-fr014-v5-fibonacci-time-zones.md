# FR-014 Native v5 Fibonacci Time Zones

## Goal

Bring the existing Beta Fibonacci Time-Zones tool into the isolated native-v5 preview. The feature stays opt-in, local, and read-only; v4 remains the production chart and no broker request or write is added.

## Contract

- A user places the drawing with two distinct loaded UTC candle anchors. Its time interval projects vertical guides at factors `0, 1, 2, 3, 5, 8, 13, 21, 34, 55`; reverse anchor order projects in the reverse direction.
- The native primitive clips guides to the plot bounds, supports selection and horizontal anchor dragging, and participates in visibility/lock, undo/redo, duplication/deletion, the 1,000-drawing cap, scoped persistence, and portable schema-v2 layout transfer.
- Strict validation rejects malformed identity, unsupported factors, invalid timestamps, identical anchors, over-limit drawing counts, and foreign scope before mutation. Invalid updates/imports are atomic.
- Account/symbol/timeframe changes clear transient selection/placement and retain only the destination scope's saved drawing state. Production v4 remains mounted and the v5 flag remains off.

## Files and responsibilities

- `chart_studio_v5/src/adapter.ts`: option schema, primitive geometry/render/hit-test, drawing APIs, interaction, history, private/portable persistence, migration and validation.
- `static/chart-studio-v5.js`: production bundle built only from the TypeScript source using the pinned esbuild toolchain.
- `app.py` and `static/chart-studio-v5-preview.js`: opt-in preview button, two-anchor placement/status, accessible selected-object integration.
- `scripts/smoke_chart_studio_v5.cjs` and `scripts/smoke_chart_studio_v5_preview.cjs`: red/green API, geometry, interaction, reload, transfer, scope and no-write contracts.
- `docs/OPEN_TASKS.md` and `chart_studio_v5/README.md`: evidence and remaining production/hardware gates.

## Work

- [x] Add failing native-v5 contracts for factor projection (both directions), strict anchor validation, and render/readback.
- [x] Implement the bounded native primitive and drawing API; run the TypeScript check and focused Chromium contract.
- [x] Add two-anchor preview placement, horizontal edit handles and manager actions; verify undo/redo, visibility/lock, duplication/deletion and invalid-anchor rejection.
- [x] Add schema-v5 scoped persistence and schema-v2 portable transfer with roundtrip, account/timeframe isolation and 1,000-object capacity coverage.
- [x] Build the production bundle from source and run the v5 API/preview smokes, relevant drawing/persistence regressions and `git diff --check`.
- [x] Record exact behavior and open production/touch/DPI/hardware gates in `OPEN_TASKS.md`; commit `7e5a818` to `main`, push and verify local/hTown runtime identity. Local 8050/8056 and hTown `/stt` upstream reported the same revision and digest; hTown checkout is clean on `main`, nginx is active, and `nginx -t` passes. Read-only Chromium chart acceptance passed on three demo aliases (150 verified XAU M15 bars each, 46 GETs, zero writes/errors/Blueberry requests); `xau5m_m5` was excluded after its terminal returned HTTP 503 as not running. Anonymous public `/stt` returned the expected HTTP 401. Main CI workflows were still in progress at this check.

## Explicitly out of scope

Fibonacci Fan and Trend-Based Fibonacci native-v5 parity remain separate FR-014 slices. No production cutover, hardware claim, MT5 write, EA change, Blueberry access, backtest, or Strategy Tester run is part of this plan.
