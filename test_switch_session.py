import MetaTrader5 as mt5
import account_gateway

test_accounts = ['blueberry', 'titan', 'xau5m_m5', 'titan_m5']

for acc_id in test_accounts:
    print(f"\n--- Testing session for: {acc_id} ---")
    try:
        with account_gateway.session(mt5, acc_id) as spec:
            info = mt5.account_info()
            term = mt5.terminal_info()
            print(f"  SUCCESS: Connected to {spec['name']}")
            print(f"  Login: {info.login}, Server: {info.server}, Balance: ${info.balance:,.2f}")
            print(f"  Terminal Path: {term.path}")
            print(f"  Connected: {term.connected}")
    except Exception as e:
        print(f"  ERROR for {acc_id}: {e}")
