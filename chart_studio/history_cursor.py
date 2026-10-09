"""Bounded, authenticated process-local history cursors; no credentials or storage."""
import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_FLOOR
import hashlib
import hmac
import json
import re
import secrets

from fastapi import HTTPException

_KEY = secrets.token_bytes(32)
MAX_CURSOR_LENGTH = 2048
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
UTC_PATTERN = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$'


def utc_range(start, stop):
    """Require explicit UTC, canonicalize without local timezone or float rounding."""
    try:
        if not all(isinstance(v, str) and re.fullmatch(UTC_PATTERN, v) for v in (start, stop)):
            raise ValueError('explicit UTC required')
        dates = [datetime.fromisoformat(v.replace('Z', '+00:00')) for v in (start, stop)]
        if dates[0] < EPOCH or not timedelta(0) < dates[1]-dates[0] <= timedelta(days=31):
            raise ValueError('invalid range')
        return tuple(epoch_us(v) for v in dates)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, 'fromUtc/toUtc müssen einen expliziten UTC-Zeitraum bis 31 Tage angeben.') from exc


def epoch_us(value):
    delta = value-EPOCH
    return (delta.days*86400+delta.seconds)*1000000+delta.microseconds


def utc_datetime(value):
    return EPOCH+timedelta(microseconds=value)


def utc_text(value):
    return utc_datetime(value).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def observed_us(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError('invalid observation clock')
    number = Decimal(str(value))
    if not number.is_finite() or number < 0:
        raise ValueError('invalid observation clock')
    result = int((number*1000000).to_integral_value(rounding=ROUND_FLOOR))
    utc_datetime(result)  # also reject clocks outside datetime's supported range
    return result


def digest(value):
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return hashlib.sha256(encoded.encode('ascii')).hexdigest()


def invalid_cursor():
    return HTTPException(410, {'code':'CURSOR_INVALID_OR_EXPIRED',
                              'message':'History cursor invalid or expired; start a new request.'})


def encode(scope, asof, after, snapshot):
    payload = json.dumps({'v':1, 'scope':scope, 'asof':asof, 'after':list(after),
                          'snapshot':snapshot}, sort_keys=True, separators=(',', ':')).encode('ascii')
    signed = payload+hmac.digest(_KEY, payload, 'sha256')
    token = base64.urlsafe_b64encode(signed).rstrip(b'=').decode('ascii')
    if len(token) > MAX_CURSOR_LENGTH:
        raise ValueError('cursor too large')
    return token


def decode(token, scope, stop, observed):
    try:
        if not isinstance(token, str) or not 1 <= len(token) <= MAX_CURSOR_LENGTH:
            raise ValueError('cursor size')
        if not re.fullmatch(r'[A-Za-z0-9_-]+', token):
            raise ValueError('cursor encoding')
        signed = base64.b64decode(token+'='*(-len(token)%4), altchars=b'-_', validate=True)
        # Refuse alternate encodings of identical signed bytes.
        if base64.urlsafe_b64encode(signed).rstrip(b'=').decode('ascii') != token or len(signed) <= 32:
            raise ValueError('noncanonical cursor')
        payload, signature = signed[:-32], signed[-32:]
        if not hmac.compare_digest(signature, hmac.digest(_KEY, payload, 'sha256')):
            raise ValueError('cursor signature')
        data = json.loads(payload)
        if set(data) != {'v','scope','asof','after','snapshot'} or data['v'] != 1 or data['scope'] != scope:
            raise ValueError('cursor scope')
        if type(data['asof']) is not int or not 0 <= data['asof'] <= min(stop, observed):
            raise ValueError('future cursor')
        if not isinstance(data['after'], list) or len(data['after']) != 2 or not all(type(v) is int and v > 0 for v in data['after']):
            raise ValueError('cursor boundary')
        if not isinstance(data['snapshot'], str) or not re.fullmatch(r'[0-9a-f]{64}', data['snapshot']):
            raise ValueError('cursor snapshot')
        return data
    except (ValueError, TypeError, KeyError, UnicodeError) as exc:
        raise invalid_cursor() from exc
