"""Fail-closed reader for the read-only MQL5 calendar bridge snapshot."""
from datetime import datetime, timezone
import json
from pathlib import Path


MAX_AGE_SECONDS = 120
MAX_OFFSET_SECONDS = 14 * 3600


def _utc_epoch(value):
    if not isinstance(value, str):
        raise ValueError('timestamp required')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError('UTC timestamp required')
    return parsed.timestamp()


def _unavailable(reason, *, time_basis='UNKNOWN'):
    return {'status': 'UNAVAILABLE', 'reason': reason, 'timeBasis': time_basis,
            'events': [], 'coverage': {'status': 'UNKNOWN'},
            'cancellationSemantics': 'NOT_EXPOSED_BY_MT5_CALENDAR',
            'missingEventsMean': 'UNKNOWN'}


def load_snapshot(path, *, account, symbol, now, expected_server_utc_offset=None):
    """Load one identity-bound bridge file; never infer cancellation or UTC."""
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if (not isinstance(data, dict) or data.get('schema') != 'mt5-calendar-v1' or
                data.get('account') != account or data.get('symbol') != symbol or
                data.get('currency') != 'USD'):
            return _unavailable('IDENTITY_OR_SCHEMA_MISMATCH')
        offset = data.get('serverUtcOffsetSeconds')
        if (isinstance(offset, bool) or not isinstance(offset, int) or
                offset != expected_server_utc_offset or
                abs(offset) > MAX_OFFSET_SECONDS):
            return _unavailable('SERVER_TIMEZONE_UNVERIFIED')
        captured = _utc_epoch(data.get('capturedAtUtc'))
        age = now - captured
        if age < -5:
            return _unavailable('CAPTURE_TIME_IN_FUTURE', time_basis='BROKER_SERVER')
        status = 'STALE' if age > MAX_AGE_SECONDS else 'AVAILABLE'
        coverage = data.get('coverage')
        events = data.get('events')
        if (not isinstance(coverage, dict) or not isinstance(events, list) or
                len(events) > 5000 or type(coverage.get('complete')) is not bool):
            return _unavailable('INVALID_COVERAGE_OR_EVENTS', time_basis='BROKER_SERVER')
        safe_events = []
        time_modes = {'DATETIME', 'DATE', 'NO_TIME', 'TENTATIVE', 'UNKNOWN'}
        for event in events:
            if (not isinstance(event, dict) or not isinstance(event.get('id'), str) or
                    not event['id'].isdigit() or not isinstance(event.get('revision'), int) or
                    isinstance(event.get('revision'), bool) or event['revision'] < 0 or
                    not isinstance(event.get('name'), str) or len(event['name']) > 256 or
                    event.get('currency') != 'USD' or
                    event.get('status') != 'SCHEDULED' or
                    event.get('timeMode') not in time_modes or
                    not isinstance(event.get('timeServer'), str)):
                return _unavailable('INVALID_EVENT', time_basis='BROKER_SERVER')
            try:
                datetime.fromisoformat(event['timeServer'])
            except ValueError:
                return _unavailable('INVALID_EVENT_TIME', time_basis='BROKER_SERVER')
            safe_events.append({key: event[key] for key in
                                ('id', 'revision', 'name', 'currency', 'importance',
                                 'timeServer', 'timeMode', 'status')})
        return {'status': status, 'reason': None if status == 'AVAILABLE' else 'STALE_SNAPSHOT',
                'timeBasis': 'BROKER_SERVER', 'brokerUtcOffsetSeconds': offset,
                'capturedAtUtc': data['capturedAtUtc'], 'ageSeconds': max(age, 0),
                'serverTime': data.get('serverTime'), 'events': safe_events,
                'coverage': {'status': 'COMPLETE' if coverage['complete'] else 'PARTIAL',
                            'fromServerTime': coverage.get('fromServerTime'),
                            'toServerTime': coverage.get('toServerTime')},
                'cancellationSemantics': 'NOT_EXPOSED_BY_MT5_CALENDAR',
                'missingEventsMean': 'UNKNOWN'}
    except (OSError, UnicodeError, json.JSONDecodeError, TypeError, ValueError, OverflowError):
        return _unavailable('SNAPSHOT_MISSING_OR_INVALID')
