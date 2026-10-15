# Align account chart feeds to the confirmed M15 charts

Date: 2026-10-15. Scope: correct configured read-only dashboard chart feeds from the user's confirmed live chart timeframe.

## Evidence and contract

- The user explicitly confirmed XAU charts use M15.
- Read-only Windows process metadata showed the selected chart title on all five configured terminals at M15, including the four demo accounts.
- Keep the existing per-broker Gold symbol names. Change only the two demo account feed timeframes that were still configured as M5.
- Do not edit, attach, restart, or otherwise change an EA, preset, chart, or MT5 terminal. Do not access Blueberry through broker APIs.

## Test-first sequence

1. [x] Add a configuration regression covering all five configured account aliases and observe it fail for `xau5m_m5` and `titan_m5`.
2. [x] Change only those two dashboard feed timeframes to M15.
3. [x] Run the policy and broker-read suites (148 tests).
4. [x] Deploy exact `main` via the runtime guard and verify M15 candles from the four explicitly authorized demo aliases.

## Status

- [x] Commit `2c266ba`, deploy, and verify `/stt` runtime and four demo feeds.
- [x] Each of the four demos returned 150 `MT5_VERIFIED` candles for its configured gold symbol at M15; no Blueberry API request was made.
