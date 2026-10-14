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
## Saved chart profile evidence (not in-memory proof)

| Setup | Saved chart file | Symbol/timeframe | Saved EA path | Chart-file SHA-256 |
|---|---|---|---|---|
| Titan-Demo-A-M15 | Default/chart03.chr (12:40 local) | XAUUSD.pi M15 | Experts/XAU_Titan_Pro.ex5 | B64C06D4E4EBA2D3F283C68CDFEAA0FF0076176A18B8B327B694161E62430680 |
| Titan-Demo-B-M15 | Default/chart03.chr (17:17 local) | XAUUSD.p M15 | Experts/PrimeTitan/XAU_Titan_Pro.ex5 | 7CC50CC1C31B068AACC33877CDECD770CDC63A91AD119D7BBFB3B8B1E5928A7C |
| Titan-Demo-C-M5 | Default/chart02.chr (06:52 local) | XAUUSD.p M5 | Experts/XAU_Titan_Pro.ex5 | A06B4906FB982AEE79504CDC40AF615B5939C73DE9482DF8F2A35DB3A27DC99F |
| GoldM15-Demo-D-M15 | Default/chart05.chr (07:20 local) | XAUUSD M15 | Experts/GoldM15_Reconstruction.ex5 | 70392B53C1083B8687A5396A188099AF877BA461DE8740B025C6E206B7372A80 |
| XAUUSD-5Minute-Demo-B-M5 | Default/chart02.chr (17:17 local) | XAUUSD.p M5 | Experts/Market/XAUUSD 5 minute.ex5 | FEB5DAFA9F97CD7ABA2576CCA27AF9D8608591BEF7161C6BA97778B4187BBDB6 |

The first four profile entries line up with the four working aliases and the recent EA initialization logs. The XAUUSD 5 minute entry is an additional saved chart in the same terminal as Titan-Demo-B; no matching initialization message was found in that day's inspected Expert log, so it remains a profile-only candidate and may represent a fifth setup. Chart file hashes cover saved configuration bytes, not a binary loaded into process memory. Profile modification times are local machine time; Expert log times are not assumed UTC.
