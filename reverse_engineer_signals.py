import MetaTrader5 as mt5
import pandas as pd
import numpy as np

# Load our extracted roundtrip trades
trades = pd.read_csv('roundtrip_trades_analysis.csv')
trades['entry_time'] = pd.to_datetime(trades['entry_time'])
trades['exit_time'] = pd.to_datetime(trades['exit_time'])

print(f"Total trades loaded: {len(trades)}")

# Let's inspect the first 30 trades
print(trades[['trade_idx', 'type', 'entry_time', 'exit_time', 'duration_hours', 'entry_price', 'exit_price', 'pips', 'profit', 'comment']].head(30))

# Connect to MT5 to fetch M15 bar data around these timestamps
if mt5.initialize():
    # Let's pull M15 bars covering early 2023 trades
    rates = mt5.copy_rates_range('XAUUSD', mt5.TIMEFRAME_M15, pd.to_datetime('2023-01-01'), pd.to_datetime('2023-01-15'))
    mt5.shutdown()
    
    if rates is not None and len(rates) > 0:
        bars = pd.DataFrame(rates)
        bars['time'] = pd.to_datetime(bars['time'], unit='s')
        bars.set_index('time', inplace=True)
        
        # Calculate standard technical indicators
        bars['ema20'] = bars['close'].ewm(span=20, adjust=False).mean()
        bars['ema50'] = bars['close'].ewm(span=50, adjust=False).mean()
        bars['ema200'] = bars['close'].ewm(span=200, adjust=False).mean()
        
        # Bollinger Bands (20, 2)
        sma20 = bars['close'].rolling(20).mean()
        std20 = bars['close'].rolling(20).std()
        bars['bb_up'] = sma20 + 2.0 * std20
        bars['bb_dn'] = sma20 - 2.0 * std20
        bars['bb_mid'] = sma20
        
        # RSI 14
        diff = bars['close'].diff()
        gain = diff.clip(lower=0).rolling(14).mean()
        loss = (-diff.clip(upper=0)).rolling(14).mean()
        bars['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
        
        # Check values at entry times of trades 1 to 10
        print("\n--- BAR & INDICATOR SNAPSHOT AT TRADE ENTRIES ---")
        for i in range(min(15, len(trades))):
            tr = trades.iloc[i]
            t = tr['entry_time']
            if t in bars.index:
                b = bars.loc[t]
                print(f"Trade #{tr['trade_idx']} {tr['type']:4s} at {t} | Price={tr['entry_price']} | Close={b['close']} | BB_Dn={b['bb_dn']:.2f} | BB_Up={b['bb_up']:.2f} | RSI={b['rsi']:.1f} | EMA50={b['ema50']:.2f} | Exit={tr['exit_time']} ({tr['duration_hours']}h) | Profit=${tr['profit']}")
