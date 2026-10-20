# AUD-04: headless FX trace (2026-10-20)

The five-minute traces ran on local `main` revision `7332f209ab2483a92e433b6dcfa5ec03b7cd779f` in Chromium 141.0.7390.37, Windows build 26200, Intel Core i7-9750H, 1440×1000 at DPR 1. One `titan` dashboard tab used broker-verified live data. Browser network interception rejected every non-GET request and every account scope other than `titan`; 1,098 API requests were observed over the 20-minute run, with no blocked requests or page errors.

| Five-minute phase | Frames/s | P95 frame interval | Intervals >33.3 ms | Long tasks | CDP main-thread task time |
|---|---:|---:|---:|---:|---:|
| FX Off | 59.39 | 16.8 ms | 85 / 17,818 | 19 (1.976 s total) | 12.725 s |
| Mystic idle | 23.51 | 66.7 ms | 5,041 / 7,053 | 44 (2.671 s total) | 34.602 s |
| Ritual/Eskalation idle | 24.87 | 66.6 ms | 5,988 / 7,460 | 35 (2.037 s total) | 33.592 s |
| Mystic with two demo-profit bursts | 23.92 | 66.7 ms | 6,074 / 7,175 | 114 (8.220 s total) | 40.213 s |

The browser-reported heap sample was 10.0 MB through the first three phases and 11.9 MB at the end of the celebration phase. The value returned to 10.0 MB at several later samples; the CDP heap deltas did not consistently agree with `performance.memory`, so this short run is not a leak determination. Paint entries only captured initial first-paint/first-contentful-paint; no detailed Paint/Composite trace was collected.

This is useful evidence that the active Stone theme costs more than the strict Off mode in this headless environment. It does not establish physical-GPU FPS or hardware budgets, and does not isolate dashboard polling from browser work. The 30/60-minute heap run, low-motion variant, hidden/offscreen/reduced-motion checks, responsive/zoom/fullscreen/chart-interaction matrix, detailed paint/composite trace, and golden screenshots remain open. No code or EA was changed and no broker write was made.

Reproduce with `node scripts/measure_chart_fx_performance.cjs`; the JSON result records per-sample metrics and runtime identity.
