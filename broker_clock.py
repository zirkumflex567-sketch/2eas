"""Explicit per-account broker clock policy, never inferred from live quotes."""
from datetime import datetime, timezone, timedelta
import numbers
import time
from zoneinfo import ZoneInfo

_NEW_YORK = ZoneInfo('America/New_York')


def offset_seconds(account, at_utc_epoch=None):
    policy = account.get('broker_clock_policy')
    if policy not in (None, 'NEW_YORK_CLOSE'):
        raise ValueError('Brokerzeitregel fehlt/ungültig; Steuerung gesperrt.')
    if policy == 'NEW_YORK_CLOSE':
        if isinstance(at_utc_epoch, bool):
            raise ValueError('Brokerzeitpunkt fehlt/ungültig; Steuerung gesperrt.')
        instant = time.time() if at_utc_epoch is None else at_utc_epoch
        try:
            eastern_offset = datetime.fromtimestamp(instant, timezone.utc).astimezone(_NEW_YORK).utcoffset()
        except (TypeError, ValueError, OverflowError, OSError) as exc:
            raise ValueError('Brokerzeitpunkt fehlt/ungültig; Steuerung gesperrt.') from exc
        if eastern_offset is None:
            raise ValueError('Brokerzeitregel nicht auflösbar; Steuerung gesperrt.')
        value = int(eastern_offset.total_seconds()) + 7 * 3600
        if not -43200 <= value <= 50400:
            raise ValueError('Broker-UTC-Offset außerhalb des gültigen Bereichs.')
        return value
    value = account.get('broker_utc_offset_seconds')
    if isinstance(value, bool) or not isinstance(value, int) or not -43200 <= value <= 50400:
        raise ValueError('Broker-UTC-Offset fehlt/ungültig; Steuerung gesperrt.')
    return value


def offset_for_broker_epoch(raw_epoch, account):
    """Resolve an offset at the UTC instant represented by a broker-wall epoch."""
    if account.get('broker_clock_policy') != 'NEW_YORK_CLOSE':
        return offset_seconds(account)
    if isinstance(raw_epoch, bool) or not isinstance(raw_epoch, numbers.Real):
        raise ValueError('Brokerzeitpunkt fehlt/ungültig; Steuerung gesperrt.')
    try:
        year = datetime.fromtimestamp(raw_epoch, timezone.utc).year
    except (ValueError, OverflowError, OSError) as exc:
        raise ValueError('Brokerzeitpunkt fehlt/ungültig; Steuerung gesperrt.') from exc
    candidates = set()
    for candidate_year in (year-1, year, year+1):
        for month in (1, 7):
            eastern = datetime(candidate_year, month, 15, tzinfo=timezone.utc).astimezone(_NEW_YORK)
            candidates.add(int(eastern.utcoffset().total_seconds()) + 7*3600)
    matches = [offset for offset in candidates
               if offset_seconds(account, raw_epoch-offset) == offset]
    if len(matches) == 1:
        return matches[0]
    raise ValueError('Brokerzeit liegt in einem uneindeutigen DST-Übergang; Zeitbasis unbekannt.')


def offset_source(account):
    return 'BROKER_CLOCK_POLICY' if account.get('broker_clock_policy') == 'NEW_YORK_CLOSE' else 'ACCOUNT_CONFIG'


def to_utc_epoch(raw_epoch, account):
    return raw_epoch - offset_for_broker_epoch(raw_epoch, account)


def to_broker_epoch(utc_epoch, account):
    return utc_epoch + offset_seconds(account, utc_epoch)


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


def rates_offset_seconds(account, at_utc_epoch=None):
    """Return the explicit raw-rates-to-UTC correction for cursor arithmetic."""
    basis = account.get('rates_time_basis', 'UTC')
    if basis == 'UTC':
        return 0
    if basis == 'BROKER_SERVER':
        return offset_seconds(account, at_utc_epoch)
    raise ValueError('MT5 bar time basis missing/invalid; analytics unavailable.')


def zone_label(account, at_utc_epoch=None):
    offset = offset_seconds(account, at_utc_epoch)
    if offset == 0:
        return 'UTC'
    sign = '+' if offset >= 0 else '-'
    hours, seconds = divmod(abs(offset), 3600)
    source = 'New-York-Close/DST-Regel' if account.get('broker_clock_policy') == 'NEW_YORK_CLOSE' else 'explizit konfiguriert'
    return f'Broker UTC{sign}{hours:02d}:{seconds//60:02d} ({source})'
