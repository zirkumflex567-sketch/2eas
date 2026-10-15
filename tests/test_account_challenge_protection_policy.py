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
