# AUD-01 MT5 trace measurement

## Main `d6ae080` sustained repeat with immediate trace capture (2026-10-20)

The local 8050 and 8056 runtimes were guarded-restarted before the run. Runtime identity remained on `d6ae0809c87f8087deceaa614038059a489936b4`, with `restart_required=false` and `applicationCodeDirty=false`. The bounded 840-second run completed all 14 one-minute cycles and 70/70 serial M15 candle reads (14 per authorized demo alias); each response returned 150 `MT5_VERIFIED` XAU M15 candles with `canExecute=false`. For each sample the harness immediately fetched the account-scoped trace snapshot and retained its matching route/method record, so later ring-buffer eviction could not invalidate correlation. This added 70 diagnostic reads; with five initial and five final trace snapshots and two runtime checks, the audit made 152 GETs total. No history reads, broker mutations, or Blueberry requests occurred. The complete machine-readable report is [aud-01-mt5-traces-d6ae0809.json](aud-01-mt5-traces-d6ae0809.json), SHA-256 `03b315400dcbd510b760614951c22ef594f8404bc46c60d5098bab5f83d33f45`.

| Demo alias | Client median / p95 / max (ms) | Lock-wait p95 / max (ms) | New background traces |
| --- | ---: | ---: | ---: |
| `titan` | 670.721 / 1559.659 / 1559.659 | 0.002 / 0.002 | 10 |
| `xau5m_m5` | 124.110 / 199.418 / 199.418 | 0.001 / 0.001 | 10 |
| `titan_m5` | 93.804 / 177.436 / 177.436 | 0.002 / 0.002 | 10 |
| `xau5m_500` | 92.458 / 141.110 / 141.110 | 0.002 / 0.002 | 10 |
| `goldm15` | 161.368 / 247.221 / 247.221 | 0.001 / 0.001 | 10 |

Dashboard process CPU increased by 665.640 seconds over the 840-second window, private bytes by 462,848 bytes, and working set decreased by 950,272 bytes. The additional ten traces per alias confirm unrelated live requests overlapped the run; the CPU figure therefore cannot be attributed to this harness or treated as an isolated service cost. The Titan client p95 outlier also warrants a controlled repeat. Lock spans stayed near zero for this serial run. No approved latency/CPU thresholds exist, so this evidence is a concurrent-load observation rather than a performance-budget pass. Cold-start, controlled-load, approved budgets, and target-hardware/endurance acceptance remain open. No backtest was run.

Live exploratory measurement on 2026-10-16 after the clean `main` runtime restarted at `551365945f60b77106bef96b4d971c050026da62`. The dashboard returned the same PID and startup/disk revision locally and through htown `/stt`; `restart_required=false`, `applicationCodeDirty=false`, nginx active, and `nginx -t` successful.

The bounded run made 20 GET requests: four M15 candle reads of 150 bars and one 24-hour trade-history read per demo account. Each account had two serial warm reads followed by two concurrent candle reads. The script checked account and symbol provenance, `MT5_VERIFIED`, `canExecute=false`, and a stable process/revision throughout. No writes or order methods ran. Blueberry had zero requests and was denied before its trace data could be read. The machine-readable snapshot is [aud-01-mt5-traces-5513659.json](aud-01-mt5-traces-5513659.json); the harness also writes an ignored local raw report. Reproduce with `node scripts/measure_live_mt5_traces.cjs` against the local 8056 dashboard.

| Demo alias | API median / p95 / max (ms) | Lock wait max (ms) | MT5 init max (ms) | Rates max (ms) | History (ms, n=1) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `titan` | 213.751 / 352.250 / 352.250 | 179.311 | 114.954 | 0.133 | 0.125 |
| `xau5m_m5` | 164.684 / 657.132 / 657.132 | 468.548 | 1.222 | 0.153 | 3.991 |
| `titan_m5` | 159.993 / 982.881 / 982.881 | 774.471 | 1.136 | 0.128 | 0.141 |
| `xau5m_500` | 162.521 / 1342.892 / 1342.892 | 1141.501 | 1.084 | 0.146 | 0.098 |

Each account has only five API samples, so its reported p95 is the sample maximum. The concurrent phase shows contention in the shared MT5 session lock; the history span itself was short in this run. Across the 6.8-second measurement, dashboard CPU increased by 2.954 seconds, private bytes by 618,496 bytes, and working set by 1,884,160 bytes.

This establishes an authenticated, account-scoped warm/parallel baseline with actual initialization, identity, lock, rates, and history spans on all four demos. It does not set or pass a latency/CPU budget: no product thresholds exist yet, and repeated sustained load, longer CPU/memory observation, and reproducible per-terminal cold-start comparisons remain open. Backtesting was not run.

The harness's current repeat mode covers all five configured non-Blueberry demo aliases (`titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`, and `goldm15`): `node scripts/measure_live_mt5_traces.cjs --repeat-seconds=300 --interval-seconds=60`. It makes one serial M15 candle GET per demo alias per round, at least 60 seconds after the prior round completes, with no history reads or concurrent requests. Duration is capped at 840 seconds (14 rounds), each candle request times out after 15 seconds, candle 429 responses fail immediately in this mode, and the final round is bounded to finish within 15 minutes. The maximum is 70 measured candle GETs plus 10 runtime/trace GETs; the actual completed round count and candle timings are written into the JSON report. The existing one-shot command and its 20 measured requests remain unchanged.

Repeat mode ran on 2026-10-18 after restarting clean `main` revision `6d4ff8fa01ba578baf19241784a373efd2325237`: two rounds over two minutes, eight serial candle GETs across the four approved demo aliases, zero history reads issued by this run, zero writes, and zero Blueberry requests. Runtime startup/disk revisions and digests matched throughout. Per-account client median/max (two samples each) were `titan` 81.826/86.188 ms, `xau5m_m5` 83.591/116.297 ms, `titan_m5` 74.773/98.316 ms, and `xau5m_500` 76.840/83.864 ms. Dashboard process CPU increased 2.078 s, private memory 2,011,136 bytes, and working set 3,047,424 bytes during the observation window. These small samples are exploratory only; no latency/CPU thresholds are defined, and this does not establish cold-start performance or pass a budget. The raw report is [aud-01-mt5-repeat-20261018.json](aud-01-mt5-repeat-20261018.json).

Current five-demo measurement on 2026-10-18 after guarded restart of clean `main` revision `32c8a8c8a60d25d101819c472353c6e53a56b6c4`: the one-shot run made 25 broker GETs (four 150-bar M15 candle reads and one 24-hour history read per demo), and the repeat run completed all five serial rounds over five minutes (25 candle GETs; at least 60 seconds between rounds). Both runs verified account/symbol scope, `MT5_VERIFIED`, `canExecute=false`, and matching startup/disk revision and digest. Across both runs there were no writes and zero Blueberry requests. Repeat-run client median/p95 milliseconds were `titan` 85.503/112.982, `xau5m_m5` 88.801/116.766, `titan_m5` 90.943/105.713, `xau5m_500` 81.629/104.248, and `goldm15` 165.755/167.193. Over five minutes, dashboard CPU increased 7.500 seconds, private memory 11,116,544 bytes, and working set 11,854,720 bytes. The reproducible aggregate is [aud-01-mt5-repeat-20261018-five-demos.json](aud-01-mt5-repeat-20261018-five-demos.json). These remain exploratory samples without a defined product latency/CPU budget; cold-start comparison, longer memory observation, and thresholds remain open.

## Main `b427ea6` sustained repeat (2026-10-19)

The clean main runtime on local ports 8050/8056 and the authenticated htown `/stt` route shared startup/disk revision `b427ea686dd879dc977c978320a952e149fd9fc8` and digest `c5fe1c0dbacd6f59c8067faaaa72d392cfac5a5a3152f1178f27478d8f837a07`; `applicationCodeDirty=false` and `restart_required=false`. The SSH checkout was clean on `main`, nginx configuration passed validation, and both workflows for this commit passed (Chart Studio [39186223270](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39186223270), Performance/UX [39186223315](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39186223315)).

The 840-second repeat completed all 14 one-minute cycles: 70 serial GETs, 14 requests per demo, 150 `MT5_VERIFIED` XAU M15 candles per read, zero history requests in this run, zero mutations, zero Blueberry requests. Runtime PID, startup/disk revision and digest stayed stable, with both runtime flags false. Per-account client timings and MT5 lock wait were:

| Demo alias | Client median / p95 / max (ms) | Lock-wait p95 / max (ms) |
| --- | ---: | ---: |
| `titan` | 141.745 / 463.328 / 463.328 | 0.002 / 0.002 |
| `xau5m_m5` | 143.216 / 179.215 / 179.215 | 0.004 / 0.004 |
| `titan_m5` | 129.170 / 449.352 / 449.352 | 0.001 / 0.002 |
| `xau5m_500` | 120.876 / 186.702 / 186.702 | 0.001 / 0.002 |
| `goldm15` | 231.366 / 279.749 / 279.749 | 0.001 / 0.001 |

During the observation, dashboard CPU increased by 425.937 seconds, private bytes by 14,159,872 bytes (about 13.5 MiB), and working set by 12,914,688 bytes. The account samples are still small, exploratory measurements; there is no approved latency/CPU budget and no cold-start or broader concurrency acceptance. The full machine-readable result is [aud-01-mt5-traces-b427ea68.json](aud-01-mt5-traces-b427ea68.json), SHA-256 `541d3d156e2403f8eb14b47d9f62e7d845c5c1c1966453996fea4bd98f10ba58`. The earlier repeat that failed its end-of-run guard check remains excluded from this result.


## Main `3cd6fe2` route attribution and live follow-up (2026-10-19)

After the guarded restart, local 8056 and hTown's SSH upstream on 8055 returned the same runtime PID, revision `3cd6fe2ee78f8b515384070836d06716ce5b9f8a`, and digest `1e398d5e976f65dbec32df4e055f6acd4615b687f3bbf67d3884f01080737a3a`; both runtime flags were false. hTown's checkout was clean on `main`, nginx was active, and `nginx -t` passed. Both GitHub workflows passed (Chart Studio [39200332777](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39200332777), Performance/UX [39200332890](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39200332890)).

The new route wrapper records only the HTTP method and canonical FastAPI path template. It excludes query values and concrete path values. After deployment, a sequential live check on each of the five authorized demo aliases made one `GET /api/candles` request and correlated it to exactly one new `GET /api/candles` trace; each returned 150 `MT5_VERIFIED` M15 bars with `canExecute=false`. A separate real `/api/chart/v1/trades` read also produced the canonical route in its trace. Regression coverage includes a parameterized normal route, the custom Chart Studio preview route class, concurrent requests, exception cleanup, and omission of request values.

The one-shot audit then made 25 read-only broker requests across five demos (four 150-bar M15 reads plus one 24-hour history read per alias). Client p95 (five samples, therefore the maximum) ranged from 358 ms to 1,764 ms; the reported lock-wait p95 reached 1,466 ms. The runner found six traces per alias against five planned requests, which shows other live activity overlapped the sample. This is an exploratory concurrency signal, not a controlled endpoint comparison or SLO result. The machine-readable aggregate is [aud-01-mt5-one-shot-3cd6fe2.json](aud-01-mt5-one-shot-3cd6fe2.json). A five-demo chart smoke completed 95 GETs with visible candles, ten native v5 levels and seven Auto-Fibonacci levels; a separate what-if smoke returned ten `READ_ONLY_DRAFT` scenarios with zero broker writes. The decision recorder still has no imported Titan decision events, and the Marketplace EX5 does not expose source for instrumentation.

AUD-01 remains partial until cold-start and controlled-load runs isolate route timings, performance budgets are approved, and hardware/endurance checks pass. No orders or backtests were run and Blueberry was not queried.

## Main `1f18e8e` sustained repeat (2026-10-19)

The 8056 runtime used for this measurement kept its PID and clean startup/disk revision `1f18e8efefa972a3cef53bd5341456bcf4e104be` through the run. Local 8056 and hTown's SSH upstream 8055 returned the same runtime identity and digest `1e398d5e976f65dbec32df4e055f6acd4615b687f3bbf67d3884f01080737a3a`; hTown's checkout was clean on `main`, nginx and the backend guard were active, and `nginx -t` passed. Both workflows for `1f18e8e` passed (Chart Studio [39201689092](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39201689092), Performance/UX [39201689112](https://github.com/zirkumflex567-sketch/2eas/actions/runs/39201689112)).

The bounded 840-second repeat completed all 14 one-minute cycles: 70 serial GETs, 14 per each of the five authorized non-Blueberry demo aliases; each returned 150 `MT5_VERIFIED` XAU M15 candles. It issued no history requests, no mutations, and no Blueberry requests. Client median/p95/max and MT5 lock-wait p95/max were:

| Demo alias | Client median / p95 / max (ms) | Lock-wait p95 / max (ms) | New traces |
| --- | ---: | ---: | ---: |
| `titan` | 455.664 / 1858.293 / 1858.293 | 1231.328 / 1231.328 | 17 |
| `xau5m_m5` | 177.823 / 2094.253 / 2094.253 | 1455.433 / 1455.433 | 17 |
| `titan_m5` | 164.361 / 2229.260 / 2229.260 | 1362.709 / 1362.709 | 18 |
| `xau5m_500` | 165.932 / 435.369 / 435.369 | 1257.475 / 1464.280 | 21 |
| `goldm15` | 255.893 / 829.074 / 829.074 | 1708.323 / 1737.856 | 28 |

Each demo produced more traces than the 14 scheduled requests, so background requests overlapped the measurement; the high lock waits are a concurrency signal and do not isolate the serial request budget. Dashboard CPU increased 555.438 seconds, private bytes 13,787,136 bytes, and working set 11,382,784 bytes during the window. No approved latency/CPU thresholds exist, and cold-start, controlled concurrency and hardware/endurance acceptance remain open. The complete report is [aud-01-mt5-traces-1f18e8ef.json](aud-01-mt5-traces-1f18e8ef.json), SHA-256 `a5b9b3ee2943863eeeb186391e05fb61fc3767bc55db7f9d4ab5642792a42125f`.

After the measurement, the duplicate 8050 runtime was guarded-restarted with an isolated private spool root: direct status reads report `IDLE` with zero spool files for both Titan producers, while 8056 remains the sole consumer of the shared MT5 spool and reports the preserved temporary backlog. No temp file was opened, moved, or removed.

## 20 October 2026 — route-attributed 14-minute follow-up

The bounded warm-run completed 14/14 serial cycles and 70/70 150-bar M15 candle reads across the five authorized demo aliases. All matched traces were captured immediately and correlated to the same account, `GET` method and `/api/candles` route; nine to ten additional background traces per account were classified separately. Total: 152 GETs, zero mutations and no Blueberry request. Client p95 was 213.561 ms (`titan`), 258.294 (`xau5m_m5`), 202.821 (`titan_m5`), 241.524 (`xau5m_500`) and 339.672 (`goldm15`). Lock-wait p95 was 0.002, 0.001, 0.002, 105.769 and 117.006 ms respectively. CPU increased 103.797 s, Private Bytes 819,200 B and Working Set 901,120 B. As background traces indicate concurrent dashboard activity, the resource and intermittent lock-wait measurements are not isolated to the scheduled reads. AUD-01 remains partial pending SLO budgets, cold-start/controlled-load baselines and hardware acceptance. Machine report: [aud01-mt5-traces-20261020-14min.json](aud01-mt5-traces-20261020-14min.json), SHA-256 `d16c792b2bcd3632633f471fdc670e3e71a80e31b558e3a00887bf2e90c0d272`.