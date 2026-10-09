"""Broker clock configuration exercises normalized source freshness, no live I/O."""
from types import SimpleNamespace as NS
from datetime import datetime,timezone
from unittest.mock import patch
import app
import account_gateway as gateway
import broker_clock

def test_configured_broker_plus_three_quote_is_fresh_without_tolerance_widening():
    now=datetime(2026,10,9,9,tzinfo=timezone.utc).timestamp()
    with patch.dict(gateway.ACCOUNTS['titan'],{'broker_utc_offset_seconds':10800}):
        meta=app.quote_metadata(NS(time=now+10800-2,bid=4000.,ask=4001.),now)
        assert meta['source_fresh'] is True
        assert meta['quote_time_epoch']==now-2
        assert meta['quote_age_seconds']==2

def test_configured_broker_shift_still_rejects_old_and_unexpected_offset():
    now=1791530000
    with patch.dict(gateway.ACCOUNTS['titan'],{'broker_utc_offset_seconds':10800}):
        for stamp in (now+10800-31,now+7200,now+14400):
            assert app.quote_metadata(NS(time=stamp,bid=4000.,ask=4001.),now)['source_fresh'] is False

def test_account_policy_plus_three_is_explicit():
    assert all(a.get('broker_utc_offset_seconds')==10800 for a in gateway.ACCOUNTS.values())
