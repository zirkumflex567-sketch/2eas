# Momentum and ROC Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add editable, account-scoped Momentum and Rate of Change oscillators to the Chart Studio Beta and isolated native v5 renderer, with matching calculations, strict persistence validation, and correct warm-up behavior.

**Architecture:** Extend the existing oscillator catalog, math module, Beta multi-instance panes and scoped configuration, plus the isolated TypeScript v5 incremental engine. Each oscillator uses the close-price lookback `period`; Momentum is `close[i] - close[i-period]` and ROC is `(close[i] / close[i-period] - 1) * 100`. A zero ROC denominator omits the point, and neither indicator emits until a full lookback exists. Workspace and browser-profile validators accept only their exact settings schemas.

**Tech Stack:** JavaScript, TypeScript, Python/Pydantic-style workspace validation, Node tests, Chromium smoke.

---

## Files and responsibilities

- `static/chart-studio-indicators.js`: Beta registry, formula/reference calculation, data-window labels, and persisted profile settings.
- `static/chart-studio-catalog.js`: searchable user-facing Momentum and ROC entries.
- `static/chart-studio-oscillators.js`: strict multi-instance settings, pane plots, editor controls, account-scoped persistence, and warm-up/readout presentation.
- `chart_studio/workspaces.py`: strict SQLite workspace instance schema for both oscillator kinds.
- `chart_studio_v5/src/oscillators.ts`: typed full-history and incremental Momentum/ROC calculation streams.
- `scripts/test_chart_studio_indicators.cjs`, `scripts/test_chart_studio_oscillators.cjs`, `tests/test_chart_studio_workspaces.py`: focused formula, model, and durable-roundtrip contracts.
- `scripts/smoke_chart_studio_v5.cjs`, `scripts/smoke_chart_studio_beta.cjs`: Chromium reference parity, pane rendering, persistence/scope, forming-bar replacement, append, settings rebuild, warm-up, and zero-denominator behavior.
- `docs/OPEN_TASKS.md`: FR-002 measured scope and exact remaining catalog / production gates.

## Implementation tasks

### Task 1: Specify Momentum and ROC math

- [x] Add failing formula tests for lookback alignment, monotonic/flat prices, sign and scaling, invalid periods, short warm-up, and zero ROC denominator.
- [x] Run `node scripts/test_chart_studio_indicators.cjs`; confirm failure is specifically missing Momentum/ROC behavior.
- [x] Implement the two reference functions and add them to the Beta calculation registry.
- [x] Re-run the focused test and confirm the expected values and null omission.

### Task 2: Add strict Beta multi-instance UI and account profile support

- [x] Add failing tests for both kinds, default period 10, invalid/extra settings, independent instances, warm-up, and scoped persistence.
- [x] Run `node scripts/test_chart_studio_oscillators.cjs`; confirm the new kinds are rejected before implementation.
- [x] Add both kinds to the exact settings whitelist, defaults, pane lines, parameter editor, readout labels, and profile validation; add searchable catalog entries.
- [x] Run oscillator, catalog, and Beta Chromium smokes; verify switch-account clears the old instance view and no non-GET request is sent.

### Task 3: Extend SQLite workspace validation

- [x] Add failing tests for Momentum and ROC roundtrip and strict period/extra-field rejection.
- [x] Run the focused workspace tests and confirm the new kind rejection.
- [x] Permit only the `period` integer in `[2, 200]` for each kind and preserve normalized instance JSON.
- [x] Run all workspace tests.

### Task 4: Implement native v5 and incremental parity

- [x] Add failing Chromium probes for correct full-history values, warm-up and zero-denominator behavior, repeated forming-bar replacement, a new bar append, settings rebuild, and scope restoration.
- [x] Run `node scripts/smoke_chart_studio_v5.cjs`; confirm missing kinds fail the intended contract.
- [x] Implement strictly validated settings, bounded incremental state, per-instance pane series and data-window names in v5.
- [x] Compare every native readout with the Beta reference after forming-bar updates, appends, parameter changes, and history replacement.
- [x] Run TypeScript check/build and both native v5 and Beta Chromium smokes.

### Task 5: Update the ledger and verify delivery state

- [x] Update FR-002 with the formulas, warm-up, persistence and tests actually delivered; retain open items for the rest of the catalog, production wiring, target-hardware and long-run budget.
- [x] Run the focused frontend/workspace suite and `git diff --check`.
- [ ] Commit only intended source, test and plan files on `main`; wait for both main CI workflows to finish and report their exact results.

Strategy backtests and Strategy Tester parity are out of scope. No MT5 trading write or demo mutation is required by this feature.
