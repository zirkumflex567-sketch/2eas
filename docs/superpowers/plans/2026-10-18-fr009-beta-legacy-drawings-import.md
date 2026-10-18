# FR-009 Legacy Beta Drawing Export Import

**Goal:** Reopen existing schema-v1 drawing exports in the current Beta chart without weakening account or chart-scope isolation.

**Compatibility contract:** Accept only the exact legacy envelope `{schemaVersion: 1, account, symbol, timeframe, drawings}`. The account, symbol, and timeframe must match the active chart. Validate its drawings through the current schema-v2 document validator, retain current view and indicator settings, and omit the account field from the migrated in-memory portable representation. Any malformed or out-of-scope file must fail before changing chart state or browser storage.

## Tasks

- [x] Add Chromium assertions for same-scope migration, settings preservation, account/symbol/timeframe rejection, malformed input, and no partial mutation; observe the schema-v2-only rejection first.
- [x] Implement strict legacy envelope recognition and convert it to a schema-v2 candidate using the current settings and legacy drawing list.
- [x] Run the full Beta Chromium smoke and confirm the existing no-write acceptance remains green.
- [x] Update FR-009 to distinguish completed Beta import from remaining production persistence/parity and hardware gates.
- [ ] Commit the implementation and run Main CI; do not change demo accounts or broker state.
