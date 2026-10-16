"""One validated MT5 account per complete request; terminal processes are never launched."""
import ctypes
import ntpath
import threading
import atexit
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from pathlib import Path

from fastapi import HTTPException
import broker_telemetry

ACCOUNTS = {
    'blueberry': dict(id='blueberry', name='Blueberry Funded (Prop-Firma)', login=5120620,
                      server='BlueberryMarketsSVG-Live', company='Blueberry Markets (SVG) LLC',
                      terminal=r'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194619\terminal64.exe',
                      portable=True, version='Phase 1 LIVE PROP', capacity=3, broker_utc_offset_seconds=10800,
                      symbol='XAUUSD.pi', timeframe='M15', initial_balance=10000.0, leverage='1:30',
                      account_type='PROPFIRMA', is_demo=False, badge='PROPFIRMA',
                      daily_loss_limit_pct=4.0, max_loss_limit_pct=10.0, max_loss_floor=9000.0,
                      challenge_protection=True),
    'titan': dict(id='titan', name='Marketplace XAUUSD 5 minute (ICMarkets 10k)', login=53087839,
                  server='ICMarketsEU-Demo', company='IC Markets (EU) Ltd',
                  terminal=r'C:\Program Files\PU Prime MT5 Terminal\terminal64.exe',
                  portable=False, version='Marketplace-EA XAUUSD 5 minute', analysis_mode='INDICATORS_ONLY', capacity=3, broker_utc_offset_seconds=10800, rates_time_basis='BROKER_SERVER',
                  symbol='XAUUSD', timeframe='M15', initial_balance=10000.0, leverage='1:10',
                  account_type='DEMO', is_demo=True, badge='DEMO 10k',
                  challenge_protection=False),
    'xau5m_m5': dict(id='xau5m_m5', name='XAUUSD 5 Minute (M5 $250)', login=700194619,
                     server='PUPrime-Demo', company='PU Prime Ltd',
                     terminal=r'C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable\terminal64.exe',
                     portable=True, version='v7.3 M5 (250$)', capacity=3, broker_utc_offset_seconds=10800, rates_time_basis='BROKER_SERVER',
                     symbol='XAUUSD.p', timeframe='M15', initial_balance=250.0, leverage='1:500',
                     account_type='DEMO', is_demo=True, badge='DEMO 250$',
                     challenge_protection=False),
    'titan_m5': dict(id='titan_m5', name='XAU Titan Pro (M5 $500)', login=700184986,
                     server='PUPrime-Demo', company='PU Prime Ltd',
                     terminal=r'C:\Users\zirku\Documents\goldm5\.mt5-puprime\terminal64.exe',
                     portable=True, version='v7.1 M5 (500$)', capacity=3, broker_utc_offset_seconds=10800, rates_time_basis='BROKER_SERVER',
                     symbol='XAUUSD.p', timeframe='M15', initial_balance=500.0, leverage='1:500',
                     account_type='DEMO', is_demo=True, badge='DEMO 500$',
                     challenge_protection=False),
    'xau5m_500': dict(id='xau5m_500', name='Marketplace XAUUSD 5 minute (PU Prime 500)', login=700194822,
                        server='PUPrime-Demo', company='PU Prime Ltd',
                        terminal=r'C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194822\terminal64.exe',
                        portable=True, version='Marketplace-EA XAUUSD 5 minute', analysis_mode='INDICATORS_ONLY', capacity=3, broker_utc_offset_seconds=10800, rates_time_basis='BROKER_SERVER',
                        symbol='XAUUSD.p', timeframe='M15', initial_balance=500.0, leverage='1:500',
                        account_type='DEMO', is_demo=True, badge='DEMO 500$',
                        challenge_protection=False),
    'goldm15': dict(id='goldm15', name='GoldM15 Reconstruction', login=53090070,
                    server='ICMarketsEU-Demo', company='IC Markets (EU) Ltd',
                    terminal=r'C:\Users\zirku\Documents\goldm5\.mt5-demo\terminal64.exe',
                    portable=True, version='v1.21 GUARDED', capacity=3, broker_utc_offset_seconds=10800,
                    symbol='XAUUSD', timeframe='M15', initial_balance=10000.0, leverage='1:10',
                    account_type='DEMO', is_demo=True, badge='DEMO 10k',
                    challenge_protection=False, hidden=True),
}
ACCOUNTS['titan_500_2'] = ACCOUNTS['xau5m_500']  # Compatibility alias
ACCOUNTS['xau5m_m15'] = ACCOUNTS['xau5m_m5']  # Compatibility alias
ACCOUNTS['titan_25k'] = ACCOUNTS['xau5m_m5']  # Compatibility alias
_selected = ContextVar('dashboard_account', default='blueberry')
_lock = threading.RLock()
_attached_mt5 = None
_attached_account = None


def _disconnect(mt5):
    """Call only while holding _lock; never keep a session after identity failure."""
    global _attached_mt5, _attached_account
    try:
        mt5.shutdown()
    finally:
        _attached_mt5 = None
        _attached_account = None


def _shutdown_at_exit():
    with _lock:
        if _attached_mt5 is not None:
            _disconnect(_attached_mt5)


atexit.register(_shutdown_at_exit)


def selected():
    return ACCOUNTS[_selected.get()]


def public_account(account):
    return {k: v for k, v in account.items() if k not in ('terminal', 'portable')}


def config_path(directory, account=None):
    account = account or _selected.get()
    return Path(directory) / ('drawdown_config.json' if account == 'titan' else f'drawdown_config_{account}.json')


def writes_titan_reset(account=None):
    return (account or _selected.get()) == 'titan'


def terminal_running(path):
    """Read process image paths with Win32; no shell, launch, login, or dependency."""
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    ids = (wintypes.DWORD * 4096)()
    used = wintypes.DWORD()
    if not psapi.EnumProcesses(ids, ctypes.sizeof(ids), ctypes.byref(used)):
        return False
    target = ntpath.normcase(ntpath.normpath(path))
    for pid in ids[:used.value // ctypes.sizeof(wintypes.DWORD)]:
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            continue
        try:
            buffer = ctypes.create_unicode_buffer(32768)
            length = wintypes.DWORD(len(buffer))
            if kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(length)):
                if ntpath.normcase(ntpath.normpath(buffer.value)) == target:
                    return True
        finally:
            kernel.CloseHandle(handle)
    return False


def verify_identity(mt5, account):
    info, terminal = mt5.account_info(), mt5.terminal_info()
    if not info or info.login != account['login'] or info.server != account['server']:
        raise HTTPException(409, f"Kontozuordnung stimmt nicht: erwartet {account['login']} / {account['server']}.")
    expected = ntpath.normcase(ntpath.dirname(account['terminal']))
    actual = ntpath.normcase(ntpath.normpath(getattr(terminal, 'path', ''))) if terminal else ''
    if actual != expected or not getattr(terminal, 'connected', False):
        raise HTTPException(503, 'Das zugeordnete MT5-Terminal ist nicht verbunden.')
    if account['portable'] and ntpath.normcase(ntpath.normpath(getattr(terminal, 'data_path', ''))) != expected:
        raise HTTPException(409, 'MT5-Datenverzeichnis stimmt nicht mit dem Demo-Terminal überein.')
    return info


@contextmanager
def session(mt5, account='blueberry'):
    """Reuse a verified terminal between reads; isolate every account under one lock.

    Switching terminals always reattaches. Every request re-verifies login,
    server, terminal path and connection state; a mismatch fails closed.
    """
    global _attached_mt5, _attached_account
    if account not in ACCOUNTS:
        raise HTTPException(400, 'Unbekannter Account.')
    spec = ACCOUNTS[account]
    with broker_telemetry.measured_lock(_lock):
        if not terminal_running(spec['terminal']):
            if _attached_mt5 is mt5:
                _disconnect(mt5)
            raise HTTPException(503, f"{spec['name']}: MT5-Terminal läuft nicht. Bitte selbst öffnen.")
        token = _selected.set(account)
        try:
            # A cached handle may have been detached externally (terminal restart
            # or test adapter swap). Reattach once, then verify identity anew.
            reused = False
            if _attached_mt5 is mt5 and _attached_account in ACCOUNTS:
                curr = ACCOUNTS[_attached_account]
                if (curr['terminal'] == spec['terminal'] and
                    curr['login'] == spec['login'] and
                    curr['server'] == spec['server']):
                    try:
                        reused = bool(mt5.account_info()) and bool(mt5.terminal_info())
                    except (TypeError, AttributeError):
                        reused = False
            if not reused:
                _disconnect(mt5)
                with broker_telemetry.span('mt5_initialize'):
                    initialized = mt5.initialize(spec['terminal'], portable=spec['portable'], timeout=5000)
                if not initialized:
                    raise HTTPException(503, f"{spec['name']}: MT5-Verbindung fehlgeschlagen.")
                _attached_mt5, _attached_account = mt5, account
            else:
                _attached_account = account
            try:
                with broker_telemetry.span('mt5_identity_verify'):
                    verify_identity(mt5, spec)
            except Exception:
                _disconnect(mt5)
                raise
            yield spec
        finally:
            _selected.reset(token)


def scoped(mt5):
    def decorate(func):
        @wraps(func)
        def wrapped(*args, **kwargs):
            account = kwargs.get('account', 'blueberry')
            with traced_session(mt5, account):
                return func(*args, **kwargs)
        return wrapped
    return decorate


@contextmanager
def traced_session(mt5, account='blueberry'):
    """Collect safe timing spans around one existing verified session."""
    with broker_telemetry.request_trace(account):
        with session(mt5, account) as spec:
            yield spec
