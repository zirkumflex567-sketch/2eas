import MetaTrader5 as mt5
import pandas as pd
import numpy as np

def run_simulation_2026():
    if not mt5.initialize():
        print("Failed to initialize MT5")
        return
        
    rates = mt5.copy_rates_range('XAUUSD', mt5.TIMEFRAME_M15, pd.to_datetime('2026-01-01'), pd.to_datetime('2026-10-07'))
    info = mt5.symbol_info('XAUUSD')
    mt5.shutdown()
    
    if rates is None or len(rates) == 0:
        print("No rates loaded")
        return
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    
    point = info.point
    contract = info.trade_contract_size
    spread = 30 * point
    
    # M15 Indicators
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    # RSI 14
    diff = df['close'].diff()
    gain = diff.clip(lower=0).rolling(14).mean()
    loss = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi'] = 100 - (100 / (1 + gain / (loss + 1e-9)))
    
    # 24-hour Swing High/Low (96 M15 bars)
    df['swing_high'] = df['high'].shift(1).rolling(80).max()
    df['swing_low'] = df['low'].shift(1).rolling(80).min()
    
    # Bollinger Bands
    sma20 = df['close'].rolling(20).mean()
    std20 = df['close'].rolling(20).std()
    df['bb_up'] = sma20 + 2.0 * std20
    df['bb_dn'] = sma20 - 2.0 * std20
    
    # Simulation with fixed 0.01 lot to compare 1:1 against the original
    balance = 10000.0
    open_positions = []
    trades = []
    
    for i in range(100, len(df)):
        bar = df.iloc[i]
        t = bar.name
        
        # Check Exits
        if len(open_positions) > 0:
            rem = []
            for pos in open_positions:
                pos_type = pos['type']
                sl = pos['sl']
                closed = False
                exit_p = 0
                
                if pos_type == 'BUY':
                    if bar['low'] <= sl:
                        exit_p = sl
                        closed = True
                    # Exit when price reaches EMA20 or BB Upper from below
                    elif bar['high'] >= bar['ema20'] and bar['rsi'] >= 52 and bar['close'] > pos['entry_p']:
                        exit_p = bar['close']
                        closed = True
                else:
                    if bar['high'] >= sl:
                        exit_p = sl
                        closed = True
                    elif bar['low'] <= bar['ema20'] and bar['rsi'] <= 48 and bar['close'] < pos['entry_p']:
                        exit_p = bar['close']
                        closed = True
                        
                if closed:
                    pips = (exit_p - pos['entry_p']) if pos_type == 'BUY' else (pos['entry_p'] - exit_p)
                    profit = pips * 0.01 * contract
                    balance += profit
                    trades.append(profit)
                else:
                    rem.append(pos)
            open_positions = rem
            
        # Entry
        if len(open_positions) < 3:
            # Macro trend: EMA50 > EMA200
            uptrend = (bar['close'] > bar['ema200'])
            downtrend = (bar['close'] < bar['ema200'])
            
            # Pullback to value (Low <= EMA20 or touches BB Lower, RSI < 45)
            buy_sig = uptrend & (bar['low'] <= bar['ema20']) & (bar['close'] > bar['open']) & (bar['rsi'] < 48)
            sell_sig = downtrend & (bar['high'] >= bar['ema20']) & (bar['close'] < bar['open']) & (bar['rsi'] > 52)
            
            if buy_sig:
                ep = bar['close'] + spread
                sl_p = bar['swing_low'] - (100 * point) # 24h swing low
                if (ep - sl_p) > (100 * point):
                    open_positions.append({'type': 'BUY', 'entry_p': ep, 'sl': sl_p})
            elif sell_sig:
                ep = bar['close']
                sl_p = bar['swing_high'] + (100 * point) + spread
                if (sl_p - ep) > (100 * point):
                    open_positions.append({'type': 'SELL', 'entry_p': ep, 'sl': sl_p})
                    
    tdf = pd.Series(trades)
    wins = tdf[tdf > 0]
    losses = tdf[tdf < 0]
    wr = len(wins) / len(tdf) * 100
    pf = wins.sum() / abs(losses.sum())
    print(f"2026 Simulation with 24h Swing SL: Trades={len(tdf)} | Net Profit=${tdf.sum():,.2f} | WinRate={wr:.1f}% | PF={pf:.2f}")

if __name__ == '__main__':
    run_simulation_2026()
