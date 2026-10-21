# AUD-04: 30-minute Mystic idle trace (2026-10-21)

One headless Chromium tab measured the `titan` demo on dashboard startup revision `6c665007e1859da31a1be0b01ee88ed9338efea4`, at 1440×1000 and DPR 1. The Stone theme and visible chart were active. The read-only route guard allowed GET requests scoped to `titan` and blocked every other account and all non-GET requests. Chromium 141.0.7390.37 ran on Windows build 26200 with an Intel Core i7-9750H.

| Phase | Duration | Frames/s | Median interval | P95 / P99 interval | >33.3 ms | Long tasks | Long-task time | CDP JS heap delta |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mystic idle | 30 min | 22.20 | 50.0 ms | 66.7 / 66.8 ms | 35,346 / 39,952 | 336 | 21.117 s | +4.15 MB |

The browser-reported heap started at 10.0 MB and rose to 12.7 MB, then stayed at 12.7 MB in the later samples. CDP `TaskDuration` increased by 222.604 s; `ScriptDuration` by 11.255 s; layout by 6.814 s; and style recalculation by 35.796 s. There were 1,620 API reads, all GET, with no blocked requests or page errors. The only scoped account was `titan`; unscoped read-only API requests were also observed. Seven layout shifts were recorded. Paint entries covered only first paint and first contentful paint.

The runtime endpoint returned startup/disk revision `6c665007e1859da31a1be0b01ee88ed9338efea4` and `applicationCodeDirty=true`. The worktree changes during this audit were limited to the local AUD-04 runner/config/test utilities; the dashboard frontend was loaded from the `6c66500` runtime. The raw run is saved in [aud04-mystic-idle-30m.json](aud04-mystic-idle-30m.json).

This confirms a substantial headless frame-time cost in Mystic idle and no continuously rising sampled heap after minute 20. It does not establish a memory-leak verdict, physical-GPU performance, or the source of the frame cost. Off-mode comparison, reduced-motion/hidden-chart behavior, celebration trace, detailed paint/composite profiling, interaction/responsive coverage, and real-device/DPI acceptance remain open. No Blueberry request, broker write, trade, EA change, or backtest occurred.
