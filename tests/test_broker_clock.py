"""Broker clock configuration exercises normalized source freshness, no live I/O."""
from types import SimpleNamespace as NS
from datetime import datetime,timezone
from unittest.mock import patch
import pytest
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


def test_rates_time_normalization_uses_only_explicit_account_basis():
    utc=int(datetime(2026,10,16,2,0,tzinfo=timezone.utc).timestamp())
    with patch.dict(gateway.ACCOUNTS['xau5m_m5'],{
            'broker_utc_offset_seconds':10800,'rates_time_basis':'BROKER_SERVER'}):
        assert broker_clock.rates_to_utc_epoch(utc+10800,gateway.ACCOUNTS['xau5m_m5'])==utc
    assert broker_clock.rates_to_utc_epoch(utc,gateway.ACCOUNTS['goldm15'])==utc


def test_invalid_rates_time_basis_is_rejected():
    with patch.dict(gateway.ACCOUNTS['titan'],{'rates_time_basis':'LOCAL_GUESS'}):
        with pytest.raises(ValueError):
            broker_clock.rates_to_utc_epoch(1792127700,gateway.ACCOUNTS['titan'])
