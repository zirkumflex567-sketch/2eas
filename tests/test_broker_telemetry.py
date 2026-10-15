import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import broker_telemetry as telemetry


def test_request_spans_are_scoped_timed_and_credential_free():
    recorder = telemetry.TraceRecorder(limit=4)
    with telemetry.request_trace('titan', recorder=recorder):
        with telemetry.span('mt5_lock_wait'):
            time.sleep(0.002)
        with telemetry.span('mt5_rates', count=5000):
            pass

    [trace] = recorder.snapshot()
    assert trace['account'] == 'titan'
    assert trace['spans'][0]['name'] == 'mt5_lock_wait'
    assert trace['spans'][0]['durationMs'] >= 1
    assert trace['spans'][1]['name'] == 'mt5_rates'
    assert trace['spans'][1]['count'] == 5000
    assert isinstance(trace['spans'][1]['durationMs'], float)
    encoded = json.dumps(trace)
    assert 'login' not in encoded.lower()
    assert 'password' not in encoded.lower()
    assert 'terminal' not in encoded.lower()


def test_trace_recorder_is_bounded_and_returns_detached_snapshots():
    recorder = telemetry.TraceRecorder(limit=2)
    for account in ('blueberry', 'titan', 'goldm15'):
        with telemetry.request_trace(account, recorder=recorder):
            pass

    traces = recorder.snapshot(limit=10)
    assert [trace['account'] for trace in traces] == ['titan', 'goldm15']
    traces[-1]['account'] = 'tampered'
    assert recorder.snapshot()[-1]['account'] == 'goldm15'


def test_each_request_caps_spans_and_counts_dropped_spans():
    recorder = telemetry.TraceRecorder()
    with telemetry.request_trace('titan', recorder=recorder):
        for _ in range(telemetry.MAX_SPANS_PER_TRACE + 7):
            with telemetry.span('mt5_rates'):
                pass

    [trace] = recorder.snapshot()
    assert len(trace['spans']) == telemetry.MAX_SPANS_PER_TRACE
    assert trace['droppedSpanCount'] == 7


def test_span_names_are_allowlisted_and_outside_request_are_noop():
    with telemetry.span('mt5_rates'):
        pass
    recorder = telemetry.TraceRecorder()
    with telemetry.request_trace('titan', recorder=recorder):
        with pytest.raises(ValueError, match='unsupported'):
            with telemetry.span('order_send'):
                pytest.fail('an unsupported span must be rejected before its body')
    assert recorder.snapshot()[0]['spans'] == []


def test_request_trace_context_is_isolated_between_threads():
    recorder = telemetry.TraceRecorder()
    barrier = threading.Barrier(2)

    def capture(alias):
        with telemetry.request_trace(alias, recorder=recorder):
            barrier.wait(timeout=2)
            with telemetry.span('mt5_history', count=1):
                pass

    threads = [threading.Thread(target=capture, args=(alias,)) for alias in ('titan', 'goldm15')]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)
    assert all(not thread.is_alive() for thread in threads)
    traces = recorder.snapshot(limit=10)
    assert {trace['account'] for trace in traces} == {'titan', 'goldm15'}
    assert all(trace['spans'][0]['name'] == 'mt5_history' for trace in traces)


def test_scoped_account_request_records_lock_init_identity_and_read_spans():
    import account_gateway as gateway

    account = gateway.ACCOUNTS['xau5m_m5']
    fake = SimpleNamespace(
        initialize=lambda *_args, **_kwargs: True,
        shutdown=lambda: None,
        account_info=lambda: SimpleNamespace(login=account['login'], server=account['server']),
        terminal_info=lambda: SimpleNamespace(
            path=str(__import__('pathlib').Path(account['terminal']).parent),
            data_path=str(__import__('pathlib').Path(account['terminal']).parent),
            connected=True,
        ),
    )
    with patch.object(gateway, 'terminal_running', return_value=True), \
            patch.object(gateway, '_attached_mt5', None), \
            patch.object(gateway, '_attached_account', None):
        @gateway.scoped(fake)
        def read(account='xau5m_m5'):
            with telemetry.span('mt5_rates', count=32):
                return 'read-ok'
        assert read(account='xau5m_m5') == 'read-ok'

    trace = next(row for row in reversed(telemetry.recent_traces()) if row['account'] == 'xau5m_m5')
    assert {'mt5_lock_wait', 'mt5_initialize', 'mt5_identity_verify', 'mt5_rates'} <= {
        span['name'] for span in trace['spans']
    }


def test_app_mt5_read_wrapper_records_rates_and_history_calls():
    import app

    fake = SimpleNamespace(
        copy_rates_from_pos=lambda *_args: [object()] * 17,
        history_deals_get=lambda *_args, **_kwargs: [object()] * 3,
    )
    recorder = telemetry.TraceRecorder()
    with patch.object(app, 'mt5', fake), telemetry.request_trace('goldm15', recorder=recorder):
        assert len(app._mt5_read('copy_rates_from_pos', 'XAUUSD', 15, 0, 17)) == 17
        assert len(app._mt5_read('history_deals_get', 1, 2)) == 3
    spans = [span['name'] for span in recorder.snapshot()[0]['spans']]
    assert spans == ['mt5_rates', 'mt5_history']


def test_daily_drawdown_records_its_mt5_history_read():
    import app
    from datetime import datetime, timezone

    fake = SimpleNamespace(
        history_deals_get=lambda *_args, **_kwargs: [],
        DEAL_TYPE_BUY=0,
        DEAL_TYPE_SELL=1,
    )
    recorder = telemetry.TraceRecorder()
    risk_context = dict(manual_active=False, risk_day='2026-10-14', risk_timezone='UTC', risk_reset_hour=0)
    with patch.object(app, 'mt5', fake), \
            patch.object(app, 'risk_day_context', return_value=(risk_context, datetime(2026, 10, 14, tzinfo=timezone.utc))), \
            patch.object(app, 'require_fresh_quote', return_value={}), \
            patch.object(app, 'selected', return_value=app.ACCOUNTS['titan']), \
            telemetry.request_trace('titan', recorder=recorder):
        result, _, _ = app.current_daily_drawdown(
            fake, SimpleNamespace(balance=10_000., equity=9_900.),
            SimpleNamespace(time=1_792_000_000), 1_792_000_000,
            params=None, dd_cfg={},
        )

    assert result['loss_usd'] == 100.
    [trace] = recorder.snapshot()
    assert [span['name'] for span in trace['spans']] == ['mt5_history']


def test_titan_m5_daily_drawdown_filters_other_strategy_deals_and_disables_challenge_limits():
    import app
    from datetime import datetime, timezone

    deals = [
        SimpleNamespace(type=0, magic=881122, profit=10., swap=0., commission=0., fee=0.),
        SimpleNamespace(type=1, magic=123456, profit=500., swap=0., commission=0., fee=0.),
    ]
    fake = SimpleNamespace(
        history_deals_get=lambda *_args, **_kwargs: deals,
        DEAL_TYPE_BUY=0,
        DEAL_TYPE_SELL=1,
    )
    risk_context = dict(manual_active=False, risk_day='2026-10-14', risk_timezone='UTC', risk_reset_hour=0)
    with patch.object(app, 'mt5', fake), \
            patch.object(app, 'risk_day_context', return_value=(risk_context, datetime(2026, 10, 14, tzinfo=timezone.utc))), \
            patch.object(app, 'require_fresh_quote', return_value={}), \
            patch.object(app, 'selected', return_value=app.ACCOUNTS['titan_m5']):
        result, _, _ = app.current_daily_drawdown(
            fake, SimpleNamespace(balance=10_000., equity=9_900.),
            SimpleNamespace(time=1_792_000_000), 1_792_000_000,
            params=None, dd_cfg={},
        )

    assert result['realized_today'] == 10.
    assert result['day_start_bal'] == 9_990.
    assert result['challenge_protection'] is False
    assert result['limit_pct'] is None
    assert result['broker_limit_pct'] is None
    assert result['buffer_usd'] is None
    assert result['buffer_broker_usd'] is None


def test_missing_challenge_flag_does_not_enable_protection_for_demo_accounts():
    import app
    from datetime import datetime, timezone

    fake = SimpleNamespace(
        history_deals_get=lambda *_args, **_kwargs: [],
        DEAL_TYPE_BUY=0,
        DEAL_TYPE_SELL=1,
    )
    demo_without_flag = dict(app.ACCOUNTS['titan'])
    demo_without_flag.pop('challenge_protection')
    risk_context = dict(manual_active=False, risk_day='2026-10-14', risk_timezone='UTC', risk_reset_hour=0)
    with patch.object(app, 'mt5', fake), \
            patch.object(app, 'risk_day_context', return_value=(risk_context, datetime(2026, 10, 14, tzinfo=timezone.utc))), \
            patch.object(app, 'require_fresh_quote', return_value={}), \
            patch.object(app, 'selected', return_value=demo_without_flag):
        result, _, _ = app.current_daily_drawdown(
            fake, SimpleNamespace(balance=10_000., equity=9_900.),
            SimpleNamespace(time=1_792_000_000), 1_792_000_000,
            params=None, dd_cfg={},
        )

    assert result['challenge_protection'] is False
    assert result['limit_pct'] is None
    assert result['buffer_usd'] is None


def test_mt5_trace_diagnostics_require_authorized_read_identity(monkeypatch):
    from fastapi.testclient import TestClient
    import app

    client = TestClient(app.app, client=('203.0.113.20', 1234))
    assert client.get('/api/diagnostics/mt5-traces').status_code == 403
    monkeypatch.setenv('DASHBOARD_CONTROL_TOKEN', 'test-only-control-token')
    response = client.get('/api/diagnostics/mt5-traces', headers={'Authorization': 'Bearer test-only-control-token'})
    assert response.status_code == 200
    assert set(response.json()) == {'traces'}


def test_mt5_trace_diagnostics_allow_proxy_read_role_and_reject_unknown_role(monkeypatch):
    from fastapi.testclient import TestClient
    import app

    secret = 'read-only-proxy-secret-' + 'x' * 24
    monkeypatch.setenv('DASHBOARD_PROXY_SECRET', secret)
    monkeypatch.setenv('DASHBOARD_PROXY_USERS', '{"auditor":"read"}')
    headers = {'x-dashboard-proxy-secret': secret, 'x-dashboard-user': 'auditor'}
    recorder = telemetry.TraceRecorder()
    with telemetry.request_trace('titan', recorder=recorder):
        with telemetry.span('mt5_rates', count=12):
            pass
    monkeypatch.setattr(telemetry, 'recent_traces', recorder.snapshot)
    client = TestClient(app.app, client=('127.0.0.1', 1234))
    response = client.get('/api/diagnostics/mt5-traces', headers=headers)
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'no-store'
    assert set(response.json()) == {'traces'}
    [trace] = response.json()['traces']
    assert set(trace) == {'requestId', 'account', 'startedAtUtc', 'spans', 'droppedSpanCount', 'outcome'}
    encoded = json.dumps(trace).lower()
    assert all(secret_value not in encoded for secret_value in ('login', 'password', 'server', 'terminal', 'path', 'xauusd'))
    denied = client.get('/api/diagnostics/mt5-traces', headers={**headers, 'x-dashboard-user': 'unknown'})
    assert denied.status_code == 403


def test_chart_studio_verified_read_records_its_lock_and_operation_spans():
    import account_gateway as gateway
    from chart_studio.broker_reads import verified_read
    from pathlib import Path

    account = gateway.ACCOUNTS['xau5m_500']
    terminal_dir = str(Path(account['terminal']).parent)
    fake = SimpleNamespace(
        initialize=lambda *_args, **_kwargs: True,
        shutdown=lambda: None,
        account_info=lambda: SimpleNamespace(login=account['login'], server=account['server']),
        terminal_info=lambda: SimpleNamespace(path=terminal_dir, data_path=terminal_dir, connected=True),
    )
    with patch.object(gateway, 'terminal_running', return_value=True), \
            patch.object(gateway, '_attached_mt5', None), \
            patch.object(gateway, '_attached_account', None):
        result = verified_read(fake, 'xau5m_500', lambda _spec: _timed_history_read())
    assert result == 'read-ok'
    trace = next(row for row in reversed(telemetry.recent_traces()) if row['account'] == 'xau5m_500')
    assert [span['name'] for span in trace['spans']] == [
        'mt5_lock_wait', 'mt5_initialize', 'mt5_identity_verify', 'mt5_history',
    ]


def test_portfolio_correlation_times_each_real_mt5_rate_read():
    from chart_studio.broker_reads import portfolio_correlations

    from chart_studio import broker_reads
    rows = [{'time': 1_700_000_000 + i * 3600, 'close': 2000 + i + (i % 3)}
            for i in range(broker_reads.CORRELATION_BAR_COUNT)]
    calls = []
    fake = SimpleNamespace(
        TIMEFRAME_H1=16385,
        copy_rates_from_pos=lambda symbol, timeframe, start, count: calls.append(
            (symbol, timeframe, start, count)) or rows,
    )
    recorder = telemetry.TraceRecorder()
    with telemetry.request_trace('titan', recorder=recorder):
        result = portfolio_correlations(fake, {'XAUUSD'}, 'EURUSD')

    assert result['state'] == 'AVAILABLE'
    assert len(calls) == 2
    [trace] = recorder.snapshot()
    rate_spans = [span for span in trace['spans'] if span['name'] == 'mt5_rates']
    assert len(rate_spans) == 2
    assert all(span['count'] == broker_reads.CORRELATION_BAR_COUNT for span in rate_spans)


def test_scoped_read_measures_real_lock_contention():
    import account_gateway as gateway
    from pathlib import Path

    account = gateway.ACCOUNTS['xau5m_m5']
    terminal_dir = str(Path(account['terminal']).parent)
    fake = SimpleNamespace(
        initialize=lambda *_args, **_kwargs: True,
        shutdown=lambda: None,
        account_info=lambda: SimpleNamespace(login=account['login'], server=account['server']),
        terminal_info=lambda: SimpleNamespace(path=terminal_dir, data_path=terminal_dir, connected=True),
        copy_rates_from_pos=lambda *_args: [object()] * 3,
    )
    release = threading.Event()
    acquired = threading.Event()

    def hold_gateway_lock():
        gateway._lock.acquire()
        acquired.set()
        release.wait(timeout=2)
        gateway._lock.release()

    holder = threading.Thread(target=hold_gateway_lock)
    holder.start()
    assert acquired.wait(timeout=1)
    result = []
    try:
        with patch.object(gateway, 'terminal_running', return_value=True), \
                patch.object(gateway, '_attached_mt5', None), \
                patch.object(gateway, '_attached_account', None):
            @gateway.scoped(fake)
            def read(account='xau5m_m5'):
                return fake.copy_rates_from_pos('XAUUSD', 15, 0, 3)

            worker = threading.Thread(target=lambda: result.append(read(account='xau5m_m5')))
            worker.start()
            time.sleep(0.04)
            release.set()
            worker.join(timeout=2)
    finally:
        release.set()
        holder.join(timeout=2)

    assert result and len(result[0]) == 3
    trace = next(row for row in reversed(telemetry.recent_traces()) if row['account'] == 'xau5m_m5')
    wait = next(span['durationMs'] for span in trace['spans'] if span['name'] == 'mt5_lock_wait')
    assert wait >= 20


def _timed_history_read():
    with telemetry.span('mt5_history'):
        return 'read-ok'
