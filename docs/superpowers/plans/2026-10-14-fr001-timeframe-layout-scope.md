# FR-001 Beta account/symbol/timeframe layout scope

## Contract

Saved ChartStudio Beta layouts are isolated by account, symbol, and timeframe. Switching timeframe refreshes the layout selector and never exposes or loads another timeframe's layouts. When the scoped M15 key is absent, existing unscoped XAUUSD layouts are copied into the legacy default M15 scope, preserving their content and original key for recovery. New layouts carry explicit schema/symbol/timeframe metadata, and load rejects mismatched scope before changing chart state. Invalid or mismatched rows stay hidden and are retained when valid rows are saved, so local recovery data is not discarded.

## Files and acceptance

- `static/chart-studio-beta.js`: scoped storage key, copy-on-missing M15 migration, metadata validation, selector refresh on timeframe change.
- `scripts/smoke_chart_studio_beta.cjs`: M15/M5 isolation, same-name independence, scoped load, legacy migration and mismatch atomicity in Chromium.
- `docs/OPEN_TASKS.md`: update FR-001 evidence and remaining production-v5/server-merge gaps.

## Verification

Write Chromium assertions first and observe failure. Then implement; run `node scripts/smoke_chart_studio_beta.cjs`, focused Python frontend/workspace tests, syntax and `git diff --check`. Request independent review before committing. No MT5 writes or deployment are part of this package.
