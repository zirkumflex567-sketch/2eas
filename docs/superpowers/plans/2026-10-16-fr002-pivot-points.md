# Pivot Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explainable, read-only classic Pivot Points overlay to Chart Studio Beta and the isolated native-v5 adapter, using only broker-verified completed D1/W1 candles.

**Architecture:** The source series is fetched explicitly at D1 or W1 for the active account and broker symbol, then refreshed every five minutes while enabled. A source bar contributes levels only after a later source bar opens; this confirms its close without using the currently forming source candle. The classic floor formulas produce P, R1–R3 and S1–S3. Levels apply from the confirming source-bar open through the next observed source-bar open, align to actual chart candles, and are never projected onto synthetic candles. Account/symbol/timeframe changes cancel stale fetches and clear old scope data. Beta settings and workspace snapshots persist the basis timeframe and reproducibility metadata (`classic-floor-v1`, `MT5_VERIFIED`, and the source window). The native-v5 API accepts caller-provided verified source bars and matches Beta values.

**Tech Stack:** Existing Chart Studio JavaScript indicator module and catalog, read-only `/api/candles` endpoint, SQLite workspace validator, native-v5 TypeScript adapter, Node/pytest/Chromium tests.

---

## Semantics and acceptance boundaries

- Default source basis: D1; optional W1. The UI names the basis explicitly (for example, “Pivot Points · D1 Brokerkerzen”).
- Use the prior candle’s H/L/C only when a subsequent D1/W1 candle exists. The final source candle is considered forming/uncertain and does not create a level set.
- Classic floor levels: `P=(H+L+C)/3`; `R1=2P-L`, `S1=2P-H`; `R2=P+(H-L)`, `S2=P-(H-L)`; `R3=H+2(P-L)`, `S3=L-2(H-P)`.
- Target chart bars before confirmation or outside the observed source range have no levels. Gaps are not filled with synthetic candles. Between source opens, including weekends and market closures, the latest confirmed levels remain operative; a missing/invalid next source bar does not create new levels. Levels carry source timestamp and validity window in readouts. Use observed broker timestamps only; do not infer session/day boundaries from the machine timezone.
- Source requests must validate `MT5_VERIFIED`, account, broker symbol, basis timeframe, and `canExecute=false`; stale or invalid responses clear the overlay and display a precise unavailable reason.
- Source candles are normalized by timestamp and validated for finite OHLC, high/low consistency, ordering, and uniqueness. Invalid source series fail closed. Account alias, exact broker symbol (including suffixes), source timeframe and provenance must match the request and response exactly; stale responses from previous account/symbol/chart-timeframe scopes are discarded.
- No order, broker write, EA change, Strategy Tester, backtest, or Blueberry access. Four explicitly authorized demo feeds may be used for read-only acceptance only after CI and deployment.
- Native v5 remains isolated/preview-only; this plan does not authorize a production v5 cutover.

## Files and sequence

1. Add failing pure formula/alignment tests for hand-calculated P/R1–R3/S1–S3, warm-up, source-close confirmation, weekend gaps/carry-forward, source ordering/duplicates/invalid OHLC, metadata/window attribution, source changes and immutable input.
2. Add the Beta registry/calculator, D1/W1 selection, strict account-scoped read-only history loading, race cancellation, readout/source attribution, overlay lines and stale/unavailable state; test exact request/response account alias, broker symbol and basis timeframe (including suffix mismatch), invalid provenance/data, account/symbol/chart-timeframe races, failures and no writes in Chromium.
3. Add strict workspace schema validation and round-trip/bounds tests for the basis selector.
4. Add the grouped native-v5 API with seven lines, source-aware readout, history/update/removal/account cleanup and shared instance limit; compare exact Beta formulas and test lifecycle in Chromium.
5. Run focused math/schema tests, both native-v5 builds, Beta/v5 Chromium smokes and `git diff --check`; request an independent implementation review and fix findings.
6. Update the FR-002 open-task status and this plan. Commit and push only reviewed changes on `main`, wait for required CI, guarded-restart the exact main runtime, fast-forward htown via SSH, verify revision/digest/bundle hash, then run read-only acceptance on the four authorized demos. Leave all backtests deferred.

## Files expected

- `scripts/test_chart_studio_indicators.cjs`
- `static/chart-studio-indicators.js`
- `static/chart-studio-catalog.js`
- `static/chart-studio-beta.js`
- `scripts/smoke_chart_studio_beta.cjs`
- `chart_studio/workspaces.py`
- `tests/test_chart_studio_workspaces.py`
- `chart_studio_v5/src/adapter.ts`
- `scripts/smoke_chart_studio_v5.cjs`
- generated `static/chart-studio-v5.js`
- `docs/OPEN_TASKS.md`

## Local implementation status (16.10.2026)

- Completed formula/source validation, Beta account-scoped D1/W1 GET loader, race invalidation, chart overlays/readout, local-profile and SQLite workspace persistence, and native-v5 parity API/lifecycle.
- Verified: `node scripts/test_chart_studio_indicators.cjs`; `python -m pytest -q tests/test_chart_studio_workspaces.py` (35 passed, 184 subtests); `node scripts/smoke_chart_studio_averages.cjs`; `node scripts/smoke_chart_studio_beta.cjs`; `npm run check --prefix chart_studio_v5`; both v5 builds; `node scripts/smoke_chart_studio_v5.cjs`; `git diff --check`; Python compile check.
- Pending: commit/push, required GitHub workflows, guarded local runtime restart, htown `/stt` fast-forward and digest/bundle verification, then read-only live acceptance on only the four authorized demo feeds. Backtests and every Blueberry request remain excluded.
