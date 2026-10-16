# FR-002 Native v5 Volume Zones Plan

> **For agentic workers:** Use this plan inline with `executing-plans`. Keep the native v5 bundle isolated and preview-only; do not switch production from Beta.

**Goal:** Give the isolated native Lightweight Charts v5 renderer the same closed-bar, volume-median OHLC zones as Beta, with exact provenance and account cleanup.

**Architecture:** A pure exported calculator implements `volume-range-median-v1`, sharing the Beta contract while depending only on verified candle inputs and an explicit `asOfUtc`. A native price-series primitive shades bounded OHLC rectangles and identifies real versus tick-proxy volume; adapter APIs own lifecycle, readout attribution and scope changes. The overlay API requires an explicit `MT5_VERIFIED` as-of record matching active account, symbol and timeframe. No endpoint, broker write, persistence migration, MT5 UI operation, or production cutover is included.

**Tech Stack:** TypeScript, Lightweight Charts 5.2.1 series primitives, Chromium fixture smoke, existing Beta reference calculator.

---

### Task 1: Pure calculator parity

**Files:** Create `chart_studio_v5/src/volume-zones.ts`; modify `chart_studio_v5/src/adapter.ts` exports; test `scripts/smoke_chart_studio_v5.cjs`.

- [x] Add RED contracts for median trigger, real-volume preference, tick proxy, closed-bar/as-of, warm-up, duration cap, malformed source baseline, and no mutation.
- [x] Implement `calculateVolumeZones` with algorithm version and source metadata.
- [x] Compare native values to `ChartStudioMarketStructure.core.buildVolumeZones` in Chromium.

### Task 2: Native overlay primitive and adapter lifecycle

**Files:** Modify `chart_studio_v5/src/adapter.ts`; test `scripts/smoke_chart_studio_v5.cjs`.

- [x] Add an isolated zone primitive with clipped time/price rectangles, tick/real volume styling, labels, and a latest-history-edge coordinate fallback.
- [x] Add validated set/update/clear APIs; avoid drawing persistence and user-drawing counts.
- [x] Rebuild on history replacement and account change; update from a caller-supplied as-of record proven to match the active account/symbol/timeframe, never browser wall time.
- [x] Add readout status/source/threshold metadata for the hovered trigger bar and expose counts in `inspect()`.
- [x] Verify rendering, input/config/provenance rejection, readout, same-source matching, visibility, clear/account cleanup, zero writes and v4 production isolation.

### Task 3: Verification and delivery

**Files:** Modify `chart_studio_v5/README.md`, `docs/OPEN_TASKS.md`, this plan.

- [x] Run TypeScript check/build, full v5 Chromium smoke, Beta market-structure/Beta regression tests, and `git diff --check`.
- [x] Record remaining profile/workspace, production, hardware and load gates.
- [ ] Commit/push to `main`, wait for CI, restart the guarded local runtime, fast-forward htown and verify `/stt` revision/digest and read-only demo behavior on four authorized demos only.
