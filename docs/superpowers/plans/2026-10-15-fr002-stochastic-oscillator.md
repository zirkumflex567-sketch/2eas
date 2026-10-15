# FR-002 Stochastic Oscillator Slice

**Scope:** Add a conventional, read-only Stochastic oscillator to the ChartStudio indicator catalog and isolated native v5 pane. Preserve account-local settings, bounded periods/smoothing, explicit warm-up, UTC bar alignment, and no trading behavior.

**Files:** `static/chart-studio-indicators.js`, `static/chart-studio-oscillators.js`, `chart_studio_v5/src/oscillators.ts`, `chart_studio_v5/src/adapter.ts`, indicator/v5 smoke contracts, and `docs/OPEN_TASKS.md`.

**Acceptance:** Formula fixture covers %K/%D smoothing, flat-range behavior, warm-up and invalid settings; the beta UI persists settings and renders both lines; the native v5 pane/readout matches the beta calculation, stays account-scoped, and remains within existing instance/pane limits. No MT5 writes, strategy claims, or backtests. This slice does not close FR-002's remaining catalog or production/hardware requirements.
