# /task — 2EAs Chart Studio implementation board

**Master spec:** [CHART_STUDIO_MASTER_SPEC.md](CHART_STUDIO_MASTER_SPEC.md).
**Execution plan:** [CHART_STUDIO_PLAN.md](CHART_STUDIO_PLAN.md).
**Branch:** \`test/chart-studio-implementation\`. Tasks are checked only when real code exists in this branch. \`[~]\` = implementation started, awaiting proper CI/live verification; \`[ ]\` = not complete.

## Task 0 — Baseline, safety and branch

- [x] 0.1 Audit main commit, v4 Lightweight Charts, the two terminals/accounts, existing callbacks and trading routes.
- [x] 0.2 Create a separate test branch; leave main unchanged.
- [x] 0.3 Create one explicit /plan and /task tracking document referencing the single master spec.
- [x] 0.4 Add pure broker-money validation and read-only P0 scenario/quote/capabilities endpoints.
- [x] 0.5 Add initial isolated regression tests + Windows CI config (CI status must still be independently confirmed).
- [~] 0.6 GitHub Actions Windows test run: 46 Python tests and Chromium desktop beta smoke PASS (run 37881702809). Further responsive/MT5-connected browser verification remains open.
- [ ] 0.7 Audit all exposed trading POSTs and reverse tunnel for auth/CSRF/permissions before enabling mutations.
- [ ] 0.8 Lock target v5 version, review API/license and publish migration adapter RFC/PoC.

## Task 1 — Functional opt-in Chart Studio prototype (CURRENT)

- [x] 1.1 Mount beta toolbar next to fullscreen, leaving old chart operational.
- [x] 1.2 Toggle EMA20/50/200, overlay correctly calculated SMA20/SMA50/Bollinger20.
- [x] 1.3 Draw horizontal, trendline, rectangle and Fibonacci using price/time anchors, plus handle editing, Undo/Redo.
- [x] 1.4 Account-scoped **temporary localStorage** saving/loading drawings, chart toggles, named local layouts (save/load/delete) and JSON-copy export.
- [x] 1.5 Toggle genuine account-scoped MT5 open-position Entry/SL/TP overlays (**view-only**).
- [x] 1.6 Read-only What-if scenario form + optional verified Bid/Ask fill + backend broker PnL/margin preview; distinct PLAN zones, no trade execution.
- [~] 1.7 Chromium desktop smoke PASSED for initial tools, drawings/Fibo, Undo/Redo, account isolation and What-if; local named layouts being added. Mobile/fullscreen/zoom/reduced-motion remains **not verified**.
- [ ] 1.8 Replace experimental v4 wrapper with correctly tested v5 TypeScript chart adapter + dedicated panes.

## Task 2 — Full chart, drawings and storage

- [ ] 2.1 V5 plugin/primitives and own drawing registry, drag states, snapping and hit-test priorities.
- [~] 2.2 Configurable indicator instances: EMA/SMA/WMA multi-instance price overlays (up to 16); separate multiple RSI/MACD/ATR/ADX oscillator instances (up to 8), independent periods, panes, color/width/label/visibility, duplicates and deletion, saved in local+SQLite profiles; prior volume + UTC VWAP remain. Native v5 plugin migration and advanced pane manager still open.
- [~] 2.3 Drawing tool catalog: horizontal, trend, rectangle, Fibonacci, ray, price/time ruler, 3-anchor parallel channel, third-anchor editing, OHLC magnet, selected delete and undo; full advanced Fibos, text annotations, mobile gestures, v5 primitives and snap priority remain open.
- [~] 2.4 Drawing SQLite store, schema migration, revision conflicts, server layout/indicator profiles, import/export. **Implemented on branch:** private schema-v1 SQLite workspace store, optimistic revisions, account-scoped layout JSON, authenticated opt-in REST plus existing browser toolbar server save/load/delete; multi-user ACL, full v5 profile migration and remote conflict merge remain open.
- [~] 2.5 Chart appearance controls (dark/light/inherit background, candle colors/wicks/borders, grid, crosshair, log/normal scale, last-price line) with account-scoped local+SQLite profiles. Symbol watchlist, chart type, multi-chart and native pane/layout management remain open.
- [ ] 2.6 Optimized paging, streaming and incremental calculations; performance budgets AT-025/031.

## Task 3 — Broker read-only lifecycle and transparent risk

- [ ] 3.1 Broker-authoritative positions/pending/history/quote revisions and all symbol metadata.
- [ ] 3.2 Move the beta zones into native renderer with labels and correct USD/account conversion; hedging/netting.
- [~] 3.3 Fully interactive SL/TP drafts (zero writes) with broker-authoritative quote/risk preview. **Started:** draggable *virtual What-if plan* SL/TP grips, tick-size snapping and debounced MT5 profit/margin recalculation; **real ticket-bound stop preview remains open**.
- [ ] 3.4 A/B What-if extended with lot sizing, guard, margin, currency conversion and correlation.
- [ ] 3.5 Decision event schema, true EA telemetry, Decision Inspector; recorded vs unavailable semantics.
- [ ] 3.6 Trade Lifecycle and MFE/MAE provenance, immutable entry/exit snapshots and all-strategy journal links.

## Task 4 — Protected real trading mutations (DO NOT SHORTCUT)

- [ ] 4.1 Authenticated write role, CSRF/session-origin checking and tunnel exposure audit.
- [ ] 4.2 Backend stop/TP preview version stamps, risk/guard-policy, stops/freeze validation and position identity.
- [ ] 4.3 Two-step human confirmation, idempotency, authoritative MT5 readback, conflict/race protections and audit log.
- [ ] 4.4 Demo-account MT5 end-to-end authorized tests, EA trailing-stop conflict and broker error handling.
- [ ] 4.5 Security/performance review and explicit user release approval.

## Task 5 — Intelligence, replay and release

- [ ] 5.1 Multi-timeframe confluence, replay-safe as-of calculations and full historical warmup.
- [ ] 5.2 Session/liquidity structural proxies with DST and provenance.
- [ ] 5.3 Execution quality with real intended-vs-fill quote baselines/partial fills.
- [ ] 5.4 Reproducible market regimes with OOS analysis.
- [ ] 5.5 Licensed news/event overlays, EA-news-guard differentiation.
- [ ] 5.6 Read-only deterministic replay with no-lookahead and zero trading routes.
- [ ] 5.7 All AT-001–AT-056 green with proof, legacy parity, screenshots and complete rollout/rollback plan.

## Gate proof required before marking "complete"

- Every new file passes syntax/unit tests.
- Full existing Python/browser suites remain green; no trade regression.
- Real browser screenshot/interaction test for all beta tools, mobile and expanded mode.
- Verified account identity on **both** independently connected MT5 demos for broker previews.
- No MT5-write action in beta modules, What-if simulator, replay or automated tests.
- 35 requirements and 56 acceptance tests tracked as passed/not passed—not inferred from a plan.

### Phase-2 branch evidence (in progress)

- Branch: `test/chart-studio-phase2` created from merged `main` (`b7cabcd3`).
- Real broker `tick_volume` and `real_volume` are added as backward-compatible candle fields, supporting volume provenance.
- New `ChartStudioIndicators` module: Wilder RSI, ATR, MACD, real/tick volume and separate resizable panes, parameters persisted per account, local profile roundtrip.
- Static math checks prepared. Chromium CI and final validation must pass before marking this phase green and proposing a PR.
- All broker mutations remain out of scope for this work package; main and EAs are untouched until acceptance.

### Next test package — virtual stop/target grip

Branch `test/chart-studio-drag-preview` from merged main `8bbbb74`. New What-if PLAN mode visually drags its SL or TP with read-only broker preview at most once after a 260 ms debounce, plus final drop. Attempts to use a real order/position mutation route are forbidden and asserted by Chromium tests. Preserving last validated scenario, canceling on account/timeframe switch, Broker rejection fallback, and returning tickSize from real symbol_info are part of this gate. This is **not** the actual broker stop/target editor in FR-006/FR-007, which remains blocked pending security/MT5 conflict tests.

### Phase 2.4: SQLite server workspaces (branch `test/chart-studio-sqlite-workspaces`)

- Separate fail-closed Bearer authorization for new layout API; disabled unless `CHART_STUDIO_STORAGE_ENABLED=1` and a 32+ character `CHART_STUDIO_STORAGE_TOKEN` exists. Token is memory-only in browser, never LocalStorage or URL.
- Private SQLite DB under `state/` (or operator-configured private path), migration v1, WAL, optimistic `expectedRevision`, strict 131072-byte/500-drawing caps, owner/account/symbol/layout scope. DB under `/static` disallowed.
- GET list/read, PUT save, DELETE with stale-write conflict handling and private HTTP cache policy; current v4/beta LocalStorage profiles untouched.
- Security prerequisite **still open**: legacy MT5 POST endpoints `/api/modify_position`, `/api/close_position`, `/api/reset_drawdown` are not independently authenticated. Do not activate additional MT5 mutations before holistic auth/CSRF/tunnel audit (Tasks 0.7/4.1).
- Frontend loads drawings/visible indicators but intentionally leaves the active timeframe unchanged; full versioned v5 multi-view restoration is still open.
- Python SQLite tests, auth API integration tests and Chromium version/cross-account tests must pass before merging.

### Follow-up indicator package: ADX and volume-derived VWAP

Branch `test/chart-studio-adx-vwap` from SQLite-workspaces main merge. Added Wilder-smoothed ADX/+DI/-DI pane (first ADX after 2*N−1 bars) and UTC-session VWAP as an optional main-price overlay. VWAP uses broker `real_volume` if >0, otherwise `tick_volume`, explicitly labeled a **volume-weighted OTC proxy** rather than proven institutional orderflow. Added math tests for warm-up, rising/ranging regimes, VWAP day reset and a browser toggle test. Account-based indicator settings and secured server-layout validation now accept these types. Full session-aware VWAP with IANA/broker calendars, selectable anchor session and indicator performance budget still open.

### Current branch: advanced drawing tools

Branch `test/chart-studio-advanced-drawings`, based on merged main `834f1bc`. Adds ray, channel and price/time measurement, optional 12px OHLC snap (never future candles), three-step channels, third-handle editing, selected-object deletion with undo. UI measurements describe **price** differences and candle counts, not monetary PnL; no broker writes. Updates SQLite schema validation to support 1/2/3-anchor shapes. Tests must validate geometry, local state, account segregation, persistence, Chromium actual drawing/selection and existing What-if no-write contract. v5 engine and mobile input remains pending.

### Chart Studio indicator editor — TradingView-like configuration (current branch)

`test/chart-studio-configurable-averages`: customizable overlay editor, presets, 16 independent EMA/SMA/WMA lines, per-line period (2–500), source (close/open/high/low/HL2/HLC3/OHLC4), style and visibility, duplicate/delete, per-account persistence, local profile plus opt-in SQLite document roundtrips. Legacy native EMA20/50/200 remain unchanged; users can hide those and add separately configured averages. Client uses bounded memoization across style updates and recalculates only when candle signatures change. Existing schema-v1 workspace documents stay readable; `movingAverages` is an **optional** and strictly validated new field.

Remaining for professional TradingView-like behavior: native v5 adapter, fully configurable multiple instances of each oscillator, pane move/resize/layout manager, indicator search/catalog/metadata, symbol/timeframe watchlists, chart type switching, multi-chart workspace, object tree, keyboard shortcuts, responsive mobile gestures, paginated/history indicator warmup, deterministic replay, advanced fibs, drawing settings and broker-authorized trade interactions. Do not represent this editor as full TradingView parity.

### Current visual editor branch

`test/chart-studio-chart-appearance` adds an opt-in Chart Settings panel above the existing chart without changing the MT5 signal logic: dark/light/inherited background, price-scale Normal/Logarithmic, grid/crosshair visibility, rising/falling candle colors, wick/border visibility and last-price line. Settings persist per account and in local/SQLite layouts via a strictly whitelisted optional schema-v1 `chartAppearance` key, preserving older documents. Module captures chart appearance defaults before changes. Test gating: 59 Python tests, Node schema validation, existing Chromium plus dedicated appearance browser workflow. This does **not** implement switchable candle/bar/line chart types or LWC5.

### Multi-instance RSI/MACD/ATR/ADX — current iteration

Branch `test/chart-studio-oscillator-instances` adds an **additional**, account-scoped read-only oscillator instance editor (up to 8 simultaneous RSI/MACD/ATR/ADX), each with its own dedicated resizable v4 chart pane, selected period or MACD fast/slow/signal, custom label/color/width, visibility, duplicate, remove and kind switch. Existing native/legacy panes are preserved. The shared indicator math implementation remains one source of truth and remains independent of MT5 execution. Optional `oscillatorInstances` extends existing SQLite schema-v1 documents backward-compatibly (strict server validation and revision conflicts). Browser LocalStorage and named chart profiles persist each instance. No signals or broker order modifications.

CI acceptance requires Python contract tests, standalone JS schema checks and Chromium smoke with actual multiple panes, kind replacement, account change, local+server round trip, no order requests; merge to main only if green. Full TradingView parity, arbitrary indicator scripting, true v5 primitives, mobile pane manager, synchronized multi-chart views, replay and broker-authorized order editing still open.
