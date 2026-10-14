import MetaTrader5 as mt5

terminals = [
    r"C:\Program Files\PU Prime MT5 Terminal\terminal64.exe",
    r"C:\Users\zirku\Documents\goldm5\.mt5-puprime\terminal64.exe",
    r"C:\Users\zirku\Documents\goldm5\.mt5-puprime-700194619\terminal64.exe",
    r"C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable\terminal64.exe",
    r"C:\Users\zirku\Documents\goldm5\.mt5-demo\terminal64.exe"
]

for t in terminals:
    print("=" * 70)
    print(f"Connecting to: {t}")
    init_res = mt5.initialize(path=t)
    if not init_res:
        print(f"  Failed to initialize: {mt5.last_error()}")
        continue
    
    term_info = mt5.terminal_info()
    acc_info = mt5.account_info()
    
    if term_info:
        print(f"  Terminal Name: {term_info.name}")
        print(f"  Path: {term_info.path}")
        print(f"  Data Path: {term_info.data_path}")
        print(f"  Connected: {term_info.connected}")
    
    if acc_info:
        print(f"  Login: {acc_info.login}")
        print(f"  Trade Mode: {acc_info.trade_mode} (0=Demo, 1=Contest, 2=Real)")
        print(f"  Name: {acc_info.name}")
        print(f"  Server: {acc_info.server}")
        print(f"  Company: {acc_info.company}")
        print(f"  Currency: {acc_info.currency}")
        print(f"  Leverage: 1:{acc_info.leverage}")
        print(f"  Balance: ${acc_info.balance:,.2f}")
        print(f"  Equity: ${acc_info.equity:,.2f}")
        print(f"  Margin: ${acc_info.margin:,.2f}")
        print(f"  Free Margin: ${acc_info.margin_free:,.2f}")
    else:
        print("  No account info returned.")
        
    mt5.shutdown()
