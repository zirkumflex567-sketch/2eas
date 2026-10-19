"""Bounded, credential-free timings for existing MT5 read requests."""
from collections import deque
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from datetime import datetime, timezone
import re
import threading
import time
import uuid
from fastapi.routing import APIRoute


SPAN_NAMES = frozenset({
    'mt5_lock_wait',
    'mt5_initialize',
    'mt5_identity_verify',
    'mt5_rates',
    'mt5_history',
})
MAX_SPANS_PER_TRACE = 128
ACCOUNT_ALIASES = frozenset({
    'blueberry', 'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15',
    'titan_500_2', 'xau5m_m15', 'titan_25k',
})
_ALIAS = re.compile(r'^[a-z0-9_]{1,64}$')
_HTTP_METHODS = frozenset({'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'})
_API_ROUTE = re.compile(r'^/api/[A-Za-z0-9_./{}:-]{1,196}$')
_active_trace = ContextVar('broker_telemetry_trace', default=None)
_active_request = ContextVar('broker_telemetry_request', default=None)


@contextmanager
def request_context(method, route):
    """Scope a trace to a safe HTTP method and canonical API route template."""
    context = None
    if (isinstance(method, str) and method in _HTTP_METHODS and
            isinstance(route, str) and _API_ROUTE.fullmatch(route)):
        context = {'httpMethod': method, 'route': route}
    token = _active_request.set(context)
    try:
        yield context
    finally:
        _active_request.reset(token)


class TelemetryAPIRoute(APIRoute):
    """Attach canonical route metadata without retaining concrete request data."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def traced_handler(request):
            with request_context(request.method, self.path_format) as context:
                response = await handler(request)
                trace_id = context.get('traceId') if context is not None else None
                if request.method == 'GET' and isinstance(trace_id, str) and re.fullmatch(r'[0-9a-f]{32}', trace_id):
                    response.headers['X-MT5-Trace-ID'] = trace_id
                return response

        return traced_handler


class TraceRecorder:
    def __init__(self, limit=128):
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 512:
            raise ValueError('trace limit must be an integer from 1 to 512')
        self._lock = threading.Lock()
        self._traces = deque(maxlen=limit)

    def append(self, trace):
        with self._lock:
            self._traces.append(deepcopy(trace))

    def snapshot(self, limit=50, account=None):
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 128:
            raise ValueError('snapshot limit must be an integer from 1 to 128')
        if account is not None and (not isinstance(account, str) or account not in ACCOUNT_ALIASES):
            raise ValueError('snapshot account must be a configured alias')
        with self._lock:
            traces = list(self._traces)
            if account is not None:
                traces = [trace for trace in traces if trace.get('account') == account]
            return deepcopy(traces[-limit:])


DEFAULT_RECORDER = TraceRecorder()


@contextmanager
def request_trace(account, recorder=DEFAULT_RECORDER):
    alias = account if isinstance(account, str) and _ALIAS.fullmatch(account) and account in ACCOUNT_ALIASES else 'unknown'
    trace = {
        'requestId': uuid.uuid4().hex,
        'account': alias,
        'startedAtUtc': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'spans': [],
        'droppedSpanCount': 0,
    }
    request = _active_request.get()
    if request is not None:
        trace.update({key: request[key] for key in ('httpMethod', 'route') if key in request})
        request['traceId'] = trace['requestId']
    token = _active_trace.set(trace)
    try:
        yield trace
    except BaseException:
        trace['outcome'] = 'error'
        raise
    else:
        trace['outcome'] = 'ok'
    finally:
        _active_trace.reset(token)
        recorder.append(trace)


def record_duration(name, duration_ms, **fields):
    if name not in SPAN_NAMES:
        raise ValueError(f'unsupported broker timing span: {name}')
    trace = _active_trace.get()
    if trace is None:
        return
    span = {'name': name, 'durationMs': round(max(0.0, float(duration_ms)), 3)}
    if fields:
        if set(fields) != {'count'} or isinstance(fields['count'], bool) or not isinstance(fields['count'], int) or fields['count'] < 0:
            raise ValueError('only a non-negative integer count field is allowed')
        span['count'] = fields['count']
    if len(trace['spans']) >= MAX_SPANS_PER_TRACE:
        trace['droppedSpanCount'] += 1
        return
    trace['spans'].append(span)


@contextmanager
def span(name, **fields):
    if name not in SPAN_NAMES:
        raise ValueError(f'unsupported broker timing span: {name}')
    if fields and (set(fields) != {'count'} or isinstance(fields['count'], bool) or not isinstance(fields['count'], int) or fields['count'] < 0):
        raise ValueError('only a non-negative integer count field is allowed')
    trace = _active_trace.get()
    if trace is None:
        yield
        return
    started = time.perf_counter()
    try:
        yield
    finally:
        record_duration(name, (time.perf_counter() - started) * 1000, **fields)


@contextmanager
def measured_lock(lock):
    started = time.perf_counter()
    lock.acquire()
    record_duration('mt5_lock_wait', (time.perf_counter() - started) * 1000)
    try:
        yield
    finally:
        lock.release()


def recent_traces(limit=50, account=None):
    return DEFAULT_RECORDER.snapshot(limit, account=account)
