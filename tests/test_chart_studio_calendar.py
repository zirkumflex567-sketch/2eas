import json
from datetime import datetime, timezone
from types import SimpleNamespace as NS

from fastapi import FastAPI
from fastapi.testclient import TestClient

import account_gateway as gateway
from chart_studio.economic_calendar import load_snapshot
from chart_studio.read_api import install_read_routes
from test_chart_studio_regime_api import DemoMT5, OFFSET


def snapshot_payload():
    return {
        'schema': 'mt5-calendar-v1',
        'account': 'titan',
        'symbol': 'XAUUSD',
        'currency': 'USD',
        'capturedAtUtc': '2026-10-16T10:00:00Z',
        'serverTime': '2026-10-16T13:00:00',
        'serverUtcOffsetSeconds': 10800,
        'coverage': {'fromServerTime': '2026-10-09T13:00:00',
                     'toServerTime': '2026-10-23T13:00:00', 'complete': True},
        'events': [{'id': '42', 'revision': 2, 'name': 'CPI', 'currency': 'USD',
                    'importance': 'HIGH', 'timeServer': '2026-10-16T14:30:00',
                    'timeMode': 'DATETIME', 'status': 'SCHEDULED'}],
    }


def test_calendar_snapshot_preserves_server_time_and_never_promotes_missing_events(tmp_path):
    path = tmp_path / 'calendar.json'
    path.write_text(json.dumps(snapshot_payload()), encoding='utf-8')

    result = load_snapshot(path, account='titan', symbol='XAUUSD', now=1792144820,
                           expected_server_utc_offset=10800)

    assert result['status'] == 'AVAILABLE'
    assert result['timeBasis'] == 'BROKER_SERVER'
    assert result['events'][0]['timeServer'] == '2026-10-16T14:30:00'
    assert result['events'][0]['revision'] == 2
    assert result['events'][0]['timeMode'] == 'DATETIME'
    assert result['cancellationSemantics'] == 'NOT_EXPOSED_BY_MT5_CALENDAR'
    assert result['missingEventsMean'] == 'UNKNOWN'


def test_calendar_snapshot_stale_wrong_identity_and_bad_offset_fail_closed(tmp_path):
    path = tmp_path / 'calendar.json'
    payload = snapshot_payload()
    path.write_text(json.dumps(payload), encoding='utf-8')
    assert load_snapshot(path, account='titan', symbol='XAUUSD', now=1792149000,
                         expected_server_utc_offset=10800)['status'] == 'STALE'
    assert load_snapshot(path, account='xau5m_m5', symbol='XAUUSD', now=1792144820,
                         expected_server_utc_offset=10800)['status'] == 'UNAVAILABLE'
    payload['serverUtcOffsetSeconds'] = 12 * 3600
    path.write_text(json.dumps(payload), encoding='utf-8')
    assert load_snapshot(path, account='titan', symbol='XAUUSD', now=1792144820,
                         expected_server_utc_offset=10800)['status'] == 'UNAVAILABLE'


def test_calendar_snapshot_does_not_claim_utc_for_unknown_server_offset(tmp_path):
    path = tmp_path / 'calendar.json'
    payload = snapshot_payload()
    payload['serverUtcOffsetSeconds'] = None
    path.write_text(json.dumps(payload), encoding='utf-8')

    result = load_snapshot(path, account='titan', symbol='XAUUSD', now=1792144820,
                           expected_server_utc_offset=10800)

    assert result['status'] == 'UNAVAILABLE'
    assert result['timeBasis'] == 'UNKNOWN'
    assert result['events'] == []


def test_calendar_date_only_and_tentative_events_keep_time_precision(tmp_path):
    path = tmp_path / 'calendar.json'
    payload = snapshot_payload()
    payload['events'][0]['timeMode'] = 'DATE'
    payload['events'][0]['timeServer'] = '2026-10-16T00:00:00'
    path.write_text(json.dumps(payload), encoding='utf-8')

    result = load_snapshot(path, account='titan', symbol='XAUUSD', now=1792144820,
                           expected_server_utc_offset=10800)

    assert result['events'][0]['timeMode'] == 'DATE'
    assert result['events'][0]['timeServer'] == '2026-10-16T00:00:00'


def test_calendar_api_reads_identity_bound_demo_snapshot_and_denies_blueberry(tmp_path, monkeypatch):
    gateway._attached_mt5 = gateway._attached_account = None
    monkeypatch.setattr(gateway, 'terminal_running', lambda path: True)
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds', OFFSET)
    adapter = DemoMT5()
    path = tmp_path / 'calendar.json'
    payload = snapshot_payload()
    payload['capturedAtUtc'] = '2026-10-09T00:00:00Z'
    path.write_text(json.dumps(payload), encoding='utf-8')
    app = FastAPI()
    install_read_routes(app, adapter, now=lambda: 1791504000,
                        calendar_path_resolver=lambda spec, data_path: path)
    client = TestClient(app)
    try:
        response = client.get('/api/chart/v1/calendar', params={'account':'titan','symbol':'XAUUSD'})
        assert response.status_code == 200
        assert response.json()['source'] == 'MT5_VERIFIED'
        assert response.json()['canExecute'] is False
        assert response.json()['status'] == 'AVAILABLE', response.json().get('reason')
        assert response.json()['events'][0]['timeServer'] == '2026-10-16T14:30:00'
        denied = client.get('/api/chart/v1/calendar', params={'account':'blueberry','symbol':'XAUUSD'})
        assert denied.status_code == 403
        assert adapter.writes == 0
    finally:
        gateway._attached_mt5 = gateway._attached_account = None
