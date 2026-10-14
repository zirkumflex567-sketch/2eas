# FR-002 session-aware VWAP

Add a user-configured local-session VWAP anchor while retaining a clear OTC volume-proxy label. The session starts at a wall-clock time in a validated IANA timezone; daylight-saving changes follow that timezone. Bars before today's start belong to the prior session. The defaults (`UTC`, `00:00`) preserve existing layouts and values. This remains read-only and does not claim exchange order flow or broker-native session discovery.

## Acceptance

- Calculation resets on the configured local session boundary, including DST transitions; zero-volume bars are skipped without inventing observations.
- Session timezone and start are account-local, editable in the indicator panel, persisted in local profiles and strictly accepted by the SQLite workspace validator.
- Old documents without session fields retain UTC-midnight behavior.
- Tests cover pre-session bars, session reset, overnight carry, DST, invalid IANA names/start values and UI roundtrip.
- Label identifies the chosen session and tick/real-volume proxy.

## Files and verification

`static/chart-studio-indicators.js`, `chart_studio/workspaces.py`, `scripts/test_chart_studio_indicators.cjs`, `tests/test_chart_studio_workspaces.py`, `scripts/smoke_chart_studio_beta.cjs`, and both task ledgers. Run math, workspace, browser and syntax checks. No backtests or MT5 writes.
