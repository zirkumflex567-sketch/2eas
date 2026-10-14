# Isolated native Chart Studio v5 renderer

Experimental TypeScript browser adapter. **No MT5 access, broker mutation or dashboard cutover.**

Build on Node.js 22:

```sh
npm install --package-lock=false --no-audit --no-fund
npm run check
npm run build
```

Run `node scripts/smoke_chart_studio_v5.cjs` from repository root with Playwright installed and Chromium available. It starts a local fixture server on port 8872, uses native v5 chart/line/pane/volume APIs, validates account isolation, rejects stale and malformed bars, reads exact-time OHLC/volume/indicator values with source and warm-up states, exercises price/time gestures, keyboard nudges for selected drawings with single-step undo/redo, and a bounded anchored text annotation, and persists two-anchor trend lines and filled rectangles, a forward-projected ray, and standard/custom Fibonacci retracement levels using exact loaded UTC candle/price coordinates. The engine exposes validated `visibleLogicalRange()` and `setVisibleLogicalRange(range)` methods around the public time-scale API; Chromium checks exact trend anchor geometry over 1,200 loaded bars and wide/narrow viewport ranges. Passing `{symbol, timeframe}` as the third `createStudioV5` argument opts into a versioned localStorage snapshot keyed by account/symbol/timeframe and enables schema-v1 JSON export/import of drawings without account IDs. Import requires matching symbol/timeframe, a clean canvas, ready storage and valid loaded candle anchors; invalid or conflicting imports are rejected before changing drawings. The fixture verifies ten concrete native drawings survive browser reload and JSON transfer, keeps them isolated by account/timeframe, rejects malformed/conflicting imports and corrupt storage, and confirms zero broker writes; it records `output/visual-smoke/chart-studio-v5-poc.png`.

The compiled bundle is used exclusively by `fixture.html` at this stage. To migrate the main dashboard, implement and pass the separate gates in `docs/CHART_STUDIO_V5_RFC.md`.
