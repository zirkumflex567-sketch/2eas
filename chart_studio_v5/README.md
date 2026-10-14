# Isolated native Chart Studio v5 renderer

Experimental TypeScript browser adapter. **No MT5 access, broker mutation or dashboard cutover.**

Build on Node.js 22:

```sh
npm install --package-lock=false --no-audit --no-fund
npm run check
npm run build
```

Run `node scripts/smoke_chart_studio_v5.cjs` from repository root with Playwright installed and Chromium available. It starts a local fixture server on port 8872, uses native v5 chart/line/pane/volume APIs, validates account isolation, rejects stale and malformed bars, reads exact-time OHLC/volume/indicator values with source and warm-up states, and exercises price/time drawing add/update/remove, hit-test, selection, pointer-capture drag, candle snap and Escape rollback. The fixture verifies that it sends no writes and records `output/visual-smoke/chart-studio-v5-poc.png`.

The compiled bundle is used exclusively by `fixture.html` at this stage. To migrate the main dashboard, implement and pass the separate gates in `docs/CHART_STUDIO_V5_RFC.md`.
