# Broker clock and risk-day policy

All configured terminals use the broker's New York close: 00:00 server time is 17:00 in New York. The server offset is therefore UTC+2 while New York is on standard time and UTC+3 while New York observes daylight saving time. This is a timezone rule, not a permanent UTC+3 setting or an offset inferred from a quote.

Official references:

- PU Prime states that MT4/MT5 server time follows 17:00 New York, with GMT+2 in standard time and GMT+3 in daylight time: <https://helpcenter.puprime.com/hc/en-001/articles/360004254656-What-is-PU-Prime-GMT-Offset>.
- IC Markets documents GMT+2/GMT+3 server time to align daily candles with the New York close: <https://cdn.icmarkets.com/uploads/FSA/Forex-Product-Specificiation-Sheet-1000.pdf>.
- Blueberry Markets describes the same GMT+2/GMT+3 platform clock around the New York close: <https://helpcenter.blueberrymarkets.com/vn/en/articles/16027301-mui-gio-cua-nen-tang-la-gi>.
- Blueberry Funded's rules page says the daily drawdown resets at 17:00 EST: <https://help.blueberryfunded.com/en/articles/15310153-what-rules-can-breach-my-account-and-where-do-i-find-the-limits>.

`broker_clock_policy='NEW_YORK_CLOSE'` is explicit on the five demo accounts and the protected Blueberry account. The account's broker offset is resolved from `America/New_York` at the relevant instant. Risk-day midnight therefore maps to 17:00 New York local time, including the United States DST transition dates. The configured UTC+3 value remains a fixed-offset compatibility fallback for accounts without a named policy; an unknown policy fails closed.

MQL5 evidence builders now resolve the live recorder offset as `TimeTradeServer()-TimeGMT()` and accept only UTC+2 or UTC+3. [MetaQuotes documents `TimeTradeServer()`](https://www.mql5.com/en/docs/dateandtime/timetradeserver) as the terminal's calculated server clock and [documents `TimeGMT()`](https://www.mql5.com/en/docs/dateandtime/timegmt) as GMT calculated from the terminal computer's local clock/DST settings. Their difference removes the shared local-clock basis while preserving the broker/server offset. Unsupported or unavailable values fail closed, so evidence does not get stamped with a guessed offset. The generated Titan, BasketGuard and GoldM15 variants compile in isolated output directories; no EA was attached or reloaded for this change. Strategy Tester timing is not part of this acceptance.

Quotes are normalized using the current observed UTC instant. Historical deal and rates timestamps resolve the offset at the timestamp itself. Historical query cursors use the offset at the requested UTC cutoff. When a broker-wall timestamp falls into the repeated hour at the autumn DST rollback, two UTC instants are possible; conversion rejects it as ambiguous rather than selecting one silently. The spring transition has no repeated wall hour.

Blueberry remains the sole `challenge_protection=true` account. Its broker-time rule is configured from public documentation and deterministic unit tests only; the Blueberry terminal, quote feed, positions, and account state are not queried by this work. Existing challenge thresholds, baselines, and stored reset state are not changed. No trading order or reset is sent.

Automated tests cover all five demo aliases plus the Blueberry policy using fixed timestamps, server-epoch conversion, the European-vs-US DST date mismatch, both United States DST boundaries, ambiguous fall-back rejection, invalid-policy fail-closed behavior, and the MQL5 recorder's supported-offset contract. General test fixtures explicitly remove named broker policies and use UTC; dedicated clock tests exercise the production policy. Live demo chart/feed and read-only scenario checks exclude Blueberry. The remaining recorder acceptance is a manually attached EA producing a new imported event; this remains separate from the tested clock conversion.
