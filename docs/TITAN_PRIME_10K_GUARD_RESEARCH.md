# Titan Pro 7.20 – 10k Prime Research: Challenge Guard + Profit Experiments

**Scope:** This branch changes the **original** `XAU_Titan_Pro.mq5` in `2eas`. It is NOT the rewritten EMAGPT imitation. Default Titan EMA9/21/50 / RSI14 / anti-trap entries and open-ended EMA9 runner remain intact. Two .set profiles compare protected baseline versus opt-in enhancements.

**CURRENT RELEASE STATUS: TEST BRANCH / NOT LIVE APPROVED.** The Python CI only validates risk mathematics and the structure of the MQL5 source. The original and modified MQL5 need separate MetaEditor compilation and broker **Every tick based on real ticks** strategy tests. Claims of consistent 15–20% monthly net profit are **not demonstrated**.

## Hard risk constraints: challenge 10k USD

| Control | Implementation | Notes |
|---|---|---|
| Original account reference | `InpOriginalAccountUSD=10000` | Fixed; rejects other reference sizes |
| Static equity floor | `10000*(1-8%) = $9200` | NON-TRAILING: does not follow equity peak |
| Daily internal loss budget | `10000*3.5% = $350` | Fixed dollar amount, even if account grows to $16k |
| Daily reference | `max(balance,equity)` at verified reset | Daily floor = reference − $350, held fixed until next reset |
| Internal emergency stop | `max(static floor,daily floor) + $35` | Starts flatten BEFORE the protected hard limit; gaps can still jump across it |
| Day-reset failures | no new entries; flatten open account positions | Correct reset requires clock/server configuration, across restart |
| State persistence | terminal global variables keyed by account login | Day ref, hard lock, daily lock persist; backtest optimizations isolated |
| Sizing | Broker `OrderCalcProfit` at initial SL, risk multiplier ≥1.25 | No min-lot rounding UP if SL exposure is excessive |
| Entry / basket risk | ≤$50 additional risk / ≤$150 total modeled open SL risk | Includes remaining SL loss on other open positions |
| Exposure | notional / 10 ≤90% equity | Synthetic 1:10 with additional 10% cushion; actual broker margin separately checked |
| Spread | Gold price spread ≤$0.75 | Reject new positions above it |
| Other strategies on account | no new entries when external positions or pending orders exist | Emergency flatten can close **ALL account** positions/orders |
| News | no USD high-impact release within ±150 seconds | Live calendar read error fails closed; historical tester calendar bypass MUST NOT be mistaken for compliance |
| Risk watchdog | `OnTick` plus 1-second `OnTimer` | Stop conditions checked more often, but not a guarantee during gaps/disconnection |
| Wrong symbol/netting | refuse start | XAUUSD prefix and hedging account required for >1 position |

The daily reset is officially **17:00 New York time**. This must be mapped to MT5 **broker server time** with the user's actual server timezone and checked again during U.S./European DST transitions. Inputs: `InpDailyResetHourServer`, `InpDailyResetMinuteServer`. **`InpServerResetConfirmed=false` is intentionally required until the trader verifies the correct mapping.** After a restart mid-day without persisted reference, the EA fails closed until a reliably captured reset. Do not bypass by entering an invented reference.

Original Titan 7.10 used a day-start balance estimate and 3.5% of the dynamically grown daily balance, which may permit over $350 loss as balance rises. It also used 9% static DD ($9100), not the requested $9200. Those behaviors have been replaced for execution risk. The old historical helper is no longer called.

## Profitability research variants

**Baseline:** `presets/Titan_10k_Challenge_Guarded_Baseline.set` – the original Titan trend entries, 3 slots, 0.5% nominal per entry, EMA9 basket exit, unchanged anti-trap filters, but all strict new risk gates active.

**Profit experiment:** `presets/Titan_10k_Challenge_ProfitResearch.set` – additionally enables:
1. **M15 tick-volume confirmation** ≥1.15× average of the **previous** 20 M15 candles.
2. **EMA50 directional slope** relative to an earlier completed EMA50 candle (shift 5).
3. **Selective pyramiding:** only add a second/third entry if existing group has ≥$25 unrealized profit and price has moved ≥0.7×ATR in favor since the most recent entry.
4. **Optional dynamic ATR trend runner stop** triggered after a position has ≥$90 unrealized profit; use EMA21 ±1.7×M15 ATR, tighten SL only; never widen the stop.

These are plausible ways to avoid weak scaling entries and protect extended trends. They can ALSO remove winning trades or exit too early. Profit cannot be assumed greater before full comparison.

### Prior independent OHLC proxy: evidence, not a new Titan result

A separate Python **Titan-inspired** research model (NOT the exact MQL5 code and NOT a full tick simulation), using historical uploaded XAUUSD M15 bars, compared a volume+trend variant with an unfiltered baseline at 0.5% nominal risk, 3-position model, stop first on OHLC ambiguous bars. In Jan–Oct 2026 under assumed baseline costs it returned **+20.22% versus +15.81% total for the entire ~9-month period**, and with stress costs **+13.84% versus +8.33%**. In 2024–2025 training under baseline costs it instead returned **+61.27% versus +69.19%**. These are NOT monthly results. Different trade logic and risk implementation prevent transposing this performance to 7.20.

The **LANGERGUTER.xlsx** legacy Titan report with roughly +62% Jan–Oct 2026 is a benchmark, **not automatically challenge safe**: closed-deal daily net losses >$350 occurred. A new protected backtest will necessarily have a different trade path.

## Backtesting release checklist

1. In Windows MetaEditor copy `XAU_Titan_Pro.mq5` and `TitanChallengeGuard.mqh` into the same directory; compile with F7. Verify 0 errors; any warnings require review.
2. Run both presets on XAUUSD M15 in the same MT5 broker, hedging account, USD currency, reference start $10,000, leverage 1:10; real ticks, realistic spread/commission/swap and modeling of slippage.
3. Verify each test's **minimum tick equity and balance**, peak-to-valley DD (not a hard violation), **maximum fixed-$ daily drawdown** relative to `max(balance,equity)` sampled at correct 17:00 New York reset, and max synthetic exposure/margin.
4. Test US/EU DST mismatch weeks, 17:00 reset with a floating winner, account restarts during a trade, weekend gaps, and late ticks. Fail closed if day ref cannot be proved.
5. Test multiple stops in one bar, crossed stop, unavailable SL, disabled calendar, high-impact news, order rejections, missing/invalid account state, browser/dashboard connections, manual trades on same account.
6. Complete a forward/demo period on untouched tick data with a working high-impact historical calendar replay before deploying on a funded account. MT5's built-in calendar is unavailable in Strategy Tester; `InpTesterSkipCalendar=true` omits news compliance from the replay.
7. Only promote when **risk compliance is validated tick-for-tick** and the research preset outperforms the guarded baseline **net of costs in previously unseen periods**.

Official context:
- https://help.blueberryfunded.com/en/articles/12136586-what-are-the-drawdown-limits-on-a-prime-account
- https://help.blueberryfunded.com/en/articles/15310153-what-rules-can-breach-my-account-and-where-do-i-find-the-limits
- https://www.mql5.com/en/docs/calendar/calendarvaluehistory

**Risk caveat:** A protective MT5 EA cannot mathematically prevent violations in every real-world scenario. Broker quotes, slippage, weekend gaps, margin calls, terminal disconnections or incorrect day-reset time can push equity through the floor before orders execute. Strict floors are an execution goal, not a guarantee.
