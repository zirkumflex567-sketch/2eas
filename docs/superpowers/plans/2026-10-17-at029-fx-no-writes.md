# AT-029 Live Visual-FX No-Write Acceptance

## Goal

Verify that the visible Chart-FX demo buttons produce only local visual effects and cannot issue a broker mutation.

## Scope

- Use only the explicitly authorized demo aliases: `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`.
- Block every non-GET API request and every Blueberry-scoped request in headless Chromium.
- Open Chart-FX and activate the Trade, Profit, and Chaos/SL demo controls on each alias.
- Compare MT5-verified open-position ticket/SL/TP/revision fingerprints before and after.

## Acceptance

- The UI stays account-scoped to the selected demo.
- All test controls complete without browser exceptions.
- No mutation request is sent or reaches the local runtime.
- Positions and protection values are unchanged on all four demos.

This is a live read-only demo acceptance; it performs no trade, account, or EA mutation and does not use Strategy Tester/backtests.
