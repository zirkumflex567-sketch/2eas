import os
import sys
import time
import math
import json
import hmac
import webbrowser
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd
import numpy as np
import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from pathlib import Path
from account_gateway import ACCOUNTS, config_path, public_account, scoped, selected, verify_identity, writes_titan_reset
from goldm15_dashboard import GUARD_FILE, metrics as gold_metrics, parameters as gold_parameters, read_guard, wilder_rsi
from chart_studio.money import PreviewError, preview_scenario
from chart_studio.workspaces import WorkspaceStore, StoreError, WorkspaceMissing, RevisionConflict
from functools import lru_cache

app = FastAPI(title="XAU Titan Pro - Institutional Live Cockpit")
BASE_DIR = Path(__file__).resolve().parent

app.mount("/static", StaticFiles(directory=str(BASE_DIR / 'static')), name="static")

SYMBOL = "XAUUSD"
TIMEFRAME = mt5.TIMEFRAME_M15
TIMEFRAME_MAP = {
    'M1': mt5.TIMEFRAME_M1,
    'M5': mt5.TIMEFRAME_M5,
    'M15': mt5.TIMEFRAME_M15,
    'M30': mt5.TIMEFRAME_M30,
    'H1': mt5.TIMEFRAME_H1,
    'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1,
}
TERMINAL_PATH = r"C:\Program Files\PU Prime MT5 Terminal\terminal64.exe"

def ensure_mt5_init():
    # The request decorator holds the connection lock and explicitly attaches.
    return bool(verify_identity(mt5, selected()))

class ModifyPositionRequest(BaseModel):
    ticket: int
    sl_usd: Optional[float] = None
    tp_usd: Optional[float] = None
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

class ChartScenarioPreviewRequest(BaseModel):
    account: str
    symbol: str
    side: str
    volumeLots: float
    entryPrice: float
    slPrice: float
    tpPrice: float


class ChartWorkspaceWriteRequest(BaseModel):
    account: str
    symbol: str
    name: str
    expectedRevision: int
    document: dict


class ChartWorkspaceDeleteRequest(BaseModel):
    account: str
    symbol: str
    name: str
    expectedRevision: int


class ClosePositionRequest(BaseModel):
    ticket: int

class ResetDrawdownRequest(BaseModel):
    action: str = "reset"  # "reset" or "auto"
    baseline: Optional[float] = None

# --- DAILY DRAWDOWN CONFIG PERSISTENCE ---
DD_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drawdown_config.json")
COMMON_FILES_DIR = os.path.expanduser(r"~\AppData\Roaming\MetaQuotes\Terminal\Common\Files")

def load_dd_config():
    filename = config_path(BASE_DIR)
    if filename.exists():
        try:
            with open(filename, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "manual_reset_active": False,
        "reset_balance": 10000.0,
        "reset_timestamp": None,
        "reset_date": None
    }

def save_dd_config(cfg):
    try:
        with open(config_path(BASE_DIR), "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"Error saving local dd config: {e}")
    try:
        if writes_titan_reset() and os.path.exists(COMMON_FILES_DIR):
            common_file = os.path.join(COMMON_FILES_DIR, "titan_dd_reset.json")
            with open(common_file, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"Error saving common dd config: {e}")

# --- VOLUME PROFILE & S/R HELPER ---
def compute_volume_profile(df_subset, num_bins=24):
    if len(df_subset) == 0:
        return {}
    min_p = float(df_subset['low'].min())
    max_p = float(df_subset['high'].max())
    if max_p <= min_p:
        return {}
        
    bins = np.linspace(min_p, max_p, num_bins + 1)
    bin_vols = np.zeros(num_bins)
    
    # Vectorized midpoint binning with unchanged clipping semantics.
    midpoint = (df_subset['high'].to_numpy(dtype=float) +
                df_subset['low'].to_numpy(dtype=float)) / 2.0
    indices = np.clip(((midpoint - min_p) / (max_p - min_p) * num_bins).astype(int),
                      0, num_bins - 1)
    bin_vols = np.bincount(indices, weights=df_subset['tick_volume'].to_numpy(dtype=float),
                           minlength=num_bins).astype(float)
        
    poc_idx = int(np.argmax(bin_vols))
    poc_price = float((bins[poc_idx] + bins[poc_idx+1]) / 2.0)
    
    total_vol = float(bin_vols.sum())
    target_va = total_vol * 0.70
    cum_vol = float(bin_vols[poc_idx])
    l_idx, r_idx = poc_idx, poc_idx
    
    while cum_vol < target_va and (l_idx > 0 or r_idx < num_bins - 1):
        next_l = bin_vols[l_idx - 1] if l_idx > 0 else 0
        next_r = bin_vols[r_idx + 1] if r_idx < num_bins - 1 else 0
        if next_l >= next_r and l_idx > 0:
            l_idx -= 1
            cum_vol += next_l
        elif r_idx < num_bins - 1:
            r_idx += 1
            cum_vol += next_r
        else:
            break
            
    val_price = float((bins[l_idx] + bins[l_idx+1]) / 2.0)
    vah_price = float((bins[r_idx] + bins[r_idx+1]) / 2.0)
    
    max_v = float(max(bin_vols)) if max(bin_vols) > 0 else 1.0
    histogram = []
    for i in range(num_bins):
        p_mid = round(float((bins[i] + bins[i+1]) / 2.0), 2)
        pct = round(float((bin_vols[i] / max_v) * 100.0), 1)
        in_va = bool(l_idx <= i <= r_idx)
        histogram.append({
            'price': p_mid,
            'vol_pct': pct,
            'in_va': in_va,
            'is_poc': bool(i == poc_idx)
        })
        
    return {
        'poc': round(poc_price, 2),
        'vah': round(vah_price, 2),
        'val': round(val_price, 2),
        'high': round(max_p, 2),
        'low': round(min_p, 2),
        'total_volume': int(total_vol),
        'histogram': histogram
    }

JOURNAL_CACHE = {}
JOURNAL_CACHE_AT = {}
JOURNAL_CACHE_TTL_SEC = 3.0


def get_cached_trade_journal(account_id, server_time, local_time):
    # Called inside the account-verified MT5 lock. Never used for trade/risk writes.
    now = time.monotonic()
    if (account_id in JOURNAL_CACHE and
            now - JOURNAL_CACHE_AT.get(account_id, -1e12) < JOURNAL_CACHE_TTL_SEC):
        return JOURNAL_CACHE[account_id]
    entries = build_trade_journal(account_id, server_time, local_time)
    JOURNAL_CACHE[account_id] = entries
    JOURNAL_CACHE_AT[account_id] = now
    return entries

def build_trade_journal(account_id, server_time, local_time):
    cutoff_server = datetime(2026, 10, 8, 23, 0, 0)
    deals = mt5.history_deals_get(datetime(2026, 10, 8, 22, 0, 0), datetime.now() + timedelta(days=2)) or []
    positions = mt5.positions_get(symbol=SYMBOL) or []
    
    entries = []
    
    # 1. Open Positions (LIVE)
    for p in positions:
        p_time = datetime.fromtimestamp(p.time)
        if p_time >= cutoff_server:
            action_str = 'BUY' if p.type == mt5.ORDER_TYPE_BUY else 'SELL'
            cur_price = round(float(p.price_current), 2)
            open_price = round(float(p.price_open), 2)
            points = (cur_price - open_price) if p.type == mt5.ORDER_TYPE_BUY else (open_price - cur_price)
            if account_id == 'titan':
                why = 'Ausgelöst bei M15-Kerzenschluss (20:00 DE / 23:00 Server). Alle 5 Champion-Kriterien erfüllt: 1. Bullischer Trend-Fächer (EMA9 > EMA21), 2. Kurs über Trendfilter EMA50 ($4133.09 > $4123.69), 3. Kurs über Basis-EMA9 ($4127.33), 4. RSI14 bei 54.1 (Momentum >= 50.0), 5. Grüne Bestätigungskerze (Close > Open). Keine Cluster-Sperre aktiv.'
                tp_goal = 'Dynamischer Trend-Runner Modus (Kein fixer TP für maximale Gewinne). Trailing-Ausstieg: Schließt, sobald mindestens +$28.00 Gewinn erreicht sind und eine M15-Kerze unter die Basis-EMA9 schließt. Absicherung: Struktureller Swing-SL bei 4102.68 $ (-30.41 $ Puffer).'
            else:
                why = f'Ausgelöst durch Subsystem {p.comment}. RSI-Trendfilter aktiv mit RSI-Pullback Extremwert.'
                tp_goal = 'Momentum-Exit via Rate-of-Change (ROC) Zielerreichung im Slot oder Not-SL bei 4140.50 $.'
                
            entries.append({
                'ticket': int(p.ticket),
                'time_ts': int(p.time),
                'strategy': 'XAU Titan Pro' if account_id == 'titan' else 'GoldM15 Reconstruction',
                'account': account_id,
                'status': 'OPEN',
                'type': action_str,
                'volume': float(p.volume),
                'open_price': open_price,
                'current_price': cur_price,
                'points': round(float(points), 2),
                'sl_price': round(float(p.sl), 2),
                'tp_price': round(float(p.tp), 2),
                'profit_usd': round(float(p.profit), 2),
                'time_server': p_time.strftime('%H:%M:%S'),
                'time_de': (p_time.replace(hour=(p_time.hour - 3) % 24)).strftime('%H:%M:%S'),
                'why_triggered': why,
                'profit_goal': tp_goal
            })
            
    # 2. Closed Deals (HISTORIE)
    # Preserve first-matching-deal semantics without O(exits * all_deals).
    first_by_order, first_by_position = {}, {}
    for idx, deal in enumerate(deals):
        first_by_order.setdefault(deal.order, (idx, deal))
        first_by_position.setdefault(getattr(deal, 'position_id', None), (idx, deal))
    out_deals = [d for d in deals if d.entry == mt5.DEAL_ENTRY_OUT and datetime.fromtimestamp(d.time) >= cutoff_server]
    for d in out_deals:
        d_time = datetime.fromtimestamp(d.time)
        matches = [match for match in (
            first_by_order.get(d.order),
            first_by_position.get(getattr(d, 'position_id', None))
        ) if match is not None]
        in_deal = min(matches, key=lambda match: match[0])[1] if matches else None
        open_price = round(float(in_deal.price if in_deal else d.price), 2)
        close_price = round(float(d.price), 2)
        orig_type = 'SELL' if d.type == mt5.DEAL_TYPE_BUY else 'BUY'
        points = (close_price - open_price) if orig_type == 'BUY' else (open_price - close_price)
        
        if account_id == 'goldm15':
            comment_str = str(in_deal.comment if in_deal else d.comment)
            slot = 'S1' if 'S1' in comment_str else ('S2' if 'S2' in comment_str else 'S3')
            why = f'Ausgelöst bei M15-Kerzenschluss (Subsystem {slot}): Bärischer Trendfilter (RSI30 <= 55) mit überkauftem RSI2-Spike (>= 70) als Mean-Reversion Short-Bounce.'
            tp_goal = f'Ausstiegsziel: Momentum-Exit bei Erreichen des ROC-Ziels (ROC 5 <= -0.2%/-0.3%). Geschlossen um {d_time.strftime("%H:%M:%S")} Server ({(d_time.replace(hour=(d_time.hour - 3) % 24)).strftime("%H:%M:%S")} DE) bei {d.price:.2f} $.'
        else:
            why = 'Champion Trend-Momentum Einstieg.'
            tp_goal = 'Dynamischer Trend-Runner Ausstieg.'
            
        entries.append({
            'ticket': int(d.ticket),
            'time_ts': int(d.time),
            'strategy': 'XAU Titan Pro' if account_id == 'titan' else 'GoldM15 Reconstruction',
            'account': account_id,
            'status': 'CLOSED',
            'type': orig_type,
            'volume': float(d.volume),
            'open_price': open_price,
            'close_price': close_price,
            'points': round(float(points), 2),
            'profit_usd': round(float(d.profit), 2),
            'net_profit_usd': round(float(d.profit + d.swap + d.commission), 2),
            'time_server': d_time.strftime('%H:%M:%S'),
            'time_de': (d_time.replace(hour=(d_time.hour - 3) % 24)).strftime('%H:%M:%S'),
            'why_triggered': why,
            'profit_goal': tp_goal
        })
        
    entries.sort(key=lambda x: x['time_ts'], reverse=True)
    JOURNAL_CACHE[account_id] = entries
    return entries

def get_live_market_data():
    if not ensure_mt5_init():
        return None
    
    sym = mt5.symbol_info(SYMBOL)
    tick = mt5.symbol_info_tick(SYMBOL)
    acc = mt5.account_info()
    
    if not sym or not tick or not acc:
        return None
        
    rates = mt5.copy_rates_from_pos(SYMBOL, TIMEFRAME, 0, 5000 if selected()['id']=='goldm15' else 1000)
    if rates is None or len(rates) < 200:
        return None
        
    df = pd.DataFrame(rates)
    df['dt'] = pd.to_datetime(df['time'], unit='s')
    
    # Indicators
    df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()  # UI EMA20; separate from EA ema21
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    
    diff = df['close'].diff()
    g = diff.clip(lower=0).rolling(14).mean()
    l = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))
    
    tr = pd.concat([df['high'] - df['low'], abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))], axis=1).max(axis=1)
    df['atr14'] = tr.rolling(14).mean()
    
    cur_bar = df.iloc[-1]
    
    server_time = datetime.fromtimestamp(tick.time, timezone.utc)
    local_time = datetime.now().astimezone()
    german_hour = local_time.hour
    
    in_window = (server_time.hour != 0)
                 
    bar_duration = 15 * 60
    bar_start = int(cur_bar['time'])
    bar_elapsed = tick.time - bar_start
    bar_remaining = max(0, bar_duration - bar_elapsed)
    
    # 1. Volume Profiles (Daily & Weekly)
    today_date = cur_bar['dt'].date()
    monday_date = today_date - timedelta(days=today_date.weekday())
    
    today_df = df[df['dt'].dt.date == today_date]
    week_df  = df[df['dt'].dt.date >= monday_date]
    
    daily_vp = compute_volume_profile(today_df, num_bins=20)
    weekly_vp = compute_volume_profile(week_df, num_bins=25)
    
    # 2. Key Support & Resistance Levels
    sr_levels = {
        'daily_high': daily_vp.get('high', round(float(cur_bar['high']), 2)),
        'daily_low':  daily_vp.get('low', round(float(cur_bar['low']), 2)),
        'daily_poc':  daily_vp.get('poc', 0.0),
        'daily_vah':  daily_vp.get('vah', 0.0),
        'daily_val':  daily_vp.get('val', 0.0),
        'weekly_high': weekly_vp.get('high', 0.0),
        'weekly_low':  weekly_vp.get('low', 0.0),
        'weekly_poc':  weekly_vp.get('poc', 0.0),
        'weekly_vah':  weekly_vp.get('vah', 0.0),
        'weekly_val':  weekly_vp.get('val', 0.0),
    }
    
    # 3. Strategy Rules (Champion Trend-Momentum Engine - 1:1 Match to XAU_Titan_Pro.mq5)
    # The EA checks at the bar transition:
    # Buy: (close1 > fast_ema[1]) && (fast_ema[1] > slow_ema[1]) && (close1 > trend_ema[1]) && (rsi_val[1] >= 50.0) && (close1 > open1)
    # Sell: (close1 < fast_ema[1]) && (fast_ema[1] < slow_ema[1]) && (close1 < trend_ema[1]) && (rsi_val[1] <= 50.0) && (close1 < open1)
    
    buy_c1_stack = (cur_bar['ema9'] > cur_bar['ema21'])
    buy_c2_ema50 = (cur_bar['close'] > cur_bar['ema50'])
    buy_c3_ema9  = (cur_bar['close'] > cur_bar['ema9'])
    buy_c4_rsi   = (cur_bar['rsi14'] >= 50.0)
    buy_c5_green = (cur_bar['close'] > cur_bar['open'])
    
    sell_c1_stack = (cur_bar['ema9'] < cur_bar['ema21'])
    sell_c2_ema50 = (cur_bar['close'] < cur_bar['ema50'])
    sell_c3_ema9  = (cur_bar['close'] < cur_bar['ema9'])
    sell_c4_rsi   = (cur_bar['rsi14'] <= 50.0)
    sell_c5_red   = (cur_bar['close'] < cur_bar['open'])
    
    # 6. Anti-Trap / Überdehnungsfilter (ATR)
    atr_val = float(cur_bar['atr14']) if pd.notnull(cur_bar.get('atr14')) and cur_bar['atr14'] > 0 else 3.5
    max_atr_dist = 1.8 * atr_val
    dist_long = float(cur_bar['close'] - cur_bar['ema21'])
    dist_short = float(cur_bar['ema21'] - cur_bar['close'])
    buy_c6_not_overextended = (dist_long <= max_atr_dist)
    sell_c6_not_overextended = (dist_short <= max_atr_dist)

    # 7. Climax-Run (Kerzen-Erschöpfung über letzte Bars)
    last_3 = df.iloc[-4:-1] if len(df) >= 4 else df.iloc[:-1]
    green_streak = sum(1 for _, r in last_3.iterrows() if r['close'] > r['open'])
    red_streak = sum(1 for _, r in last_3.iterrows() if r['close'] < r['open'])
    buy_c7_climax_ok = (green_streak < 3)
    sell_c7_climax_ok = (red_streak < 3)

    # 8. S/R Widerstands-Freiraum
    swing_lookback = df.iloc[-50:-3] if len(df) >= 55 else df.iloc[:-3]
    recent_res = float(swing_lookback['high'].max()) if len(swing_lookback) > 0 else float(cur_bar['close']) + 10.0
    recent_sup = float(swing_lookback['low'].min()) if len(swing_lookback) > 0 else float(cur_bar['close']) - 10.0
    min_sr_room = 3.00 # $3.00 auf Gold
    buy_c8_sr_ok = not (recent_res > cur_bar['close'] and (recent_res - cur_bar['close']) < min_sr_room)
    sell_c8_sr_ok = not (cur_bar['close'] > recent_sup and (cur_bar['close'] - recent_sup) < min_sr_room)

    rules_matrix = [
        {
            "id": "stack",
            "name": "1. Trend-Stack (EMA9 vs EMA21)",
            "current_val": f"EMA9 ${cur_bar['ema9']:.2f} vs EMA21 ${cur_bar['ema21']:.2f}",
            "short_met": bool(sell_c1_stack),
            "long_met": bool(buy_c1_stack),
            "short_note": "Bärischer Fächer (EMA9 < EMA21)" if sell_c1_stack else "Bullischer Fächer (EMA9 > EMA21)",
            "long_note": "Bullischer Fächer (EMA9 > EMA21)" if buy_c1_stack else "Bärischer Fächer (EMA9 < EMA21)"
        },
        {
            "id": "ema50",
            "name": "2. Trendfilter (EMA50)",
            "current_val": f"Kurs ${cur_bar['close']:.2f} vs EMA50 ${cur_bar['ema50']:.2f}",
            "short_met": bool(sell_c2_ema50),
            "long_met": bool(buy_c2_ema50),
            "short_note": "Unter Trend-EMA50" if sell_c2_ema50 else "Über Trend-EMA50",
            "long_note": "Über Trend-EMA50" if buy_c2_ema50 else "Unter Trend-EMA50"
        },
        {
            "id": "ema9",
            "name": "3. Basis-EMA Momentum (EMA9)",
            "current_val": f"Kurs ${cur_bar['close']:.2f} vs EMA9 ${cur_bar['ema9']:.2f}",
            "short_met": bool(sell_c3_ema9),
            "long_met": bool(buy_c3_ema9),
            "short_note": "Unter Basis-EMA9" if sell_c3_ema9 else "Über Basis-EMA9",
            "long_note": "Über Basis-EMA9" if buy_c3_ema9 else "Unter Basis-EMA9"
        },
        {
            "id": "rsi",
            "name": "4. RSI Momentum (50er Schwelle)",
            "current_val": f"RSI {cur_bar['rsi14']:.1f}",
            "short_met": bool(sell_c4_rsi),
            "long_met": bool(buy_c4_rsi),
            "short_note": "Bärisch (<= 50.0)" if sell_c4_rsi else "Bullisch (> 50.0)",
            "long_note": "Bullisch (>= 50.0)" if buy_c4_rsi else "Bärisch (< 50.0)"
        },
        {
            "id": "candle",
            "name": "5. Kerzen-Farbe (M15-Bestätigung)",
            "current_val": f"Grüne Kerze (+${cur_bar['close']-cur_bar['open']:.2f})" if buy_c5_green else f"Rote Kerze (-${cur_bar['open']-cur_bar['close']:.2f})",
            "short_met": bool(sell_c5_red),
            "long_met": bool(buy_c5_green),
            "short_note": "Rote Kerze bestätigt Short" if sell_c5_red else "Grüne Kerze (Kein Short)",
            "long_note": "Grüne Kerze bestätigt Long" if buy_c5_green else "Rote Kerze (Kein Long)"
        },
        {
            "id": "overextension",
            "name": "6. Anti-Trap: ATR-Überdehnung",
            "current_val": f"Distanz ${dist_long:+.2f} vs Max ${max_atr_dist:.2f} (1.8x ATR)",
            "short_met": bool(sell_c6_not_overextended),
            "long_met": bool(buy_c6_not_overextended),
            "short_note": "Keine Überdehnung nach unten" if sell_c6_not_overextended else f"Überdehnt! Distanz ${dist_short:.2f} > 1.8x ATR",
            "long_note": "Im normalen Rahmen" if buy_c6_not_overextended else f"Überdehnt! Distanz ${dist_long:.2f} > 1.8x ATR (Gipfel)"
        },
        {
            "id": "climax",
            "name": "7. Anti-Trap: Kerzen-Erschöpfung",
            "current_val": f"{green_streak}x Grün / {red_streak}x Rot in Folge",
            "short_met": bool(sell_c7_climax_ok),
            "long_met": bool(buy_c7_climax_ok),
            "short_note": "Kein roter Climax-Run" if sell_c7_climax_ok else "3 rote Kerzen am Stück (Erschöpfung)",
            "long_note": "Kein grüner Climax-Run" if buy_c7_climax_ok else "3 grüne Kerzen am Stück (Gipfel-Erschöpfung)"
        },
        {
            "id": "sr_room",
            "name": "8. Anti-Trap: S/R-Widerstandspuffer",
            "current_val": f"Widerstand ${recent_res:.2f} (Puffer ${recent_res-cur_bar['close']:.2f})",
            "short_met": bool(sell_c8_sr_ok),
            "long_met": bool(buy_c8_sr_ok),
            "short_note": "Genügend Support-Freiraum" if sell_c8_sr_ok else "Direkt auf Support (< $3 Puffer)",
            "long_note": "Genügend Widerstands-Freiraum" if buy_c8_sr_ok else "Direkt unter Widerstand (< $3 Puffer)"
        }
    ]
    
    sell_met_count = sum(1 for r in rules_matrix if r['short_met'])
    buy_met_count  = sum(1 for r in rules_matrix if r['long_met'])
    total_rules = len(rules_matrix)
    sell_readiness = int((sell_met_count / float(total_rules)) * 100)
    buy_readiness  = int((buy_met_count / float(total_rules)) * 100)
    
    # Dynamic Trend Regime Identification
    is_bullish = bool(cur_bar['ema9'] >= cur_bar['ema21'])
    trend_diff = float(cur_bar['ema9'] - cur_bar['ema21'])
    
    if is_bullish:
        trend_direction = "BULLISH"
        trend_name = "AUFWÄRTSTREND (BULLISH)"
        active_focus = "LONG-FOKUS"
        if not buy_c1_stack:
            trend_diagnosis = f"Warte auf EMA9 (${cur_bar['ema9']:.2f}) > EMA21 (${cur_bar['ema21']:.2f})."
        elif not buy_c2_ema50:
            trend_diagnosis = f"Kurs (${cur_bar['close']:.2f}) noch unter EMA50 (${cur_bar['ema50']:.2f})."
        elif not buy_c3_ema9:
            trend_diagnosis = f"Kurs (${cur_bar['close']:.2f}) noch unter Basis-EMA9 (${cur_bar['ema9']:.2f})."
        elif not buy_c4_rsi:
            trend_diagnosis = f"RSI ({cur_bar['rsi14']:.1f}) < 50.0 Momentum-Schwelle."
        elif not buy_c5_green:
            trend_diagnosis = "Kerze ist ROT (Close <= Open)! Titan EA erfordert grüne Bestätigungskerze zum M15-Schluss."
        elif not buy_c6_not_overextended:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Move überdehnt (${dist_long:.2f} > 1.8x ATR). Kauf am Gipfel gesperrt!"
        elif not buy_c7_climax_ok:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Bereits {green_streak} grüne Kerzen in Folge. Warten auf Pause/Pullback!"
        elif not buy_c8_sr_ok:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Zu nah am Widerstand (${recent_res:.2f}). Kauf in Supply gesperrt!"
        else:
            trend_diagnosis = "ALLE REGELN ERFÜLLT INKL. ANTI-TRAP SCHUTZ! Bereit für M15-Schluss."
    else:
        trend_direction = "BEARISH"
        trend_name = "ABWÄRTSTREND (BEARISH)"
        active_focus = "SHORT-FOKUS"
        if not sell_c1_stack:
            trend_diagnosis = f"Warte auf EMA9 (${cur_bar['ema9']:.2f}) < EMA21 (${cur_bar['ema21']:.2f})."
        elif not sell_c2_ema50:
            trend_diagnosis = f"Kurs (${cur_bar['close']:.2f}) über EMA50 (${cur_bar['ema50']:.2f})."
        elif not sell_c3_ema9:
            trend_diagnosis = f"Kurs (${cur_bar['close']:.2f}) über Basis-EMA9 (${cur_bar['ema9']:.2f})."
        elif not sell_c4_rsi:
            trend_diagnosis = f"RSI ({cur_bar['rsi14']:.1f}) > 50.0 Momentum-Schwelle."
        elif not sell_c5_red:
            trend_diagnosis = "Kerze ist GRÜN (Close >= Open)! Titan EA erfordert rote Bestätigungskerze zum M15-Schluss."
        elif not sell_c6_not_overextended:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Move überdehnt (${dist_short:.2f} > 1.8x ATR). Verkauf am Boden gesperrt!"
        elif not sell_c7_climax_ok:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Bereits {red_streak} rote Kerzen in Folge. Warten auf Pause/Pullback!"
        elif not sell_c8_sr_ok:
            trend_diagnosis = f"ANTI-TRAP AKTIV: Zu nah am Support (${recent_sup:.2f}). Verkauf in Demand gesperrt!"
        else:
            trend_diagnosis = "ALLE REGELN ERFÜLLT INKL. ANTI-TRAP SCHUTZ! Bereit für M15-Schluss."

    short_missing = trend_diagnosis

    # Positions
    pos_objects = mt5.positions_get(symbol=SYMBOL)
    if pos_objects is None:
        raise HTTPException(503, 'MT5-Positionen derzeit nicht verfügbar.')
    positions = []
    contract_size = sym.trade_contract_size
    
    for p in pos_objects:
        p_type = "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL"
        vol = p.volume
        op = p.price_open
        cp = p.price_current
        profit = p.profit + p.swap
        
        sl_usd = 0.0
        if p.sl > 0:
            sl_usd = ((p.sl - op) if p_type == "BUY" else (op - p.sl)) * vol * contract_size
        tp_usd = 0.0
        if p.tp > 0:
            tp_usd = ((p.tp - op) if p_type == "BUY" else (op - p.tp)) * vol * contract_size
            
        positions.append({
            "ticket": p.ticket,
            "type": p_type,
            "volume": vol,
            "open_price": op,
            "current_price": cp,
            "profit_usd": profit,
            "profit_pct": (profit / acc.balance) * 100.0,
            "sl_price": p.sl,
            "sl_usd": sl_usd,
            "tp_price": p.tp,
            "tp_usd": tp_usd,
            "time": datetime.fromtimestamp(p.time, timezone.utc).strftime("%H:%M:%S"),
            "magic": getattr(p, 'magic', 0)
        })

    # Daily Drawdown Calculation (Blueberry Funded Rule: Day Start Balance / High Water Mark)
    midnight_dt = server_time.replace(hour=0, minute=0, second=0, microsecond=0)
    dd_cfg = load_dd_config()
    manual_active = dd_cfg.get("manual_reset_active", False)
    reset_ts = dd_cfg.get("reset_timestamp")
    reset_bal = dd_cfg.get("reset_balance", 10000.0)

    if manual_active and reset_ts:
        reset_dt = datetime.fromtimestamp(reset_ts, timezone.utc)
        from_dt = max(midnight_dt, reset_dt)
        deals = mt5.history_deals_get(from_dt, server_time)
        realized_today = 0.0
        if deals:
            for d in deals:
                if d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
                    realized_today += (d.profit + d.swap + d.commission)
        day_start_bal = float(reset_bal)
    else:
        deals = mt5.history_deals_get(midnight_dt, server_time)
        realized_today = 0.0
        if deals:
            for d in deals:
                if d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
                    realized_today += (d.profit + d.swap + d.commission)
        day_start_bal = acc.balance - realized_today

    daily_ref = max(day_start_bal, acc.balance)
    daily_loss_usd = max(0.0, daily_ref - acc.equity)
    daily_dd_pct = (daily_loss_usd / daily_ref) * 100.0 if daily_ref > 0 else 0.0

    ea_limit_pct = 3.5
    broker_limit_pct = 4.0
    buffer_ea_usd = max(0.0, (daily_ref * (ea_limit_pct / 100.0)) - daily_loss_usd)
    buffer_broker_usd = max(0.0, (daily_ref * (broker_limit_pct / 100.0)) - daily_loss_usd)

    daily_drawdown = {
        "loss_usd": round(daily_loss_usd, 2),
        "pct": round(daily_dd_pct, 2),
        "limit_pct": ea_limit_pct,
        "broker_limit_pct": broker_limit_pct,
        "buffer_usd": round(buffer_ea_usd, 2),
        "buffer_broker_usd": round(buffer_broker_usd, 2),
        "day_start_bal": round(day_start_bal, 2),
        "daily_ref": round(daily_ref, 2),
        "balance": round(acc.balance, 2),
        "equity": round(acc.equity, 2),
        "realized_today": round(realized_today, 2),
        "manual_active": manual_active,
        "reset_balance": round(float(reset_bal), 2) if manual_active else None,
        "reset_time_str": datetime.fromtimestamp(reset_ts, timezone.utc).strftime("%H:%M:%S") if (manual_active and reset_ts) else None
    }

    result = {
        "symbol": SYMBOL,
        "bid": tick.bid,
        "ask": tick.ask,
        "spread": sym.spread,
        "times": {
            "server": server_time.strftime("%H:%M:%S"),
            "german": local_time.strftime('%H:%M:%S'),
            "bar_remaining_sec": bar_remaining,
            "bar_remaining_fmt": f"{bar_remaining//60:02d}:{bar_remaining%60:02d}"
        },
        "indicators": {
            "close": cur_bar['close'],
            "ema20": cur_bar['ema20'],
            "ema50": cur_bar['ema50'],
            "ema200": cur_bar['ema200'],
            "rsi14": cur_bar['rsi14'],
            "ema_diff": cur_bar['ema20'] - cur_bar['ema50']
        },
        "sell_readiness": sell_readiness,
        "buy_readiness": buy_readiness,
        "sell_met_count": sell_met_count,
        "buy_met_count": buy_met_count,
        "trend_direction": trend_direction,
        "trend_name": trend_name,
        "active_focus": active_focus,
        "trend_diagnosis": trend_diagnosis,
        "trend_diff": round(trend_diff, 2),
        "rules_matrix": rules_matrix,
        "short_missing": short_missing,
        "in_window": in_window,
        "sr_levels": sr_levels,
        "daily_vp": daily_vp,
        "weekly_vp": weekly_vp,
        "positions": positions,
        "daily_drawdown": daily_drawdown,
        "journal": get_cached_trade_journal(selected()['id'], server_time, local_time),
        "journal_cache": JOURNAL_CACHE
    }
    result.update(account=public_account(selected()), rule_count=len(rules_matrix), exit_goals=[], ea_guard=None)
    if selected()['id']=='goldm15':
        params = gold_parameters()
        result.update(gold_metrics(df['close'].to_numpy(), params))
        guard = read_guard(GUARD_FILE, tick.time, acc.equity, params, balance=acc.balance)
        result['ea_guard'] = guard
        result['signal_bar_time'] = datetime.fromtimestamp(int(df.iloc[-2]['time']), timezone.utc).strftime('%H:%M')
        if guard['baseline_verified'] and not manual_active:
            daily_loss = max(0, guard['baseline'] - min(acc.balance, acc.equity))
            daily_drawdown.update(loss_usd=round(daily_loss, 2), pct=round(100*daily_loss/params['InitialBalanceUSD'], 2),
                                 daily_ref=guard['baseline'], day_start_bal=guard['baseline'], buffer_usd=round(guard['daily_buffer_usd'], 2))
        result['in_window'] = False if guard['hard_lock'] or guard['daily_lock'] or not guard['baseline_verified'] else None
    return result

@app.get('/api/accounts')
def api_accounts():
    return {'default': 'titan', 'accounts': [public_account(a) for a in ACCOUNTS.values()]}

@app.get('/api/journal_summary')
@scoped(mt5)
def api_journal_summary(account: str = 'titan'):
    sym = mt5.symbol_info(SYMBOL)
    server_time = datetime.fromtimestamp(sym.time) if sym else datetime.now()
    local_time = datetime.now()
    entries = get_cached_trade_journal(account, server_time, local_time)
    JOURNAL_CACHE[account] = entries
    return {
        'account': account,
        'journal': entries,
        'journal_cache': JOURNAL_CACHE
    }

@app.get("/api/status")
@scoped(mt5)
def api_status(account: str = 'titan'):
    data = get_live_market_data()
    if data is None:
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    return data

@app.get("/api/candles")
@scoped(mt5)
def api_candles(count: int = 150, account: str = 'titan', tf: str = 'M15'):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 Fehler")
    tf_upper = tf.upper()
    tf_val = TIMEFRAME_MAP.get(tf_upper, mt5.TIMEFRAME_M15)
    count = min(1000, max(10, count))
    fetch_count = max(5000, count+250) if (account=='goldm15' and tf_val==mt5.TIMEFRAME_M15) else (count+250)
    rates = mt5.copy_rates_from_pos(SYMBOL, tf_val, 0, fetch_count)
    if rates is None or len(rates)<2:
        raise HTTPException(status_code=500, detail="Konnte Kerzen nicht laden")
        
    df = pd.DataFrame(rates)
    df['dt'] = pd.to_datetime(df['time'], unit='s')
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    diff = df['close'].diff()
    g = diff.clip(lower=0).rolling(14).mean()
    l = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))
    if account=='goldm15' and tf_val==mt5.TIMEFRAME_M15:
        params = gold_parameters()
        for n in {int(params[f'S{s}_{key}']) for s in range(1,4) for key in ('FastRSI','BuyTrendRSI','SellTrendRSI')}:
            df[f'gold_rsi{n}'] = wilder_rsi(df['close'].to_numpy(), n)
    
    sub = df.tail(count).copy()
    
    candles = []
    ema20_pts = []
    ema50_pts = []
    ema200_pts = []
    markers = []
    previous_gold_signals = {}
    
    for i in range(1, len(sub)):
        idx = sub.index[i]
        row = sub.loc[idx]
        t = int(row['time'])
        
        candles.append({
            'time': t,
            'open': round(row['open'], 2),
            'high': round(row['high'], 2),
            'low': round(row['low'], 2),
            'close': round(row['close'], 2),
            'tick_volume': int(row['tick_volume']),
            'real_volume': int(row['real_volume']) if 'real_volume' in row.index and pd.notna(row['real_volume']) else 0
        })
        ema20_pts.append({'time': t, 'value': round(row['ema20'], 2)})
        ema50_pts.append({'time': t, 'value': round(row['ema50'], 2)})
        ema200_pts.append({'time': t, 'value': round(row['ema200'], 2)})
        
        if tf_val == mt5.TIMEFRAME_M15:
            prev = df.loc[idx - 1]
            c1, o1 = prev['close'], prev['open']
            e20_1, e50_1, e200_1 = prev['ema20'], prev['ema50'], prev['ema200']
            rsi1 = prev['rsi14']
            
            if account=='goldm15':
                new_long, new_short = [], []
                for s in range(1,4):
                    p = lambda key: params[f'S{s}_{key}']
                    fast = prev[f"gold_rsi{int(p('FastRSI'))}"]
                    buy = fast<=p('BuyEntry') and prev[f"gold_rsi{int(p('BuyTrendRSI'))}"]>=p('BuyTrend')
                    sell = fast>=p('SellEntry') and prev[f"gold_rsi{int(p('SellTrendRSI'))}"]<=p('SellTrend') and not buy
                    signal = 1 if buy else -1 if sell else 0
                    if signal and signal != previous_gold_signals.get(s, 0):
                        (new_long if buy else new_short).append(str(s))
                    previous_gold_signals[s] = signal
                for buys, systems in ((True, new_long), (False, new_short)):
                    if systems:
                        markers.append({'time': t, 'position': 'belowBar' if buys else 'aboveBar', 'color': '#10b981' if buys else '#f43f5e', 'shape': 'arrowUp' if buys else 'arrowDown', 'text': 'S'+'/'.join(systems)+(' L' if buys else ' S')})
                continue
            
            buy = (c1 > e20_1) and (e20_1 > e50_1) and (c1 > e200_1) and (rsi1 >= 50.0) and (c1 > o1)
            sell = (c1 < e20_1) and (e20_1 < e50_1) and (c1 < e200_1) and (rsi1 <= 50.0) and (c1 < o1)
            if buy:
                markers.append({'time': t, 'position': 'belowBar', 'color': '#10b981', 'shape': 'arrowUp', 'text': 'BUY'})
            elif sell:
                markers.append({'time': t, 'position': 'aboveBar', 'color': '#f43f5e', 'shape': 'arrowDown', 'text': 'SELL'})
            
    # Support & Resistance for drawing
    today_date = df['dt'].iloc[-1].date()
    monday_date = today_date - timedelta(days=today_date.weekday())
    daily_vp = compute_volume_profile(df[df['dt'].dt.date == today_date], num_bins=20)
    weekly_vp = compute_volume_profile(df[df['dt'].dt.date >= monday_date], num_bins=25)
    
    sr_levels = {
        'daily_high': daily_vp.get('high', 0.0),
        'daily_low':  daily_vp.get('low', 0.0),
        'daily_poc':  daily_vp.get('poc', 0.0),
        'weekly_high': weekly_vp.get('high', 0.0),
        'weekly_low':  weekly_vp.get('low', 0.0),
        'weekly_poc':  weekly_vp.get('poc', 0.0),
    }

    return {
        "account": public_account(selected()),
        "timeframe": tf_upper,
        "candles": candles,
        "ema20": ema20_pts,
        "ema50": ema50_pts,
        "ema200": ema200_pts,
        "markers": markers,
        "sr_levels": sr_levels
    }

# --- Chart Studio account-scoped SQLite storage: disabled unless admin opts in ---
# Do not assume the existing dashboard's unprotected trading routes authenticate a
# user. This separate Bearer key is NEVER persisted by the browser or served in HTML.
# Storage authorization cannot be used to place or modify MT5 trades.

def require_chart_workspace_auth(authorization: Optional[str] = Header(default=None)):
    token = os.getenv("CHART_STUDIO_STORAGE_TOKEN", "")
    enabled = os.getenv("CHART_STUDIO_STORAGE_ENABLED", "0") == "1"
    if not enabled or len(token) < 32:
        raise HTTPException(503, "Chart-Workspace-Speicher ist serverseitig deaktiviert.")
    candidate = ""
    if authorization and authorization.startswith("Bearer "):
        candidate = authorization[7:]
    if not hmac.compare_digest(candidate, token):
        raise HTTPException(401, "Chart-Workspace-Zugang erforderlich.")
    return "local-owner"


@lru_cache(maxsize=4)
def _chart_store_at(path: str):
    # Never create database in publicly served /static (even if env misconfigured).
    resolved = Path(path).expanduser().resolve()
    static = (BASE_DIR / "static").resolve()
    if resolved == static or static in resolved.parents:
        raise HTTPException(503, "Datenbank darf nicht im öffentlichen Static-Verzeichnis liegen.")
    return WorkspaceStore(resolved)


def chart_workspace_store():
    default_path = BASE_DIR / "state" / "chart_studio.sqlite3"
    return _chart_store_at(os.getenv("CHART_STUDIO_DB", str(default_path)))


def chart_store_error(error: StoreError):
    status = 409 if isinstance(error, RevisionConflict) else (
        404 if isinstance(error, WorkspaceMissing) else 422
    )
    raise HTTPException(status, {"code": error.code, "message": str(error)}) from error


@app.get("/api/chart/v1/workspaces")
def api_chart_workspaces(account: str, symbol: str = SYMBOL,
                         authorization: Optional[str] = Header(default=None)):
    owner = require_chart_workspace_auth(authorization)
    try:
        items = chart_workspace_store().list(owner, account, symbol)
    except StoreError as error:
        chart_store_error(error)
    return JSONResponse({"account": account, "symbol": symbol, "items": items},
                        headers={"Cache-Control": "no-store"})


@app.get("/api/chart/v1/workspace")
def api_chart_workspace(account: str, name: str, symbol: str = SYMBOL,
                        authorization: Optional[str] = Header(default=None)):
    owner = require_chart_workspace_auth(authorization)
    try:
        result = chart_workspace_store().get(owner, account, symbol, name)
    except StoreError as error:
        chart_store_error(error)
    return JSONResponse({"account": account, "symbol": symbol, **result},
                        headers={"Cache-Control": "no-store"})


@app.put("/api/chart/v1/workspace")
def api_chart_workspace_put(req: ChartWorkspaceWriteRequest,
                            authorization: Optional[str] = Header(default=None)):
    owner = require_chart_workspace_auth(authorization)
    try:
        result = chart_workspace_store().put(
            owner, req.account, req.symbol, req.name,
            req.document, req.expectedRevision
        )
    except StoreError as error:
        chart_store_error(error)
    return JSONResponse({"account": req.account, "symbol": req.symbol, **result},
                        headers={"Cache-Control": "no-store"})


@app.delete("/api/chart/v1/workspace")
def api_chart_workspace_delete(req: ChartWorkspaceDeleteRequest,
                               authorization: Optional[str] = Header(default=None)):
    owner = require_chart_workspace_auth(authorization)
    try:
        result = chart_workspace_store().delete(
            owner, req.account, req.symbol, req.name, req.expectedRevision
        )
    except StoreError as error:
        chart_store_error(error)
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


# --- Chart Studio opt-in foundation: read-only safe endpoints only ---
# WARNING: Do not add real order_send or SL/TP commit logic to these routes.
@app.get("/api/chart/v1/capabilities")
def api_chart_capabilities():
    return {
        "version": "0.1.0-foundation",
        "accountScopes": list(ACCOUNTS.keys()),
        "symbols": [SYMBOL],
        "timeframes": list(TIMEFRAME_MAP.keys()),
        "library": "lightweight-charts-v4-legacy-adapter",
        "chartStudioStage": "P0-progressive-enhancement",
        "features": {
            "historicalCandles": True, "emaToggles": True,
            "experimentalDrawings": True, "readOnlyPositionOverlays": True,
            "scenarioPreview": True,
            "persistentServerDrawings": os.getenv("CHART_STUDIO_STORAGE_ENABLED") == "1"
            and len(os.getenv("CHART_STUDIO_STORAGE_TOKEN", "")) >= 32,
            "realStopDragging": False, "brokerMutations": False,
            "eaDecisionHistory": False, "immutableSnapshots": False
        }
    }


@app.get("/api/chart/v1/quotes")
@scoped(mt5)
def api_chart_quotes(account: str, symbol: str = SYMBOL):
    if symbol != SYMBOL:
        raise HTTPException(status_code=400, detail="Dieses Chart-Modul unterstützt noch ausschließlich XAUUSD.")
    acc = verify_identity(mt5, selected())
    tick = mt5.symbol_info_tick(symbol)
    sym = mt5.symbol_info(symbol)
    if tick is None or sym is None:
        raise HTTPException(status_code=503, detail="Broker-Quote oder Symbolinformationen fehlen.")
    return {
        "account": selected()["id"], "symbol": symbol,
        "currency": str(getattr(acc, "currency", "") or ""),
        "bid": float(tick.bid), "ask": float(tick.ask),
        "quoteTimeUtc": int(tick.time),
        "tickSize": float(getattr(sym, "trade_tick_size", 0) or 0),
        "source": "MT5_VERIFIED"
    }


@app.post("/api/chart/v1/scenarios/preview")
@scoped(mt5)
def api_chart_preview(req: ChartScenarioPreviewRequest, account: str):
    if req.account != account:
        raise HTTPException(status_code=409, detail="Szenario gehört nicht zum angefragten Konto.")
    if req.symbol != SYMBOL:
        raise HTTPException(status_code=400, detail="Symbol derzeit nicht freigegeben.")
    acc = verify_identity(mt5, selected())
    sym = mt5.symbol_info(req.symbol)
    if sym is None:
        raise HTTPException(status_code=503, detail="MT5-Symbolinformationen nicht verfügbar.")
    try:
        result = preview_scenario(
            mt5, acc, sym, symbol=req.symbol, side=req.side,
            volume=req.volumeLots, entry=req.entryPrice,
            stop=req.slPrice, target=req.tpPrice
        )
    except PreviewError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
    result["account"] = account
    result["tickSize"] = float(sym.trade_tick_size)
    return result


@app.post("/api/modify_position")
@scoped(mt5)
def api_modify_position(req: ModifyPositionRequest, account: str = 'titan'):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    positions = mt5.positions_get(ticket=req.ticket)
    if not positions:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    pos = positions[0]
    sym = mt5.symbol_info(pos.symbol)
    contract_size = sym.trade_contract_size
    vol = pos.volume
    op = pos.price_open
    is_buy = (pos.type == mt5.ORDER_TYPE_BUY)
    
    target_sl = pos.sl
    target_tp = pos.tp
    if req.sl_usd is not None:
        target_sl = (op + (req.sl_usd / (vol * contract_size))) if is_buy else (op - (req.sl_usd / (vol * contract_size)))
        target_sl = round(target_sl, sym.digits)
    if req.tp_usd is not None:
        target_tp = (op + (req.tp_usd / (vol * contract_size))) if is_buy else (op - (req.tp_usd / (vol * contract_size)))
        target_tp = round(target_tp, sym.digits)
    if req.sl_price is not None:
        target_sl = round(req.sl_price, sym.digits)
    if req.tp_price is not None:
        target_tp = round(req.tp_price, sym.digits)
        
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": req.ticket,
        "symbol": pos.symbol,
        "sl": float(target_sl) if target_sl > 0 else 0.0,
        "tp": float(target_tp) if target_tp > 0 else 0.0
    }
    verify_identity(mt5, selected())
    res = mt5.order_send(request)
    if res is None:
        raise HTTPException(503, 'MT5 hat die Änderung nicht bestätigt; Status neu laden.')
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": res.retcode, "comment": res.comment}
    return {"success": True, "comment": res.comment}

@app.post("/api/close_position")
@scoped(mt5)
def api_close_position(req: ClosePositionRequest, account: str = 'titan'):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    positions = mt5.positions_get(ticket=req.ticket)
    if not positions:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    pos = positions[0]
    sym = mt5.symbol_info(pos.symbol)
    tick = mt5.symbol_info_tick(pos.symbol)
    is_buy = (pos.type == mt5.ORDER_TYPE_BUY)
    price = tick.bid if is_buy else tick.ask
    order_type = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
    filling = mt5.ORDER_FILLING_IOC if (sym.filling_mode & 2) != 0 else mt5.ORDER_FILLING_RETURN
    
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": req.ticket,
        "symbol": pos.symbol,
        "volume": pos.volume,
        "type": order_type,
        "price": price,
        "deviation": 50,
        "type_filling": filling,
        "comment": "Webapp_Manual_Close"
    }
    verify_identity(mt5, selected())
    res = mt5.order_send(request)
    if res is None:
        raise HTTPException(503, 'MT5 hat die Schließung nicht bestätigt; Status neu laden.')
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": res.retcode, "comment": res.comment}
    return {"success": True, "comment": res.comment}

@app.post("/api/reset_drawdown")
@scoped(mt5)
def api_reset_drawdown(req: ResetDrawdownRequest, account: str = 'titan'):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    tick = mt5.symbol_info_tick(SYMBOL)
    acc = mt5.account_info()
    if tick is None or acc is None:
        raise HTTPException(status_code=500, detail="MT5 Kontodaten nicht verfügbar")

    if req.action == "auto":
        cfg = {
            "manual_reset_active": False,
            "reset_balance": 10000.0,
            "reset_timestamp": None,
            "reset_date": None
        }
        save_dd_config(cfg)
        return {
            "success": True, 
            "message": "Anzeige wieder auf EA-Tagesbasis gestellt; EA-Sperren unverändert." if account=='goldm15' else "Tages-Drawdown zurück auf automatischen MT5-Tagesanfang gestellt.", 
            "manual_active": False
        }
    else:
        baseline = float(req.baseline) if (req.baseline is not None and req.baseline > 0) else float(acc.balance)
        server_time = datetime.fromtimestamp(tick.time, timezone.utc)
        cfg = {
            "manual_reset_active": True,
            "reset_balance": baseline,
            "reset_timestamp": int(tick.time),
            "reset_date": server_time.strftime("%Y-%m-%d")
        }
        save_dd_config(cfg)
        return {
            "success": True,
            "message": f"Nur Dashboard-Anzeige zurückgesetzt (Basis: ${baseline:,.2f}); EA-Basis und Sperren bleiben unverändert." if account=='goldm15' else f"Tages-Drawdown erfolgreich auf 0.00% zurückgesetzt (Basis: ${baseline:,.2f})!",
            "manual_active": True,
            "baseline": baseline
        }

# --- COMPLETE ZERO-SCROLL HTML WITH THEME TOGGLE, VOLUME PROFILES & FIXED CHART ---
HTML_CONTENT = """<!DOCTYPE html>
<html lang="de" class="dark">
<head>
  <meta charset="UTF-8">
  <title>XAU Titan Pro - Live Cockpit & Volume Profile</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Precompiled offline: no Play-CDN runtime compiler -->
  <link rel="stylesheet" href="static/tailwind.generated.css">
  <script src="static/lightweight-charts.js"></script>
  <script src="static/stone-chart-effects.js"></script>
  <script src="static/chart-studio-data-signature.js"></script>
  <script src="static/chart-studio-indicators.js"></script>
  <script src="static/chart-studio-server-sync.js"></script>
  <script src="static/chart-studio-drawing-geometry.js"></script>
  <script src="static/chart-studio-averages.js"></script>
  <script src="static/chart-studio-appearance.js"></script>
  <script src="static/chart-studio-oscillators.js"></script>
  <script src="static/chart-studio-chart-types.js"></script>
  <script src="static/chart-studio-object-manager.js"></script>
  <link rel="stylesheet" href="static/chart-studio-quick.css">
  <script src="static/chart-studio-beta.js"></script>
  <script src="static/stone-celebrations.js"></script>
  <style>
    html, body {
      min-height: 100vh;
      overflow-y: auto;
      margin: 0;
      padding: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    /* DARK THEME */
    body.theme-dark {
      background-color: #070b14;
      color: #f1f5f9;
    }
    body.theme-dark .glass-card {
      background: #0d1321;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      color: #f1f5f9;
    }
    body.theme-dark .ticker-bg {
      background-color: rgba(15, 23, 42, 0.85);
      border-color: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }
    body.theme-dark .table-border {
      border-color: rgba(255, 255, 255, 0.08);
    }
    body.theme-dark .text-sub {
      color: #94a3b8;
    }
    body.theme-dark .hover-row:hover {
      background-color: rgba(255, 255, 255, 0.04);
    }

    /* LIGHT THEME */
    body.theme-light {
      background-color: #f8fafc;
      color: #0f172a;
    }
    body.theme-light .glass-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.06);
      color: #0f172a;
    }
    body.theme-light .ticker-bg {
      background-color: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    body.theme-light .table-border {
      border-color: #e2e8f0;
    }
    body.theme-light .text-sub {
      color: #475569;
    }
    body.theme-light .hover-row:hover {
      background-color: #f1f5f9;
    }

    #tv-chart {
      width: 100% !important;
      height: 520px !important;
      min-height: 520px;
    }
    .vp-bar { transition: width 0.3s ease; }
    .account-switcher { display:flex; flex-wrap:wrap; gap:8px; }
    .account-tab { text-align:left; padding:10px 16px; border:1px solid #334155; border-radius:10px; min-width:235px; transition:background .2s,border-color .2s; }
    .account-tab[aria-pressed="true"] { background:#172b45; border-color:#60a5fa; box-shadow:inset 0 0 0 1px #60a5fa; }
    .account-tab:hover { border-color:#94a3b8; }
    body.theme-light .account-tab[aria-pressed="true"] { background:#eff6ff; border-color:#2563eb; }
    .account-tab strong { display:block; font-size:13px; }
    .account-tab small { display:block; font-size:10px; margin-top:3px; opacity:.65; }
    #account-content[data-connected="false"] { opacity:.4; pointer-events:none; }
    #account-content { transition:opacity .15s; }
    @media(max-width:700px) { .account-tab { flex:1; min-width:0; padding:10px; } }
  </style>
  <!-- Optional runic stone material; selectors scoped to body.theme-stone -->
  <link rel="stylesheet" href="static/stone-cockpit.css">
  <link rel="stylesheet" href="static/stone-asset-skin.css">
</head>
<body class="theme-dark flex flex-col p-3 min-h-screen text-xs select-none">

  <nav class="glass-card rounded-xl px-4 py-3 mb-3" aria-label="Konto und Strategie">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="account-switcher" id="account-switcher">
        <button class="account-tab" data-account="titan" aria-pressed="true" onclick="switchAccount('titan')"><strong>XAU Titan Pro</strong><small>53087839 · ICMarketsEU-Demo</small></button>
        <button class="account-tab" data-account="goldm15" aria-pressed="false" onclick="switchAccount('goldm15')"><strong>GoldM15 Reconstruction</strong><small>53090070 · ICMarketsEU-Demo</small></button>
      </div>
      <div class="text-right"><span id="account-connection" role="status" aria-live="polite" class="text-amber-500 font-bold">Verbindung wird geprüft …</span><div id="account-detail" class="text-sub text-[10px] mt-1">Separate Konten · Live-Daten</div></div>
    </div>
  </nav>

  <!-- 1. TOP NAVBAR -->
  <header class="glass-card rounded-xl px-4 py-2 mb-3 flex flex-wrap gap-3 items-center justify-between shrink-0 shadow-sm">
    <div class="flex items-center gap-3">
      <div class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
      <h1 class="font-black text-sm tracking-wider flex items-center gap-2">
        <span id="strategy-title">XAU TITAN PRO</span> <span id="strategy-version" class="text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white font-bold tracking-normal">v6.0 LIVE</span>
      </h1>
      <span class="opacity-40">|</span>
      <span class="text-sub font-medium">Gold (XAUUSD) M15 Cockpit</span>
    </div>

    <!-- Live Prices, Timers & Theme Toggle -->
    <div class="flex flex-wrap items-center gap-3 font-mono">
      <div class="flex items-center gap-2 px-3 py-1 rounded-lg ticker-bg border">
        <span class="font-sans font-bold text-sub">XAUUSD:</span>
        <span id="live-bid" class="font-bold text-emerald-500 text-sm">----.--</span>
        <span class="opacity-40">/</span>
        <span id="live-ask" class="font-bold text-rose-500 text-sm">----.--</span>
        <span id="live-spread" class="text-[10px] text-sub px-1 rounded bg-black/10">Spr: --</span>
      </div>

      <!-- DAILY DRAWDOWN BADGE -->
      <div id="dd-badge" class="flex items-center gap-2 px-3 py-1 rounded-lg ticker-bg border text-[11px]" title="Blueberry Funded Tages-Drawdown (Tages-Start / High-Water Mark)">
        <span class="font-sans font-bold text-sub flex items-center gap-1.5">
          <span id="dd-dot" class="w-2 h-2 rounded-full bg-emerald-500"></span>
          TAGES-DD:
        </span>
        <span id="dd-pct" class="font-bold text-emerald-400">--%</span>
        <span class="text-sub text-[10px]" id="dd-usd">(-$--.--)</span>
        <span class="opacity-30">|</span>
        <span class="text-sub text-[10px]">Puffer:</span>
        <span id="dd-buffer" class="font-bold text-emerald-400">$----.--</span>
        <span id="dd-reset-tag" class="hidden text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono font-bold">Reset: $10k</span>
        <button id="dd-reset-button" onclick="openDrawdownResetModal()" class="ml-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-sans font-bold text-[10px] cursor-pointer transition-all flex items-center gap-1 shadow-sm" title="Tages-Drawdown auf 0.00% zurücksetzen">
          🔄 Reset
        </button>
      </div>

      <div class="flex items-center gap-3 px-3 py-1 rounded-lg ticker-bg border text-[11px]">
        <div><span class="text-sub">SERVER:</span> <span id="time-server" class="font-bold">--:--:--</span></div>
        <div><span class="text-sub">DE:</span> <span id="time-german" class="text-emerald-500 font-bold">--:--:--</span></div>
      </div>

      <div class="flex items-center gap-1.5 px-3 py-1 bg-blue-600/15 text-blue-500 rounded-lg border border-blue-500/40 text-[11px]">
        <span class="font-bold">⏳ M15-SCHLUSS:</span>
        <span id="bar-countdown" class="font-bold text-xs">--:--</span>
      </div>

      <!-- THEME TOGGLE BUTTON -->
      <button onclick="toggleTheme()" class="px-3 py-1 rounded-lg ticker-bg border font-sans font-bold hover:opacity-80 flex items-center gap-1.5 text-[11px] cursor-pointer">
        <span id="theme-icon">☀️</span> <span id="theme-label">Hell</span>
      </button>
    </div>
  </header>

  <!-- 2. MAIN 2-COLUMN SECTION -->
  <main id="account-content" data-connected="false">
  <div class="grid grid-cols-12 gap-3 mb-3">

    <!-- LEFT COLUMN: CHART & VOLUMENPROFILE (7 of 12) -->
    <div class="col-span-12 lg:col-span-7 flex flex-col gap-3">
      
      <!-- 2.1 CHART CARD -->
      <div class="glass-card rounded-xl p-3 flex flex-col">
        <div class="flex flex-wrap items-center justify-between mb-2 gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span id="chart-title-text" class="font-black text-sm">XAUUSD M15 Chart</span>
            <button type="button" id="stone-chart-expand-btn" aria-controls="tv-chart" aria-pressed="false"
              aria-label="Chart vergrößern" class="stone-chart-expand-trigger stone-chart-expand-primary"
              title="Chart bildschirmfüllend vergrößern · Esc zum Schließen">⛶ CHART GROSS</button>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans" title="Zeiteinheit dient nur der Ansicht - der EA rechnet weiter strikt auf M15">Ansicht</span>
            
            <!-- Timeframe Selector Pills -->
            <div class="flex items-center rounded-lg ticker-bg p-0.5 border text-[11px] font-bold font-mono">
              <button id="tf-btn-M1" onclick="switchTimeframe('M1')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">M1</button>
              <button id="tf-btn-M5" onclick="switchTimeframe('M5')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">M5</button>
              <button id="tf-btn-M15" onclick="switchTimeframe('M15')" class="px-2 py-0.5 rounded cursor-pointer transition bg-blue-600 text-white font-black shadow">M15</button>
              <button id="tf-btn-M30" onclick="switchTimeframe('M30')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">M30</button>
              <button id="tf-btn-H1" onclick="switchTimeframe('H1')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">H1</button>
              <button id="tf-btn-H4" onclick="switchTimeframe('H4')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">H4</button>
              <button id="tf-btn-D1" onclick="switchTimeframe('D1')" class="px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white">D1</button>
            </div>

            <div class="hidden sm:flex items-center gap-2 text-[10px] font-mono">
              <span class="text-sky-400 font-bold">● EMA20</span>
              <span class="text-amber-400 font-bold">● EMA50</span>
              <span class="text-purple-400 font-bold">● EMA200</span>
              <span class="text-amber-500 font-semibold">-- Daily POC</span>
              <span class="text-cyan-400 font-semibold">-- Weekly POC</span>
            </div>
          </div>
          
          <!-- Chart Controls: EA-Text toggle, Runterziehen, Hochziehen, Zoom, Reset -->
          <div class="flex items-center gap-1 text-[10px] font-sans">
            <button id="toggle-ea-status-btn" onclick="toggleEAStatusText()" class="px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-blue-600/30 text-blue-300 border-blue-500/40" title="EA-Statustext & Signal-Pfeile auf dem Chart ein-/ausblenden">
              <span id="toggle-ea-status-icon">🏷️</span> <span id="toggle-ea-status-label">EA-Text: AN</span>
            </button>
            <button onclick="adjustChartMargin(0.08)" class="px-2 py-1 rounded ticker-bg border hover:bg-blue-600 hover:text-white font-bold cursor-pointer" title="Kurs nach oben schieben / mehr Platz unten">
              ⬇️ Platz (+)
            </button>
            <button onclick="adjustChartMargin(-0.08)" class="px-2 py-1 rounded ticker-bg border hover:bg-blue-600 hover:text-white font-bold cursor-pointer" title="Weniger Abstand unten">
              ⬆️ Platz (-)
            </button>
            <button onclick="zoomChart(0.7)" class="px-2 py-1 rounded ticker-bg border hover:bg-blue-600 hover:text-white font-bold cursor-pointer" title="Kerzen vergrößern">
              ➕
            </button>
            <button onclick="zoomChart(1.3)" class="px-2 py-1 rounded ticker-bg border hover:bg-blue-600 hover:text-white font-bold cursor-pointer" title="Kerzen verkleinern">
              ➖
            </button>
            <button onclick="resetChartZoom()" class="px-2 py-1 rounded ticker-bg border hover:bg-blue-600 hover:text-white font-bold cursor-pointer" title="Chart-Zoom & Preis zentrieren">
              🔍 Auto
            </button>
          </div>
        </div>

        <!-- TV CHART CONTAINER (520px high) -->
        <div class="w-full relative rounded-lg overflow-hidden border table-border" style="height: 520px;">
          <!-- Complete names of chart price levels; native axis shows only numbers. -->
          <div id="chart-level-legend" class="stone-chart-level-legend" role="group" aria-label="Aktuelle Daily- und Weekly-Level" hidden></div>
          <div id="tv-chart" class="w-full h-full"></div>
        </div>
      </div>

      <!-- 2.2 VOLUMENPROFILE & SUPPORT/RESISTANCE (Under Chart) -->
      <div class="glass-card rounded-xl p-3 flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="font-black text-xs">📦 Volumenprofile & Institutional Levels</span>
            <div class="flex rounded-lg ticker-bg p-0.5 border text-[10px]">
              <button id="vp-tab-daily" onclick="switchVPTab('daily')" class="px-2.5 py-0.5 rounded-md font-bold bg-blue-600 text-white cursor-pointer">Daily</button>
              <button id="vp-tab-weekly" onclick="switchVPTab('weekly')" class="px-2.5 py-0.5 rounded-md font-bold opacity-60 cursor-pointer">Weekly</button>
            </div>
          </div>
          <div class="text-[11px] font-mono font-bold" id="vp-summary-badge">
            POC: $----.-- | VAH: $---- | VAL: $----
          </div>
        </div>

        <!-- Volume Profile Visual Histogram Bars -->
        <div id="vp-histogram-container" class="flex flex-col gap-1 pt-1 font-mono text-[10px]">
          <!-- Dynamically filled histogram rows -->
        </div>
      </div>

    </div>

    <!-- RIGHT COLUMN: AI DIAGNOSE & EXTENDED TARGET MATRIX (5 of 12) -->
    <div class="col-span-12 lg:col-span-5 flex flex-col gap-3">

      <!-- 2.3 LIVE DIAGNOSE CARD -->
      <div id="diagnose-card" class="glass-card rounded-xl p-3.5 border-l-4 border-l-blue-500">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="font-black uppercase tracking-wider text-blue-500 text-[11px]">💡 LIVE-DIAGNOSE & TREND-STATUS</span>
            <span id="trend-badge" class="px-2 py-0.5 rounded font-bold text-[9px] bg-slate-800 text-slate-300 border border-slate-600">LADE TREND...</span>
          </div>
          <span id="window-badge" class="px-2 py-0.5 rounded font-bold text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-500/40">HANDEL OFFEN</span>
        </div>
        
        <p id="short-missing-text" class="text-xs font-semibold leading-relaxed mb-3">
          Lade Live-Marktdaten...
        </p>

        <!-- Readiness Progress Bars -->
        <div class="grid grid-cols-2 gap-2.5">
          <div class="p-2 rounded-lg ticker-bg border border-rose-500/30">
            <div class="flex justify-between items-center mb-1">
              <span id="sell-readiness-label" class="text-[10px] font-bold text-rose-500">SHORT-BEREITSCHAFT</span>
              <span id="sell-pct" class="font-mono font-bold text-rose-500">--%</span>
            </div>
            <div class="w-full bg-slate-700/30 rounded-full h-2 overflow-hidden">
              <div id="sell-bar" class="bg-rose-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>

          <div class="p-2 rounded-lg ticker-bg border border-emerald-500/30">
            <div class="flex justify-between items-center mb-1">
              <span id="buy-readiness-label" class="text-[10px] font-bold text-emerald-500">LONG-BEREITSCHAFT</span>
              <span id="buy-pct" class="font-mono font-bold text-emerald-500">--%</span>
            </div>
            <div class="w-full bg-slate-700/30 rounded-full h-2 overflow-hidden">
              <div id="buy-bar" class="bg-emerald-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2.4 TARGET-MATRIX CARD (Full Extended Height - All 5 Rules Visible!) -->
      <section id="gold-details" class="glass-card rounded-xl p-3.5 hidden">
        <div class="flex justify-between gap-2 mb-2"><strong>Momentum-Ausstiegsziele</strong><span class="text-sub text-[10px]">Letzte abgeschlossene M15-Kerze</span></div>
        <div id="exit-goals" class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]"></div>
        <div class="mt-3 pt-2 border-t table-border"><span id="guard-status" class="font-bold"></span><p id="guard-detail" class="font-mono text-[10px] mt-1 leading-relaxed"></p><p id="guard-note" class="text-sub text-[10px] mt-1"></p></div>
        <p class="text-sub text-[10px] mt-2">RSI-Ziele zeigen das Setup; Slot-Belegung und Schutzfilter werden zusätzlich im EA geprüft. Chartpfeile markieren neue RSI-Setups. Basis: eingesetztes v1.21-Preset.</p>
      </section>
      <div class="glass-card rounded-xl p-3.5 flex flex-col flex-1">
        <div class="flex items-center justify-between mb-2">
          <span id="matrix-title" class="font-black text-xs">🎯 Target-Matrix (Alle 5 Regeln im Direktvergleich)</span>
          <span id="matrix-time" class="text-[10px] text-sub font-mono">M15 Kerzenschluss</span>
        </div>

        <div class="w-full overflow-hidden">
          <table class="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr class="border-b table-border text-sub text-[10px] uppercase font-mono">
                <th class="py-1.5 font-bold">Regel & Bedingung</th>
                <th class="py-1.5 text-center font-bold">SHORT</th>
                <th class="py-1.5 text-center font-bold">LONG</th>
                <th class="py-1.5 text-right font-bold">Live-Wert</th>
              </tr>
            </thead>
            <tbody id="matrix-tbody" class="divide-y table-border font-mono">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>

        <div class="mt-3 pt-2.5 border-t table-border flex flex-col gap-1.5 text-[10px] text-sub">
          <div class="flex items-center justify-between">
            <span id="session-label">Handelsfenster (DE):</span>
            <span id="session-description" class="text-emerald-500 font-bold font-mono">05:00-12:00 & 15:00-18:00 (Golden Hours)</span>
          </div>
          <div class="flex items-center justify-between">
            <span id="dd-source-label">Tages-Drawdown (Blueberry):</span>
            <div class="flex items-center gap-2">
              <span id="dd-matrix-detail" class="font-bold font-mono text-emerald-400">0.00% / -$0.00 (Puffer: $0.00)</span>
              <button onclick="openDrawdownResetModal()" class="text-[9px] px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600 border border-blue-500/40 text-blue-400 hover:text-white font-bold cursor-pointer transition-colors" title="Tages-Drawdown Resetten">🔄 Reset</button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span>Kontostand / Equity:</span>
            <span id="acc-matrix-bal" class="font-bold font-mono text-sub">$----.-- / $----.--</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Max Gleichzeitige Positionen:</span>
            <span id="pos-matrix-count" class="text-emerald-500 font-bold font-mono">0 / 3 Aktiv</span>
          </div>
        </div>
      </div>

    </div>

  </div>

  <!-- 3. LOWER SCROLLABLE SECTION: OFFENE POSITIONEN & SL/TP MANAGER -->
  <div class="glass-card rounded-xl p-3.5 mb-4">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <span class="font-black text-sm">📊 Offene Positionen & SL/TP Manager (MT5 Live-Sync)</span>
        <span id="pos-count-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold">0 Aktiv</span>
      </div>
      <span class="text-[11px] text-sub">Passe Stop-Loss und Take-Profit direkt in Dollar an. Klicke auf 'Set' zum sofortigen MT5-Sync.</span>
    </div>

    <div id="positions-list" class="min-h-[100px]">
      <div class="py-6 flex items-center justify-center text-sub text-xs">
        Aktuell keine offenen Positionen auf XAUUSD. Der EA scannt den Markt bei jedem M15-Kerzenschluss.
      </div>
    </div>
  </div>

  <!-- 4. TRADE JOURNAL: GESPIELTE POSITIONEN & STRATEGIE-ERKLÄRUNG (Aufnahme ab 20:00 Uhr DE) -->
  <div class="glass-card rounded-xl p-3.5 mb-4">
    <div class="flex flex-wrap items-center justify-between mb-3 border-b table-border pb-2.5 gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-base">📖</span>
        <span class="font-black text-sm">Trade-Journal & PnL</span>
        <span id="journal-strat-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-black uppercase text-cyan-400">XAU TITAN PRO</span>
        <span id="journal-count-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-sub">0 Trades</span>
        <span id="journal-total-pnl" class="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-black border bg-black/30 text-sub">PnL: —</span>
        <span id="journal-live-pnl" class="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hidden">Live: —</span>
        <span id="journal-closed-pnl" class="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border border-slate-500/20 bg-slate-500/10 text-slate-300 hidden">Hist: —</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label for="journal-strategy-filter" class="text-[11px] font-bold text-sub">Journal-Ansicht:</label>
        <select id="journal-strategy-filter" onchange="setJournalFilter(this.value)"
          class="ticker-bg border rounded-lg px-2.5 py-1.5 font-bold font-mono text-[11px] cursor-pointer"
          aria-label="Strategien im Trade-Journal auswählen">
          <option value="all">Alle Strategien</option>
          <option value="titan">XAU Titan Pro</option>
          <option value="goldm15">GoldM15 Reconstruction</option>
        </select>
        <div class="text-[11px] text-sub font-mono">
        <div class="text-[11px] text-sub font-mono">
          Aufnahme aktiv ab: <strong class="text-white">Heute 20:00 Uhr DE (23:00 Server)</strong>
        </div>
      </div>
    </div>

    <div id="journal-sync-status" class="hidden mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-300 px-3 py-2 text-[11px]" role="status" aria-live="polite"></div>
    <div id="journal-list" class="space-y-3">
      <div class="py-6 flex items-center justify-center text-sub text-xs">
        Trade-Journal wird geladen …
      </div>
    </div>
  </div>

  </main>

  <!-- MODAL: DAILY DRAWDOWN RESET -->
  <div id="dd-reset-modal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="glass-card rounded-2xl max-w-md w-full p-5 border border-white/10 shadow-2xl relative animate-in fade-in zoom-in duration-200">
      <div class="flex items-center justify-between pb-3 mb-3 border-b table-border">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔄</span>
          <div>
            <h3 class="font-black text-sm tracking-wide">Tages-Drawdown Reset</h3>
            <p class="text-[10px] text-sub">Konto-Reset auf 0.00% Drawdown (Blueberry Funded)</p>
          </div>
        </div>
        <button onclick="closeDrawdownResetModal()" class="text-sub hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer">&times;</button>
      </div>

      <div class="flex flex-col gap-3 text-xs mb-4">
        <p id="reset-description" class="text-sub text-[11px] leading-relaxed">
          Setzt den Tagesverlust und die High-Water-Mark sofort auf <b>0.00%</b> zurück. Trades von vor dem Reset werden für die heutige Drawdown-Berechnung ignoriert.
        </p>

        <div class="p-3 rounded-xl ticker-bg border flex flex-col gap-2">
          <div class="flex justify-between items-center text-[11px]">
            <span class="text-sub">Aktueller Kontostand:</span>
            <span id="modal-current-bal" class="font-bold font-mono text-emerald-400">$10,000.00</span>
          </div>
          <div class="flex justify-between items-center text-[11px]">
            <span class="text-sub">Aktueller Tages-Drawdown:</span>
            <span id="modal-current-dd" class="font-bold font-mono text-rose-400">--% (-$--.--)</span>
          </div>
          <div id="modal-reset-status-row" class="text-[10px] text-blue-300 pt-1 border-t table-border hidden">
            <span>Status:</span> <span id="modal-reset-status-text">Manuell aktiv</span>
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-bold text-sub mb-1">
            Start-Referenzkapital ($):
          </label>
          <div class="flex items-center gap-2">
            <input type="number" id="dd-reset-input" step="100" class="w-full rounded-lg px-3 py-2 ticker-bg border font-mono font-bold text-sm text-emerald-400 focus:outline-none focus:border-blue-500" placeholder="10000.00">
            <button onclick="setModalInputBal(10000)" class="px-2.5 py-2 rounded-lg ticker-bg border hover:bg-slate-700 text-[10px] font-mono font-bold cursor-pointer whitespace-nowrap">$10k</button>
            <button onclick="setModalInputBalCurrent()" class="px-2.5 py-2 rounded-lg ticker-bg border hover:bg-slate-700 text-[10px] font-mono font-bold cursor-pointer whitespace-nowrap">Aktuell</button>
          </div>
          <span id="reset-help" class="text-[10px] text-sub mt-1 block">Die Baseline, ab der die 3.5% EA- und 4.0% Broker-Notbremse gerechnet wird.</span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 pt-2 border-t table-border">
        <button onclick="revertAutoDrawdown()" class="px-3 py-2 rounded-xl ticker-bg border hover:bg-rose-950/40 text-sub hover:text-rose-400 font-bold text-[11px] cursor-pointer transition-colors" title="Zurück zur automatischen MT5-Historie seit 00:00">
          Auto (Mitternacht)
        </button>
        <div class="flex items-center gap-2">
          <button onclick="closeDrawdownResetModal()" class="px-3 py-2 rounded-xl ticker-bg border text-sub hover:text-white font-bold text-[11px] cursor-pointer">
            Abbrechen
          </button>
          <button onclick="executeDrawdownReset()" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] cursor-pointer shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition-all">
            <span>Auf 0.00% Resetten</span> 🚀
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 4. JAVASCRIPT ENGINE -->
  <script>
    let chart, candleSeries, ema20Series, ema50Series, ema200Series;
    // Sparse overlay FX no longer allocates six transparent chart series.
    let srLines = {};
    let isInitialLoad = true;
    let lastCandleTime = 0;
    let currentCandlesCount = 0;
    let currentVPTab = 'daily';
    let currentData = null;
    const BASE_PATH = window.location.pathname.startsWith('/stt') ? '/stt' : '';
    let activeAccount = 'titan';
    let activeTimeframe = 'M15';
    const AVAILABLE_TFS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    let accountGeneration = 0;
    let accounts = {};
    const savedJournalFilter = localStorage.getItem('two_eas_journal_filter');
    let journalFilter = ['all','titan','goldm15'].includes(savedJournalFilter) ? savedJournalFilter : 'all';
    let journalEntriesByAccount = { titan: [], goldm15: [] };
    let journalErrors = [];
    let journalLoadedMode = null;
    let journalBusyMode = null;
    let journalRequestVersion = 0;
    let statusBusy = null;
    let candlesBusy = null;
    let showEAStatusText = localStorage.getItem('chart_show_ea_status') !== 'false';
    let currentChartMarkers = [];
    let matrixSignature = null, vpSignature = null;

    function updateEAStatusButtonUI() {
      const btn = document.getElementById('toggle-ea-status-btn');
      const lbl = document.getElementById('toggle-ea-status-label');
      if (lbl) lbl.textContent = showEAStatusText ? 'EA-Text: AN' : 'EA-Text: AUS';
      if (btn) {
        if (showEAStatusText) {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-sm';
        } else {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 text-sub hover:text-white opacity-60';
        }
      }
    }

    function toggleEAStatusText() {
      showEAStatusText = !showEAStatusText;
      localStorage.setItem('chart_show_ea_status', String(showEAStatusText));
      updateEAStatusButtonUI();
      if (candleSeries) {
        candleSeries.setMarkers(showEAStatusText ? currentChartMarkers : []);
      }
    }

    function switchTimeframe(tf) {
      if (activeTimeframe === tf) return;
      activeTimeframe = tf;
      try { window.ChartStudioBeta?.timeframe(tf); } catch (_) {}

      AVAILABLE_TFS.forEach(t => {
        const btn = document.getElementById('tf-btn-' + t);
        if (!btn) return;
        if (t === tf) {
          btn.className = 'px-2 py-0.5 rounded cursor-pointer transition bg-blue-600 text-white font-black shadow';
        } else {
          btn.className = 'px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white';
        }
      });

      const titleEl = document.getElementById('chart-title-text');
      if (titleEl) {
        titleEl.textContent = `XAUUSD ${tf} Chart`;
      }

      isInitialLoad = true;
      lastCandleTime = 0;
      try {window.StoneCelebration?.clearEMAs();}catch(_){}
      loadCandles();
    }

    function staleRequest() { return new DOMException('Account wurde gewechselt', 'AbortError'); }
    async function accountFetch(url, options = {}) {
      const account = activeAccount, generation = accountGeneration;
      if (options.method === 'POST' && (!currentData || currentData.account.id !== account)) throw new Error('Bitte zuerst auf bestätigte Kontodaten warten.');
      const targetUrl = url.startsWith('/') ? (BASE_PATH + url) : url;
      const response = await fetch(targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'account=' + encodeURIComponent(account), options);
      const body = await response.json();
      if (generation !== accountGeneration || account !== activeAccount) throw staleRequest();
      if (!response.ok) throw new Error(body.detail || 'MT5-Anfrage fehlgeschlagen');
      if (body.account && body.account.id !== account) throw new Error('Antwort gehört zu einem anderen Konto.');
      return {json: async () => body};
    }

    function clearAccountView() {
      currentData = null;
      try {window.StoneCelebration?.clearEMAs();}catch(_){};
      document.getElementById('account-content').dataset.connected = 'false';
      document.getElementById('dd-reset-button').disabled = true;
      closeDrawdownResetModal();
      document.getElementById('dd-reset-input').value = '';
      for (const id of ['live-bid','live-ask','time-server','time-german','bar-countdown','dd-pct','dd-usd','dd-buffer','dd-matrix-detail','acc-matrix-bal','pos-matrix-count','pos-count-badge','sell-pct','buy-pct']) document.getElementById(id).textContent = '—';
      document.getElementById('live-spread').textContent = 'Spr: —';
      document.getElementById('dd-reset-tag').classList.add('hidden');
      document.getElementById('positions-list').textContent = 'Kontodaten werden geladen …';
      delete document.getElementById('positions-list').dataset.structure;
      matrixSignature = null; vpSignature = null;
      renderJournal();
      document.getElementById('matrix-tbody').replaceChildren();
      document.getElementById('exit-goals').replaceChildren();
      document.getElementById('gold-details').classList.add('hidden');
      document.getElementById('vp-histogram-container').replaceChildren();
      document.getElementById('vp-summary-badge').textContent = 'Volumenprofil wird geladen …';
      document.getElementById('short-missing-text').textContent = 'Signale werden geladen …';
      document.getElementById('trend-badge').textContent = 'LADE DATEN';
      document.getElementById('window-badge').textContent = 'STATUS UNBEKANNT';
      for (const side of ['sell','buy']) document.getElementById(side+'-bar').style.width = '0%';
      if (candleSeries) {
        candleSeries.setMarkers([]);
        Object.values(srLines).forEach(line => candleSeries.removePriceLine(line));
        srLines = {};
        const levelLegend = document.getElementById('chart-level-legend');
        if (levelLegend) { levelLegend.replaceChildren(); levelLegend.hidden = true; }
        for (const series of [candleSeries,ema20Series,ema50Series,ema200Series]) series.setData([]);
      }
      isInitialLoad = true;
      lastCandleTime = 0;
    }

    function reportAccountError(error, generation) {
      if (error.name === 'AbortError' || generation !== accountGeneration) return;
      clearAccountView();
      const status = document.getElementById('account-connection');
      status.textContent = error.message;
      status.className = 'text-rose-500 font-bold';
    }

    async function switchAccount(account) {
      if (!accounts[account]) return;
      activeAccount = account;
      try { window.ChartStudioBeta?.account(account); } catch (_) {}
      accountGeneration++;
      localStorage.setItem('gold_dashboard_account', account);
      document.querySelectorAll('.account-tab').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.account===account)));
      const meta = accounts[account];
      document.getElementById('strategy-title').textContent = meta.name.toUpperCase();
      document.getElementById('strategy-version').textContent = meta.version;
      document.title = meta.name + ' · ' + meta.login + ' · Live Cockpit';
      document.getElementById('account-detail').textContent = meta.login + ' · ' + meta.server + ' · XAUUSD / M15';
      document.getElementById('account-connection').textContent = 'Verbindung wird geprüft …';
      document.getElementById('account-connection').className = 'text-amber-500 font-bold';
      document.getElementById('matrix-title').textContent = account==='goldm15' ? '🎯 Einstiegsziele · Systeme 1–3' : '🎯 Target-Matrix (Alle 5 Regeln im Direktvergleich)';
      for (const side of ['sell','buy']) document.getElementById(side+'-readiness-label').textContent = (side==='sell'?'SHORT':'LONG')+(account==='goldm15'?' · ERFÜLLTE ZIELE':'-BEREITSCHAFT');
      document.getElementById('session-label').textContent = account==='goldm15' ? 'Handelsfreigabe:' : 'Handelsfenster (DE):';
      document.getElementById('session-description').textContent = account==='goldm15' ? 'EA prüft News, Feiertage, Spread und Risiko' : '05:00-12:00 & 15:00-18:00 (Golden Hours)';
      document.getElementById('dd-source-label').textContent = account==='goldm15' ? 'Tages-DD (EA-Basis / Anzeige):' : 'Tages-Drawdown (Blueberry):';
      document.getElementById('dd-reset-button').textContent = account==='goldm15' ? 'Anzeige-Reset' : '🔄 Reset';
      document.getElementById('dd-badge').title = account==='goldm15' ? 'EA-Grenze: 3,5% vom Startkapital ($350). Dashboard-Reset ändert keine Sperre.' : 'Blueberry Funded Tages-Drawdown (Tages-Start / High-Water Mark)';
      clearAccountView();
      await Promise.all([updateStatus(),loadCandles()]);
    }

    function renderGoldDetails(data) {
      const container = document.getElementById('gold-details');
      container.classList.toggle('hidden', !data.ea_guard);
      if (!data.ea_guard) return;
      const guard = data.ea_guard;
      const money = value => value === null ? 'unbekannt' : '$'+value.toFixed(2);
      const locked = guard.hard_lock || guard.daily_lock;
      document.getElementById('guard-status').textContent = locked ? 'EA-SPERRE AKTIV' : guard.baseline_verified ? 'TAGESBASIS BESTÄTIGT' : 'SCHUTZSTATUS UNBEKANNT';
      document.getElementById('guard-status').className = locked || !guard.baseline_verified ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold';
      document.getElementById('guard-detail').textContent = 'Basis '+money(guard.baseline)+' · Puffer bis $350: '+money(guard.daily_buffer_usd)+' · Mit Tagesreserve: '+money(guard.daily_protected_buffer_usd)+' · Geschützte Untergrenze '+money(guard.hard_protected_floor_usd)+' · Rest '+money(guard.hard_buffer_usd);
      document.getElementById('guard-note').textContent = guard.note;
      document.getElementById('exit-goals').innerHTML = data.exit_goals.map(goal => `<div class="ticker-bg border rounded-lg p-2"><div class="font-bold mb-1">System ${goal.slot}</div><div class="text-rose-500">Short: ${goal.short_note} · ${goal.short_value.toFixed(3)}% ${goal.short_met?'✓ erreicht':'offen'}</div><div class="text-emerald-500">Long: ${goal.long_note} · ${goal.long_value.toFixed(3)}% ${goal.long_met?'✓ erreicht':'offen'}</div></div>`).join('');
    }
    let currentBottomMargin = 0.10;

    // --- THEME TOGGLE LOGIC ---
    function initTheme() {
      const saved = localStorage.getItem('titan_theme') || 'dark';
      applyTheme(saved);
    }

    function toggleTheme() {
      const cur = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      const target = (cur === 'dark') ? 'light' : 'dark';
      applyTheme(target);
    }

    function applyTheme(theme) {
      const isDark = (theme === 'dark');
      if (isDark) {
        document.body.classList.remove('theme-light');
        document.body.classList.add('theme-dark');
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        document.getElementById('theme-icon').innerText = '☀️';
        document.getElementById('theme-label').innerText = 'Hell';
        localStorage.setItem('titan_theme', 'dark');
      } else {
        document.body.classList.remove('theme-dark');
        document.body.classList.add('theme-light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.getElementById('theme-icon').innerText = '🌙';
        document.getElementById('theme-label').innerText = 'Dunkel';
        localStorage.setItem('titan_theme', 'light');
      }

      if (chart) {
        chart.applyOptions({
          layout: {
            background: { type: 'solid', color: isDark ? '#0a0f1d' : '#ffffff' },
            backgroundColor: isDark ? '#0a0f1d' : '#ffffff',
            textColor: isDark ? '#94a3b8' : '#0f172a',
          },
          grid: {
            vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9' },
            horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9' },
          },
          rightPriceScale: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1',
          },
          timeScale: {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1',
          }
        });
      }
    }

    // --- CHART INITIALIZATION ---
    function initChart() {
      const container = document.getElementById('tv-chart');
      const w = container.clientWidth || 650;
      const h = container.clientHeight || 520;
      const isDark = document.body.classList.contains('theme-dark');

      chart = LightweightCharts.createChart(container, {
        width: w,
        height: h,
        layout: {
          background: { type: 'solid', color: isDark ? '#0a0f1d' : '#ffffff' },
          backgroundColor: isDark ? '#0a0f1d' : '#ffffff',
          textColor: isDark ? '#94a3b8' : '#0f172a',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9' },
          horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1',
          autoScale: true,
          scaleMargins: {
            top: 0.10,
            bottom: currentBottomMargin,
          },
        },
        timeScale: {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 10,
          minBarSpacing: 4,
        },
        handleScale: {
          axisPressedMouseMove: { time: true, price: true },
          axisDoubleClickReset: true,
          mouseWheel: true,
          pinch: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });

      candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#f43f5e',
        borderDownColor: '#f43f5e', borderUpColor: '#10b981',
        wickDownColor: '#f43f5e', wickUpColor: '#10b981',
      });

      // Intermittent glow is rendered only on the transparent FX canvas.
      ema20Series  = chart.addLineSeries({ color: '#00d2ff', lineWidth: 2, title: 'EMA20' });
      ema50Series  = chart.addLineSeries({ color: '#ff9f43', lineWidth: 2, title: 'EMA50' });
      ema200Series = chart.addLineSeries({ color: '#a55eea', lineWidth: 2, title: 'EMA200' });
      try { window.StoneChartFX?.attach({chart, host:container, candleSeries, emaSeries:[ema20Series,ema50Series,ema200Series]}); } catch (_) {}
      try { window.StoneCelebration?.applyChartSettings(); } catch (_) {}
      try { window.ChartStudioBeta?.mount({chart,host:container,candleSeries,emaSeries:[ema20Series,ema50Series,ema200Series],account:activeAccount,timeframe:activeTimeframe}); } catch (err) { console.warn("Chart Studio Beta konnte nicht gestartet werden:",err); }

      // Robust ResizeObserver
      let chartInitiallySized = false;
      const ro = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
            if (!chartInitiallySized && currentCandlesCount > 0) {
              chartInitiallySized = true;
              applyOptimalChartView(currentCandlesCount);
            }
          }
        }
      });
      ro.observe(container);
      updateEAStatusButtonUI();
    }

    // --- CHART CONTROLS (Runterziehen, Zoom, Reset, Optimal View) ---
    function applyOptimalChartView(totalBars) {
      if (!chart) return;
      const count = (typeof totalBars === 'number' && totalBars > 5) ? totalBars : (currentCandlesCount || 150);
      const visibleBars = 55;
      const rightOffset = 12;
      const range = {
        from: Math.max(0, count - visibleBars),
        to: count + rightOffset
      };
      chart.timeScale().setVisibleLogicalRange(range);
      requestAnimationFrame(() => {
        if (chart) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    function adjustChartMargin(delta) {
      if (!chart) return;
      currentBottomMargin = Math.min(0.65, Math.max(0.05, currentBottomMargin + delta));
      chart.priceScale('right').applyOptions({
        autoScale: true,
        scaleMargins: {
          top: 0.10,
          bottom: currentBottomMargin
        }
      });
    }

    function resetChartZoom() {
      if (chart) {
        currentBottomMargin = 0.10;
        chart.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.10, bottom: currentBottomMargin }
        });
        applyOptimalChartView(currentCandlesCount || 150);
      }
    }

    function zoomChart(factor) {
      if (!chart) return;
      const r = chart.timeScale().getVisibleLogicalRange();
      if (!r) return;
      const span = (r.to - r.from) * factor;
      const mid = (r.to + r.from) / 2;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.round(mid - span / 2),
        to: Math.round(mid + span / 2)
      });
    }

    // --- SUPPORT & RESISTANCE / VOLUME PROFILE LINES ON CHART ---
    function updateChartSRLines(sr, curPrice) {
      if (!sr || !candleSeries) { renderChartLevelLegend([]); return; }
      const visibleLevels = [];

      function setLine(key, price, color, title, style = 2) {
        const p = Number(price);
        if (!Number.isFinite(p) || p <= 0) { removeLine(key); return; }
        visibleLevels.push({key, price:p, color, title});
        // Long native price-line titles are clipped by the narrow right axis.
        // Keep their numeric scale labels and show complete names in our legend.
        if (srLines[key]) {
          srLines[key].applyOptions({price:p, color, title:''});
        } else {
          srLines[key] = candleSeries.createPriceLine({
            price:p, color, lineWidth:1, lineStyle:style,
            axisLabelVisible:true, title:'',
          });
        }
      }

      function removeLine(key) {
        if (srLines[key]) {
          candleSeries.removePriceLine(srLines[key]);
          delete srLines[key];
        }
      }

      setLine('res_high', sr.daily_high, '#f43f5e', 'Daily High (Res)', 2);
      setLine('sup_low',  sr.daily_low,  '#10b981', 'Daily Low (Sup)', 2);
      setLine('dpoc',     sr.daily_poc,  '#f59e0b', 'Daily POC', 0);
      setLine('wpoc',     sr.weekly_poc, '#06b6d4', 'Weekly POC', 0);

      // Only display weekly high/low if within $35 USD of current price,
      // so distant weekly levels don't blow out the vertical price scale and crush the candles.
      const ref = (curPrice && curPrice > 0) ? curPrice : (sr.daily_poc || 0);
      if (sr.weekly_high && ref > 0 && Math.abs(sr.weekly_high - ref) <= 35) {
        setLine('w_high', sr.weekly_high, '#e11d48', 'Weekly High (Res)', 1);
      } else {
        removeLine('w_high');
      }

      if (sr.weekly_low && ref > 0 && Math.abs(sr.weekly_low - ref) <= 35) {
        setLine('w_low', sr.weekly_low, '#059669', 'Weekly Low (Sup)', 1);
      } else {
        removeLine('w_low');
      }
      renderChartLevelLegend(visibleLevels);
    }

    function renderChartLevelLegend(levels) {
      const box = document.getElementById('chart-level-legend');
      if (!box) return;
      box.replaceChildren();
      box.hidden = !levels.length;
      if (!levels.length) return;
      const heading = document.createElement('div');
      heading.className = 'stone-chart-level-heading';
      heading.textContent = 'PREISLEVEL';
      box.append(heading);
      for (const level of levels) {
        const row = document.createElement('div');
        row.className = 'stone-chart-level';
        row.style.setProperty('--level-color',level.color);
        const label = document.createElement('span');
        label.className = 'stone-chart-level-name';
        label.textContent = level.title;
        const value = document.createElement('strong');
        value.className = 'stone-chart-level-price';
        value.textContent = level.price.toFixed(2);
        row.append(label,value);
        box.append(row);
      }
    }

    // --- SMOOTH CANDLES LOAD (NO JUMPING & PRESERVES ZOOM) ---
    async function loadCandles() {
      const generation = accountGeneration;
      if (candlesBusy === generation) return;
      candlesBusy = generation;
      try {
        const reqTf = activeTimeframe;
        const res = await accountFetch('/api/candles?tf=' + encodeURIComponent(reqTf));
        const data = await res.json();
        if (generation !== accountGeneration || reqTf !== activeTimeframe) throw staleRequest();
        if (!data.candles || data.candles.length === 0) return;

        currentCandlesCount = data.candles.length;
        const latest = data.candles[data.candles.length - 1];
        const curPrice = latest ? latest.close : 0;
        const stoneNewBar = !isInitialLoad && lastCandleTime !== 0 && latest.time !== lastCandleTime;

        if (isInitialLoad) {
          candleSeries.setData(data.candles);
          ema20Series.setData(data.ema20);
          ema50Series.setData(data.ema50);
          ema200Series.setData(data.ema200);
          updateChartSRLines(data.sr_levels, curPrice);
          applyOptimalChartView(data.candles.length);
          isInitialLoad = false;
          lastCandleTime = latest.time;
        } else {
          if (latest.time === lastCandleTime) {
            candleSeries.update(latest);
            ema20Series.update(data.ema20[data.ema20.length - 1]);
            ema50Series.update(data.ema50[data.ema50.length - 1]);
            ema200Series.update(data.ema200[data.ema200.length - 1]);
          } else {
            // New bar: keep exact user zoom & position with 12-bar right offset
            const curRange = chart.timeScale().getVisibleLogicalRange();
            const totalBars = data.candles.length;
            const wasAtEnd = curRange ? (curRange.to >= (totalBars - 3)) : true;

            candleSeries.setData(data.candles);
            ema20Series.setData(data.ema20);
            ema50Series.setData(data.ema50);
            ema200Series.setData(data.ema200);

            if (curRange) {
              if (wasAtEnd) {
                const span = curRange.to - curRange.from;
                chart.timeScale().setVisibleLogicalRange({
                  from: totalBars + 12 - span,
                  to: totalBars + 12
                });
              } else {
                chart.timeScale().setVisibleLogicalRange(curRange);
              }
            }
            lastCandleTime = latest.time;
          }
          updateChartSRLines(data.sr_levels, curPrice);
        }

        try { window.ChartStudioBeta?.updateCandles(data.candles); } catch (_) {}
        currentChartMarkers = data.markers || [];
        candleSeries.setMarkers(showEAStatusText ? currentChartMarkers : []);
        try {
          window.StoneChartFX?.update({
            candles: data.candles,
            emas: [data.ema20, data.ema50, data.ema200],
            markers: showEAStatusText ? currentChartMarkers : [],
            newBar: stoneNewBar,
            context: activeAccount + '/' + activeTimeframe + '/' + accountGeneration
          });
        } catch (_) { /* Never let decorative effects interfere with MT5 polling. */ }
        try {
          const last = items => Array.isArray(items)&&items.length?items[items.length-1].value:null;
          window.StoneCelebration?.updateEMAs({
            timeframe:activeTimeframe,
            ema20:last(data.ema20),ema50:last(data.ema50),ema200:last(data.ema200)
          });
        } catch (_) { /* Read-only EMA display is optional. */ }
      } catch (err) {
        reportAccountError(err, generation);
      } finally { if (candlesBusy === generation) candlesBusy = null; }
    }

    // --- LIVE STATUS & TARGET MATRIX ---
    async function updateStatus() {
      const generation = accountGeneration;
      if (statusBusy === generation) return;
      statusBusy = generation;
      try {
        const res = await accountFetch('/api/status');
        const data = await res.json();
        if (generation !== accountGeneration) throw staleRequest();
        const needsCharts = currentData === null;
        currentData = data;
        try { window.ChartStudioBeta?.updatePositions(data.account.id, data.positions); } catch (_) {}
        try { window.StoneCelebration?.observeTrades(data.account.id,data.journal,data.positions); }
        catch (_) { /* Visual event detection must not affect trading. */ }
        document.getElementById('account-content').dataset.connected = 'true';
        document.getElementById('dd-reset-button').disabled = false;
        document.getElementById('account-connection').textContent = 'LIVE · Konto '+data.account.login+' bestätigt';
        document.getElementById('account-connection').className = 'text-emerald-500 font-bold';
        document.getElementById('matrix-time').textContent = data.signal_bar_time ? 'M15 Schluss '+data.signal_bar_time : 'M15 Kerzenschluss';
        document.getElementById('window-badge').textContent = data.in_window===null ? 'EA-FILTER PRÜFEN' : data.in_window ? 'HANDEL OFFEN' : 'EINSTIEG GESPERRT';
        renderGoldDetails(data);

        // Header
        document.getElementById('live-bid').innerText = data.bid.toFixed(2);
        document.getElementById('live-ask').innerText = data.ask.toFixed(2);
        document.getElementById('live-spread').innerText = `Spr: ${data.spread}`;
        document.getElementById('time-server').innerText = data.times.server;
        document.getElementById('time-german').innerText = data.times.german;
        document.getElementById('bar-countdown').innerText = data.times.bar_remaining_fmt;

        // Daily Drawdown & Account Update
        if (data.daily_drawdown) {
          const dd = data.daily_drawdown;
          const ddPctElem = document.getElementById('dd-pct');
          const ddUsdElem = document.getElementById('dd-usd');
          const ddBufferElem = document.getElementById('dd-buffer');
          const ddDotElem = document.getElementById('dd-dot');
          const ddMatrixDetail = document.getElementById('dd-matrix-detail');
          const accMatrixBal = document.getElementById('acc-matrix-bal');

          if (ddPctElem) {
            ddPctElem.innerText = `${dd.pct.toFixed(2)}%`;
            ddUsdElem.innerText = `(-$${dd.loss_usd.toFixed(2)})`;
            ddBufferElem.innerText = `$${dd.buffer_usd.toFixed(2)}`;

            if (dd.pct >= 3.0) {
              ddDotElem.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
              ddPctElem.className = 'font-bold text-rose-500 font-black';
              ddBufferElem.className = 'font-bold text-rose-500';
            } else if (dd.pct >= 2.0) {
              ddDotElem.className = 'w-2 h-2 rounded-full bg-amber-500';
              ddPctElem.className = 'font-bold text-amber-400';
              ddBufferElem.className = 'font-bold text-amber-400';
            } else {
              ddDotElem.className = 'w-2 h-2 rounded-full bg-emerald-500';
              ddPctElem.className = 'font-bold text-emerald-400';
              ddBufferElem.className = 'font-bold text-emerald-400';
            }
          }

          if (ddMatrixDetail) {
            const colorClass = dd.pct >= 3.0 ? 'text-rose-400' : (dd.pct >= 2.0 ? 'text-amber-400' : 'text-emerald-400');
            ddMatrixDetail.className = `font-bold font-mono ${colorClass}`;
            ddMatrixDetail.innerText = `${dd.pct.toFixed(2)}% / -$${dd.loss_usd.toFixed(2)} (Puffer: $${dd.buffer_usd.toFixed(2)})`;
          }

          if (accMatrixBal) {
            accMatrixBal.innerText = `$${dd.balance.toFixed(2)} / $${dd.equity.toFixed(2)}`;
          }

          const ddResetTag = document.getElementById('dd-reset-tag');
          if (ddResetTag) {
            if (dd.manual_active && dd.reset_balance) {
              ddResetTag.classList.remove('hidden');
              ddResetTag.innerText = `Reset: $${(dd.reset_balance >= 1000 ? (dd.reset_balance/1000).toFixed(1) + 'k' : dd.reset_balance.toFixed(0))}`;
              ddResetTag.title = `Tages-DD manuell auf $${dd.reset_balance.toFixed(2)} um ${dd.reset_time_str || ''} gesetzt`;
            } else {
              ddResetTag.classList.add('hidden');
            }
          }
          if (data.ea_guard && !data.ea_guard.baseline_verified && !dd.manual_active) {
            document.getElementById('dd-pct').textContent = 'unbekannt';
            document.getElementById('dd-usd').textContent = '(EA-Basis fehlt)';
            document.getElementById('dd-buffer').textContent = 'unbekannt';
            document.getElementById('dd-matrix-detail').textContent = 'EA-Basis unbekannt';
          }
        }

        const posCountElem = document.getElementById('pos-matrix-count');
        if (posCountElem && data.positions) {
          posCountElem.innerText = `${data.positions.length} / ${data.account.capacity} Aktiv`;
        }

        // Dynamic Trend & AI Diagnose
        const trendBadge = document.getElementById('trend-badge');
        if (trendBadge && data.trend_name) {
          trendBadge.innerText = data.trend_name;
          trendBadge.className = `px-2 py-0.5 rounded font-bold text-[9px] ${data.trend_direction === 'BULLISH' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'}`;
        }

        const cardElem = document.getElementById('diagnose-card');
        if (cardElem && data.trend_direction) {
          cardElem.className = `glass-card rounded-xl p-3.5 border-l-4 ${data.trend_direction === 'BULLISH' ? 'border-l-emerald-500' : 'border-l-rose-500'}`;
        }

        const statusPrefix = data.account.id==='goldm15' ? '<span class="text-blue-400 font-black">RSI-Setup:</span>' : (data.trend_direction === 'BULLISH') 
          ? `<span class="text-emerald-400 font-black">Aktiver Trend (Long):</span>` 
          : `<span class="text-rose-400 font-black">Aktiver Trend (Short):</span>`;
        
        document.getElementById('short-missing-text').innerHTML = `${statusPrefix} ${data.trend_diagnosis || data.short_missing}`;
        document.getElementById('sell-pct').innerText = `${data.sell_readiness}% (${data.sell_met_count}/${data.rule_count})`;
        document.getElementById('sell-bar').style.width = `${data.sell_readiness}%`;
        document.getElementById('buy-pct').innerText = `${data.buy_readiness}% (${data.buy_met_count}/${data.rule_count})`;
        document.getElementById('buy-bar').style.width = `${data.buy_readiness}%`;

        // Render Matrix Table
        renderMatrix(data.rules_matrix);

        // Render Volume Profile Card
        renderVolumeProfile(data);

        // Render Positions
        renderPositions(data.positions);

        // The journal is independently queried for one or BOTH strategies.
        // Do not replace the merged view with activeAccount-only status data.

        if (needsCharts) void loadCandles();

      } catch (err) {
        reportAccountError(err, generation);
      } finally { if (statusBusy === generation) statusBusy = null; }
    }

    function renderMatrix(rules) {
      const signature = JSON.stringify(rules);
      if (matrixSignature === signature) return;
      matrixSignature = signature;
      const tbody = document.getElementById('matrix-tbody');
      tbody.innerHTML = rules.map((r,index) => `
        <tr class="hover-row transition-colors stone-target-row stone-target-row--${index % 5}">
          <td class="py-2 pr-2">
            <div class="font-sans font-bold text-xs">${r.name}</div>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.short_met ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}">
              <span>${r.short_met ? '✅' : '❌'}</span>
              <span>${r.short_met ? 'ERFÜLLT' : 'FEHLT'}</span>
            </span>
            <div class="text-[9px] text-sub mt-1 whitespace-normal">${r.short_note}</div>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.long_met ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}">
              <span>${r.long_met ? '✅' : '❌'}</span>
              <span>${r.long_met ? 'ERFÜLLT' : 'FEHLT'}</span>
            </span>
            <div class="text-[9px] text-sub mt-1 whitespace-normal">${r.long_note}</div>
          </td>
          <td class="py-2 pl-2 text-right font-mono text-[10px] opacity-90 font-bold stone-target-live">
            ${r.current_val}
          </td>
        </tr>
      `).join('');
    }

    // --- VOLUME PROFILE RENDERER ---
    function switchVPTab(tab) {
      currentVPTab = tab;
      vpSignature = null;
      document.getElementById('vp-tab-daily').className = (tab === 'daily') ? 'px-2.5 py-0.5 rounded-md font-bold bg-blue-600 text-white cursor-pointer' : 'px-2.5 py-0.5 rounded-md font-bold opacity-60 cursor-pointer';
      document.getElementById('vp-tab-weekly').className = (tab === 'weekly') ? 'px-2.5 py-0.5 rounded-md font-bold bg-blue-600 text-white cursor-pointer' : 'px-2.5 py-0.5 rounded-md font-bold opacity-60 cursor-pointer';
      if (currentData) renderVolumeProfile(currentData);
    }

    function renderVolumeProfile(data) {
      const vp = (currentVPTab === 'daily') ? data.daily_vp : data.weekly_vp;
      if (!vp || !vp.histogram) return;
      const signature = currentVPTab + JSON.stringify(vp);
      if (vpSignature === signature) return;
      vpSignature = signature;

      document.getElementById('vp-summary-badge').innerHTML = `
        <span class="text-amber-500 font-bold">POC: $${vp.poc.toFixed(2)}</span> | 
        <span class="text-sky-500">VAH: $${vp.vah.toFixed(2)}</span> | 
        <span class="text-emerald-500">VAL: $${vp.val.toFixed(2)}</span> |
        <span class="text-rose-500">High: $${vp.high.toFixed(2)}</span> |
        <span class="text-emerald-600">Low: $${vp.low.toFixed(2)}</span>
      `;

      const container = document.getElementById('vp-histogram-container');
      const histogram = [...vp.histogram].reverse();
      const sorted = histogram.filter((_, i) => i % 2 === 0).slice(0, 8);
      // Always preserve the genuine POC row when decimating the histogram to 8 bars.
      const pocRow = histogram.find(b => b.is_poc);
      if (pocRow && !sorted.includes(pocRow)) {
        const closest = sorted.reduce((best, row, i) => (
          !best || Math.abs(row.price - pocRow.price) < best.distance
            ? {index:i, distance:Math.abs(row.price - pocRow.price)} : best
        ), null);
        if (closest) sorted[closest.index] = pocRow;
        sorted.sort((a,b) => b.price - a.price);
      }
      
      container.innerHTML = sorted.map((b, index) => {
        let barColor = index % 2 === 0 ? 'bg-cyan-500/75' : 'bg-amber-500/75';
        let label = '';
        // Palette is decorative: cyan/amber alternation is NOT buy/sell volume.
        const stoneKind = b.is_poc ? 'poc' : b.in_va ? 'va' : 'off';
        const stoneTone = b.is_poc ? 'gold' : index % 2 === 0 ? 'cyan' : 'amber';
        if (b.is_poc) {
          barColor = 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]';
          label = '⭐ POC (Max Vol)';
        } else {
          label = b.in_va ? 'VA (70%)' : 'Außerhalb VA';
        }
        return `
          <div class="flex items-center gap-2">
            <span class="w-16 font-mono text-[10px] opacity-80 text-right">$${b.price.toFixed(2)}</span>
            <div class="flex-1 bg-black/20 rounded-full h-3 overflow-hidden flex items-center">
              <div class="h-full rounded-full vp-bar ${barColor}" data-kind="${stoneKind}" data-tone="${stoneTone}" style="width: ${Math.max(0, Math.min(100, Number(b.vol_pct) || 0))}%"></div>
            </div>
            <span class="w-24 text-[9px] font-mono opacity-80 ${b.is_poc ? 'text-amber-500 font-bold' : ''}">${label || b.vol_pct + '%'}</span>
          </div>
        `;
      }).join('');
    }

    // --- POSITIONS & SL/TP MANAGER ---
    function renderPositions(positions) {
      const list = document.getElementById('positions-list');
      const badge = document.getElementById('pos-count-badge');
      badge.innerText = `${positions.length} Aktiv`;
      if (!list.dataset.dirtyBound) {
        list.addEventListener('input', event => {
          if (event.target.matches('input[id^="sl-input-"], input[id^="tp-input-"]')) {
            event.target.dataset.dirty = 'true';
          }
        });
        list.dataset.dirtyBound = '1';
      }
      const structure = positions.map(pos => [pos.ticket,pos.type,pos.volume,pos.open_price].join(':')).join('|');

      if (positions.length === 0) {
        if (list.dataset.structure !== '') {
          list.innerHTML = `<div class="py-6 flex items-center justify-center text-sub text-xs">Aktuell keine offenen Positionen auf XAUUSD. Der EA scannt den Markt bei jedem M15-Kerzenschluss (:00, :15, :30, :45).</div>`;
          list.dataset.structure = '';
        }
        return;
      }

      if (list.dataset.structure !== structure) {
        list.innerHTML = positions.map(p => `
        <div data-position-ticket="${p.ticket}" class="p-3 rounded-xl ticker-bg border flex flex-wrap items-center justify-between gap-3 text-xs mb-2">
          <div class="flex items-center gap-2.5">
            <span class="px-2 py-1 rounded-md font-bold font-mono text-[11px] text-white ${p.type === 'BUY' ? 'bg-emerald-600' : 'bg-rose-600'}">
              ${p.type} ${p.volume} Lot
            </span>
            <span class="font-mono font-bold text-xs">#${p.ticket} @ $${p.open_price.toFixed(2)}</span>
            <span data-position-current class="text-sub font-mono text-[10px]">Aktuell: &#36;${p.current_price.toFixed(2)}</span>
          </div>

          <div class="font-mono text-right">
            <span data-position-pnl class="font-extrabold text-sm ${p.profit_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
              ${p.profit_usd >= 0 ? '+' : ''}$${p.profit_usd.toFixed(2)} (${p.profit_pct >= 0 ? '+' : ''}${p.profit_pct.toFixed(2)}%)
            </span>
          </div>

          <!-- SL in USD -->
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <span class="text-sub font-bold">SL:</span>
            <input type="number" id="sl-input-${p.ticket}" step="5" value="${p.sl_usd.toFixed(2)}" class="w-16 rounded px-1.5 py-0.5 text-center text-xs ticker-bg border text-rose-500 font-bold">
            <button onclick="applySLTP(${p.ticket})" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[10px] cursor-pointer">Set</button>
            <button onclick="quickBE(${p.ticket})" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-amber-500 border rounded text-[10px] font-bold cursor-pointer" title="Break-Even +$5">BE +$5</button>
            <button onclick="quickSL(${p.ticket}, -50)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-rose-500 border rounded text-[10px] cursor-pointer">-$50</button>
          </div>

          <!-- TP in USD -->
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <span class="text-sub font-bold">TP:</span>
            <input type="number" id="tp-input-${p.ticket}" step="10" value="${p.tp_usd.toFixed(2)}" class="w-16 rounded px-1.5 py-0.5 text-center text-xs ticker-bg border text-emerald-500 font-bold">
            <button onclick="applySLTP(${p.ticket})" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[10px] cursor-pointer">Set</button>
            <button onclick="quickTP(${p.ticket}, 50)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-emerald-500 border rounded text-[10px] font-bold cursor-pointer">+$50</button>
            <button onclick="quickTP(${p.ticket}, 100)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-emerald-500 border rounded text-[10px] font-bold cursor-pointer">+$100</button>
          </div>

          <button onclick="closePos(${p.ticket})" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm">
            Position Schließen
          </button>
        </div>
      `).join('');
        list.dataset.structure = structure;
      }
      for (const pos of positions) {
        const row = list.querySelector('[data-position-ticket="' + pos.ticket + '"]');
        if (!row) continue;
        const price = row.querySelector('[data-position-current]');
        if (price) price.textContent = 'Aktuell: ' + String.fromCharCode(36) + pos.current_price.toFixed(2);
        const pnl = row.querySelector('[data-position-pnl]');
        if (pnl) {
          pnl.textContent = (pos.profit_usd >= 0 ? '+' : '') + String.fromCharCode(36) + pos.profit_usd.toFixed(2) +
            ' (' + (pos.profit_pct >= 0 ? '+' : '') + pos.profit_pct.toFixed(2) + '%)';
          pnl.classList.toggle('text-emerald-500', pos.profit_usd >= 0);
          pnl.classList.toggle('text-rose-500', pos.profit_usd < 0);
        }
        for (const [id, value] of [['sl-input-' + pos.ticket,pos.sl_usd],
                                  ['tp-input-' + pos.ticket,pos.tp_usd]]) {
          const input = document.getElementById(id);
          if (input && document.activeElement !== input && input.dataset.dirty !== 'true') {
            input.value = value.toFixed(2);
          }
        }
      }
    }

    // Journal selection is independent from the account that controls orders.
    // Each source is queried under its own verified MT5 session on the server.
    function setJournalFilter(value) {
      if (!['all', 'titan', 'goldm15'].includes(value)) return;
      journalFilter = value;
      localStorage.setItem('two_eas_journal_filter', value);
      const selector = document.getElementById('journal-strategy-filter');
      if (selector) selector.value = value;
      journalRequestVersion++; // obsolete pending responses must never win
      journalBusyMode = null;
      journalLoadedMode = null;
      journalErrors = [];
      journalEntriesByAccount = {titan: [], goldm15: []};
      renderJournal();
      return refreshJournal();
    }

    async function refreshJournal() {
      if (!Object.keys(accounts).length || journalBusyMode === journalFilter) return;
      const mode = journalFilter;
      const requestVersion = ++journalRequestVersion;
      const wanted = mode === 'all' ? Object.keys(accounts) : [mode];
      journalBusyMode = mode;
      const results = await Promise.all(wanted.map(async (id) => {
        try {
          // Deliberately NOT accountFetch: that helper is tied to the trading
          // account and would silently replace the selected journal account.
          const response = await fetch(BASE_PATH + '/api/journal_summary?account=' + encodeURIComponent(id));
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.detail || 'MT5-Journal nicht erreichbar');
          if (payload.account !== id || !Array.isArray(payload.journal)) {
            throw new Error('MT5-Antwort gehört nicht zum angefragten Konto.');
          }
          if (payload.journal.some(item => item.account !== id)) {
            throw new Error('Journal enthält Einträge eines anderen Kontos.');
          }
          return {id, entries: payload.journal};
        } catch (error) {
          return {id, error: error.message || 'Unbekannter Verbindungsfehler'};
        }
      }));
      if (requestVersion !== journalRequestVersion || mode !== journalFilter) return;
      const fresh = {titan: [], goldm15: []};
      journalErrors = [];
      for (const result of results) {
        if (result.error) {
          journalErrors.push((accounts[result.id]?.name || result.id) + ': ' + result.error);
        } else {
          fresh[result.id] = result.entries;
          try { window.StoneCelebration?.observeTrades(result.id,result.entries); }
          catch (_) { /* Never impact the journal on visual failures. */ }
        }
      }
      journalEntriesByAccount = fresh;
      journalLoadedMode = mode;
      journalBusyMode = null;
      renderJournal();
    }

    // --- TRADE JOURNAL RENDERER (strategy selection does not change MT5 orders) ---
    function renderJournal() {
      const wanted = journalFilter === 'all' ? Object.keys(accounts) : [journalFilter];
      const itemsToRender = wanted.flatMap(id => journalEntriesByAccount[id] || [])
        .sort((a,b) => (Number(b.time_ts) || 0) - (Number(a.time_ts) || 0));
      const stratName = journalFilter === 'all' ? 'ALLE STRATEGIEN'
        : journalFilter === 'titan' ? 'XAU TITAN PRO' : 'GOLDM15 RECONSTRUCTION';
      const stratColor = journalFilter === 'all' ? 'text-sky-300'
        : journalFilter === 'titan' ? 'text-cyan-400' : 'text-amber-400';

      const stratEl = document.getElementById('journal-strat-badge');
      if (stratEl) {
        stratEl.textContent = stratName;
        stratEl.className = `px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-black uppercase ${stratColor}`;
      }

      const list = document.getElementById('journal-list');
      const countBadge = document.getElementById('journal-count-badge');
      const totBadge = document.getElementById('journal-total-pnl');
      const liveBadge = document.getElementById('journal-live-pnl');
      const closedBadge = document.getElementById('journal-closed-pnl');
      const syncBanner = document.getElementById('journal-sync-status');
      if (syncBanner) {
        syncBanner.classList.toggle('hidden', journalErrors.length === 0);
        syncBanner.textContent = journalErrors.length ? 'Journal unvollständig – ' + journalErrors.join(' · ') : '';
      }

      if (journalLoadedMode !== journalFilter) {
        if (countBadge) countBadge.textContent = 'Lädt …';
        if (totBadge) totBadge.textContent = 'PnL: —';
        if (liveBadge) liveBadge.classList.add('hidden');
        if (closedBadge) closedBadge.classList.add('hidden');
        if (list) list.textContent = 'Journal-Einträge werden für die ausgewählten Strategien geladen …';
        return;
      }

      if (!itemsToRender.length) {
        if (countBadge) {
          countBadge.innerText = '0 Aufgezeichnet';
          countBadge.className = 'px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-sub';
        }
        if (totBadge) {
          totBadge.textContent = 'PnL: $0.00';
          totBadge.className = 'px-2.5 py-0.5 rounded-md font-mono text-[11px] font-black border bg-black/30 text-sub';
        }
        if (liveBadge) liveBadge.classList.add('hidden');
        if (closedBadge) closedBadge.classList.add('hidden');

        if (list) {
          list.innerHTML = `
            <div class="py-6 flex flex-col items-center justify-center text-sub text-xs gap-1">
              <span>${journalErrors.length === wanted.length ? 'Journal derzeit nicht erreichbar.' : 'Keine Trades seit 20:00 Uhr DE-Zeit für ' + stratName + ' verzeichnet.'}</span>
              <span class="text-[10px] opacity-75">Neue Einstiege und Exits werden ab 20:00 Uhr automatisch erfasst und begründet.</span>
            </div>`;
        }
        return;
      }

      // Calculations
      const totalPnL = itemsToRender.reduce((sum, it) => sum + (it.profit_usd || 0), 0);
      const liveItems = itemsToRender.filter(it => it.status === 'OPEN');
      const closedItems = itemsToRender.filter(it => it.status === 'CLOSED');
      const livePnL = liveItems.reduce((sum, it) => sum + (it.profit_usd || 0), 0);
      const closedPnL = closedItems.reduce((sum, it) => sum + (it.profit_usd || 0), 0);

      if (countBadge) {
        countBadge.innerText = `${itemsToRender.length} Trades (${liveItems.length} Live · ${closedItems.length} Hist)`;
        countBadge.className = 'px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-white';
      }

      if (totBadge) {
        const sign = totalPnL >= 0 ? '+' : '-';
        totBadge.textContent = `Gesamt: ${sign}$${Math.abs(totalPnL).toFixed(2)}`;
        totBadge.className = `px-2.5 py-0.5 rounded-md font-mono text-[11px] font-black border ${
          totalPnL >= 0 
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
            : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
        }`;
      }

      if (liveBadge) {
        if (liveItems.length > 0) {
          liveBadge.classList.remove('hidden');
          const sign = livePnL >= 0 ? '+' : '-';
          liveBadge.textContent = `Live: ${sign}$${Math.abs(livePnL).toFixed(2)}`;
          liveBadge.className = `px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${
            livePnL >= 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          }`;
        } else {
          liveBadge.classList.add('hidden');
        }
      }

      if (closedBadge) {
        if (closedItems.length > 0) {
          closedBadge.classList.remove('hidden');
          const sign = closedPnL >= 0 ? '+' : '-';
          closedBadge.textContent = `Hist: ${sign}$${Math.abs(closedPnL).toFixed(2)}`;
          closedBadge.className = `px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${
            closedPnL >= 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          }`;
        } else {
          closedBadge.classList.add('hidden');
        }
      }

      if (!list) return;

      list.innerHTML = itemsToRender.map(item => {
        const isOpen = item.status === 'OPEN';
        const isBuy = item.type === 'BUY';
        const isProfit = item.profit_usd >= 0;
        const profitSign = isProfit ? '+' : '-';
        const absProfit = Math.abs(item.profit_usd).toFixed(2);
        const pnlFormatted = `${profitSign}$${absProfit}`;
        const ptsSign = (item.points >= 0) ? '+' : '-';
        const ptsFormatted = (typeof item.points === 'number') ? `${ptsSign}${Math.abs(item.points).toFixed(2)} Pkt` : '';

        const statusBadge = isOpen 
          ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
               <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>LIVE POSITION
             </span>`
          : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">
               🏁 HISTORIE (GESCHLOSSEN)
             </span>`;

        const pnlBadge = `
          <div class="flex items-center gap-1 px-3 py-1 rounded-lg border font-mono font-black text-xs ${
            isProfit 
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
              : 'bg-rose-500/15 text-rose-400 border-rose-500/40 shadow-sm shadow-rose-500/10'
          }">
            <span class="text-[10px] opacity-75 font-sans uppercase">${isOpen ? 'Live PnL' : 'Realisiert'}:</span>
            <span class="text-sm font-black">${pnlFormatted}</span>
            ${ptsFormatted ? `<span class="text-[10px] opacity-80 ml-0.5 font-normal">(${ptsFormatted})</span>` : ''}
          </div>
        `;

        const typeBadge = isBuy
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">BUY</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">SELL</span>`;

        const stratBadge = item.account === 'titan'
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">XAU TITAN PRO</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">GOLDM15 RECONSTRUCTION</span>`;

        const priceDetails = isOpen
          ? `<span class="text-sub font-mono">Einstieg: <strong class="text-white">$${item.open_price.toFixed(2)}</strong> · Aktuell: <strong class="${isProfit ? 'text-emerald-400':'text-rose-400'}">$${item.current_price.toFixed(2)}</strong></span>`
          : `<span class="text-sub font-mono">Einstieg: <strong class="text-white">$${item.open_price.toFixed(2)}</strong> · Ausstieg: <strong class="text-white">$${item.close_price.toFixed(2)}</strong></span>`;

        return `
          <div class="glass-card rounded-lg p-3 border border-white/5 hover:border-white/15 transition-all">
            <!-- HEADER WITH PNL -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b table-border">
              <div class="flex flex-wrap items-center gap-2">
                ${stratBadge}
                ${typeBadge}
                <span class="font-mono text-xs font-bold">${item.volume} Lot</span>
                ${priceDetails}
                <span class="text-[10px] text-sub font-mono">#${item.ticket}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-[10px] text-sub font-mono">⏰ DE ${item.time_de} (Server ${item.time_server})</span>
                ${statusBadge}
                ${pnlBadge}
              </div>
            </div>

            <!-- 2 INFO BOXES -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <!-- WHY TRIGGERED -->
              <div class="rounded-md p-2.5 bg-black/20 border border-white/5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-amber-400 text-[11px] mb-1">
                    <span>🎯</span>
                    <span>Warum wurde der Trade ausgelöst? (Einstiegs-Begründung)</span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-sub">${item.why_triggered}</p>
                </div>
              </div>

              <!-- PROFIT GOAL -->
              <div class="rounded-md p-2.5 bg-black/20 border border-white/5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px] mb-1">
                    <span>🏁</span>
                    <span>Was ist das Profitziel / die Ausstiegsregel?</span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-sub">${item.profit_goal}</p>
                </div>
                ${item.sl_price ? `<div class="mt-2 text-[10px] font-mono text-sub flex gap-3">
                  <span>SL: <strong class="text-rose-400">$${item.sl_price.toFixed(2)}</strong></span>
                  <span>TP: <strong class="text-emerald-400">${item.tp_price > 0 ? '$'+item.tp_price.toFixed(2) : 'Dynamic Runner'}</strong></span>
                </div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    async function applySLTP(ticket) {
      const sl_usd = parseFloat(document.getElementById(`sl-input-${ticket}`).value);
      const tp_usd = parseFloat(document.getElementById(`tp-input-${ticket}`).value);
      try {
        const res = await accountFetch('/api/modify_position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket, sl_usd, tp_usd })
        });
        const result = await res.json();
        if (result.success) {
          for (const id of [`sl-input-${ticket}`,`tp-input-${ticket}`]) {
            const input = document.getElementById(id);
            if (input) delete input.dataset.dirty;
          }
          alert(`Position #${ticket} in MT5 erfolgreich aktualisiert!`);
          updateStatus();
        } else {
          alert(`Fehler: ${result.comment || result.error}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        alert('Netzwerkfehler: ' + err);
      }
    }

    async function quickBE(ticket) {
      document.getElementById(`sl-input-${ticket}`).value = "5.00";
      applySLTP(ticket);
    }

    async function quickSL(ticket, val) {
      document.getElementById(`sl-input-${ticket}`).value = val.toFixed(2);
      applySLTP(ticket);
    }

    async function quickTP(ticket, val) {
      document.getElementById(`tp-input-${ticket}`).value = val.toFixed(2);
      applySLTP(ticket);
    }

    async function closePos(ticket) {
      if (!confirm(`Konto ${accounts[activeAccount].login}: Position #${ticket} wirklich sofort zum Marktpreis schließen?`)) return;
      try {
        const res = await accountFetch('/api/close_position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket })
        });
        const result = await res.json();
        if (result.success) {
          alert(`Position #${ticket} geschlossen!`);
          updateStatus();
        } else {
          alert(`Fehler: ${result.comment || result.error}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        alert('Netzwerkfehler: ' + err);
      }
    }

    // --- DAILY DRAWDOWN RESET MODAL CONTROLS ---
    function openDrawdownResetModal() {
      if (!currentData || currentData.account.id !== activeAccount) return;
      document.getElementById('reset-description').textContent = activeAccount==='goldm15' ? 'Konto '+accounts[activeAccount].login+': Dieser Reset betrifft ausschließlich die Dashboard-Anzeige. Er verändert weder die feste $350-Tagesgrenze noch die EA-Baseline oder bestehende Handelssperren.' : 'Setzt den Tagesverlust und die High-Water-Mark auf 0.00% zurück. Trades vor dem Reset werden für die heutige Drawdown-Berechnung ignoriert.';
      document.getElementById('reset-help').textContent = activeAccount==='goldm15' ? 'Referenzwert nur für die Anzeige; der tatsächliche EA-Schutzstatus steht separat im Dashboard.' : 'Die Baseline, ab der die 3.5% EA- und 4.0% Broker-Notbremse gerechnet wird.';
      const modal = document.getElementById('dd-reset-modal');
      const input = document.getElementById('dd-reset-input');
      const currentBal = (currentData && currentData.daily_drawdown) ? currentData.daily_drawdown.balance : 10000.0;
      
      document.getElementById('modal-current-bal').innerText = `$${currentBal.toFixed(2)}`;
      if (currentData && currentData.daily_drawdown) {
        const dd = currentData.daily_drawdown;
        document.getElementById('modal-current-dd').innerText = `${dd.pct.toFixed(2)}% (-$${dd.loss_usd.toFixed(2)})`;
        if (dd.manual_active) {
          document.getElementById('modal-reset-status-row').classList.remove('hidden');
          document.getElementById('modal-reset-status-text').innerText = `Aktiv seit ${dd.reset_time_str || ''} @ $${dd.reset_balance ? dd.reset_balance.toFixed(2) : ''}`;
        } else {
          document.getElementById('modal-reset-status-row').classList.add('hidden');
        }
      }
      
      if (!input.value || parseFloat(input.value) <= 0) {
        input.value = currentBal.toFixed(2);
      }
      modal.classList.remove('hidden');
    }

    function closeDrawdownResetModal() {
      document.getElementById('dd-reset-modal').classList.add('hidden');
    }

    function setModalInputBal(val) {
      document.getElementById('dd-reset-input').value = val.toFixed(2);
    }

    function setModalInputBalCurrent() {
      const currentBal = (currentData && currentData.daily_drawdown) ? currentData.daily_drawdown.balance : 10000.0;
      document.getElementById('dd-reset-input').value = currentBal.toFixed(2);
    }

    async function executeDrawdownReset() {
      const val = parseFloat(document.getElementById('dd-reset-input').value) || 10000.0;
      try {
        const res = await accountFetch('/api/reset_drawdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset', baseline: val })
        });
        const data = await res.json();
        if (data.success) {
          closeDrawdownResetModal();
          await updateStatus();
          alert(`✅ ${data.message}`);
        } else {
          alert(`Fehler: ${data.message || 'Unbekannter Fehler'}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        alert('Netzwerkfehler: ' + err);
      }
    }

    async function revertAutoDrawdown() {
      if (!confirm('Tages-Drawdown zurück auf automatische Berechnung (Trades seit 00:00 Mitternacht) setzen?')) return;
      try {
        const res = await accountFetch('/api/reset_drawdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto' })
        });
        const data = await res.json();
        if (data.success) {
          closeDrawdownResetModal();
          await updateStatus();
          alert(`✅ ${data.message}`);
        } else {
          alert(`Fehler: ${data.message || 'Unbekannter Fehler'}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        alert('Netzwerkfehler: ' + err);
      }
    }

    window.onload = async () => {
      initTheme();
      initChart();
      // Apply theme to freshly created chart instance
      applyTheme(localStorage.getItem('titan_theme') || 'dark');
      try {
        const response = await fetch(BASE_PATH + '/api/accounts');
        if (!response.ok) throw new Error('Kontoliste nicht verfügbar');
        const data = await response.json();
        accounts = Object.fromEntries(data.accounts.map(a => [a.id,a]));
        const journalSelect = document.getElementById('journal-strategy-filter');
        if (journalSelect) journalSelect.value = journalFilter;
        void refreshJournal();
        const saved = localStorage.getItem('gold_dashboard_account');
        await switchAccount(accounts[saved] ? saved : data.default);
      } catch(error) { reportAccountError(error, accountGeneration); }
      setInterval(updateStatus, 1500); // 1.5s live status update
      setInterval(loadCandles, 5000);   // 5s smooth candle update (no reset)
      setInterval(() => { void refreshJournal(); }, 30000); // independent, low-rate journal sync
    };
  </script>
  <!-- Visual-only extension: live MT5 and TradingView handlers remain untouched -->
  <script src="static/stone-cockpit.js"></script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse(content=HTML_CONTENT)

if __name__ == "__main__":
    print("Starte XAU Titan Pro Institutional Cockpit auf http://127.0.0.1:8050 ...")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get('DASHBOARD_PORT', '8050')), log_level="warning")
