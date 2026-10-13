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

Both demo terminals were observed as processes, but loaded binary and preset identity is not fully attested. GoldM15's attached EA remains unknown. Do not instrument, replace, attach, restart, enable trading, or claim fresh recorder data from either chart until a chart-bound manifest records terminal/account alias, chart symbol/timeframe, EA name, source hash, EX5 hash, preset hash, and capture timestamp. Any EA recorder integration must preserve current strategy logic and Titan's local Friday/weekend protections.
