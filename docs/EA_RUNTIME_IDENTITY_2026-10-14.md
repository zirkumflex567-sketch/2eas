# MT5 EA runtime identity findings

Inspection date: 2026-10-14. Inspection was read-only. This record contains no account login, credentials, or terminal data path.

## Titan

- The visible MT5 chart is an ICMarketsEU-Demo XAUUSD M15 chart and its accessibility tree names the attached EA `XAU_Titan_Pro`.
- This proves the chart's displayed EA name only. MT5 did not expose a verifiable in-memory binary digest or loaded preset through the read-only inspection.
- The installed `.mq5` source matches the dirty root source byte-for-byte (SHA-256 `ABF32BBA67C0E186F136B99C376888F9B787005428C5A7B34B39566884399CDE`, 41,149 bytes). It differs from clean `main` (`XAU_Titan_Pro.mq5` SHA-256 `518BFF6D8F729261BA807C5D8F1FCA023CF6AD2BAF46D7D2BE9E907EA24DC0D2`, 38,694 bytes) by Friday/weekend trade protections. Those user-local rules must not be discarded.
- An installed compiled binary exists, but its file hash is not proof of the image loaded by the chart. Journal initialization records show the EA name, not source/binary/preset identity.

## GoldM15

- The configured demo terminal process was running, but its chart window was not visible to the read-only UI inspection.
- Journal records name `GoldM15_Reconstruction` initialization and state that stop mechanics are reconstructed while entry/exit signals remain unverified approximations. This does not establish which chart is currently open or which EX5/preset it holds.
- Multiple on-disk candidates exist: a user-local source, an installed v1.22-folder source/binary, and a default older source/binary. Their differing hashes and timestamps identify files only, not an active chart image. A separate new GoldGuard binary was also present without a corresponding recent initialization record.

## Decision

Four terminal processes were open during the read-only follow-up. Recent Expert logs show Titan initialized in three terminals and GoldM15_Reconstruction initialized on XAUUSD M15 in the fourth; the GoldM15 log is in the MT5 roaming data folder, not beside terminal64.exe. The portable terminal also contains a saved XAUUSD 5 minute M5 profile. An initialization line with no subsequent deinitialization line in the inspected log supports an attached-at-last-log state, but a log is not an in-memory binary or preset attestation.

| Working alias | Logged chart / EA | Latest relevant initialization | Installed file evidence |
|---|---|---|---|
| Titan-Blueberry-M15 | XAUUSD.pi M15, XAU_Titan_Pro | 2026-10-14 16:06; later EA activity logged through 17:44 | XAU_Titan_Pro.ex5 hash A03DC3B90E6B92902469CD17BA75F21665F55E70298F1F5B59D6085CAF93FE78; source candidate 7.10. |
| Titan-PUPrime-M15 | XAUUSD.p M15, XAU_Titan_Pro | 2026-10-14 16:05; later EA activity logged through 17:44 | Common Titan EX5 hash above and a separate PrimeTitan EX5 hash 6C91D02508890FDE99E50D82612996D216FED607C03BD82D18D4C7799F214A58; source candidate for the latter is version 7.25. Saved profile points at PrimeTitan, but the loaded image is unresolved. |
| Titan-PUPrime-M5 | XAUUSD.p M5, XAU_Titan_Pro | 2026-10-14 16:05; later EA activity logged through 17:44 | Common Titan EX5 hash above; source candidate 7.10. |
| GoldM15-ICMarkets-M15 | XAUUSD M15, GoldM15_Reconstruction | 2026-10-14 07:18; no later deinitialization line found in that day's inspected Expert log | GoldM15 source hash AD898E5A8A10DF7F55512B64DA63A25C884241678565E89A3363BF04715B346A; EX5 hash B7C2345FFA921882A13FA9AB05E1BDAB96C18B75924CFF7AF169E3A3349BB0B1; nearby preset GoldM15_Reconstruction.set hash 0366CC4A161E44A6D33BE09BD1D769FF908BCC8D4AB7F8000D94E963BAC2D4F4. Installed source is an older candidate than repository 1.22. |

These are local working aliases, not application account configuration. Terminal executable paths, exact account identifiers, and server names are intentionally not stored in the tracked ledger. The log timestamps are MT5 log timestamps; do not treat them as UTC without the separate broker-clock mapping.

The Market XAUUSD 5 minute binary appears in installed folders with differing hashes; a saved chart profile alone does not prove it is attached. The provided boss.set hash is D3734028E87C09E8C9017E271E7AFD76B73F7556E70ADD557AA612A82A2C9733. Saved chart-profile inputs differ from that preset in some fields, and the API/logs cannot prove which setfile is loaded in memory.

This corrects the earlier two-terminal/unknown-Gold observation. Four live terminal processes and four chart setups still do not equal four fully attested strategy identities: logs prove EA names and symbols/timeframes, while installed-file hashes do not prove which binary image is loaded. Do not replace or attach binaries, restart terminals, change trading switches, or claim recorder data until each setup's alias, chart identity, loaded binary and preset are confirmed. Preserve the local Titan Friday/weekend protections.
## Current read-only process/log follow-up (2026-10-14 16:18 UTC)

The four `terminal64.exe` processes were enumerated again by executable path. Their 14 October Expert logs currently show `XAU_Titan_Pro` activity in all four processes, not a current `GoldM15_Reconstruction` initialization: one process has fresh `XAUUSD.pi` M15 and M30 initializations; the research portable process has `XAUUSD.p` M15; another PU Prime portable process has `XAUUSD.p` M5; and the installed PU Prime terminal has `XAUUSD` M15 (with earlier H1/M15 chart initializations). These are log observations, not proof that each chart is still attached now. Exact account IDs and executable paths are intentionally omitted. A search of those four daily logs found no `GoldM15_Reconstruction` or `XAUUSD 5 minute` lines.

The configured read-only `/api/accounts` list currently exposes five aliases (`blueberry`, `titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`) while four terminal processes are running. This account list does not map a process or chart to an account; no account-switching API was called. The installed `XAU_Titan_Pro.ex5` file in each inspected active data root has SHA-256 `A03DC3B90E6B92902469CD17BA75F21665F55E70298F1F5B59D6085CAF93FE78`; the colocated `.mq5` source is `ABF32BBA67C0E186F136B99C376888F9B787005428C5A7B34B39566884399CDE`. These on-disk hashes still cannot attest the in-memory image. No chart `.chr` in the four active data roots was modified on 14 October, so there is no fresh persisted chart/preset binding. `boss.set` remains SHA-256 `D3734028E87C09E8C9017E271E7AFD76B73F7556E70ADD557AA612A82A2C9733`; no log or current saved chart proves it is loaded.

Accordingly, the older four-row mapping above is historical and must not be used as the current four-terminal assignment. Four running processes are verified, but the current account-to-process, chart-to-preset and in-memory-binary bindings remain unresolved; there is also no current evidence of an attached GoldM15 or XAUUSD 5 minute EA. No terminal, chart, EA, preset, trading switch, or order was changed during this follow-up.

## Saved chart profile evidence (not in-memory proof)

| Setup | Saved chart file | Symbol/timeframe | Saved EA path | Chart-file SHA-256 |
|---|---|---|---|---|
| Titan-Demo-A-M15 | Default/chart03.chr (12:40 local) | XAUUSD.pi M15 | Experts/XAU_Titan_Pro.ex5 | B64C06D4E4EBA2D3F283C68CDFEAA0FF0076176A18B8B327B694161E62430680 |
| Titan-Demo-B-M15 | Default/chart03.chr (17:17 local) | XAUUSD.p M15 | Experts/PrimeTitan/XAU_Titan_Pro.ex5 | 7CC50CC1C31B068AACC33877CDECD770CDC63A91AD119D7BBFB3B8B1E5928A7C |
| Titan-Demo-C-M5 | Default/chart02.chr (06:52 local) | XAUUSD.p M5 | Experts/XAU_Titan_Pro.ex5 | A06B4906FB982AEE79504CDC40AF615B5939C73DE9482DF8F2A35DB3A27DC99F |
| GoldM15-Demo-D-M15 | Default/chart05.chr (07:20 local) | XAUUSD M15 | Experts/GoldM15_Reconstruction.ex5 | 70392B53C1083B8687A5396A188099AF877BA461DE8740B025C6E206B7372A80 |
| XAUUSD-5Minute-Demo-B-M5 | Default/chart02.chr (17:17 local) | XAUUSD.p M5 | Experts/Market/XAUUSD 5 minute.ex5 | FEB5DAFA9F97CD7ABA2576CCA27AF9D8608591BEF7161C6BA97778B4187BBDB6 |

The first four profile entries line up with the four working aliases and the recent EA initialization logs. The XAUUSD 5 minute entry is an additional saved chart in the same terminal as Titan-Demo-B; no matching initialization message was found in that day's inspected Expert log, so it remains a profile-only candidate and may represent a fifth setup. Chart file hashes cover saved configuration bytes, not a binary loaded into process memory. Profile modification times are local machine time; Expert log times are not assumed UTC.

For GoldM15-Demo-D-M15, the chart profile contains 70 EA input values. Comparing those saved values with the nearby GoldM15_Reconstruction.set shows 68 exact string matches; MaxAccountStopRiskUSD is numerically the same (275.0 vs 275), while AllowLiveTrading differs (chart profile true, preset false). The profile therefore proves a saved chart override, not that this preset file was loaded unchanged. No setting was modified.

## Latest process and file check (2026-10-14 19:31 local)

The user clarified that **four strategies** are in use and supplied `Desktop/boss.set`; this is retained as user-provided scope, not inferred from the EA labels below. A fresh `Win32_Process` enumeration found four running `terminal64.exe` processes: the Titan-Demo-619 and Titan-Demo-PUPrime portable instances, the installed PU Prime terminal (Titan-Demo-Installed), and the separate Research terminal. The Titan-Demo-822 portable instance appeared in an earlier enumeration during this inspection but was no longer running in the final snapshot. No terminal was launched or changed.

The 14 October Expert logs for the four account-instance directories contain `XAU_Titan_Pro` initializations on gold symbols across M5/M15 and, in some instances, M30/H1. The separate Research terminal also has `XAU_Titan_Pro` entries. These same-name EA log entries do **not** establish that there is only one strategy: different chart inputs/presets can define separate strategies, and the current attached input sets are not available from those logs. Conversely, these logs do not independently prove four distinct active strategies. Neither a current GoldM15_Reconstruction nor an XAUUSD 5 minute initialization was found in the inspected 14 October logs; the saved-profile rows above remain older, non-live evidence.

The installed `MQL5/Experts/XAU_Titan_Pro.ex5` in each of the four account-instance data roots had the same on-disk SHA-256 `A03DC3B90E6B92902469CD17BA75F21665F55E70298F1F5B59D6085CAF93FE78` (last modified 2026-10-14 08:23:18 local). This still cannot attest an already loaded in-memory image. The supplied `Desktop/boss.set` has SHA-256 `D3734028E87C09E8C9017E271E7AFD76B73F7556E70ADD557AA612A82A2C9733`; its presence and hash do not show which chart, if any, loaded it. Account-to-process binding and exact four strategy/preset identities remain unresolved. No account number, password, or token was added to this file.

## User-directed read-only follow-up (2026-10-14 20:00 local)

The user clarified that four distinct strategies are currently in use, all on gold, using either `XAU_Titan_Pro` or `XAUUSD 5 minute`, with `Desktop/boss.set` supplied. A fresh process enumeration found four running MT5 processes: three PU Prime terminal instances and a separate Research portable terminal. This is a process count, not proof that the Research process corresponds to a fourth live account. Process start times were 07:17, 07:41, 14:05 and 15:13 local.

The latest 14 October Expert logs in those four process-associated data roots show `XAU_Titan_Pro` initialization/activity on gold M5 and M15 charts. The log entries include multiple timeframe setups within terminal roots and differing initialization state across roots; this is compatible with distinct strategy configurations, but does not recover the four intended strategy labels or prove which `.set` preset each chart currently uses. MT5 logs and saved files do not expose an in-memory EX5 digest or definitive loaded-preset digest.

The `GoldM15_Reconstruction` initialization found in the roaming data root belongs to an IC Markets installation whose terminal process was not among the four processes in this 20:00 snapshot. This snapshot therefore does not confirm a currently running GoldM15 chart. No `XAUUSD 5 minute` initialization appears in the four process-associated logs inspected. Saved profiles and numerous on-disk presets are candidate evidence only. `boss.set` remains on disk with the previously recorded SHA-256; there is no proof it is the preset loaded by a current chart.

The user's four-strategy scope and the four running processes are recorded separately. EA-name/timeframe evidence is available from logs; a verified mapping of all four strategy identities to account alias, chart, exact preset, and in-memory binary remains unavailable from these read-only file/log sources. No terminal or chart was changed, and no login, password, or account number was queried or recorded.

## User-provided five-preset inventory (2026-10-14 22:55 local)

The user supplied the folder `Downloads/backtest/set` as containing preset files for five MT5 instances. A read-only scan found these files; the hashes identify file bytes only and do not prove an attached chart loaded them.

| Candidate preset | Parameters | Modified (local) | SHA-256 |
|---|---:|---|---|
| `blueberry10k.set` | 50 | 22:51:23 | `D3734028E87C09E8C9017E271E7AFD76B73F7556E70ADD557AA612A82A2C9733` |
| `icmarkets10k.set` | 50 at initial scan; superseded below | 22:53:58 | `7828A448DBD943907E5162143B2B313519F130BA7ECD9A1A4F10414577EE7A9C` (superseded) |
| `puprime250.set` | 50 | 22:52:15 | `FF92CE8710E151CB73D304E411338C411DB487BC3983F15EEC541138A0AEA286` |
| `puprime500.set` | 50 | 22:53:08 | `FEB3030FEE155BB41E8604A67117519F97DB00BEAC614E103180813FAF697E69` |
| `xauusd5min15m.set` | 4 | 22:55:13 | `32880024DC1ACCA8F31C75718D82ABD190D971350AB51C21131D648FF27C0385` |

A 23:08:55 local read-only process snapshot found five `terminal64.exe` processes, including the previously reported `xauusd5min15m` instance (start 22:50:38). The user later confirmed that the instance had been deliberately restarted and should be included in the test scope. The five preset filenames are useful candidate labels, but terminal/account/chart/timeframe/EA attachment and which four correspond to the user's four strategies are not yet attested. No preset was opened by MT5 or changed; no chart, terminal, EA, switch, or order was modified.

## User-provided account mapping (2026-10-14, subsequent clarification)

The user confirmed that `xauusd5min15m` was deliberately turned back on and an EA attached; include that instance in the test scope. The user supplied these preset-to-account labels:

| Preset | User-provided account/EA label |
|---|---|
| `blueberry10k.set` | Blueberry account |
| `icmarkets10k.set` | ICMarkets $10k account |
| `puprime250.set` | PU Prime $250 account |
| `puprime500.set` | PU Prime $500 account |
| `xauusd5min15m.set` | The other PU Prime $500 account, running the Marketplace EA |

These account labels and the Marketplace EA attachment are user-provided. Exact terminal process/account binding, visible chart symbol/timeframe, loaded binary/version, and in-memory preset remain to be verified from read-only runtime evidence. The earlier user statement described four strategies; the supplied mapping now covers five account/preset instances, so the count of distinct strategies is intentionally not inferred from the account count. No chart or EA was controlled, no preset was applied, and no trade was initiated during this inspection.

The user subsequently confirmed changing both the EA and preset on the ICMarkets $10k account to Marketplace EA `XAUUSD 5 minute`. A read-only recheck at 23:16 found the replacement `icmarkets10k.set` to be 306 bytes with four inputs (`AB_C`, `AB_K`, `Entry_Amount`, `Use_Swing_SL`) and SHA-256 `C0320BE28583C9376852B0946C57F36742CC1120EFDD525DA35A5A89A9211E04`; this supersedes the 50-input hash in the initial scan. The user asked to include this EA in testing. Its attached chart and loaded EX5 identity remain to be verified without reloading the chart.

## Read-only process and preset refresh (2026-10-15 00:34 local)

A fresh process-image check found five running `terminal64.exe` processes. Their executable paths match five of the six distinct terminal paths configured in `account_gateway.py`; the separate configured GoldM15 path is not running. This is a configured-path/process match only and does not authenticate the broker account, attached chart, symbol/timeframe, or in-memory EA/preset. A fresh file-only hash scan of the five user-provided presets found the same hashes recorded above, including the four-input ICMarkets Marketplace preset `C0320BE28583C9376852B0946C57F36742CC1120EFDD525DA35A5A89A9211E04`. The Marketplace identity for ICMarkets is user-confirmed; current attachment and loaded binary remain unverified. No account login was queried, and no terminal, chart, EA, preset, or order was changed.

## User-directed process/log refresh (2026-10-14 22:00 local)

A fresh `Win32_Process` snapshot still shows four `terminal64.exe` processes: three PU Prime terminal installations and one separate Research portable terminal. The user confirmed that account `xauusd5min15m` is intentionally off; that instance is absent from this snapshot. No process arguments, account number, or credentials were read into the report.

The active process-associated Expert logs contain Titan initialization/activity on gold M5/M15, with some additional M30/H1 initializations. No current `GoldM15_Reconstruction` or `XAUUSD 5 minute` initialization appears in the four active process-associated logs. A roaming IC Markets log still contains an older GoldM15 M15 initialization, but its originating terminal is not among the four current processes and does not establish a live attachment. Saved chart profiles in the process directories have not been updated since March; they cannot bind the current charts to the user's four named strategies.

This confirms process presence only. The four strategy-to-terminal/chart/preset mappings are still pending the user's later preset list; the in-memory EX5 and applied preset hashes remain unverified. No MT5 window was controlled, no terminal/chart/EA/preset was changed or restarted, and no orders were sent. The next useful runtime capture depends on the four mappings and read-only evidence from the attached charts; backtesting remains deferred.

## User-confirmed Marketplace swap (2026-10-15 01:26 local)

The user explicitly confirmed that the ICMarkets $10k setup was changed to the Marketplace EA `XAUUSD 5 minute`, matching the already recorded four-input `icmarkets10k.set` file. The other Marketplace setup is `xauusd5min15m` on the second PU Prime $500 account. This updates the earlier uncertainty about which EA the user intends for ICMarkets; it does not attest the running chart's current in-memory EX5 or prove that the saved preset has been loaded. The remaining three preset/account pairs are Blueberry $10k, PU Prime $250, and PU Prime $500, with EA identity on those charts not newly re-observed in this clarification. Five account/preset instances remain distinct from the user's count of four strategies. No MT5 chart, terminal, preset, or trading control was changed during this documentation update.

## Read-only runtime and Marketplace source check (2026-10-15 01:30 local)

Five `terminal64.exe` processes were running. The user's five account/preset mappings and two Marketplace-EA assignments are recorded above; this read-only scan did not inspect chart windows. The three Marketplace EA copies found under `Documents/goldm5` are compiled `XAUUSD 5 minute.ex5` files with the same SHA-256 `52C0562DA995C1A04CC07C18DF28D991CDAE8474EE19D3BFB71827E375D057CA`; no corresponding `.mq5` source exists in the searched terminal roots. Recent process-associated Expert logs show Titan initialization/activity, and no Marketplace EA initialization. This cannot attest that a Marketplace chart is or is not currently attached; it does establish that source-level Marketplace decision instrumentation cannot be added from the installed binary alone.

The local loopback dashboard and htown's reverse-tunnel upstream return the same runtime identity: startup revision `6ed335bee3bbde45def943b245046d046e76a40a`, disk revision `765268c85d7f9d2f23b88d6674a7701ea9a099a8` (the root workspace's research branch), and `restart_required=true`. Current `origin/main` is `13093030819b9e73adf1f3a1e35c6ac9440bd418`. nginx is active and `nginx -t` passes; unauthenticated public `/stt/api/runtime` returns 401 as configured. An authenticated public identity check was not performed. No deployment or process restart was done: the guarded launcher refuses to stop a listener whose checkout identity differs from the target checkout, and the root workspace is deliberately left on the user's research branch. The runtime is therefore not verified as current `main`.


## Read-only runtime follow-up after main merge (2026-10-15 00:36 UTC)

The local guarded status check found listener PID 43688 on `127.0.0.1:8050`, started at `2026-10-14T23:17:23.142046Z`. Its startup revision is `6ed335bee3bbde45def943b245046d046e76a40a`; disk revision is `765268c85d7f9d2f23b88d6674a7701ea9a099a8`, `applicationCodeDirty=false`, and `restart_required=true`. Current main after PRs #44/#45 is `867da50c69a780a0d8530578958165084fd0f782`. The direct htown reverse-tunnel upstream at `127.0.0.1:8055` returned the same runtime identity with HTTP 200. nginx is active and `nginx -t` succeeds. The first three-second upstream request timed out; a subsequent bounded request returned 200, so the tunnel/upstream is reachable but not proven latency-stable. No authenticated public `/stt` identity check was performed.

Five `terminal64.exe` processes were present. Local read-only `/api/status` calls to all five configured aliases returned `source_fresh=true`: `blueberry` → `XAUUSD.pi/M15`, `titan` → `XAUUSD/M15`, `xau5m_m5` → `XAUUSD.p/M5`, `titan_m5` → `XAUUSD.p/M5`, and `xau5m_500` → `XAUUSD.p/M15`. Reported quote ages ranged from -0.27 to -1.04 seconds, within the application’s configured five-second future-timestamp tolerance; this is not by itself a freshness failure. Alias feeds do not prove process-to-account, visible chart, attached EA, in-memory EX5, or loaded preset identity. No terminal/chart/EA/preset, order, local dashboard process or remote service was changed.

The dashboard remains on a different checkout/revision from current main. The guarded launcher refuses to stop a listener owned by that other checkout, and the private runtime configuration needed to preserve operation has not been identified for an exact-main start. The `/stt` runtime therefore remains stale pending a safe checkout/configuration handoff.

## Read-only terminal and runtime refresh (2026-10-15 04:17 UTC)

The user clarified that the charts are intended to be XAUUSD/M15, Blueberry alone has critical challenge protection, and all other accounts are demo/test. I matched the five running `terminal64.exe` paths to `account_gateway.py`; the path named `mt5_strategy_research/.../portable` is the configured PU Prime $250 `xau5m_m5` account, not a sixth research account. The fifth process is therefore the fifth configured account terminal.

| Configured alias | Matched running terminal | Configured symbol/timeframe | Latest process-associated Expert-log evidence |
|---|---|---|---|
| `blueberry` | `.mt5-puprime-700194619` | `XAUUSD.pi/M15` | `XAU_Titan_Pro` M15 activity; no DD-breach line in the inspected 15 October log. |
| `titan` | installed `PU Prime MT5 Terminal` path | `XAUUSD/M15` | Configured as ICMarkets demo/Marketplace by the account map and user's EA confirmation; current Marketplace attachment is not visible in logs. |
| `xau5m_m5` | `mt5_strategy_research/.../portable` | `XAUUSD.p/M5` | `XAU_Titan_Pro` initialized on `XAUUSD.p/M15`; log contains the DD-breach/halt messages below. The log timeframe differs from the configured feed timeframe. |
| `titan_m5` | `.mt5-puprime` | `XAUUSD.p/M5` | `XAU_Titan_Pro` M5 activity in the 15 October log. |
| `xau5m_500` | `.mt5-puprime-700194822` | `XAUUSD.p/M15` | Prior-day Titan M5 initialization only; no current Marketplace initialization line. User confirmed this alias is the other PU Prime $500 Marketplace setup. |

The DD messages at 02:12–02:14 in the `xau5m_m5` process-associated log report daily DD of 3.57% against 3.50%, followed by total DD of 9.21% against 9.00% and a permanent EA halt. Although the log text says `BLUEBERRY RISK BREACH`, the process-to-alias mapping and approximately $250 daily-start value identify this as the PU Prime $250 demo terminal, not Blueberry. This is a log-level account attribution; no current position readback was taken from that terminal. The Blueberry process is separate and its configured M15 log shows Titan activity without that breach message. The user's clarification about which account is critical is preserved; no conclusion about the Blueberry challenge state is drawn from the other account's log.

The local dashboard listener on port 8050 and htown's direct loopback upstream on port 8055 both respond. Both report startup revision `6ed335bee3bbde45def943b245046d046e76a40a`, disk revision `765268c85d7f9d2f23b88d6674a7701ea9a099a8`, `applicationCodeDirty=false`, and `restart_required=true`; this is the old Research-checkout code, not current `main` (`e91a535`). Port 8055 is not a local listener. All five configured account aliases returned `source_fresh=true` with quote ages inside the configured tolerance. The status endpoint does not attest current chart attachment, loaded preset, or in-memory EX5. No MT5 UI, chart, preset, EA, order, or terminal process was changed. A clean-main restart remains blocked by the launcher's checkout-identity guard until a safe runtime handoff is arranged.

## Current read-only process, Expert-log and chart-profile refresh (2026-10-15 03:16 UTC)

At that time, five `terminal64.exe` processes were interpreted as four account terminal installations and a separate Research portable terminal. The later path-to-alias match above corrects that interpretation: the portable path is the configured `xau5m_m5` PU Prime $250 demo account. Process command lines and account credentials were not read. The configured GoldM15 `.mt5-demo` terminal path is not among the running processes.

The latest process-associated Expert logs inspected on the running terminals contain Titan activity for `XAUUSD.p/M15`, `XAUUSD.p/M5`, and `XAUUSD.pi/M15`. The newest corresponding log timestamps are 00:14 UTC for the Research terminal and 03:00 UTC for the two portable account terminals. A separate network log in the `XAUUSD.pi/M15` terminal records a reconnection whose final server name is `BlueberryMarketsSVG-Live`; no account number was retained. These log rows do not bind an EA instance to its current visible chart or preset.

No `GoldM15_Reconstruction` or `XAUUSD 5 minute` entry appears in the current-day process-associated Expert-log matches. Two of the five active terminals yielded no recognized EA name in the inspected Expert logs. This is absence of a current initialization/activity record, not proof that the EA is detached. Exact chart attachment, loaded EX5 hash, preset hash and last attach/reload time are therefore still unresolved. No terminal/chart/preset/EA was changed or restarted, and no trading operation or Strategy Tester run was initiated by this inspection.

A read-only scan of the four account installations' saved `profiles/charts/*.chr` files found only chart-profile timestamps from 2026-03-06; these old saved files cannot establish the charts or inputs currently loaded in the running terminals. The Research process had no chart files in the two checked profile roots. The scan did not open MT5 or read window state.
