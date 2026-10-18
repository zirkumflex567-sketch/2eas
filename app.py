import os
import re
import sys
import time
import threading
import math
import json
import hmac
from collections import defaultdict, deque
from urllib.parse import urlsplit
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
import webbrowser
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, Annotated

import pandas as pd
import numpy as np
import MetaTrader5 as mt5
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, FiniteFloat, Field, StrictBool, field_validator, model_validator
import uvicorn
import dd_persistence
import journal_accounting
import broker_clock
import broker_telemetry
from metrics_cache import ClosedBarMetricsCache
from pathlib import Path
from account_gateway import ACCOUNTS, config_path, public_account, scoped, selected, verify_identity, writes_titan_reset
from goldm15_dashboard import GUARD_FILE, metrics as gold_metrics, parameters as gold_parameters, read_guard, wilder_rsi
from chart_studio.money import PreviewError, drawdown_projection, preview_scenario
from chart_studio.broker_reads import broker_symbol, legacy_quote, require_symbol
from chart_studio.read_api import install_read_routes, Symbol
from chart_studio.preview_api import install_preview_routes
from chart_studio.position_commit_api import install_position_commit_routes
from chart_studio.trade_ticket_api import install_trade_ticket_routes
from chart_studio.trade_ticket import TradeTicketPreviewRegistry, TradeTicketPreviewService
from chart_studio.evidence_api import install_evidence_routes
from chart_studio.indicator_extension_api import install_indicator_extension_routes
from dashboard_security import install_control_security
from chart_studio.workspaces import WorkspaceStore, StoreError, WorkspaceMissing, RevisionConflict
from chart_studio.device_sync import (DeviceSyncStore, DeviceSyncError,
                                      DeviceSyncMissing, DeviceSyncConflict,
                                      validate_envelope)
from functools import lru_cache
from dashboard_runtime import install_runtime
from mobile_views import MOBILE_HTML, ASCII_HTML

_dashboard_env = Path.home() / '.dashboard-env.json'
if _dashboard_env.is_file():
    try:
        with open(_dashboard_env, 'r', encoding='utf-8-sig') as _f:
            for _k, _v in json.load(_f).items():
                if _k not in os.environ and isinstance(_v, str):
                    os.environ[_k] = _v
    except Exception:
        pass

app = FastAPI(title="XAU Titan Pro - Institutional Live Cockpit")
install_control_security(app)
BASE_DIR = Path(__file__).resolve().parent
install_runtime(app, BASE_DIR)
install_read_routes(app, mt5)
install_preview_routes(app, mt5)
install_position_commit_routes(app, mt5, enabled=False)
_trade_ticket_previews = TradeTicketPreviewRegistry()
_trade_ticket_preview_service = TradeTicketPreviewService(
    mt5, _trade_ticket_previews, guard_provider=None,
)
install_trade_ticket_routes(
    app, mt5, enabled=False, preview_registry=_trade_ticket_previews,
    preview_service=_trade_ticket_preview_service,
)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / 'static')), name="static")


@app.middleware("http")
async def dashboard_cache_policy(request: Request, call_next):
    response = await call_next(request)
    content_type = response.headers.get('content-type', '').lower()
    if content_type.startswith('text/html'):
        response.headers['Cache-Control'] = 'no-store'
    else:
        request_path = request.url.path
        proxy_prefix = os.environ.get('DASHBOARD_PROXY_PREFIX', '/stt')
        if proxy_prefix and request_path.startswith(proxy_prefix + '/'):
            request_path = request_path[len(proxy_prefix):]
        if request_path.startswith('/static/'):
            # Keep validators (ETag/Last-Modified), but require revalidation after deploys.
            response.headers['Cache-Control'] = 'private, no-cache'
    return response


install_evidence_routes(app, mt5=mt5)
install_indicator_extension_routes(app)

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
TIMEFRAME_SECONDS = {
    'M1': 60,
    'M5': 300,
    'M15': 900,
    'M30': 1800,
    'H1': 3600,
    'H4': 14400,
    'D1': 86400,
}
TERMINAL_PATH = r"C:\Program Files\PU Prime MT5 Terminal\terminal64.exe"

def ensure_mt5_init():
    # The request decorator holds the connection lock and explicitly attaches.
    return bool(verify_identity(mt5, selected()))


_MT5_READ_SPANS = {
    'copy_rates_from_pos': 'mt5_rates',
    'copy_rates_from': 'mt5_rates',
    'history_deals_get': 'mt5_history',
    'history_orders_get': 'mt5_history',
}


def _mt5_read(method, *args, **kwargs):
    span_name = _MT5_READ_SPANS.get(method)
    if span_name is None:
        raise ValueError('unsupported MT5 read for telemetry')
    with broker_telemetry.span(span_name):
        return getattr(mt5, method)(*args, **kwargs)

class ModifyPositionRequest(BaseModel):
    ticket: Annotated[int, Field(gt=0, strict=True)]
    sl_usd: Optional[FiniteFloat] = None
    tp_usd: Optional[FiniteFloat] = None
    sl_price: Optional[Annotated[FiniteFloat, Field(ge=0)]] = None
    tp_price: Optional[Annotated[FiniteFloat, Field(ge=0)]] = None
    # Explicit price 0 or remove_* removes; USD 0 sets break-even, never removes.
    remove_sl: StrictBool = False
    remove_tp: StrictBool = False

    @model_validator(mode='after')
    def exclusive_operations(self):
        for side in ('sl', 'tp'):
            usd, price = getattr(self, side+'_usd'), getattr(self, side+'_price')
            if sum((usd is not None, price is not None, getattr(self, 'remove_'+side))) > 1:
                raise ValueError(f'{side}: USD, Preis und Entfernen schließen sich aus.')
        return self

class ChartScenarioPreviewRequest(BaseModel):
    account: str
    symbol: str
    side: str
    volumeLots: Optional[FiniteFloat] = None
    entryPrice: float
    slPrice: float
    tpPrice: float
    riskBudget: Optional[FiniteFloat] = None
    riskPercent: Optional[FiniteFloat] = None
    feesPerLot: FiniteFloat = Field(default=0, ge=0, le=10_000)
    slippageTicks: Annotated[int, Field(strict=True, ge=0, le=1000)] = 0

    @field_validator('symbol')
    @classmethod
    def verified_symbol_name(cls, value):
        return broker_symbol(value)

    @field_validator('volumeLots', 'riskBudget', 'riskPercent', 'feesPerLot', 'entryPrice', 'slPrice', 'tpPrice', mode='before')
    @classmethod
    def numeric_not_boolean(cls, value):
        if value is not None and (isinstance(value, bool) or type(value) not in (int, float)):
            raise ValueError('Numerische Werte müssen JSON-Zahlen sein.')
        return value

    @model_validator(mode='after')
    def exactly_one_sizing_mode(self):
        if sum(value is not None for value in (self.volumeLots, self.riskBudget, self.riskPercent)) != 1:
            raise ValueError('Genau Lots, Risikobudget oder Equity-Prozent angeben.')
        return self


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
    ticket: Annotated[int, Field(gt=0, strict=True)]
    volume: Optional[Annotated[FiniteFloat, Field(gt=0)]] = None

class ResetDrawdownRequest(BaseModel):
    action: Literal['reset', 'auto'] = 'reset'
    baseline: Optional[Annotated[FiniteFloat, Field(gt=0)]] = None

# --- DAILY DRAWDOWN CONFIG PERSISTENCE ---
DD_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drawdown_config.json")
COMMON_FILES_DIR = os.path.expanduser(r"~\AppData\Roaming\MetaQuotes\Terminal\Common\Files")

def load_dd_config():
    try:
        targets = drawdown_config_targets()
        dd_persistence.recover(targets)
        return dd_persistence.load(targets[0])
    except (OSError, ValueError) as exc:
        raise HTTPException(503, 'Drawdown-Konfiguration ungültig oder nicht lesbar.') from exc


def drawdown_config_targets():
    targets = [config_path(BASE_DIR)]
    if writes_titan_reset():
        targets.append(Path(COMMON_FILES_DIR) / 'titan_dd_reset.json')
    return targets


def save_dd_config(cfg):
    try:
        return dd_persistence.save(cfg, drawdown_config_targets())
    except (OSError, ValueError) as exc:
        raise HTTPException(503, str(exc)) from exc

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
GOLD_METRICS_CACHE = ClosedBarMetricsCache()
QUOTE_MAX_AGE_SECONDS = 30.0
QUOTE_FUTURE_TOLERANCE_SECONDS = 5.0


def quote_metadata(tick, now=None):
    """Broker epoch UTC versus wall time, not request/EA heartbeat proof."""
    now = time.time() if now is None else now
    try:
        configured_age = float(os.getenv('DASHBOARD_QUOTE_MAX_AGE_SECONDS', QUOTE_MAX_AGE_SECONDS))
    except (TypeError, ValueError):
        configured_age = QUOTE_MAX_AGE_SECONDS
    max_age = min(configured_age, QUOTE_MAX_AGE_SECONDS) if math.isfinite(configured_age) and configured_age > 0 else QUOTE_MAX_AGE_SECONDS
    raw_stamp = getattr(tick, 'time', None)
    try:
        offset = broker_clock.offset_seconds(selected())
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    stamp = raw_stamp-offset if isinstance(raw_stamp,(int,float)) and not isinstance(raw_stamp,bool) else None
    valid = isinstance(stamp, (int, float)) and not isinstance(stamp, bool) and math.isfinite(stamp) and stamp > 0
    if valid:
        try:
            datetime.fromtimestamp(stamp, timezone.utc)
        except (ValueError, OverflowError, OSError):
            valid = False
    age = now-stamp if valid else None
    if age is not None and not math.isfinite(age):
        age = None
    prices_valid = all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0
                       for v in (getattr(tick, 'bid', None), getattr(tick, 'ask', None)))
    fresh = age is not None and -QUOTE_FUTURE_TOLERANCE_SECONDS <= age <= max_age and prices_valid
    return dict(source_fresh=bool(fresh), quote_time_epoch=stamp if valid else None,
                quote_broker_time_epoch=raw_stamp if valid else None, broker_utc_offset_seconds=offset,
                quote_age_seconds=age, source_status='fresh' if fresh else ('stale' if valid else 'unknown'),
                quote_max_age_seconds=max_age,
                quote_future_tolerance_seconds=QUOTE_FUTURE_TOLERANCE_SECONDS)


def require_fresh_quote(tick, now=None, risk_context=None):
    meta = quote_metadata(tick, now)
    if not meta['source_fresh']:
        detail = dict(meta, risk_status='unknown', message='Broker-Quote veraltet/ungültig; Live-Risiko unbekannt.')
        if risk_context is not None:
            detail['daily_drawdown'] = dict(risk_context, risk_status='unknown')
        raise HTTPException(503, detail)
    return meta


def risk_day_context(now, reset_hour, cfg):
    """The risk policy clock is wall UTC; a frozen quote cannot retain resets."""
    offset = broker_clock.offset_seconds(selected())
    wall = datetime.fromtimestamp(now+offset, timezone.utc)
    shifted = wall-timedelta(hours=reset_hour)
    broker_midnight = shifted.replace(hour=0, minute=0, second=0, microsecond=0)+timedelta(hours=reset_hour)
    midnight = broker_midnight-timedelta(seconds=offset)
    day = shifted.date().isoformat()
    stamp = cfg.get('reset_timestamp')
    requested = cfg.get('manual_reset_active', False)
    active = bool(requested and stamp and midnight.timestamp() <= stamp <= now and cfg.get('reset_date') == day)
    return dict(manual_active=active, manual_expired=bool(requested and not active),
                risk_day=day, risk_timezone=broker_clock.zone_label(selected()), risk_reset_hour=reset_hour), midnight


def current_daily_drawdown(mt5_client, account_info, tick, now, params=None, dd_cfg=None):
    """Read only the fresh inputs needed for today's dashboard DD estimate."""
    if not tick or not account_info:
        raise HTTPException(503, 'MT5-Quote/Kontodaten für Tages-DD fehlen.')
    current_account = selected()
    params = gold_parameters() if current_account['id'] == 'goldm15' else params
    reset_hour = int(params['RiskResetHourServer']) if params else 0
    dd_cfg = load_dd_config() if dd_cfg is None else dd_cfg
    risk_context, midnight_dt = risk_day_context(now, reset_hour, dd_cfg)
    source_meta = require_fresh_quote(tick, now, risk_context)
    if not all(math.isfinite(v) and v > 0 for v in (account_info.balance, account_info.equity)):
        raise HTTPException(503, 'Kontorisikodaten sind ungültig/unbekannt.')

    manual_active = risk_context['manual_active']
    reset_ts = dd_cfg.get('reset_timestamp')
    reset_bal = dd_cfg.get('reset_balance', 10000.0)
    from_dt = max(midnight_dt, datetime.fromtimestamp(reset_ts, timezone.utc)) if manual_active and reset_ts else midnight_dt
    offset = broker_clock.offset_seconds(selected())
    deals = require_mt5_data(_mt5_read('history_deals_get',
        from_dt + timedelta(seconds=offset),
        datetime.fromtimestamp(now, timezone.utc) + timedelta(seconds=offset)), 'daily_history')
    realized_today = 0.0
    if deals:
        for deal in deals:
            if deal.type in (mt5_client.DEAL_TYPE_BUY, mt5_client.DEAL_TYPE_SELL):
                if current_account['id'] == 'titan_m5' and getattr(deal, 'magic', 0) != 881122:
                    continue
                realized_today += deal.profit + deal.swap + deal.commission + getattr(deal, 'fee', 0.)
    day_start_bal = float(reset_bal) if manual_active and reset_ts else account_info.balance - realized_today
    if not all(math.isfinite(v) for v in (realized_today, day_start_bal)) or day_start_bal <= 0:
        raise HTTPException(503, 'Tageshistorie/-baseline ist ungültig; Risiko unbekannt.')
    daily_ref = max(day_start_bal, account_info.balance)
    daily_loss = max(0.0, daily_ref - account_info.equity)
    challenge_protection = current_account.get('challenge_protection') is True
    ea_limit_pct, broker_limit_pct = (3.5, 4.0) if challenge_protection else (None, None)
    daily_drawdown = {
        'loss_usd': round(daily_loss, 2),
        'pct': round(100 * daily_loss / daily_ref, 2),
        'limit_pct': ea_limit_pct,
        'broker_limit_pct': broker_limit_pct,
        'buffer_usd': round(max(0.0, daily_ref * ea_limit_pct / 100 - daily_loss), 2) if challenge_protection else None,
        'buffer_broker_usd': round(max(0.0, daily_ref * broker_limit_pct / 100 - daily_loss), 2) if challenge_protection else None,
        'day_start_bal': round(day_start_bal, 2),
        'daily_ref': round(daily_ref, 2),
        'balance': round(account_info.balance, 2),
        'equity': round(account_info.equity, 2),
        'realized_today': round(realized_today, 2),
        'manual_active': manual_active,
        'manual_expired': bool(dd_cfg.get('manual_reset_active', False) and not manual_active),
        'challenge_protection': challenge_protection,
        'risk_day': risk_context['risk_day'],
        'risk_timezone': risk_context['risk_timezone'],
        'risk_reset_hour': reset_hour,
        'reset_balance': round(float(reset_bal), 2) if manual_active else None,
        'reset_time_str': datetime.fromtimestamp(reset_ts, timezone.utc).strftime('%H:%M:%S') if manual_active and reset_ts else None,
    }
    guard = None
    if selected()['id'] == 'goldm15':
        guard = read_guard(GUARD_FILE, broker_clock.to_broker_epoch(now, selected()), account_info.equity,
                           params, balance=account_info.balance)
        if guard['baseline_verified'] and not manual_active:
            daily_loss = max(0, guard['baseline'] - min(account_info.balance, account_info.equity))
            daily_drawdown.update(loss_usd=round(daily_loss, 2),
                                  pct=round(100 * daily_loss / params['InitialBalanceUSD'], 2),
                                  daily_ref=guard['baseline'], day_start_bal=guard['baseline'],
                                  buffer_usd=round(guard['daily_buffer_usd'], 2))
    return daily_drawdown, source_meta, guard


def require_mt5_data(data, source):
    if data is None:
        error = mt5.last_error() if hasattr(mt5, 'last_error') else None
        raise HTTPException(503, {'source': source, 'message': 'MT5-Abfrage fehlgeschlagen; Daten unbekannt.', 'mt5_error': error})
    return data


def get_cached_trade_journal(account_id, server_time, local_time, ema9=None):
    # Called inside the account-verified MT5 lock. Never used for trade/risk writes.
    now = time.monotonic()
    if (account_id in JOURNAL_CACHE and
            now - JOURNAL_CACHE_AT.get(account_id, -1e12) < JOURNAL_CACHE_TTL_SEC):
        return JOURNAL_CACHE[account_id]
    entries = build_trade_journal(account_id, server_time, local_time, ema9)
    JOURNAL_CACHE[account_id] = entries
    JOURNAL_CACHE_AT[account_id] = now
    return entries

def journal_metadata(account_id):
    return {'cutoff_utc': journal_accounting.CUTOFF.isoformat(),
            'cutoff_label': 'Aufzeichnung seit 08.10.2026 23:00 UTC (09.10.2026 01:00 Europe/Berlin)',
            'timezone': 'Europe/Berlin', 'timestamp_basis': broker_clock.zone_label(selected()) + ' → UTC', 'broker_utc_offset_seconds': broker_clock.offset_seconds(selected()),
            'snapshot_age_seconds': max(0., time.monotonic()-JOURNAL_CACHE_AT.get(account_id, time.monotonic()))}


def journal_magics(account_id):
    if account_id in ('titan', 'xau5m_500', 'titan_500_2'):
        return lambda m: True  # Closed-source Marketplace EA: account is dedicated; magic is not a reliable filter.
    if account_id in ('titan', 'titan_m5'):
        return {881122}  # XAU_Titan_Pro.mq5 and committed .set reference
    elif account_id == 'titan_25k':
        return {881125, 881122}
    elif account_id == 'goldm15':
        base = int(gold_parameters()['MagicBase'])
        return {base+1, base+2, base+3}
    elif account_id in ('blueberry', 'xau5m_m5', 'xau5m_m15', 'xau5m_500', 'titan_500_2'):
        return lambda m: True  # Dedicated account: all trades belong to account
    return set()


def explain_trade_entry(p_type, magic=None, comment=None, account_id='titan', verified=False):
    is_sell = (p_type == 'SELL' or p_type == getattr(mt5, 'ORDER_TYPE_SELL', 1) or p_type == getattr(mt5, 'DEAL_TYPE_SELL', 1))
    side_str = "Short" if is_sell else "Long"
    comment_str = str(comment or '')

    if account_id in ('titan', 'xau5m_500', 'titan_500_2'):
        base = f"Einstieg {side_str}: EA-Strategie unbekannt (Marketplace-EA, EX5 ohne Quellcode)."
        return base + (" Broker-Kommentar: " + comment_str if comment_str else "")

    if magic in (881122, 881125) or 'Titan' in comment_str or account_id in ('titan', 'blueberry', 'titan_m5', 'titan_25k'):
        if is_sell:
            base = (
                "Titan Pro M15 Trendfolge (Short): Kurs notiert unter EMA50 mit intaktem bärischem EMA9 < EMA21 Fächer "
                "und RSI(14) <= 50 Momentum-Bestätigung. Anti-Trap Guard aktiv (Überdehnung < 1.8 ATR, max. 3 Climax-Bars, S/R-Freiraum eingehalten)."
            )
        else:
            base = (
                "Titan Pro M15 Trendfolge (Long): Kurs notiert über EMA50 mit intaktem bullischem EMA9 > EMA21 Fächer "
                "und RSI(14) >= 50 Momentum-Bestätigung. Anti-Trap Guard aktiv (Überdehnung < 1.8 ATR, max. 3 Climax-Bars, S/R-Freiraum eingehalten)."
            )
    elif account_id in ('xau5m_m5', 'xau5m_m15', 'xau5m_500', 'titan_500_2'):
        base = f"XAUUSD 5M EA Scalping ({side_str}): Signal nach 5-Minuten-Marktmomentum."
    elif account_id == 'goldm15':
        base = f"M15 Multi-Slot Momentum / Trend-Reversal ({side_str})."
    else:
        base = f"M15 Strategie-Signal ({side_str})."

    if not verified:
        base += " (MT5-Entscheidungs-Tickfile: extern/unbekannt)."
    return base


def explain_trade_exit(status, p_type, sl_price=0.0, tp_price=0.0, profit_usd=0.0,
                       deal_reason=None, magic=None, comment=None, account_id='titan', close_price=None,
                       volume=0.01, ema9=None, current_price=None, timeframe=None):
    if status == 'OPEN':
        if account_id in ('titan', 'xau5m_500', 'titan_500_2'):
            facts = []
            if sl_price and sl_price > 0: facts.append(f"Broker-SL bei ${sl_price:.2f}")
            if tp_price and tp_price > 0: facts.append(f"Broker-TP bei ${tp_price:.2f}")
            return "EA-Ausstiegsregeln unbekannt (Marketplace-EA, EX5 ohne Quellcode). " + ("; ".join(facts) if facts else "Kein Broker-SL/TP gesetzt.")
        sl_desc = f"${sl_price:.2f}" if (sl_price and sl_price > 0) else "Kein fixer SL"
        tp_desc = f"${tp_price:.2f}" if (tp_price and tp_price > 0) else "Dynamic Runner (kein starres TP)"

        acc_meta = ACCOUNTS.get(account_id, {})
        tf_str = timeframe or acc_meta.get('timeframe', 'M15')

        # Base Titan logic targets 280 points.
        # On 0.01 lot -> $28.00. On 0.04 lot (e.g. 25k account) -> $112.00 ($28 * 4).
        vol = float(volume) if volume and volume > 0 else 0.01
        target_usd = round(28.0 * (vol / 0.01), 2)
        if target_usd <= 0:
            target_usd = 28.0

        ema_info = ""
        if ema9 is not None and math.isfinite(ema9) and ema9 > 0:
            if current_price and current_price > 0:
                dist = abs(current_price - ema9)
                side_info = "unter Kurs" if ema9 < current_price else "über Kurs"
                ema_info = f" (Aktuell ${ema9:.2f} · Abstand: {dist:.2f} Pkt {side_info})"
            else:
                ema_info = f" (Aktuell ${ema9:.2f})"

        pnl_status = ""
        if profit_usd is not None and math.isfinite(profit_usd):
            if profit_usd >= target_usd:
                pnl_status = f" [✅ Mindestgewinn erreicht: +${profit_usd:.2f} >= ${target_usd:.0f} · Ausstieg scharf bei EMA9-Schnitt]"
            else:
                diff_to_target = target_usd - profit_usd
                sign_str = f"+${profit_usd:.2f}" if profit_usd >= 0 else f"-${abs(profit_usd):.2f}"
                pnl_status = f" [⏳ Mindestgewinn noch offen: {sign_str} / ${target_usd:.0f}, noch ${diff_to_target:.2f}]"

        runner_rule = (
            f"🎯 Dynamic Runner (Hauptziel): Schließt im Gewinn an {tf_str} EMA9{ema_info}, "
            f"sobald Mindestgewinn >= ${target_usd:.0f} (280 Pkt) erreicht ist und das Momentum abflacht{pnl_status}."
        )

        rules = [
            runner_rule,
            f"🛡️ Swing Stop-Loss: Gesichert bei {sl_desc} (48-Kerzen / 12h Swing-Struktur mit Sicherheitsabstand).",
            "🔒 Break-Even: Zieht ab $40.00 Buchgewinn den SL automatisch auf +$15.00 nach."
        ]
        if account_id == 'blueberry':
            rules.append("⚠️ Blueberry Notbremse: Sofortiger Hard-Close bei 3.5% Tagesverlust ($350) oder $9.100 Kontoboden.")
        elif account_id == 'titan_25k':
            rules.append("⚠️ 25k Notbremse: Hard-Floor Cutoff bei $23.000 Kontowert.")
        else:
            rules.append("⚠️ Kontoschutz: Hard-Cutoff bei 3.5% Daily Drawdown.")

        rules.append("(Exakter Ausstiegs-Tick im Voraus marktbedingt variabel/unbekannt).")
        return " | ".join(rules)
    else:
        # CLOSED deal:
        sl_val = getattr(mt5, 'DEAL_REASON_SL', 4)
        tp_val = getattr(mt5, 'DEAL_REASON_TP', 5)
        exp_val = getattr(mt5, 'DEAL_REASON_EXPERT', 3)
        cli_val = getattr(mt5, 'DEAL_REASON_CLIENT', 0)
        so_val = getattr(mt5, 'DEAL_REASON_SO', 6)

        pnl_str = f"+${profit_usd:.2f}" if profit_usd is not None and profit_usd >= 0 else f"-${abs(profit_usd):.2f}" if profit_usd is not None else ""
        close_str = f" bei ${close_price:.2f}" if close_price is not None else ""

        if deal_reason == sl_val:
            return f"Stop Loss ausgelöst: Struktureller Swing-SL getroffen{close_str} ({pnl_str}). (Deal-Grund: SL/unbekannt im Voraus)."
        elif deal_reason == tp_val:
            return f"Take Profit ausgelöst: Kursziel erreicht{close_str} ({pnl_str})."
        elif deal_reason == exp_val:
            if account_id in ('titan', 'xau5m_500', 'titan_500_2'):
                return f"EA hat die Position geschlossen; interne Ausstiegsregel unbekannt ({pnl_str})."
            if profit_usd is not None and profit_usd > 0:
                return f"Dynamic Runner Exit an EMA9: Gewinnmitnahme durch EA ({pnl_str})."
            else:
                return f"EA Notaus / Schutz-Schließung durch EA Guardian ({pnl_str})."
        elif deal_reason == cli_val:
            return f"Manuelle Schließung über Terminal oder Dashboard ({pnl_str})."
        elif deal_reason == so_val:
            return f"Broker Stop Out (Margin Call) ({pnl_str})."
        else:
            return f"Position geschlossen durch EA / Broker-Routing ({pnl_str}). (Ausstiegs-Tick im Voraus unbekannt)."


def build_trade_journal(account_id, server_time, local_time, ema9=None):
    if server_time.tzinfo is None:
        server_time = server_time.replace(tzinfo=timezone.utc)
    sym_name = ACCOUNTS.get(account_id, {}).get('symbol', 'XAUUSD')
    acc_tf_str = ACCOUNTS.get(account_id, {}).get('timeframe', 'M15')
    if ema9 is None:
        try:
            acc_tf = TIMEFRAME_MAP.get(acc_tf_str, getattr(mt5, 'TIMEFRAME_M15', 15))
            rates = _mt5_read('copy_rates_from_pos', sym_name, acc_tf, 0, 50)
            if rates is not None and len(rates) >= 15:
                closes = pd.Series([r['close'] for r in rates])
                ema9 = float(closes.ewm(span=9, adjust=False).mean().iloc[-1])
        except Exception:
            ema9 = None
    deals = require_mt5_data(_mt5_read('history_deals_get',
        journal_accounting.CUTOFF+timedelta(seconds=broker_clock.offset_seconds(selected())),
        server_time+timedelta(seconds=broker_clock.offset_seconds(selected()))), 'journal_history')
    positions = require_mt5_data(mt5.positions_get(symbol=sym_name), 'journal_positions')
    magics = journal_magics(account_id)
    slot_by_magic = {m:i+1 for i,m in enumerate(sorted(magics))} if (account_id=='goldm15' and isinstance(magics, (set, list))) else {}
    strategy = ACCOUNTS[account_id]['name']
    entries = []
    for p in positions:
        # Recording cutoff limits realized history, never currently open risk.
        if not journal_accounting.owns(p, magics):
            continue
        open_price, cur_price = round(float(p.price_open),2), round(float(p.price_current),2)
        net = round(float(p.profit+p.swap),2)
        p_type_str = 'BUY' if p.type == mt5.ORDER_TYPE_BUY else 'SELL'
        sl_val = round(float(p.sl), 2)
        tp_val = round(float(p.tp), 2)
        vol = float(p.volume)
        target_usd = None if account_id in ('titan', 'xau5m_500', 'titan_500_2') else round(28.0 * (vol / 0.01), 2)
        dist_ema9 = round(abs(cur_price - ema9), 2) if (ema9 is not None and math.isfinite(ema9)) else None
        why_trig = explain_trade_entry(p_type_str, magic=p.magic, comment=getattr(p, 'comment', None), account_id=account_id)
        prof_goal = explain_trade_exit('OPEN', p_type_str, sl_price=sl_val, tp_price=tp_val,
                                       profit_usd=net, magic=p.magic, comment=getattr(p, 'comment', None),
                                       account_id=account_id, volume=vol, ema9=ema9,
                                       current_price=cur_price, timeframe=acc_tf_str)
        entries.append({
            'ticket': int(p.ticket), 'time_ts': int(p.time),
            'strategy': strategy, 'account': account_id, 'status': 'OPEN',
            'symbol': p.symbol, 'magic': p.magic,
            'slot': slot_by_magic.get(p.magic),
            'type': p_type_str,
            'volume': vol, 'open_price': open_price, 'current_price': cur_price,
            'points': round((cur_price-open_price) if p.type == mt5.ORDER_TYPE_BUY else (open_price-cur_price),2),
            'sl_price': sl_val, 'tp_price': tp_val,
            'profit_usd': net, 'net_profit_usd': net, 'gross_profit_usd': round(float(p.profit),2),
            'pnl_basis': 'unrealized_profit_plus_swap; entry costs excluded',
            'reason_verified': False, 'why_triggered': why_trig,
            'profit_goal': prof_goal,
            'ema9': round(float(ema9), 2) if (ema9 is not None and math.isfinite(ema9)) else None,
            'dist_to_ema9': dist_ema9,
            'target_usd': target_usd,
            **journal_accounting.times(p.time, broker_clock.offset_seconds(selected()))
        })
    by_position = {}
    for d in {int(d.ticket):d for d in deals}.values():
        if getattr(d, 'symbol', None) in (sym_name, 'XAUUSD', 'XAUUSD.p', 'XAUUSD.pi') and d.entry != mt5.DEAL_ENTRY_IN:
            by_position.setdefault(d.position_id, []).append(d)
    for position_id, exits in by_position.items():
        lifecycle = require_mt5_data(_mt5_read('history_deals_get', position=position_id), 'journal_position_history')
        lifecycle = [d for d in lifecycle if getattr(d,'position_id',None)==position_id]
        accounting = journal_accounting.close_accounting(lifecycle + exits, mt5, magics)
        for d in exits:
            if broker_clock.to_utc_epoch(d.time, selected()) < journal_accounting.CUTOFF.timestamp() or d.ticket not in accounting:
                continue
            row = accounting[d.ticket]
            cp, op = round(float(d.price),2), row['open_price']
            orig_type = row.get('type') or ('BUY' if getattr(d, 'type', None) == mt5.DEAL_TYPE_BUY else 'SELL')
            why_trig = explain_trade_entry(orig_type, magic=getattr(d, 'magic', None), comment=getattr(d, 'comment', None), account_id=account_id)
            prof_goal = explain_trade_exit('CLOSED', orig_type, profit_usd=row['net_profit_usd'], deal_reason=getattr(d, 'reason', None),
                                           magic=getattr(d, 'magic', None), comment=getattr(d, 'comment', None), account_id=account_id, close_price=cp)
            entries.append({
                'ticket': int(d.ticket), 'time_ts': int(d.time),
                'strategy': strategy, 'account': account_id, 'status': 'CLOSED',
                'symbol': d.symbol, 'magic': d.magic, 'position_id': position_id,
                'slot': slot_by_magic.get(row.get('ownership_magic')),
                'close_price': cp,  # Attributable volume comes from accounting, not the whole deal.
                'points': None if op is None else round(cp-op if row['type']=='BUY' else op-cp,2),
                'profit_usd': row['net_profit_usd'], 'pnl_basis': 'realized_net_with_allocated_entry_costs',
                'reason_verified': False, 'why_triggered': why_trig,
                'profit_goal': prof_goal,
                **row, **journal_accounting.times(d.time, broker_clock.offset_seconds(selected()))
            })
    entries.sort(key=lambda x: x['time_ts'], reverse=True)
    return entries

def get_live_market_data(include_journal=True):
    if not ensure_mt5_init():
        return None

    current_acc = selected()
    acc_id = current_acc['id']
    sym_name = current_acc.get('symbol', 'XAUUSD')
    acc_tf_str = current_acc.get('timeframe', 'M15')
    acc_tf = TIMEFRAME_MAP.get(acc_tf_str, getattr(mt5, 'TIMEFRAME_M15', 15))
    init_bal = float(current_acc.get('initial_balance', 10000.0))

    sym = mt5.symbol_info(sym_name)
    tick = mt5.symbol_info_tick(sym_name)
    acc = mt5.account_info()
    now = time.time()
    if not sym or not tick or not acc:
        return None
    params = gold_parameters() if selected()['id']=='goldm15' else None
    dd_cfg = load_dd_config()
    daily_drawdown, source_meta, guard = current_daily_drawdown(mt5, acc, tick, now, params, dd_cfg)
    wall_time = datetime.fromtimestamp(now, timezone.utc)

    rates = _mt5_read('copy_rates_from_pos', sym_name, acc_tf, 0, 5000 if acc_id == 'goldm15' else 1000)
    if rates is None or len(rates) < 200:
        return None

    df = pd.DataFrame(rates)
    df['dt'] = pd.to_datetime(df['time'], unit='s')

    bar_duration = TIMEFRAME_SECONDS.get(acc_tf_str.upper(), 900)
    tick_epoch = int(tick.time)
    current_bar_start = (tick_epoch // bar_duration) * bar_duration

    if int(df.iloc[-1]['time']) < current_bar_start:
        cur_price = float(tick.bid) if tick and hasattr(tick, 'bid') and tick.bid else float(df.iloc[-1]['close'])
        forming_row = pd.DataFrame([{
            'time': current_bar_start,
            'open': cur_price,
            'high': cur_price,
            'low': cur_price,
            'close': cur_price,
            'tick_volume': 1,
            'spread': getattr(sym, 'spread', 0) if sym else 0,
            'real_volume': 0,
            'dt': pd.to_datetime(current_bar_start, unit='s')
        }])
        df = pd.concat([df, forming_row], ignore_index=True)

    # Indicators
    df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()  # UI EMA20; separate from EA ema21
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()

    # iRSI reference: Wilder smoothing; rolling RSI is not the same indicator.
    df['rsi14'] = wilder_rsi(df['close'].to_numpy(), 14)

    tr = pd.concat([df['high'] - df['low'], abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))], axis=1).max(axis=1)
    df['atr14'] = tr.rolling(14).mean()

    open_bar = df.iloc[-1]
    cur_bar = df.iloc[-2]  # Shift 1: closed-bar reference criteria.

    server_time = datetime.fromtimestamp(tick.time, timezone.utc)
    local_time = datetime.fromtimestamp(broker_clock.to_utc_epoch(tick.time, current_acc), timezone.utc).astimezone(journal_accounting.BERLIN)


    # Time/config alone cannot prove EA activity or execution permission.
    in_window = None

    bar_elapsed = tick_epoch % bar_duration
    bar_remaining = bar_duration - bar_elapsed
    if bar_remaining <= 0:
        bar_remaining = bar_duration

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

    # 3. Closed-bar reconstruction of committed Titan v7.10 reference defaults.
    # Not proof of attached EA inputs or execution permission.
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
    swing_lookback = df.iloc[-49:-4]  # EA closed rates[k=3..47], lookback 48
    recent_res = float(swing_lookback['high'].max()) if len(swing_lookback) > 0 else float(cur_bar['close']) + 10.0
    recent_sup = float(swing_lookback['low'].min()) if len(swing_lookback) > 0 else float(cur_bar['close']) - 10.0
    min_sr_room = 300 * float(getattr(sym, 'point', .01))
    sup_buffer = float(cur_bar['close'] - recent_sup)
    res_buffer = float(recent_res - cur_bar['close'])
    buy_c8_sr_ok = not (recent_res > cur_bar['close'] and res_buffer < min_sr_room)
    sell_c8_sr_ok = not (cur_bar['close'] > recent_sup and sup_buffer < min_sr_room)

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
            "name": f"5. Kerzen-Farbe ({acc_tf_str}-Bestätigung)",
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
            "current_val": f"Sup ${recent_sup:.2f} (Puffer ${sup_buffer:.2f}) · Res ${recent_res:.2f} (Puffer ${res_buffer:.2f})",
            "short_met": bool(sell_c8_sr_ok),
            "long_met": bool(buy_c8_sr_ok),
            "short_note": f"Genügend Support-Puffer (${sup_buffer:.2f} >= ${min_sr_room:.2f})" if sell_c8_sr_ok else f"Direkt auf Support: nur ${sup_buffer:.2f} Puffer (< ${min_sr_room:.2f})",
            "long_note": f"Genügend Widerstands-Puffer (${res_buffer:.2f} >= ${min_sr_room:.2f})" if buy_c8_sr_ok else f"Direkt unter Widerstand: nur ${res_buffer:.2f} Puffer (< ${min_sr_room:.2f})"
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
            trend_diagnosis = f"ANTI-TRAP AKTIV: Zu nah am Widerstand (${recent_res:.2f}, Puffer ${res_buffer:.2f} < ${min_sr_room:.2f}). Kauf in Supply gesperrt!"
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
            trend_diagnosis = f"ANTI-TRAP AKTIV: Zu nah am Support (${recent_sup:.2f}, Puffer ${sup_buffer:.2f} < ${min_sr_room:.2f}). Verkauf in Demand gesperrt!"
        else:
            trend_diagnosis = f"ALLE REGELN ERFÜLLT INKL. ANTI-TRAP SCHUTZ! Bereit für {acc_tf_str}-Schluss."

    trend_diagnosis = f'{acc_tf_str}-Schluss · Referenzkriterien: ' + trend_diagnosis + ' Live-EA-Freigabe unbekannt.'
    short_missing = trend_diagnosis
    indicators_only = current_acc.get('analysis_mode') == 'INDICATORS_ONLY'
    if indicators_only:
        trend_direction = None
        trend_name = 'Nur klassische Indikatoren'
        active_focus = None
        trend_diagnosis = 'EA-Strategie unbekannt · EMA/RSI sind reine Marktindikatoren und keine EA-Signale.'
        short_missing = trend_diagnosis
        rules_matrix = []
        sell_met_count = buy_met_count = total_rules = 0
        sell_readiness = buy_readiness = None

    # Positions
    pos_objects = mt5.positions_get(symbol=sym_name)
    if pos_objects is None:
        raise HTTPException(503, 'MT5-Positionen derzeit nicht verfügbar.')
    positions = []
    contract_size = sym.trade_contract_size

    for p in pos_objects:
        if acc_id == 'titan_m5' and getattr(p, 'magic', 0) != 881122:
            continue
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

        ema9_val = round(float(open_bar['ema9']), 2) if (pd.notnull(open_bar.get('ema9')) and math.isfinite(open_bar['ema9'])) else None
        dist_ema9 = round(abs(cp - ema9_val), 2) if ema9_val is not None else None
        target_usd = None if indicators_only else round(28.0 * (vol / 0.01), 2)

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
            "magic": getattr(p, 'magic', 0),
            "ema9": ema9_val,
            "dist_to_ema9": dist_ema9,
            "target_usd": target_usd
        })

    result = {
        **source_meta,
        "risk_status": "available",
        "analysis_mode": current_acc.get('analysis_mode', 'TITAN_REFERENCE'),
        "symbol": sym_name,
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
            "ema9": round(float(cur_bar['ema9']), 2) if (pd.notnull(cur_bar.get('ema9')) and math.isfinite(cur_bar['ema9'])) else None,
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
        "daily_drawdown": daily_drawdown
    }
    if include_journal:
        account_id = current_acc['id']
        entries = get_cached_trade_journal(account_id, wall_time, local_time, ema9=float(open_bar['ema9']) if pd.notnull(open_bar.get('ema9')) else None)
        result.update(journal=entries, journal_cache={account_id: entries}, journal_meta=journal_metadata(account_id))
    result.update(account=public_account(selected()), rule_count=len(rules_matrix), exit_goals=[], ea_guard=guard)
    preview = df.iloc[-1]
    result.update(
        signal_mode='INDICATORS_ONLY' if indicators_only else 'closed_bar_reference', signal_label='Nur Indikatoren · EA-Strategie unbekannt' if indicators_only else f'{acc_tf_str}-Schluss · Referenzrekonstruktion, keine EA-Freigabe',
        signal_bar_time=datetime.fromtimestamp(int(cur_bar['time']), timezone.utc).strftime('%H:%M'),
        signal_bar_time_utc=datetime.fromtimestamp(broker_clock.to_utc_epoch(int(cur_bar['time']), current_acc), timezone.utc).isoformat(),
        ea_execution_verified=False, ea_execution_status='unknown',
        signal_preview={'mode': 'indicators_only' if indicators_only else 'forming_bar_preview', 'label': 'EMA/RSI-Indikatoren · kein EA-Signal' if indicators_only else f'Laufende {acc_tf_str}-Kerze · unverbindliche Vorschau',
                        'close': float(preview['close']), 'rsi14': float(preview['rsi14']),
                        'ema9': float(preview['ema9']), 'ema21': float(preview['ema21']), 'ema50': float(preview['ema50'])})
    if acc_id == 'goldm15':
        result.update(GOLD_METRICS_CACHE.get(current_acc, sym_name, acc_tf, cur_bar['time'],
                                            df['close'].to_numpy(), params, gold_metrics))
        result['ea_guard'] = guard
        result['signal_bar_time'] = datetime.fromtimestamp(int(df.iloc[-2]['time']), timezone.utc).strftime('%H:%M')
        result['in_window'] = False if guard['hard_lock'] or guard['daily_lock'] or not guard['baseline_verified'] else None
    return result

@app.get('/api/accounts')
def api_accounts():
    seen = set()
    unique_accounts = []
    for a in ACCOUNTS.values():
        if a.get('hidden'):
            continue
        if a['id'] not in seen:
            seen.add(a['id'])
            unique_accounts.append(public_account(a))
    return {'default': 'blueberry', 'accounts': unique_accounts}

@app.get('/api/journal_summary')
@scoped(mt5)
def api_journal_summary(account: str = 'blueberry'):
    sym_name = selected().get('symbol', 'XAUUSD')
    tick = require_mt5_data(mt5.symbol_info_tick(sym_name), 'journal_tick')
    server_time = datetime.fromtimestamp(broker_clock.to_utc_epoch(tick.time, selected()), timezone.utc)
    local_time = datetime.fromtimestamp(broker_clock.to_utc_epoch(tick.time, selected()), timezone.utc).astimezone(journal_accounting.BERLIN)
    entries = get_cached_trade_journal(account, server_time, local_time)
    JOURNAL_CACHE[account] = entries
    return {
        'account': account,
        'journal': entries,
        'journal_cache': {account: entries},
        'journal_meta': journal_metadata(account)
    }

@app.get("/api/status")
@scoped(mt5)
def api_status(account: str = 'blueberry', include_journal: bool = True, light: bool = False):
    data = get_live_market_data(include_journal=include_journal and not light)
    if data is None:
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    return data


@app.get('/api/diagnostics/mt5-traces')
def api_mt5_traces(request: Request, account: str, limit: int = 50):
    identity = getattr(request.state, 'control_identity', None)
    if not isinstance(identity, tuple) or len(identity) != 3 or identity[2] not in ('read', 'layout', 'trade'):
        raise HTTPException(status_code=403, detail='Autorisierte Read-Identität erforderlich.')
    params = request.query_params
    if (set(params) - {'account', 'limit'} or
            any(len(params.getlist(key)) != 1 for key in params) or
            not re.fullmatch(r'[a-z0-9_-]{1,32}', account)):
        raise HTTPException(status_code=422, detail='Trace-Abfrage muss konto- und limitgebunden sein.')
    spec = ACCOUNTS.get(account)
    if spec is None or spec.get('is_demo') is not True or spec.get('challenge_protection') is True:
        raise HTTPException(status_code=403, detail='Traces sind nur für freigegebene Demo-Konten verfügbar.')
    if isinstance(limit, bool) or not 1 <= limit <= 50:
        raise HTTPException(status_code=422, detail='Limit muss zwischen 1 und 50 liegen.')
    traces = broker_telemetry.recent_traces(limit, account=account)
    return JSONResponse({'traces': traces},
                        headers={'Cache-Control': 'no-store'})

@app.get("/api/candles")
@scoped(mt5)
def api_candles(count: int = 150, account: str = 'blueberry', tf: Optional[str] = None,
                symbol: Optional[Symbol] = None, before: Optional[int] = None):
    if before is not None and not 0 < before <= 4102444800:
        raise HTTPException(status_code=422, detail="Ungültiger historischer Kerzencursor.")
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 Fehler")
    current_acc = selected()
    acc_symbol = current_acc.get('symbol', SYMBOL)
    sym_name = symbol or acc_symbol
    row = mt5.symbol_info(sym_name)
    if row is None and acc_symbol and acc_symbol != sym_name:
        row = mt5.symbol_info(acc_symbol)
        if row is not None:
            sym_name = acc_symbol
    if row is None:
        for cand in [sym_name + '.pi', sym_name + '.p', sym_name.replace('.pi', '').replace('.p', '')]:
            row = mt5.symbol_info(cand)
            if row is not None:
                sym_name = cand
                break
    if tf is None:
        tf = current_acc.get('timeframe', 'M15')
    symbol_info = require_symbol(mt5, sym_name)
    digits = getattr(symbol_info, 'digits', None)
    if isinstance(digits, bool) or not isinstance(digits, int) or not 0 <= digits <= 10:
        raise HTTPException(status_code=503, detail="MT5-Symbolpräzision nicht verfügbar.")
    tf_upper = tf.upper()
    if tf_upper not in TIMEFRAME_MAP:
        raise HTTPException(status_code=422, detail="Ungültiger Chart-Timeframe.")
    tf_val = TIMEFRAME_MAP[tf_upper]
    count = min(1001, max(10, count))
    rates_offset = broker_clock.rates_offset_seconds(current_acc)
    fetch_count = max(5000, count+250) if (account == 'goldm15' and sym_name == SYMBOL and tf_val == mt5.TIMEFRAME_M15) else (count+250)
    if before is None:
        rates = _mt5_read('copy_rates_from_pos', sym_name, tf_val, 0, fetch_count)
    else:
        # MT5 date cursors are inclusive; trim the cursor bar so adjacent pages
        # cannot duplicate a candle. Convert normalized UTC to this account's
        # verified source basis before querying and filtering.
        fetch_count = count + 251
        source_before = before + rates_offset
        historical_from = datetime.fromtimestamp(source_before, timezone.utc)
        rates = _mt5_read('copy_rates_from', sym_name, tf_val, historical_from, fetch_count)
        if rates is not None and len(rates):
            rates = rates[rates['time'] < source_before]
    if rates is None or len(rates) == 0 or (before is None and len(rates) < 2):
        if before is not None:
            raise HTTPException(status_code=404, detail="Keine älteren MT5-Kerzen vor diesem Cursor verfügbar.")
        raise HTTPException(status_code=500, detail="Konnte Kerzen nicht laden")

    if rates_offset:
        rates = rates.copy()
        rates['time'] = rates['time'] - rates_offset

    df = pd.DataFrame(rates)
    df['dt'] = pd.to_datetime(df['time'], unit='s')

    # Normalize only the timestamp basis here. Quotes have their own endpoint;
    # folding a later tick into OHLC rewrites the broker candle and can mix
    # prices from another symbol in test adapters.
    df['ema9'] = df['close'].ewm(span=9, adjust=False).mean()
    df['ema20'] = df['close'].ewm(span=20, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
    diff = df['close'].diff()
    g = diff.clip(lower=0).rolling(14).mean()
    l = (-diff.clip(upper=0)).rolling(14).mean()
    df['rsi14'] = 100 - (100 / (1 + g / (l + 1e-9)))
    if account=='goldm15' and sym_name==SYMBOL and tf_val==mt5.TIMEFRAME_M15:
        params = gold_parameters()
        for n in {int(params[f'S{s}_{key}']) for s in range(1,4) for key in ('FastRSI','BuyTrendRSI','SellTrendRSI')}:
            df[f'gold_rsi{n}'] = wilder_rsi(df['close'].to_numpy(), n)

    # The page may be shorter than requested at the history boundary. Keep all
    # available bars; the first row is still excluded from marker comparisons.
    sub = df.tail(count).copy()

    candles = []
    ema9_pts = []
    ema20_pts = []
    ema50_pts = []
    ema200_pts = []
    markers = []
    previous_gold_signals = {}

    for i in range(len(sub)):
        idx = sub.index[i]
        row = sub.loc[idx]
        t = int(row['time'])

        candles.append({
            'time': t,
            'open': round(row['open'], digits),
            'high': round(row['high'], digits),
            'low': round(row['low'], digits),
            'close': round(row['close'], digits),
            'tick_volume': int(row['tick_volume']),
            'real_volume': int(row['real_volume']) if 'real_volume' in row.index and pd.notna(row['real_volume']) else 0
        })
        ema9_pts.append({'time': t, 'value': round(row['ema9'], digits)})
        ema20_pts.append({'time': t, 'value': round(row['ema20'], digits)})
        ema50_pts.append({'time': t, 'value': round(row['ema50'], digits)})
        ema200_pts.append({'time': t, 'value': round(row['ema200'], digits)})

        if i == 0:
            continue

        if (sym_name == SYMBOL or sym_name == current_acc.get('symbol', SYMBOL)) and tf_val == mt5.TIMEFRAME_M15:
            prev = df.loc[idx - 1]
            c1, o1 = prev['close'], prev['open']
            e20_1, e50_1, e200_1 = prev['ema20'], prev['ema50'], prev['ema200']
            rsi1 = prev['rsi14']

            if account == 'goldm15' and tf_val==mt5.TIMEFRAME_M15:
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

            if current_acc.get('analysis_mode') != 'INDICATORS_ONLY' and account in ('blueberry', 'titan', 'titan_25k', 'titan_m5', 'titan_500_2', 'xau5m_500', 'xau5m_m5', 'xau5m_m15'):
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
        'daily_high': round(daily_vp.get('high', 0.0), digits),
        'daily_low':  round(daily_vp.get('low', 0.0), digits),
        'daily_poc':  round(daily_vp.get('poc', 0.0), digits),
        'weekly_high': round(weekly_vp.get('high', 0.0), digits),
        'weekly_low':  round(weekly_vp.get('low', 0.0), digits),
        'weekly_poc':  round(weekly_vp.get('poc', 0.0), digits),
    }

    oldest_time = int(candles[0]['time']) if candles else None
    has_older = bool(oldest_time is not None and len(df) > len(sub))
    return {
        "account": public_account(selected()),
        "accountId": account,
        "analysis_mode": current_acc.get('analysis_mode', 'TITAN_REFERENCE'),
        "symbol": sym_name,
        "timeframe": tf_upper,
        "source": "MT5_VERIFIED",
        "canExecute": False,
        "snapshotAsOfUtc": int(time.time()),
        "candles": candles,
        "page": {
            "requestedCount": count,
            "oldestTime": oldest_time,
            "nextBefore": oldest_time if has_older else None,
            "hasMore": has_older,
        },
        "ema9": ema9_pts,
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


@lru_cache(maxsize=4)
def _chart_device_sync_store_at(path: str):
    resolved = Path(path).expanduser().resolve()
    static = (BASE_DIR / "static").resolve()
    if resolved == static or static in resolved.parents:
        raise HTTPException(503, "Datenbank darf nicht im öffentlichen Static-Verzeichnis liegen.")
    return DeviceSyncStore(resolved)


def chart_device_sync_store():
    default_path = BASE_DIR / "state" / "chart_studio.sqlite3"
    return _chart_device_sync_store_at(os.getenv("CHART_STUDIO_DB", str(default_path)))


_device_sync_writes = defaultdict(deque)
_device_sync_write_lock = threading.Lock()


def require_device_sync_identity(request: Request, *, write: bool = False) -> tuple[str, str]:
    if os.getenv("CHART_STUDIO_DEVICE_SYNC_ENABLED", "0") != "1":
        raise HTTPException(503, "Verschlüsselter Gerätesync ist deaktiviert.")
    identity = getattr(request.state, "control_identity", None)
    if not identity or len(identity) != 3 or identity[0] != "proxy":
        raise HTTPException(403, "Gerätesync benötigt einen verifizierten Proxy-Nutzer.")
    owner, role = identity[1], identity[2]
    if role not in {"read", "layout", "trade"}:
        raise HTTPException(403, "Rolle ist für Gerätesync nicht freigegeben.")
    if write:
        if role not in {"layout", "trade"}:
            raise HTTPException(403, "Layout-Recht zum Schreiben erforderlich.")
        origin = request.headers.get("origin", "")
        try:
            parsed = urlsplit(origin)
        except ValueError:
            raise HTTPException(403, "Gerätesync-Schreibzugriff benötigt denselben Origin.") from None
        host = request.headers.get("host", "")
        if (not origin or parsed.scheme != request.url.scheme or parsed.netloc != host or
                parsed.path not in ("", "/") or parsed.query or parsed.fragment or
                request.headers.get("sec-fetch-site") not in (None, "same-origin")):
            raise HTTPException(403, "Gerätesync-Schreibzugriff benötigt denselben Origin.")
        now = time.monotonic()
        with _device_sync_write_lock:
            writes = _device_sync_writes[owner]
            while writes and writes[0] <= now - 60:
                writes.popleft()
            if len(writes) >= 30:
                raise HTTPException(429, "Zu viele Sync-Schreibvorgänge.")
            writes.append(now)
    return owner, role


def device_sync_error(error: DeviceSyncError):
    if isinstance(error, DeviceSyncConflict):
        raise HTTPException(409, {"code": error.code,
                                  "message": str(error),
                                  "currentRevision": error.current_revision}) from error
    status = 404 if isinstance(error, DeviceSyncMissing) else 422
    raise HTTPException(status, {"code": error.code, "message": str(error)}) from error


@app.get("/api/chart/v1/device-sync/{bundle_id}")
def api_chart_device_sync_get(bundle_id: str, request: Request,
                              account: str, symbol: str):
    owner, _ = require_device_sync_identity(request)
    try:
        result = chart_device_sync_store().current(owner, bundle_id, account, symbol)
    except DeviceSyncError as error:
        device_sync_error(error)
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


@app.get("/api/chart/v1/device-sync/{bundle_id}/history")
def api_chart_device_sync_history(bundle_id: str, request: Request,
                                  account: str, symbol: str):
    owner, _ = require_device_sync_identity(request)
    try:
        items = chart_device_sync_store().history(owner, bundle_id, account, symbol)
    except DeviceSyncError as error:
        device_sync_error(error)
    return JSONResponse({"bundleId": bundle_id, "account": account,
                         "symbol": symbol, "items": items},
                        headers={"Cache-Control": "no-store"})


@app.put("/api/chart/v1/device-sync/{bundle_id}")
def api_chart_device_sync_put(bundle_id: str, req: dict, request: Request):
    owner, _ = require_device_sync_identity(request, write=True)
    required = {"account", "symbol", "expectedRevision", "formatVersion",
                "nonce", "ciphertext"}
    if not isinstance(req, dict) or set(req) != required:
        raise HTTPException(422, "Nur ein verschlüsseltes Bundle-Envelope ist erlaubt.")
    try:
        validate_envelope(bundle_id, req["account"], req["symbol"],
                          req["formatVersion"], req["nonce"],
                          req["ciphertext"])
        result = chart_device_sync_store().put(
            owner, bundle_id, req["account"], req["symbol"],
            req["formatVersion"], req["nonce"], req["ciphertext"],
            req["expectedRevision"])
    except DeviceSyncError as error:
        device_sync_error(error)
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


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
            "scenarioPreview": True, "brokerPositionStopPreview": True,
            "brokerSymbolSearch": True, "brokerSymbolInfo": True,
            "brokerPositionOrderReads": True,
            "brokerTradeHistoryReads": True,
            "persistentServerDrawings": os.getenv("CHART_STUDIO_STORAGE_ENABLED") == "1"
            and len(os.getenv("CHART_STUDIO_STORAGE_TOKEN", "")) >= 32,
            "encryptedDeviceSync": os.getenv("CHART_STUDIO_DEVICE_SYNC_ENABLED") == "1",
            "realStopDragging": False, "brokerMutations": False,
            "eaDecisionHistory": False, "immutableSnapshots": False,
            "immutableEvidenceReads": True, "trustedEvidenceProvider": True,
            "automaticEvidenceRecording": False, "snapshotRendering": False
        }
    }


@app.get("/api/chart/v1/quotes")
@scoped(mt5)
def api_chart_quotes(account: str, symbol: str = SYMBOL):
    symbol = broker_symbol(symbol)
    acc = verify_identity(mt5, selected())
    return legacy_quote(mt5, selected(), acc, symbol, now=time.time())


@app.post("/api/chart/v1/scenarios/preview")
@scoped(mt5)
def api_chart_preview(req: ChartScenarioPreviewRequest, account: str):
    if req.account != account:
        raise HTTPException(status_code=409, detail="Szenario gehört nicht zum angefragten Konto.")
    acc = verify_identity(mt5, selected())
    sym = require_symbol(mt5, req.symbol)
    try:
        result = preview_scenario(
            mt5, acc, sym, symbol=req.symbol, side=req.side,
            volume=req.volumeLots, entry=req.entryPrice,
            stop=req.slPrice, target=req.tpPrice,
            risk_budget=req.riskBudget, risk_percent=req.riskPercent,
            fees_per_lot=req.feesPerLot, slippage_ticks=req.slippageTicks,
        )
    except PreviewError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
    dd_context = None
    dd_account = acc
    if str(getattr(dd_account, "currency", "") or "").upper() == "USD":
        try:
            dd_account = verify_identity(mt5, selected())
            dd_tick = mt5.symbol_info_tick(req.symbol)
            dd, dd_source, _guard = current_daily_drawdown(mt5, dd_account, dd_tick, time.time())
            dd_context = {"risk_status": "available", "source_fresh": dd_source.get("source_fresh") is True,
                          "quote_time_epoch": dd_source.get("quote_time_epoch"), "daily_drawdown": dd}
        except HTTPException:
            # Keep the broker What-if result usable while making DD explicitly unavailable.
            dd_context = None
    quote_time_utc = None
    if dd_context and dd_context.get("risk_status") == "available" and dd_context.get("source_fresh") is True:
        quote_epoch = dd_context.get("quote_time_epoch")
        if isinstance(quote_epoch, (int, float)) and not isinstance(quote_epoch, bool) and math.isfinite(quote_epoch):
            quote_time_utc = datetime.fromtimestamp(quote_epoch, timezone.utc).isoformat().replace("+00:00", "Z")
    result["dailyDrawdownProjection"] = drawdown_projection(
        currency=getattr(dd_account, "currency", None),
        daily_drawdown=dd_context.get("daily_drawdown") if quote_time_utc else None,
        scenario_risk=-result["netEstimate"]["pnlAtSl"]["amount"] if quote_time_utc else None,
        quote_time_utc=quote_time_utc,
    )
    result["account"] = account
    result["tickSize"] = float(sym.trade_tick_size)
    return result


@app.post("/api/modify_position")
@scoped(mt5)
def api_modify_position(req: ModifyPositionRequest, account: str):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    positions = require_mt5_data(mt5.positions_get(ticket=req.ticket), 'position')
    if not positions:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    pos = positions[0]
    sym_name = selected().get('symbol', 'XAUUSD')
    if pos.symbol not in (sym_name, 'XAUUSD', 'XAUUSD.p', 'XAUUSD.pi'):
        raise HTTPException(403, 'Nur XAUUSD-Positionen sind freigegeben.')
    sym = mt5.symbol_info(pos.symbol)
    if sym is None:
        raise HTTPException(503, 'Symbolinformationen fehlen.')
    contract_size = sym.trade_contract_size
    vol = pos.volume
    op = pos.price_open
    is_buy = (pos.type == mt5.ORDER_TYPE_BUY)
    if not all(math.isfinite(v) and v > 0 for v in (contract_size, vol, op)):
        raise HTTPException(503, 'Positionsdaten sind ungültig.')

    target_sl = pos.sl
    target_tp = pos.tp
    if req.sl_price is not None:
        target_sl = req.sl_price
    if req.tp_price is not None:
        target_tp = req.tp_price
    if req.remove_sl:
        target_sl = 0.0
    if req.remove_tp:
        target_tp = 0.0

    tick = mt5.symbol_info_tick(pos.symbol)
    require_fresh_quote(tick)
    tick_size = getattr(sym, 'trade_tick_size', 0)
    point = getattr(sym, 'point', 0)
    stops = getattr(sym, 'trade_stops_level', None)
    freeze = getattr(sym, 'trade_freeze_level', None)
    if (tick is None or not all(math.isfinite(v) and v > 0 for v in (tick_size, point, tick.bid, tick.ask))
            or stops is None or freeze is None or not all(math.isfinite(v) and v >= 0 for v in (stops, freeze))):
        raise HTTPException(503, 'Broker-Quote oder Stop-Metadaten fehlen.')
    reference = tick.bid if is_buy else tick.ask
    distance = max(stops, freeze) * point
    # Derived USD targets may be fractional ticks. Round toward greater payoff:
    # BUY up / SELL down, so an SL never increases requested nominal loss.
    # Exact client prices remain strict and must already lie on the tick grid.
    for side in ('sl', 'tp'):
        usd = getattr(req, side+'_usd')
        if usd is not None:
            step = Decimal(str(tick_size))
            delta = Decimal(str(usd)) / (Decimal(str(vol))*Decimal(str(contract_size)))
            raw = Decimal(str(op)) + (delta if is_buy else -delta)
            if raw <= 0:
                raise HTTPException(422, 'Berechneter Schutzpreis muss endlich und positiv sein.')
            target = float((raw/step).to_integral_value(rounding=ROUND_CEILING if is_buy else ROUND_FLOOR)*step)
            if side == 'sl':
                target_sl = target
            else:
                target_tp = target
    for side, target in (('sl', target_sl), ('tp', target_tp)):
        changed = (getattr(req, side+'_usd') is not None or getattr(req, side+'_price') is not None or getattr(req, 'remove_'+side))
        if not changed:
            continue
        explicit_remove = getattr(req, 'remove_'+side) or getattr(req, side+'_price') == 0
        if explicit_remove:
            continue
        if not math.isfinite(target) or target <= 0:
            raise HTTPException(422, 'Berechneter Schutzpreis muss endlich und positiv sein.')
        if Decimal(str(target)) % Decimal(str(tick_size)) != 0:
            raise HTTPException(422, 'Schutzpreis liegt nicht auf der Broker-Tickgröße.')
        gap = reference-target if (side=='sl') == is_buy else target-reference
        if gap <= 0 or gap + 1e-9 < distance:
            raise HTTPException(422, 'Schutzpreis verletzt Broker-Stops-/Freeze-Level.')
    target_sl, target_tp = round(target_sl, sym.digits), round(target_tp, sym.digits)

    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": req.ticket,
        "symbol": pos.symbol,
        "sl": float(target_sl) if target_sl > 0 else 0.0,
        "tp": float(target_tp) if target_tp > 0 else 0.0
    }
    verify_identity(mt5, selected())
    require_fresh_quote(mt5.symbol_info_tick(pos.symbol))
    res = mt5.order_send(request)
    if res is None:
        raise HTTPException(503, 'MT5 hat die Änderung nicht bestätigt; Status neu laden.')
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": res.retcode, "comment": res.comment}
    return {"success": True, "comment": res.comment}

@app.post("/api/close_position")
@scoped(mt5)
def api_close_position(req: ClosePositionRequest, account: str):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    positions = require_mt5_data(mt5.positions_get(ticket=req.ticket), 'position')
    if not positions:
        raise HTTPException(status_code=404, detail="Position nicht gefunden")
    pos = positions[0]
    sym_name = selected().get('symbol', 'XAUUSD')
    if pos.symbol not in (sym_name, 'XAUUSD', 'XAUUSD.p', 'XAUUSD.pi'):
        raise HTTPException(403, 'Nur XAUUSD-Positionen sind freigegeben.')
    sym = mt5.symbol_info(pos.symbol)
    tick = mt5.symbol_info_tick(pos.symbol)
    require_fresh_quote(tick)
    if sym is None or tick is None or not all(math.isfinite(v) and v > 0 for v in (tick.bid, tick.ask, pos.volume)):
        raise HTTPException(503, 'Broker-Quote oder Positionsdaten fehlen/ungültig.')
    is_buy = (pos.type == mt5.ORDER_TYPE_BUY)
    price = tick.bid if is_buy else tick.ask
    order_type = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
    filling = mt5.ORDER_FILLING_IOC if (sym.filling_mode & 2) != 0 else mt5.ORDER_FILLING_RETURN
    vol_to_close = pos.volume
    if req.volume is not None:
        step = getattr(sym, 'volume_step', 0.01) or 0.01
        min_vol = getattr(sym, 'volume_min', 0.01) or 0.01
        v = round(round(req.volume / step) * step, 2)
        if v >= pos.volume or (pos.volume - v) < (min_vol - 1e-5):
            vol_to_close = pos.volume
        elif v >= min_vol:
            vol_to_close = v
        else:
            vol_to_close = min_vol

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": req.ticket,
        "symbol": pos.symbol,
        "volume": vol_to_close,
        "type": order_type,
        "price": price,
        "deviation": 50,
        "type_filling": filling,
        "comment": f"Webapp_Close_{vol_to_close:.2f}lot" if vol_to_close < pos.volume else "Webapp_Manual_Close"
    }
    verify_identity(mt5, selected())
    tick = mt5.symbol_info_tick(pos.symbol)
    require_fresh_quote(tick)
    request['price'] = tick.bid if is_buy else tick.ask
    res = mt5.order_send(request)
    if res is None:
        raise HTTPException(503, 'MT5 hat die Schließung nicht bestätigt; Status neu laden.')
    if res.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": res.retcode, "comment": res.comment}
    return {"success": True, "comment": res.comment}

@app.post("/api/reset_drawdown")
@scoped(mt5)
def api_reset_drawdown(req: ResetDrawdownRequest, account: str):
    if not ensure_mt5_init():
        raise HTTPException(status_code=500, detail="MT5 nicht verbunden")
    sym_name = selected().get('symbol', 'XAUUSD')
    init_bal = float(selected().get('initial_balance', 10000.0))
    tick = mt5.symbol_info_tick(sym_name)
    acc = mt5.account_info()
    now = time.time()
    require_fresh_quote(tick, now)
    if tick is None or acc is None:
        raise HTTPException(status_code=500, detail="MT5 Kontodaten nicht verfügbar")

    if req.action == "auto":
        cfg = {
            "manual_reset_active": False,
            "reset_balance": init_bal,
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
        server_time = datetime.fromtimestamp(now, timezone.utc)
        reset_hour = int(gold_parameters()['RiskResetHourServer']) if account=='goldm15' else 0
        cfg = {
            "manual_reset_active": True,
            "reset_balance": baseline,
            "reset_timestamp": int(now),
            "reset_date": risk_day_context(now, reset_hour, {})[0]['risk_day']
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
  <script src="static/chart-studio-alerts.js"></script>
  <script src="static/chart-studio-market-structure.js"></script>
  <script src="static/chart-studio-indicator-extensions.js"></script>
  <script src="static/chart-studio-server-sync.js"></script>
  <script src="static/chart-studio-drawing-geometry.js"></script>
  <script src="static/chart-studio-averages.js"></script>
  <script src="static/chart-studio-appearance.js"></script>
  <script src="static/chart-studio-oscillators.js"></script>
  <script src="static/chart-studio-chart-types.js"></script>
  <script src="static/chart-studio-object-manager.js"></script>
  <link rel="stylesheet" href="static/chart-studio-quick.css">
  <script src="static/chart-studio-catalog.js"></script>
  <script src="static/chart-studio-replay.js"></script>
  <script src="static/chart-studio-fib.js"></script>
  <script src="static/chart-studio-export.js"></script>
  <script src="static/chart-studio-broker-panel.js"></script>
  <script src="static/chart-studio-ticket-draft.js"></script>
  <script src="static/chart-studio-mtf.js"></script>
  <script src="static/chart-studio-mtf-panel.js"></script>
  <link rel="stylesheet" href="static/chart-studio-multi-chart.css">
  <script src="static/chart-studio-multi-chart.js"></script>
  <script src="static/chart-studio-main-data-window.js"></script>
  <script src="static/chart-studio-position-autoscale.js"></script>
  <script src="static/chart-studio-beta.js"></script>
  <script>window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;</script>
  <script src="static/chart-studio-v5-feed.js"></script>
  <script src="static/chart-studio-v5-preview.js"></script>
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
    body.theme-light #account-balance-badge {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    body.theme-light #live-balance {
      color: #0284c7 !important;
    }
    body.theme-light #live-equity {
      color: #334155 !important;
    }

    #tv-chart {
      position: relative;
      width: 100% !important;
      height: 520px !important;
      min-height: 520px;
    }
    #chart-load-status {
      position: absolute;
      z-index: 20;
      top: 10px;
      left: 12px;
      max-width: calc(100% - 24px);
      padding: 7px 10px;
      border: 1px solid rgba(245, 182, 106, .7);
      border-radius: 6px;
      background: rgba(15, 23, 42, .94);
      color: #f8fafc;
      font: 700 12px/1.4 system-ui, sans-serif;
      box-shadow: 0 3px 12px rgba(0, 0, 0, .35);
      pointer-events: none;
    }
    #chart-load-status[data-kind="loading"] { border-color: rgba(96, 165, 250, .75); }
    #chart-load-status[data-kind="empty"] { border-color: rgba(148, 163, 184, .75); }
    #chart-load-status[hidden] { display: none; }
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
    <link rel="stylesheet" href="static/stone-ui-assets.css">
    <link rel="stylesheet" href="static/dashboard-accessibility.css">
</head>
<body class="theme-dark flex flex-col p-3 min-h-screen text-xs select-none">

  <nav class="glass-card rounded-xl px-4 py-3 mb-3" aria-label="Konto und Strategie">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="account-switcher" id="account-switcher">
        <button class="account-tab border-amber-500/50 bg-amber-500/10" data-account="blueberry" aria-pressed="true" onclick="switchAccount('blueberry')">
          <div class="flex items-center justify-between gap-1.5">
            <strong class="text-amber-400">Blueberry Funded</strong>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 font-black border border-amber-500/50 tracking-wider">PROPFIRMA</span>
          </div>
          <small class="text-amber-200/70">5120620 · BlueberryMarketsSVG-Live · $10k · 1:30</small>
        </button>
        <button class="account-tab" data-account="titan" aria-pressed="false" onclick="switchAccount('titan')">
          <div class="flex items-center justify-between gap-1.5">
            <strong>Marketplace XAUUSD 5 minute (ICMarkets 10k)</strong>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold border border-slate-600">DEMO</span>
          </div>
          <small>53087839 · ICMarketsEU-Demo · $10k</small>
        </button>
        <button class="account-tab" data-account="xau5m_m5" aria-pressed="false" onclick="switchAccount('xau5m_m5')">
          <div class="flex items-center justify-between gap-1.5">
            <strong>XAUUSD 5 Minute (M5)</strong>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold border border-slate-600">DEMO</span>
          </div>
          <small>700194619 · PUPrime-Demo · $250</small>
        </button>
        <button class="account-tab" data-account="titan_m5" aria-pressed="false" onclick="switchAccount('titan_m5')">
          <div class="flex items-center justify-between gap-1.5">
            <strong>XAU Titan Pro (M5)</strong>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold border border-slate-600">DEMO</span>
          </div>
          <small>700184986 · PUPrime-Demo · $500</small>
        </button>
        <button class="account-tab" data-account="xau5m_500" aria-pressed="false" onclick="switchAccount('xau5m_500')">
          <div class="flex items-center justify-between gap-1.5">
            <strong>XAUUSD 5 Minute (M15)</strong>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold border border-slate-600">DEMO</span>
          </div>
          <small>700194822 · PUPrime-Demo · $500</small>
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <!-- TOP NAV THEME & VIEW TOOLBAR -->
        <div id="top-nav-theme-container" class="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <div class="stone-theme-dock" role="group" aria-label="Cockpit Design wählen">
            <button type="button" data-mode="stone" aria-pressed="true" aria-label="Design Stein">ᛟ STEIN</button>
            <button type="button" data-mode="dark" aria-pressed="false" aria-label="Design Dunkel">◈ DUNKEL</button>
            <button type="button" data-mode="light" aria-pressed="false" aria-label="Design Hell">☼ HELL</button>
          </div>
          <a id="nav-mobile-link" href="/mobile" target="_blank" class="px-2.5 py-1 rounded-lg ticker-bg border font-sans font-bold hover:bg-emerald-500/20 text-emerald-400 flex items-center gap-1 text-[11px] cursor-pointer" title="Lightweight Mobile Version fürs Smartphone (ohne Animationen)">
            📱 Mobile
          </a>
          <a id="nav-ascii-link" href="/ascii" target="_blank" class="px-2.5 py-1 rounded-lg ticker-bg border font-mono font-bold hover:bg-amber-500/20 text-amber-400 flex items-center gap-1 text-[11px] cursor-pointer" title="Retro ASCII Art Terminal Cockpit">
            📟 ASCII
          </a>
          <span id="nav-bitunix-badge" class="px-2 py-1 rounded-lg ticker-bg border font-mono font-bold text-slate-300 flex items-center gap-1 text-[11px]" title="Bitunix-Schreibzugriff ist gesperrt">
            <span class="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>Bitunix: Schreibzugriff gesperrt</span>
          </span>
          <label class="text-sub text-[10px] ml-1" for="ui-motion">UI-Deko:</label>
          <select id="ui-motion" aria-label="Nicht-Chart-Dekoration" class="ticker-bg border rounded-lg px-2 py-0.5 text-[11px]">
            <option value="off">Aus</option><option value="low">Wenig</option><option value="full">Voll</option>
          </select>
          <button onclick="toggleTheme()" class="hidden" aria-hidden="true">
            <span id="theme-icon">☀️</span> <span id="theme-label">Hell</span>
          </button>
        </div>
        <div class="text-right border-l border-slate-700/40 pl-3">
          <span id="account-connection" role="status" aria-live="polite" class="text-amber-500 font-bold">Verbindung wird geprüft …</span>
          <div id="account-detail" class="text-sub text-[10px] mt-1">Separate Konten · Live-Daten</div>
        </div>
      </div>
    </div>
  </nav>

  <!-- 1. TOP NAVBAR -->
  <header class="glass-card rounded-xl px-4 py-2.5 mb-3 flex flex-col gap-2 shrink-0 shadow-sm">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
        <h1 class="font-black text-sm tracking-wider flex items-center gap-2">
          <span id="strategy-title">BLUEBERRY FUNDED (PROP-FIRMA)</span> <span id="strategy-version" class="text-[10px] px-2 py-0.5 rounded bg-amber-600 text-white font-bold tracking-normal">Phase 1 LIVE PROP</span>
        </h1>
        <span class="opacity-40">|</span>
        <span class="text-sub font-medium">Gold (XAUUSD) Cockpit</span>
      </div>
    </div>

    <!-- Live Prices, Drawdown, Account & Timers (5 strictly equal boxes via 5-col CSS grid) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 w-full font-mono">
      <!-- 1. XAUUSD KURS -->
      <div class="header-stat-box h-12 px-3 py-1.5 rounded-xl ticker-bg border flex items-center justify-between font-mono text-[11px]">
        <div class="flex items-center gap-1.5">
          <span class="font-sans font-black text-amber-400 text-xs tracking-wide">XAUUSD</span>
          <span id="live-spread" class="text-[9px] text-sub px-1 py-0.5 rounded bg-black/20 font-bold">Spr: --</span>
        </div>
        <div class="flex items-center gap-1 font-bold text-xs">
          <span id="live-bid" class="text-emerald-400">----.--</span>
          <span class="opacity-30">/</span>
          <span id="live-ask" class="text-rose-400">----.--</span>
        </div>
      </div>

      <!-- 2. DAILY DRAWDOWN BADGE -->
      <div id="dd-badge" class="header-stat-box h-12 px-3 py-1.5 rounded-xl ticker-bg border flex items-center justify-between font-mono text-[11px]" title="Tages-Drawdown (Tages-Start / High-Water Mark)">
        <div class="flex items-center gap-1.5">
          <span id="dd-dot" class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
          <span class="font-sans font-bold text-sub text-[10px]">TAGES-DD:</span>
          <span id="dd-pct" class="font-bold text-emerald-400 text-xs">--%</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="text-right text-[10px]">
            <span class="text-sub">Puf: </span><span id="dd-buffer" class="font-bold text-emerald-400">$----</span>
          </div>
          <span id="dd-usd" class="hidden">(-$--.--)</span>
          <span id="dd-reset-tag" class="hidden text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono font-bold">Reset</span>
          <button id="dd-reset-button" onclick="openDrawdownResetModal()" class="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-sans font-bold text-[9px] cursor-pointer transition-all shadow-sm shrink-0" title="Tages-Drawdown auf 0.00% zurücksetzen">
            🔄
          </button>
        </div>
      </div>

      <!-- 3. LIVE ACCOUNT BALANCE & FLOATING PNL BADGE -->
      <div id="account-balance-badge" class="header-stat-box h-12 px-3 py-1.5 rounded-xl ticker-bg border flex items-center justify-between font-mono text-[11px]" title="Aktueller Kontostand, Equity und offene PnL">
        <div class="flex items-center gap-1.5">
          <span class="font-sans font-bold text-sub text-[10px]">KONTO:</span>
          <span id="live-balance" class="font-bold text-sky-400 text-xs">$----.--</span>
        </div>
        <div class="text-right text-[10px] flex items-center gap-1">
          <span class="text-sub">OFFEN:</span>
          <span id="live-floating-pnl" class="font-bold text-emerald-400">+$0.00</span>
          <span id="live-floating-pnl-pct" class="text-[9px] text-emerald-400/80">(+0%)</span>
          <span id="live-equity" class="hidden">$----.--</span>
        </div>
      </div>

      <!-- 4. ZEITEN (SERVER / DE) -->
      <div class="header-stat-box h-12 px-3 py-1.5 rounded-xl ticker-bg border flex items-center justify-between font-mono text-[11px]">
        <div class="flex items-center gap-1">
          <span class="text-sub text-[10px]">SRV:</span>
          <span id="time-server" class="font-bold text-xs">--:--:--</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-sub text-[10px]">DE:</span>
          <span id="time-german" class="text-emerald-400 font-bold text-xs">--:--:--</span>
        </div>
      </div>

      <!-- 5. KERZENSCHLUSS COUNTDOWN -->
      <div class="header-stat-box h-12 px-3 py-1.5 rounded-xl ticker-bg border flex items-center justify-between font-mono text-[11px]">
        <div class="flex items-center gap-1 text-blue-400">
          <span>⏳</span>
          <span class="font-bold text-[10px]">KERZENSCHLUSS:</span>
        </div>
        <div>
          <span id="bar-countdown" class="font-bold text-xs text-blue-400">--:--</span>
        </div>
      </div>
    </div>
  </header>

  <!-- 2. MAIN 2-COLUMN SECTION -->
  <main id="account-content" data-connected="false">

    <!-- 2.0 OFFENE POSITIONEN & SL/TP MANAGER (Zwischen Status und Chart) -->
    <div class="glass-card rounded-xl p-3.5 mb-3">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="font-black text-sm">📊 Offene Positionen & SL/TP Manager (MT5 Live-Sync)</span>
          <span id="pos-count-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold">0 Aktiv</span>
        </div>
        <span class="text-[11px] text-sub">Ziel-P/L in USD, kein Stoppreis. Senden aktualisiert beide Felder sofort in MT5. TP = 0: kein fixer TP.</span>
      </div>

      <p id="position-edit-status" role="status" aria-live="polite" class="text-amber-500"></p>
      <div id="positions-list" class="min-h-[100px]">
        <div class="py-6 flex items-center justify-center text-sub text-xs">
          Aktuell keine offenen Positionen auf XAUUSD. Der EA scannt den Markt bei jedem M15-Kerzenschluss.
        </div>
      </div>
    </div>

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
            <button type="button" id="chart-v5-preview-btn" aria-controls="chart-v5-preview-panel"
              aria-expanded="false" hidden class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-200 text-[10px] font-bold"
              title="Separater read-only v5-Kerzenpreview mit Auto-Fibonacci; v4 bleibt aktiv">V5 Vorschau</button>
            <button type="button" id="chart-multi-toggle" aria-controls="chart-multi-panel" aria-expanded="false"
              class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-200 text-[10px] font-bold">2/4 Charts</button>
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
              <span class="text-white font-bold">● EMA9</span>
              <span class="text-sky-400 font-bold">● EMA20</span>
              <span class="text-amber-400 font-bold">● EMA50</span>
              <span class="text-purple-400 font-bold">● EMA200</span>
              <span class="text-amber-500 font-semibold">-- Daily POC</span>
              <span class="text-cyan-400 font-semibold">-- Weekly POC</span>
              <span id="chart-pos-legend" class="hidden items-center gap-1.5 font-bold">
                <span class="text-emerald-400">● Entry</span>
                <span class="text-rose-400">-- SL</span>
                <span class="text-emerald-400">-- TP</span>
              </span>
            </div>
          </div>

          <!-- Chart Controls: EA-Text toggle, Positionen toggle, Runterziehen, Hochziehen, Zoom, Reset -->
          <div class="flex items-center gap-1 text-[10px] font-sans">
            <button id="toggle-ea-status-btn" onclick="toggleEAStatusText()" class="px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-blue-600/30 text-blue-300 border-blue-500/40" title="EA-Statustext & Signal-Pfeile auf dem Chart ein-/ausblenden">
              <span id="toggle-ea-status-icon">🏷️</span> <span id="toggle-ea-status-label">EA-Text: AN</span>
            </button>
            <button id="toggle-positions-btn" onclick="toggleChartPositions()" class="px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-emerald-600/30 text-emerald-300 border-emerald-500/50 shadow-sm" title="Offene Positionen, SL und TP im Chart ein-/ausblenden">
              <span id="toggle-positions-icon">🎯</span> <span id="toggle-positions-label">Positionen: AN</span>
            </button>
            <button id="toggle-levels-btn" onclick="togglePriceLevelLegend()" class="px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-cyan-600/30 text-cyan-300 border-cyan-500/50 shadow-sm" title="Preislevel-Infobox (POC, VAH, VAL, High, Low) im Chart ein-/ausblenden">
              <span id="toggle-levels-icon">📊</span> <span id="toggle-levels-label">Level: AN</span>
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
        <div class="w-full relative rounded-lg overflow-hidden border table-border chart-frame-container" style="height: 520px;">
          <!-- Complete names of chart price levels; native axis shows only numbers. -->
          <div id="chart-level-legend" class="stone-chart-level-legend" role="group" aria-label="Aktuelle Daily- und Weekly-Level" hidden></div>
          <div id="tv-chart" class="w-full h-full">
            <div id="chart-load-status" role="status" aria-live="polite" hidden></div>
          </div>
        </div>
        <section id="chart-crosshair-data-window" aria-label="Kerzendaten am Fadenkreuz" class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-cyan-400/20 bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-200">
          <strong class="text-cyan-200">Kerze <span id="chart-crosshair-scope">XAUUSD · M15</span></strong>
          <span>Zeit <b id="chart-crosshair-time">—</b></span><span>O <b id="chart-crosshair-open">—</b></span>
          <span>H <b id="chart-crosshair-high">—</b></span><span>L <b id="chart-crosshair-low">—</b></span><span>C <b id="chart-crosshair-close">—</b></span>
          <span>EMA20 <b id="chart-crosshair-ema20">—</b></span><span>EMA50 <b id="chart-crosshair-ema50">—</b></span><span>EMA200 <b id="chart-crosshair-ema200">—</b></span>
        </section>
        <section id="chart-v5-preview-panel" hidden class="mt-3 rounded-lg border border-cyan-400/30 bg-slate-950/70 p-3" aria-label="Lightweight Charts v5 read-only preview">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <strong id="chart-v5-preview-title">Native v5 · nur verifizierte MT5-Kerzen</strong>
            <span id="chart-v5-preview-status" role="status" aria-live="polite">Vorschau noch nicht geöffnet.</span>
          </div>
          <div class="mb-2 flex flex-wrap items-center gap-2 text-xs"><button type="button" id="chart-v5-auto-fib-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-200 font-bold">Auto-Fibonacci einblenden</button><output id="chart-v5-auto-fib-status" aria-live="polite" class="text-slate-300"></output><div id="chart-v5-drawing-tools" role="group" aria-label="Native v5 Zeichnungen" class="flex flex-wrap items-center gap-2"><button type="button" id="chart-v5-trend-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Trendlinie</button><button type="button" id="chart-v5-ray-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Strahl</button><button type="button" id="chart-v5-price-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Preislinie</button><button type="button" id="chart-v5-time-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Zeitlinie</button><button type="button" id="chart-v5-rect-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Rechteck</button><button type="button" id="chart-v5-fibo-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Fibonacci</button><button type="button" id="chart-v5-measure-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Messung</button><button type="button" id="chart-v5-channel-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Kanal</button><input type="text" id="chart-v5-text-input" aria-label="Textbeschriftung" maxlength="40" placeholder="Beschriftung (1–40 Zeichen)" class="w-36 px-2 py-1 rounded border border-slate-600 bg-slate-900 text-slate-100"><button type="button" id="chart-v5-text-btn" aria-pressed="false" disabled class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Text setzen</button><output id="chart-v5-drawing-status" role="status" aria-live="polite" class="text-slate-300">Zeichenwerkzeug aus.</output></div><button type="button" id="chart-v5-layout-export-btn" disabled aria-label="V5-Layout als JSON herunterladen" class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Layout exportieren</button><button type="button" id="chart-v5-layout-import-btn" disabled aria-label="V5-Layout mit der aktiven Ansicht zusammenführen" class="px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 font-bold">Layout zusammenführen…</button><button type="button" id="chart-v5-layout-replace-btn" disabled aria-label="Aktives V5-Layout durch JSON ersetzen" class="px-2 py-1 rounded border border-amber-400/40 bg-amber-900/20 text-amber-100 font-bold">Layout ersetzen…</button><input type="file" id="chart-v5-layout-import-file" accept="application/json,.json" hidden><output id="chart-v5-position-status" aria-live="polite" class="text-cyan-200">Positionen laden erst beim Öffnen der Vorschau.</output></div>
          <div id="chart-v5-preview-host" class="w-full rounded border border-slate-700" style="height: 460px; min-width: 260px;"></div>
          <output id="chart-v5-data-window" aria-label="Kerzendaten am Fadenkreuz" class="my-2 block rounded border border-cyan-400/20 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-200">Fadenkreuz auf eine Kerze bewegen.</output>
          <button type="button" id="chart-v5-data-window-pin" aria-pressed="false" disabled class="mb-2 px-2 py-1 rounded border border-cyan-400/40 bg-cyan-900/20 text-cyan-100 text-xs font-bold">Kerze fixieren</button>
          <p class="mt-2 text-[10px] text-slate-400">Read-only-Vorschau mit verifizierten MT5-Kerzen; Auto-Fibonacci wird erst nach bestätigtem Swing gezeigt. Hauptchart und Werkzeuge bleiben auf v4. Powered by <a class="text-cyan-300 underline" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a>. <a class="text-cyan-300 underline" href="static/chart-studio-v5-NOTICE.txt">NOTICE</a> · <a class="text-cyan-300 underline" href="static/chart-studio-v5-LICENSE.txt">Apache-2.0</a> · <a class="text-cyan-300 underline" href="static/chart-studio-v5-THIRD-PARTY-LICENSES.txt">Drittanbieter-Lizenzen</a>.</p>
        </section>
        <section id="chart-multi-panel" hidden class="mt-3" aria-label="Verknüpfte Multi-Chart-Ansicht">
          <div id="chart-multi-workspace"></div>
        </section>
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
        <div class="flex justify-between gap-2 mb-2"><strong>Momentum-Ausstiegsziele</strong><span id="goals-timeframe-sub" class="text-sub text-[10px]">Letzte abgeschlossene M15-Kerze</span></div>
        <div id="exit-goals" class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]"></div>
        <div class="mt-3 pt-2 border-t table-border"><span id="guard-status" class="font-bold"></span><p id="guard-detail" class="font-mono text-[10px] mt-1 leading-relaxed"></p><p id="guard-note" class="text-sub text-[10px] mt-1"></p></div>
        <p id="goals-footer-note" class="text-sub text-[10px] mt-2">RSI-Ziele zeigen das Setup; Slot-Belegung und Schutzfilter werden zusätzlich im EA geprüft. Chartpfeile markieren neue RSI-Setups. Basis: eingesetztes v1.21-Preset.</p>
      </section>
      <div class="glass-card rounded-xl p-3.5 flex flex-col flex-1">
        <div class="flex items-center justify-between mb-2">
          <span id="matrix-title" class="font-black text-xs">🎯 Target-Matrix (Alle 5 Regeln im Direktvergleich)</span>
          <span id="matrix-time" class="text-[10px] text-sub font-mono">M15 Kerzenschluss</span>
        </div>

        <p id="matrix-scroll-hint" class="text-sub">Alle Spalten: horizontal wischen oder fokussieren und Pfeiltasten / Ende verwenden.</p>
        <div id="matrix-scroll" class="w-full" role="region" aria-label="Target-Matrix · alle Regelspalten" aria-describedby="matrix-scroll-hint" tabindex="0">
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
          <div class="flex items-center justify-between stone-account-balance-row">
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

  <!-- 3. TRADE JOURNAL: GESPIELTE POSITIONEN & STRATEGIE-ERKLÄRUNG (Aufnahme ab 20:00 Uhr DE) -->
  <div class="glass-card rounded-xl p-3.5 mb-4">
    <div class="flex flex-wrap items-center justify-between mb-3 border-b table-border pb-2.5 gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-base">📖</span>
        <span class="font-black text-sm">Trade-Journal & PnL</span>
        <span id="journal-strat-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-black uppercase text-amber-400">BLUEBERRY FUNDED (PROP)</span>
        <span id="journal-count-badge" class="px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-sub">0 Trades</span>
        <span id="journal-total-pnl" class="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-black border bg-black/30 text-sub">PnL: —</span>
        <span id="journal-live-pnl" class="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hidden">Live: —</span>
        <span id="journal-closed-pnl" class="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border border-slate-500/20 bg-slate-500/10 text-slate-300 hidden">Hist: —</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label for="journal-strategy-filter" class="stone-journal-filter-label text-[11px] font-bold text-sub">Journal-Ansicht:</label>
        <select id="journal-strategy-filter" onchange="setJournalFilter(this.value)"
          class="ticker-bg border rounded-lg px-2.5 py-1.5 font-bold font-mono text-[11px] cursor-pointer"
          aria-label="Strategien im Trade-Journal auswählen">
          <option value="all">Alle Konten / Strategien</option>
          <option value="blueberry">Blueberry Funded (Prop-Firma)</option>
          <option value="titan">XAU Titan Pro (10k Demo)</option>
          <option value="titan_m5">XAU Titan Pro (M5 $500 Demo)</option>
          <option value="xau5m_m5">XAUUSD 5 Minute (M5 $250 Demo)</option>
          <option value="xau5m_500">XAUUSD 5 Minute (M15 $500 Demo)</option>
          <option value="goldm15">GoldM15 Reconstruction (Demo)</option>
        </select>
        <div class="text-[11px] text-sub font-mono">
          <span id="journal-recording-start">Historie ab: <strong class="text-white">08.10.2026 23:00 UTC · Offene Positionen unabhängig vom Einstiegstag</strong></span>
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
  <div id="dd-reset-modal" role="dialog" aria-modal="true" aria-labelledby="dd-reset-title" aria-describedby="reset-description" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="glass-card rounded-2xl max-w-md w-full p-5 border border-white/10 shadow-2xl relative animate-in fade-in zoom-in duration-200">
      <div class="flex items-center justify-between pb-3 mb-3 border-b table-border">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔄</span>
          <div>
            <h3 id="dd-reset-title" class="font-black text-sm tracking-wide">Tages-Drawdown Reset</h3>
            <p id="dd-reset-subtitle" class="text-[10px] text-sub">Konto-Reset auf 0.00% Drawdown</p>
          </div>
        </div>
        <button aria-label="Reset-Dialog schließen" onclick="closeDrawdownResetModal()" class="text-sub hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer">&times;</button>
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
          <label for="dd-reset-input" class="block text-[11px] font-bold text-sub mb-1">
            Start-Referenzkapital ($):
          </label>
          <div class="flex items-center gap-2">
            <input type="number" id="dd-reset-input" min="0.01" required aria-describedby="reset-help dd-reset-error" step="0.01" class="w-full rounded-lg px-3 py-2 ticker-bg border font-mono font-bold text-sm text-emerald-400 focus:outline-none focus:border-blue-500" placeholder="10000.00">
            <button id="modal-preset-init-btn" onclick="setModalInputBalInit()" class="px-2.5 py-2 rounded-lg ticker-bg border hover:bg-slate-700 text-[10px] font-mono font-bold cursor-pointer whitespace-nowrap">$10k</button>
            <button onclick="setModalInputBalCurrent()" class="px-2.5 py-2 rounded-lg ticker-bg border hover:bg-slate-700 text-[10px] font-mono font-bold cursor-pointer whitespace-nowrap">Aktuell</button>
          </div>
          <span id="reset-help" class="text-[10px] text-sub mt-1 block">Die Baseline, ab der die 3.5% EA- und 4.0% Broker-Notbremse gerechnet wird.</span>
          <p id="dd-reset-error" role="alert" class="text-rose-500 mt-2"></p>
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
  <script src="static/dashboard-runtime.js"></script>
  <script src="static/chart-level-visibility.js"></script>
  <script>
    const localStorage = DashboardRuntime.storage; // Optional preferences must never stop the dashboard.
    let chart, candleSeries, ema9Series, ema20Series, ema50Series, ema200Series;
    // Sparse overlay FX no longer allocates six transparent chart series.
    let srLines = {};
    let currentSRLevels = null;
    let currentSRPrice = 0;
    let positionLines = {};
    let lastKnownPositions = [];
    let isInitialLoad = true;
    let lastCandleTime = 0;
    let currentCandlesCount = 0;
    let candleHistory = {scope:null,pages:[],latest:null,hasMore:false,loading:false};
    let currentVPTab = 'daily';
    let currentData = null;
    const BASE_PATH = window.location.pathname.startsWith('/stt') ? '/stt' : '';
    const urlAccountValues = new URLSearchParams(window.location.search).getAll('account');
    const urlAccountCandidate = urlAccountValues.length === 1 ? urlAccountValues[0] : null;
    const initialAccountTabs = new Set(Array.from(document.querySelectorAll('#account-switcher [data-account]'), tab => tab.dataset.account));
    const deepLinkedAccount = typeof urlAccountCandidate === 'string' && /^[a-z0-9_-]{1,32}$/.test(urlAccountCandidate)
      && initialAccountTabs.has(urlAccountCandidate) ? urlAccountCandidate : null;
    let activeAccount = deepLinkedAccount || 'blueberry';
    let activeTimeframe = 'M15';
    let activeChartSymbol = 'XAUUSD.pi';
    let multiChartWorkspace = null;
    function mountMultiChartWorkspace() {
      const host = document.getElementById('chart-multi-workspace');
      if (!host || !window.ChartStudioMultiChart) return;
      multiChartWorkspace?.destroy();
      multiChartWorkspace = null;
      if (activeAccount === 'blueberry') {
        host.textContent = 'Multi-Chart-Demo ist für Blueberry gesperrt.';
        return;
      }
      multiChartWorkspace = window.ChartStudioMultiChart.mount({container:host,account:activeAccount,symbol:activeChartSymbol,timeframe:activeTimeframe});
    }
    const AVAILABLE_TFS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    let accountGeneration = 0;
    let accounts = {};
    const savedJournalFilter = localStorage.getItem('two_eas_journal_filter');
    let journalFilter = deepLinkedAccount || (['all','blueberry','titan','titan_25k','goldm15','titan_m5','xau5m_500','titan_500_2','xau5m_m5','xau5m_m15'].includes(savedJournalFilter) ? savedJournalFilter : 'all');
    let journalEntriesByAccount = { blueberry: [], titan: [], titan_25k: [], goldm15: [], titan_m5: [], xau5m_500: [], titan_500_2: [], xau5m_m5: [] };
    let journalErrors = [];
    let journalLoadedMode = null;
    let journalBusyMode = null;
    let journalRequestVersion = 0;
    let statusBusy = null;
    const STATUS_MAX_AGE = 6000;
    let lastStatusSuccess = 0;
    let statusConfirmed = false;
    function quoteIsFresh() {
      const data = currentData;
      if (!data) return false;
      // Compatibility only for old payloads with no source metadata at all.
      if (!['source_fresh','quote_time_epoch','quote_age_seconds'].some(key => key in data)) return true;
      if (data.source_fresh !== true || !Number.isFinite(data.quote_time_epoch) || !Number.isFinite(data.quote_age_seconds)) return false;
      const epochAge = Date.now()/1000 - data.quote_time_epoch;
      const reportedAge = data.quote_age_seconds + Math.max(0, (Date.now()-lastStatusSuccess)/1000);
      return epochAge >= -5 && epochAge <= 30 && reportedAge >= -5 && reportedAge <= 30;
    }
    function accountIsFresh() {
      return statusConfirmed && quoteIsFresh() && currentData?.account?.id === activeAccount && lastStatusSuccess > 0 && Date.now()-lastStatusSuccess < STATUS_MAX_AGE;
    }
    function gateAccountActions(enabled) {
      const dd = currentData?.daily_drawdown;
      const riskKnown = dd && ['pct','loss_usd','buffer_usd','balance','equity'].every(key => Number.isFinite(dd[key]));
      enabled = enabled && accountIsFresh() && !!riskKnown;
      document.querySelectorAll('#positions-list button,[onclick="openDrawdownResetModal()"],[onclick="executeDrawdownReset()"],[onclick="revertAutoDrawdown()"]').forEach(button => button.disabled = !enabled);
    }
    function accountActionsReady() {
      const dd = currentData?.daily_drawdown;
      return accountIsFresh() && dd && ['pct','loss_usd','buffer_usd','balance','equity'].every(key => Number.isFinite(dd[key]));
    }
    function markStatusStale(error) {
      statusConfirmed = false;
      gateAccountActions(false);
      const staleSource = error?.sourceFresh === false;
      document.getElementById('account-content').dataset.connected = currentData || staleSource ? 'stale' : 'false';
      const age = lastStatusSuccess ? Math.floor((Date.now()-lastStatusSuccess)/1000)+' s alt' : 'noch nicht bestätigt';
      const status = document.getElementById('account-connection');
      status.textContent = (currentData || staleSource ? 'STALE' : 'OFFLINE')+' · '+age+(error ? ' · '+error.message : '');
      status.className = 'text-amber-500 font-bold';
    }
    let candlesBusy = null;
    let showEAStatusText = localStorage.getItem('chart_show_ea_status') !== 'false';
    let currentChartMarkers = [];
    let matrixSignature = null, vpSignature = null;
    function setChartLoadStatus(message, kind = 'error') {
      const status = document.getElementById('chart-load-status');
      if (!status) return;
      const text = typeof message === 'string' ? message.trim().slice(0, 240) : '';
      status.textContent = text;
      status.dataset.kind = kind;
      status.hidden = text.length === 0;
    }
    function clearChartFX() {
      try { window.StoneChartFX?.update({ candles: [], emas: [[], [], []], context: activeAccount + '/' + activeChartSymbol + '/' + activeTimeframe + '/' + accountGeneration }); } catch (_) {}
    }

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

    function updateChartScopeLabel() {
      const meta=accounts[activeAccount],detail=document.getElementById('account-detail');
      if(meta&&detail)detail.textContent=meta.login+' · '+meta.server+' · '+activeChartSymbol+' / '+activeTimeframe;
    }
    let showChartPositions = localStorage.getItem('chart_show_positions') !== 'false';

    function updateChartPositionsButtonUI() {
      const btn = document.getElementById('toggle-positions-btn');
      const lbl = document.getElementById('toggle-positions-label');
      if (lbl) lbl.textContent = showChartPositions ? 'Positionen: AN' : 'Positionen: AUS';
      if (btn) {
        if (showChartPositions) {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-emerald-600/30 text-emerald-300 border-emerald-500/50 shadow-sm';
        } else {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 text-sub hover:text-white opacity-60';
        }
      }
    }

    function toggleChartPositions() {
      showChartPositions = !showChartPositions;
      localStorage.setItem('chart_show_positions', String(showChartPositions));
      updateChartPositionsButtonUI();
      updateChartPositionLines(lastKnownPositions);
      window.ChartStudioV5Preview?.showPositions(showChartPositions);
      if (showChartPositions) refreshV5PreviewPositions(true);
      else setV5PositionStatus('Positionen ausgeblendet');
    }

    let showPriceLevelLegend = localStorage.getItem('chart_show_price_levels') !== 'false';

    function updatePriceLevelLegendButtonUI() {
      const btn = document.getElementById('toggle-levels-btn');
      const lbl = document.getElementById('toggle-levels-label');
      if (lbl) lbl.textContent = showPriceLevelLegend ? 'Level: AN' : 'Level: AUS';
      if (btn) {
        if (showPriceLevelLegend) {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 bg-cyan-600/30 text-cyan-300 border-cyan-500/50 shadow-sm';
        } else {
          btn.className = 'px-2 py-1 rounded ticker-bg border font-bold cursor-pointer transition flex items-center gap-1 text-sub hover:text-white opacity-60';
        }
      }
    }

    function togglePriceLevelLegend(forceState) {
      if (typeof forceState === 'boolean') {
        showPriceLevelLegend = forceState;
      } else {
        showPriceLevelLegend = !showPriceLevelLegend;
      }
      localStorage.setItem('chart_show_price_levels', String(showPriceLevelLegend));
      updatePriceLevelLegendButtonUI();
      const box = document.getElementById('chart-level-legend');
      if (box) {
        if (!showPriceLevelLegend) {
          box.hidden = true;
        } else if (lastKnownVisibleLevels && lastKnownVisibleLevels.length) {
          renderChartLevelLegend(lastKnownVisibleLevels);
        }
      }
    }

    function switchTimeframe(tf) {
      if (activeTimeframe === tf) return;
      activeTimeframe = tf;
      updateChartScopeLabel();
      window.__chartStudioMainDataWindow?.setScope(activeChartSymbol, activeTimeframe);
      clearChartFX();
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
        titleEl.textContent = `${activeChartSymbol} ${tf} Chart`;
      }

      isInitialLoad = true;
      lastCandleTime = 0;
      try {window.StoneCelebration?.clearEMAs();}catch(_){}
      loadCandles();
    }

    document.getElementById('chart-multi-toggle')?.addEventListener('click', event => {
      const panel = document.getElementById('chart-multi-panel');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) mountMultiChartWorkspace();
      else { multiChartWorkspace?.destroy(); multiChartWorkspace = null; }
    });

    function switchChartSymbol(symbol) {
      if (typeof symbol !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9_.# /+:-]{0,62}[A-Za-z0-9_.#/+:-])?$/.test(symbol) || symbol === activeChartSymbol) return;
      activeChartSymbol = symbol;
      updateChartScopeLabel();
      isInitialLoad = true;
      lastCandleTime = 0;
      currentCandlesCount = 0;
      candleSeries?.setData([]);
      ema20Series?.setData([]); ema50Series?.setData([]); ema200Series?.setData([]);
      currentChartMarkers = [];
      candleSeries?.setMarkers([]);
      updateChartSRLines(null, 0);
      try { window.StoneCelebration?.clearEMAs(); } catch (_) {}
      clearChartFX();
      const titleEl = document.getElementById('chart-title-text');
      if (titleEl) titleEl.textContent = `${activeChartSymbol} ${activeTimeframe} Chart`;
      void loadCandles();
    }
    window.addEventListener('chartstudio:symbol-change', event => switchChartSymbol(event.detail?.symbol));

    function staleRequest() { return new DOMException('Account wurde gewechselt', 'AbortError'); }
    let controlSessionPromise = null;
    function getControlSession() {
      if (!controlSessionPromise) controlSessionPromise = (async () => {
        const response = await DashboardRuntime.request(BASE_PATH + '/api/control_session');
        const session = await response.json();
        if (!response.ok || !session.control_enabled || typeof session.csrf_token !== 'string' || !session.csrf_token) {
          throw new Error('Dashboard-Steuerung gesperrt. Kontrollsitzung nicht verfügbar.');
        }
        return session;
      })().catch(error => { controlSessionPromise = null; throw error; });
      return controlSessionPromise;
    }
    async function accountFetch(url, options = {}) {
      const account = activeAccount, generation = accountGeneration;
      if (options.method === 'POST' && !accountActionsReady()) throw new Error('Bitte zuerst auf frische, bestätigte Konto- und Risikodaten warten.');
      const controlled = options.method === 'POST' && ['/api/modify_position','/api/close_position','/api/reset_drawdown'].includes(url.split('?')[0]);
      if (controlled) {
        const session = await getControlSession();
        if (generation !== accountGeneration || account !== activeAccount) throw staleRequest();
        if (!accountActionsReady()) throw new Error('Konto- oder Risikodaten inzwischen unbestätigt. Bitte erneut prüfen.');
        options = {...options, credentials:'same-origin', headers:{...options.headers, 'X-Dashboard-CSRF':session.csrf_token}};
      }
      const targetUrl = url.startsWith('/') ? (BASE_PATH + url) : url;
      const requestUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'account=' + encodeURIComponent(account);
      const response = await DashboardRuntime.request(requestUrl, options, 4500, true);
      const body = await response.json();
      if (generation !== accountGeneration || account !== activeAccount) throw staleRequest();
      if (!response.ok) {
        if (controlled && response.status === 403) controlSessionPromise = null;
        const detail = body.detail;
        const detailMessage = typeof detail === 'string' ? detail :
          (detail && typeof detail.message === 'string' ? detail.message : '');
        const error = new Error(detailMessage || (response.status === 403 ? 'Dashboard-Steuerung nicht autorisiert.' : 'MT5-Anfrage fehlgeschlagen'));
        error.status = response.status;
        error.sourceFresh = detail && typeof detail === 'object' ? detail.source_fresh : null;
        throw error;
      }
      const responseAccount = typeof body.account === 'string' ? body.account : body.account?.id;
      if (body.account && responseAccount !== account) throw new Error('Antwort gehört zu einem anderen Konto.');
      return {ok:response.ok,json: async () => body};
    }

    function clearAccountView() {
      currentData = null;
      lastStatusSuccess = 0;
      setChartLoadStatus('Kerzen werden geladen …', 'loading');
      gateAccountActions(false);
      try {window.StoneCelebration?.clearEMAs();}catch(_){};
      document.getElementById('account-content').dataset.connected = 'false';
      document.getElementById('dd-reset-button').disabled = true;
      closeDrawdownResetModal();
      document.getElementById('dd-reset-input').value = '';
      for (const id of ['live-bid','live-ask','time-server','time-german','bar-countdown','dd-pct','dd-usd','dd-buffer','dd-matrix-detail','acc-matrix-bal','pos-matrix-count','pos-count-badge','sell-pct','buy-pct','matrix-time']) document.getElementById(id).textContent = '—';
      const balEl = document.getElementById('live-balance'); if (balEl) balEl.textContent = '$----.--';
      const eqEl = document.getElementById('live-equity'); if (eqEl) eqEl.textContent = '$----.--';
      const floatEl = document.getElementById('live-floating-pnl'); if (floatEl) floatEl.textContent = '+$0.00';
      const floatPctEl = document.getElementById('live-floating-pnl-pct'); if (floatPctEl) floatPctEl.textContent = '(+0.00%)';
      document.getElementById('live-spread').textContent = 'Spr: —';
      document.getElementById('dd-reset-tag').classList.add('hidden');
      document.getElementById('positions-list').textContent = 'Positionen unbekannt · Kontodaten werden geladen …';
      delete document.getElementById('positions-list').dataset.structure;
      matrixSignature = null; vpSignature = null;
      renderJournal();
      document.getElementById('matrix-tbody').innerHTML = '<tr><td colspan="4">Regeln unbekannt · Kontodaten werden geladen …</td></tr>';
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
        for (const series of [candleSeries,ema9Series,ema20Series,ema50Series,ema200Series]) if (series) series.setData([]);
      }
      currentSRLevels = null;
      currentSRPrice = 0;
      removeAllPositionLines();
      lastKnownPositions = [];
      isInitialLoad = true;
      lastCandleTime = 0;
    }

    function reportAccountError(error, generation) {
      if (error.name === 'AbortError' || generation !== accountGeneration) return;
      // Optional candle failures must not erase verified account/risk data.
      if (accountIsFresh()) return;
      markStatusStale(error);
    }

    async function switchAccount(account) {
      if (!accounts[account]) return;
      activeAccount = account;
      accountGeneration++;
      clearChartFX();
      DashboardRuntime.abortAccount();
      localStorage.setItem('gold_dashboard_account', account);
      document.querySelectorAll('.account-tab').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.account===account)));
      const meta = accounts[account];
      activeChartSymbol = meta.symbol || 'XAUUSD';
      activeTimeframe = meta.timeframe || 'M15';
      window.__chartStudioMainDataWindow?.setScope(activeChartSymbol, activeTimeframe);
      if (!document.getElementById('chart-multi-panel')?.hidden) mountMultiChartWorkspace();
      try {
        window.ChartStudioBeta?.account(account, activeChartSymbol);
        window.ChartStudioBeta?.timeframe(activeTimeframe);
        window.ChartStudioBeta?.symbol(activeChartSymbol);
      } catch (_) {}
      document.getElementById('strategy-title').textContent = meta.name.toUpperCase();
      document.getElementById('strategy-version').textContent = meta.version;
      document.title = meta.name + ' · ' + meta.login + ' · Live Cockpit';
      updateChartScopeLabel();
      document.getElementById('account-connection').textContent = 'Verbindung wird geprüft …';
      document.getElementById('account-connection').className = 'text-amber-500 font-bold';

      const isRsiSub = (account === 'goldm15');
      document.getElementById('matrix-title').textContent = isRsiSub ? '🎯 Einstiegsziele · Systeme 1–3 (Decoded M15)' : `🎯 Target-Matrix (Alle 8 Regeln & Anti-Trap auf ${meta.timeframe || 'M15'})`;
      for (const side of ['sell','buy']) {
        document.getElementById(side+'-readiness-label').textContent = (side==='sell'?'SHORT':'LONG')+(isRsiSub?' · ERFÜLLTE ZIELE':'-BEREITSCHAFT');
      }

      if (account === 'blueberry') {
        document.getElementById('session-label').textContent = 'Prop-Firm Handelsfenster:';
        document.getElementById('session-description').textContent = 'Weekend Close Fr 21:00 UTC · Elite Hours';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (Blueberry Funded):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'Blueberry Funded PROPFIRMA (Phase 1): Max 4.0% Daily DD ($400) / Notbremse $350 (3.5%) · Max 10% Gesamt-DD ($1,000 / Floor $9,000)';
      } else if (account === 'xau5m_m5' || account === 'xau5m_m15') {
        document.getElementById('session-label').textContent = 'Handelsfenster (Server):';
        document.getElementById('session-description').textContent = '01:00-23:45 (M5 Scalping)';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (250$ Demo):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'PU Prime 250$ Demokonto - Scalping M5';
      } else if (account === 'xau5m_500' || account === 'titan_500_2') {
        document.getElementById('session-label').textContent = 'Handelsfenster (Server):';
        document.getElementById('session-description').textContent = '01:00-23:45 (M15 Scalping)';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (500$ Demo):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'PU Prime 500$ Demokonto - XAUUSD 5M EA auf M15';
      } else if (account === 'titan_25k') {
        document.getElementById('session-label').textContent = 'Handelsfenster (DE):';
        document.getElementById('session-description').textContent = '05:00-12:00 & 15:00-18:00 (Golden Hours)';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (Titan 25k Demo):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'ICMarketsEU Demo 25k (Hebel 1:10) · Max 4% Daily DD ($1,000)';
      } else if (account === 'titan_m5') {
        document.getElementById('session-label').textContent = 'Handelsfenster (Server):';
        document.getElementById('session-description').textContent = '01:00-23:45 (Elite Hours Active)';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (500$ Demo):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'Standard 500$ Demokonto - Kein Challenge-Schutz / unbegrenzter Puffer';
      } else if (account === 'goldm15') {
        document.getElementById('session-label').textContent = 'Handelsfreigabe:';
        document.getElementById('session-description').textContent = 'EA prüft News, Feiertage, Spread und Risiko';
        document.getElementById('dd-source-label').textContent = 'Tages-DD (EA-Basis / Anzeige):';
        document.getElementById('dd-reset-button').textContent = 'Anzeige-Reset';
        document.getElementById('dd-badge').title = 'EA-Grenze: 3,5% vom Startkapital ($350). Dashboard-Reset ändert keine Sperre.';
      } else {
        document.getElementById('session-label').textContent = 'Handelsfenster (DE):';
        document.getElementById('session-description').textContent = '05:00-12:00 & 15:00-18:00 (Golden Hours)';
        document.getElementById('dd-source-label').textContent = 'Tages-Drawdown (Titan 10k Demo):';
        document.getElementById('dd-reset-button').textContent = '🔄 Reset';
        document.getElementById('dd-badge').title = 'Titan Pro 10k Demokonto (Hebel 1:10) · Max 4% Daily DD ($400)';
      }

      // Automatically switch chart timeframe to strategy native timeframe
      activeTimeframe = meta.timeframe || 'M15';
      document.querySelectorAll('[id^="tf-btn-"]').forEach(btn => {
        const isCurrent = (btn.id === 'tf-btn-' + activeTimeframe);
        btn.className = isCurrent
          ? 'px-2 py-0.5 rounded cursor-pointer transition bg-blue-600 text-white font-black shadow'
          : 'px-2 py-0.5 rounded cursor-pointer transition text-sub hover:text-white';
      });
      const chartTitle = document.getElementById('chart-title-text');
      if (chartTitle) chartTitle.textContent = (meta.symbol || 'XAUUSD') + ' ' + activeTimeframe + ' Chart';

      clearAccountView();
      await Promise.all([updateStatus(),loadCandles()]);
    }

    function escapeHTML(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    function renderGoldDetails(data) {
      const container = document.getElementById('gold-details');
      const hasGoals = Array.isArray(data.exit_goals) && data.exit_goals.length > 0;
      const hasGuard = !!data.ea_guard;
      container.classList.toggle('hidden', !hasGoals && !hasGuard);
      if (!hasGoals && !hasGuard) return;

      const titleSpan = container.querySelector('strong');
      if (titleSpan) {
        titleSpan.textContent = (activeAccount === 'blueberry' || activeAccount === 'titan_25k' || activeAccount === 'titan_m5' || activeAccount === 'titan_500_2' || activeAccount === 'titan' || activeAccount === 'xau5m_m5' || activeAccount === 'xau5m_m15')
          ? '🎯 Ausstiegsregeln & Gewinnziele (' + (accounts[activeAccount]?.name || '') + ')'
          : '🎯 Momentum-Ausstiegsziele & Schutz';
      }

      const subTitle = document.getElementById('goals-timeframe-sub');
      if (subTitle) {
        subTitle.textContent = 'Letzte abgeschlossene ' + (accounts[activeAccount]?.timeframe || 'M15') + '-Kerze';
      }
      const noteEl = document.getElementById('goals-footer-note');
      if (noteEl) {
        if (activeAccount === 'blueberry') {
          noteEl.textContent = 'Blueberry Funded PROPFIRMA (Phase 1): Hebel 1:30. Strenges 4.0% Daily DD ($400) und 10.0% Max DD ($1,000 / Floor $9,000). Notbremse bei $350 (3.5%). Positionsschluss vor Wochenende (Fr 21:00 UTC).';
        } else if (activeAccount === 'xau5m_m5' || activeAccount === 'xau5m_m15') {
          noteEl.textContent = 'PU Prime Demo M5 ($250): Hebel 1:500. Scalping-Ziele auf M5 Basis.';
        } else if (activeAccount === 'titan_25k') {
          noteEl.textContent = 'Titan Pro 25k (ICMarketsEU Demo): M15-Chart, Hebel 1:10. Dynamischer Runner-Ausstieg ($70), struktureller Swing-SL ($35-$350) und Break-Even Trailing ($100 / $35).';
        } else if (activeAccount === 'titan' || activeAccount === 'titan_m5' || activeAccount === 'titan_500_2') {
          noteEl.textContent = 'Titan-Regeln werden bei Kerzenschluss geprüft. Ausstiege erfolgen über dynamische Runner-Ziele, strukturellen Swing-SL und Break-Even Trailing.';
        } else {
          noteEl.textContent = 'RSI-Ziele zeigen das Setup; Slot-Belegung und Schutzfilter werden zusätzlich im EA geprüft. Chartpfeile markieren neue RSI-Setups. Basis: eingesetztes v1.21-Preset.';
        }
      }

      if (hasGoals) {
        document.getElementById('exit-goals').innerHTML = data.exit_goals.map(goal => {
          if (goal.slot !== undefined && goal.short_value !== undefined) {
            return `
              <div class="ticker-bg border rounded-lg p-2.5">
                <div class="font-bold mb-1 flex items-center justify-between">
                  <span>${escapeHTML(goal.title || ('System ' + goal.slot))}</span>
                  <span class="text-[9px] px-1.5 py-0.5 rounded ${goal.long_met || goal.short_met ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40':'bg-slate-500/20 text-sub'}">
                    ${goal.long_met || goal.short_met ? '✓ Erreicht' : 'Offen'}
                  </span>
                </div>
                <div class="text-rose-400 font-mono text-[10px]">Short: ${escapeHTML(goal.short_note)} · ${goal.short_value.toFixed(2)}% ${goal.short_met ? '✓' : ''}</div>
                <div class="text-emerald-400 font-mono text-[10px] mt-0.5">Long: ${escapeHTML(goal.long_note)} · ${goal.long_value.toFixed(2)}% ${goal.long_met ? '✓' : ''}</div>
              </div>
            `;
          } else {
            const badgeClass = (goal.status === 'PROPFIRMA')
              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 font-black'
              : (goal.status === 'Frei' || goal.status === 'Deaktiviert')
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : goal.status === 'Standby'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
            return `
              <div class="ticker-bg border rounded-lg p-2.5">
                <div class="font-bold mb-1 flex items-center justify-between">
                  <span>${escapeHTML(goal.title)}</span>
                  <span class="text-[9px] px-1.5 py-0.5 rounded ${badgeClass}">${escapeHTML(goal.status || 'Aktiv')}</span>
                </div>
                <div class="text-white font-mono font-bold text-xs">${escapeHTML(goal.target)}</div>
                <div class="text-sub text-[10px] mt-0.5">${escapeHTML(goal.note)}</div>
              </div>
            `;
          }
        }).join('');
      } else {
        document.getElementById('exit-goals').replaceChildren();
      }

      const guardBox = container.querySelector('.border-t.table-border');
      if (guardBox) {
        guardBox.classList.toggle('hidden', !hasGuard);
        if (hasGuard) {
          const guard = data.ea_guard;
          const money = value => value === null ? 'unbekannt' : '$'+value.toFixed(2);
          const locked = guard.hard_lock || guard.daily_lock;
          document.getElementById('guard-status').textContent = locked ? 'EA-SPERRE AKTIV' : guard.baseline_verified ? 'TAGESBASIS BESTÄTIGT' : 'SCHUTZSTATUS UNBEKANNT';
          document.getElementById('guard-status').className = locked || !guard.baseline_verified ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold';
          document.getElementById('guard-detail').textContent = 'Basis '+money(guard.baseline)+' · Puffer bis $350: '+money(guard.daily_buffer_usd)+' · Mit Tagesreserve: '+money(guard.daily_protected_buffer_usd)+' · Geschützte Untergrenze '+money(guard.hard_protected_floor_usd)+' · Rest '+money(guard.hard_buffer_usd);
          document.getElementById('guard-note').textContent = (guard.note || '') + ' · EA-Heartbeat unbekannt; Quellfrische ist keine EA-Bestätigung.';
        }
      }
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
          vertTouchDrag: false,
        },
      });

      const positionAutoscaleProvider = original => window.ChartStudioPositionAutoscale?.merge(
        original(), window.ChartStudioBeta?.getVerifiedPositionPriceExtent?.() || null,
      ) ?? original();
      candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#f43f5e',
        borderDownColor: '#f43f5e', borderUpColor: '#10b981',
        wickDownColor: '#f43f5e', wickUpColor: '#10b981',
        autoscaleInfoProvider: positionAutoscaleProvider,
      });
      window.ChartStudioMainChartAutoscale = Object.freeze({
        refresh: () => candleSeries?.applyOptions({ autoscaleInfoProvider: positionAutoscaleProvider }),
      });

      // Intermittent glow is rendered only on the transparent FX canvas.
      ema9Series   = chart.addLineSeries({ color: '#ffffff', lineWidth: 2, title: 'EMA9' });
      ema20Series  = chart.addLineSeries({ color: '#00d2ff', lineWidth: 2, title: 'EMA20' });
      ema50Series  = chart.addLineSeries({ color: '#ff9f43', lineWidth: 2, title: 'EMA50' });
      ema200Series = chart.addLineSeries({ color: '#a55eea', lineWidth: 2, title: 'EMA200' });
      container.__chart = chart;
      container.__candleSeries = candleSeries;
      try { window.StoneCockpit?.attachChart?.({chart, candleSeries}); } catch (_) {}
      try { window.StoneChartFX?.attach({chart, host:container, candleSeries, emaSeries:[ema9Series,ema20Series,ema50Series,ema200Series]}); } catch (_) {}
      try { window.StoneCelebration?.applyChartSettings(); } catch (_) {}
      try { window.ChartStudioBeta?.mount({chart,host:container,candleSeries,emaSeries:[ema20Series,ema50Series,ema200Series],account:activeAccount,timeframe:activeTimeframe}); } catch (err) { console.warn("Chart Studio Beta konnte nicht gestartet werden:",err); }
      try { window.__chartStudioMainDataWindow = window.ChartStudioMainDataWindow?.mount({chart,host:container,candleSeries,emaSeries:[{label:"EMA20",series:ema20Series},{label:"EMA50",series:ema50Series},{label:"EMA200",series:ema200Series}],symbol:activeChartSymbol,timeframe:activeTimeframe}); } catch (err) { console.warn("Hauptchart-Datenfenster konnte nicht gestartet werden:",err); }
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && range.from <= 2) void loadOlderCandles();
      });

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
      updateChartPositionsButtonUI();
      updatePriceLevelLegendButtonUI();
      initChartLevelLegendDrag();
      if (lastKnownPositions && lastKnownPositions.length > 0) {
        try { updateChartPositionLines(lastKnownPositions); } catch (_) {}
      }
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
      try { window.StoneCockpit?.requestSync?.(); } catch (_) {}
    }

    function resetChartZoom() {
      if (chart) {
        currentBottomMargin = 0.10;
        chart.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.10, bottom: currentBottomMargin }
        });
        applyOptimalChartView(currentCandlesCount);
        try { chart.timeScale().scrollToRealTime(); } catch (_) {}
        try { window.StoneCockpit?.requestSync?.(); } catch (_) {}
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
      try { window.StoneCockpit?.requestSync?.(); } catch (_) {}
    }

    // --- SUPPORT & RESISTANCE / VOLUME PROFILE LINES ON CHART ---
    function updateChartSRLines(sr, curPrice) {
      const definitions = window.DashboardChartLevelVisibility?.definitions || [];
      function removeLine(key) {
        if (candleSeries && srLines[key]) {
          candleSeries.removePriceLine(srLines[key]);
          delete srLines[key];
        }
      }
      if (!sr || !candleSeries) {
        definitions.forEach(level => removeLine(level.key));
        currentSRLevels = null;
        currentSRPrice = 0;
        renderChartLevelLegend([]);
        return;
      }
      currentSRLevels = sr;
      currentSRPrice = Number(curPrice) || 0;
      const visibleLevels = [];
      function setLine(key, price, color, title, style = 2) {
        const p = Number(price);
        if (!Number.isFinite(p) || p <= 0) return;
        // Long native price-line titles are clipped by the narrow right axis.
        // Keep their numeric scale labels and show complete names in our legend.
        if (srLines[key]) {
          srLines[key].applyOptions({price:p, color, title:''});
        } else {
          srLines[key] = candleSeries.createPriceLine({
            price:p, color, lineWidth:1, lineStyle:style,
            axisLabelVisible:false, title:'',
          });
        }
      }

      const preferences = window.DashboardChartLevelVisibility?.read(activeAccount, localStorage) || {};
      const ref = currentSRPrice > 0 ? currentSRPrice : Number(sr.daily_poc) || 0;
      for (const definition of definitions) {
        const price = Number(sr[definition.field]);
        if (!Number.isFinite(price) || price <= 0) {
          removeLine(definition.key);
          continue;
        }
        const weeklyExtreme = definition.key === 'weekly_high' || definition.key === 'weekly_low';
        const nearChart = !weeklyExtreme || ref <= 0 || Math.abs(price - ref) <= 35;
        const hasChoice = window.DashboardChartLevelVisibility?.hasChoice(activeAccount, definition.key, localStorage);
        // Preserve the historical $35 autoscale guard by default. An explicit
        // user toggle may reveal a distant weekly extreme when desired.
        const enabled = !!preferences[definition.key] && (nearChart || hasChoice);
        if (enabled) setLine(definition.key, price, definition.color, definition.title, definition.style);
        else removeLine(definition.key);
        visibleLevels.push({
          ...definition, price, enabled,
          note: weeklyExtreme && !nearChart && !hasChoice ? 'Skalenschutz ±35 · anklicken zum Anzeigen' : '',
        });
      }
      renderChartLevelLegend(visibleLevels);
    }

    let lastKnownVisibleLevels = [];

    function initChartLevelLegendDrag() {
      const box = document.getElementById('chart-level-legend');
      if (!box || box._dragInitialized) return;
      box._dragInitialized = true;

      try {
        const saved = localStorage.getItem('stone_price_levels_pos');
        if (saved) {
          const pos = JSON.parse(saved);
          if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
            box.style.setProperty('left', pos.left + 'px', 'important');
            box.style.setProperty('top', pos.top + 'px', 'important');
            box.style.setProperty('right', 'auto', 'important');
            box.style.setProperty('bottom', 'auto', 'important');
          }
        }
      } catch (_) {}

      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target.closest('button')) return;

        const parent = box.parentElement;
        if (!parent) return;

        isDragging = true;
        box.classList.add('is-dragging');
        startX = e.clientX;
        startY = e.clientY;

        const boxRect = box.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();

        initialLeft = boxRect.left - parentRect.left;
        initialTop = boxRect.top - parentRect.top;

        box.style.setProperty('left', initialLeft + 'px', 'important');
        box.style.setProperty('top', initialTop + 'px', 'important');
        box.style.setProperty('right', 'auto', 'important');
        box.style.setProperty('bottom', 'auto', 'important');

        if (box.setPointerCapture && e.pointerId !== undefined) {
          try { box.setPointerCapture(e.pointerId); } catch (_) {}
        }
        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const parent = box.parentElement;
        if (!parent) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const maxLeft = Math.max(0, parent.clientWidth - box.offsetWidth);
        const maxTop = Math.max(0, parent.clientHeight - box.offsetHeight);

        const newLeft = Math.max(0, Math.min(maxLeft, initialLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, initialTop + dy));

        box.style.setProperty('left', Math.round(newLeft) + 'px', 'important');
        box.style.setProperty('top', Math.round(newTop) + 'px', 'important');
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        box.classList.remove('is-dragging');
        if (box.releasePointerCapture && e.pointerId !== undefined) {
          try { box.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        const left = parseInt(box.style.left, 10);
        const top = parseInt(box.style.top, 10);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          try {
            localStorage.setItem('stone_price_levels_pos', JSON.stringify({ left, top }));
          } catch (_) {}
        }
      };

      box.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }

    function renderChartLevelLegend(levels) {
      if (Array.isArray(levels)) lastKnownVisibleLevels = levels;
      const currentLevels = levels || lastKnownVisibleLevels;
      const box = document.getElementById('chart-level-legend');
      if (!box) return;
      window.DashboardChartLevelVisibility?.render(box,levels,activeAccount,{
        storage:localStorage,
        onChange:()=>{if(currentSRLevels)updateChartSRLines(currentSRLevels,currentSRPrice);}
      });
    }

    // --- POSITION, SL & TP LINES ON CHART ---
    function removeAllPositionLines() {
      if (typeof candleSeries !== 'undefined' && candleSeries) {
        for (const key of Object.keys(positionLines)) {
          try { candleSeries.removePriceLine(positionLines[key]); } catch (_) {}
        }
      }
      positionLines = {};
      const posLegend = document.getElementById('chart-pos-legend');
      if (posLegend) { posLegend.classList.add('hidden'); posLegend.classList.remove('inline-flex'); }
    }

    function updateChartPositionLines(positions) {
      if (typeof candleSeries === 'undefined' || !candleSeries) return;
      if (!showChartPositions || !positions || !positions.length) {
        removeAllPositionLines();
        return;
      }

      const activeKeys = new Set();
      const posLegend = document.getElementById('chart-pos-legend');
      let hasVisibleLines = false;

      function setPosLine(key, price, color, title, lineStyle = 0) {
        const p = Number(price);
        if (!Number.isFinite(p) || p <= 0) return;
        activeKeys.add(key);
        hasVisibleLines = true;

        if (positionLines[key]) {
          positionLines[key].applyOptions({ price: p, color, title, lineStyle });
        } else {
          positionLines[key] = candleSeries.createPriceLine({
            price: p,
            color: color,
            lineWidth: 1,
            lineStyle: lineStyle,
            axisLabelVisible: true,
            title: title,
          });
        }
      }

      for (const pos of positions) {
        const ticket = pos.ticket;
        const isBuy = pos.type === 'BUY';
        const vol = pos.volume !== undefined ? pos.volume : '';

        // 1. Einstiegslinie (Entry Price)
        if (pos.open_price && pos.open_price > 0) {
          const entryKey = 'pos_' + ticket + '_entry';
          const entryColor = isBuy ? '#10b981' : '#f43f5e';
          const entryTitle = `${pos.type} ${vol} #${ticket}`;
          setPosLine(entryKey, pos.open_price, entryColor, entryTitle, 0); // 0 = Solid
        }

        // 2. Stop-Loss-Linie (SL)
        if (pos.sl_price && pos.sl_price > 0) {
          const slKey = 'pos_' + ticket + '_sl';
          const slColor = '#ef4444';
          const slTitle = `SL #${ticket}`;
          setPosLine(slKey, pos.sl_price, slColor, slTitle, 2); // 2 = Dashed
        }

        // 3. Take-Profit-Linie (TP) nur wenn vorhanden (> 0)
        if (pos.tp_price && pos.tp_price > 0) {
          const tpKey = 'pos_' + ticket + '_tp';
          const tpColor = '#10b981';
          const tpTitle = `TP #${ticket}`;
          setPosLine(tpKey, pos.tp_price, tpColor, tpTitle, 2); // 2 = Dashed
        }
      }

      // Verwaiste Linien entfernen
      for (const key of Object.keys(positionLines)) {
        if (!activeKeys.has(key)) {
          try { candleSeries.removePriceLine(positionLines[key]); } catch (_) {}
          delete positionLines[key];
        }
      }

      if (posLegend) {
        if (hasVisibleLines) {
          posLegend.classList.remove('hidden');
          posLegend.classList.add('inline-flex');
        } else {
          posLegend.classList.add('hidden');
          posLegend.classList.remove('inline-flex');
        }
      }
    }

    const v5PositionDemoAccounts = new Set(['titan','xau5m_m5','titan_m5','xau5m_500']);
    let v5PositionReadInFlight = null;
    let v5PositionReadKey = '';
    let v5PositionReadAt = 0;
    function setV5PositionStatus(message) {
      const output = document.getElementById('chart-v5-position-status');
      if (output) output.textContent = message;
    }
    async function refreshV5PreviewPositions(force = false) {
      const preview = window.ChartStudioV5Preview;
      const state = preview?.inspect?.();
      if (!state?.active || !state.scope) return;
      const scope = {account:activeAccount,symbol:activeChartSymbol,timeframe:activeTimeframe};
      if (state.scope.account !== scope.account || state.scope.symbol !== scope.symbol || state.scope.timeframe !== scope.timeframe) return;
      const candles = candleHistory?.latest;
      if (!candles || candles.accountId !== scope.account || candles.symbol !== scope.symbol || candles.timeframe !== scope.timeframe) return;
      if (!showChartPositions) { preview.clearPositions(); setV5PositionStatus('Positionen ausgeblendet'); return; }
      if (!v5PositionDemoAccounts.has(scope.account)) {
        preview.clearPositions(); setV5PositionStatus('Positionsvorschau nur für freigegebene Demokonten'); return;
      }
      const key = `${scope.account}/${scope.symbol}/${scope.timeframe}`;
      if (v5PositionReadInFlight === key || (!force && v5PositionReadKey === key && Date.now() - v5PositionReadAt < 5000)) return;
      const accountGenerationAtStart = accountGeneration;
      const token = preview.beginPositionRead();
      v5PositionReadInFlight = key; v5PositionReadKey = key; v5PositionReadAt = Date.now();
      setV5PositionStatus('Lese Positionen von MT5 …');
      try {
        const response = await accountFetch('/api/chart/v1/positions?symbol=' + encodeURIComponent(scope.symbol));
        const data = await response.json();
        if (accountGenerationAtStart !== accountGeneration || scope.account !== activeAccount || scope.symbol !== activeChartSymbol || scope.timeframe !== activeTimeframe) return;
        if (data.account !== scope.account || data.symbol !== scope.symbol || data.source !== 'MT5_VERIFIED' || data.canExecute !== false || !Array.isArray(data.positions)) {
          preview.clearPositions(); setV5PositionStatus('Positionen nicht verifiziert · Overlay entfernt'); return;
        }
        const result = preview.setPositions({scope,source:data.source,canExecute:data.canExecute,positions:data.positions},token);
        if (!result.applied) {
          setV5PositionStatus(!showChartPositions ? 'Positionen ausgeblendet' : 'Positionen nicht verfügbar · ' + result.reason);
          return;
        }
        setV5PositionStatus(`${data.positions.length} MT5-Positionen · read-only`);
      } catch (error) {
        if (accountGenerationAtStart !== accountGeneration || scope.account !== activeAccount || scope.symbol !== activeChartSymbol || scope.timeframe !== activeTimeframe) return;
        preview.clearPositions();
        setV5PositionStatus('Positionen nicht verfügbar · ' + String(error?.message || 'MT5-Read fehlgeschlagen').slice(0,100));
      } finally {
        if (v5PositionReadInFlight === key) v5PositionReadInFlight = null;
      }
    }
    window.addEventListener('chart-studio-v5-preview-opened', () => refreshV5PreviewPositions(true));

    // --- SMOOTH CANDLES LOAD (NO JUMPING & PRESERVES ZOOM) ---
    function candleHistoryScope(account, symbol, timeframe) {
      return account + '/' + symbol + '/' + timeframe;
    }

    function mergeCandleHistory(payload) {
      const merged = {...payload};
      for (const field of ['candles','ema9','ema20','ema50','ema200','markers']) {
        const keyed = new Map();
        for (const page of candleHistory.pages) {
          for (const row of (page[field] || [])) {
            const key = field === 'markers' ? `${row.time}/${row.position}/${row.shape}/${row.text}` : row.time;
            keyed.set(key, row);
          }
        }
        for (const row of (payload[field] || [])) {
          const key = field === 'markers' ? `${row.time}/${row.position}/${row.shape}/${row.text}` : row.time;
          keyed.set(key, row);
        }
        merged[field] = [...keyed.values()].sort((a,b) => a.time-b.time);
      }
      return merged;
    }

    async function loadOlderCandles() {
      const reqAccount = activeAccount;
      const reqTf = activeTimeframe;
      const reqSymbol = activeChartSymbol;
      const generation = accountGeneration;
      const scope = candleHistoryScope(reqAccount, reqSymbol, reqTf);
      const historyState = candleHistory;
      if (!chart || !candleSeries || historyState.scope !== scope || !historyState.hasMore || historyState.loading) return;
      const visible = candleSeries.data();
      if (!visible || !visible.length) return;
      const before = visible[0].time;
      historyState.loading = true;
      try {
        const url = '/api/candles?tf=' + encodeURIComponent(reqTf) + '&symbol=' + encodeURIComponent(reqSymbol) + '&count=150&before=' + encodeURIComponent(before);
        const response = await accountFetch(url);
        const page = await response.json();
        if (generation !== accountGeneration || reqAccount !== activeAccount || reqTf !== activeTimeframe || reqSymbol !== activeChartSymbol) throw staleRequest();
        if (!response.ok || page.accountId !== reqAccount || page.symbol !== reqSymbol || page.timeframe !== reqTf || page.source !== 'MT5_VERIFIED' || page.canExecute !== false) {
          if (response.status === 404) historyState.hasMore = false;
          else console.warn('[Cockpit] Ältere Kerzen konnten nicht geladen werden:', page.detail || response.status);
          return;
        }
        if (!Array.isArray(page.candles) || !page.candles.length || page.candles.some(row => row.time >= before)) {
          historyState.hasMore = false;
          return;
        }
        const oldRange = chart.timeScale().getVisibleLogicalRange();
        const previousCount = visible.length;
        historyState.pages.unshift(page);
        historyState.hasMore = page.page?.hasMore === true;
        const renderData = mergeCandleHistory(historyState.latest || page);
        const added = Math.max(0, renderData.candles.length - previousCount);
        currentCandlesCount = renderData.candles.length;
        candleSeries.setData(renderData.candles);
        if (renderData.ema9) ema9Series.setData(renderData.ema9);
        ema20Series.setData(renderData.ema20 || []);
        ema50Series.setData(renderData.ema50 || []);
        ema200Series.setData(renderData.ema200 || []);
        currentChartMarkers = renderData.markers || [];
        candleSeries.setMarkers(showEAStatusText ? currentChartMarkers : []);
        try { window.ChartStudioBeta?.updateCandles(renderData.candles); } catch (_) {}
        try { window.StoneChartFX?.update({candles:renderData.candles,emas:[renderData.ema9,renderData.ema20,renderData.ema50,renderData.ema200],markers:showEAStatusText?currentChartMarkers:[],newBar:false,context:activeAccount+'/'+activeChartSymbol+'/'+activeTimeframe+'/'+accountGeneration}); } catch (_) {}
        if (oldRange && added) chart.timeScale().setVisibleLogicalRange({from:oldRange.from+added,to:oldRange.to+added});
      } catch (error) {
        if (error.status === 404) historyState.hasMore = false;
        else if (error.name !== 'AbortError') console.warn('[Cockpit] Ältere Kerzen konnten nicht geladen werden:',error);
      } finally { historyState.loading = false; }
    }

    async function loadCandles() {
      const generation = accountGeneration;
      const reqTf = activeTimeframe;
      const reqSymbol = activeChartSymbol;
      const reqAccount = activeAccount;
      const historyScope = candleHistoryScope(activeAccount, reqSymbol, reqTf);
      if (candleHistory.scope !== historyScope) candleHistory = {scope:historyScope,pages:[],latest:null,hasMore:false,loading:false};
      const v5Preview = window.ChartStudioV5Preview;
      v5Preview?.setScope({account:reqAccount,symbol:reqSymbol,timeframe:reqTf});
      const requestKey = generation + '/' + reqSymbol + '/' + reqTf;
      if (candlesBusy === requestKey) return;
      const requestedCount = candleHistory.latest ? 150 : 1001;
      candlesBusy = requestKey;
      let v5Request = v5Preview?.beginRead();
      try {
        const res = await accountFetch('/api/candles?tf=' + encodeURIComponent(reqTf) + '&symbol=' + encodeURIComponent(reqSymbol) + '&count=' + requestedCount);
        const data = await res.json();
        if (generation !== accountGeneration || reqTf !== activeTimeframe || reqSymbol !== activeChartSymbol) throw staleRequest();
        const expectedSymbol = accounts[activeAccount]?.symbol || reqSymbol;
        if (!res.ok) {
          const detail = typeof data.detail === 'string' && data.detail.trim()
            ? data.detail.trim().slice(0, 200)
            : `Kerzenabruf fehlgeschlagen (HTTP ${res.status}).`;
          throw new Error(detail);
        }
        if (data.accountId !== activeAccount || (data.symbol !== reqSymbol && data.symbol !== expectedSymbol) || data.timeframe !== reqTf || data.source !== 'MT5_VERIFIED' || data.canExecute !== false) {
          throw new Error('Chartdaten haben keinen passenden Account-/Symbol-/Timeframe-Read-Scope.');
        }
        if (data.symbol && data.symbol !== activeChartSymbol && accounts[activeAccount]?.symbol === data.symbol) {
          activeChartSymbol = data.symbol;
          candleHistory.scope = candleHistoryScope(activeAccount, activeChartSymbol, reqTf);
          v5Preview?.setScope({account:reqAccount,symbol:activeChartSymbol,timeframe:reqTf});
          v5Request = v5Preview?.beginRead();
          updateChartScopeLabel();
          const title = document.getElementById('chart-title-text');
          if (title) title.textContent = `${activeChartSymbol} ${reqTf} Chart`;
          try { window.ChartStudioBeta?.symbol(activeChartSymbol); } catch (_) {}
        }
        if (!Array.isArray(data.candles) || data.candles.length === 0) {
          v5Preview?.clear(`${activeChartSymbol} ${activeTimeframe}: keine MT5-Kerzen verfügbar.`);
          setChartLoadStatus(`${activeChartSymbol} ${activeTimeframe}: keine MT5-Kerzen verfügbar.`, 'empty');
          return;
        }
        setChartLoadStatus('');
        const previousLatest = candleHistory.latest;
        const nextLatestTime = data.candles[0].time;
        if (previousLatest?.candles?.length && Number.isFinite(nextLatestTime) &&
            nextLatestTime > previousLatest.candles[0].time) {
          const expired = {candles:[],ema9:[],ema20:[],ema50:[],ema200:[],markers:[]};
          for (const field of ['candles','ema9','ema20','ema50','ema200','markers']) {
            expired[field] = (previousLatest[field] || []).filter(row => row.time < nextLatestTime);
          }
          if (expired.candles.length) candleHistory.pages.push(expired);
        }
        candleHistory.latest = data;
        if (!candleHistory.pages.length) candleHistory.hasMore = data.page?.hasMore === true;
        const renderData = mergeCandleHistory(data);
        v5Preview?.update({...data,candles:renderData.candles},v5Request);
        if (v5Preview?.inspect?.().active) refreshV5PreviewPositions(true);

        currentCandlesCount = renderData.candles.length;
        const latest = renderData.candles[renderData.candles.length - 1];
        const curPrice = latest ? latest.close : 0;
        const stoneNewBar = !isInitialLoad && lastCandleTime !== 0 && latest.time !== lastCandleTime;
        const chartContainer = document.getElementById('tv-chart');

        if (isInitialLoad) {
          if (chartContainer && chartContainer.clientWidth > 0 && chartContainer.clientHeight > 0) {
            chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
          }
          candleSeries.setData(renderData.candles);
          if (renderData.ema9) ema9Series.setData(renderData.ema9);
          ema20Series.setData(renderData.ema20);
          ema50Series.setData(renderData.ema50);
          ema200Series.setData(renderData.ema200);
          updateChartSRLines(data.sr_levels, curPrice);
          applyOptimalChartView(data.candles.length);
          isInitialLoad = false;
          lastCandleTime = latest.time;
        } else {
          if (latest.time === lastCandleTime) {
            candleSeries.update(latest);
            if (data.ema9 && data.ema9.length) ema9Series.update(data.ema9[data.ema9.length - 1]);
            if (data.ema20 && data.ema20.length) ema20Series.update(data.ema20[data.ema20.length - 1]);
            if (data.ema50 && data.ema50.length) ema50Series.update(data.ema50[data.ema50.length - 1]);
            if (data.ema200 && data.ema200.length) ema200Series.update(data.ema200[data.ema200.length - 1]);
          } else {
            // New bar: keep exact user zoom & position with 12-bar right offset
            const curRange = chart.timeScale().getVisibleLogicalRange();
            const totalBars = renderData.candles.length;
            const wasAtEnd = curRange ? (curRange.to >= (totalBars - 3)) : true;

            candleSeries.setData(renderData.candles);
            if (renderData.ema9) ema9Series.setData(renderData.ema9);
            ema20Series.setData(renderData.ema20);
            ema50Series.setData(renderData.ema50);
            ema200Series.setData(renderData.ema200);

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
        try { window.StoneCockpit?.requestSync?.(); } catch (_) {}

        try { window.ChartStudioBeta?.updateCandles(renderData.candles); } catch (_) {}
        currentChartMarkers = renderData.markers || [];
        candleSeries.setMarkers(showEAStatusText ? currentChartMarkers : []);
        try {
          window.StoneChartFX?.update({
            candles: renderData.candles,
            emas: [renderData.ema9, renderData.ema20, renderData.ema50, renderData.ema200],
            markers: showEAStatusText ? currentChartMarkers : [],
            newBar: stoneNewBar,
            context: activeAccount + '/' + activeChartSymbol + '/' + activeTimeframe + '/' + accountGeneration
          });
        } catch (_) { /* Never let decorative effects interfere with MT5 polling. */ }
        try {
          const last = items => Array.isArray(items)&&items.length?items[items.length-1].value:null;
          window.StoneCelebration?.updateEMAs({
            timeframe:activeTimeframe,
            ema9:last(data.ema9),ema20:last(data.ema20),ema50:last(data.ema50),ema200:last(data.ema200)
          });
        } catch (_) { /* Read-only EMA display is optional. */ }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[Cockpit] Kerzen-Ladefehler:', err);
        reportAccountError(err, generation);
        if (generation === accountGeneration && err.name !== 'AbortError') {
          v5Preview?.clear(`MT5-Kerzen derzeit nicht verfügbar: ${String(err.message||'Feed prüfen.').slice(0,120)}`);
          setChartLoadStatus(`Kerzen nicht verfügbar: ${err.message || 'MT5-Feed prüfen.'}`, 'error');
        }
      } finally { if (candlesBusy === requestKey) candlesBusy = null; }
    }

    // --- LIVE STATUS & TARGET MATRIX ---
    async function updateStatus() {
      if (document.hidden || !accounts[activeAccount]) return;
      const generation = accountGeneration;
      if (statusBusy === generation) return;
      statusBusy = generation;
      try {
        const res = await accountFetch('/api/status?include_journal=false');
        const data = await res.json();
        if (generation !== accountGeneration) throw staleRequest();
        const needsCharts = currentData === null;
        currentData = data;
        lastStatusSuccess = Date.now();
        statusConfirmed = true;
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
        const isChallenge = data.account?.challenge_protection === true;
        const hasValidDD = data.daily_drawdown && ['pct','loss_usd','balance','equity'].every(key => Number.isFinite(data.daily_drawdown[key])) && (!isChallenge || Number.isFinite(data.daily_drawdown.buffer_usd));
        if (hasValidDD) {
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

            if (!isChallenge) {
              ddBufferElem.innerText = 'Kein Limit';
              ddBufferElem.className = 'font-bold text-slate-400 text-[10px]';
              ddDotElem.className = 'w-2 h-2 rounded-full bg-emerald-500';
              ddPctElem.className = 'font-bold text-emerald-400';
            } else {
              ddBufferElem.innerText = `$${Number(dd.buffer_usd || 0).toFixed(2)}`;
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
          }

          if (ddMatrixDetail) {
            if (!isChallenge) {
              ddMatrixDetail.className = 'font-bold font-mono text-emerald-400';
              ddMatrixDetail.innerText = `${dd.pct.toFixed(2)}% / -$${dd.loss_usd.toFixed(2)} (Kein Challenge-Schutz)`;
            } else {
              const colorClass = dd.pct >= 3.0 ? 'text-rose-400' : (dd.pct >= 2.0 ? 'text-amber-400' : 'text-emerald-400');
              ddMatrixDetail.className = `font-bold font-mono ${colorClass}`;
              ddMatrixDetail.innerText = `${dd.pct.toFixed(2)}% / -$${dd.loss_usd.toFixed(2)} (Puffer: $${Number(dd.buffer_usd || 0).toFixed(2)})`;
            }
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
        if (!hasValidDD) {
          for (const id of ['dd-pct','dd-buffer','dd-matrix-detail']) document.getElementById(id).textContent = 'unbekannt';
          document.getElementById('dd-usd').textContent = '(Historie / Risiko nicht bestätigt)';
          document.getElementById('acc-matrix-bal').textContent = '—';
          document.getElementById('dd-reset-tag').classList.add('hidden');
        }
        if (posCountElem && data.positions) {
          posCountElem.innerText = `${data.positions.length} / ${data.account.capacity} Aktiv`;
        }

        // Live Balance & Floating PnL badge in header
        const liveBalElem = document.getElementById('live-balance');
        const liveEqElem = document.getElementById('live-equity');
        const liveFloatElem = document.getElementById('live-floating-pnl');
        const liveFloatPctElem = document.getElementById('live-floating-pnl-pct');
        const curBalance = Number(data.daily_drawdown?.balance) || 0;
        const curEquity = Number(data.daily_drawdown?.equity) || 0;
        const positionsList = Array.isArray(data.positions) ? data.positions : [];
        const floatingPnl = positionsList.reduce((sum, p) => sum + (Number(p.profit_usd) || 0), 0);
        const floatPct = curBalance > 0 ? (floatingPnl / curBalance) * 100 : 0;
        const floatSign = floatingPnl >= 0 ? '+' : '';

        if (liveBalElem) liveBalElem.innerText = curBalance > 0 ? `$${curBalance.toFixed(2)}` : '$----.--';
        if (liveEqElem) liveEqElem.innerText = curEquity > 0 ? `$${curEquity.toFixed(2)}` : '$----.--';
        if (liveFloatElem) {
          liveFloatElem.innerText = `${floatSign}$${floatingPnl.toFixed(2)}`;
          liveFloatElem.className = `font-bold ${floatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        if (liveFloatPctElem) {
          liveFloatPctElem.innerText = `(${floatSign}${floatPct.toFixed(2)}%)`;
          liveFloatPctElem.className = `text-[10px] ${floatingPnl >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`;
        }

        // Dynamic Trend & AI Diagnose
        const indicatorOnly = data.analysis_mode === 'INDICATORS_ONLY';
        const trendBadge = document.getElementById('trend-badge');
        if (trendBadge && data.trend_name) {
          trendBadge.innerText = data.trend_name;
          trendBadge.className = `px-2 py-0.5 rounded font-bold text-[9px] ${indicatorOnly ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' : data.trend_direction === 'BULLISH' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'}`;
        }

        const cardElem = document.getElementById('diagnose-card');
        if (cardElem && data.trend_direction) {
          cardElem.classList.remove('border-l-blue-500');
          cardElem.classList.toggle('border-l-emerald-500', data.trend_direction === 'BULLISH');
          cardElem.classList.toggle('border-l-rose-500', data.trend_direction !== 'BULLISH');
        }
        if (cardElem && indicatorOnly) cardElem.classList.remove('border-l-emerald-500', 'border-l-rose-500');

        const statusPrefix = indicatorOnly ? '<span class="text-cyan-300 font-black">Indikatoren:</span>' : data.account.id==='goldm15' ? '<span class="text-blue-400 font-black">RSI-Setup:</span>' : (data.trend_direction === 'BULLISH')
          ? `<span class="text-emerald-400 font-black">Aktiver Trend (Long):</span>`
          : `<span class="text-rose-400 font-black">Aktiver Trend (Short):</span>`;

        document.getElementById('short-missing-text').innerHTML = `${statusPrefix} ${escapeHTML(data.trend_diagnosis || data.short_missing)}`;
        document.getElementById('sell-pct').innerText = indicatorOnly ? 'Nicht verfügbar' : `${data.sell_readiness}% (${data.sell_met_count}/${data.rule_count})`;
        document.getElementById('sell-bar').style.width = indicatorOnly ? '0%' : `${data.sell_readiness}%`;
        document.getElementById('buy-pct').innerText = indicatorOnly ? 'Nicht verfügbar' : `${data.buy_readiness}% (${data.buy_met_count}/${data.rule_count})`;
        document.getElementById('buy-bar').style.width = indicatorOnly ? '0%' : `${data.buy_readiness}%`;

        // Render Matrix Table
        renderMatrix(indicatorOnly ? [{name:'EA-Strategie unbekannt',short_met:false,long_met:false,short_note:'Marketplace-EA ohne Quellcode',long_note:'EMA/RSI werden nur als Indikatoren angezeigt',current_val:'Keine Signalrekonstruktion'}] : data.rules_matrix);

        // Render Volume Profile Card
        renderVolumeProfile(data);

        // Render Positions
        renderPositions(data.positions);
        refreshV5PreviewPositions(false);
        if (Array.isArray(data.positions) && data.positions.length > 0 && journalEntriesByAccount[data.account.id]) {
          let journalChanged = false;
          for (const pos of data.positions) {
            const entry = journalEntriesByAccount[data.account.id].find(e => e.ticket === pos.ticket && e.status === 'OPEN');
            if (entry) {
              entry.current_price = pos.current_price;
              entry.profit_usd = pos.profit_usd;
              entry.points = pos.type === 'BUY' ? Math.round((pos.current_price - entry.open_price) * 100) / 100 : Math.round((entry.open_price - pos.current_price) * 100) / 100;
              if (data.analysis_mode !== 'INDICATORS_ONLY' && pos.ema9 !== undefined && pos.ema9 !== null) {
                entry.ema9 = pos.ema9;
                entry.dist_to_ema9 = pos.dist_to_ema9;
                entry.target_usd = pos.target_usd;
                const tf = accounts[data.account.id]?.timeframe || 'M15';
                const distStr = pos.dist_to_ema9 !== null && pos.dist_to_ema9 !== undefined ? ` (Aktuell $${pos.ema9.toFixed(2)} · Abstand: ${pos.dist_to_ema9.toFixed(2)} Pkt ${pos.ema9 < pos.current_price ? 'unter Kurs' : 'über Kurs'})` : ` (Aktuell $${pos.ema9.toFixed(2)})`;
                const targetUsd = pos.target_usd || 28.0;
                let pnlStatus = '';
                if (pos.profit_usd >= targetUsd) {
                  pnlStatus = ` [✅ Mindestgewinn erreicht: +$${pos.profit_usd.toFixed(2)} >= $${targetUsd.toFixed(0)} · Ausstieg scharf bei EMA9-Schnitt]`;
                } else {
                  pnlStatus = ` [⏳ Mindestgewinn noch offen: $${pos.profit_usd >= 0 ? '+' : ''}${pos.profit_usd.toFixed(2)} / $${targetUsd.toFixed(0)}, noch $${(targetUsd - pos.profit_usd).toFixed(2)}]`;
                }
                const parts = entry.profit_goal.split(' | ');
                const newRunner = `🎯 Dynamic Runner (Hauptziel): Schließt im Gewinn an ${tf} EMA9${distStr}, sobald Mindestgewinn >= $${targetUsd.toFixed(0)} (280 Pkt) erreicht ist und das Momentum abflacht${pnlStatus}.`;
                parts[0] = newRunner;
                entry.profit_goal = parts.join(' | ');
              }
              journalChanged = true;
            }
          }
          if (journalChanged) renderJournal();
        }
        if (!quoteIsFresh()) markStatusStale(new Error('MT5-Quote veraltet oder Quellzeit unbestätigt'));
        else gateAccountActions(true);
        if (!document.getElementById('dd-reset-modal').classList.contains('hidden')) refreshResetModalValues();

        // The journal is independently queried for one or BOTH strategies.
        // Do not replace the merged view with activeAccount-only status data.

        if (needsCharts) void loadCandles();

      } catch (err) {
        if (generation === accountGeneration && err.name !== 'AbortError') markStatusStale(err);
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
            <div class="font-sans font-bold text-xs">${escapeHTML(r.name)}</div>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.short_met ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}">
              <span>${r.short_met ? '✅' : '❌'}</span>
              <span class="stone-rule-state-label">${r.short_met ? 'ERFÜLLT' : 'FEHLT'}</span>
            </span>
            <div class="text-[9px] text-sub mt-1 whitespace-normal">${escapeHTML(r.short_note)}</div>
          </td>
          <td class="py-2 px-2 text-center whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.long_met ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}">
              <span>${r.long_met ? '✅' : '❌'}</span>
              <span class="stone-rule-state-label">${r.long_met ? 'ERFÜLLT' : 'FEHLT'}</span>
            </span>
            <div class="text-[9px] text-sub mt-1 whitespace-normal">${escapeHTML(r.long_note)}</div>
          </td>
          <td class="py-2 pl-2 text-right font-mono text-[10px] opacity-90 font-bold stone-target-live">
            ${escapeHTML(r.current_val)}
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
      container.__vpData = vp;
      window.__currentVP = vp;
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
          <div class="flex items-center gap-2" data-price="${b.price}" data-vol-pct="${b.vol_pct}" data-poc="${b.is_poc}">
            <span class="w-16 font-mono text-[10px] opacity-80 text-right">$${b.price.toFixed(2)}</span>
            <div class="flex-1 bg-black/20 rounded-full h-3 overflow-hidden flex items-center">
              <div class="h-full rounded-full vp-bar ${barColor}" data-kind="${stoneKind}" data-tone="${stoneTone}" style="width: ${Math.max(0, Math.min(100, Number(b.vol_pct) || 0))}%"></div>
            </div>
            <span class="w-24 text-[9px] font-mono opacity-80 ${b.is_poc ? 'text-amber-500 font-bold' : ''}">${label || b.vol_pct + '%'}</span>
          </div>
        `;
      }).join('');
      try { window.StoneCockpit?.requestSync?.(); } catch (_) {}
    }

    // --- POSITIONS & SL/TP MANAGER ---
    const positionDrafts = new Map();
    document.getElementById('matrix-scroll').addEventListener('keydown', event => {
      const area = event.currentTarget;
      const next = event.key === 'End' ? area.scrollWidth : event.key === 'Home' ? 0 : event.key === 'ArrowRight' ? area.scrollLeft+100 : event.key === 'ArrowLeft' ? area.scrollLeft-100 : null;
      if (next !== null) { event.preventDefault(); area.scrollLeft = next; }
    });
    for (const id of ['vp-histogram-container','diagnose-card','gold-details','matrix-title','positions-list','journal-list']) document.getElementById(id).closest('.glass-card').classList.add('dashboard-panel');
    DashboardRuntime.initPresentation();
    function renderPositions(positions) {
      lastKnownPositions = Array.isArray(positions) ? positions : [];
      try { updateChartPositionLines(lastKnownPositions); } catch (_) {}
      const list = document.getElementById('positions-list');
      const badge = document.getElementById('pos-count-badge');
      badge.innerText = `${positions.length} Aktiv`;
      if (!list.dataset.dirtyBound) {
        list.addEventListener('input', event => {
          if (event.target.matches('input[id^="sl-input-"], input[id^="tp-input-"]')) {
            event.target.dataset.dirty = 'true';
            positionDrafts.set(activeAccount+':'+event.target.id, event.target.value);
            event.target.closest('[data-position-ticket]')?.querySelector('[data-draft-note]')?.classList.remove('hidden');
          }
        });
        list.dataset.dirtyBound = '1';
      }
      const structure = positions.map(pos => [pos.ticket,pos.type,pos.volume,pos.open_price].join(':')).join('|');

      if (positions.length === 0) {
        if (list.querySelector('[data-dirty="true"]')) document.getElementById('position-edit-status').textContent = 'Position geschlossen: der zugehörige ungesendete Entwurf wurde verworfen.';
        for (const key of positionDrafts.keys()) if (key.startsWith(activeAccount+':')) positionDrafts.delete(key);
        if (list.dataset.structure !== '') {
          list.innerHTML = `<div class="py-6 flex items-center justify-center text-sub text-xs">Aktuell keine offenen Positionen auf XAUUSD. Der EA scannt den Markt bei jedem M15-Kerzenschluss (:00, :15, :30, :45).</div>`;
          list.dataset.structure = '';
        }
        return;
      }

      if (list.dataset.structure !== structure) {
        const oldRows = new Map([...list.querySelectorAll('[data-position-ticket]')].map(row => [row.dataset.positionTicket,row]));
        const focused = document.activeElement;
        const removedDraft = [...oldRows].some(([ticket,row]) => !positions.some(p => String(p.ticket) === ticket) && row.querySelector('[data-dirty="true"]'));
        const template = document.createElement('template');
        template.innerHTML = positions.map(p => `
        <div data-position-ticket="${p.ticket}" class="p-3 rounded-xl ticker-bg border flex flex-wrap items-center justify-between gap-3 text-xs mb-2">
          <div class="flex items-center gap-2.5 flex-wrap">
            <span data-position-type class="px-2 py-1 rounded-md font-bold font-mono text-[11px] text-white ${p.type === 'BUY' ? 'bg-emerald-600' : 'bg-rose-600'}">
              ${escapeHTML(p.type)} ${escapeHTML(p.volume)} Lot
            </span>
            <span data-position-entry class="font-mono font-bold text-xs">#${p.ticket} @ $${p.open_price.toFixed(2)}</span>
            <span data-position-current class="text-sub font-mono text-[10px] stone-position-current-label">Aktuell: &#36;${p.current_price.toFixed(2)}</span>
            <span data-position-sl-val class="px-1.5 py-0.5 rounded ticker-bg border font-mono text-[10px] text-rose-400 font-bold">
              ${p.sl_price > 0 ? 'SL: $' + p.sl_price.toFixed(2) + ' (' + (p.sl_usd >= 0 ? '+' : '') + '$' + p.sl_usd.toFixed(2) + ')' : 'Kein SL'}
            </span>
            <span data-position-tp-val class="px-1.5 py-0.5 rounded ticker-bg border font-mono text-[10px] text-emerald-400 font-bold">
              ${p.tp_price > 0 ? 'TP: $' + p.tp_price.toFixed(2) + ' (' + (p.tp_usd >= 0 ? '+' : '') + '$' + p.tp_usd.toFixed(2) + ')' : 'Kein TP'}
            </span>
            ${p.ema9 ? `<span data-position-ema9 class="px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] font-bold">🎯 EMA9: $${p.ema9.toFixed(2)}${p.dist_to_ema9 !== null && p.dist_to_ema9 !== undefined ? ' (' + p.dist_to_ema9.toFixed(2) + ' Pkt)' : ''}</span>` : ''}
          </div>

          <div class="font-mono text-right">
            <span data-position-pnl class="font-extrabold text-sm ${p.profit_usd >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
              ${p.profit_usd >= 0 ? '+' : ''}$${p.profit_usd.toFixed(2)} (${p.profit_pct >= 0 ? '+' : ''}${p.profit_pct.toFixed(2)}%)
            </span>
          </div>

          <!-- SL in USD -->
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <label for="sl-input-${p.ticket}" class="text-sub font-bold">SL · USD:</label>
            <input type="number" aria-label="SL Ziel-P/L in USD · ${escapeHTML(accounts[activeAccount].name)} · Ticket ${p.ticket}" id="sl-input-${p.ticket}" step="0.01" value="${p.sl_usd.toFixed(2)}" class="rounded px-1.5 py-0.5 text-center text-xs ticker-bg border text-rose-500 font-bold">
            <button onclick="quickBE(${p.ticket})" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-amber-500 border rounded text-[10px] font-bold cursor-pointer" title="SL sofort +5 USD; TP-Feld wird ebenfalls gesendet">SL sofort +5 USD</button>
            <button onclick="quickSL(${p.ticket}, -50)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-rose-500 border rounded text-[10px] cursor-pointer" title="TP-Feld wird ebenfalls gesendet">SL sofort −50 USD</button>
          </div>

          <!-- TP in USD -->
          <div class="flex items-center gap-1.5 font-mono text-xs">
            <label for="tp-input-${p.ticket}" class="text-sub font-bold">TP · USD:</label>
            <input type="number" aria-label="TP Ziel-P/L in USD · ${escapeHTML(accounts[activeAccount].name)} · Ticket ${p.ticket}" aria-describedby="tp-help-${p.ticket}" id="tp-input-${p.ticket}" min="0" step="0.01" value="${p.tp_usd.toFixed(2)}" class="rounded px-1.5 py-0.5 text-center text-xs ticker-bg border text-emerald-500 font-bold">
            <button onclick="quickTP(${p.ticket}, 50)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-emerald-500 border rounded text-[10px] font-bold cursor-pointer" title="SL-Feld wird ebenfalls gesendet">TP sofort +50 USD</button>
            <button onclick="quickTP(${p.ticket}, 100)" class="px-1.5 py-1 ticker-bg hover:opacity-80 text-emerald-500 border rounded text-[10px] font-bold cursor-pointer" title="SL-Feld wird ebenfalls gesendet">TP sofort +100 USD</button>
            <span id="tp-help-${p.ticket}" data-tp-help class="text-sub">0 USD = Kein fixer TP</span>
          </div>
          <button aria-label="SL und TP an MT5 senden · Ticket ${p.ticket}" onclick="applySLTP(${p.ticket})" class="px-3 py-2 bg-blue-600 text-white font-bold rounded">SL + TP an MT5 senden</button>

          <!-- Teilschließen / Schließen -->
          <div class="flex items-center gap-1.5 flex-wrap font-mono text-xs">
            <span class="text-sub font-bold stone-position-action-label">Teilschließen:</span>
            <button onclick="closePosPct(${p.ticket}, ${p.volume}, 25)" class="px-2 py-1 ticker-bg hover:opacity-80 text-stone-200 border rounded text-[10px] font-bold cursor-pointer" title="25% der Position schließen">25%</button>
            <button onclick="closePosPct(${p.ticket}, ${p.volume}, 50)" class="px-2 py-1 ticker-bg hover:opacity-80 text-stone-200 border rounded text-[10px] font-bold cursor-pointer" title="50% der Position schließen">50%</button>
            <button onclick="closePosPct(${p.ticket}, ${p.volume}, 75)" class="px-2 py-1 ticker-bg hover:opacity-80 text-stone-200 border rounded text-[10px] font-bold cursor-pointer" title="75% der Position schließen">75%</button>
            <button onclick="closePosPct(${p.ticket}, ${p.volume}, 100)" class="px-2 py-1 ticker-bg hover:opacity-80 text-stone-200 border rounded text-[10px] font-bold cursor-pointer" title="100% der Position schließen">100%</button>
            <label for="close-lot-${p.ticket}" class="sr-only">Lotzahl zum Schließen</label>
            <input type="number" id="close-lot-${p.ticket}" step="0.01" min="0.01" max="${p.volume}" value="${p.volume.toFixed(2)}" class="w-16 rounded px-1.5 py-0.5 text-center text-xs ticker-bg border text-stone-100 font-bold" title="Gewünschte Lotzahl eingeben">
            <button onclick="closePosCustom(${p.ticket})" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm">
              ✕ Schließen
            </button>
          </div>
          <span data-draft-note class="text-amber-500 hidden">Entwurf · noch nicht an MT5 gesendet</span>
        </div>
      `).join('');
        const incoming = [...template.content.children];
        if (!oldRows.size) list.replaceChildren();
        for (const newRow of incoming) list.append(oldRows.get(newRow.dataset.positionTicket) || newRow);
        for (const [ticket,row] of oldRows) if (!positions.some(p => String(p.ticket) === ticket)) {
          row.remove();
          for (const side of ['sl','tp']) positionDrafts.delete(activeAccount+':'+side+'-input-'+ticket);
        }
        if (focused?.isConnected) focused.focus({preventScroll:true});
        if (removedDraft) document.getElementById('position-edit-status').textContent = 'Position geschlossen: der zugehörige ungesendete Entwurf wurde verworfen.';
        list.dataset.structure = structure;
      }
      for (const pos of positions) {
        const row = list.querySelector('[data-position-ticket="' + pos.ticket + '"]');
        if (!row) continue;
        const type = row.querySelector('[data-position-type]');
        if (type) type.textContent = pos.type+' '+pos.volume+' Lot';
        const entry = row.querySelector('[data-position-entry]');
        if (entry) entry.textContent = '#'+pos.ticket+' @ $'+pos.open_price.toFixed(2);
        const price = row.querySelector('[data-position-current]');
        if (price) price.textContent = 'Aktuell: ' + String.fromCharCode(36) + pos.current_price.toFixed(2);
        const slVal = row.querySelector('[data-position-sl-val]');
        if (slVal) slVal.textContent = pos.sl_price > 0 ? 'SL: $' + pos.sl_price.toFixed(2) + ' (' + (pos.sl_usd >= 0 ? '+' : '') + '$' + pos.sl_usd.toFixed(2) + ')' : 'Kein SL';
        const tpVal = row.querySelector('[data-position-tp-val]');
        if (tpVal) tpVal.textContent = pos.tp_price > 0 ? 'TP: $' + pos.tp_price.toFixed(2) + ' (' + (pos.tp_usd >= 0 ? '+' : '') + '$' + pos.tp_usd.toFixed(2) + ')' : 'Kein TP';
        const closeLotInp = row.querySelector('#close-lot-' + pos.ticket);
        if (closeLotInp && document.activeElement !== closeLotInp) {
          closeLotInp.max = String(pos.volume);
          if (parseFloat(closeLotInp.value) > pos.volume) closeLotInp.value = pos.volume.toFixed(2);
        }
        const emaBadge = row.querySelector('[data-position-ema9]');
        if (emaBadge && pos.ema9) {
          emaBadge.textContent = '🎯 EMA9: $' + pos.ema9.toFixed(2) + (pos.dist_to_ema9 !== null && pos.dist_to_ema9 !== undefined ? ' (' + pos.dist_to_ema9.toFixed(2) + ' Pkt)' : '');
        }
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
          if (input && positionDrafts.has(activeAccount+':'+id)) {
            input.value = positionDrafts.get(activeAccount+':'+id);
            input.dataset.dirty = 'true';
            row.querySelector('[data-draft-note]')?.classList.remove('hidden');
          }
          if (input && document.activeElement !== input && input.dataset.dirty !== 'true') {
            input.value = value.toFixed(2);
          }
        }
      }
    }

    // Journal selection is independent from the account that controls orders.
    // Each source is queried under its own verified MT5 session on the server.
    function setJournalFilter(value) {
      if (!['all', 'blueberry', 'titan', 'goldm15', 'titan_m5', 'xau5m_500', 'titan_500_2', 'xau5m_m5', 'xau5m_m15', 'titan_25k'].includes(value)) return;
      journalFilter = value;
      localStorage.setItem('two_eas_journal_filter', value);
      const selector = document.getElementById('journal-strategy-filter');
      if (selector) selector.value = value;
      journalRequestVersion++; // obsolete pending responses must never win
      journalBusyMode = null;
      journalLoadedMode = null;
      journalErrors = [];
      renderJournal();
      return refreshJournal();
    }

    async function refreshJournal() {
      if (document.hidden) return;
      if (!Object.keys(accounts).length || journalBusyMode === journalFilter) return;
      const mode = journalFilter;
      const requestVersion = ++journalRequestVersion;
      const wanted = mode === 'all' ? Object.keys(accounts) : [mode];
      journalBusyMode = mode;
      const results = await Promise.all(wanted.map(async (id) => {
        try {
          // Deliberately NOT accountFetch: that helper is tied to the trading
          // account and would silently replace the selected journal account.
          const response = await DashboardRuntime.request(BASE_PATH + '/api/journal_summary?account=' + encodeURIComponent(id));
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
      const fresh = {};
      journalErrors = [];
      for (const result of results) {
        if (result.error) {
          fresh[result.id] = journalEntriesByAccount[result.id] || [];
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
        : journalFilter === 'blueberry' ? 'BLUEBERRY FUNDED (PROP-FIRMA)'
        : (journalFilter === 'xau5m_m5' || journalFilter === 'xau5m_m15') ? 'XAUUSD 5M ($250 DEMO)'
        : (journalFilter === 'xau5m_500' || journalFilter === 'titan_500_2') ? 'XAUUSD 5M ($500 DEMO)'
        : journalFilter === 'titan' ? 'XAU TITAN PRO (10K)'
        : journalFilter === 'titan_25k' ? 'XAU TITAN PRO (25K)'
        : journalFilter === 'titan_m5' ? 'XAU TITAN PRO (M5 $500)'
        : 'GOLDM15 RECONSTRUCTION';
      const stratColor = journalFilter === 'all' ? 'text-sky-300'
        : journalFilter === 'blueberry' ? 'text-amber-400'
        : (journalFilter === 'xau5m_m5' || journalFilter === 'xau5m_m15') ? 'text-emerald-400'
        : (journalFilter === 'xau5m_500' || journalFilter === 'titan_500_2') ? 'text-teal-400'
        : journalFilter === 'titan' ? 'text-cyan-400'
        : journalFilter === 'titan_25k' ? 'text-emerald-400'
        : journalFilter === 'titan_m5' ? 'text-blue-400'
        : 'text-purple-400';

      const stratEl = document.getElementById('journal-strat-badge');
      if (stratEl) {
        stratEl.textContent = stratName;
        stratEl.className = `px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-black uppercase ${stratColor}`;
      }

      const list = document.getElementById('journal-list');
      if (list && list.dataset.lifecycleEvidenceBound !== 'true') {
        list.dataset.lifecycleEvidenceBound = 'true';
        list.addEventListener('click', async event => {
          const button = event.target.closest('[data-lifecycle-evidence-ticket]');
          if (!button || !list.contains(button) || button.disabled) return;
          const row = button.closest('[data-journal-key]');
          const accountId = button.dataset.lifecycleEvidenceAccount;
          const ticket = button.dataset.lifecycleEvidenceTicket;
          const output = row?.querySelector('[data-lifecycle-evidence-result]');
          if (!row || !output || row.dataset.journalKey !== `${accountId}:${ticket}:CLOSED` ||
              !/^[a-z0-9_-]{1,32}$/.test(accountId || '') || !/^[0-9]{1,20}$/.test(ticket || '')) return;
          button.disabled = true;
          output.textContent = 'Beleg wird geprüft …';
          try {
            const url = BASE_PATH + '/api/chart/v1/lifecycle/mt5_deal_' + encodeURIComponent(ticket) +
              '?account=' + encodeURIComponent(accountId);
            const response = await DashboardRuntime.request(url);
            if (!row.isConnected || row.dataset.journalKey !== `${accountId}:${ticket}:CLOSED` ||
                output !== row.querySelector('[data-lifecycle-evidence-result]')) return;
            if (response.status === 404) {
              output.textContent = 'NOT_RECORDED · kein gespeicherter Broker-Beleg';
              return;
            }
            if (!response.ok) {
              output.textContent = 'UNKNOWN · Beleg nicht verfügbar';
              return;
            }
            const body = await response.json();
            if (!row.isConnected || row.dataset.journalKey !== `${accountId}:${ticket}:CLOSED` ||
                output !== row.querySelector('[data-lifecycle-evidence-result]')) return;
            const record = body?.record;
            const payload = record?.payload;
            const exactMatch = record?.type === 'LIFECYCLE' && record?.id === 'mt5_deal_' + ticket &&
              record?.accountId === accountId && record?.provenance === 'RECORDED' &&
              payload?.accountId === accountId && String(payload?.dealTicket) === ticket &&
              payload?.source === 'MT5_DEAL' && payload?.dataQuality === 'OBSERVED';
            if (!exactMatch) {
              output.textContent = 'UNKNOWN · Belegidentität stimmt nicht überein';
              return;
            }
            const eventType = typeof payload.eventType === 'string' ? payload.eventType : 'unbekanntes Ereignis';
            const eventTime = typeof payload.asOfUtc === 'string' ? payload.asOfUtc : 'Zeit unbekannt';
            output.textContent = `RECORDED · ${eventType} · ${eventTime}`;
          } catch (_) {
            if (row.isConnected && output === row.querySelector('[data-lifecycle-evidence-result]'))
              output.textContent = 'UNKNOWN · Beleg nicht verfügbar';
          } finally {
            if (row.isConnected && button.isConnected) button.disabled = false;
          }
        });
      }
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
          countBadge.innerText = journalErrors.length ? '— Aufgezeichnet (unvollständig)' : '0 Aufgezeichnet';
          countBadge.className = 'px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-sub';
        }
        if (totBadge) {
          totBadge.textContent = journalErrors.length ? 'Gesamt: — (unvollständig)' : 'PnL: $0.00';
          totBadge.className = 'px-2.5 py-0.5 rounded-md font-mono text-[11px] font-black border bg-black/30 text-sub';
        }
        if (liveBadge) liveBadge.classList.add('hidden');
        if (closedBadge) closedBadge.classList.add('hidden');

        if (list) {
          list.innerHTML = `
            <div class="py-6 flex flex-col items-center justify-center text-sub text-xs gap-1">
              <span>${journalErrors.length === wanted.length ? 'Journal derzeit nicht erreichbar.' : 'Keine aufgezeichneten Trades für ' + stratName + ' verzeichnet.'}</span>
              <span class="text-[10px] opacity-75">Offene Positionen werden vollständig angezeigt; historische Deals ab dem angegebenen Aufzeichnungsbeginn. Unbelegte Gründe bleiben unbekannt.</span>
            </div>`;
        }
        return;
      }

      // Calculations
      const isAllMode = journalFilter === 'all';
      const allFailed = wanted.length > 0 && journalErrors.length >= wanted.length;
      const totalUnknown = isAllMode
        ? allFailed
        : (journalErrors.length > 0 || itemsToRender.some(it => !Number.isFinite(it.profit_usd) || it.net_complete === false));
      const totalPnL = itemsToRender.reduce((sum, it) => sum + (Number.isFinite(it.profit_usd) ? it.profit_usd : 0), 0);
      const liveItems = itemsToRender.filter(it => it.status === 'OPEN');
      const closedItems = itemsToRender.filter(it => it.status === 'CLOSED');
      const livePnL = liveItems.reduce((sum, it) => sum + (it.profit_usd || 0), 0);
      const closedPnL = closedItems.reduce((sum, it) => sum + (it.profit_usd || 0), 0);
      const liveUnknown = isAllMode
        ? allFailed
        : (journalErrors.length > 0 || liveItems.some(it => !Number.isFinite(it.profit_usd)));
      const closedUnknown = isAllMode
        ? allFailed
        : (journalErrors.length > 0 || closedItems.some(it => !Number.isFinite(it.profit_usd) || it.net_complete === false));

      if (countBadge) {
        if (isAllMode && journalErrors.length > 0) {
          const totalAccs = Object.keys(accounts).length;
          const activeAccs = Math.max(1, totalAccs - journalErrors.length);
          countBadge.innerText = `${itemsToRender.length} Trades (${liveItems.length} Live · ${closedItems.length} Hist) · ${activeAccs}/${totalAccs} Konten`;
        } else {
          countBadge.innerText = journalErrors.length ? `${itemsToRender.length} zuletzt bekannte Trades · unvollständig` : `${itemsToRender.length} Trades (${liveItems.length} Live · ${closedItems.length} Hist)`;
        }
        countBadge.className = 'px-2 py-0.5 rounded font-mono text-[10px] ticker-bg border font-bold text-white';
      }

      if (totBadge) {
        const sign = totalPnL >= 0 ? '+' : '-';
        totBadge.textContent = totalUnknown ? 'Gesamt: — (unvollständig)' : `Gesamt: ${sign}$${Math.abs(totalPnL).toFixed(2)}`;
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
          liveBadge.textContent = liveUnknown ? 'Live: — (unvollständig)' : `Live: ${sign}$${Math.abs(livePnL).toFixed(2)}`;
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
          closedBadge.textContent = closedUnknown ? 'Hist: — (unvollständig)' : `Hist: ${sign}$${Math.abs(closedPnL).toFixed(2)}`;
          closedBadge.className = `px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${
            closedPnL >= 0 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          }`;
        } else {
          closedBadge.classList.add('hidden');
        }
      }

      if (!list) return;

      const signatures = new Map();
      const template = document.createElement('template');
      template.innerHTML = itemsToRender.map(item => {
        const key = item.account+':'+item.ticket+':'+item.status;
        signatures.set(key, JSON.stringify(item));
        const isOpen = item.status === 'OPEN';
        const isBuy = item.type === 'BUY';
        const isProfit = item.profit_usd >= 0;
        const profitSign = isProfit ? '+' : '-';
        const absProfit = Math.abs(item.profit_usd).toFixed(2);
        const pnlFormatted = Number.isFinite(item.profit_usd) && item.net_complete !== false ? `${profitSign}$${absProfit}` : '— (unbekannt)';
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
          <div class="journal-entry-pnl flex items-center gap-1 px-3 py-1 rounded-lg border font-mono font-black text-xs ${
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
          : item.type === 'SELL' ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">SELL</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-black ticker-bg border text-sub">UNBEKANNT</span>`;

        const stratBadge = item.account === 'blueberry'
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">BLUEBERRY [PROPFIRMA]</span>`
          : (item.account === 'xau5m_m5' || item.account === 'xau5m_m15')
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">XAU 5M $250 [DEMO]</span>`
          : item.account === 'titan'
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">MARKETPLACE 10k [DEMO]</span>`
          : item.account === 'titan_25k'
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">TITAN 25k [DEMO]</span>`
          : item.account === 'titan_m5'
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/40">TITAN M5 #1 [DEMO]</span>`
          : (item.account === 'xau5m_500' || item.account === 'titan_500_2')
          ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/40">MARKETPLACE $500 [DEMO]</span>`
          : `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">GOLDM15 [DEMO]</span>`;

        const priceDetails = isOpen
          ? `<span class="text-sub font-mono">Einstieg: <strong class="text-white">$${Number.isFinite(item.open_price) ? item.open_price.toFixed(2) : '— (unbekannt)'}</strong> · Aktuell: <strong class="${isProfit ? 'text-emerald-400':'text-rose-400'}">$${Number.isFinite(item.current_price) ? item.current_price.toFixed(2) : '— (unbekannt)'}</strong></span>`
          : `<span class="text-sub font-mono">Einstieg: <strong class="text-white">$${Number.isFinite(item.open_price) ? item.open_price.toFixed(2) : '— (unbekannt)'}</strong> · Ausstieg: <strong class="text-white">$${Number.isFinite(item.close_price) ? item.close_price.toFixed(2) : '— (unbekannt)'}</strong></span>`;

        return `
          <div data-journal-key="${escapeHTML(key)}" class="glass-card rounded-lg p-3 border border-white/5 hover:border-white/15 transition-all">
            <!-- HEADER WITH PNL -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b table-border">
              <div class="flex flex-wrap items-center gap-2">
                ${stratBadge}
                ${typeBadge}
                <span class="font-mono text-xs font-bold">${escapeHTML(item.volume)} Lot</span>
                ${priceDetails}
                <span class="text-[10px] text-sub font-mono">#${escapeHTML(item.ticket)}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-[10px] text-sub font-mono">⏰ DE ${escapeHTML(item.time_de)} (Server ${escapeHTML(item.time_server)})</span>
                ${statusBadge}
                ${pnlBadge}
              </div>
            </div>

            <!-- 2 INFO BOXES -->
            <details ${isOpen ? 'open' : ''} class="mt-1">
              <summary class="cursor-pointer text-[11px] font-semibold text-amber-300 hover:text-amber-200 py-0.5 stone-journal-details-toggle">
                ${isOpen ? '▼ Begründung und Ausstiegsregeln (Aktiv)' : '▶ Begründung und Ausstiegsregel anzeigen'}
              </summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mt-1.5">
              <!-- WHY TRIGGERED -->
              <div class="stone-journal-detail rounded-md p-2.5 bg-black/20 border border-white/5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-amber-400 text-[11px] mb-1">
                    <span>🎯</span>
                    <span>Warum wurde der Trade ausgelöst? (Einstiegs-Begründung)</span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-sub">${escapeHTML(item.why_triggered)}</p>
                </div>
              </div>

              <!-- PROFIT GOAL -->
              <div class="stone-journal-detail rounded-md p-2.5 bg-black/20 border border-white/5 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-1.5 font-bold text-emerald-400 text-[11px] mb-1">
                    <span>🏁</span>
                    <span>Was ist das Profitziel / die Ausstiegsregel?</span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-sub">${escapeHTML(item.profit_goal)}</p>
                  ${isOpen && item.ema9 ? `
                    <div class="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <div class="flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">🎯 EMA9 Live: $${item.ema9.toFixed(2)}</span>
                        <span class="text-white font-bold">${item.dist_to_ema9 !== null && item.dist_to_ema9 !== undefined ? `Abstand: ${item.dist_to_ema9.toFixed(2)} Pkt` : ''}</span>
                      </div>
                      <div>
                        <span class="${item.target_usd == null ? 'text-sub' : item.profit_usd >= item.target_usd ? 'text-emerald-400 font-bold' : 'text-amber-400'}">
                          ${item.target_usd == null ? 'EA-Ausstiegsziel unbekannt' : item.profit_usd >= item.target_usd ? `✅ Mindestgewinn erreicht ($${item.profit_usd.toFixed(2)} >= $${item.target_usd.toFixed(0)}) · Ausstieg scharf` : `⏳ Mindestgewinn: Noch $${(item.target_usd - item.profit_usd).toFixed(2)} bis $${item.target_usd.toFixed(0)}`}
                        </span>
                      </div>
                    </div>
                  ` : ''}
                </div>
                ${item.sl_price ? `<div class="mt-2 text-[10px] font-mono text-sub flex gap-3">
                  <span>SL: <strong class="text-rose-400">$${item.sl_price.toFixed(2)}</strong></span>
                  <span>TP: <strong class="text-emerald-400">${item.tp_price > 0 ? '$'+item.tp_price.toFixed(2) : (item.target_usd == null ? 'Kein Broker-TP' : 'Dynamic Runner')}</strong></span>
                </div>` : ''}
              </div>
            </div>
            </details>
            ${!isOpen ? `<div class="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <button type="button" data-lifecycle-evidence-ticket="${escapeHTML(item.ticket)}"
                data-lifecycle-evidence-account="${escapeHTML(item.account)}"
                class="px-2 py-1 rounded border border-sky-400/30 text-sky-300 hover:bg-sky-400/10"
                aria-label="Lifecycle-Beleg prüfen">Lifecycle-Beleg prüfen</button>
              <span data-lifecycle-evidence-result class="text-sub" aria-live="polite"></span>
            </div>` : ''}
          </div>
        `;
      }).join('');
      const old = new Map([...list.querySelectorAll('[data-journal-key]')].map(row => [row.dataset.journalKey,row]));
      const wantedKeys = new Set(signatures.keys());
      for (const row of [...list.childNodes]) if (row.nodeType !== Node.ELEMENT_NODE || !wantedKeys.has(row.dataset.journalKey)) row.remove();
      let index = 0;
      for (const newRow of [...template.content.children]) {
        const key = newRow.dataset.journalKey, signature = signatures.get(key);
        const row = old.get(key) || newRow;
        if (row !== newRow && row.dataset.signature !== signature) {
          // Preserve the outer keyed node and focused details disclosure.
          const details = row.querySelector('details'), replacement = newRow.querySelector('details');
          row.firstElementChild.replaceChildren(...newRow.firstElementChild.childNodes);
          details.querySelector('div').replaceChildren(...replacement.querySelector('div').childNodes);
        }
        row.dataset.signature = signature;
        if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
        index++;
      }
    }

    async function applySLTP(ticket) {
      const draftAccount = activeAccount;
      const submitted = new Map([['sl-input-'+ticket,document.getElementById('sl-input-'+ticket).value],['tp-input-'+ticket,document.getElementById('tp-input-'+ticket).value]]);
      const sl_usd = parseFloat(document.getElementById(`sl-input-${ticket}`).value);
      const tp_usd = parseFloat(document.getElementById(`tp-input-${ticket}`).value);
      if (!Number.isFinite(sl_usd) || !Number.isFinite(tp_usd) || tp_usd < 0) {
        document.getElementById('position-edit-status').textContent = 'Bitte eine endliche Zahl für SL und TP eingeben. TP muss mindestens 0 USD sein.';
        return;
      }
      try {
        const res = await accountFetch('/api/modify_position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tp_usd === 0 ? { ticket, sl_usd, remove_tp: true } : { ticket, sl_usd, tp_usd })
        });
        const result = await res.json();
        if (result.success) {
          for (const id of [`sl-input-${ticket}`,`tp-input-${ticket}`]) {
            const input = document.getElementById(id);
            if (input && activeAccount === draftAccount && input.value === submitted.get(id)) {
              delete input.dataset.dirty; positionDrafts.delete(draftAccount+':'+id);
            }
          }
          const row = document.querySelector('[data-position-ticket="'+ticket+'"]');
          if (row) row.querySelector('[data-draft-note]')?.classList.toggle('hidden', !row.querySelector('[data-dirty="true"]'));
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

    function setPositionDraft(id, value) {
      const input = document.getElementById(id);
      input.value = value;
      // Synchronous user-input path publishes the draft before any request/poll.
      input.dispatchEvent(new Event('input', {bubbles:true}));
    }

    async function quickBE(ticket) {
      setPositionDraft(`sl-input-${ticket}`, "5.00");
      return applySLTP(ticket);
    }

    async function quickSL(ticket, val) {
      setPositionDraft(`sl-input-${ticket}`, val.toFixed(2));
      return applySLTP(ticket);
    }

    async function quickTP(ticket, val) {
      setPositionDraft(`tp-input-${ticket}`, val.toFixed(2));
      return applySLTP(ticket);
    }

    async function closePos(ticket, volume = null) {
      const volNum = (volume != null && Number.isFinite(Number(volume)) && Number(volume) > 0) ? Number(volume) : null;
      const volText = volNum ? `${volNum.toFixed(2)} Lot von Position #${ticket}` : `Position #${ticket}`;
      if (!confirm(`Konto ${accounts[activeAccount]?.name || accounts[activeAccount]?.login}: ${volText} wirklich sofort zum Marktpreis schließen?`)) return;
      try {
        const payload = volNum ? { ticket, volume: volNum } : { ticket };
        const res = await accountFetch('/api/close_position', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
          alert(`${volText} erfolgreich geschlossen!`);
          updateStatus();
        } else {
          alert(`Fehler: ${result.comment || result.error || 'Schließen fehlgeschlagen'}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        alert('Netzwerkfehler: ' + err);
      }
    }

    function closePosPct(ticket, fullVolume, pct) {
      const vol = Math.max(0.01, Math.round(fullVolume * pct / 100 * 100) / 100);
      const inp = document.getElementById('close-lot-' + ticket);
      if (inp) inp.value = vol.toFixed(2);
      closePos(ticket, vol);
    }

    function closePosCustom(ticket) {
      const inp = document.getElementById('close-lot-' + ticket);
      const vol = inp ? parseFloat(inp.value) : null;
      closePos(ticket, vol);
    }

    // --- DAILY DRAWDOWN RESET MODAL CONTROLS ---
    let resetReturnFocus = null;
    document.addEventListener('keydown', event => {
      const modal = document.getElementById('dd-reset-modal');
      if (modal.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); closeDrawdownResetModal();
      } else if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, true);
    function refreshResetModalValues() {
      const dd = currentData?.daily_drawdown;
      document.getElementById('modal-current-bal').textContent = Number.isFinite(dd?.balance) ? '$'+dd.balance.toFixed(2) : 'unbekannt';
      document.getElementById('modal-current-dd').textContent = Number.isFinite(dd?.pct) && Number.isFinite(dd?.loss_usd) ? `${dd.pct.toFixed(2)}% (-$${dd.loss_usd.toFixed(2)})` : 'unbekannt';
      document.getElementById('modal-reset-status-row').classList.toggle('hidden', !dd?.manual_active);
      document.getElementById('modal-reset-status-text').textContent = dd?.manual_active ? `Aktiv seit ${dd.reset_time_str || ''} @ ${Number.isFinite(dd.reset_balance) ? '$'+dd.reset_balance.toFixed(2) : 'unbekannt'}` : '';
    }
    function openDrawdownResetModal() {
      if (!accountActionsReady()) return;
      const acc = accounts[activeAccount];
      const isChallenge = acc?.challenge_protection === true;
      document.getElementById('reset-description').textContent = activeAccount==='goldm15'
        ? 'Konto '+acc.login+': Dieser Reset betrifft ausschließlich die Dashboard-Anzeige. Er verändert weder die feste $350-Tagesgrenze noch die EA-Baseline oder bestehende Handelssperren.'
        : !isChallenge
        ? 'Konto '+acc.login+' ('+acc.name+'): Setzt den Tagesverlust und die High-Water-Mark auf 0.00% zurück. Normales Trading-Konto ohne Challenge-Notbremsen.'
        : 'Setzt den Tagesverlust und die High-Water-Mark auf 0.00% zurück. Trades vor dem Reset werden für die heutige Drawdown-Berechnung ignoriert.';
      document.getElementById('reset-help').textContent = activeAccount==='goldm15'
        ? 'Referenzwert nur für die Anzeige; der tatsächliche EA-Schutzstatus steht separat im Dashboard.'
        : !isChallenge
        ? 'Die Baseline (' + (acc?.initial_balance ? '$'+acc.initial_balance : '$500') + ') zur Berechnung des relativen Tages-Drawdowns (keine Notbremsen aktiv).'
        : 'Die Baseline, ab der die 3.5% EA- und 4.0% Broker-Notbremse gerechnet wird.';
      const modal = document.getElementById('dd-reset-modal');
      const input = document.getElementById('dd-reset-input');
      const initBal = acc?.initial_balance || 10000.0;
      const currentBal = (currentData && currentData.daily_drawdown && Number.isFinite(currentData.daily_drawdown.balance))
        ? currentData.daily_drawdown.balance
        : initBal;

      const initBtn = document.getElementById('modal-preset-init-btn');
      if (initBtn) {
        initBtn.textContent = '$' + (initBal >= 1000 ? (initBal / 1000) + 'k' : initBal);
      }

      refreshResetModalValues();

      if (!input.value || parseFloat(input.value) <= 0) {
        input.value = currentBal.toFixed(2);
      }
      resetReturnFocus = document.activeElement;
      modal.classList.remove('hidden');
      for (const region of document.querySelectorAll('body > nav,body > header,#account-content')) region.inert = true;
      input.focus();
    }

    function closeDrawdownResetModal() {
      document.getElementById('dd-reset-modal').classList.add('hidden');
      for (const region of document.querySelectorAll('body > nav,body > header,#account-content')) region.inert = false;
      if (resetReturnFocus?.isConnected) resetReturnFocus.focus();
      resetReturnFocus = null;
    }

    function setModalInputBal(val) {
      document.getElementById('dd-reset-input').value = val.toFixed(2);
    }

    function setModalInputBalInit() {
      const initBal = accounts[activeAccount]?.initial_balance || 10000.0;
      setModalInputBal(initBal);
    }

    function setModalInputBalCurrent() {
      const currentBal = (currentData && currentData.daily_drawdown && Number.isFinite(currentData.daily_drawdown.balance))
        ? currentData.daily_drawdown.balance
        : (accounts[activeAccount]?.initial_balance || 10000.0);
      document.getElementById('dd-reset-input').value = currentBal.toFixed(2);
    }

    async function executeDrawdownReset() {
      const input = document.getElementById('dd-reset-input');
      const val = Number(input.value);
      const invalid = !input.value.trim() || !Number.isFinite(val) || val <= 0;
      input.setAttribute('aria-invalid', String(invalid));
      document.getElementById('dd-reset-error').textContent = invalid ? 'Bitte einen endlichen, positiven Referenzwert in USD eingeben.' : '';
      if (invalid) { input.focus(); return; }
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

    let bootstrapBusy = false, bootstrapAttempt = 0;
    async function bootstrapAccounts() {
      if (bootstrapBusy || document.hidden) return;
      bootstrapBusy = true;
      try {
        const response = await DashboardRuntime.request(BASE_PATH + '/api/accounts');
        if (!response.ok) throw new Error('Kontoliste nicht verfügbar');
        const data = await response.json();
        if (!Array.isArray(data.accounts) || !data.accounts.length || !data.accounts.some(a => a.id === data.default)) throw new Error('Kontoliste ungültig');
        accounts = Object.fromEntries(data.accounts.map(a => [a.id,a]));
        const switcher = document.getElementById('account-switcher');
        if (switcher) {
          for (const acc of data.accounts) {
            if (!switcher.querySelector(`[data-account="${acc.id}"]`)) {
              const btn = document.createElement('button');
              btn.className = 'account-tab';
              btn.dataset.account = acc.id;
              btn.setAttribute('aria-pressed', 'false');
              btn.onclick = () => switchAccount(acc.id);
              btn.innerHTML = `<div class="flex items-center justify-between gap-1.5"><strong>${escapeHTML(acc.name)}</strong><span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold border border-slate-600">DEMO</span></div><small>${escapeHTML(acc.login)} · ${escapeHTML(acc.server)}</small>`;
              switcher.append(btn);
            }
          }
        }
        const saved = localStorage.getItem('gold_dashboard_account');
        const selected = accounts[deepLinkedAccount] ? deepLinkedAccount : (accounts[saved] ? saved : data.default);
        if (journalFilter !== 'all' && !accounts[journalFilter]) journalFilter = selected;
        const journalSelect = document.getElementById('journal-strategy-filter');
        if (journalSelect) journalSelect.value = journalFilter;
        await switchAccount(selected);
        void refreshJournal();
        bootstrapAttempt = 0;
      } catch(error) {
        reportAccountError(error, accountGeneration);
        setTimeout(() => { void bootstrapAccounts(); }, Math.min(15000, 1000 * 2 ** Math.min(bootstrapAttempt++, 4)));
      } finally { bootstrapBusy = false; }
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (!Object.keys(accounts).length) void bootstrapAccounts();
        else { if (!accountIsFresh()) markStatusStale(); void updateStatus(); void refreshJournal(); }
      }
    });
    let dashboardBootStarted = false;
    const bootDashboard = async () => {
      if (dashboardBootStarted) return;
      dashboardBootStarted = true;
      clearAccountView(); // Unknown state also when the first accounts request fails.
      initTheme();
      const navMobile = document.getElementById('nav-mobile-link');
      if (navMobile) navMobile.href = BASE_PATH + '/mobile';
      const navAscii = document.getElementById('nav-ascii-link');
      if (navAscii) navAscii.href = BASE_PATH + '/ascii';
      updateChartPositionsButtonUI();
      updatePriceLevelLegendButtonUI();
      initChartLevelLegendDrag();
      try { initChart(); }
      catch (error) { console.warn('Optionale Chartinitialisierung fehlgeschlagen:', error); }
      // Apply theme to freshly created chart instance
      applyTheme(localStorage.getItem('titan_theme') || 'dark');
      await bootstrapAccounts();
      setInterval(() => {
        if (lastStatusSuccess && !accountIsFresh()) markStatusStale();
        if (!document.hidden) void updateStatus();
      }, 1500); // freshness watchdog also expires a suspended poll
      setInterval(loadCandles, 5000);   // 5s smooth candle update (no reset)
      setInterval(() => { void refreshJournal(); }, 30000); // independent, low-rate journal sync
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { void bootDashboard(); }, { once: true });
    } else {
      void bootDashboard();
    }
  </script>
  <!-- Visual-only extension: live MT5 and TradingView handlers remain untouched -->
  <script src="static/stone-cockpit.js"></script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index():
    enabled = os.getenv("CHART_STUDIO_V5_PREVIEW_ENABLED", "0") == "1"
    flag = "true" if enabled else "false"
    return HTMLResponse(content=HTML_CONTENT.replace(
        "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;",
        f"window.CHART_STUDIO_V5_PREVIEW_ENABLED = {flag};",
        1))

@app.get("/mobile", response_class=HTMLResponse)
@app.get("/light", response_class=HTMLResponse)
def mobile_view():
    return HTMLResponse(content=MOBILE_HTML)

@app.get("/ascii", response_class=HTMLResponse)
@app.get("/terminal", response_class=HTMLResponse)
def ascii_view():
    return HTMLResponse(content=ASCII_HTML)

# --- BITUNIX TRADING BRIDGE INTEGRATION ---
from bitunix_bridge import BitunixBridge

bitunix_bridge_instance = BitunixBridge()

@app.get("/api/bitunix/status")
def bitunix_status(request: Request):
    identity = getattr(request.state, "control_identity", None)
    if identity is None:
        raise HTTPException(status_code=401, detail="Dashboard identity required")
    if len(identity) < 3 or identity[2] != "trade":
        raise HTTPException(status_code=403, detail="Trade role required")
    return bitunix_bridge_instance.get_status()

_bitunix_stop = threading.Event()
_bitunix_worker_thread = None

def _bitunix_worker_loop():
    while not _bitunix_stop.is_set():
        try:
            if bitunix_bridge_instance.write_gate_open:
                bitunix_bridge_instance.sync_once(mt5)
        except Exception:
            logger.exception("Bitunix bridge worker iteration failed")
        _bitunix_stop.wait(max(0.5, float(bitunix_bridge_instance.config.get("sync_interval_seconds", 2.0))))

@app.on_event("startup")
def start_bitunix_worker():
    global _bitunix_worker_thread
    if bitunix_bridge_instance.write_gate_open and (_bitunix_worker_thread is None or not _bitunix_worker_thread.is_alive()):
        _bitunix_stop.clear()
        _bitunix_worker_thread = threading.Thread(target=_bitunix_worker_loop, daemon=True, name="BitunixBridgeWorker")
        _bitunix_worker_thread.start()

@app.on_event("shutdown")
def stop_bitunix_worker():
    _bitunix_stop.set()
    if _bitunix_worker_thread and _bitunix_worker_thread.is_alive():
        _bitunix_worker_thread.join(timeout=3.0)

if __name__ == "__main__":
    print("Starte XAU Titan Pro Institutional Cockpit auf http://127.0.0.1:8050 ...")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get('DASHBOARD_PORT', '8050')), log_level="warning", proxy_headers=False)
