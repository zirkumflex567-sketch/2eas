"""Explicit per-account broker clock policy, never inferred from live quotes."""
from datetime import datetime, timezone, timedelta


def offset_seconds(account):
    value = account.get('broker_utc_offset_seconds')
    if isinstance(value, bool) or not isinstance(value, int) or not -43200 <= value <= 50400:
        raise ValueError('Broker-UTC-Offset fehlt/ungültig; Steuerung gesperrt.')
    return value


def to_utc_epoch(raw_epoch, account):
    return raw_epoch - offset_seconds(account)


def to_broker_epoch(utc_epoch, account):
    return utc_epoch + offset_seconds(account)


def zone_label(account):
    offset = offset_seconds(account)
    if offset == 0:
        return 'UTC'
    sign = '+' if offset >= 0 else '-'
    hours, seconds = divmod(abs(offset), 3600)
    return f'Broker UTC{sign}{hours:02d}:{seconds//60:02d} (explizit konfiguriert)'
