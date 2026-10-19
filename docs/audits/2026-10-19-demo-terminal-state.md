# Read-only demo terminal and runtime check — 19 October 2026

This follow-up covers the five configured non-Blueberry demo aliases only: `titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`, and `goldm15`. No terminal was opened, attached, reloaded, or modified by these checks. No broker order was sent and no Strategy Tester run was started.

## Main runtime and chart reads

Main is `8c21140ab0ea7f5bb7e72e3a646bb46e289edc66`. The guarded local runtime and the htown SSH upstream report the same startup and disk revision and digest `d47b79e9cd3acf75c9d4f9c4d3ec8b7547037bfdcb13873c5422f7ebaf573e36`; `applicationCodeDirty=false` and `restart_required=false`. The htown repository is clean on `main`; nginx is active and `sudo -n nginx -t` succeeds. The Chart Studio and Performance/UX workflows for this revision were still running when this note was written: [Chart Studio 39171763822](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39171763822), [Performance/UX 39171763804](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39171763804).

After the guarded local runtime restart, `scripts/smoke_live_chart_render_data.cjs` loaded 1,001 `MT5_VERIFIED` XAU M15 bars and visible candle pixels for all five aliases. Native-v5 preview checks found ten feed-bound market levels and seven Auto-Fibonacci levels per account. The run issued 91 API GETs, zero mutations, zero browser errors, and no Blueberry-scoped request. Read-only position status reported 1 position on `titan`, 1 on `xau5m_m5`, 3 on `titan_m5`, and none on `xau5m_500` or `goldm15`.

Ten direct read-only capture-status GETs returned Lifecycle `OK / ROLLING_WINDOW` for all five aliases. Decision Recorder was `IDLE` on `xau5m_m5`, `titan_m5`, and `goldm15`, and `NOT_CONFIGURED` on the two Marketplace aliases `titan` and `xau5m_500`.

## Terminal and EA evidence

The process-window inventory showed `titan` on XAUUSD/M15, `xau5m_500` on XAUUSD.p/M15, and `titan_m5` on XAUUSD.p/M1. The `xau5m_m5` and `goldm15` window titles did not expose a selected chart. The dashboard nevertheless read each account's configured XAU M15 feed. This M1-versus-M15 discrepancy for `titan_m5` remains unresolved; the terminal was not changed.

Current 19 October Experts logs in the demo data folders contain `XAU_Titan_Pro_BasketGuard` activity on `titan`, `xau5m_m5`, and `titan_m5`. The logs also contain `Copier_Sender_Master` activity on `titan` and `xau5m_m5`. The `xau5m_m5` and `titan_m5` logs report successful demo EA orders; these were EA-generated log events and not actions from this check. The latest inspected Experts log for `xau5m_500` is dated 15 October, and `goldm15` is dated 17 October, so neither provides current in-memory EA evidence. The logs do not establish which EX5 binary or `.set` file was loaded into memory. No EA attach, preset load, or copier action was performed.

## Protected-account handling note

Two incidental local reads exceeded the intended demo-only scope: the Windows process inventory included the protected terminal's process metadata and window title, and a bulk hash command computed the supplied Blueberry preset's SHA-256 without opening or printing its contents. No Blueberry MT5 API call, Experts/Journal log read, terminal interaction, preset-content read, or account change was performed. Subsequent checks used the explicit five-demo allowlist. This incident is recorded without reproducing the protected account identifiers or preset hash.

## Read-only drawdown and deal-history cross-check (19 October 2026)

A direct, sequential GET-only check covered only the five configured non-Blueberry demo aliases. It made no MT5 writes and returned `canExecute=false` for every available history. Four accounts returned fresh, scope-verified data; `xau5m_m5` returned HTTP 503 and was unavailable. The 30-day deal-history range was 19 September 16:34 UTC through 19 October 16:34 UTC; net values below sum profit, commission, swap and fee across verified deal rows.

| Demo alias | Initial balance | Current balance / equity | Verified deal rows / exits | 30-day net |
|---|---:|---:|---:|---:|
| `titan` | $10,000 | $10,319.72 / $10,347.35 | 59 / 28 | +$186.53 |
| `titan_m5` | $500 | $231.07 / $211.18 | 40 / 18 | −$268.93 |
| `xau5m_500` | $500 | $588.91 / $600.13 | 14 / 6 | +$88.91 |
| `goldm15` | $10,000 | $10,029.75 / $10,029.75 | 38 / 19 | +$29.75 |
| `xau5m_m5` | $250 | unavailable (HTTP 503) | unavailable | unavailable |

The best-supported current drawdown account is **`titan_m5`, the PU Prime $500 Titan demo**: its $268.93 realized net loss exactly accounts for the fall from $500 initial balance to $231.07 current balance. Current equity is $211.18. Its live status still has `challenge_protection=false`; the checked experts log has `XAU_Titan_Pro_BasketGuard` activity on `XAUUSD.p,M15` on 19 October, but no explicit drawdown-breach message. This proves a large demo drawdown, not a formal challenge-limit event or the in-memory EA/preset identity.

The separate historical `xau5m_m5` demo log still contains explicit 15 October messages of daily DD 3.57% versus 3.50% and total DD 9.21% versus 9.00%; its current terminal is offline. In the `titan_m5` demo's 15 October log, `Copier_Receiver_Blueberry` historically initialized on M15/M5 with Blueberry-branded limits, followed by a reset showing a $382.94 baseline and −$17.06 daily limit. These are entries from that demo's local log only. They do not show that the receiver remains attached or establish that it caused the current drawdown. The direct filesystem scan did not include a process-associated Roaming data path for the non-portable `titan` installation, so no claim about its local expert-log history is made here. No Blueberry account, API, process, terminal, preset or log was queried. No order, chart change or EA change was performed.
