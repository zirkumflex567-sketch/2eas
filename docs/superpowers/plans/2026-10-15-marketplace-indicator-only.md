# Marketplace Indicator-Only Chart Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Each step uses checkbox syntax.

**Goal:** Keep verified MT5 prices and classic chart indicators available for the two closed-source Marketplace accounts while suppressing reconstructed Titan strategy scores and markers.

**Architecture:** Store the account's analysis capability beside its account configuration, with Marketplace set to `INDICATORS_ONLY`. The status API must report the strategy as unknown and omit reconstructed rules/scores; the candle API must continue returning EMA series but no heuristic BUY/SELL markers. The account's journal must include its broker trades without assuming Titan's magic number or inventing Titan entry/exit rules. The dashboard renders an explicit unavailable state for the strategy panel. Verified broker fills/deals and open positions remain visible through their existing provenance-bound read-only routes.

**Tech Stack:** Python/FastAPI, account gateway, embedded dashboard JavaScript, pytest, Playwright.

---

## Files and responsibilities

- `account_gateway.py`: account-scoped analysis capability; Marketplace aliases are `titan` (ICMarkets $10k) and `xau5m_500` (PU Prime $500).
- `app.py`: status payload and historical marker behavior, plus the main strategy-panel rendering branch.
- `app.py`: journal filtering and entry/exit explanations for Marketplace accounts; factual broker deal reasons remain factual.
- `tests/test_backend_audit.py`: API contracts for status semantics and candle markers while keeping indicator series present.
- `tests/test_dashboard_frontend.py`: browser-visible unknown-strategy status and absence of readiness percentages for Marketplace accounts.
- `docs/OPEN_TASKS.md`: record the tested correction while retaining broader AT/demo/hardware requirements as partial.

## Task 1: Make Marketplace status and candles indicator-only

- [x] Add failing backend tests for both Marketplace aliases: status must identify unknown strategy, provide EMA data, contain no reconstructed readiness/rules, and candles must contain EMA data but no BUY/SELL heuristic markers.
- [x] Add failing journal tests proving Marketplace trade history is not filtered by Titan magic and entry/EA-exit explanations say the EA reason is unknown.
- [x] Run those tests and confirm they fail because current Titan reconstructions are returned for the Marketplace aliases.
- [x] Add `analysis_mode='INDICATORS_ONLY'` to both Marketplace account records and leave existing Titan/GoldM15 modes unchanged.
- [x] Apply the mode to `/api/status` and `/api/candles`, preserving read-only MT5 provenance and indicator values.
- [x] Apply the mode to journal attribution while preserving broker-observed entry/exit facts and verified ticket IDs.
- [x] Add a failing browser assertion that the strategy panel says the EA logic is unknown and shows no readiness percentages; implement the small rendering branch.
- [x] Run backend tests, dashboard frontend smoke, and relevant account/candle regressions; check no mutation requests.
- [x] Update `OPEN_TASKS.md`; commit and push to `main`.

## Limits

- No Marketplace binary inspection beyond its already recorded file identity; no inference of its internal rules.
- No EA, preset, terminal, broker, order, or Strategy Tester changes.
- Existing demo, hardware, deployment, and broker-write approval gates remain required for the broader IDs.
