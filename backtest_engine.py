import MetaTrader5 as mt5
import pandas as pd
import numpy as np
from datetime import datetime

def get_data(symbol, timeframe, n_bars=25000):
    if not mt5.initialize():
        raise RuntimeError("MT5 init failed")
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, n_bars)
    info = mt5.symbol_info(symbol)
    mt5.shutdown()
    
    if rates is None or len(rates) == 0:
        raise ValueError(f"No data for {symbol}")
        
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df.set_index('time', inplace=True)
    return df, info

def calculate_indicators(df):
    d = df.copy()
    # EMAs
    d['ema20'] = d['close'].ewm(span=20, adjust=False).mean()
    d['ema50'] = d['close'].ewm(span=50, adjust=False).mean()
    d['ema200'] = d['close'].ewm(span=200, adjust=False).mean()
    
    # ATR (14)
    high_low = d['high'] - d['low']
    high_close = (d['high'] - d['close'].shift(1)).abs()
    low_close = (d['low'] - d['close'].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    d['atr14'] = tr.rolling(window=14).mean()
    
    # RSI (14)
    delta = d['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-9)
    d['rsi14'] = 100 - (100 / (1 + rs))
    
    # Donchian 20
    d['donchian_high'] = d['high'].rolling(window=20).max()
    d['donchian_low'] = d['low'].rolling(window=20).min()
    
    # Bollinger Bands (20, 2)
    sma20 = d['close'].rolling(window=20).mean()
    std20 = d['close'].rolling(window=20).std()
    d['bb_upper'] = sma20 + 2 * std20
    d['bb_lower'] = sma20 - 2 * std20
    d['bb_mid'] = sma20
    
    return d

def simulate_strategy(df, signals, symbol_info, spread_points=15, risk_pct=0.015, initial_balance=10000.0):
    """
    signals: DataFrame with columns:
      'buy_signal': bool
      'sell_signal': bool
      'sl': price or distance
      'tp': price or distance
      'trailing_atr_mult': float (optional)
    """
    point = symbol_info.point
    spread = spread_points * point
    balance = initial_balance
    equity = initial_balance
    equity_curve = [initial_balance]
    
    trades = []
    current_position = None # {type, entry_price, sl, tp, volume, entry_time, peak_price}
    
    for i in range(1, len(df)):
        bar = df.iloc[i]
        prev_bar = df.iloc[i-1]
        t = df.index[i]
        
        # Check active position
        if current_position is not None:
            pos = current_position
            pos_type = pos['type']
            sl = pos['sl']
            tp = pos['tp']
            vol = pos['volume']
            entry_p = pos['entry_price']
            
            # Trailing stop update if enabled
            if 'trail_mult' in pos and pos['trail_mult'] > 0 and not np.isnan(bar['atr14']):
                trail_dist = pos['trail_mult'] * bar['atr14']
                if pos_type == 'BUY':
                    pos['peak_price'] = max(pos['peak_price'], bar['high'])
                    new_sl = pos['peak_price'] - trail_dist
                    if new_sl > pos['sl']:
                        pos['sl'] = new_sl
                elif pos_type == 'SELL':
                    pos['peak_price'] = min(pos['peak_price'], bar['low'])
                    new_sl = pos['peak_price'] + trail_dist
                    if new_sl < pos['sl']:
                        pos['sl'] = new_sl
            
            # Check Break Even trigger
            if 'be_trigger_mult' in pos and pos['be_trigger_mult'] > 0:
                be_dist = pos['be_trigger_mult'] * pos['entry_atr']
                if pos_type == 'BUY':
                    if bar['high'] >= entry_p + be_dist and pos['sl'] < entry_p:
                        pos['sl'] = entry_p + (spread) # lock in BE + small cushion
                elif pos_type == 'SELL':
                    if bar['low'] <= entry_p - be_dist and pos['sl'] > entry_p:
                        pos['sl'] = entry_p - (spread)
            
            # Check SL/TP hit during current bar
            closed = False
            exit_price = 0.0
            exit_reason = ""
            
            if pos_type == 'BUY':
                # SL checked against low
                if bar['low'] <= pos['sl']:
                    exit_price = pos['sl']
                    exit_reason = 'SL'
                    closed = True
                elif bar['high'] >= pos['tp']:
                    exit_price = pos['tp']
                    exit_reason = 'TP'
                    closed = True
            elif pos_type == 'SELL':
                if bar['high'] >= pos['sl']:
                    exit_price = pos['sl']
                    exit_reason = 'SL'
                    closed = True
                elif bar['low'] <= pos['tp']:
                    exit_price = pos['tp']
                    exit_reason = 'TP'
                    closed = True
            
            if closed:
                # Calculate profit
                if pos_type == 'BUY':
                    pips_diff = (exit_price - entry_p)
                else:
                    pips_diff = (entry_p - exit_price)
                
                # Profit calculation: vol in lots (standard lot = 100,000 for FX, 100 for Gold)
                # Contract size:
                contract_size = symbol_info.trade_contract_size if hasattr(symbol_info, 'trade_contract_size') else 100000
                profit = pips_diff * vol * contract_size
                balance += profit
                trades.append({
                    'type': pos_type,
                    'entry_time': pos['entry_time'],
                    'exit_time': t,
                    'entry_price': entry_p,
                    'exit_price': exit_price,
                    'profit': profit,
                    'return_pct': profit / (balance - profit),
                    'reason': exit_reason,
                    'balance': balance
                })
                current_position = None
        
        # Check for new entry if no position is open
        if current_position is None and i < len(df) - 1:
            sig = signals.iloc[i]
            buy_sig = sig.get('buy_signal', False)
            sell_sig = sig.get('sell_signal', False)
            
            if buy_sig:
                entry_p = bar['close'] + spread
                sl_dist = sig['sl_dist']
                tp_dist = sig['tp_dist']
                sl = entry_p - sl_dist
                tp = entry_p + tp_dist
                
                # Dynamic lot sizing based on risk %
                risk_cash = balance * risk_pct
                contract_size = symbol_info.trade_contract_size if hasattr(symbol_info, 'trade_contract_size') else 100000
                lot = risk_cash / (sl_dist * contract_size) if sl_dist > 0 else 0.01
                lot = max(0.01, min(round(lot, 2), 50.0))
                
                current_position = {
                    'type': 'BUY',
                    'entry_price': entry_p,
                    'sl': sl,
                    'tp': tp,
                    'volume': lot,
                    'entry_time': t,
                    'peak_price': entry_p,
                    'trail_mult': sig.get('trail_mult', 0),
                    'be_trigger_mult': sig.get('be_mult', 0),
                    'entry_atr': bar['atr14']
                }
            elif sell_sig:
                entry_p = bar['close']
                sl_dist = sig['sl_dist']
                tp_dist = sig['tp_dist']
                sl = entry_p + sl_dist + spread
                tp = entry_p - tp_dist
                
                risk_cash = balance * risk_pct
                contract_size = symbol_info.trade_contract_size if hasattr(symbol_info, 'trade_contract_size') else 100000
                lot = risk_cash / (sl_dist * contract_size) if sl_dist > 0 else 0.01
                lot = max(0.01, min(round(lot, 2), 50.0))
                
                current_position = {
                    'type': 'SELL',
                    'entry_price': entry_p,
                    'sl': sl,
                    'tp': tp,
                    'volume': lot,
                    'entry_time': t,
                    'peak_price': entry_p,
                    'trail_mult': sig.get('trail_mult', 0),
                    'be_trigger_mult': sig.get('be_mult', 0),
                    'entry_atr': bar['atr14']
                }
        
        equity_curve.append(balance)
    
    trades_df = pd.DataFrame(trades)
    return trades_df, pd.Series(equity_curve)

def analyze_performance(trades_df, equity_curve, initial_balance=10000.0):
    if len(trades_df) == 0:
        return {'trades': 0, 'profit': 0, 'winrate': 0, 'profit_factor': 0, 'max_dd': 0, 'sharpe': 0}
        
    total_trades = len(trades_df)
    winning_trades = trades_df[trades_df['profit'] > 0]
    losing_trades = trades_df[trades_df['profit'] < 0]
    
    win_rate = len(winning_trades) / total_trades * 100
    gross_profit = winning_trades['profit'].sum() if len(winning_trades) > 0 else 0
    gross_loss = abs(losing_trades['profit'].sum()) if len(losing_trades) > 0 else 1e-9
    profit_factor = gross_profit / gross_loss
    
    final_balance = equity_curve.iloc[-1]
    net_profit = final_balance - initial_balance
    total_return_pct = (net_profit / initial_balance) * 100
    
    # Drawdown
    peak = equity_curve.cummax()
    dd = (equity_curve - peak) / peak * 100
    max_dd = abs(dd.min())
    
    # Sharpe ratio (approximated on trade returns)
    returns = trades_df['return_pct']
    sharpe = (returns.mean() / (returns.std() + 1e-9)) * np.sqrt(252) if len(returns) > 1 else 0
    
    avg_win = winning_trades['profit'].mean() if len(winning_trades) > 0 else 0
    avg_loss = abs(losing_trades['profit'].mean()) if len(losing_trades) > 0 else 0
    rrr = avg_win / avg_loss if avg_loss > 0 else 0
    
    return {
        'trades': total_trades,
        'win_rate': round(win_rate, 2),
        'net_profit': round(net_profit, 2),
        'return_pct': round(total_return_pct, 2),
        'profit_factor': round(profit_factor, 2),
        'max_dd_pct': round(max_dd, 2),
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2),
        'rrr': round(rrr, 2),
        'sharpe': round(sharpe, 2)
    }
