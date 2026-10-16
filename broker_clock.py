"""Explicit per-account broker clock policy, never inferred from live quotes."""
from datetime import datetime, timezone, timedelta
import numbers


def offset_seconds(account):
    value = account.get('broker_utc_offset_seconds')
    if isinstance(value, bool) or not isinstance(value, int) or not -43200 <= value <= 50400:
        raise ValueError('Broker-UTC-Offset fehlt/ungültig; Steuerung gesperrt.')
    return value


def to_utc_epoch(raw_epoch, account):
    return raw_epoch - offset_seconds(account)


def to_broker_epoch(utc_epoch, account):
    return utc_epoch + offset_seconds(account)


def rates_to_utc_epoch(raw_epoch, account):
    """Normalize one MT5 rates timestamp using an explicitly verified source basis."""
    if isinstance(raw_epoch, bool) or not isinstance(raw_epoch, numbers.Integral) or raw_epoch <= 0:
        raise ValueError('invalid rates timestamp')
    raw_epoch = int(raw_epoch)
    basis = account.get('rates_time_basis', 'UTC')
    if basis == 'UTC':
        return raw_epoch
    if basis == 'BROKER_SERVER':
        return to_utc_epoch(raw_epoch, account)
    raise ValueError('MT5 bar time basis missing/invalid; analytics unavailable.')


def rates_offset_seconds(account):
    """Return the explicit raw-rates-to-UTC correction for cursor arithmetic."""
    basis = account.get('rates_time_basis', 'UTC')
    if basis == 'UTC':
        return 0
    if basis == 'BROKER_SERVER':
        return offset_seconds(account)
    raise ValueError('MT5 bar time basis missing/invalid; analytics unavailable.')


def zone_label(account):
    offset = offset_seconds(account)
    if offset == 0:
        return 'UTC'
    sign = '+' if offset >= 0 else '-'
    hours, seconds = divmod(abs(offset), 3600)
    return f'Broker UTC{sign}{hours:02d}:{seconds//60:02d} (explizit konfiguriert)'
