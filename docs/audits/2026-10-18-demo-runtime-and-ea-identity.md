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
