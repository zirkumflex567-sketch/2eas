# Broker clock and risk-day policy

All configured terminals use the broker's New York close: 00:00 server time is 17:00 in New York. The server offset is therefore UTC+2 while New York is on standard time and UTC+3 while New York observes daylight saving time. This is a timezone rule, not a permanent UTC+3 setting or an offset inferred from a quote.

Official references:

- PU Prime states that MT4/MT5 server time follows 17:00 New York, with GMT+2 in standard time and GMT+3 in daylight time: <https://helpcenter.puprime.com/hc/en-001/articles/360004254656-What-is-PU-Prime-GMT-Offset>.
- IC Markets documents GMT+2/GMT+3 server time to align daily candles with the New York close: <https://cdn.icmarkets.com/uploads/FSA/Forex-Product-Specificiation-Sheet-1000.pdf>.
- Blueberry Markets describes the same GMT+2/GMT+3 platform clock around the New York close: <https://helpcenter.blueberrymarkets.com/vn/en/articles/16027301-mui-gio-cua-nen-tang-la-gi>.
- Blueberry Funded's rules page says the daily drawdown resets at 17:00 EST: <https://help.blueberryfunded.com/en/articles/15310153-what-rules-can-breach-my-account-and-where-do-i-find-the-limits>.

`broker_clock_policy='NEW_YORK_CLOSE'` is explicit on the five demo accounts and the protected Blueberry account. The account's broker offset is resolved from `America/New_York` at the relevant instant. Risk-day midnight therefore maps to 17:00 New York local time, including the United States DST transition dates. The configured UTC+3 value remains a fixed-offset compatibility fallback for accounts without a named policy; an unknown policy fails closed. MQL5 evidence-build scripts still embed that compatibility value at compile time; converting their recorder timestamps dynamically is a remaining AUD-08 item.

Quotes are normalized using the current observed UTC instant. Historical deal and rates timestamps resolve the offset at the timestamp itself. Historical query cursors use the offset at the requested UTC cutoff. When a broker-wall timestamp falls into the repeated hour at the autumn DST rollback, two UTC instants are possible; conversion rejects it as ambiguous rather than selecting one silently. The spring transition has no repeated wall hour.

Blueberry remains the sole `challenge_protection=true` account. Its broker-time rule is configured from public documentation and deterministic unit tests only; the Blueberry terminal, quote feed, positions, and account state are not queried by this work. Existing challenge thresholds, baselines, and stored reset state are not changed. No trading order or reset is sent.

Automated tests cover all five demo aliases plus the Blueberry policy using fixed timestamps, server-epoch conversion, the European-vs-US DST date mismatch, both United States DST boundaries, ambiguous fall-back rejection, and invalid-policy fail-closed behavior. General test fixtures explicitly remove named broker policies and use UTC; dedicated clock tests exercise the production policy.
