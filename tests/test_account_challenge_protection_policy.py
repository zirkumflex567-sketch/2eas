import account_gateway


def test_only_blueberry_is_marked_as_challenge_protected():
    protected = {
        alias
        for alias, account in account_gateway.ACCOUNTS.items()
        if account.get("challenge_protection") is True
    }

    assert protected == {"blueberry"}


def test_every_non_blueberry_account_is_explicitly_an_unprotected_demo():
    for alias, account in account_gateway.ACCOUNTS.items():
        if alias == "blueberry":
            continue

        assert account.get("is_demo") is True, alias
        assert account.get("challenge_protection") is False, alias


def test_all_configured_gold_chart_feeds_use_the_user_confirmed_m15_view():
    used_accounts = ("blueberry", "titan", "xau5m_m5", "titan_m5", "xau5m_500")

    assert {alias: account_gateway.ACCOUNTS[alias]["timeframe"] for alias in used_accounts} == {
        alias: "M15" for alias in used_accounts
    }


def test_active_demo_feeds_and_goldm15_use_verified_broker_server_basis():
    active_demo_feeds = {"titan", "xau5m_m5", "titan_m5", "xau5m_500"}
    expected = active_demo_feeds | {"goldm15"}
    configured = {
        account["id"]
        for account in account_gateway.ACCOUNTS.values()
        if account.get("rates_time_basis") == "BROKER_SERVER"
    }

    assert configured == expected
    assert active_demo_feeds <= configured
    assert account_gateway.ACCOUNTS["blueberry"].get("rates_time_basis", "UTC") == "UTC"
