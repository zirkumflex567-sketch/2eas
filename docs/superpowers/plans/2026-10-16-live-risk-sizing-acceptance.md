# Live demo risk-sizing acceptance

## Scope

Verify FR-027's actual MT5 risk-budget and equity-percent lot sizing for BUY and SELL on all four explicitly authorized demo aliases. Use a current `MT5_VERIFIED` quote and broker symbol/account metadata. Submit calculation-only scenario previews; do not place or modify an order or position. Do not query Blueberry. Strategy Tester and backtests are excluded.

## Acceptance

- [x] Restrict every request to `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`.
- [x] Derive exact broker symbol from verified M15 candles, and verify fresh quote, symbol metadata, portfolio equity, and account currency.
- [x] For each side, measure minimum-lot broker stop risk, then compare broker-sized lots from a fixed USD risk budget and an equity-percentage budget.
- [x] Require USD PnL/margin currency, broker volume min/max/step, stop-risk no greater than budget, positive margin result, and `canExecute=false`.
- [x] Exercise both BUY and SELL with no order route or position mutation.
- [x] For equity-percent previews, return and display the exact equity snapshot used to derive `riskBudget`; validate sizing and stop risk against that same preview snapshot.

## Result (16 October 2026)

`node --check scripts/smoke_live_scenario_sizing.cjs` and `node scripts/smoke_live_scenario_sizing.cjs` passed. The 24 calculation previews cover four accounts × two sides × minimum-lot baseline/risk-budget/equity-percent. All four feeds were fresh and USD-denominated. The verified broker-sized lot and gross stop risk fit each submitted risk budget and the broker lot step; both BUY/SELL stop PnL was negative and target PnL positive. Margin was returned in USD; it remains a preview value and was not used to place orders. All responses were `serverVerified=true`, `canExecute=false`. No Blueberry request, position mutation, or order was made. This is live calculation evidence, not demo execution, non-USD conversion, EA guard validation, or hardware acceptance.

## Equity snapshot basis

Each EQUITY_PERCENT sizing response now includes `equityBasis`, the account equity returned by the same MT5 read used by the preview calculation. The What-if result displays both the percentage and this amount; fixed-budget responses return a null basis; fixed-lot responses do not include this field. The browser and live smoke validate that `riskBudget` = equityBasis × riskPercent / 100, avoiding comparisons against a separate portfolio read that can already be stale while the demo account changes.
