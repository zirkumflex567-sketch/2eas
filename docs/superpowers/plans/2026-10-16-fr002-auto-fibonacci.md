# FR-002 Automatic Fibonacci Retracement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transparent, read-only automatic Fibonacci retracement overlay using only confirmed MT5-verified chart swings.

**Architecture:** Use a fixed, documented pivot strength of two closed bars on each side. Keep only alternating confirmed swing points and draw retracement levels for the latest completed impulse from the confirmation bar onward; never draw back through an unconfirmed period. Persist the enable setting with existing account-scoped indicator settings and expose swing anchors, confirmation time, source and algorithm version in the data window.

**Tech Stack:** Chart Studio indicator registry/calculator, Lightweight Charts v4 Beta overlay, browser localStorage profile, Node contract tests, Playwright Chromium smoke.

---

## Requirements and rule

- Master Spec §7.2 requires `Fibonacci Auto-Retracement` on a transparently documented pivot rule; §7.3 prohibits future-period/look-ahead data. §24.5 requires right-side confirmation bars for swing pivots.
- Algorithm `confirmed-swing-auto-fib-v1`: a swing high/low must be strictly higher/lower than the two bars immediately before and after it. All five bars must be closed by the supplied `asOf` time. If both predicates hold on one outside bar, skip that bar. Consecutive pivots of the same type collapse to the more extreme pivot. The last two alternating pivots form the impulse.
- Retracements are `0`, `0.236`, `0.382`, `0.5`, `0.618`, `0.786`, and `1`; prices interpolate from impulse end back toward its start. Begin plotting only on the first chart bar after the second pivot's confirmation bar closes.
- Invalid timeframe, malformed/unsorted OHLC, insufficient swings or zero-range impulse return an explicit unavailable/warm-up result. Source is the current verified chart feed; this is not broker order flow and does not create trades.
- This slice closes the Beta catalog gap only. Native v5 parity, production cutover, hardware/DPI, and full indicator parameter catalog remain open and must stay so in `OPEN_TASKS.md`.

## Files and sequence

- `static/chart-studio-indicators.js`: pure pivot-based calculator, registry/default/profile wiring, overlay lines, and readout metadata.
- `scripts/test_chart_studio_indicators.cjs`: deterministic formula, direction, confirmation, malformed data, tie and warm-up contracts.
- `scripts/smoke_chart_studio_beta.cjs`: enable, account-scope persistence, source labels, no-look-ahead line start, no-write and reload coverage.
- `docs/OPEN_TASKS.md`: record the exact Beta evidence while leaving native v5/hardware gaps open.

## Tasks

- [x] Add failing calculator tests for up/down impulses, exact ratios, two-right-bar confirmation, closed-bar boundary, tie/dual-pivot behavior, alternating-pivot selection and invalid data.
- [x] Implement and export the pure calculator with explicit `algorithmVersion`, source, anchors, direction, confirmation time and level series.
- [x] Wire a toggle-only overlay into the Beta registry, scoped indicator settings, price chart, and UTC readout.
- [x] Add browser smoke coverage for overlay visibility, readout provenance, account isolation, no-look-ahead line start, no-write and reload coverage.
- [x] Run indicator math tests, Beta Chromium smoke, syntax and diff checks; record focused evidence and remaining native v5/hardware gaps.
- [x] Implementation commits `2165a2c` and `35247f0` are on `main`; both GitHub workflows passed on `afae2df` (`39008041561`, `39008041565`). Local and htown `/stt` report matching revision `afae2dfcb407f7670830eb863b7f71ae3e6428eb`, digest `a839388c9bde125ca4e5dd5f6beaeffe3a76fdf67c28024f0cfd764a32fa491d`, and `restart_required=false`. Local/htown `chart-studio-indicators.js` SHA-256 matches. Read-only headless acceptance on all four demos loaded 1,001 `MT5_VERIFIED` M15 candles and computed an available confirmed impulse with seven levels; 72 GETs total, no browser errors, writes, or Blueberry requests. Stale quotes leave live risk unknown.
