# FR-020 projected What-if exposure

## Goal

Extend the read-only What-if impact panel with projected gross long, gross short and net lots for the proposed symbol, based only on the verified account portfolio and the latest successful broker preview. Show the completed-H1 correlations for that symbol as descriptive context. Keep account currency, notional exposure and correlation-adjusted risk unavailable unless a broker-verified model supports them; never infer hedge credit or send broker writes.

## Files and contract

- `static/chart-studio-beta.js`: validate the preview/account association, use the broker-returned final lot size (including auto-sizing), add lots to the correct side, and render the projected symbol-level exposure and matching correlation pairs in the existing impact output.
- `scripts/smoke_chart_studio_beta.cjs`: assert projected BUY/SELL lots, auto-sized volume, unavailable correlations, account isolation, and no MT5 mutation routes.
- `docs/OPEN_TASKS.md` and `chart_studio/README.md`: record this tested slice while keeping FR-020/FR-027 partial and demo acceptance open.

## Verification

Run the Chromium beta smoke, broker-read/scenario-preview regression tests, JS syntax checks and `git diff --check`. No MT5 terminal, demo mutation, strategy backtest or deployment is part of this increment.

## Acceptance boundary

Lots are symbol exposure, not notional or USD risk. Correlations are descriptive completed-bar statistics and do not reduce additive stop risk. Missing broker preview, mismatched account, malformed size or unavailable portfolio data must not produce a projected exposure claim.

## Progress update

- [x] Chromium contract first failed on the missing projected-exposure line, then passed for BUY, SELL and server-sized budget lots, including descriptive correlation output.
- [ ] Run the focused browser/backend regression suite and review; FR-020/FR-027 remain partial pending demo and complete acceptance.
