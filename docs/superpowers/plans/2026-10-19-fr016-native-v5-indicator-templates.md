# FR-016 Native v5 Indicator Templates

## Goal

Close the missing indicator-template slice of FR-016 while native v5 remains an opt-in preview. Templates contain only indicator configuration; drawings, chart presentation, broker data, and account credentials stay outside the template.

## Contract

- Save the currently configured v5-visible indicators, moving averages, and oscillator instances under a named template.
- Scope each local template collection to account, verified symbol, and timeframe; validate schema, values, name uniqueness, count, and byte limits before storage or application.
- Load only after explicit confirmation, apply through the existing indicator configuration modules, and resynchronize the read-only v5 preview.
- Rename, duplicate, and delete are local-only. No new API route or broker-write path is added; source-bound indicators retain their existing read-only data fetches.
- Keep the production v4 view and the v5 feature flag unchanged. Touch, DPI, hardware, production cutover, and full FR-016 remain open gates.

## Work

- [x] Add failing contract tests for strict snapshot/store validation, scope isolation, CRUD limits, and atomic application.
- [x] Implement a bounded, versioned, account/symbol/timeframe-scoped local template store.
- [x] Add native-v5 template controls and route application through existing MA/indicator/oscillator editors; retain current settings if application fails.
- [x] Run Node contracts, focused Chromium UI flow, existing v5/profile tests, the 5,000-bar/20-indicator/1,000-drawing capacity smoke, and Python asset/runtime preflight.
- [ ] Update `OPEN_TASKS.md` with exact evidence and remaining hardware/production gaps; deploy the clean Main commit and verify local and hTown runtime identity.
