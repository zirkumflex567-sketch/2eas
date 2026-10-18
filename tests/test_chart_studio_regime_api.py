"""Read-only regime API contract tests; all broker reads use a demo adapter."""
from datetime import datetime, timezone
import ntpath
from types import SimpleNamespace as NS

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import account_gateway as gateway
from chart_studio.read_api import install_read_routes

NOW = 1_791_547_200
OFFSET = 10_800


class DemoMT5:
    TIMEFRAME_M15 = 15

    def __init__(self, history=True):
        self.calls = []
        self.writes = 0
        self.rates = self._rates() if history else None
        self.current = None

    @staticmethod
    def _rates():
        values = []
        price = 4000.0
        for index in range(220):
            price += .15 + ((index % 7) - 3) * .025
            utc_time = NOW - 220 * 900 + index * 900
            values.append(NS(time=utc_time, open=price-.1,
                             high=price+.8, low=price-.8, close=price))
        return list(reversed(values))

    def initialize(self, path, **kwargs):
        self.current = next(item for item in gateway.ACCOUNTS.values()
                            if item['terminal'] == path)
        self.calls.append(('initialize', self.current['id']))
        return True

    def shutdown(self):
        self.current = None

    def account_info(self):
        return NS(login=self.current['login'], server=self.current['server'])

    def terminal_info(self):
        path = ntpath.dirname(self.current['terminal'])
        return NS(path=path, data_path=path, connected=True)

    def symbol_info(self, symbol):
        self.calls.append(('symbol_info', symbol))
        return NS(name=symbol)

    def symbol_info_tick(self, symbol):
        self.calls.append(('tick', symbol))
        return NS(time=NOW+OFFSET, time_msc=(NOW+OFFSET)*1000,
                  bid=4000.0, ask=4000.1)

    def copy_rates_from_pos(self, symbol, timeframe, start_pos, count):
        self.calls.append(('rates', symbol, timeframe, start_pos, count))
        return self.rates

    def order_send(self, *args, **kwargs):
        self.writes += 1
        raise AssertionError('regime endpoint must be read-only')


@pytest.fixture
def env(monkeypatch):
    gateway._attached_mt5 = gateway._attached_account = None
    monkeypatch.setattr(gateway, 'terminal_running', lambda path: True)
    for account in ('titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15'):
        monkeypatch.setitem(gateway.ACCOUNTS[account], 'broker_utc_offset_seconds', OFFSET)
    adapter = DemoMT5()
    app = FastAPI()
    install_read_routes(app, adapter, now=lambda: NOW + .5)
    yield TestClient(app), adapter
    assert adapter.writes == 0
    gateway._attached_mt5 = gateway._attached_account = None


def get(client, **params):
    return client.get('/api/chart/v1/regimes', params={
        'account':'titan', 'symbol':'XAUUSD', 'timeframe':'M15',
        'at':datetime.fromtimestamp(NOW, timezone.utc).isoformat(), **params})


def test_demo_regime_api_is_scoped_bounded_closed_bar_and_read_only(env):
    client, adapter = env

    response = get(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['account'] == 'titan'
    assert body['source'] == 'MT5_VERIFIED'
    assert body['canExecute'] is False
    assert body['frame'] == {'symbol':'XAUUSD', 'timeframe':'M15'}
    assert body['asOfUtc'] == datetime.fromtimestamp(NOW, timezone.utc).isoformat()
    assert body['sourceTimeUtc'] == datetime.fromtimestamp(NOW - OFFSET - 900, timezone.utc).isoformat()
    assert body['barCount'] == 220
    assert body['regimeTags']['eventRisk'] == 'UNKNOWN'
    assert ('rates', 'XAUUSD', 15, 1, 500) in adapter.calls
    assert adapter.writes == 0


def test_regime_source_time_is_latest_bar_closed_by_the_requested_cutoff(env):
    client, adapter = env
    adapter.rates.extend([
        NS(time=NOW + OFFSET - 900, open=4000., high=4010., low=3990., close=4005.),
        NS(time=NOW + OFFSET, open=4000., high=999999., low=1., close=4005.),
    ])

    response = get(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['asOfUtc'] == datetime.fromtimestamp(NOW, timezone.utc).isoformat()
    assert body['sourceTimeUtc'] == datetime.fromtimestamp(NOW - 900, timezone.utc).isoformat()
    assert body['barCount'] == 221


def test_mt5_numpy_bar_timestamps_are_builtin_utc_not_server_shifted(env):
    np = pytest.importorskip('numpy')
    client, adapter = env
    adapter.rates = [NS(time=np.int64(row.time), open=row.open, high=row.high,
                        low=row.low, close=row.close) for row in adapter.rates]

    response = get(client)

    assert response.status_code == 200, response.text
    assert response.json()['barCount'] == 220
    assert response.json()['asOfUtc'] == datetime.fromtimestamp(NOW, timezone.utc).isoformat()


def test_regime_api_normalizes_explicit_broker_server_bar_times(env, monkeypatch):
    client, adapter = env
    adapter.rates = [NS(time=row.time+OFFSET, open=row.open, high=row.high,
                        low=row.low, close=row.close) for row in adapter.rates]
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'rates_time_basis', 'BROKER_SERVER')
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds', OFFSET)

    response = get(client)

    assert response.status_code == 200, response.text
    assert response.json()['barCount'] == 220
    assert response.json()['regimeTags']['trend'] != 'UNKNOWN'


def test_blueberry_is_denied_before_any_broker_access(env):
    client, adapter = env

    response = get(client, account='blueberry')

    assert response.status_code == 403
    assert adapter.calls == []


def test_future_cutoff_and_unknown_timeframe_are_rejected_without_reads(env):
    client, adapter = env

    future = datetime.fromtimestamp(NOW + 3600, timezone.utc).isoformat()
    assert get(client, at=future).status_code == 422
    assert get(client, timeframe='W1').status_code == 422
    assert not any(call[0] == 'rates' for call in adapter.calls)


def test_missing_history_returns_unknown_without_failure(env):
    client, adapter = env
    adapter.rates = None

    response = get(client)

    assert response.status_code == 200, response.text
    assert response.json()['regimeTags']['trend'] == 'UNKNOWN'
    assert 'INSUFFICIENT_HISTORY' in response.json()['qualityFlags']


def test_without_requested_cutoff_uses_verified_broker_quote_time(env):
    client, adapter = env

    response = client.get('/api/chart/v1/regimes', params={
        'account':'titan', 'symbol':'XAUUSD', 'timeframe':'M15'})

    assert response.status_code == 200, response.text
    assert response.json()['asOfUtc'] == datetime.fromtimestamp(NOW, timezone.utc).isoformat()
    assert ('tick', 'XAUUSD') in adapter.calls


def test_malformed_history_fails_closed_without_writes(env):
    client, adapter = env
    adapter.rates[-1] = NS(time=NOW - 900, open=4000., high=3990., low=3999., close=4000.)

    response = get(client)

    assert response.status_code == 200
    assert response.json()['regimeTags']['trend'] == 'UNKNOWN'
    assert 'INVALID_CANDLES' in response.json()['qualityFlags']
    assert adapter.writes == 0
