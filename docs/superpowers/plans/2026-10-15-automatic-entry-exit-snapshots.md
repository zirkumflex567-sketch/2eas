# Automatic broker entry/exit chart snapshots

Date: 2026-10-15. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

Implement the data-only P0 slice of FR-035/AT-055: after a confirmed, observed demo MT5 entry/exit deal is persisted, capture a bounded set of completed OHLC candles ending at the broker deal time and persist them in a strict immutable snapshot envelope. Browser availability must not affect capture. No screenshot, EA change, trade write, Blueberry access, or backtest is in scope.

## Contract

- Preserve compatibility with existing v1 `TradeSnapshot` records by making `marketData` an optional schema extension; every new automated broker snapshot requires the bounded block with source, exact OHLCV/spread rows, and SHA-256 over canonical rows.
- Snapshot captures for entry deals use `ENTRY`; exit/close deals use `EXIT`; unsupported netting reversal facts do not guess a position boundary.
- Only completed broker candles whose timestamps are at or before the deal time are included. The capture range is bounded to 150 bars and one timeframe, and is marked with observed MT5 provenance.
- Stable snapshot IDs bind account terminal identity, position identifier, deal ticket, and capture type. Existing EvidenceStore idempotency makes process retries safe.
- If MT5 history cannot be verified, preserve the lifecycle deal and expose a capture gap; never emit an empty or fabricated snapshot.

## Execution and verification

1. Add failing model tests for the frozen candle payload, bounds, digest, time ordering, and rejection of tampering.
2. Add failing capture tests proving entry/exit snapshots are produced from broker-confirmed rows, unavailable history yields no snapshot, and retries are idempotent.
3. Implement the model, pure snapshot builder, bounded MT5 historical reader, and lifecycle-service integration using existing account-scoped read locks and EvidenceStore.
4. Run focused and full tests; inspect the diff and confirm all MT5 calls stay in read paths. Exercise the four authorized demo aliases via read-only API only; exclude Blueberry explicitly.
5. Update FR-035/AT-055 only to the evidenced level. Rebuild/restart `/stt` from exact Main and verify revision/runtime identity.

## Progress

- [x] Added a backward-compatible, strict `marketData` snapshot extension. It validates OHLC invariants, UTC order/as-of bounds, 150-bar maximum, and SHA-256 over canonicalized records. New snapshots also carry a verified reference to their exact prior lifecycle deal; store integrity checks enforce account/terminal scope, deal, position, symbol, and event type.
- [x] Added a read-only MT5 `copy_rates_range` capture using the existing verified terminal lock. It excludes the forming candle, emits stable entry/exit IDs, retries safely through store idempotency, and surfaces missing history without discarding the lifecycle fact.
- [x] Added a responsive canvas Candle view in the existing evidence inspector. It uses only frozen OHLC rows, labels the source/as-of time, and explicitly says historical indicators/drawings were not recorded.
- [x] Added a per-record PNG download sourced directly from the frozen historical canvas, with account and snapshot identity in the filename. The Chromium contract checks the downloaded file's PNG signature and nonempty image payload; it performs no network write.
- [x] Regression verification: all 137 broker capture/model/store tests pass under `C:\Python314\python.exe` with the actual installed `MetaTrader5` package; four existing FastAPI lifecycle deprecation warnings remain. The source JavaScript passes `node --check`; the full headless Chromium Chart Studio smoke passes, renders stored snapshot candles, and verifies no trading POST.
- [x] Commit/push exact Main (`9256d29`), verify both GitHub CI workflows, deploy clean local/hTown `/stt` through the guarded launcher with the private four-demo allowlist, and read back all four accounts without a Blueberry request. All 77 persisted snapshots have valid entry/exit kind, lifecycle reference, and 1–150 frozen bars; every account reports `OK`, rolling coverage, zero capture gaps and unavailable snapshots. Live acceptance and this checklist update are recorded in the follow-up Main change.
- [x] Add and run `scripts/smoke_live_snapshot_history.cjs`: Chromium loads each of the four demo scopes directly, reads and renders stored snapshot candles, verifies account isolation and preserved M15 history through an active M5 chart switch, downloads and checks a real stored-snapshot PNG on `titan`, and observes no browser errors, mutation requests or Blueberry request.
- [ ] Preserve original indicator/drawing/position state, add v5 multi-pane export, and complete browser account/timeframe E2E for the reconstructed original view as open work.

## Gates

Never attach/reload an EA, change a preset, enable trading, submit/modify/cancel an order, access the Blueberry account, or run Strategy Tester/backtests under this plan.
