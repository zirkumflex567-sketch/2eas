# AUD-02 isolated dashboard load evidence

## Result

The complete dashboard page exceeds the 3 MiB non-chart decoration budget by design. On this local run it transferred 7,942,453 bytes (7.575 MiB) on the 390 CSS px / DPR 2 cold load and 8,444,241 bytes (8.053 MiB) on the 1440 CSS px / DPR 1 cold load, including the HTML document. Warm reloads transferred no static resource bytes from the browser cache; the HTML document still transferred 112,264 bytes. The 3 MiB limit applies only to the separately tested non-chart UI decoration, not the full page.

| Viewport | Resource requests | Resource encoded bytes | Resource cold transfer | Cold document transfer | Cold FCP / load | Warm resource transfer | Warm FCP / load |
|---|---:|---:|---:|---:|---:|---:|---:|
| 390 × 1000, DPR 2 | 61 | 7,811,889 | 7,830,189 | 112,264 | 632 / 684 ms | 0 | 344 / 82 ms |
| 1440 × 1000, DPR 1 | 62 | 8,313,377 | 8,331,977 | 112,264 | 452 / 490 ms | 0 | 548 / 70 ms |

The 390 px run classified 427,904 bytes as chart, 2,579,618 as Stone UI, 4,637,192 as visualization assets, and 167,175 as other. The 1440 px run classified 427,904 / 2,579,618 / 5,138,680 / 167,175 bytes respectively. The difference is responsive asset selection. Each viewport issued seven API GETs; the measurement proxy returned 503 before forwarding any `/api/` request to the app. There were no non-GET requests or failed browser requests.

## Method and limits

Run `node scripts/measure_dashboard_assets.cjs` from the repository root. It launches an isolated local Uvicorn process and a local HTTP proxy. Only non-API GET/HEAD requests reach the app; API paths are answered by the proxy and other methods are denied. Chromium routing is not used, so the browser's normal HTTP cache remains active. Generated full resource ledgers are written under ignored `output/asset-budget/dashboard-load-evidence.json` and are not authoritative committed test fixtures.

The browser reports encoded, transfer and decoded response-body sizes, request counts, top assets, document transfer, FCP and navigation load timings. `decodedBytes` means decompressed response-body bytes, not decoded image-pixel memory. There are no inline `<img>` elements in this page; CSS background image pixel decode is explicitly not measured by this run. FCP and load timings are single headless-local samples and are not CPU/FPS or physical paint benchmarks. The proxy's local cache behavior does not prove the public deployment's compression, cache policy, latency or network waterfall.

AUD-02 remains partial until deployment cold/warm waterfall and cache headers, CSS-image decode/paint costs, representative network and hardware loads, separate chart/volume budgets, and an archive/LFS decision are measured and reviewed. No live `/stt`, MT5, evidence-store write, Strategy Tester or backtest was used.
