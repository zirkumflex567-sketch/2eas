# AT-052 Live-Position Replay Acceptance

## Goal

Prove that an already recorded entry snapshot can be opened and replayed while its broker position remains open, without changing that position or issuing a broker mutation.

## Scope

- Read-only preflight all four authorized aliases (`titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`) and replay every currently open position with an exact stored entry snapshot. Empty books are reported without manufacturing a replay.
- Resolve the open position and matching snapshot/lifecycle records by the exact position identifier.
- Replay the recorded event through the read-only ChartStudio inspector.
- Block all non-GET API requests at the browser boundary and reject any Blueberry-scoped request.
- Compare the broker position fingerprint before and after replay.

## Acceptance

- At least one currently open demo position has an exact stored ENTRY snapshot and lifecycle record.
- The replay displays recorded bars and fetches the exact lifecycle record revision.
- Every API request is GET-only and each browser page stays scoped to its active demo alias.
- Position ticket, identifier, side, volume, entry price, SL, TP and revision are unchanged after replay.
- The live smoke records all four preflight results, replays only accounts with an open position, and never queries Blueberry.
- No browser exceptions occur.

This is a read-only acceptance slice; it does not authorize or submit trade writes and does not use Strategy Tester/backtests.


## Live evidence (17.10.2026)

The four-demo preflight returned `MT5_VERIFIED` and `canExecute=false` for all aliases. `titan`, `xau5m_m5`, and `xau5m_500` had no open positions. `titan_m5` had two XAUUSD.p positions; Chromium replayed their exact stored entry snapshots (146 and 143 frozen M15 bars) and fetched the referenced lifecycle revisions. The position fingerprints matched before and after; 22 browser API requests were GET-only, with zero mutations, browser errors, or Blueberry requests.
