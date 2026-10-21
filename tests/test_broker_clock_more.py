from datetime import datetime,timezone
from unittest.mock import patch
import app
import account_gateway as gateway


from test_backend_audit import isolated
import journal_accounting


def test_configured_broker_status_and_journal_share_utc_and_berlin(isolated):
    account=gateway.ACCOUNTS['titan']
    with patch.dict(account,{'broker_utc_offset_seconds':10800}):
        isolated.tick.time=int(isolated.clock.now+10800)
        isolated.sym.time=isolated.tick.time
        isolated.rates['time'] += 10800
        isolated.pos.time=int(isolated.clock.now+10800)
        data=isolated.client.get('/api/status?light=true&account=titan').json()
        assert data['source_fresh'] is True
        assert data['quote_time_epoch']==isolated.clock.now
        assert data['times']['server']=='15:00:00'
        assert data['times']['german']=='14:00:00'
        row=isolated.client.get('/api/journal_summary?account=titan').json()['journal'][0]
        assert row['time_server']=='15:00:00'
        assert row['time_de']=='14:00:00'
        assert row['time_utc'].endswith('12:00:00+00:00')
        start,end=isolated.history.call_args.args
        assert start.timestamp()==journal_accounting.CUTOFF.timestamp()+10800
        assert end.timestamp()==isolated.clock.now+10800


def test_manual_baseline_expires_at_configured_broker_midnight(isolated):
    with patch.dict(gateway.ACCOUNTS['titan'],{'broker_utc_offset_seconds':10800}):
        isolated.clock.now=datetime(2026,10,9,21,0,10,tzinfo=timezone.utc).timestamp()
        isolated.tick.time=int(isolated.clock.now+10800)
        app.save_dd_config(dict(manual_reset_active=True,reset_balance=11000.,reset_timestamp=int(isolated.clock.now-60),reset_date='2026-10-09'))
        reply=isolated.client.get('/api/status?light=true&account=titan')
        assert reply.status_code==200
        dd=reply.json()['daily_drawdown']
        assert dd['manual_active'] is False and dd['manual_expired'] is True
        assert dd['risk_day']=='2026-10-10'


def test_broker_midnight_risk_day_is_mapped_to_wall_utc():
    now=datetime(2026,10,9,21,0,10,tzinfo=timezone.utc).timestamp()
    with patch.dict(gateway.ACCOUNTS['titan'],{'broker_utc_offset_seconds':10800}):
        context,midnight=app.risk_day_context(now,0,{})
        assert context['risk_day']=='2026-10-10'
        assert midnight.timestamp()==datetime(2026,10,9,21,tzinfo=timezone.utc).timestamp()
        assert context['risk_timezone']=='Broker UTC+03:00 (New-York-Close/DST-Regel)'
