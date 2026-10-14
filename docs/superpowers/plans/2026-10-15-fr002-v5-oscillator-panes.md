# FR-002 native v5 oscillator panes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add independent native v5 RSI, ATR, MACD and ADX indicator instances whose values match the current beta calculation, render in native panes, and obey the shared 20-indicator/8-oscillator limits.

**Architecture:** Put pure bounded calculations in a focused TypeScript module. The chart adapter owns each logical indicator group and its one or three native series in a shared pane, routes configuration edits to only that group, preserves beta settings and native oscillator scales/axis labels, and keeps exact-time readouts. For forming/new bars this slice recomputes formulas from the loaded bounded history but updates only the final native series point; cached calculator state and full-history-scale performance acceptance remain follow-up work. This remains an isolated read-only renderer proof; it does not switch the production chart.

**Tech Stack:** TypeScript 5.9, Lightweight Charts 5.2, Playwright/Chromium fixture.

---

## Files

- Create `chart_studio_v5/src/oscillators.ts` for strict RSI, ATR, MACD and ADX calculations over validated UTC candles.
- Modify `chart_studio_v5/src/adapter.ts` to manage grouped native-pane series, isolated config replacement, scoped cleanup, and diagnostics.
- Modify `scripts/smoke_chart_studio_v5.cjs` for formula parity, pane grouping/resizing, option isolation, lifecycle limits and no-write checks.
- Update `docs/OPEN_TASKS.md`, `docs/CHART_STUDIO_V5_RFC.md`, and `chart_studio_v5/README.md` with only isolated capability evidence.

## Tasks

### Task 1: Calculation contract

1. [x] Add browser assertions for RSI, ATR, MACD/signal/histogram and ADX/+DI/−DI against `ChartStudioIndicators.calculate`.
2. [x] Run the native v5 smoke and confirm it fails because the oscillator calculator API is absent.
3. [x] Implement bounded parameter validation and pure calculations matching the current beta seed, smoothing, warm-up and UTC alignment.
4. [x] Run formula parity tests for warm-up, flat prices, zero true range, invalid periods and MACD fast/slow ordering.

### Task 2: Native pane instance lifecycle

1. [x] Add failing contracts for one-pane multi-series MACD, two same-kind independent instances with differing settings/styles, isolated option edits/removal, exact-time readout and account cleanup.
2. [x] Add oscillator groups as native v5 pane series; share one pane among a group's components and one independent pane per instance.
3. [x] Enforce eight logical oscillator instances and the shared 20-indicator limit atomically; verify the capacity fixture is exactly 16 moving averages plus four oscillator groups, with atomic rejection of the 21st indicator; reject duplicates and malformed settings without partial series creation.
4. [x] Run native pane scale/axis-label, resize, move, removal, preserved-setting and account-isolation contracts.

### Task 3: Performance and evidence

1. [x] Extend the 5,000-bar fixture to exactly 16 moving averages plus four oscillator groups and record setup/forming-bar timings without asserting a hardware budget. Native rendered series update only their tail; full calculation-state caching and hardware benchmarking remain acceptance follow-ups.
2. [x] Run `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, `node scripts/smoke_chart_studio_v5.cjs`, and the existing indicator/oscillator unit and Chromium smokes.
3. [x] Review the diff, update the task ledger/RFC/README with adapter-only scope while retaining open P1, production wiring, and hardware acceptance, and commit the vertical slice.

**Safety:** No MT5 requests, EA/preset edits, broker writes, Strategy Tester, strategy backtests, deployment or production mount switch. Preserve the separate demo/hardware/write-release gates.
