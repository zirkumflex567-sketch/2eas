# Isolated compile of installed GoldM15 v1.21 source candidate

Date: 2026-10-14. This compile used copies under the ignored `output/` directory. It did not overwrite an installed file, attach/reload an EA, start Strategy Tester, or place a trade.

The saved GoldM15 chart profile names `Experts/GoldM15_Reconstruction.ex5`; the same data folder contains source v1.21, four strategy includes, and `GoldM15_Reconstruction.set`. Their SHA-256 values are recorded below. The profile's 70 values differ from the nearby preset only in numeric formatting for `MaxAccountStopRiskUSD` and `AllowLiveTrading` (profile `true`, preset `false`); see [runtime identity](EA_RUNTIME_IDENTITY_2026-10-14.md).

MetaEditor 5.0.0.6230 (SHA-256 `CF2750BDE55D98A1F3B4E56BCDD4F59300D0CFF5CAA6760985F7EF2C2CC12229`) compiled the copied v1.21 source twice with zero errors and zero warnings. One run used the other installed terminal's standard library tree; the second used this Gold terminal's tree. The output hashes differed (`E5E846860871FD9380A7A00AE2A66107E58CDA339EE45B9D23746560BA0DE2D8` and `B1C37D1F940E47E4E2632C2918358C23E5C73210EEAF8447E2261B6AE211FFA5`), and neither matched the installed EX5 (`B7C2345FFA921882A13FA9AB05E1BDAB96C18B75924CFF7AF169E3A3349BB0B1`). This is consistent with the earlier compile audit's finding that EX5 output is not byte-reproducible across nominally identical runs. It does not prove which EX5 image is loaded in process memory.

The redacted compiler transcript from the two retained logs is:

```text
MetaEditor 5.0.0.6230 — copied GoldM15_Reconstruction.mq5 — X64 Regular
Pass 1: code generated; Result: 0 errors, 0 warnings; 3045 ms
Pass 2: code generated; Result: 0 errors, 0 warnings; 2795 ms
```

The full local logs include workstation paths and remain in ignored output folders; the transcript above omits those paths while preserving the compiler result and timings.

| Input | SHA-256 |
|---|---|
| GoldM15_Reconstruction.mq5 v1.21 | `AD898E5A8A10DF7F55512B64DA63A25C884241678565E89A3363BF04715B346A` |
| GoldM15_Core.mqh | `FF1A3B87FD81F0C26900E84B3B952E35B4802FEB2D7476B775E9DAE958760D85` |
| GoldM15_Risk.mqh | `A7597935174B7283E8DF57902FB01AB8D7CCA0C584B5ADC6ED83920230EBE3B5` |
| GoldM15_RiskCore.mqh | `A35B31D1BD1BB22E764C6D7ABD0DD95B1A93A96AA429A28016A02893791172CB` |
| GoldM15_News.mqh | `86EA78EB6C990D0A6EF00B7BDF5C163BA45D4D9D959750CAA0980BCD530A3C38` |
| GoldM15_Reconstruction.set | `0366CC4A161E44A6D33BE09BD1D769FF908BCC8D4AB7F8000D94E963BAC2D4F4` |
| Installed GoldM15_Reconstruction.ex5 | `B7C2345FFA921882A13FA9AB05E1BDAB96C18B75924CFF7AF169E3A3349BB0B1` |
| Gold terminal Trade/Trade.mqh | `96E6781624534377FE7971CBA52CCA3D62D1B030BC10D5E4EBF3ED8C541399ED` |
| Gold terminal Object.mqh | `DFAD4FDB6D1BF47CF43FCBC2882E52979459F17A776F75F250A7C32D0623AB35` |
| Gold terminal StdLibErr.mqh | `04BB2C47B1B04DCEB052E6DBA1F85E0330C53ABC602F341E2EA95EA1498AB28B` |
| Gold terminal Trade/OrderInfo.mqh | `D0E479578EF91D2EF1B07AE63D28AE54E15CEBB914DD10E5D4510C269A9CA999` |
| Gold terminal Trade/HistoryOrderInfo.mqh | `E88F6BE450462A045470315887EF751A4510DA65A5115325DC88542743FC52F8` |
| Gold terminal Trade/PositionInfo.mqh | `DD720B755C7F23DCC109FC81BCF0772B907411D545E4A1117421737BB9FF6897` |
| Gold terminal Trade/DealInfo.mqh | `9D6FB4E7D8754EAEE761E43943DC49CDC3A32793EE8438119D939EA7BAD71880` |

Both successful compiler logs are retained locally in ignored output directories for this checkout. The installed source/profile/binary inventory improves the chart identity evidence, but the binary mismatch and profile-vs-preset override mean that no producer is yet approved for attachment. No strategy or preset behavior was changed.
