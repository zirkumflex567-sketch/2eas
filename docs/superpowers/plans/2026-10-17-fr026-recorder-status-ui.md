# FR-026 Recorder Status UI

**Goal:** Let users explicitly inspect decision-recorder and lifecycle-capture health without implying that a missing signal was recorded.

**Safety:** The request is manual, GET-only, and allowlisted to `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`. It never queries Blueberry or starts/configures/reloads an EA. Account changes discard late responses. `IDLE`, `NOT_CONFIGURED`, `NOT_STARTED`, `NOT_RECORDED`, gaps, and storage losses remain explicit.

## Verification

- [x] Chromium contract: Titan `IDLE` and `RECORDED` (distinct recorder readiness and stored-evidence state), unconfigured EA source `NOT_CONFIGURED`, lifecycle `OK/ROLLING_WINDOW`, and lifecycle `NOT_STARTED/UNKNOWN` render distinctly.
- [x] Blueberry alias is rejected by the status allowlist; fixture observed no request.
- [x] Beta Chromium smoke passes with no broker mutations.
- [x] Live four-demo Chromium acceptance: two exact capture-status GETs per alias, 56 total API reads, 0 mutations, 0 browser errors, no Blueberry query.
- [x] Broker lifecycle-status regression: 26 tests pass.

**Current evidence:** `titan` and `xau5m_500` have no decision source (`NOT_CONFIGURED`); `xau5m_m5` and `titan_m5` report `IDLE/NOT_RECORDED`. Lifecycle polling is `OK/ROLLING_WINDOW` on all four demos, with no new rows in the last poll. Decision-event capture and actual marketplace strategy attribution remain open; this UI reports status but does not manufacture decisions.
