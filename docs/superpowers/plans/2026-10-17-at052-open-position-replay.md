# AT-052 Live-Position Replay Acceptance

## Goal

Prove that an already recorded entry snapshot can be opened and replayed while its broker position remains open, without changing that position or issuing a broker mutation.

## Scope

- Use the authorized PU Prime Titan demo alias `titan_m5` only when it has an open XAUUSD.p position linked to a stored entry snapshot.
- Resolve the open position and matching snapshot/lifecycle records by the exact position identifier.
- Replay the recorded event through the read-only ChartStudio inspector.
- Block all non-GET API requests at the browser boundary and reject any Blueberry-scoped request.
- Compare the broker position fingerprint before and after replay.

## Acceptance

- At least one currently open demo position has an exact stored ENTRY snapshot and lifecycle record.
- The replay displays recorded bars and fetches the exact lifecycle record revision.
- Every API request is GET-only and account-scoped to `titan_m5`.
- Position ticket, identifier, side, volume, entry price, SL, TP and revision are unchanged after replay.
- No browser exceptions occur.

This is a read-only acceptance slice; it does not authorize or submit trade writes and does not use Strategy Tester/backtests.
