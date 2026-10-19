# FR-014 native v5 Trend-Based Fibonacci implementation plan

**Goal:** Bring the existing three-anchor Trend-Based Fibonacci tool into the opt-in native v5 chart, with functional placement, editing, persistence and transfer. Production v4 remains authoritative; backtests are out of scope.

**Contract:** Anchors A, B and C must use three distinct loaded candle times and valid positive prices. Default horizontal levels project `C + (B - A) × ratio` for ratios 0, 0.382, 0.5, 0.618, 1, 1.618 and 2.618, clipped to the pane. Invalid input is rejected atomically. No broker route or write is added.

## Tasks

- [x] Add failing geometry and adapter contracts for up/down impulses, three-anchor validation, same-candle rejection, and projection levels.
- [x] Implement a native v5 primitive and CRUD/readback APIs, preserving the third anchor through drag, undo/redo, visibility/lock, duplicate/delete and the shared drawing limit.
- [x] Add three-click placement and manager labels in the opt-in preview.
- [x] Add scoped persistence and schema-v2 portable import/export with strict schema validation and atomic rollback.
- [x] Run focused Node/Chromium smokes, the existing v5 and Beta suites, build the production bundle, and record precise evidence in `OPEN_TASKS.md`.
- [x] Push to `main`, wait for both required workflows, fast-forward hTown and use the guarded runtime restart if application code changed; verify the exact runtime revision and read-only non-Blueberry demo feeds. Do not query or touch Blueberry.

**Still open after this slice:** production cutover/parity, touch/DPI/hardware acceptance, and unrelated open FR/AUD/AT requirements remain open.
