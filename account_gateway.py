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

ACCOUNTS = {
    'titan': dict(id='titan', name='XAU Titan Pro', login=53087839,
                  server='ICMarketsEU-Demo', terminal=r'C:\Program Files\PU Prime MT5 Terminal\terminal64.exe',
                  portable=False, version='v6.0 LIVE', capacity=3),
    'goldm15': dict(id='goldm15', name='GoldM15 Reconstruction', login=53090070,
                    server='ICMarketsEU-Demo', terminal=r'C:\Users\zirku\Documents\goldm5\.mt5-demo\terminal64.exe',
                    portable=True, version='v1.21 GUARDED', capacity=3),
}
_selected = ContextVar('dashboard_account', default='titan')
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
def session(mt5, account='titan'):
    """Reuse a verified terminal between reads; isolate every account under one lock.

    Switching terminals always reattaches. Every request re-verifies login,
    server, terminal path and connection state; a mismatch fails closed.
    """
    global _attached_mt5, _attached_account
    if account not in ACCOUNTS:
        raise HTTPException(400, 'Unbekannter Account.')
    spec = ACCOUNTS[account]
    with _lock:
        if not terminal_running(spec['terminal']):
            if _attached_mt5 is mt5:
                _disconnect(mt5)
            raise HTTPException(503, f"{spec['name']}: MT5-Terminal läuft nicht. Bitte selbst öffnen.")
        token = _selected.set(account)
        try:
            if _attached_mt5 is not mt5 or _attached_account != account:
                _disconnect(mt5)
                if not mt5.initialize(spec['terminal'], portable=spec['portable'], timeout=5000):
                    raise HTTPException(503, f"{spec['name']}: MT5-Verbindung fehlgeschlagen.")
                _attached_mt5, _attached_account = mt5, account
            try:
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
            with session(mt5, kwargs.get('account', 'titan')):
                return func(*args, **kwargs)
        return wrapped
    return decorate
