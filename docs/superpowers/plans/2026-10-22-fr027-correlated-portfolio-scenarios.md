# FR-027 Correlated Portfolio Stress Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add read-only, broker-priced joint historical-shock scenarios to What-if previews so the proposed position can be assessed together with existing positions when aligned MT5 history and fresh quotes are available.

**Architecture:** Reuse only completed, aligned H1 MT5 rates and the already verified account's live positions. Apply each observed joint return vector as a labeled historical shock to the current portfolio and proposed scenario, and use `order_calc_profit` for every revaluation in account currency. Report sample size, as-of, scope and empirical loss quantiles; this is a stress distribution, not a forecast, probability, backtest, hedge credit, or trading guard. Any missing/invalid history, quote, broker calculation or conversion returns an explicit unavailable state.

**Tech Stack:** FastAPI, MetaTrader5 read API, Python pure calculations, pytest, Chart Studio Beta browser UI and Chromium.

---

## Files

- Create `chart_studio/portfolio_stress.py` for validated aligned-return scenarios and deterministic broker-calculation orchestration.
- Modify `app.py` to enrich a What-if preview inside its existing verified account session with the read-only portfolio stress result.
- Modify `static/chart-studio-beta.js` to scope-validate and display the historical joint-shock summary alongside (never merged into) the single-trade broker preview.
- Modify `tests/test_chart_studio_portfolio_stress.py` and the existing What-if API/frontend contracts for alignment, broker PnL, unavailable states, provenance and zero writes.
- Update `chart_studio/README.md`, `docs/CHART_STUDIO_TASKS.md` and the FR-027/AT-039/040 rows in `docs/OPEN_TASKS.md` only after test and demo evidence.

## Contract and limits

- Stress observations use only completed H1 bars with exact common hourly timestamps, with at least 60 adjacent aligned return observations across every open-position symbol and the proposed symbol. Normalize every MT5 rates timestamp through the account's explicit `broker_clock.rates_to_utc_epoch` policy before alignment; snapshot `asOfUtc` is at least the latest validated quote time.
- Every series must be finite, positive, strictly unique and ordered; gaps are not interpolated. Missing or bad data invalidates the whole result.
- Revalue each open position and the hypothetical position at observed joint returns applied to its current verified quote / proposed entry, using MT5 `order_calc_profit` in the verified account currency. Do not infer contract size, currency conversion, missing positions, or broker prices.
- Include the hypothetical volume from the successful broker preview. Use one fresh bid/ask quote per open-position symbol; enforce account, symbol and terminal scope.
- Return `UNAVAILABLE` with a stable reason if any required quote, history, conversion or broker calculation is absent, stale, ambiguous or malformed. Never partially aggregate a portfolio.
- Report empirical sample count, sample UTC range/as-of, p50, p95 and worst portfolio PnL/loss with a `HISTORICAL_ALIGNED_H1_SHOCKS` source label. These are observed scenarios, not predictive probabilities or strategy performance.
- Preserve the existing gross-additive stop-risk result; correlation never reduces stop-risk or grants hedge credit. Keep this endpoint and UI read-only (`canExecute=false`); no order or position writes.
- Skip portfolio-stress-specific MT5 reads for Blueberry and for any account without an explicit non-challenge demo policy. Do not change active EA/chart configuration or run Strategy Tester/backtests.

## Tasks

### Task 1: Pure historical-shock contract

- [x] Write tests for aligned returns, joint scenario PnL, quantile/sample metadata, missing symbol, insufficient/gapped history, invalid prices/quotes/calculations, and account-currency scope.
- [x] Run the focused test and observe the expected failure before production code.
- [x] Implement the pure validator and scenario aggregator in `portfolio_stress.py`; rerun focused tests.

### Task 2: Verified MT5 preview integration

- [x] Add an API contract test that injects verified demo positions/rates/quotes and asserts the proposed what-if plus existing portfolio is revalued with MT5 `order_calc_profit`, all scopes match, and no write API is called.
- [x] Verify expected RED against the current preview response.
- [x] Integrate only within the existing account-scoped MT5 session; keep the broker preview available if stress context is unavailable.
- [x] Run broker-read, money, preview, account policy and API regressions.

### Task 3: What-if presentation and live acceptance

- [x] Add browser tests for available/unavailable stress status, exact account/symbol binding, quote/as-of/source labels, and isolation from single-trade R:R and stop risk.
- [x] Render a concise stress range with `n` and historical-shock wording; do not label values as win probability or change order capability.
- [ ] Run Chart Studio Chromium tests and the live read-only what-if smoke on all five explicitly authorized non-Blueberry demos; confirm `canExecute=false`, zero broker writes and no Blueberry request.
- [ ] If a demo lacks multi-symbol holdings or aligned history, record `UNAVAILABLE` rather than creating synthetic exposure; document the unfulfilled live acceptance.

### Task 4: Review and ledger

- [ ] Run the focused and complete non-backtest suites, both Main CI workflows, and an independent implementation review; resolve findings.
- [ ] Update FR-027/AT-039/040 and task 3.4 with the exact tested model and limitations. Keep hardware, live non-USD, cross-symbol portfolio demo acceptance, and write-release gates open until independently satisfied.
- [ ] Commit/push only to `main`; verify `/stt` code identity after deployment without changing its runtime if application source digest is unchanged.
