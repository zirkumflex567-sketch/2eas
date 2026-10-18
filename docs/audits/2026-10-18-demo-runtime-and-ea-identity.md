# Demo runtime and EA identity audit — 18 October 2026

This is a read-only follow-up for commit `2a135cc`. No chart was changed or reloaded, no order was sent, and no Blueberry account was queried.

## Main deployment and chart rendering

- `origin/main`, the guarded local dashboard, and htown's `/home/kevin/2eas` checkout are on `2a135cc`. The runtime startup and disk revision match, the digest is `be8510d6749c623547fe2f1d61547f72f990ed1f9521c843176a83bf861cd4b4`, and `restart_required=false`.
- The htown SSH upstream on port 8055 returns that same runtime identity. The repository path `/stt` does not exist on htown; nginx is active and `nginx -t` succeeds.
- Both main workflows passed: [Chart Studio 39138799000](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39138799000) and [Performance/UX 39138799046](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39138799046).
- `node scripts/smoke_live_chart_render_data.cjs` rendered 1,001 MT5-verified XAU M15 bars on each of `titan`, `xau5m_m5`, `titan_m5`, and `xau5m_500`, with visible candle pixels, 58 API GETs, no mutations, and no browser errors.

## Demo terminal mapping

MT5 identity locks verified each listed terminal as a connected demo. The chart files below are the latest saved chart profiles on disk; they were last saved between 13 and 15 October. No terminal process command line contains a `/profile` selector, and the MT5 Python API cannot enumerate the profile currently held in terminal memory. Treat this as saved-profile evidence, not proof of the presently displayed chart.

| Alias | Configured demo | Latest saved profile | EA paths in saved profile |
| --- | --- | --- | --- |
| `titan` | IC Markets 10k | `anti` | `XAUUSD 5 minute` on `XAUUSD` charts 01/02; `Copier_Sender_Master` on chart 12 |
| `xau5m_m5` | PU Prime 250 | `Default` | `XAU_Titan_Pro_BasketGuard` on `XAUUSD.p` chart 01; `Copier_Sender_Master` on chart 07 |
| `titan_m5` | PU Prime 500 Titan | `Default` | `XAU_Titan_Pro_BasketGuard` on `XAUUSD.p` chart 02 |
| `xau5m_500` | PU Prime 500 Marketplace | `Default` | `XAUUSD 5 minute` on `XAUUSD.p` charts 02/03 |
| `goldm15` | Separate IC Markets demo | `Default` | `GoldM15_Reconstruction` on `XAUUSD` chart 02 |

Experts logs confirm `XAU_Titan_Pro_BasketGuard` and recorder readiness on `xau5m_m5` and `titan_m5` at 18:27 UTC on 16 October. The GoldM15 terminal log records `GoldM15_Reconstruction` on `XAUUSD,M15` on 17 October. None of these logs contains a verifiable in-memory EX5 hash or loaded preset hash.

The saved profiles also contain `Copier_Sender_Master` on `titan` chart 12 and `xau5m_m5` chart 07. Its current in-memory attachment and destination configuration are unknown; no copier was invoked.

## Challenge-guard finding and evidence status

The `xau5m_m5` PU Prime 250 demo log records two historical events on 15 October: daily drawdown 3.57% against 3.50%, then total drawdown 9.21% against 9.00%, both labeled `BLUEBERRY RISK BREACH`. This is the demo drawdown breach, not evidence of a Blueberry breach. The later 16 October recorder-ready session follows the breach. The disk EX5 at the terminal's primary `Experts` path is SHA-256 `e1f90eac997b071388905de7f0c0a9606666c8002a4d3ef856e15f3f6c2c04ad`, matching the previously documented recorder build; this does not prove the binary currently held in memory.

A GET-only status read for `goldm15` returns Decision Recorder `IDLE` / `NOT_RECORDED` and Lifecycle `NOT_CONFIGURED`. The private `CHART_STUDIO_EVIDENCE_DEAL_ACCOUNTS` allowlist still contains only the four other demo aliases. An attempt to add `goldm15` to the user's private environment file was rejected by automatic policy review, so that file remains unchanged. No workaround was used.

The challenge-guard regression slice passes (**12 tests**), the installer/builder/recorder focused suite passes (**199 tests**), and both main CI workflows are green. Backtests remain deferred.

## GoldM15 live-feed correction — `c0c0f24`

The initial GoldM15 `/api/candles` request failed because MT5 rejected `copy_rates_from_pos(..., 5000)` with `(-2, "Terminal: Invalid params")`. Direct read-only calls to the connected GoldM15 demo verified that 4,999 bars succeed and 5,000 fail. Both GoldM15 history readers now request 4,999. Two regression tests reproduced the 5,000-bar rejection before the fix and pass after it; the focused backend/broker/multi-account suite passes (**291 tests**, four existing FastAPI deprecation warnings).

After guarded restart, local Main and htown's SSH reverse-tunnel returned **1,001 `MT5_VERIFIED` XAUUSD M15 candles** for `goldm15`, with `canExecute=false`. Both runtime identity responses report startup/disk revision `c0c0f24937e6010181cbcc6626cb4e28e0fe7c28`, digest `7fe48ea9e3e9cf703cefd7ea79483d3df6fc462c1a81e4de826f5c2dfeefc468`, `applicationCodeDirty=false`, and `restart_required=false`. htown remains on clean `main`; nginx is active and `sudo -n nginx -t` passes. The GoldM15 status endpoint still returns 503 because its quote is more than 42 hours old; it reports `risk_status=unknown` and fails closed. This is not a fresh-quote or risk acceptance. No chart/EA attach, broker write, Blueberry access, or backtest occurred.

## GoldM15 chart scope and protected-account request guard — `4aa169c`

The GoldM15 demo had `hidden=True` in the account gateway, so it was omitted from `/api/accounts`. A URL with `?account=goldm15` was therefore rejected by the early deep-link allowlist and the dashboard started with its default Blueberry scope. The first exploratory live browser attempt then emitted an account-scoped request for `blueberry`; the Playwright request listener stopped the run, but no response record was captured, so whether that GET reached the local runtime is unconfirmed. The attempt was read-only and invoked no mutation route or trade action. This contradicts the earlier “no Blueberry access” status for that exploratory attempt and is recorded here explicitly.

The fix removes the hidden flag for the verified demo, registers its tab in the initial HTML so deep-link validation succeeds before bootstrap requests, and adds a regression asserting every account-scoped startup GET uses only `goldm15`. The live-smoke now intercepts and aborts any Blueberry-scoped request or non-GET API call before network dispatch. After deployment and guarded restart, all five non-Blueberry demo charts rendered 1,001 verified M15 candles; the v5 preview read ten levels and seven Auto-Fibonacci lines per scope. The final guarded run observed 88 GETs, `blockedApiRequests=[]`, zero mutations, and zero browser errors. The Blueberry challenge account and its settings were not changed. No EA reload, broker write, order, or backtest occurred.
