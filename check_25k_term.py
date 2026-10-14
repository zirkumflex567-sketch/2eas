import MetaTrader5 as mt5

term_path = r"C:\Users\zirku\Downloads\mt5_strategy_research\rev\hermes_ea_work\portable\terminal64.exe"
if mt5.initialize(path=term_path):
    acc = mt5.account_info()
    print("25k Terminal Info:")
    print(f"  Login: {acc.login}")
    print(f"  Name: {acc.name}")
    print(f"  Server: {acc.server}")
    print(f"  Company: {acc.company}")
    print(f"  Balance: {acc.balance}")
    print(f"  Equity: {acc.equity}")
    print(f"  Trade Mode: {acc.trade_mode}")
    print(f"  Leverage: 1:{acc.leverage}")
    
    symbols = mt5.symbols_get()
    gold_syms = [s.name for s in symbols if 'XAU' in s.name or 'GOLD' in s.name.upper()]
    print(f"  Gold symbols found: {gold_syms}")
    
    positions = mt5.positions_get()
    print(f"  Open positions count: {len(positions) if positions else 0}")
    if positions:
        for p in positions:
            print(f"    Ticket {p.ticket}: {p.symbol} {p.type} {p.volume} lots @ {p.price_open}, Profit: ${p.profit:.2f}")

    orders = mt5.orders_get()
    print(f"  Pending orders count: {len(orders) if orders else 0}")
    
    mt5.shutdown()
else:
    print("Failed to initialize:", mt5.last_error())
