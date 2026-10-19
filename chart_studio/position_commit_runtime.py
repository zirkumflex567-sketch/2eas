"""Per-process durable runtime for position protection commits."""

import os
from pathlib import Path

from chart_studio.position_commit import PositionCommitService
from chart_studio.position_commit_store import PositionCommitStore


def create_process_position_commit_runtime(*, mt5, previews, guard, private_dir,
                                           checkout_root, process_id=None,
                                           pid_alive=None):
    """Create and recover this process's private idempotency store before traffic.

    Preview IDs and the preview registry are process-local, so sharing a store
    across serving processes would let startup recovery misclassify another
    process's active reservation as interrupted. The PID-specific file keeps
    recovery scoped to the process that owns its reservations.
    """
    pid = process_id if process_id is not None else os.getpid()
    if type(pid) is not int or pid <= 0:
        raise ValueError('A positive process id is required')
    directory = Path(private_dir).expanduser()
    if not directory.is_absolute():
        raise ValueError('Private runtime directory must be absolute')
    is_alive = pid_alive or _pid_alive
    for stale_path in (directory.glob('position-commit-*.sqlite3') if directory.is_dir() else ()):
        try:
            owner_pid = int(stale_path.stem.removeprefix('position-commit-'))
        except ValueError:
            continue
        if owner_pid != pid and not is_alive(owner_pid):
            stale_store = PositionCommitStore(stale_path, checkout_root=checkout_root)
            stale_store.recover_interrupted()
    store = PositionCommitStore(directory / f'position-commit-{pid}.sqlite3',
                                checkout_root=checkout_root)
    store.recover_interrupted()
    service = PositionCommitService(mt5, previews, store, guard)
    return store, service


def _pid_alive(pid):
    if os.name == 'nt':
        try:
            import ctypes
            from ctypes import wintypes
            kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            open_process = kernel32.OpenProcess
            open_process.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
            open_process.restype = wintypes.HANDLE
            get_exit_code = kernel32.GetExitCodeProcess
            get_exit_code.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
            get_exit_code.restype = wintypes.BOOL
            close_handle = kernel32.CloseHandle
            close_handle.argtypes = (wintypes.HANDLE,)
            close_handle.restype = wintypes.BOOL
            handle = open_process(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not handle:
                # Only ERROR_INVALID_PARAMETER conclusively means no process.
                # Access-denied and all other failures are treated as alive.
                return ctypes.get_last_error() != 87
            try:
                exit_code = wintypes.DWORD()
                if not get_exit_code(handle, ctypes.byref(exit_code)):
                    return True
                return exit_code.value == 259  # STILL_ACTIVE
            finally:
                close_handle(handle)
        except Exception:
            # Unknown Windows process state must never authorize recovery of a
            # store that could still belong to an active writer.
            return True
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        # Unknown process state must not authorize recovery of another writer.
        return True
