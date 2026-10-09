"""Independent review blockers; real backend paths, all broker I/O isolated."""
from decimal import Decimal

import pytest
import app
from test_backend_audit import isolated, deal
import journal_accounting
from datetime import datetime, timezone
import math


@pytest.mark.parametrize('setting,expected', [('10',10.),('300',30.),('nan',30.),('0',30.),('garbage',30.)])
def test_quote_age_configuration_cannot_widen_hard_safety_cap(setting, expected, isolated, monkeypatch):
    monkeypatch.setenv('DASHBOARD_QUOTE_MAX_AGE_SECONDS', setting)
    isolated.tick.time -= 11
    response = isolated.client.post('/api/close_position?account=titan',json={'ticket':11})
    assert response.status_code == (503 if expected == 10 else 200)
    if expected == 10:
        assert response.json()['detail']['quote_max_age_seconds'] == expected
        isolated.send.assert_not_called()
    else:
        assert app.quote_metadata(isolated.tick)['quote_max_age_seconds'] == expected


@pytest.mark.parametrize('age,fresh', [(0,True),(30,True),(-5,True),(30.001,False),(-5.001,False),(86400,False)])
def test_status_reports_actual_source_age_not_http_heartbeat(age, fresh, isolated):
    isolated.clock.now = isolated.tick.time+age
    response = isolated.client.get('/api/status?account=titan&light=true')
    assert response.status_code == (200 if fresh else 503), response.text
    data = response.json() if fresh else response.json()['detail']
    assert data['source_fresh'] is fresh
    assert data['quote_time_epoch'] == isolated.tick.time
    assert data['quote_age_seconds'] == pytest.approx(age)
    assert math.isfinite(data['quote_age_seconds'])
    if not fresh:
        assert data['risk_status'] == 'unknown'
        assert data['source_status'] == 'stale'


@pytest.mark.parametrize('route,payload', [('modify_position',{'ticket':11,'sl_usd':-25}),
                                         ('close_position',{'ticket':11}),
                                         ('reset_drawdown',{'action':'reset'}),
                                         ('reset_drawdown',{'action':'auto'})])
@pytest.mark.parametrize('age', [31, -6, 86400])
def test_fresh_http_mutation_rejects_stale_or_future_broker_tick(route, payload, age, isolated):
    isolated.tick.time = int(isolated.clock.now-age)
    response = isolated.client.post('/api/'+route+'?account=titan', json=payload)
    assert response.status_code == 503, response.text
    assert response.json()['detail']['source_fresh'] is False
    isolated.send.assert_not_called()
    assert not (isolated.root/'drawdown_config.json').exists()
    assert not (isolated.root/'common'/'titan_dd_reset.json').exists()


@pytest.mark.parametrize('route', ['close_position', 'status'])
@pytest.mark.parametrize('stamp', [float('nan'),float('inf'),-float('inf'),0,None,'invalid'])
def test_invalid_source_timestamp_fails_closed_without_nonfinite_json(route, stamp, isolated):
    isolated.tick.time = stamp
    response = (isolated.client.get('/api/status?account=titan&light=true') if route == 'status' else
                isolated.client.post('/api/close_position?account=titan',json={'ticket':11}))
    assert response.status_code == 503
    assert response.json()['detail']['source_fresh'] is False
    isolated.send.assert_not_called()


@pytest.mark.parametrize('age', [1, 86400])
def test_risk_day_and_manual_expiry_follow_wall_utc_not_frozen_tick(age, isolated):
    isolated.clock.now = datetime(2026,10,10,tzinfo=timezone.utc).timestamp()
    isolated.tick.time = int(isolated.clock.now-age)
    app.save_dd_config(dict(manual_reset_active=True,reset_balance=11000.,
                            reset_timestamp=isolated.tick.time-60,reset_date='2026-10-09'))
    response = isolated.client.get('/api/status?account=titan&light=true')
    assert response.status_code == (200 if age == 1 else 503)
    data = response.json() if age == 1 else response.json()['detail']
    dd = data['daily_drawdown']
    assert dd['manual_active'] is False
    assert dd['manual_expired'] is True
    assert dd['risk_day'] == '2026-10-10'
    assert dd['risk_timezone'] == 'UTC'
    if age == 1:
        assert dd['day_start_bal'] == 10000.
        start,end = isolated.history.call_args.args[:2]
        assert start == datetime(2026,10,10,tzinfo=timezone.utc)
        assert end.timestamp() == isolated.clock.now


def test_reset_timestamp_uses_wall_clock_not_tolerated_future_quote(isolated):
    isolated.tick.time = isolated.clock.now+4
    response = isolated.client.post('/api/reset_drawdown?account=titan',json={'action':'reset'})
    assert response.status_code == 200
    import json
    cfg = json.loads((isolated.root/'drawdown_config.json').read_text())
    assert cfg['reset_timestamp'] == int(isolated.clock.now)


@pytest.mark.parametrize('route,payload', [('modify_position',{'ticket':11,'sl_usd':-25}),('close_position',{'ticket':11})])
def test_quote_is_rechecked_before_order_send(route,payload,isolated,monkeypatch):
    from types import SimpleNamespace as NS
    from unittest.mock import Mock
    old_tick = NS(**vars(isolated.tick)); old_tick.time -= 31
    fetch = Mock(side_effect=[isolated.tick,old_tick])
    monkeypatch.setattr(app.mt5,'symbol_info_tick',fetch)
    response = isolated.client.post('/api/'+route+'?account=titan',json=payload)
    assert response.status_code == 503
    isolated.send.assert_not_called()


@pytest.mark.parametrize('foreign_first', [False, True])
@pytest.mark.parametrize('path', ['accounting', 'build'])
def test_mixed_consumed_owners_do_not_attribute_whole_exit(foreign_first, path, isolated):
    stamp = isolated.tick.time
    owned = deal(1, app.mt5.DEAL_ENTRY_IN, stamp-100, volume=.01, commission=-2.)
    foreign = deal(2, app.mt5.DEAL_ENTRY_IN, stamp-90, volume=.01, magic=999, commission=-4.)
    if foreign_first:
        owned.time, foreign.time = foreign.time, owned.time
    closing = deal(3, app.mt5.DEAL_ENTRY_OUT, stamp, volume=.02, profit=100., commission=-6., kind=1)
    lifecycle = [owned, foreign, closing]
    if path == 'accounting':
        row = journal_accounting.close_accounting(lifecycle, app.mt5, {881122})[3]
    else:
        isolated.positions.return_value = []
        isolated.history.return_value = lifecycle
        row = app.build_trade_journal('titan', datetime.fromtimestamp(stamp+1, timezone.utc), None)[0]
    assert row['net_complete'] is False
    for field in ('volume', 'net_profit_usd', 'entry_cost_usd', 'gross_profit_usd', 'exit_net_usd', 'open_price'):
        assert row[field] is None
    assert row['net_unknown_reason']
    if path == 'build':
        assert row['profit_usd'] is None


@pytest.mark.parametrize('entry', [app.mt5.DEAL_ENTRY_INOUT, app.mt5.DEAL_ENTRY_OUT_BY])
@pytest.mark.parametrize('magic', [0, 999])
@pytest.mark.parametrize('path', ['accounting', 'build'])
def test_foreign_reversal_or_close_by_invalidates_owned_inventory(entry, magic, path, isolated):
    stamp = isolated.tick.time
    lifecycle = [deal(1, app.mt5.DEAL_ENTRY_IN, stamp-100, commission=-2.),
                 deal(2, entry, stamp-50, magic=magic, kind=1),
                 deal(3, app.mt5.DEAL_ENTRY_OUT, stamp, kind=1, profit=100.)]
    if path == 'accounting':
        rows = journal_accounting.close_accounting(lifecycle, app.mt5, {881122})
    else:
        isolated.positions.return_value = []
        isolated.history.return_value = lifecycle
        rows = {r['ticket']:r for r in app.build_trade_journal('titan', datetime.fromtimestamp(stamp+1, timezone.utc), None)}
    assert rows[3]['net_complete'] is False
    assert rows[3]['open_price'] is None
    assert rows[3]['net_profit_usd'] is None
    assert rows[3]['entry_cost_usd'] is None
    assert rows[3]['volume'] is None
    assert rows[3]['gross_profit_usd'] is None
    assert rows[3]['exit_net_usd'] is None


@pytest.mark.parametrize('side,kind,amount,tick_size,expected', [
    ('sl', 0, -50, .01, 3983.34),
    ('sl', 1, -50, .01, 4016.66),
    ('tp', 0, 50, .01, 4016.67),
    ('tp', 1, 50, .01, 3983.33),
    ('sl', 0, -50, .25, 3983.50),
    ('sl', 1, -50, .25, 4016.50),
])
def test_usd_stop_quantizes_to_tick_without_increasing_loss(side, kind, amount, tick_size, expected, isolated):
    isolated.pos.volume = .03
    isolated.pos.type = kind
    isolated.sym.trade_tick_size = tick_size
    if (side == 'tp') == (kind == 0):
        isolated.tick.bid, isolated.tick.ask = 3990., 3990.05
    response = isolated.client.post('/api/modify_position?account=titan',
                                    json={'ticket':11, side+'_usd':amount})
    assert response.status_code == 200, response.text
    sent = isolated.send.call_args.args[0][side]
    assert sent == expected
    assert Decimal(str(sent)) % Decimal(str(tick_size)) == 0
    payoff = (Decimal(str(sent))-Decimal('4000'))*Decimal('3')*(1 if kind == 0 else -1)
    assert payoff >= amount


@pytest.mark.parametrize('price', [3983.3333333333335, 3990.000000001])
def test_exact_off_grid_supplied_price_is_not_silently_quantized(price, isolated):
    isolated.pos.volume = .03
    response = isolated.client.post('/api/modify_position?account=titan',
                                    json={'ticket':11, 'sl_price':price})
    assert response.status_code == 422
    isolated.send.assert_not_called()
