# FR-017: 60-second live price-alert polling (2026-10-21)

Acceptance ran against local Main runtime `25ae4bd` in Chromium on the five explicitly allowed non-Blueberry demo aliases. Each alias loaded the visible Beta alert UI, established a baseline from a fresh `MT5_VERIFIED` quote, then kept a control alarm 1,000 price units away active for 60 seconds. The control alarm was not expected to cross.

| Demo alias | Symbol | Fresh quote | Monitored polls | Poll interval min / median / max |
|---|---|---|---:|---:|
| `titan` | `XAUUSD` | yes | 13 | 4,882 / 5,000 / 5,112 ms |
| `xau5m_m5` | `XAUUSD.p` | yes | 13 | 4,988 / 5,002 / 5,016 ms |
| `titan_m5` | `XAUUSD.p` | yes | 13 | 4,974 / 5,000 / 5,005 ms |
| `xau5m_500` | `XAUUSD.p` | yes | 13 | 4,987 / 5,001 / 5,014 ms |
| `goldm15` | `XAUUSD` | yes | 13 | 4,987 / 5,001 / 5,043 ms |

Across the five 60-second runs, the alarm stayed `Überwacht` and armed, all API requests were GET, and there were no broker mutations, blocked requests, Blueberry requests, or browser errors. The runner's alias allowlist was also checked to reject `blueberry` before browser launch. Reproduce with `node scripts/smoke_live_price_alert_poll_duration.cjs`.

The separate live-crossing smoke also triggered an actual price crossing on `xau5m_m5` and dispatched one notification through its explicit browser-notification test double. Native Windows/browser notification delivery and physical DPI/device acceptance are still open.
