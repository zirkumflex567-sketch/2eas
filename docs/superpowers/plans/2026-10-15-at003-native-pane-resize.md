# AT-003 native v5 pane resize contract

**Goal:** Prove an oscillator is rendered in its own native pane and its height can be adjusted by dragging the chart's public pane separator.

**Scope:** Isolated read-only v5 fixture only. This does not claim beta production wiring, physical hardware acceptance, or full indicator-editor parity.

## Tasks

1. [x] Added a failing Chromium contract for separate price/oscillator panes and pointer-driven separator resize; first run failed because paneHeights was not exposed.
2. [x] Exposed public native pane heights through the adapter; the native Lightweight Charts separator already handled the resize gesture.
3. [x] TypeScript check, build, and complete v5 Chromium smoke passed, including the 5,000-bar/20-indicator/1,000-drawing capacity fixture.
4. [x] Reviewed the diff and updated AT-003 with isolated evidence and remaining gates.

**Safety:** No MT5, EA/preset edits, broker writes, Strategy Tester, backtests, GUI automation, deployment, or GitHub.
