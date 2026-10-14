"""Broker-isolated fixtures use UTC epochs; production accounts use explicit UTC+3.

Offset-policy tests opt out and exercise the real configured account metadata.
No network or broker calls are made by this fixture.
"""
import pytest

@pytest.fixture(autouse=True)
def isolated_utc_clock_policy(request,monkeypatch):
    if request.node.path.name.startswith(('test_broker_clock', 'test_multi_account')):
        return
    import account_gateway
    for account in account_gateway.ACCOUNTS.values():
        monkeypatch.setitem(account,'broker_utc_offset_seconds',0)
