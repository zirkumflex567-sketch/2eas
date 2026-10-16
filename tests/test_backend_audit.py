"""Audit regressions. Every MT5 method used is isolated; no broker mutation."""
import json
import math
import struct
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import Mock

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
import app
import account_gateway as gateway
import goldm15_dashboard as gold


@pytest.fixture
def isolated(monkeypatch, tmp_path):
    account = gateway.ACCOUNTS['titan']
    pos = NS(ticket=11, identifier=11, symbol='XAUUSD', magic=881122, type=0,
             volume=.01, price_open=4000., price_current=4010., sl=3990., tp=0.,
             profit=10., swap=-1., time=1791504000, comment='fixture')
    dtype = [('time','i8'), ('open','f8'), ('high','f8'), ('low','f8'), ('close','f8'), ('tick_volume','i8')]
    rates = np.zeros(300, dtype=dtype)
    rates['time'] = 1791244800 + np.arange(300)*900
    rates['open'] = 4000 + np.arange(300)*.1
    rates['close'] = rates['open'] + .05
    rates['high'] = rates['close'] + 4
    rates['low'] = rates['open'] - 4
    rates['tick_volume'] = 10
    # Deterministic wall clock independent of the broker source clock.
    clock = NS(now=datetime(2026, 10, 9, 12, tzinfo=timezone.utc).timestamp())
    monkeypatch.setattr(app.time, 'time', lambda: clock.now)
    tick = NS(time=int(clock.now), bid=4030., ask=4030.05)
    rates['time'] = (tick.time//900 - 299 + np.arange(300))*900
    info = NS(login=account['login'], server=account['server'], balance=10000., equity=10000., currency='USD')
    sym = NS(name='XAUUSD', time=tick.time, spread=5, trade_contract_size=100., digits=2, point=.01,
             trade_tick_size=.01, trade_stops_level=10, trade_freeze_level=0, filling_mode=2)
    positions = Mock(return_value=[pos])
    history = Mock(return_value=[])
    send = Mock(return_value=NS(retcode=app.mt5.TRADE_RETCODE_DONE, comment='isolated'))
    monkeypatch.setattr(gateway, 'terminal_running', lambda _: True)
    monkeypatch.setattr(app.mt5, 'initialize', lambda *a, **k: True)
    monkeypatch.setattr(app.mt5, 'shutdown', lambda: None)
    monkeypatch.setattr(app.mt5, 'account_info', lambda: info)
    monkeypatch.setattr(app.mt5, 'terminal_info', lambda: NS(path=str(Path(gateway.selected()['terminal']).parent), data_path=str(Path(gateway.selected()['terminal']).parent), connected=True))
    monkeypatch.setattr(app.mt5, 'symbol_info', lambda _: sym)
    monkeypatch.setattr(app.mt5, 'symbol_info_tick', lambda _: tick)
    monkeypatch.setattr(app.mt5, 'positions_get', positions)
    monkeypatch.setattr(app.mt5, 'history_deals_get', history)
    monkeypatch.setattr(app.mt5, 'copy_rates_from_pos', lambda *a: rates.copy())
    monkeypatch.setattr(app.mt5, 'order_send', send)
    monkeypatch.setattr(app.mt5, 'last_error', lambda: (-1, 'isolated fixture'))
    monkeypatch.setattr(app, 'BASE_DIR', tmp_path)
    monkeypatch.setattr(app, 'COMMON_FILES_DIR', str(tmp_path/'common'))
    monkeypatch.setattr(app, 'GUARD_FILE', tmp_path/'absent_guard.state')
    (tmp_path/'common').mkdir()
    app.JOURNAL_CACHE.clear(); app.JOURNAL_CACHE_AT.clear()
    app.GOLD_METRICS_CACHE.entries.clear()
    token = gateway._selected.set('titan')
    client = TestClient(app.app)
    # Parent owns auth; get a legitimate capability only when integrated there.
    if any(getattr(route, 'path', None)=='/api/control_session' for route in app.app.routes):
        control = client.get('/api/control_session')
        assert control.status_code==200
        client.headers['x-dashboard-csrf']=control.json()['csrf_token']
    yield NS(pos=pos, rates=rates, tick=tick, clock=clock, info=info, sym=sym, positions=positions,
             history=history, send=send, client=client, root=tmp_path)
    gateway._selected.reset(token)
    gateway._attached_mt5 = None
    gateway._attached_account = None
    app.JOURNAL_CACHE.clear(); app.JOURNAL_CACHE_AT.clear()


def test_whatif_includes_read_only_daily_drawdown_projection(isolated, monkeypatch):
    isolated.sym.volume_min=.01; isolated.sym.volume_max=5.; isolated.sym.volume_step=.01
    monkeypatch.setattr(app.mt5,'order_calc_profit',lambda action,symbol,volume,entry,close:(close-entry)*volume*100*(1 if action==app.mt5.ORDER_TYPE_BUY else -1))
    monkeypatch.setattr(app.mt5,'order_calc_margin',lambda *args:123.4)
    monkeypatch.setattr(app,'current_daily_drawdown',lambda *args:(
        {'loss_usd':100.,'limit_pct':3.5,'daily_ref':10000.},
        {'source_fresh':True,'quote_time_epoch':isolated.clock.now},None))
    response=isolated.client.post('/api/chart/v1/scenarios/preview?account=titan',json={
        'account':'titan','symbol':'XAUUSD','side':'BUY','volumeLots':.1,
        'entryPrice':4100,'slPrice':4090,'tpPrice':4120,
    })
    assert response.status_code==200,response.text
    projection=response.json()['dailyDrawdownProjection']
    assert projection['state']=='AVAILABLE'
    assert projection['source']=='DASHBOARD_DD_ESTIMATE'
    assert projection['currentLoss']==100
    assert projection['scenarioStopRisk']==100
    assert projection['projectedLoss']==200
    assert projection['remainingToLimit']==150
    assert projection['eaGuard']=={'state':'UNKNOWN','source':'NONE'}
    assert response.json()['canExecute'] is False
    isolated.send.assert_not_called()


def test_whatif_keeps_broker_preview_when_daily_drawdown_is_unavailable(isolated, monkeypatch):
    isolated.sym.volume_min=.01; isolated.sym.volume_max=5.; isolated.sym.volume_step=.01
    monkeypatch.setattr(app.mt5,'order_calc_profit',lambda action,symbol,volume,entry,close:(close-entry)*volume*100*(1 if action==app.mt5.ORDER_TYPE_BUY else -1))
    monkeypatch.setattr(app.mt5,'order_calc_margin',lambda *args:123.4)
    monkeypatch.setattr(app,'current_daily_drawdown',lambda *args:(_ for _ in ()).throw(HTTPException(503,'fixture stale quote')))
    response=isolated.client.post('/api/chart/v1/scenarios/preview?account=titan',json={
        'account':'titan','symbol':'XAUUSD','side':'BUY','volumeLots':.1,
        'entryPrice':4100,'slPrice':4090,'tpPrice':4120,
    })
    assert response.status_code==200,response.text
    assert response.json()['pnlAtSl']['amount']==-100
    assert response.json()['dailyDrawdownProjection']['state']=='UNAVAILABLE'
    assert response.json()['dailyDrawdownProjection']['eaGuard']=={'state':'UNKNOWN','source':'NONE'}
    isolated.send.assert_not_called()


def test_whatif_uses_exact_non_xau_broker_symbol_without_writes(isolated, monkeypatch):
    calls=[]
    isolated.sym.volume_min=.01; isolated.sym.volume_max=5.; isolated.sym.volume_step=.01
    def symbol_info(name):
        return NS(name=name, digits=5, point=.00001, trade_tick_size=.00001,
                  trade_stops_level=10, trade_freeze_level=0, volume_min=.01,
                  volume_max=5., volume_step=.01, currency_base='EUR',
                  currency_profit='USD', currency_margin='USD', trade_mode=4)
    def calc_profit(action, symbol, volume, entry, close):
        calls.append(('profit', symbol))
        return (close-entry)*volume*100*(1 if action==app.mt5.ORDER_TYPE_BUY else -1)
    def calc_margin(action, symbol, volume, entry):
        calls.append(('margin', symbol))
        return 123.4
    monkeypatch.setattr(app.mt5,'symbol_info',symbol_info)
    monkeypatch.setattr(app.mt5,'order_calc_profit',calc_profit)
    monkeypatch.setattr(app.mt5,'order_calc_margin',calc_margin)
    monkeypatch.setattr(app,'current_daily_drawdown',lambda *args:(_ for _ in ()).throw(HTTPException(503,'fixture unavailable')))
    response=isolated.client.post('/api/chart/v1/scenarios/preview?account=titan',json={
        'account':'titan','symbol':'EURUSD','side':'BUY','volumeLots':.1,
        'entryPrice':1.1,'slPrice':1.09,'tpPrice':1.12,
    })
    assert response.status_code==200,response.text
    assert response.json()['symbol']=='EURUSD'
    assert response.json()['tickSize']==.00001
    assert calls and set(symbol for _kind,symbol in calls)=={'EURUSD'}
    assert response.json()['canExecute'] is False
    isolated.send.assert_not_called()


def test_chart_candles_read_exact_requested_verified_symbol(isolated, monkeypatch):
    calls=[]
    monkeypatch.setattr(app.mt5,'symbol_info',lambda symbol:NS(
        name=symbol,digits=5,trade_tick_size=.00001))
    monkeypatch.setattr(app.mt5,'copy_rates_from_pos',lambda *args:(calls.append(args) or isolated.rates.copy()))
    response=isolated.client.get('/api/candles?account=titan&tf=M15&symbol=EURUSD')
    assert response.status_code==200,response.text
    body=response.json()
    assert body['symbol']=='EURUSD'
    assert calls and calls[0][0]=='EURUSD'
    assert body['candles'][-1]['close']==round(float(isolated.rates[-1]['close']),5)
    for series in ('candles','ema20','ema50','ema200'):
        for row in body[series]:
            for field in (('open','high','low','close') if series=='candles' else ('value',)):
                assert row[field]==round(row[field],5),f'{series}.{field} must use the verified symbol precision'
    assert all(value==round(value,5) for value in body['sr_levels'].values())
    assert body['markers']==[]
    isolated.send.assert_not_called()


def test_chart_candles_normalize_explicit_broker_wall_time(isolated, monkeypatch):
    raw = isolated.rates.copy()
    raw['time'] += 10800
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'rates_time_basis', 'BROKER_SERVER')
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds', 10800)
    contexts = []
    original_offset = app.broker_clock.rates_offset_seconds
    def record_offset(spec):
        result = original_offset(spec)
        contexts.append(('offset', spec.get('id'), spec.get('rates_time_basis'), spec.get('broker_utc_offset_seconds'), result))
        return result
    monkeypatch.setattr(app.broker_clock, 'rates_offset_seconds', record_offset)
    def copy_rates(*args):
        contexts.append(('read', gateway.selected()['id'], gateway.selected().get('rates_time_basis')))
        return raw.copy()
    monkeypatch.setattr(app.mt5, 'copy_rates_from_pos', copy_rates)

    response = isolated.client.get('/api/candles?account=titan&tf=M15&symbol=XAUUSD')

    assert response.status_code == 200, response.text
    body = response.json()
    assert contexts == [('offset','titan','BROKER_SERVER',10800,10800),('read','titan','BROKER_SERVER')]
    assert body['candles'][-1]['time'] == int(raw[-1]['time']) - 10800
    assert body['ema20'][-1]['time'] == body['candles'][-1]['time']
    isolated.send.assert_not_called()


def test_chart_history_cursor_roundtrips_normalized_utc(isolated, monkeypatch):
    raw = isolated.rates.copy()
    raw['time'] += 10800
    cursor = int(isolated.rates['time'][290])
    calls = []

    def copy_from(symbol, timeframe, date_from, count):
        calls.append((symbol, timeframe, date_from, count))
        return raw[raw['time'] <= int(date_from.timestamp())][-count:].copy()

    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'rates_time_basis', 'BROKER_SERVER')
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'broker_utc_offset_seconds', 10800)
    monkeypatch.setattr(app.mt5, 'copy_rates_from', copy_from, raising=False)

    response = isolated.client.get(f'/api/candles?account=titan&tf=M15&symbol=XAUUSD&count=10&before={cursor}')

    assert response.status_code == 200, response.text
    body = response.json()
    assert calls[0][2].timestamp() == cursor + 10800
    assert body['candles'][-1]['time'] == cursor - 900
    assert all(row['time'] < cursor for row in body['candles'])
    assert body['page']['nextBefore'] == body['candles'][0]['time']
    isolated.send.assert_not_called()


def test_chart_candles_supports_exclusive_historical_cursor_with_warmup(isolated, monkeypatch):
    calls=[]
    cursor=int(isolated.rates['time'][290])
    def copy_from(symbol, timeframe, date_from, count):
        calls.append((symbol, timeframe, date_from, count))
        eligible=isolated.rates[isolated.rates['time'] <= int(date_from.timestamp())]
        return eligible[-count:].copy()
    monkeypatch.setattr(app.mt5, 'symbol_info', lambda name: NS(name=name, digits=2, trade_tick_size=.01))
    monkeypatch.setattr(app.mt5, 'copy_rates_from', copy_from, raising=False)
    response=isolated.client.get(f'/api/candles?account=titan&tf=M15&symbol=XAUUSD&count=10&before={cursor}')
    assert response.status_code==200,response.text
    body=response.json()
    assert calls and calls[0][0]=='XAUUSD'
    assert calls[0][2].tzinfo is not None and calls[0][2].utcoffset().total_seconds()==0
    assert calls[0][3]>=260, 'historical indicator warm-up must be fetched in addition to the visible page'
    assert body['candles'] and len(body['candles'])==10
    assert all(row['time'] < cursor for row in body['candles']), 'cursor bar must be excluded'
    assert body['candles'][-1]['time']==int(isolated.rates['time'][289])
    assert body['page']['nextBefore']==body['candles'][0]['time']
    assert body['page']['hasMore'] is True
    isolated.send.assert_not_called()


def test_chart_candles_accepts_full_1000_period_indicator_warmup(isolated, monkeypatch):
    calls=[]
    def copy_from_pos(symbol, timeframe, start, count):
        calls.append((symbol, timeframe, start, count))
        return isolated.rates.copy()
    monkeypatch.setattr(app.mt5, 'copy_rates_from_pos', copy_from_pos, raising=False)
    response=isolated.client.get('/api/candles?account=titan&tf=M15&symbol=XAUUSD&count=1001')
    assert response.status_code==200,response.text
    body=response.json()
    assert calls==[('XAUUSD',app.mt5.TIMEFRAME_M15,0,1251)]
    assert body['page']['requestedCount']==1001
    assert len(body['candles'])==len(isolated.rates)
    isolated.send.assert_not_called()


def test_chart_candles_rejects_nonpositive_history_cursor(isolated, monkeypatch):
    reads=[]
    monkeypatch.setattr(app.mt5, 'copy_rates_from', lambda *args: reads.append(args), raising=False)
    response=isolated.client.get('/api/candles?account=titan&tf=M15&symbol=XAUUSD&before=0')
    assert response.status_code==422
    assert reads==[]


def test_chart_candles_returns_single_bar_on_short_final_history_page(isolated, monkeypatch):
    cursor=int(isolated.rates['time'][1])
    monkeypatch.setattr(app.mt5, 'symbol_info', lambda name: NS(name=name, digits=2, trade_tick_size=.01))
    monkeypatch.setattr(app.mt5, 'copy_rates_from', lambda symbol, timeframe, date_from, count:
                        isolated.rates[isolated.rates['time'] <= int(date_from.timestamp())][-count:].copy(),
                        raising=False)
    response=isolated.client.get(f'/api/candles?account=titan&tf=M15&symbol=XAUUSD&count=10&before={cursor}')
    assert response.status_code==200,response.text
    body=response.json()
    assert len(body['candles'])==1
    assert body['candles'][0]['time']==int(isolated.rates['time'][0])
    assert len(body['ema9'])==1
    assert body['page']=={'requestedCount':10,'oldestTime':int(isolated.rates['time'][0]),'nextBefore':None,'hasMore':False}


@pytest.mark.parametrize('account_id', ['titan', 'xau5m_500'])
def test_marketplace_status_keeps_indicators_but_has_no_strategy_reconstruction(isolated, monkeypatch, account_id):
    def account_info():
        account = gateway.selected()
        return NS(login=account['login'], server=account['server'], balance=account['initial_balance'],
                  equity=account['initial_balance'], currency='USD')

    monkeypatch.setattr(app.mt5, 'account_info', account_info)
    response = isolated.client.get(f'/api/status?account={account_id}&light=true')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['source_fresh'] is True
    assert body['account']['analysis_mode'] == 'INDICATORS_ONLY'
    assert body['analysis_mode'] == 'INDICATORS_ONLY'
    assert body['indicators']['ema9'] is not None
    assert body['signal_mode'] == 'INDICATORS_ONLY'
    assert body['signal_preview']['ema9'] is not None
    assert body['buy_readiness'] is None
    assert body['sell_readiness'] is None
    assert body['rules_matrix'] == []
    assert body['rule_count'] == 0
    assert 'Strategie unbekannt' in body['trend_diagnosis']
    isolated.send.assert_not_called()


@pytest.mark.parametrize('account_id', ['titan', 'xau5m_500'])
def test_marketplace_candles_keep_ema_and_suppress_inferred_buy_sell_markers(isolated, monkeypatch, account_id):
    def account_info():
        account = gateway.selected()
        return NS(login=account['login'], server=account['server'], balance=account['initial_balance'],
                  equity=account['initial_balance'], currency='USD')

    monkeypatch.setattr(app.mt5, 'account_info', account_info)
    monkeypatch.setattr(app.mt5, 'symbol_info', lambda name: NS(name=name, digits=2, trade_tick_size=.01))
    monkeypatch.setattr(app.mt5, 'copy_rates_from_pos', lambda *args: isolated.rates.copy())
    response = isolated.client.get(f'/api/candles?account={account_id}&tf=M15&symbol=XAUUSD')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['analysis_mode'] == 'INDICATORS_ONLY'
    assert body['ema20'] and body['ema50'] and body['ema200']
    assert body['markers'] == []
    isolated.send.assert_not_called()


def test_marketplace_journal_includes_positions_without_titan_magic_or_exit_rules(isolated):
    foreign = NS(**vars(isolated.pos))
    foreign.ticket = 12
    foreign.magic = 999
    isolated.positions.return_value = [isolated.pos, foreign]
    entries = app.build_trade_journal('titan', datetime.fromtimestamp(isolated.tick.time, timezone.utc), None)

    assert {entry['ticket'] for entry in entries} == {11, 12}
    assert all('unbekannt' in entry['why_triggered'].lower() for entry in entries)
    assert all('titan' not in entry['why_triggered'].lower() for entry in entries)
    assert all('unbekannt' in entry['profit_goal'].lower() for entry in entries)
    assert all('mindestgewinn' not in entry['profit_goal'].lower() for entry in entries)
    assert all(entry['target_usd'] is None for entry in entries)
    assert 'interne Ausstiegsregel unbekannt' in app.explain_trade_exit(
        'CLOSED', 'BUY', deal_reason=app.mt5.DEAL_REASON_EXPERT, profit_usd=10., account_id='titan')
    assert 'Stop Loss ausgelöst' in app.explain_trade_exit(
        'CLOSED', 'BUY', deal_reason=app.mt5.DEAL_REASON_SL, profit_usd=-10., account_id='titan')


def test_chart_candles_reject_unknown_symbol_before_history_read(isolated, monkeypatch):
    reads=[]
    monkeypatch.setattr(app.mt5,'symbol_info',lambda symbol:None)
    monkeypatch.setattr(app.mt5,'copy_rates_from_pos',lambda *args:(reads.append(args) or isolated.rates.copy()))
    response=isolated.client.get('/api/candles?account=titan&tf=M15&symbol=EURUSD')
    assert response.status_code==404
    assert reads==[]
    isolated.send.assert_not_called()


def test_chart_candles_reject_invalid_timeframe_before_history_read(isolated, monkeypatch):
    reads=[]
    monkeypatch.setattr(app.mt5,'symbol_info',lambda symbol:NS(
        name=symbol,digits=2,trade_tick_size=.01))
    monkeypatch.setattr(app.mt5,'copy_rates_from_pos',lambda *args:(reads.append(args) or isolated.rates.copy()))
    response=isolated.client.get('/api/candles?account=titan&tf=M99&symbol=EURUSD')
    assert response.status_code==422
    assert reads==[]
    isolated.send.assert_not_called()


@pytest.mark.parametrize('model,payload', [
    (app.ModifyPositionRequest, {'ticket':0}),
    (app.ClosePositionRequest, {'ticket':-1}),
    *[(app.ModifyPositionRequest, {'ticket':11, field:value})
      for field in ('sl_usd','tp_usd','sl_price','tp_price') for value in (float('nan'), float('inf'), -float('inf'))],
    (app.ModifyPositionRequest, {'ticket':11,'sl_price':-1}),
    (app.ModifyPositionRequest, {'ticket':11,'tp_price':-1}),
    *[(app.ResetDrawdownRequest, {'baseline':value}) for value in (-1,0,float('inf'),float('nan'))],
    (app.ResetDrawdownRequest, {'action':'garbage'}),
])
def test_mutation_models_reject_invalid_values(model, payload):
    with pytest.raises(ValidationError):
        model(**payload)


@pytest.mark.parametrize('payload', [
    {'sl_usd':-20, 'sl_price':3980}, {'tp_usd':20, 'tp_price':4020},
    {'remove_sl':True, 'sl_usd':0}, {'remove_tp':True, 'tp_price':4020},
])
def test_conflicting_stop_operations_are_rejected(payload, isolated):
    r = isolated.client.post('/api/modify_position?account=titan', json={'ticket':11, **payload})
    assert r.status_code == 422
    isolated.send.assert_not_called()


@pytest.mark.parametrize('payload,expected', [({'sl_price':0},0.), ({'remove_sl':True},0.), ({'sl_usd':0},4000.)])
def test_explicit_removal_or_zero_usd_breakeven_contract(payload, expected, isolated):
    r = isolated.client.post('/api/modify_position?account=titan', json={'ticket':11, **payload})
    assert r.status_code == 200
    assert isolated.send.call_args.args[0]['sl'] == expected


@pytest.mark.parametrize('route,payload', [('modify_position',{'ticket':11,'sl_usd':-25}), ('close_position',{'ticket':11}), ('reset_drawdown',{'action':'reset'})])
def test_writes_require_explicit_account(route, payload, isolated):
    r = isolated.client.post('/api/'+route, json=payload)
    assert r.status_code == 422
    isolated.send.assert_not_called()
    assert not (isolated.root/'drawdown_config.json').exists()


@pytest.mark.parametrize('route', ['modify_position','close_position'])
def test_foreign_symbol_cannot_be_mutated(route, isolated):
    isolated.pos.symbol = 'EURUSD'
    r = isolated.client.post('/api/'+route+'?account=titan', json={'ticket':11,'sl_usd':-25})
    assert r.status_code == 403
    isolated.send.assert_not_called()


@pytest.mark.parametrize('payload', [{'sl_usd':-5000}, {'sl_price':4029.95}, {'sl_price':3990.005}, {'tp_price':4029}, {'sl_price':.001}])
def test_invalid_computed_or_broker_stop_rejected_before_send(payload, isolated):
    r = isolated.client.post('/api/modify_position?account=titan', json={'ticket':11, **payload})
    assert r.status_code == 422
    isolated.send.assert_not_called()


def test_missing_broker_stop_metadata_fails_closed(isolated):
    isolated.sym.trade_tick_size = 0
    r = isolated.client.post('/api/modify_position?account=titan', json={'ticket':11,'sl_usd':-25})
    assert r.status_code == 503
    isolated.send.assert_not_called()


@pytest.mark.parametrize('raw', ['[]','{','{"manual_reset_active":"yes"}', '{"manual_reset_active":true,"reset_balance":-1}'])
def test_corrupt_persisted_dd_config_fails_closed(raw, isolated):
    (isolated.root/'drawdown_config.json').write_text(raw)
    with pytest.raises(HTTPException) as exc:
        app.load_dd_config()
    assert exc.value.status_code == 503


@pytest.mark.parametrize('failure', ['first','second','missing_directory','readback'])
def test_reset_persistence_failure_never_reports_success(failure, isolated, monkeypatch):
    import os
    old = dict(manual_reset_active=False, reset_balance=10000., reset_timestamp=None, reset_date=None)
    local = isolated.root/'drawdown_config.json'
    common = isolated.root/'common'/'titan_dd_reset.json'
    for p in (local, common):
        p.write_text(json.dumps(old))
    replace = os.replace
    replaced_common = False
    def failing_replace(src, dst):
        nonlocal replaced_common
        if (failure=='first' and Path(dst)==local) or (failure=='second' and Path(dst)==common):
            raise PermissionError('isolated failure')
        replace(src, dst)
        if failure=='readback' and Path(dst)==common and not replaced_common:
            replaced_common = True
            common.write_text('[]')
    monkeypatch.setattr(os, 'replace', failing_replace)
    if failure=='missing_directory':
        common.unlink(); common.parent.rmdir()
    r = isolated.client.post('/api/reset_drawdown?account=titan', json={'action':'reset','baseline':9900})
    assert r.status_code == 503
    assert json.loads(local.read_text()) == old
    if common.exists():
        assert json.loads(common.read_text()) == old


@pytest.mark.parametrize('route', ['status','journal_summary','modify_position','close_position'])
def test_none_positions_fail_closed(route, isolated):
    isolated.positions.return_value = None
    r = (isolated.client.get('/api/'+route+'?account=titan') if route in ('status','journal_summary')
         else isolated.client.post('/api/'+route+'?account=titan', json={'ticket':11,'sl_usd':-25}))
    assert r.status_code == 503
    isolated.send.assert_not_called()


@pytest.mark.parametrize('route', ['status','journal_summary'])
def test_none_history_fail_closed_not_zero(route, isolated):
    isolated.history.return_value = None
    r = isolated.client.get('/api/'+route+'?account=titan')
    assert r.status_code == 503
    isolated.history.return_value = []
    r = isolated.client.get('/api/'+route+'?account=titan')
    assert r.status_code == 200


@pytest.mark.parametrize('stamp', ['2026-10-10T00:00:00+00:00', '2026-10-25T00:00:00+00:00', '2026-03-29T00:00:00+00:00'])
def test_manual_reset_expires_at_next_utc_risk_day(stamp, isolated):
    now = datetime.fromisoformat(stamp)
    isolated.tick.time = int(now.timestamp())
    isolated.clock.now = now.timestamp()
    before = int(now.timestamp())-60
    config = dict(manual_reset_active=True, reset_balance=11000., reset_timestamp=before,
                  reset_date=datetime.fromtimestamp(before, timezone.utc).date().isoformat())
    app.save_dd_config(config)
    data = isolated.client.get('/api/status?account=titan').json()['daily_drawdown']
    assert data['manual_active'] is False
    assert data['day_start_bal'] == 10000.
    assert data['manual_expired'] is True
    assert data['risk_day'] == now.date().isoformat()
    assert data['risk_timezone'] == 'UTC'


def test_manual_reset_same_day_is_preserved_after_readback(isolated):
    day = datetime.fromtimestamp(isolated.tick.time, timezone.utc).date().isoformat()
    app.save_dd_config(dict(manual_reset_active=True, reset_balance=10100., reset_timestamp=isolated.tick.time-60, reset_date=day))
    dd = app.get_live_market_data()['daily_drawdown']
    assert dd['manual_active'] is True
    assert dd['day_start_bal'] == 10100.


def deal(ticket, entry, stamp, *, volume=.01, profit=0., commission=0., swap=0., fee=0., price=4000., magic=881122, symbol='XAUUSD', position=55, kind=0, comment='fixture'):
    return NS(ticket=ticket, order=ticket, position_id=position, entry=entry, time=stamp,
              volume=volume, profit=profit, commission=commission, swap=swap, fee=fee,
              price=price, magic=magic, symbol=symbol, type=kind, comment=comment)


def test_journal_unknown_reasons_scope_and_net_swap(isolated):
    isolated.pos.time = 1791504000
    foreign = NS(**vars(isolated.pos)); foreign.ticket=12; foreign.magic=999
    isolated.positions.return_value=[isolated.pos, foreign]
    entries=app.build_trade_journal('titan', datetime.fromtimestamp(isolated.tick.time, timezone.utc), None)
    assert [e['ticket'] for e in entries] == [11, 12]
    row=entries[0]
    assert row['reason_verified'] is False
    assert 'unbekannt' in row['why_triggered'].lower()
    assert 'unbekannt' in row['profit_goal'].lower()
    assert row['profit_usd'] == 9.
    assert row['net_profit_usd'] == 9.
    assert row['time_de'] == datetime.fromtimestamp(row['time_ts'], __import__('zoneinfo').ZoneInfo('Europe/Berlin')).strftime('%H:%M:%S')


def test_journal_partial_close_allocates_older_entry_cost_once(isolated):
    t=1791504000
    opening=deal(20, app.mt5.DEAL_ENTRY_IN, t-86400*3, volume=.02, commission=-4., price=3990.)
    close1=deal(21, app.mt5.DEAL_ENTRY_OUT, t, volume=.01, profit=10., commission=-1., swap=-.5, fee=-.25, price=4000., kind=1, magic=0)
    close2=deal(22, app.mt5.DEAL_ENTRY_OUT, t+600, volume=.01, profit=20., commission=-1., swap=-.5, fee=-.25, price=4010., kind=1)
    wrong=deal(23, app.mt5.DEAL_ENTRY_OUT, t+900, position=66, symbol='EURUSD', profit=999.)
    isolated.positions.return_value=[]
    isolated.history.side_effect=lambda *a, **kw: [opening,close1,close2] if kw.get('position')==55 else [close2,wrong,close1]
    rows=app.build_trade_journal('titan',datetime.fromtimestamp(t+1000,timezone.utc),None)
    assert {r['ticket'] for r in rows} == {21,22}
    assert {r['open_price'] for r in rows} == {3990.}
    assert sum(r['net_profit_usd'] for r in rows) == 22.5
    assert all(r['net_complete'] for r in rows)
    assert sum(r['entry_cost_usd'] for r in rows) == -4.
    assert all(r['type']=='BUY' for r in rows)
    assert any(c.kwargs.get('position')==55 for c in isolated.history.call_args_list)


def test_titan_confirmed_signal_invariant_to_open_bar_with_preview(isolated, monkeypatch):
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'analysis_mode', 'TITAN_REFERENCE')
    a=app.get_live_market_data()
    isolated.rates['close'][-1]=1000.
    isolated.rates['high'][-1]=6000.
    isolated.rates['low'][-1]=500.
    b=app.get_live_market_data()
    for key in ('rules_matrix','buy_readiness','sell_readiness','indicators'):
        assert a[key] == b[key]
    assert a['signal_preview'] != b['signal_preview']
    assert a['signal_mode'] == 'closed_bar_reference'
    assert a['rule_count'] == len(a['rules_matrix']) == 8
    assert a['in_window'] is None
    assert a['ea_execution_verified'] is False


def test_titan_rsi_is_wilder_on_closed_bar(isolated):
    changes=np.resize(np.array([1.,-2.,3.,-1.,0.,2.,-4.]),len(isolated.rates))
    isolated.rates['close']=4000.+np.cumsum(changes)
    data=app.get_live_market_data()
    reference=gold.wilder_rsi(isolated.rates['close'],14)[-2]
    assert data['indicators']['rsi14'] == pytest.approx(reference)
    assert data['signal_bar_time_utc'] == datetime.fromtimestamp(int(isolated.rates['time'][-2]),timezone.utc).isoformat()


def test_valid_guard_baseline_is_not_live_heartbeat(tmp_path):
    path=tmp_path/'guard.state'
    day=86400*20000
    path.write_bytes(struct.pack('<iqdiiii',121,day,10000.,1,0,1,0))
    guard=gold.read_guard(path,day+40000,9700.)
    assert guard['baseline_verified'] is True
    assert guard['protection_status'] == 'unknown'
    assert guard['heartbeat_verified'] is False
    assert guard['heartbeat_time_utc'] is None
    assert guard['hard_lock'] is None
    assert guard['daily_lock'] is None
    assert guard['persisted_daily_lock'] is True
    assert 'heartbeat' in guard['note'].lower()


@pytest.mark.parametrize('query', ['include_journal=false','light=true'])
def test_light_status_skips_journal_but_preserves_risk(query, isolated, monkeypatch):
    build=Mock(side_effect=AssertionError('light must not build journal'))
    monkeypatch.setattr(app, 'get_cached_trade_journal', build)
    r=isolated.client.get('/api/status?account=titan&'+query)
    assert r.status_code == 200
    data=r.json()
    assert 'journal' not in data and 'journal_cache' not in data
    assert isinstance(data['daily_drawdown']['pct'],float)
    build.assert_not_called()
    assert isolated.history.call_count == 1


@pytest.mark.parametrize('route', ['status','journal_summary'])
def test_get_payload_never_discloses_other_account_cache(route, isolated):
    app.JOURNAL_CACHE['goldm15']=[{'account':'goldm15','ticket':999}]
    data=isolated.client.get('/api/'+route+'?account=titan').json()
    assert set(data['journal_cache']) == {'titan'}
    assert data['journal_meta']['cutoff_utc']=='2026-10-08T23:00:00+00:00'
    assert data['journal_meta']['timezone']=='Europe/Berlin'
    assert data['journal_meta']['snapshot_age_seconds'] >= 0


def test_gold_metrics_cached_by_account_closed_bar_and_preset(isolated, monkeypatch):
    isolated.info.login=gateway.ACCOUNTS['goldm15']['login']
    app.JOURNAL_CACHE.clear()
    build=Mock(wraps=app.gold_metrics)
    monkeypatch.setattr(app, 'gold_metrics', build)
    a=isolated.client.get('/api/status?account=goldm15&include_journal=false').json()
    isolated.rates['close'][-1] += 1000
    b=isolated.client.get('/api/status?account=goldm15&include_journal=false').json()
    assert a['rules_matrix']==b['rules_matrix']
    assert build.call_count==1
    isolated.rates['close'][-2] += 10  # revised closed data invalidates even at same bar time
    isolated.client.get('/api/status?account=goldm15&light=true')
    assert build.call_count==2
    params=gold.parameters(); params['S1_BuyTrend'] += 1
    monkeypatch.setattr(app,'gold_parameters',lambda:params)
    isolated.client.get('/api/status?account=goldm15&light=true')
    assert build.call_count==3
    isolated.rates['time'] += 900
    isolated.client.get('/api/status?account=goldm15&light=true')
    assert build.call_count==4
    isolated.info.login=gateway.ACCOUNTS['titan']['login']
    isolated.client.get('/api/status?account=titan&light=true')
    assert build.call_count==4


def test_daily_risk_counts_entry_fees_and_swap(isolated):
    isolated.history.return_value=[deal(1,app.mt5.DEAL_ENTRY_IN,isolated.tick.time,commission=-3.,fee=-1.),
                                   deal(2,app.mt5.DEAL_ENTRY_OUT,isolated.tick.time,profit=-290.,swap=-5.,commission=-1.)]
    isolated.info.balance=9700.; isolated.info.equity=9700.
    dd=app.get_live_market_data(include_journal=False)['daily_drawdown']
    assert dd['realized_today']==-300.
    assert dd['day_start_bal']==10000.
    assert dd['pct']==3.


def test_gold_expired_manual_baseline_returns_to_verified_guard(isolated,monkeypatch):
    isolated.info.login=gateway.ACCOUNTS['goldm15']['login']
    now=datetime.fromisoformat('2026-10-10T00:00:00+00:00')
    isolated.tick.time=int(now.timestamp())
    isolated.clock.now=now.timestamp()
    token=gateway._selected.set('goldm15')
    try:
        app.save_dd_config(dict(manual_reset_active=True,reset_balance=11000.,reset_timestamp=isolated.tick.time-60,reset_date='2026-10-09'))
    finally:
        gateway._selected.reset(token)
    guard=isolated.root/'guard.state'
    guard.write_bytes(struct.pack('<iqdiiii',121,isolated.tick.time,10100.,1,0,0,0))
    monkeypatch.setattr(app,'GUARD_FILE',guard)
    data=isolated.client.get('/api/status?account=goldm15&light=true').json()
    dd=data['daily_drawdown']
    assert dd['manual_active'] is False
    assert dd['manual_expired'] is True
    assert dd['daily_ref']==10100.
    assert data['ea_guard']['baseline_verified'] is True
    assert data['ea_guard']['protection_status']=='unknown'
    assert data['in_window'] is None


@pytest.mark.parametrize('kind,slot', [(0,1),(1,2),(0,3)])
def test_gold_journal_long_short_slot_is_evidenced_not_comment_inferred(kind, slot, isolated):
    t=1791504000
    magic=int(gold.parameters()['MagicBase'])+slot
    opening=deal(1,app.mt5.DEAL_ENTRY_IN,t-10000,kind=kind,magic=magic,comment='arbitrary')
    closing=deal(2,app.mt5.DEAL_ENTRY_OUT,t,kind=1-kind,magic=0,price=4010. if kind==0 else 3990.,profit=10.)
    isolated.positions.return_value=[]
    isolated.history.side_effect=lambda *a,**kw:[opening,closing] if kw else [closing]
    rows=app.build_trade_journal('goldm15',datetime.fromtimestamp(t+100,timezone.utc),None)
    assert len(rows)==1
    assert rows[0]['slot']==slot
    assert rows[0]['type']==('BUY' if kind==0 else 'SELL')
    assert rows[0]['reason_verified'] is False


def test_incomplete_position_history_returns_unknown_accounting(isolated):
    t=1791504000
    closing=deal(2,app.mt5.DEAL_ENTRY_OUT,t,profit=10.,kind=1)
    isolated.positions.return_value=[]
    isolated.history.return_value=[closing]
    row=app.build_trade_journal('titan',datetime.fromtimestamp(t+100,timezone.utc),None)[0]
    assert row['open_price'] is None
    assert row['net_profit_usd'] is None
    assert row['net_complete'] is False
    assert row['net_unknown_reason']


def test_duplicate_closed_deal_only_appears_once(isolated):
    t=1791504000
    opening=deal(1,app.mt5.DEAL_ENTRY_IN,t-1000,commission=-1.)
    closing=deal(2,app.mt5.DEAL_ENTRY_OUT,t,profit=10.,kind=1)
    isolated.positions.return_value=[]
    isolated.history.return_value=[opening,closing,closing]
    rows=app.build_trade_journal('titan',datetime.fromtimestamp(t+100,timezone.utc),None)
    assert len(rows)==1
    assert rows[0]['net_profit_usd']==9.


@pytest.mark.parametrize('field,value', [('balance',float('nan')),('equity',float('inf')),('balance',0.)])
def test_unknown_account_risk_numbers_fail_closed(field, value, isolated):
    setattr(isolated.info,field,value)
    r=isolated.client.get('/api/status?account=titan&include_journal=false')
    assert r.status_code==503


def test_mismatched_position_history_does_not_fabricate_entry(isolated):
    t=1791504000
    closing=deal(2,app.mt5.DEAL_ENTRY_OUT,t,profit=10.,kind=1)
    other=deal(1,app.mt5.DEAL_ENTRY_IN,t-1000,position=999,price=123.)
    isolated.positions.return_value=[]
    isolated.history.side_effect=lambda *a,**kw:[other] if kw else [closing]
    row=app.build_trade_journal('titan',datetime.fromtimestamp(t+100,timezone.utc),None)[0]
    assert row['open_price'] is None
    assert row['net_profit_usd'] is None


def test_partial_close_penny_cost_is_not_lost_or_counted_twice(isolated):
    t=1791504000
    opening=deal(1,app.mt5.DEAL_ENTRY_IN,t-10000,volume=.03,commission=-.01)
    closes=[deal(i,app.mt5.DEAL_ENTRY_OUT,t+i,volume=.01,profit=1.,kind=1) for i in (2,3,4)]
    isolated.positions.return_value=[]
    isolated.history.return_value=[opening,*closes]
    rows=app.build_trade_journal('titan',datetime.fromtimestamp(t+100,timezone.utc),None)
    assert sum(r['entry_cost_usd'] for r in rows)==pytest.approx(-.01)
    assert sum(r['net_profit_usd'] for r in rows)==pytest.approx(2.99)


@pytest.mark.parametrize('stamp', ['2026-03-29T01:30:00+00:00','2026-10-25T01:30:00+00:00'])
def test_header_and_journal_berlin_time_are_same_instant(stamp, isolated):
    isolated.tick.time=int(datetime.fromisoformat(stamp).timestamp())
    isolated.clock.now=isolated.tick.time
    data=app.get_live_market_data(include_journal=False)
    assert data['times']['german']==__import__('journal_accounting').times(isolated.tick.time)['time_de']


def test_nonfinite_daily_deal_fails_closed(isolated):
    isolated.history.return_value=[deal(1,app.mt5.DEAL_ENTRY_OUT,isolated.tick.time,profit=float('nan'))]
    r=isolated.client.get('/api/status?account=titan&light=true')
    assert r.status_code==503


def test_manual_timestamp_before_risk_day_cannot_reactivate_old_baseline(isolated):
    today=datetime.fromtimestamp(isolated.tick.time,timezone.utc).date().isoformat()
    app.save_dd_config(dict(manual_reset_active=True,reset_balance=11000.,reset_timestamp=isolated.tick.time-86400,reset_date=today))
    dd=app.get_live_market_data(include_journal=False)['daily_drawdown']
    assert dd['manual_active'] is False
    assert dd['day_start_bal']==10000.


def test_cache_returns_detached_copies_and_account_identity_is_keyed(isolated):
    from metrics_cache import ClosedBarMetricsCache
    cache=ClosedBarMetricsCache(capacity=2)
    compute=Mock(return_value={'rules':[{'value':1}]})
    account=dict(gateway.ACCOUNTS['goldm15'])
    a=cache.get(account,'XAUUSD',15,100,isolated.rates['close'],{},compute)
    a['rules'][0]['value']=999
    assert cache.get(account,'XAUUSD',15,100,isolated.rates['close'],{},compute)['rules'][0]['value']==1
    account['login'] += 1
    cache.get(account,'XAUUSD',15,100,isolated.rates['close'],{},compute)
    assert compute.call_count==2
    cache.get(account,'XAUUSD',15,101,isolated.rates['close'],{},compute)
    assert len(cache.entries)==2


def test_titan_default_reference_closed_gates_match_ea_indices(isolated, monkeypatch):
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'analysis_mode', 'TITAN_REFERENCE')
    isolated.rates['open'][-4:-1]=isolated.rates['close'][-4:-1]-1
    isolated.rates['high'][-4]=isolated.rates['close'][-2]+1
    isolated.rates['high'][-49:-4]=isolated.rates['close'][-2]-1
    data=app.get_live_market_data(include_journal=False)
    rules={r['id']:r for r in data['rules_matrix']}
    assert rules['climax']['long_met'] is False
    assert rules['climax']['short_met'] is True
    assert rules['sr_room']['long_met'] is True  # spike at shift 3 excluded, k starts at 3 closed rates
    assert data['buy_met_count']==sum(r['long_met'] for r in data['rules_matrix'])
    assert data['buy_readiness']==int(100*data['buy_met_count']/data['rule_count'])


@pytest.mark.parametrize('payload', [{'ticket':True,'sl_price':3990}, {'ticket':11,'remove_sl':'true'}, {'ticket':11,'remove_tp':1}])
def test_ticket_and_removal_flags_are_not_coerced_from_booleans_or_strings(payload, isolated):
    r=isolated.client.post('/api/modify_position?account=titan',json=payload)
    assert r.status_code==422
    isolated.send.assert_not_called()


def test_missing_quote_on_close_is_http503_not_crash(isolated,monkeypatch):
    monkeypatch.setattr(app.mt5,'symbol_info_tick',lambda _:None)
    r=isolated.client.post('/api/close_position?account=titan',json={'ticket':11})
    assert r.status_code==503
    isolated.send.assert_not_called()


def test_reset_fallback_balance_must_be_finite_positive_before_persistence(isolated):
    isolated.info.balance=float('inf')
    r=isolated.client.post('/api/reset_drawdown?account=titan',json={'action':'reset'})
    assert r.status_code==503
    assert not (isolated.root/'drawdown_config.json').exists()


@pytest.mark.parametrize('raw', ['{}','{"manual_reset_active":false}', '{"manual_reset_active":false,"reset_balance":10000,"reset_timestamp":null,"reset_date":null,"extra":1}'])
def test_incomplete_or_extra_dd_schema_not_silently_defaulted(raw,isolated):
    (isolated.root/'drawdown_config.json').write_text(raw)
    with pytest.raises(HTTPException):
        app.load_dd_config()


def test_explain_trade_exit_scales_with_volume_and_reports_ema9():
    # 0.01 Lot target is $28 (280 pts)
    text_001 = app.explain_trade_exit('OPEN', 'SELL', volume=0.01, ema9=4095.0, current_price=4100.0, profit_usd=-5.0, account_id='titan_m5')
    assert 'Mindestgewinn >= $28' in text_001
    assert 'Aktuell $4095.00 · Abstand: 5.00 Pkt unter Kurs' in text_001
    assert 'Mindestgewinn noch offen: -$5.00 / $28, noch $33.00' in text_001

    # 0.04 Lot target is $112 (280 pts * 4)
    text_004 = app.explain_trade_exit('OPEN', 'BUY', volume=0.04, ema9=4105.0, current_price=4100.0, profit_usd=120.0, account_id='titan_m5')
    assert 'Mindestgewinn >= $112' in text_004
    assert 'Aktuell $4105.00 · Abstand: 5.00 Pkt über Kurs' in text_004
    assert 'Mindestgewinn erreicht: +$120.00 >= $112' in text_004


def test_live_market_data_positions_include_ema9_and_target(isolated, monkeypatch):
    monkeypatch.setitem(gateway.ACCOUNTS['titan'], 'analysis_mode', 'TITAN_REFERENCE')
    data = app.get_live_market_data()
    assert len(data['positions']) > 0
    pos = data['positions'][0]
    assert 'ema9' in pos
    assert 'dist_to_ema9' in pos
    assert 'target_usd' in pos
    assert pos['target_usd'] == 28.0


def test_unauthenticated_git_pull_routes_are_removed(isolated, monkeypatch):
    import subprocess

    calls = []
    monkeypatch.setattr(subprocess, 'run', lambda *args, **kwargs: calls.append((args, kwargs)))
    client = TestClient(app.app)

    assert client.get('/api/git/sync').status_code == 404
    assert client.post('/api/git/webhook').status_code == 404
    assert calls == []














