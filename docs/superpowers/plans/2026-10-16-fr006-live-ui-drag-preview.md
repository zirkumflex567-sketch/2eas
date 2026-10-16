# FR-006 live UI stop-drag preview

**Status:** Complete for one authorized non-Blueberry demo account. This is read-only preview acceptance, not an EA guard or target-hardware release.

## Acceptance

- Read live positions and candles only for the four explicitly authorized demo aliases; never request Blueberry.
- In headless Chromium, open ChartStudio Beta, select an existing `MT5_VERIFIED` position whose SL is visible in the loaded chart, and change its SL draft by dragging the real chart handle.
- Submit only `/api/chart/v1/position/preview-stop`; reject any other non-GET API request.
- Verify exact account, symbol, ticket and revision binding; valid geometry; guard `UNKNOWN/NONE`; `canCommit=false`; `canExecute=false`.
- Read the position back and prove revision, SL and TP are unchanged. Send no order and call no commit route.

## Verification result (2026-10-16)

`node scripts/smoke_live_position_stop_preview_ui.cjs` passed against `http://127.0.0.1:8056` on `xau5m_m5` / `XAUUSD.p` / M15. It selected an existing BUY position with a visible SL, changed the displayed draft by pointer drag, and received a valid read-only preview. The post-preview broker readback retained the original revision, SL and TP. The run made one preview POST, zero position mutations, zero orders, and zero Blueberry requests. The other empty demo books were not needed after this acceptance passed.

Touch input, other chart/symbol combinations, live EA guard provenance, and target-device acceptance remain open.
