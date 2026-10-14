# AT-025 Chromium capacity evidence

Run date: 14 October 2026. This is the native v5 renderer fixture, not the production v4 dashboard.

The deterministic browser fixture used 5,000 synthetic M15 bars, 16 overlay lines and four pane lines (20 active indicator instances), and 1,000 native trend drawings. It rejected a fifth pane after the 20-instance combined limit, rejected drawing 1,001, imported the schema-v1 transfer into a scoped chart, reloaded all 1,000 from private schema-v2 localStorage, and confirmed a separate account had one unrelated drawing while the other timeframe had none. Real pointer clicks selected drawings 0, 500 and 999 after moving each into the visible logical range.

| Measurement | Result |
|---|---:|
| Browser | HeadlessChrome 141.0.7390.37, viewport 1280×840, DPR 1 |
| Loading 5,000 bars | 14.7 ms |
| Setting up 20 indicators | 76.6 ms |
| Creating 1,000 drawings | 11.2 ms |
| Schema-v1 transfer size | 209,996 characters |
| Importing 1,000 drawings | 18.8 ms |
| Scoped chart creation and 1,000-drawing reload | 35.7 ms |
| Pointer selection sequence for drawings 0 / 500 / 999 | 120 / 103 / 96 ms |
| Private snapshot bound | 524,288 UTF-8 bytes (512 KiB) |

A separate near-limit persistence fixture hydrated 1,000 Fibonacci drawings from a 523,385-byte private snapshot. Updating one drawing added history, persisted successfully at 523,385 bytes, dropped the oldest undo entry (20 entries remained), and retained all 1,000 drawings. A multibyte UTF-8 input below 524,288 JavaScript characters but above 524,288 bytes is rejected as oversized. This directly exercises byte enforcement and oldest-history-first trimming at the configured bound.

These timings are a single local headless-browser run. Bar and indicator numbers time their synchronous setup calls; drawing creation measures the API loop, and reload includes chart construction plus the 1,000-object storage hydration. None waits for or measures completed paint frames. The pointer sequence includes fixed 60 ms of test waits, so it is not an input-latency measure. It does not measure animation-frame stability, sustained pan/zoom FPS, CPU/heap over time, physical Windows 150% DPI, mobile performance or broker data.

The production ChartStudio Beta Chromium object-manager smoke also passes a simultaneous functional fixture with 5,000 bars, 16 configurable moving-average overlays, four separate oscillator panes and 1,000 drawings. It checks drawing import/listing, 999→1,000 duplication, rejection of duplication at 1,000, and atomic rejection of drawing 1,001. This establishes the requested count combination in the v4 Beta renderer; it records no frame-rate, input-latency, CPU or memory measurement. The SQLite workspace store now separately roundtrips 1,000 schema-v1 drawings in a 519,199-byte document and rejects 1,001.

The run does not measure animation-frame stability, sustained pan/zoom FPS, CPU/heap over time, physical Windows 150% DPI or mobile performance. Master-spec reference-desktop/mobile acceptance and production migration to v5 remain open.

Reproduce from the repository root:

```powershell
npm --prefix chart_studio_v5 run check
npm --prefix chart_studio_v5 run build
node scripts/smoke_chart_studio_v5.cjs
```
