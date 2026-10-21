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

def test_each_configured_account_has_an_explicit_broker_clock_policy():
    aliases = ('blueberry', 'titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15')
    assert all(gateway.ACCOUNTS[alias].get('broker_clock_policy') == 'NEW_YORK_CLOSE' for alias in aliases)


def test_unknown_broker_clock_policy_fails_closed():
    with patch.dict(gateway.ACCOUNTS['titan'], {'broker_clock_policy':'AUTO_DETECT'}):
        with pytest.raises(ValueError, match='Brokerzeitregel'):
            broker_clock.offset_seconds(gateway.ACCOUNTS['titan'])


@pytest.mark.parametrize('account_id', ['titan', 'xau5m_m5', 'titan_m5', 'xau5m_500', 'goldm15'])
def test_demo_broker_clock_tracks_new_york_close_dst(account_id):
    account = gateway.ACCOUNTS[account_id]
    winter = datetime(2026, 1, 15, 12, tzinfo=timezone.utc).timestamp()
    summer = datetime(2026, 7, 15, 12, tzinfo=timezone.utc).timestamp()
    assert broker_clock.offset_seconds(account, winter) == 7200
    assert broker_clock.offset_seconds(account, summer) == 10800


def test_blueberry_challenge_clock_policy_is_unit_tested_without_terminal_access():
    account = gateway.ACCOUNTS['blueberry']
    winter = datetime(2026, 1, 15, 12, tzinfo=timezone.utc).timestamp()
    summer = datetime(2026, 7, 15, 12, tzinfo=timezone.utc).timestamp()
    assert account['challenge_protection'] is True
    assert broker_clock.offset_seconds(account, winter) == 7200
    assert broker_clock.offset_seconds(account, summer) == 10800


def test_demo_server_timestamp_uses_offset_at_its_own_date():
    account = gateway.ACCOUNTS['xau5m_m5']
    winter_utc = int(datetime(2026, 1, 15, 12, tzinfo=timezone.utc).timestamp())
    summer_utc = int(datetime(2026, 7, 15, 12, tzinfo=timezone.utc).timestamp())
    assert broker_clock.rates_to_utc_epoch(winter_utc + 7200, account) == winter_utc
    assert broker_clock.rates_to_utc_epoch(summer_utc + 10800, account) == summer_utc


def test_demo_broker_clock_follows_us_dst_not_europe_dst():
    account = gateway.ACCOUNTS['goldm15']
    europe_transition = datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc).timestamp()
    us_before_fall = datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc).timestamp()
    us_after_fall = datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc).timestamp()
    assert broker_clock.offset_seconds(account, europe_transition) == 10800
    assert broker_clock.offset_seconds(account, us_before_fall) == 10800
    assert broker_clock.offset_seconds(account, us_after_fall) == 7200


def test_ambiguous_server_wall_timestamp_during_fall_back_fails_closed():
    account = gateway.ACCOUNTS['titan']
    repeated_server_epoch = int(datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc).timestamp()) + 10800
    with pytest.raises(ValueError, match='DST-Übergang'):
        broker_clock.rates_to_utc_epoch(repeated_server_epoch, account)


def test_rates_time_normalization_uses_only_explicit_account_basis():
    utc=int(datetime(2026,10,16,2,0,tzinfo=timezone.utc).timestamp())
    with patch.dict(gateway.ACCOUNTS['xau5m_m5'],{
            'broker_utc_offset_seconds':10800,'rates_time_basis':'BROKER_SERVER'}):
        assert broker_clock.rates_to_utc_epoch(utc+10800,gateway.ACCOUNTS['xau5m_m5'])==utc
    assert broker_clock.rates_to_utc_epoch(utc+10800,gateway.ACCOUNTS['goldm15'])==utc


def test_goldm15_rates_are_explicitly_normalized_from_broker_server_time():
    utc=int(datetime(2026,10,16,2,0,tzinfo=timezone.utc).timestamp())
    account=gateway.ACCOUNTS['goldm15']
    assert account.get('rates_time_basis')=='BROKER_SERVER'
    assert broker_clock.rates_to_utc_epoch(utc+10800,account)==utc


def test_invalid_rates_time_basis_is_rejected():
    with patch.dict(gateway.ACCOUNTS['titan'],{'rates_time_basis':'LOCAL_GUESS'}):
        with pytest.raises(ValueError):
            broker_clock.rates_to_utc_epoch(1792127700,gateway.ACCOUNTS['titan'])
