# AUD-01 MT5 trace measurement

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
