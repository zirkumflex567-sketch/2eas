import MetaTrader5 as mt5
import account_gateway
import app

test_accounts = ['blueberry', 'titan', 'xau5m_m5', 'titan_m5']

for acc_id in test_accounts:
    print(f"\n==========================================")
    print(f"Testing get_live_market_data for: {acc_id}")
    print(f"==========================================")
    try:
        with account_gateway.session(mt5, acc_id) as spec:
            data = app.get_live_market_data()
            print(f"  SUCCESS for {acc_id}!")
            print(f"  Account Name: {data['account']['name']}")
            print(f"  Symbol: {data['symbol']}, Price: Bid={data.get('bid')}, Ask={data.get('ask')}")
            print(f"  Daily DD: {data['daily_drawdown']['pct']}% (Loss: ${data['daily_drawdown']['loss_usd']:.2f})")
            print(f"  Positions count: {len(data['positions'])}")
            print(f"  Exit goals count: {len(data['exit_goals'])}")
            print(f"  Trend Diagnosis: {data['trend']['diagnosis']}")
    except Exception as e:
        print(f"  FAILED for {acc_id}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
