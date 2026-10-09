# /plan — 2EAs Chart Studio, implementation test branch

**Source of truth:** [CHART_STUDIO_MASTER_SPEC.md](CHART_STUDIO_MASTER_SPEC.md). This file tracks *execution*, not new competing requirements.

**Branch:** \`test/chart-studio-implementation\`. **Do not merge to main** until explicit acceptance.
**Start baseline:** \`b7153cba32f7972c97a205a6a470bd913a285b7c\`.
**Implementation status:** **IN PROGRESS / NOT COMPLETE**. All spec sections, FR-001–FR-035 and AT-001–AT-056 are in scope. No background agent or unattended work is implied by this file; the coding agent must execute tasks explicitly.

## Decision log (initial)

1. Preserve the existing production FastAPI UI, MT5 account gateway and both EAs. Modular \`chart_studio/\` pure/route code and \`static/chart-studio-beta.js\` run on the test branch. A test-first read-only beta is deliberately **not** a claimed v5 migration.
2. New beta supports native EMA toggles, SMA/Bollinger overlays, price-anchored experimental horizontal/trend/rectangle/Fibo drawings, local undo/redo/JSON export, and *read-only* MT5 position SL/TP-zone display.
3. What-if calculations must be authoritative from \`mt5.order_calc_profit\` and \`mt5.order_calc_margin\`. A non-USD account is **not** assumed to be in USD. Scenario display is explicitly a plan, never a real order.
4. For permanent server drawing storage use SQLite with safe, revisioned APIs. Browser \`localStorage\` in early beta is **provisional**, not the production persistence requirement.
5. Real SL/TP dragging, confirm dialog, broker write protection, money conversion and open-trade execution are **BLOCKED** until account/risk/permissions/atomicity review and demo tests from §10 and §§8–9. No test branch beta button may write orders.
6. Target implementation is a modular TypeScript/Lightweight Charts v5 chart renderer. The current v4 shim makes new interactions testable without breaking the trading cockpit; migration happens in its own gate, then retire shim after acceptance.
7. Use strict proof statuses: ✅ shipped to test branch; 🧪 code exists but CI/browser not verified; ⬜ not started; 🛑 blocked by unavailable MT5/EA broker evidence.

## Execution stages

| Phase | Deliverables | Gate |
|---|---|---|
| 0 Foundation | Repo regression baseline, branch, architecture, auth/MT5 audit, isolated read-only API, capability endpoint, initial beta UI, CI | Code checks; Windows fake MT5 tests |
| 1 Chart Core | TypeScript/Vite and pinned LWC v5, chart types, indicators registry and pane manager, layout settings, command bar | AT-001–003/011 + UI & perf gates |
| 2 Drawing Engine | Time/price drawings, fibos/channels, handles/snap/undo, object tree, SQLite revision storage, mobile touch | AT-004–007/022–024/033–034 |
| 3 Trading Visualization | Broker positions/history, entry/SL/TP zones, MT5 USD/FX/margin read-only pricing, drafts, what-if, decision and snapshot foundations | AT-008–012/018–021/036–040/049–050/055–056 |
| 4 Real Broker Operations | Protected SL/TP drag+confirm, guard/revision/staleness/idempotency/audit, demo MT5 E2E | AT-013–017/030/032 (NO REAL FUNDING TESTS) |
| 5 Advanced Intelligence | MTF confluence, session/language, real execution quality, regimes, news, optimized snapshots/lifecycle, replay no-lookahead, multi-chart, polishing | AT-041–048/051–054 and performance |

### Recommended sequencing (dependencies)

\`P0 audit & no-write API → robust chart adapter → correct indicators → persistent drawing engine → broker read-only overlays / USD & What-if → immutable decision and trade event capture → protected broker edit → P1 intelligence → P2 replay\`.

Some work is parallelizable after Phase 0 (pure indicator math, drawing geometry, broker read-only core), but merges must respect the dependency chain. **Never** replace the existing operational MT5 app with an unfinished duplicate dashboard.

## System/integration interfaces

- Existing accounts \`titan\` and \`goldm15\` from \`account_gateway.py\`, one scoped MT5 terminal per read. Broker/server identity must be verified.
- Existing candle source \`GET /api/candles\` remains unchanged until the v1 paginated feed exists.
- Initial read-only \`/api/chart/v1/capabilities\`, \`/api/chart/v1/quotes\`, \`/api/chart/v1/scenarios/preview\`; no mutation endpoints in beta.
- Initial Chart Studio toggle next to chart zoom/fullscreen; unchanged legacy \`#tv-chart\`. All beta styles prefixed \`cs-beta-\`.
- Test using Python unittest + Node built-in math checks in the new CI workflow, then Chromium Playwright and a Windows MT5 demo.
- Every phase writes actual passing check logs and lists limitations. Visual tests must check chart axis labels, overlay bounds, Stone/Dark/Light and account switching.

## Safety release stop conditions

Stop release on account mismatch, scope leak, incorrect order_calc_profit, stale-position update, false success message, cross-account drawing leak, unreviewed auth/tunnel mutation, incorrect price coordinate, missing trading-guard check, performance regression, bad CI, or an unverified MT5 write. If MT5 is not connected, show unavailable instead of fabricating dollar values.

## Current iteration deliverable

A **working progressive prototype**, *not* full 35-feature implementation: beta toolbar, first indicator math, four drawing primitives, temporary local drawing/indicator profiles, optional position zones, read-only broker-price what-if API, and tests. Continue with all remaining tasks in [CHART_STUDIO_TASKS.md](CHART_STUDIO_TASKS.md). This iteration must NOT be presented as the final product.

## Erste überprüfte CI-Baseline

- Initialer Windows-CI-Lauf 37881550432 wurde durch eine historische GoldM15-Preset-Abhängigkeit auf einen lokalen Windows-Pfad blockiert; er ist **kein** Fehler des neuen Chart-Studio-Money-Moduls.
- Testumgebung nutzt jetzt die im Repository versionierte `goldm15/GoldM15_Reconstruction.set`.
- Nachfolgender Lauf [37881702809](https://github.com/zirkumflex567-sketch/2eas/actions/runs/37881702809) **PASS**: 46 Python-Tests, JavaScript-Syntax/Indikator-Math sowie ein echter Chromium-UI-Test inklusive Chartzeichnungen und What-if-Demo; **kein reales MT5**.
- Browser-Funktionstest der zusätzlichen lokalen Layoutprofile, echte Windows-Terminal-Broker-Kalkulation, Touch/DPI, V5-Migration, serverseitige Persistenz und reale Stop-Mutationen bleiben offen.

## Next implementation branch: first independent oscillator panes

`test/chart-studio-phase2` adds RSI, MACD, ATR and real/tick volume pane controls while retaining the v4 fallback adapter. Chart timelines are aligned using whitespace points for indicator warm-up periods. It adds the original MT5 volume fields to `/api/candles` without changing existing price fields. Account-local named profiles include pane preferences and input periods.

These are **not** the full configurable indicator framework, and are not the planned v5 migration. Must pass expanded Node math tests and Windows Chromium integration before any subsequent PR. Real broker writes remain disabled.

## Phase 2.4: persistent private SQLite chart layouts (isolated rollout)

New layout store is an account-aware SQLite WAL database, independently authenticated by an opt-in server token. Transactions use optimistic revision checks (409 conflict), strict drawing/indicator schema and size limits. This phase **does not** expose or modify MT5-trading routes. A browser can use local layouts without connecting; server layouts require explicit configuration and a memory-only token. Saved timeframe remains metadata until a future v5 chart view manager restores it safely. Version 1 tested via pure SQLite, FastAPI TestClient and Chromium fixture; add exact CI link after passing. Do not claim it is a multi-user accounts/auth implementation; legacy trading POST hardening remains a security blocker for real SL/TP commits.

## Supplement to Phase 1: ADX/VWAP (tested separately)

Extend the v4 read-only indicator engine with Wilder ADX (+DI/-DI) and VWAP calculated from true broker real volume when available, otherwise explicitly named tick-volume proxy, reset at UTC day boundary. Stored per-account in local layouts and opt-in SQLite documents. This is NOT exchange orderflow and NOT a historical EA decision proof. Keep original candles/MT5 trading unaffected. Full configurable indicator instances, session-aware VWAP and native v5 chart migration remain open.

## Iteration: additional read-only drawing tools

Advanced drawing tools on `test/chart-studio-advanced-drawings`: horizontal and 2-anchor primitives coexist with 3-anchor parallel channel, extended ray and price/time ruler. Magnetic snaps use only loaded OHLC points within 12 screen pixels, are opt-in and account-scoped. Imported drawings continue to pass exact server schema validation. Full advanced Fibo, labels/editors, v5 plugin geometry, mobile multitouch, performance and real stop edits remain explicitly open. Require Node geometry + Windows Python + Chromium test before merging.

## Immediate UI priority: multi-instance indicator editor

The fixed chart indicator toggles are supplemented, not replaced, by a new isolated `ChartStudioAverages` module with 16 optional EMA/SMA/WMA instances, editable source, periods 2–500, colors/width/labels and scoped local/server profile persistence. This is a working next step toward an indicator registry with instance IDs (v5 target), not a full TradingView clone. The old v4 chart, both EAs and all MT5 execution routes remain unchanged. A version-1 workspace extension `movingAverages` is optional for backwards compatibility; strict server validation prevents invalid styling/config injection. CI must include math/validation, Chromium UI and existing complete regression before PR merge.

## Visual chart settings module

`ChartStudioAppearance` adds controlled chart appearance customization with a strict schema and account-local settings: background theme, grid, crosshair, right-scale logarithmic/normal, candle up/down styling and last-price line. The optional `chartAppearance` server workspace field preserves schema-v1 backward compatibility. Do not alter any EA indicator inputs or broker order execution. E2E Chromium fixture checks renderer options and local/server profile round trips. Chart types, v5 engine and all higher-level plans remain open.
