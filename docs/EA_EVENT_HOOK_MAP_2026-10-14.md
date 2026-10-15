# EA event-hook map (checked-in candidates and observed installations)

Date: 2026-10-14. This is a read-only source review for package 1. It maps checked-in candidates plus files/logs observed in four running terminals. The initial log scan showed Titan on three and GoldM15 on the fourth; the later 16:18 UTC scan showed Titan on all four and is recorded below. Neither scan attests in-memory binary or preset identities. No EA source or preset was changed, no terminal was started, and no trading operation was performed.

## Identity boundary

The candidate sources below are tracked at commit `84f3d18`. Their hashes are reproducible file identities, not runtime attestations.

| Candidate | SHA-256 | Supporting file hashes |
|---|---|---|
| `XAU_Titan_Pro.mq5` v7.10, 40,291 bytes (2026-10-15 account-neutral risk-log labels) | `B3879DB6800FF31A421BA7D353EC107BDE739E20F9102E34C2FA62F2E1F6CB3A` | standard MetaTrader `Trade`, `SymbolInfo`, `PositionInfo` includes |
| `goldm15/GoldM15_Reconstruction.mq5` v1.22, 17,267 bytes | `9651F8D86B6243510251A8898D0A0B96ABEA50B57B3D425709A232AA8736FEFC` | `GoldM15_Core.mqh` `F85F2E6A7499884E950EDF715F462F6E92FFE204B4F4F84F12C6A8E7004C91E1`; `GoldM15_Risk.mqh` `A7597935174B7283E8DF57902FB01AB8D7CCA0C584B5ADC6ED83920230EBE3B5`; `GoldM15_RiskCore.mqh` `096D2B4D98DA67001B381028C615AD5612135482F7D58CB585574A293968335A`; `GoldM15_News.mqh` `54CF4DD2884D90FB2040B3E78AC246B22D1E8B5A168318EE75814431C2DA70B6`; `GoldM15_Reconstruction.set` `E6C517DD9E5FC26A4D257506A493163D43BBC52A3B1032479EB8AED89D6EFA40` |

`docs/EA_RUNTIME_IDENTITY_2026-10-14.md` records that Titan's installed source file matched a different, user-local source and differed from the checked-in source by Friday/weekend protections. Its in-memory EX5 and preset remain unverified. For GoldM15, several source/binary candidates exist and the currently attached chart is unknown. The `.set` hash above is only the repository candidate preset. Neither candidate may be substituted for the active chart identity.

## Titan candidate hooks

| Event | Checked-in source location | Current behavior and capture point |
|---|---|---|
| Initialization / identity | `XAU_Titan_Pro.mq5:201` `OnInit`; `:249` `OnDeinit` | Indicator handles, symbol and risk state are initialized. There is no source/binary/preset runtime manifest and no `OnTradeTransaction` callback. A future producer can emit initialization metadata only after its own identity is established from the verified chart. |
| Candidate evaluation | `:284` `OnTick`; `:413` `CheckSignalAndTrade` | `OnTick` first updates day/prop protection, then returns for lockouts, manages positions, and evaluates entries only on a new calculation-timeframe bar inside the session/position limits. `CheckSignalAndTrade` reads closed-bar EMA/RSI/ATR/rates, computes swing levels and filters, then evaluates base long/short predicates and overextension/run/SR rejects. The exact feature vector and each rejection reason belong at these already-computed branch points; a recorder must not recalculate or change predicates. |
| Order attempt / result | `:546` BUY and `:582` SELL inside `CheckSignalAndTrade` | CTrade requests are retried up to three times with `Sleep(200)` between failed attempts. Any event enqueue must be bounded and non-blocking; file IO, serialization, network and database work cannot be added to this path. A returned CTrade result is not a confirmed fill. |
| Position management | `:597` `ManageOpenPositions`; stop modifications at `:633` and `:643`; close helpers at `:776` | Break-even changes and closes occur in management/risk branches. Actual modifications/fills must come from broker transaction/history evidence, not from function return alone. |

## GoldM15 candidate hooks

This is explicitly the reconstructed candidate, not a verified original strategy. Its own comments mark the three systems' original signals unverified.

| Event | Checked-in source location | Current behavior and capture point |
|---|---|---|
| Initialization / parameter identity | `goldm15/GoldM15_Reconstruction.mq5:132` `OnInit`; inputs `:10–89`; `:173` `OnDeinit` | Resolves signal timeframe, creates RSI handles, validates account mode/config and initializes the risk guard. The producer would need the exact normalized inputs and source/include/preset hashes. The checked-in `.set` is not evidence of the active preset. |
| Candidate evaluation | `:224` `RefreshSignals`; `:271` `OnTick` | Closed-bar RSI/swing/momentum values update `pending_open`/`pending_close` once per signal bar. `OnTick` services the risk guard and live-trading gate before the request path. Candidate, reject and guard outcomes must be captured where those booleans are decided; pending intent is not a broker order. |
| Risk rejection | `goldm15/GoldM15_Risk.mqh:234` `Service`; `:342` `CanEnter`; `:369` `EndEntry` | The guard validates state, rollover/news/holiday, spread, stops, account stop risk, margin and budgets; `rejects` is only an aggregate counter today. Exact failure reason needs an explicit future reason code at each predicate. Do not infer it from the counter. |
| Order attempt / close intent | `GoldM15_Reconstruction.mq5:295` `PositionClose`; `:320–321` `Buy`/`Sell`; `:333` `OnTimer` | Entry submission reserves a request before CTrade and records its result/order; protective close intent persists until the position disappears. Risk service may also close/delete orders in `GoldM15_Risk.mqh:128` and `:140`. Capture actual transactions and partial fills separately from these intents. |

## Shared capture design implications

- Neither checked-in EA defines `OnTradeTransaction`; broker lifecycle events must be added only after chart-bound identity approval and compile review.
- Keep decision capture on existing evaluated values. Use a bounded in-memory queue on tick/transaction callbacks and drain from a timer to the private spool. Queue overflow or spool failure increments a visible lossy counter and returns immediately; it must not block or alter an entry/exit branch.
- Bind events to verified account alias, terminal identity, producer/source hash, preset hash, event sequence and UTC capture time. Do not put passwords, tokens or raw account credentials in the spool.
- The Python importer may link only broker-proven order/deal/position identifiers. Existing deals without recorded events remain `NOT_RECORDED`; OHLC-only MFE/MAE stays estimated and cannot establish intrabar order.

## Verification boundary and next step

Source locations, repository file hashes and hook semantics were inspected with read-only repository commands. No MQL compiler run is claimed by this map. Before any EA edit, collect the requested chart-bound terminal/account alias, terminal path, symbol/timeframe, attached EA/version, loaded EX5 identity, preset identity and attach/reload time for each chart. Re-hash source and preset files from those exact terminal data folders; source and installed-file hashes still cannot attest an already loaded in-memory binary. Until that manifest is available, retain the existing recorder as opt-in and disabled and do not claim live captures.

The neutral status-label follow-up on 15 October compiled both current checked-in source candidates from ignored copies with MetaEditor 5.0.0.6230. The isolated outputs were `XAU_Titan_Pro.ex5` SHA-256 `E52151B08B7DA56935B040D829B535FC2DEEACB5C247AE6BC82DE1C73D9DFE41` and `XAU_Titan_Pro_BasketGuard.ex5` SHA-256 `977989956D34C69A56EAA954896350FB45A2AABD0BFF172D3C1AD11D6F56ED33`; both logs report zero errors/warnings. These remain uninstalled candidate artifacts.

## Additional observed EA artifacts

### 2026-10-15 drawdown-label correction

The checked-in Titan candidates previously prefixed daily and total drawdown guard messages with `BLUEBERRY RISK BREACH` and phase completion with `BLUEBERRY GOAL REACHED` on every account. The PU Prime $250 `xau5m_m5` log therefore used a misleading account label. Both `XAU_Titan_Pro.mq5` and `XAU_Titan_Pro_BasketGuard.mq5` now use account-neutral risk and profit-target labels; risk and target log lines include broker server, chart symbol, and chart timeframe. HUD target status is account-neutral too. The changes do not modify thresholds, branch conditions, close calls, or lockout behavior. Parameterized source contracts and BasketGuard contracts pass (10 tests). Isolated MetaEditor 5.0.0.6230 compiles report zero errors and zero warnings for both copies. These candidates have not been installed or attached, and the log finding does not attest which exact source/binary produced a live message; in-memory identity remains unresolved.

| Artifact | Evidence | Recorder implication |
|---|---|---|
| PrimeTitan/XAU_Titan_Pro.ex5 | Separate installed binary hash 6c91d0…f214a58; a sibling source candidate named XAU_Titan_Pro_25k.mq5 is version 7.25. A saved chart profile associates it with a Titan setup. | Treat as a separate producer/version only after its exact chart, source, binary and preset are attested. The checked-in 7.10 hook map cannot be assumed to describe 7.25 behavior. |
| Market XAUUSD 5 minute.ex5 | Closed-source Market binary, version recorded in terminal research notes as 7.3; one saved M5 chart profile exists. No corresponding source was found in the checked-in research locations. | Do not reverse-engineer or modify the binary. Its internal candidate/reject reasons cannot be captured from EA source; broker transactions may be observed independently and decisions must remain NOT_RECORDED. |
| Earlier four-terminal runtime inventory | Four terminal processes were open; the initial log scan showed Titan in three and GoldM15 on XAUUSD M15 in the fourth. In-memory binary and preset identities remained unresolved. | Historical only; see the current follow-up below. |
| Current runtime follow-up (16:18 UTC) | Four terminal processes are running; their 14 October logs show XAU_Titan_Pro on all four with XAUUSD.pi M15/M30, XAUUSD.p M15, XAUUSD.p M5 and XAUUSD M15 chart initializations. No GoldM15_Reconstruction or XAUUSD 5 minute initialization line was found in those four daily logs. `/api/accounts` lists five aliases, with no process/chart mapping established. | Do not make process-count=producer-count assumptions or map producer IDs from configured aliases alone. Resolve account identity, current chart attachment, in-memory binary and preset first. |
