# AUD-02 isolated dashboard load evidence

## Result

The complete dashboard page exceeds the 3 MiB non-chart decoration budget by design. This rerun transferred 9,062,192 bytes (8.642 MiB) on the 390 CSS px / DPR 2 cold load and 10,598,724 bytes (10.108 MiB) on the 1440 CSS px / DPR 1 cold load, including the HTML document. Warm reloads transferred no static resource bytes from the browser cache; the HTML document still transferred 148,340 bytes. The 3 MiB limit applies only to the separately tested non-chart UI decoration, not the full page.

| Viewport | Resource requests | Resource encoded bytes | Resource cold transfer | Cold document transfer | Cold FCP / load | Warm resource transfer | Warm FCP / load |
|---|---:|---:|---:|---:|---:|---:|---:|
| 390 × 1000, DPR 2 | 62 | 8,895,252 | 8,913,852 | 148,340 | 820 / 877 ms | 0 | 272 / 119 ms |
| 1440 × 1000, DPR 1 | 64 | 10,431,184 | 10,450,384 | 148,340 | 456 / 526 ms | 0 | 304 / 89 ms |

The 390 px run classified 431,914 bytes as chart, 2,579,618 as Stone UI, 5,692,176 as visualization assets, and 191,544 as other. The 1440 px run classified 431,914 / 2,579,618 / 7,228,108 / 191,544 bytes respectively. The difference is responsive asset selection. Both viewports issued eight API GETs; the measurement proxy returned 503 before forwarding any `/api/` request to the app. There were no non-GET requests or failed browser requests.

The harness also found and decoded 33 unique loaded same-origin CSS images at 390 px and 35 at 1440 px, with zero decode failures. Summing intrinsic width × height × four bytes gives 63,702,764 and 71,722,684 bytes. The explicit post-load `Image.decode()` pass took 282.5/60.3 ms on the 390 px cold/warm navigation and 152.7/10.4 ms on the 1440 px cold/warm navigation; this is not the browser's original CSS decode time. The byte estimate is a deduplicated resource-surface sum; it does not measure how many surfaces remain resident together, actual decoded allocation, GPU texture copies, compositing, paint time, or DPR-scaled backing memory.

## Method and limits

Run `node scripts/measure_dashboard_assets.cjs` from the repository root. It launches an isolated local Uvicorn process and a local HTTP proxy. Only non-API GET/HEAD requests reach the app; API paths are answered by the proxy and other methods are denied. Chromium routing is not used, so the browser's normal HTTP cache remains active. Generated full resource ledgers are written under ignored `output/asset-budget/dashboard-load-evidence.json` and are not authoritative committed test fixtures.

The browser reports encoded, transfer and decoded response-body sizes, request counts, top assets, document transfer, FCP and navigation load timings. `decodedBytes` means decompressed response-body bytes. CSS `background-image` and `border-image-source` URLs are matched to already-loaded same-origin resources and explicitly decoded through `Image.decode()` after page load; the duration is for that extra cached decode call. The RGBA number is an intrinsic surface estimate, not actual memory or paint cost. There are no inline `<img>` elements in this page. FCP and load timings are single headless-local samples and are not CPU/FPS or physical paint benchmarks. The proxy's local cache behavior does not prove the public deployment's compression, cache policy, latency or network waterfall.

AUD-02 remains partial until deployment cold/warm waterfall and cache headers, CSS-image decode/paint costs, representative network and hardware loads, separate chart/volume budgets, and an archive/LFS decision are measured and reviewed. No live `/stt`, MT5, evidence-store write, Strategy Tester or backtest was used.
