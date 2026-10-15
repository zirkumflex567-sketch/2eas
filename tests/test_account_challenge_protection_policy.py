import account_gateway


def test_only_blueberry_is_marked_as_challenge_protected():
    protected = {
        alias
        for alias, account in account_gateway.ACCOUNTS.items()
        if account.get("challenge_protection") is True
    }

    assert protected == {"blueberry"}
