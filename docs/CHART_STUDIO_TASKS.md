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
- [~] 2.2 Full indicator catalog and configurable instances/parameters, RSI/MACD/ATR/ADX/VWAP panes. **Phase-2 work:** independent RSI(Wilder)/MACD/ATR/Volume panes with chart-time alignment and configurable periods/fast/slow/signal; ADX, VWAP, full registry/instance creation and v5 migration remain open.
- [ ] 2.3 Full drawing tool catalog incl. advanced fibos, channels, labels, multiple handles and responsive touch.
- [ ] 2.4 Drawing SQLite store, schema migration, revision conflicts, server layout/indicator profiles, import/export.
- [ ] 2.5 Symbol watchlist, timeframe, panes, chart type, multichart and per-layout configuration.
- [ ] 2.6 Optimized paging, streaming and incremental calculations; performance budgets AT-025/031.

## Task 3 — Broker read-only lifecycle and transparent risk

- [ ] 3.1 Broker-authoritative positions/pending/history/quote revisions and all symbol metadata.
- [ ] 3.2 Move the beta zones into native renderer with labels and correct USD/account conversion; hedging/netting.
- [ ] 3.3 Fully interactive SL/TP drafts (zero writes) with broker-authoritative quote/risk preview.
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
