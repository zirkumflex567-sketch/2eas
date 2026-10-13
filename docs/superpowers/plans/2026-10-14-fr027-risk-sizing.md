# FR-027 risk-budget sizing implementation plan

Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md). This increment covers server-authoritative risk-budget lot sizing only; it does not close FR-027 or AT-039/040.

## Requirements

- Accept either a positive explicit lot size or a positive risk budget / equity percentage in the verified account currency.
- Derive volume only by querying MT5 `order_calc_profit` for the submitted entry/stop and discrete broker volume steps. No contract-size formula or USD conversion fallback.
- Round down to a valid broker lot step; fail when minimum volume exceeds the budget, pricing is unavailable, or equity/currency is unknown.
- Return the selected lots, requested budget, broker-calculated gross stop risk, unused budget, margin and explicit excluded-cost warnings.
- Keep the endpoint read-only and account-bound. No `order_send`, `order_check`, write route, persistent plan or implicit order ticket.
- Add UI inputs and clearly scoped drafts only after the server contract is proven. A/B persistence/export and non-USD conversion remain separate acceptance work.

## TDD sequence

1. Add tests for BUY/SELL risk budgets, equity-percent sizing, discrete step rounding, minimum-volume rejection, missing broker prices/equity/currency, non-monotonic/invalid broker answers, and no mutation calls.
2. Observe RED against the existing explicit-volume-only preview.
3. Add a pure sizing helper to `chart_studio/money.py`; then extend the strict preview request and route in `app.py` to accept explicit lots or a risk budget, preserving explicit-volume behavior.
4. Add browser validation and show requested budget vs actual gross risk; preserve account-generation cancellation and read-only guard.
5. Run targeted Python tests and the Chart Studio browser smoke. Independently review implementation before committing.

## Acceptance boundaries

AT-039's discrete lot sizing and correct broker stop-profit calculation can be marked partial only with tests. AT-040 stays open until save/export, account conflict handling and a browser proof of zero MT5 writes pass. Non-USD converted USD values remain explicitly unavailable. No broker demo mutations or Strategy Tester run are part of this increment.

## Progress

- [x] RED observed for missing helper, bool-to-float coercion, and malformed TP causing repeated MT5 calculations before request rejection.
- [x] Discrete MT5 `order_calc_profit` lot search and exactly-one-mode API contract implemented; Boolean impostors fail validation.
- [x] UI supports fixed lots, account-currency budget and equity percent. Targeted Python suite and Chromium smoke pass; mock browser route asserts the payload and no-write behavior.
- [x] Full discrete lot-step scan validates monotonic MT5 stop-loss results; non-monotonic curves and ranges above 10,000 steps fail closed. Both configured demo terminals were queried read-only: XAUUSD has min 0.01, max 100.0 and step 0.01 (9,999 steps), so the cap covers both. Boundary tests verify 10,000 accepted and 10,001 rejected before any MT5 calculation. A live read-only 10,000-call benchmark measured 0.450 s (Titan) and 0.480 s (GoldM15). Added coverage for invalid percentages and missing account currency.
- [ ] Independent review passed.
