import account_gateway


def test_only_blueberry_is_marked_as_challenge_protected():
    protected = {
        alias
        for alias, account in account_gateway.ACCOUNTS.items()
        if account.get("challenge_protection") is True
    }

    assert protected == {"blueberry"}


def test_all_configured_gold_chart_feeds_use_the_user_confirmed_m15_view():
    used_accounts = ("blueberry", "titan", "xau5m_m5", "titan_m5", "xau5m_500")

    assert {alias: account_gateway.ACCOUNTS[alias]["timeframe"] for alias in used_accounts} == {
        alias: "M15" for alias in used_accounts
    }


def test_only_four_non_blueberry_demo_rates_use_verified_broker_server_basis():
    expected = {"titan", "xau5m_m5", "titan_m5", "xau5m_500"}
    configured = {
        account["id"]
        for account in account_gateway.ACCOUNTS.values()
        if account.get("rates_time_basis") == "BROKER_SERVER"
    }

    assert configured == expected
    assert account_gateway.ACCOUNTS["blueberry"].get("rates_time_basis", "UTC") == "UTC"
