# FR-017 read-only price alerts

## Scope

Deliver explicit user-created price crossing alerts in Chart Studio Beta. Alerts are local to account, symbol, and timeframe. Use the existing read-only MT5 quote endpoint only while active alerts need monitoring. Never execute, stage, or suggest a trade.

## Contract

- Crossing uses the quote midpoint and triggers only on a below-to-above or above-to-below transition. The first valid quote after creation, a scope switch, a stale quote, or re-arm establishes a baseline and never fires retroactively.
- Accept only exact-account/exact-symbol MT5_VERIFIED data with canExecute=false, freshness=FRESH, and age no greater than 30 seconds. Invalid/stale/network failure clears the crossing baseline.
- Poll every five seconds only while an untriggered alert exists. Abort a hung quote request after eight seconds. Ignore late responses from a prior scope.
- Dedupe each rule until the user explicitly re-arms it. Persist rule state locally, isolated by account/symbol/timeframe. Limit to 20 rules and validate identifiers and finite positive prices.
- Ask for browser notification permission only after an explicit user click; keep in-app status useful if permission is unavailable or denied. No background/service-worker promise.

## Verification

- scripts/test_chart_studio_alerts.cjs: RED/GREEN engine tests cover both crossing directions, stale-gap, provenance, duplicate quotes, one-shot trigger, re-arm, capacity, and validation.
- scripts/smoke_chart_studio_beta.cjs: Chromium fixture verifies explicit permission gesture, scoped GET polling, hidden-tab pause/resume, notification, deduplication, account isolation, and no mutation.
- The focused test is wired into Chart Studio CI. Run JavaScript/Python syntax, indicator and Workspace suites, and full Beta Chromium smoke before deployment.
- Deploy only after green local validation; verify exact main on local runtime and htown /stt. Do not invoke MT5 writes, open/attach EAs, or run strategy backtests.
