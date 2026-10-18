import importlib
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np


class MultiAccountTests(unittest.TestCase):
    def setUp(self):
        self.gateway = importlib.import_module('account_gateway')
        self.strategy = importlib.import_module('goldm15_dashboard')
        running = patch.object(self.gateway, 'terminal_running', return_value=True)
        running.start()
        self.addCleanup(running.stop)

    def fake(self, wrong=False):
        gateway = self.gateway
        fake = SimpleNamespace(current=None, calls=[], sent=[])
        def initialize(path, **kwargs):
            fake.calls.append((path, kwargs))
            fake.current = next(a for a in gateway.ACCOUNTS.values() if a['terminal'] == path)
            return True
        fake.initialize = initialize
        fake.shutdown = lambda: setattr(fake, 'current', None)
        fake.account_info = lambda: SimpleNamespace(login=1 if wrong else fake.current['login'], server=fake.current['server'])
        fake.terminal_info = lambda: SimpleNamespace(path=str(Path(fake.current['terminal']).parent), data_path=str(Path(fake.current['terminal']).parent), connected=True)
        return fake

    def test_explicit_paths_and_default_titan(self):
        fake = self.fake()
        with self.gateway.session(fake):
            self.assertEqual(fake.current['login'], 5120620)
        with self.gateway.session(fake, 'goldm15'):
            self.assertEqual(fake.current['login'], 53090070)
            self.assertEqual(self.gateway.selected()['id'], 'goldm15')
        self.assertEqual(fake.current['login'], 53090070)  # verified connection reused until account switch
        self.assertTrue(all(path and 'login' not in kw and 'password' not in kw for path, kw in fake.calls))
        self.assertTrue(fake.calls[-1][1]['portable'])

    def test_same_account_reuses_verified_terminal_and_switch_reconnects(self):
        fake = self.fake()
        with self.gateway.session(fake, 'titan'):
            pass
        with self.gateway.session(fake, 'titan'):
            pass
        self.assertEqual(len(fake.calls), 1)
        with self.gateway.session(fake, 'goldm15'):
            pass
        self.assertEqual(len(fake.calls), 2)
        with self.gateway.session(fake, 'goldm15'):
            pass
        self.assertEqual(len(fake.calls), 2)

    def test_wrong_account_fails_before_body(self):
        fake = self.fake(wrong=True)
        with self.assertRaises(Exception) as error:
            with self.gateway.session(fake, 'goldm15'):
                self.fail('must not run against wrong account')
        self.assertIn('Kont', str(error.exception))
        self.assertIsNone(fake.current)

    def test_wrong_terminal_fails(self):
        fake = self.fake()
        fake.terminal_info = lambda: SimpleNamespace(path='C:\\wrong', connected=True)
        with self.assertRaises(Exception):
            with self.gateway.session(fake, 'titan'):
                self.fail('wrong terminal')

    def test_unknown_account_never_initializes(self):
        fake = self.fake()
        with self.assertRaises(Exception):
            with self.gateway.session(fake, 'unknown'):
                pass
        self.assertFalse(fake.calls)

    def test_parallel_sessions_cannot_cross_accounts(self):
        fake = self.fake()
        def read(account):
            with self.gateway.session(fake, account):
                before = fake.current['login']
                time.sleep(.004)
                self.assertEqual(before, fake.current['login'])
                self.assertEqual(account, self.gateway.selected()['id'])
                return before
        with ThreadPoolExecutor(max_workers=6) as pool:
            actual = list(pool.map(read, ['titan', 'goldm15'] * 6))
        self.assertEqual(actual, [53087839, 53090070] * 6)

    def test_config_and_common_reset_are_isolated(self):
        with tempfile.TemporaryDirectory() as root:
            titan = self.gateway.config_path(root, 'titan')
            gold = self.gateway.config_path(root, 'goldm15')
            self.assertEqual(titan.name, 'drawdown_config.json')
            self.assertNotEqual(titan, gold)
            self.assertTrue(self.gateway.writes_titan_reset('titan'))
            self.assertFalse(self.gateway.writes_titan_reset('goldm15'))

    def test_wilder_rsi_known_values_and_flat_case(self):
        closes = np.array([100., 101., 99., 102., 101.])
        actual = self.strategy.wilder_rsi(closes, 2)
        self.assertAlmostEqual(actual[2], 100 / 3)
        self.assertAlmostEqual(actual[3], 100 * 1.75 / 2.25)
        self.assertEqual(self.strategy.wilder_rsi(np.ones(100), 14)[-1], 50)

    def test_open_bar_cannot_change_entry_or_exit_goals(self):
        closes = np.linspace(4000, 4100, 1000)
        a = self.strategy.metrics(closes)
        closes[-1] = 100000
        b = self.strategy.metrics(closes)
        self.assertEqual(a, b)

    def test_each_slot_uses_correct_exit_threshold_and_period(self):
        closes = np.arange(1., 1001.) + 4000
        result = self.strategy.metrics(closes)
        expected = [(6, .2, 5, .2), (6, .2, 5, .3), (5, .7, 8, .7)]
        for slot, (bp, bt, sp, st) in zip(result['slots'], expected):
            self.assertEqual((slot['buy_period'], slot['buy_target'], slot['sell_period'], slot['sell_target']), (bp, bt, sp, st))
            self.assertAlmostEqual(slot['buy_roc'], 100 * (closes[-2] / closes[-2-bp] - 1))
            self.assertAlmostEqual(slot['sell_roc'], 100 * (closes[-2] / closes[-2-sp] - 1))

    def test_entry_matrix_does_not_count_exit_goals(self):
        result = self.strategy.metrics(np.linspace(4000, 4100, 1000))
        self.assertEqual(len(result['rules_matrix']), 6)
        self.assertTrue(all(not r['long_met'] for r in result['rules_matrix'] if r['id'].endswith('pullback')))
        self.assertEqual(len(result['exit_goals']), 3)
        self.assertEqual(result['rule_count'], 6)

    def test_guard_unknown_or_old_day_cannot_report_verified(self):
        import struct
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'guard.state'
            path.write_bytes(struct.pack('<iqdiiii', 121, 100000, 10000., 1, 0, 0, 0))
            guard = self.strategy.read_guard(path, 100000 + 86400, 9980)
            self.assertFalse(guard['baseline_verified'])
            self.assertIsNone(guard['daily_buffer_usd'])

    def test_guard_fixed_initial_daily_limit_and_reserves(self):
        import struct
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'guard.state'
            day = 86400 * 20000
            path.write_bytes(struct.pack('<iqdiiii', 121, day, 10050., 1, 0, 0, 0))
            guard = self.strategy.read_guard(path, day + 3000, 10000.)
            self.assertTrue(guard['baseline_verified'])
            self.assertEqual(guard['daily_limit_usd'], 350.)
            self.assertEqual(guard['daily_buffer_usd'], 300.)
            self.assertEqual(guard['daily_protected_buffer_usd'], 225.)
            self.assertEqual(guard['hard_protected_floor_usd'], 9200.)

    def test_guard_floating_gain_cannot_hide_balance_floor(self):
        import struct
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'guard.state'
            day=86400*20000
            path.write_bytes(struct.pack('<iqdiiii',121,day,10000.,1,0,0,0))
            guard=self.strategy.read_guard(path,day+3000,10100.,balance=9700.)
            self.assertEqual(guard['daily_protected_buffer_usd'],-25.)
            self.assertEqual(guard['hard_buffer_usd'],500.)
            guard=self.strategy.read_guard(path,day+3000,10200.,balance=10100.)
            self.assertEqual(guard['daily_buffer_usd'],450.)

    def test_guard_invalid_state_or_reset_hour_is_not_verified(self):
        import struct
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'guard.state'
            day=86400*20000
            for reset_hour,hard in [(1,0),(24,0),(0,2)]:
                path.write_bytes(struct.pack('<iqdiiii',121,day+reset_hour*3600,10000.,1,hard,0,reset_hour))
                guard=self.strategy.read_guard(path,day+reset_hour*3600+3000,10000.)
                self.assertFalse(guard['baseline_verified'])
                self.assertIsNone(guard['hard_lock'])

    def test_terminal_absent_never_initializes(self):
        fake = self.fake()
        with patch.object(self.gateway, 'terminal_running', return_value=False):
            with self.assertRaises(Exception):
                with self.gateway.session(fake, 'titan'):
                    pass
        self.assertEqual(fake.calls, [])

    def test_account_list_and_routes_are_scoped(self):
        import app
        from fastapi.testclient import TestClient
        client = TestClient(app.app)
        accounts = client.get('/api/accounts')
        self.assertEqual(accounts.status_code, 200)
        listed={a['id']:a for a in accounts.json()['accounts']}
        self.assertEqual([a['login'] for a in listed.values()], [5120620, 53087839, 700194619, 700184986, 700194822, 53090070])
        self.assertTrue(listed['goldm15']['is_demo'])
        self.assertEqual(listed['goldm15']['account_type'], 'DEMO')
        self.assertFalse(listed['goldm15']['challenge_protection'])
        schema = client.get('/openapi.json').json()
        for route, method in [('/api/status','get'), ('/api/candles','get'), ('/api/close_position','post'), ('/api/modify_position','post'), ('/api/reset_drawdown','post')]:
            params = schema['paths'][route][method]['parameters']
            self.assertTrue(any(p['name']=='account' for p in params), route)

    def test_position_change_preserves_conversion_and_account(self):
        import app
        fake = self.fake()
        pos = SimpleNamespace(type=0, symbol='XAUUSD', volume=.01, price_open=4000, sl=3990, tp=0)
        fake.positions_get = lambda **kw: [pos] if kw['ticket']==11 else []
        # Stop writes now require broker tick/stop metadata (fail closed if absent).
        fake.symbol_info = lambda _: SimpleNamespace(trade_contract_size=100, digits=2,
            trade_tick_size=.01, point=.01, trade_stops_level=0, trade_freeze_level=0)
        fake.symbol_info_tick = lambda _: SimpleNamespace(time=1791547200 + 10800, bid=4000., ask=4000.05)
        fake.order_send = lambda req: (fake.sent.append((fake.current['login'], req)) or SimpleNamespace(retcode=10009, comment='ok'))
        for key in ('ORDER_TYPE_BUY','TRADE_ACTION_SLTP','TRADE_RETCODE_DONE'):
            setattr(fake, key, getattr(app.mt5, key))
        with patch.object(app, 'mt5', fake), patch.object(app.time, 'time', return_value=1791547200.):
            # Decorator binds the actual app module object; mock its calls too.
            with patch.object(app.api_modify_position, '__wrapped__', app.api_modify_position.__wrapped__):
                with self.gateway.session(fake, 'goldm15'):
                    result = app.api_modify_position.__wrapped__(app.ModifyPositionRequest(ticket=11, sl_usd=-25, tp_usd=50), account='goldm15')
        self.assertTrue(result['success'])
        self.assertEqual(fake.sent[0][0], 53090070)
        self.assertEqual(fake.sent[0][1]['sl'], 3975)
        self.assertEqual(fake.sent[0][1]['tp'], 4050)

    def test_gold_reset_cannot_write_titan_or_guard_files(self):
        import app
        fake = self.fake()
        fake.symbol_info_tick = lambda _: SimpleNamespace(time=1791547200 + 10800, bid=4000., ask=4000.05)
        fake.account_info = lambda: SimpleNamespace(login=53090070, server='ICMarketsEU-Demo', balance=9975)
        with tempfile.TemporaryDirectory() as root, patch.object(app, 'BASE_DIR', Path(root)), patch.object(app, 'COMMON_FILES_DIR', root), patch.object(app, 'mt5', fake), patch.object(app.time, 'time', return_value=1791547200.):
            with self.gateway.session(fake, 'goldm15'):
                app.api_reset_drawdown.__wrapped__(app.ResetDrawdownRequest(action='reset', baseline=10000), account='goldm15')
            self.assertTrue((Path(root)/'drawdown_config_goldm15.json').exists())
            self.assertFalse((Path(root)/'drawdown_config.json').exists())
            self.assertFalse((Path(root)/'titan_dd_reset.json').exists())

    def test_http_mutations_cannot_use_wrong_account_or_ticket(self):
        import app
        from fastapi.testclient import TestClient
        fake = self.fake()
        lookups = []
        def positions_get(**kw):
            lookups.append((fake.current['login'], kw['ticket']))
            return []
        with patch.multiple(app.mt5, initialize=fake.initialize, shutdown=fake.shutdown, account_info=fake.account_info, terminal_info=fake.terminal_info, positions_get=positions_get), patch.object(app.mt5, 'order_send') as send:
            client = TestClient(app.app)
            csrf = client.get('/api/control_session').json()['csrf_token']
            for route in ('modify_position','close_position'):
                response = client.post(f'/api/{route}?account=goldm15', json={'ticket':999}, headers={'X-Dashboard-CSRF': csrf})
                self.assertEqual(response.status_code, 404)
            self.assertEqual(lookups, [(53090070,999), (53090070,999)])
            send.assert_not_called()
        fake = self.fake(wrong=True)
        with patch.multiple(app.mt5, initialize=fake.initialize, shutdown=fake.shutdown, account_info=fake.account_info, terminal_info=fake.terminal_info), patch.object(app.mt5, 'order_send') as send:
            client = TestClient(app.app)
            csrf = client.get('/api/control_session').json()['csrf_token']
            response = client.post('/api/close_position?account=goldm15', json={'ticket':999}, headers={'X-Dashboard-CSRF': csrf})
            self.assertEqual(response.status_code, 409)
            send.assert_not_called()

    def test_marketplace_status_keeps_indicators_and_broker_time(self):
        import app
        fake = self.fake()
        dtype=[('time','i8'),('open','f8'),('high','f8'),('low','f8'),('close','f8'),('tick_volume','i8')]
        rates=np.zeros(5000,dtype=dtype)
        rates['time']=1791475200+np.arange(5000)*900
        rates['open']=4000+np.arange(5000)*.1
        rates['close']=rates['open']+.05
        rates['high']=rates['close']+4
        rates['low']=rates['open']-4
        rates['tick_volume']=10
        tick_time=int(rates['time'][-1])+100
        fake.symbol_info=lambda _:SimpleNamespace(spread=5,trade_contract_size=100)
        fake.symbol_info_tick=lambda _:SimpleNamespace(time=tick_time,bid=4500.,ask=4500.05)
        fake.account_info=lambda:SimpleNamespace(login=fake.current['login'],server=fake.current['server'],balance=10000.,equity=10000.)
        fake.copy_rates_from_pos=lambda *args:rates[-args[-1]:]
        fake.positions_get=lambda **kw:[]
        fake.history_deals_get=lambda *args:[]
        fake.ORDER_TYPE_BUY=app.mt5.ORDER_TYPE_BUY
        with patch.object(app,'mt5',fake),patch.object(app,'load_dd_config',return_value={}),patch.object(app.time,'time',return_value=float(tick_time - 10800)):
            with self.gateway.session(fake,'titan'):
                data=app.get_live_market_data()
        for field in ['daily_vp','weekly_vp','sr_levels','positions','indicators','daily_drawdown','rules_matrix','buy_readiness','sell_readiness','analysis_mode']:
            self.assertIn(field,data)
        self.assertEqual(data['analysis_mode'], 'INDICATORS_ONLY')
        self.assertEqual(data['rules_matrix'], [])
        self.assertIsNone(data['buy_readiness'])
        self.assertIsNone(data['sell_readiness'])
        self.assertIn('ema9', data['indicators'])
        self.assertEqual(data['account']['login'],53087839)
        from datetime import datetime,timezone
        self.assertEqual(data['times']['server'],datetime.fromtimestamp(tick_time,timezone.utc).strftime('%H:%M:%S'))


if __name__ == '__main__':
    unittest.main()
