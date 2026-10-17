# Chart Studio MT5 calendar bridge

These presets bind the read-only `ChartStudioCalendarBridge` EA to one of the
four authorized demo aliases. In MT5, open a separate XAUUSD M15 chart (use the
broker's exact XAUUSD symbol), attach `ChartStudioCalendarBridge`, then use the
matching `.set` file on the EA's **Inputs** tab. Do not attach it to a chart
that already runs a trading EA; the bridge refreshes every 60 seconds and only
writes `MQL5/Files/chart_studio_calendar.json`.

| MT5 dashboard alias | Preset |
| --- | --- |
| `titan` | `titan.set` |
| `xau5m_m5` | `xau5m_m5.set` |
| `titan_m5` | `titan_m5.set` |
| `xau5m_500` | `xau5m_500.set` |

The EA verifies its configured alias against the broker login and server and
refuses to write on a mismatch. Blueberry is intentionally absent. Do not
enable terminal-wide AutoTrading for this bridge; if MT5 prevents it from
initializing with that setting off, leave the setting unchanged and report the
message so the behavior can be verified safely.
