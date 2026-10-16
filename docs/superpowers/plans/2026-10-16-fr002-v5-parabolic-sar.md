# FR-002 native v5 Parabolic SAR slice

## Goal and boundaries

Add the Beta-matched read-only Parabolic SAR overlay to the isolated native-v5 adapter. Preserve the existing renderer gate: this does not enable production v5, issue MT5 requests, or alter broker/EA behavior. This slice covers FR-002 native overlay parity and AT-002/003 indicator readout; target hardware, production wiring, and sustained-load acceptance remain open.

## Contract

- Match `ChartStudioIndicators.calculate("sar", bars, settings).sar` exactly for initial direction, clamped two-bar projection, reversal, extreme-point update, and AF advancement.
- Default AF step/maximum are 0.02/0.20. Step is 0.01–0.10, maximum 0.01–0.50, both in 0.01 increments, and maximum must be at least step.
- Render distinct up/down price series. Readout carries the exact value and UP/DOWN direction; fewer than two bars produce warm-up.
- Repeated updates of the forming bar replace the prior result from a saved pre-bar checkpoint; append advances once; full-history replacement rebuilds state.
- Invalid updates are atomic. Instance identity and the shared 20-indicator limit are enforced. The overlay is removable and cleared on account changes.
- Scoped v5 view persistence includes strict SAR options in the existing schema-v3 local profile. Recreate/hydrate restores settings only for the same account, symbol and timeframe; update/remove persist, invalid settings are rejected, and legacy v3 profiles without SAR remain readable.
- No signal, order, stop, broker write, or production-v5 cutover is added.

## Implementation and verification

- Implement calculation/state and overlay lifecycle in `chart_studio_v5/src/adapter.ts`.
- Add `scripts/smoke_chart_studio_v5_parabolic_sar.cjs`; compare closed-bar and forming/append values against the Beta reference, and cover parameter bounds, scoped reload/update/remove, account/symbol/timeframe isolation, shared limits, account reset, and zero write requests.
- Run the native-v5 TypeScript check/build and focused Chromium contract. Update FR-002 evidence without closing production/hardware gates.
